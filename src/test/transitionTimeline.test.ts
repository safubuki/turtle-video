/**
 * transitionTimeline（ディゾルブのオーバーラップ考慮タイムライン）のテスト
 */

import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../types';
import {
  calculateTotalDurationWithTransitions,
  computeTransitionTimelineRanges,
  findActiveTimelineItemWithTransitions,
  getClipOverlapToNext,
  getTimelineAdvanceForItem,
} from '../utils/transitionTimeline';

const makeItem = (overrides: Partial<MediaItem>): MediaItem => ({
  id: overrides.id ?? 'item',
  file: new File([''], 'x.mp4', { type: 'video/mp4' }),
  type: 'video',
  url: 'blob:x',
  volume: 1,
  isMuted: false,
  fadeIn: false,
  fadeOut: false,
  fadeInDuration: 1,
  fadeOutDuration: 1,
  duration: 10,
  originalDuration: 10,
  trimStart: 0,
  trimEnd: 10,
  scale: 1,
  positionX: 0,
  positionY: 0,
  isTransformOpen: false,
  isLocked: false,
  ...overrides,
});

describe('getClipOverlapToNext', () => {
  it('returns the dissolve duration clamped by both clip lengths', () => {
    const a = makeItem({ id: 'a', duration: 10, transitionToNext: { type: 'dissolve', duration: 1 } });
    const b = makeItem({ id: 'b', duration: 10 });
    expect(getClipOverlapToNext(a, b)).toBe(1);

    // 短いクリップは食い潰さない（0.15 秒は残す）
    const shortNext = makeItem({ id: 'c', duration: 0.5 });
    expect(getClipOverlapToNext(a, shortNext)).toBeCloseTo(0.35);
  });

  it('returns 0 for fades and missing transitions (timeline-neutral)', () => {
    const fade = makeItem({ id: 'a', transitionToNext: { type: 'fade-black', duration: 1 } });
    expect(getClipOverlapToNext(fade, makeItem({ id: 'b' }))).toBe(0);
    expect(getClipOverlapToNext(makeItem({ id: 'a' }), makeItem({ id: 'b' }))).toBe(0);
    expect(getClipOverlapToNext(fade, undefined)).toBe(0);
  });
});

describe('computeTransitionTimelineRanges / total duration', () => {
  const items = [
    makeItem({ id: 'a', duration: 10, transitionToNext: { type: 'dissolve', duration: 2 } }),
    makeItem({ id: 'b', duration: 10, transitionToNext: { type: 'fade-black', duration: 1 } }),
    makeItem({ id: 'c', duration: 10 }),
  ];

  it('starts the next clip earlier by the overlap amount', () => {
    const ranges = computeTransitionTimelineRanges(items);
    expect(ranges[0]).toMatchObject({ id: 'a', start: 0, end: 10 });
    // b はディゾルブで 2 秒早く始まる
    expect(ranges[1]).toMatchObject({ id: 'b', start: 8, end: 18 });
    // フェードはオーバーラップしない
    expect(ranges[2]).toMatchObject({ id: 'c', start: 18, end: 28 });
  });

  it('shortens the total duration by the sum of overlaps', () => {
    expect(calculateTotalDurationWithTransitions(items)).toBe(28); // 30 - 2
  });

  it('matches plain summation when no transitions exist (regression guard)', () => {
    const plain = [makeItem({ id: 'a', duration: 3 }), makeItem({ id: 'b', duration: 4.5 })];
    const ranges = computeTransitionTimelineRanges(plain);
    expect(ranges[1]).toMatchObject({ start: 3, end: 7.5 });
    expect(calculateTotalDurationWithTransitions(plain)).toBe(7.5);
    expect(getTimelineAdvanceForItem(plain, 0)).toBe(3);
  });
});

describe('findActiveTimelineItemWithTransitions', () => {
  const items = [
    makeItem({ id: 'a', duration: 10, transitionToNext: { type: 'dissolve', duration: 2 } }),
    makeItem({ id: 'b', duration: 10 }),
  ];
  const total = calculateTotalDurationWithTransitions(items); // 18

  it('prefers the later clip inside the overlap window', () => {
    expect(findActiveTimelineItemWithTransitions(items, 7, total)?.id).toBe('a');
    // オーバーラップ窓 [8, 10) では次クリップ b がアクティブ
    const inOverlap = findActiveTimelineItemWithTransitions(items, 9, total);
    expect(inOverlap?.id).toBe('b');
    expect(inOverlap?.localTime).toBeCloseTo(1);
    expect(findActiveTimelineItemWithTransitions(items, 12, total)?.id).toBe('b');
  });

  it('falls back to the last clip at/after the total duration', () => {
    expect(findActiveTimelineItemWithTransitions(items, 18, total)?.id).toBe('b');
  });
});
