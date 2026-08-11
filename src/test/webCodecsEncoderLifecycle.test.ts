import { describe, expect, it, vi } from 'vitest';
import {
  closeWebCodecsEncoderSafely,
  flushWebCodecsEncoderWithAbort,
  releaseOwnedWebCodecsEncoders,
  runVideoThenAudioEncoderPhases,
} from '../utils/webCodecsEncoderLifecycle';

describe('flushWebCodecsEncoderWithAbort', () => {
  it('encoder の flush が完了するまで直列処理の境界を解放しない', async () => {
    let resolveFlush = () => {};
    const flush = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFlush = resolve;
        })
    );
    const signal = new AbortController().signal;

    let completed = false;
    const draining = flushWebCodecsEncoderWithAbort({ flush }, signal).then(() => {
      completed = true;
    });
    await Promise.resolve();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(completed).toBe(false);

    resolveFlush();
    await draining;
    expect(completed).toBe(true);
  });

  it('キャンセル時は未完了の flush を待ち続けず AbortError にする', async () => {
    const controller = new AbortController();
    const flush = vi.fn(() => new Promise<void>(() => {}));

    const draining = flushWebCodecsEncoderWithAbort({ flush }, controller.signal);
    controller.abort();

    await expect(draining).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('キャンセル以外の flush エラーは呼び出し元へ伝える', async () => {
    const failure = new Error('audio codec failure');
    const flush = vi.fn().mockRejectedValue(failure);

    await expect(
      flushWebCodecsEncoderWithAbort({ flush }, new AbortController().signal)
    ).rejects.toBe(failure);
  });
});

describe('runVideoThenAudioEncoderPhases', () => {
  it('video flush → audio feed → audio flush の順序を保証する', async () => {
    const order: string[] = [];
    let resolveVideoFlush = () => {};
    let resolveAudioFlush = () => {};
    const videoEncoder = {
      flush: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveVideoFlush = () => {
              order.push('video-flushed');
              resolve();
            };
          })
      ),
    };
    const audioEncoder = {
      flush: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            order.push('audio-flush-started');
            resolveAudioFlush = () => {
              order.push('audio-flushed');
              resolve();
            };
          })
      ),
    };
    const encodeAudio = vi.fn(() => {
      order.push('audio-fed');
      return { encodedChunks: 989 };
    });

    let completed = false;
    const phases = runVideoThenAudioEncoderPhases(
      videoEncoder,
      audioEncoder,
      new AbortController().signal,
      encodeAudio
    ).then((result) => {
      completed = true;
      return result;
    });
    await Promise.resolve();

    expect(videoEncoder.flush).toHaveBeenCalledTimes(1);
    expect(encodeAudio).not.toHaveBeenCalled();

    resolveVideoFlush();
    await vi.waitFor(() => expect(audioEncoder.flush).toHaveBeenCalledTimes(1));
    expect(order).toEqual(['video-flushed', 'audio-fed', 'audio-flush-started']);
    expect(completed).toBe(false);

    resolveAudioFlush();
    await expect(phases).resolves.toEqual({ encodedChunks: 989 });
    expect(order).toEqual(['video-flushed', 'audio-fed', 'audio-flush-started', 'audio-flushed']);
  });
});

describe('closeWebCodecsEncoderSafely', () => {
  it('configured encoder を明示的に close する', () => {
    const close = vi.fn();

    const result = closeWebCodecsEncoderSafely({ state: 'configured', close });

    expect(result).toEqual({ status: 'closed' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('close 済み encoder は再度 close しない', () => {
    const close = vi.fn();

    const result = closeWebCodecsEncoderSafely({ state: 'closed', close });

    expect(result).toEqual({ status: 'already-closed' });
    expect(close).not.toHaveBeenCalled();
  });

  it('encoder が未作成でも cleanup を成功扱いで継続できる', () => {
    expect(closeWebCodecsEncoderSafely(null)).toEqual({ status: 'missing' });
  });

  it('close の例外を呼び出し元へ投げず診断結果へ残す', () => {
    const result = closeWebCodecsEncoderSafely({
      state: 'configured',
      close: () => {
        throw new Error('codec release failed');
      },
    });

    expect(result).toEqual({ status: 'failed', error: 'codec release failed' });
  });
});

describe('releaseOwnedWebCodecsEncoders', () => {
  it('所有セッションが一致すれば video/audio をまとめて解放する', () => {
    const closeVideo = vi.fn();
    const closeAudio = vi.fn();

    const result = releaseOwnedWebCodecsEncoders(
      {
        exportSessionId: 'export-1',
        videoEncoder: { state: 'configured', close: closeVideo },
        audioEncoder: { state: 'configured', close: closeAudio },
      },
      'export-1'
    );

    expect(result).toEqual({
      status: 'released',
      active: null,
      exportSessionId: 'export-1',
      videoResult: { status: 'closed' },
      audioResult: { status: 'closed' },
    });
    expect(closeVideo).toHaveBeenCalledTimes(1);
    expect(closeAudio).toHaveBeenCalledTimes(1);
  });

  it('古いセッションの finally では新しいセッションを解放しない', () => {
    const closeVideo = vi.fn();
    const active = {
      exportSessionId: 'export-2',
      videoEncoder: { state: 'configured' as const, close: closeVideo },
      audioEncoder: null,
    };

    const result = releaseOwnedWebCodecsEncoders(active, 'export-1');

    expect(result).toEqual({ status: 'owner-mismatch', active });
    expect(closeVideo).not.toHaveBeenCalled();
  });

  it('active encoder が無ければ何もしない', () => {
    expect(releaseOwnedWebCodecsEncoders(null, 'export-1')).toEqual({
      status: 'no-active',
      active: null,
    });
  });
});
