import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../types';
import {
  normalizeSourceFrameRate,
  resolveCompositeExportFrameRate,
} from '../utils/exportFrameRate';
import { getExportFrameTiming, resolveExportDuration } from '../utils/exportTimeline';

function video(sourceFrameRate?: number, playbackSpeed: 1 | 2 | 4 | 8 = 1): MediaItem {
  return {
    type: 'video',
    sourceFrameRate,
    playbackSpeed,
  } as MediaItem;
}

describe('exportFrameRate', () => {
  it('23.976 / 29.97 を整数へ丸めず標準レートへ正規化する', () => {
    expect(normalizeSourceFrameRate(23.976)).toBeCloseTo(24_000 / 1_001, 6);
    expect(normalizeSourceFrameRate(29.97)).toBeCloseTo(30_000 / 1_001, 6);
  });

  it('24fps 動画だけなら 24fps を選ぶ', () => {
    expect(resolveCompositeExportFrameRate([video(24)])).toBe(24);
  });

  it('複数動画では最大 FPS を選び、30fps を上限にする', () => {
    expect(resolveCompositeExportFrameRate([video(24), video(25)])).toBe(25);
    expect(resolveCompositeExportFrameRate([video(24), video(30)])).toBe(30);
    expect(resolveCompositeExportFrameRate([video(60)])).toBe(30);
  });

  it('倍速動画はタイムライン上の実効 FPS で選ぶ', () => {
    expect(resolveCompositeExportFrameRate([video(15, 2)])).toBe(30);
  });

  it('検出不能または静止画のみなら従来の 30fps を維持する', () => {
    expect(resolveCompositeExportFrameRate([video(undefined)])).toBe(30);
    expect(resolveCompositeExportFrameRate([{ type: 'image' } as MediaItem])).toBe(30);
  });

  it('24fpsへ合わせても生の動画尺を変えず、30fpsより投入フレームを減らす', () => {
    const at24 = resolveExportDuration(19.51, 24);
    const at30 = resolveExportDuration(19.51, 30);
    const lastFrame = getExportFrameTiming(at24, 24, at24.frameCount - 1);

    expect(at24.exportDurationUs).toBe(19_510_000);
    expect(lastFrame.timestampUs + lastFrame.durationUs).toBe(at24.exportDurationUs);
    expect(at24.frameCount).toBeLessThan(at30.frameCount);
  });
});
