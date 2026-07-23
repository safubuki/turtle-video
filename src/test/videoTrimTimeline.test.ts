import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../types';
import {
  canSetVideoTrimAtPreviewPosition,
  resolveVideoTrimAtPreviewPosition,
} from '../utils/videoTrimTimeline';

const item = {
  id: 'video-1',
  type: 'video',
  trimStart: 2,
  trimEnd: 10,
  duration: 8,
  originalDuration: 12,
} as MediaItem;

describe('videoTrimTimeline', () => {
  it('カードのタイムライン位置を動画ソース時刻へ変換する', () => {
    expect(resolveVideoTrimAtPreviewPosition(item, { start: 5, end: 13 }, 8)).toEqual({
      localTime: 3,
      sourceTime: 5,
    });
  });

  it('対象カードの表示範囲外は受け付けない', () => {
    expect(resolveVideoTrimAtPreviewPosition(item, { start: 5, end: 13 }, 4.9)).toBeNull();
    expect(resolveVideoTrimAtPreviewPosition(item, { start: 5, end: 13 }, 13.1)).toBeNull();
  });

  it('最小クリップ長を残せない開始・終了位置は無効にする', () => {
    expect(canSetVideoTrimAtPreviewPosition(item, { start: 5, end: 13 }, 13, 'start')).toBe(false);
    expect(canSetVideoTrimAtPreviewPosition(item, { start: 5, end: 13 }, 5, 'end')).toBe(false);
    expect(canSetVideoTrimAtPreviewPosition(item, { start: 5, end: 13 }, 8, 'start')).toBe(true);
    expect(canSetVideoTrimAtPreviewPosition(item, { start: 5, end: 13 }, 8, 'end')).toBe(true);
  });
});
