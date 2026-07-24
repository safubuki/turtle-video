/**
 * エクスポート終了時の Canvas キャプチャストリーム解放のテスト。
 *
 * エクスポートは共有プレビュー Canvas から `canvas.captureStream()` でフレームを吸い出す。
 * 成功パスでしかトラックを停止していないと、中断・失敗・例外・unmount ではキャプチャトラックが
 * Canvas に紐づいたまま残留し、以降の通常プレビューでカクつき・黒フレーム・静止画化を招く
 * （Issue #209）。`stopCanvasCaptureStream` はどの終了経路からでも呼べる null 安全・冪等な
 * ヘルパーであり、全トラックを確実に stop することを検証する。
 */
import { describe, expect, it, vi } from 'vitest';
import { stopCanvasCaptureStream } from '../utils/exportTimeline';

function createFakeTrack() {
  return {
    stop: vi.fn(),
  } as unknown as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
}

function createFakeStream(tracks: Array<{ stop: ReturnType<typeof vi.fn> }>) {
  return {
    getTracks: () => tracks,
  } as unknown as MediaStream;
}

describe('stopCanvasCaptureStream', () => {
  it('ストリームの全トラックを stop する', () => {
    const videoTrack = createFakeTrack();
    const audioTrack = createFakeTrack();
    const stream = createFakeStream([videoTrack, audioTrack]);

    stopCanvasCaptureStream(stream);

    expect(videoTrack.stop).toHaveBeenCalledTimes(1);
    expect(audioTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('null / undefined を渡しても例外を投げない（終了経路からの冪等呼び出し）', () => {
    expect(() => stopCanvasCaptureStream(null)).not.toThrow();
    expect(() => stopCanvasCaptureStream(undefined)).not.toThrow();
  });

  it('一部トラックの stop が例外を投げても、残りのトラックは停止される', () => {
    const throwingTrack = {
      stop: vi.fn(() => {
        throw new Error('track already stopped');
      }),
    };
    const okTrack = createFakeTrack();
    const stream = createFakeStream([throwingTrack, okTrack]);

    expect(() => stopCanvasCaptureStream(stream)).not.toThrow();
    expect(throwingTrack.stop).toHaveBeenCalledTimes(1);
    expect(okTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('トラックが無い空ストリームでも安全に処理できる', () => {
    const stream = createFakeStream([]);
    expect(() => stopCanvasCaptureStream(stream)).not.toThrow();
  });
});
