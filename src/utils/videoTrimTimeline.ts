/**
 * @file videoTrimTimeline.ts
 * @description プレビューのタイムライン時刻を動画ソース内のトリム時刻へ変換する。
 */
import type { MediaItem } from '../types';

const RANGE_EPSILON_SEC = 0.001;

export interface VideoTrimAtPreviewPosition {
  sourceTime: number;
  localTime: number;
}

export function resolveVideoTrimAtPreviewPosition(
  item: MediaItem,
  timelineRange: { start: number; end: number },
  previewTime: number,
): VideoTrimAtPreviewPosition | null {
  if (item.type !== 'video' || !Number.isFinite(previewTime)) return null;
  if (
    previewTime < timelineRange.start - RANGE_EPSILON_SEC
    || previewTime > timelineRange.end + RANGE_EPSILON_SEC
  ) {
    return null;
  }

  const playableDuration = Math.max(0, item.trimEnd - item.trimStart);
  const localTime = Math.max(0, Math.min(playableDuration, previewTime - timelineRange.start));
  return {
    localTime,
    sourceTime: Math.max(
      item.trimStart,
      Math.min(item.trimEnd, item.trimStart + localTime),
    ),
  };
}

export function canSetVideoTrimAtPreviewPosition(
  item: MediaItem,
  timelineRange: { start: number; end: number },
  previewTime: number,
  type: 'start' | 'end',
): boolean {
  const resolved = resolveVideoTrimAtPreviewPosition(item, timelineRange, previewTime);
  if (!resolved) return false;
  return type === 'start'
    ? resolved.sourceTime <= item.trimEnd - 0.1
    : resolved.sourceTime >= item.trimStart + 0.1;
}
