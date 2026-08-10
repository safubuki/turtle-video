import { describe, expect, it, vi } from 'vitest';
import {
  closeWebCodecsEncoderSafely,
  releaseOwnedWebCodecsEncoders,
} from '../utils/webCodecsEncoderLifecycle';

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
