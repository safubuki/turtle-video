import { describe, expect, it } from 'vitest';
import { alignExportDurationToFrameGrid, getExportFrameTiming } from '../utils/exportTimeline';

describe('alignExportDurationToFrameGrid', () => {
  it('フレーム境界ちょうどの尺はそのまま維持する', () => {
    expect(alignExportDurationToFrameGrid(2, 30)).toEqual({
      rawDurationSec: 2,
      rawDurationUs: 2_000_000,
      frameCount: 60,
      alignedDurationSec: 2,
      alignedDurationUs: 2_000_000,
    });
  });

  it('フレーム境界に乗らない尺は切り上げて動画と音声の終端を一致させる', () => {
    const aligned = alignExportDurationToFrameGrid(10.01, 30);

    expect(aligned.rawDurationSec).toBe(10.01);
    expect(aligned.rawDurationUs).toBe(10_010_000);
    expect(aligned.frameCount).toBe(301);
    expect(aligned.alignedDurationSec).toBeCloseTo(301 / 30, 10);
    expect(aligned.alignedDurationUs).toBe(Math.round((301 / 30) * 1e6));
  });

  it('浮動小数の誤差で余計な1フレームを増やさない', () => {
    const aligned = alignExportDurationToFrameGrid(60 / 30 + 1e-12, 30);

    expect(aligned.frameCount).toBe(60);
    expect(aligned.alignedDurationSec).toBe(2);
  });

  it('不正な入力はゼロ尺として扱う', () => {
    expect(alignExportDurationToFrameGrid(-1, 30).frameCount).toBe(0);
    expect(alignExportDurationToFrameGrid(10, 0).alignedDurationSec).toBe(0);
  });

  it('全フレームを均一durationにしてaligned尺へ揃える（Teams CFR互換）', () => {
    const aligned = alignExportDurationToFrameGrid(10.01, 30);
    const lastFrameIndex = aligned.frameCount - 1;
    const nominalDurationUs = Math.round(1e6 / 30);
    const penultimate = getExportFrameTiming(aligned, 30, lastFrameIndex - 1);
    const last = getExportFrameTiming(aligned, 30, lastFrameIndex);

    expect(penultimate.timestampUs + penultimate.durationUs).toBe(last.timestampUs);
    expect(last.timestampUs + last.durationUs).toBe(aligned.alignedDurationUs);
    expect(last.durationUs).toBe(nominalDurationUs);
  });

  it('最終フレームのdurationがtimescale=30でも0に丸められない', () => {
    // timescale=30のとき duration < 16667μs(=0.5/30 sec) だと Math.round(dur*30/1e6)=0 になる。
    // alignedDurationUs を使えば最終フレームは nominal 幅となり、丸めで消えない。
    const aligned = alignExportDurationToFrameGrid(10.01, 30);
    const last = getExportFrameTiming(aligned, 30, aligned.frameCount - 1);

    const timescale = 30;
    const lastDurationInTimescale = Math.round((last.durationUs / 1e6) * timescale);
    expect(lastDurationInTimescale).toBeGreaterThan(0);
    expect(lastDurationInTimescale).toBe(1); // 1/30秒 = 1 timescale unit
  });
});
