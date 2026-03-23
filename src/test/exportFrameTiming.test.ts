import { describe, expect, it } from 'vitest';
import { getDeterministicExportFrameTimeSec } from '../utils/exportFrameTiming';

describe('getDeterministicExportFrameTimeSec', () => {
  it('非 iOS export はフレーム数ベースで等間隔に進める', () => {
    expect(
      getDeterministicExportFrameTimeSec({
        baseTimeSec: 0,
        renderedFrameCount: 0,
        fps: 30,
      }),
    ).toBe(0);

    expect(
      getDeterministicExportFrameTimeSec({
        baseTimeSec: 0,
        renderedFrameCount: 1,
        fps: 30,
      }),
    ).toBeCloseTo(1 / 30);

    expect(
      getDeterministicExportFrameTimeSec({
        baseTimeSec: 0,
        renderedFrameCount: 15,
        fps: 30,
      }),
    ).toBeCloseTo(0.5);
  });

  it('開始位置が 0 秒以外でもその位置を起点に進める', () => {
    expect(
      getDeterministicExportFrameTimeSec({
        baseTimeSec: 1.25,
        renderedFrameCount: 3,
        fps: 30,
      }),
    ).toBeCloseTo(1.35);
  });

  it('不正な入力でも安全な値へ正規化する', () => {
    expect(
      getDeterministicExportFrameTimeSec({
        baseTimeSec: -5,
        renderedFrameCount: -2,
        fps: 0,
      }),
    ).toBe(0);
  });
});
