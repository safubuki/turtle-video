/**
 * 並べて比較（同時再生）の純ロジックとタイムラインのテスト
 */

import { describe, expect, it, vi } from 'vitest';
import type { MediaItem, SplitCompareSettings } from '../types';
import {
  clipToSplitCompareRegion,
  createDefaultSplitCompareSettings,
  describeSplitCompareSettings,
  drawSplitCompareDivider,
  getSplitComparePairForIndex,
  normalizeSplitCompareSettings,
  resolveSplitCompareGeometry,
  resolveSplitComparePeerFadeAlpha,
  resolveSplitCompareDisplayLayout,
  resolveSplitCompareRoles,
  SPLIT_COMPARE_DEFAULT_SETTINGS,
  SPLIT_COMPARE_LAYOUT_OPTIONS,
} from '../utils/splitCompare';
import {
  calculateTotalDurationWithTransitions,
  computeTransitionTimelineRanges,
  findActiveTimelineItemWithTransitions,
  findTimelineItemInRangeWithTransitions,
  getTimelineAdvanceForItem,
  getTimelineOverlapToNext,
} from '../utils/transitionTimeline';
import { toManualProjectSummary, type ProjectData } from '../utils/indexedDB';

const compare = (overrides: Partial<SplitCompareSettings> = {}): SplitCompareSettings => ({
  ...SPLIT_COMPARE_DEFAULT_SETTINGS,
  ...overrides,
});

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

describe('normalizeSplitCompareSettings', () => {
  it('未設定は null、未知の値は既定へ寄せる', () => {
    expect(normalizeSplitCompareSettings(null)).toBeNull();
    expect(normalizeSplitCompareSettings(undefined)).toBeNull();
    expect(normalizeSplitCompareSettings('x')).toBeNull();
    expect(normalizeSplitCompareSettings({})).toEqual(SPLIT_COMPARE_DEFAULT_SETTINGS);
    expect(normalizeSplitCompareSettings({
      layout: 'vertical', divider: 'diagonal', fit: 'contain', lineColor: 'none',
    })).toEqual({ layout: 'vertical', divider: 'diagonal', fit: 'contain', lineColor: 'none' });
    expect(normalizeSplitCompareSettings({ layout: 'grid', divider: 1 })).toMatchObject({
      layout: 'auto', divider: 'straight',
    });
  });

  it('ON にしたときの初期の並べ方は、横動画なら左右・縦動画なら上下（「自動」は選択肢に無い）', () => {
    expect(createDefaultSplitCompareSettings('landscape').layout).toBe('horizontal');
    expect(createDefaultSplitCompareSettings('portrait').layout).toBe('vertical');
    expect(SPLIT_COMPARE_LAYOUT_OPTIONS.map((o) => o.label)).toEqual(['左右', '上下']);
    // 旧データの auto は向きで読み替えて表示する
    expect(resolveSplitCompareDisplayLayout('auto', 'portrait')).toBe('vertical');
    expect(describeSplitCompareSettings(compare({ layout: 'auto' }), 'landscape')).toBe('左右・まっすぐ');
  });

  it('説明文は並べ方・境界線', () => {
    expect(describeSplitCompareSettings(compare({ layout: 'horizontal', divider: 'diagonal' })))
      .toBe('左右・ななめ');
  });
});

describe('resolveSplitCompareRoles', () => {
  it('設定のあるカードと直後のカードを 1 組にし、3 枚以上は連鎖させない', () => {
    const items = [
      makeItem({ id: 'a', splitCompareToNext: compare() }),
      makeItem({ id: 'b', splitCompareToNext: compare() }), // partner なので無視
      makeItem({ id: 'c' }),
      makeItem({ id: 'd', splitCompareToNext: compare() }), // 最後のカードは無視
    ];
    expect(resolveSplitCompareRoles(items)).toEqual(['head', 'partner', null, null]);
    expect(getSplitComparePairForIndex(items, 1)).toMatchObject({ headIndex: 0, partnerIndex: 1 });
    expect(getSplitComparePairForIndex(items, 2)).toBeNull();
  });
});

describe('並べて比較のタイムライン', () => {
  it('2 枚は同時に始まり、長いほうの終わりで次へ進む', () => {
    const items = [
      makeItem({ id: 'a', duration: 6, splitCompareToNext: compare() }),
      makeItem({ id: 'b', duration: 4 }),
      makeItem({ id: 'c', duration: 5 }),
    ];
    const ranges = computeTransitionTimelineRanges(items);
    expect(ranges[0]).toMatchObject({ start: 0, end: 6 });
    expect(ranges[1]).toMatchObject({ start: 0, end: 4 });
    expect(ranges[2]).toMatchObject({ start: 6, end: 11 });
    expect(calculateTotalDurationWithTransitions(items)).toBe(11);

    // 前進量は区間の開始と一致する（visibility 復帰・再生開始の積算と同じ規約）
    expect(getTimelineAdvanceForItem(items, 0)).toBe(0);
    expect(getTimelineAdvanceForItem(items, 1)).toBe(6);
    expect(getTimelineAdvanceForItem(items, 2)).toBe(5);
  });

  it('ペアが最後で head のほうが長いときも総尺は head の終わり', () => {
    const items = [
      makeItem({ id: 'x', duration: 2 }),
      makeItem({ id: 'a', duration: 8, splitCompareToNext: compare() }),
      makeItem({ id: 'b', duration: 3 }),
    ];
    expect(calculateTotalDurationWithTransitions(items)).toBe(10);
  });

  it('active は後勝ち: partner の区間中は partner、partner が終わった後は head', () => {
    const items = [
      makeItem({ id: 'a', duration: 6, splitCompareToNext: compare() }),
      makeItem({ id: 'b', duration: 4 }),
      makeItem({ id: 'c', duration: 5 }),
    ];
    const total = calculateTotalDurationWithTransitions(items);
    expect(findActiveTimelineItemWithTransitions(items, 1, total)?.id).toBe('b');
    expect(findActiveTimelineItemWithTransitions(items, 5, total)).toMatchObject({ id: 'a', localTime: 5 });
    expect(findActiveTimelineItemWithTransitions(items, 6.5, total)).toMatchObject({ id: 'c' });
    expect(findTimelineItemInRangeWithTransitions(items, 2)?.index).toBe(1);
  });

  it('ペアの前後のディゾルブはカット扱い（重なり 0）', () => {
    const items = [
      makeItem({ id: 'x', duration: 5, transitionToNext: { type: 'dissolve', duration: 1 } }),
      makeItem({ id: 'a', duration: 5, splitCompareToNext: compare(), transitionToNext: { type: 'dissolve', duration: 1 } }),
      makeItem({ id: 'b', duration: 5, transitionToNext: { type: 'dissolve', duration: 1 } }),
      makeItem({ id: 'c', duration: 5 }),
    ];
    expect(getTimelineOverlapToNext(items, 0)).toBe(0);
    expect(getTimelineOverlapToNext(items, 1)).toBe(0);
    expect(getTimelineOverlapToNext(items, 2)).toBe(0);
    const ranges = computeTransitionTimelineRanges(items);
    expect(ranges.map((r) => [r.start, r.end])).toEqual([[0, 5], [5, 10], [5, 10], [10, 15]]);
  });

  it('比較が無ければディゾルブは従来どおり（回帰防止）', () => {
    const items = [
      makeItem({ id: 'a', duration: 10, transitionToNext: { type: 'dissolve', duration: 2 } }),
      makeItem({ id: 'b', duration: 10 }),
    ];
    expect(getTimelineOverlapToNext(items, 0)).toBe(2);
    expect(calculateTotalDurationWithTransitions(items)).toBe(18);
  });

  it('保存スロットの尺表示も同じ規約で計算する', () => {
    const data = {
      slot: 1,
      projectId: 'p',
      savedAt: '2026-11-07T00:00:00.000Z',
      mediaItems: [
        { id: 'a', type: 'video', duration: 6, transitionToNext: null, splitCompareToNext: compare() },
        { id: 'b', type: 'video', duration: 4, transitionToNext: null },
        { id: 'c', type: 'image', duration: 5, transitionToNext: null },
      ],
    } as unknown as ProjectData & { slot: 1 };
    expect(toManualProjectSummary(data).durationSec).toBe(11);
  });
});

describe('resolveSplitCompareGeometry', () => {
  it('自動は横キャンバスで左右・縦キャンバスで上下', () => {
    expect(resolveSplitCompareGeometry(compare(), 1920, 1080).orientation).toBe('horizontal');
    expect(resolveSplitCompareGeometry(compare(), 1080, 1920).orientation).toBe('vertical');
    expect(resolveSplitCompareGeometry(compare({ layout: 'vertical' }), 1920, 1080).orientation)
      .toBe('vertical');
  });

  it('左右・まっすぐは中央の縦線で半分ずつ', () => {
    const g = resolveSplitCompareGeometry(compare({ layout: 'horizontal' }), 1920, 1080);
    expect(g.line).toEqual({ x1: 960, y1: 0, x2: 960, y2: 1080 });
    expect(g.regions[0].fitRect).toEqual({ x: 0, y: 0, width: 960, height: 1080 });
    expect(g.regions[1].fitRect).toEqual({ x: 960, y: 0, width: 960, height: 1080 });
    expect(g.lineColor).toBe('#ffffff');
    expect(g.lineWidth).toBeGreaterThan(0);
  });

  it('左右・ななめは上辺が右寄り、下辺が左寄り', () => {
    const g = resolveSplitCompareGeometry(compare({ layout: 'horizontal', divider: 'diagonal' }), 1000, 500);
    expect(g.line.x1).toBeGreaterThan(500);
    expect(g.line.y1).toBe(0);
    expect(g.line.x2).toBeLessThan(500);
    expect(g.line.y2).toBe(500);
    // 領域の外接矩形はななめの張り出しまで含む
    expect(g.regions[0].fitRect.width).toBe(g.line.x1);
    expect(g.regions[1].fitRect.x).toBe(g.line.x2);
  });

  it('上下・ななめは左右の辺を結ぶ', () => {
    const g = resolveSplitCompareGeometry(compare({ layout: 'vertical', divider: 'diagonal' }), 1080, 1920);
    expect(g.line.x1).toBe(0);
    expect(g.line.x2).toBe(1080);
    expect(g.line.y1).toBeGreaterThan(960);
    expect(g.line.y2).toBeLessThan(960);
  });

  it('線の色なしは線を描かない', () => {
    const g = resolveSplitCompareGeometry(compare({ lineColor: 'none' }), 1920, 1080);
    expect(g.lineWidth).toBe(0);
    const ctx = {
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), clip: vi.fn(),
      stroke: vi.fn(), save: vi.fn(), restore: vi.fn(),
      lineWidth: 1, strokeStyle: '', globalAlpha: 1, lineCap: 'butt' as CanvasLineCap,
    };
    expect(drawSplitCompareDivider(ctx, g)).toBe(false);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('領域クリップと境界線を Canvas へ描く', () => {
    const g = resolveSplitCompareGeometry(compare({ lineColor: 'black' }), 1920, 1080);
    const ctx = {
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), clip: vi.fn(),
      stroke: vi.fn(), save: vi.fn(), restore: vi.fn(),
      lineWidth: 1, strokeStyle: '', globalAlpha: 1, lineCap: 'butt' as CanvasLineCap,
    };
    clipToSplitCompareRegion(ctx, g.regions[0]);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.clip).toHaveBeenCalledTimes(1);
    expect(drawSplitCompareDivider(ctx, g)).toBe(true);
    expect(ctx.strokeStyle).toBe('#000000');
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });
});

describe('resolveSplitComparePeerFadeAlpha', () => {
  it('クリップ自身のフェードを掛け、重なるときは按分する', () => {
    const item = makeItem({ duration: 4, fadeIn: true, fadeOut: true, fadeInDuration: 1, fadeOutDuration: 1 });
    expect(resolveSplitComparePeerFadeAlpha(item, 0.5)).toBeCloseTo(0.5);
    expect(resolveSplitComparePeerFadeAlpha(item, 2)).toBe(1);
    expect(resolveSplitComparePeerFadeAlpha(item, 3.5)).toBeCloseTo(0.5);
    const short = makeItem({ duration: 1, fadeIn: true, fadeOut: true, fadeInDuration: 1, fadeOutDuration: 1 });
    expect(resolveSplitComparePeerFadeAlpha(short, 0.25)).toBeCloseTo(0.5);
    expect(resolveSplitComparePeerFadeAlpha(makeItem({}), 3)).toBe(1);
  });
});
