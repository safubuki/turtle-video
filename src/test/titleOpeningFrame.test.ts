import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../types';
import {
  resolveTitleMiniPreviewCaptureTarget,
  resolveTitleMiniPreviewFrameTimes,
  selectTitleOpeningFrameTime,
} from '../utils/titleOpeningFrame';

function imageItem(id: string, duration: number): MediaItem {
  return {
    id,
    file: new File(['image'], `${id}.png`, { type: 'image/png' }),
    type: 'image',
    url: `blob:${id}`,
    volume: 1,
    isMuted: false,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 1,
    fadeOutDuration: 1,
    duration,
    originalDuration: duration,
    trimStart: 0,
    trimEnd: duration,
    scale: 1,
    positionX: 0,
    positionY: 0,
    rotation: 0,
    blur: 0,
    isTransformOpen: false,
    isLocked: false,
  };
}

describe('タイトルミニビューの先頭フレーム', () => {
  it('尺が無いときは候補を作らない', () => {
    expect(resolveTitleMiniPreviewFrameTimes(0)).toEqual([]);
    expect(selectTitleOpeningFrameTime([], () => false)).toBeNull();
  });

  it('長い動画では先頭の黒クリア帯の外から試し、少しずつ後ろへ進む', () => {
    const times = resolveTitleMiniPreviewFrameTimes(10);
    expect(times[0]).toBeCloseTo(0.06, 2);
    expect(times.length).toBeGreaterThan(1);
    expect(times.every((time, index) => index === 0 || time > times[index - 1])).toBe(true);
    expect(times.every((time) => time > 0.05 && time < 10)).toBe(true);
  });

  it('最初に映像がある候補を選び、全部黒なら先頭候補に戻る', () => {
    const times = [0.06, 0.16, 0.26];
    expect(selectTitleOpeningFrameTime(times, (time) => time < 0.2)).toBe(0.26);
    expect(selectTitleOpeningFrameTime(times, () => true)).toBe(0.06);
  });

  it('候補時刻のクリップと元メディア時刻を解決する', () => {
    const items = [imageItem('a', 4), imageItem('b', 6)];
    expect(resolveTitleMiniPreviewCaptureTarget(items, 10, 0.06)?.clipId).toBe('a');
    expect(resolveTitleMiniPreviewCaptureTarget(items, 10, 5)?.clipId).toBe('b');
    expect(resolveTitleMiniPreviewCaptureTarget([], 10, 0.06)).toBeNull();
  });
});
