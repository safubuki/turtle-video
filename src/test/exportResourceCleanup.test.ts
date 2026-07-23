import { describe, expect, it, vi } from 'vitest';
import {
  cancelExportReader,
  closeExportCodec,
  flushExportCodecWithTimeout,
  stopExportMediaStream,
} from '../utils/exportResourceCleanup';

describe('export resource cleanup', () => {
  it('configured codec を明示的に close する', () => {
    const close = vi.fn();
    expect(closeExportCodec({ state: 'configured', close })).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it('closed codec は二重 close しない', () => {
    const close = vi.fn();
    expect(closeExportCodec({ state: 'closed', close })).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  it('reader の cancel 失敗を未処理 rejection にしない', async () => {
    const cancel = vi.fn().mockRejectedValue(new Error('already cancelled'));
    expect(cancelExportReader({ cancel })).toBe(true);
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('MediaStream の全 track を停止する', () => {
    const first = { stop: vi.fn() };
    const second = { stop: vi.fn() };
    const stream = {
      getTracks: () => [first, second],
    } as unknown as MediaStream;

    expect(stopExportMediaStream(stream)).toBe(2);
    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.stop).toHaveBeenCalledOnce();
  });

  it('codec flush が完了すればタイムアウトしない', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    await expect(flushExportCodecWithTimeout({ flush }, 'VideoEncoder', 50))
      .resolves.toBeUndefined();
    expect(flush).toHaveBeenCalledOnce();
  });

  it('codec flush が返らない場合はタイムアウトする', async () => {
    vi.useFakeTimers();
    try {
      const pending = flushExportCodecWithTimeout(
        { flush: () => new Promise<void>(() => undefined) },
        'VideoEncoder',
        50,
      );
      const rejection = expect(pending).rejects.toThrow('VideoEncoder の終了処理がタイムアウトしました');
      await vi.advanceTimersByTimeAsync(50);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
