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
  resolveSplitComparePairFade,
  resolveSplitComparePairFadeAlpha,
  resolveSplitComparePairFadeForIndex,
  resolveSplitComparePairFadeState,
  deriveSplitComparePairFadeFromClips,
  hasSplitComparePairFadeFields,
  migrateLegacySplitComparePairFades,
  pickSplitComparePairFade,
  resolveClipAudioFadeWindow,
  SPLIT_COMPARE_DEFAULT_PAIR_FADE,
  type SplitComparePairFadeSettings,
  isSplitCompareDiagonalOffsetWanted,
  resolveSplitCompareAutoOffsetPatch,
  resolveSplitCompareMatchDuration,
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
    })).toEqual({
      layout: 'vertical', divider: 'diagonal', fit: 'contain', lineColor: 'none',
      // フェードが無い旧データはオフ・1 秒（ペアの移行は読み込み時に別途行う）
      fadeIn: false, fadeOut: false, fadeInDuration: 1, fadeOutDuration: 1,
    });
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

  describe('境界線の alpha（フェードで暗転した画面に線だけが残らない）', () => {
    const createDividerContext = () => {
      const strokeAlphas: number[] = [];
      const ctx = {
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), clip: vi.fn(),
        stroke: vi.fn(() => { strokeAlphas.push(ctx.globalAlpha); }),
        save: vi.fn(), restore: vi.fn(),
        lineWidth: 1, strokeStyle: '', globalAlpha: 1, lineCap: 'butt' as CanvasLineCap,
      };
      return { ctx, strokeAlphas };
    };

    it.each(['white', 'black'] as const)('線の色 %s: alpha 0 や負の値では線を描かない', (lineColor) => {
      const g = resolveSplitCompareGeometry(compare({ lineColor }), 1920, 1080);
      for (const alpha of [0, -0.5, Number.NaN]) {
        const { ctx, strokeAlphas } = createDividerContext();
        expect(drawSplitCompareDivider(ctx, g, alpha)).toBe(false);
        expect(ctx.stroke).not.toHaveBeenCalled();
        expect(strokeAlphas).toEqual([]);
      }
    });

    it('0 に近い alpha は不透明にせず、その alpha のまま描く（1 超は 1 に収める）', () => {
      const g = resolveSplitCompareGeometry(compare({ lineColor: 'white' }), 1920, 1080);
      for (const [alpha, expected] of [[0.001, 0.001], [0.05, 0.05], [0.5, 0.5], [1, 1], [3, 1]] as const) {
        const { ctx, strokeAlphas } = createDividerContext();
        expect(drawSplitCompareDivider(ctx, g, alpha)).toBe(true);
        expect(strokeAlphas).toHaveLength(1);
        expect(strokeAlphas[0]).toBeCloseTo(expected, 6);
        // save/restore で囲み、呼び出し側の globalAlpha を汚さない
        expect(ctx.save).toHaveBeenCalledTimes(1);
        expect(ctx.restore).toHaveBeenCalledTimes(1);
      }
    });

    it('alpha 省略時は従来どおり不透明（フェードしない区間の回帰防止）', () => {
      const g = resolveSplitCompareGeometry(compare({ lineColor: 'white' }), 1920, 1080);
      const { ctx, strokeAlphas } = createDividerContext();
      expect(drawSplitCompareDivider(ctx, g)).toBe(true);
      expect(strokeAlphas).toEqual([1]);
    });
  });
});

/** ペア設定のフェード（未指定はオフ・1 秒） */
const pairFade = (overrides: Partial<SplitComparePairFadeSettings> = {}): SplitComparePairFadeSettings => ({
  ...SPLIT_COMPARE_DEFAULT_PAIR_FADE,
  ...overrides,
});

describe('並べて比較の共通フェード（2 画面を 1 つの画面としてフェードする）', () => {
  const FADE_DURATION_STOPS = [0.5, 1, 2] as const;

  it.each(FADE_DURATION_STOPS)(
    'フェードアウト %s 秒: ペアの終わりに向けて 1 → 0 へ直線で下がる（左右と境界線で同じ値）',
    (seconds) => {
      const fade = resolveSplitComparePairFade(
        pairFade({ fadeOut: true, fadeOutDuration: seconds }),
        { duration: 6 },
        { duration: 6 },
      );
      expect(fade).toEqual({ duration: 6, fadeInDuration: 0, fadeOutDuration: seconds });
      expect(resolveSplitComparePairFadeAlpha(fade, 0)).toBe(1);
      expect(resolveSplitComparePairFadeAlpha(fade, 6 - seconds - 0.01)).toBe(1);
      expect(resolveSplitComparePairFadeAlpha(fade, 6 - seconds * 0.75)).toBeCloseTo(0.75);
      expect(resolveSplitComparePairFadeAlpha(fade, 6 - seconds / 2)).toBeCloseTo(0.5);
      expect(resolveSplitComparePairFadeAlpha(fade, 6 - seconds * 0.25)).toBeCloseTo(0.25);
      expect(resolveSplitComparePairFadeAlpha(fade, 6)).toBe(0);
      const state = resolveSplitComparePairFadeState(fade, 6 - seconds / 2);
      expect(state.isFadingOut).toBe(true);
      expect(state.isFadingIn).toBe(false);
    },
  );

  it.each(FADE_DURATION_STOPS)(
    'フェードアウト %s 秒・長さが違うペア: 短いほうの終わりでは暗転せず、長いほうの終わりで一緒に消える',
    (seconds) => {
      const settings = pairFade({ fadeOut: true, fadeOutDuration: seconds });
      const fade = resolveSplitComparePairFade(settings, { duration: 6 }, { duration: 3 });
      expect(fade.duration).toBe(6);
      // 短いほう（3 秒）の終わり際はまだフェードしない
      expect(resolveSplitComparePairFadeAlpha(fade, 3 - 0.001)).toBe(1);
      expect(resolveSplitComparePairFadeAlpha(fade, 6 - seconds / 2)).toBeCloseTo(0.5);
      expect(resolveSplitComparePairFadeAlpha(fade, 6)).toBe(0);
      // head / partner を入れ替えても同じ（どちらが長くても同じ規則）
      expect(resolveSplitComparePairFade(settings, { duration: 3 }, { duration: 6 })).toEqual(fade);
    },
  );

  it('ペア設定のフェードだけを使い、カード自身のフェードは見ない', () => {
    // カードはどちらもフェード ON だが、ペア設定はオフ → フェードしない
    const head = makeItem({ id: 'h', duration: 6, fadeIn: true, fadeOut: true, fadeInDuration: 2, fadeOutDuration: 2 });
    const partner = makeItem({ id: 'p', duration: 4, fadeIn: true, fadeOut: true, fadeInDuration: 0.5, fadeOutDuration: 0.5 });
    expect(resolveSplitComparePairFade(pairFade(), head, partner))
      .toEqual({ duration: 6, fadeInDuration: 0, fadeOutDuration: 0 });
    // カードはどちらもオフだが、ペア設定は ON → ペアの秒数でフェードする
    const plainHead = makeItem({ id: 'h', duration: 6 });
    const plainPartner = makeItem({ id: 'p', duration: 4 });
    expect(resolveSplitComparePairFade(
      pairFade({ fadeIn: true, fadeInDuration: 0.5, fadeOut: true, fadeOutDuration: 2 }),
      plainHead,
      plainPartner,
    )).toEqual({ duration: 6, fadeInDuration: 0.5, fadeOutDuration: 2 });
    // ON/OFF とは別に秒数だけが入っていてもフェードしない
    expect(resolveSplitComparePairFade(pairFade({ fadeInDuration: 2, fadeOutDuration: 2 }), plainHead, plainPartner))
      .toEqual({ duration: 6, fadeInDuration: 0, fadeOutDuration: 0 });
  });

  it('どちらも OFF ならフェードしない（常に 1）', () => {
    const fade = resolveSplitComparePairFade(pairFade(), { duration: 6 }, { duration: 4 });
    expect(fade).toEqual({ duration: 6, fadeInDuration: 0, fadeOutDuration: 0 });
    for (const t of [0, 3, 5.99, 6, 10]) {
      const state = resolveSplitComparePairFadeState(fade, t);
      expect(state.alpha).toBe(1);
      expect(state.isFadingIn).toBe(false);
      expect(state.isFadingOut).toBe(false);
    }
  });

  it('フェードインも 2 画面で共通（2 枚は同時に始まる）。ペアの尺（長いほう）で按分を判定する', () => {
    // 短い 1 秒のカード単体なら 0.5 秒ずつに按分されるが、ペアは長いほう（5 秒）の尺で判定する
    const fade = resolveSplitComparePairFade(
      pairFade({ fadeIn: true, fadeOut: true, fadeInDuration: 1, fadeOutDuration: 1 }),
      { duration: 1 },
      { duration: 5 },
    );
    expect(fade).toEqual({ duration: 5, fadeInDuration: 1, fadeOutDuration: 1 });
    expect(resolveSplitComparePairFadeAlpha(fade, 0)).toBe(0);
    expect(resolveSplitComparePairFadeAlpha(fade, 0.5)).toBeCloseTo(0.5);
    expect(resolveSplitComparePairFadeAlpha(fade, 1)).toBe(1);
    expect(resolveSplitComparePairFadeState(fade, 0.5).isFadingIn).toBe(true);
  });

  it('フェードイン + フェードアウトがペアの尺を超えるときは単体のクリップと同じく按分する', () => {
    const fade = resolveSplitComparePairFade(
      pairFade({ fadeIn: true, fadeInDuration: 1, fadeOut: true, fadeOutDuration: 2 }),
      { duration: 1.5 },
      { duration: 1 },
    );
    expect(fade.duration).toBe(1.5);
    expect(fade.fadeInDuration).toBeCloseTo(0.5);
    expect(fade.fadeOutDuration).toBeCloseTo(1);
    expect(resolveSplitComparePairFadeAlpha(fade, 0.25)).toBeCloseTo(0.5);
    expect(resolveSplitComparePairFadeAlpha(fade, 0.5)).toBeCloseTo(1);
    expect(resolveSplitComparePairFadeAlpha(fade, 1)).toBeCloseTo(0.5);
    expect(resolveSplitComparePairFadeAlpha(fade, 1.5)).toBe(0);
  });

  it('ペアの終わりを過ぎた時刻（終端フォールバック）や不正な時刻でも 0〜1 に収める', () => {
    const fade = resolveSplitComparePairFade(
      pairFade({ fadeOut: true, fadeOutDuration: 1 }),
      { duration: 6 },
      { duration: 4 },
    );
    expect(resolveSplitComparePairFadeAlpha(fade, 6.5)).toBe(0);
    expect(resolveSplitComparePairFadeAlpha(fade, -1)).toBe(1);
    expect(resolveSplitComparePairFadeAlpha(fade, Number.NaN)).toBe(1);
  });

  it('秒数が未設定・不正な値は単体のクリップと同じく 1 秒として扱う', () => {
    const fade = resolveSplitComparePairFade(
      pairFade({ fadeOut: true, fadeOutDuration: Number.NaN, fadeIn: true, fadeInDuration: 0 }),
      { duration: 6 },
      { duration: 6 },
    );
    expect(fade.fadeOutDuration).toBe(1);
    expect(fade.fadeInDuration).toBe(1);
  });

  it('resolveSplitComparePairFadeForIndex: ペアの 2 枚は同じフェード、ペア外は null', () => {
    const items = [
      makeItem({ id: 'h', duration: 6, splitCompareToNext: compare({ fadeOut: true, fadeOutDuration: 2 }) }),
      makeItem({ id: 'p', duration: 4 }),
      makeItem({ id: 'single', duration: 3, fadeOut: true, fadeOutDuration: 0.5 }),
    ];
    const head = resolveSplitComparePairFadeForIndex(items, 0);
    const partner = resolveSplitComparePairFadeForIndex(items, 1);
    expect(head?.fade).toEqual({ duration: 6, fadeInDuration: 0, fadeOutDuration: 2 });
    expect(partner?.fade).toEqual(head?.fade);
    expect(partner).toMatchObject({ headIndex: 0, partnerIndex: 1 });
    expect(resolveSplitComparePairFadeForIndex(items, 2)).toBeNull();
  });
});

describe('ペアのフェード設定（保存・既定値・旧データの移行）', () => {
  it('新しく 2 画面にしたときの既定はフェードオフ・1 秒。カードのフェードを渡せば引き継ぐ', () => {
    expect(createDefaultSplitCompareSettings('landscape')).toMatchObject({
      fadeIn: false, fadeOut: false, fadeInDuration: 1, fadeOutDuration: 1,
    });
    expect(createDefaultSplitCompareSettings('portrait', false, pairFade({ fadeOut: true, fadeOutDuration: 2 })))
      .toMatchObject({ layout: 'vertical', fadeIn: false, fadeOut: true, fadeInDuration: 1, fadeOutDuration: 2 });
  });

  it('保存されたフェードはそのまま読み、不正な秒数は 1 秒・ON/OFF は true 以外をオフにする', () => {
    expect(normalizeSplitCompareSettings({
      ...compare(), fadeIn: true, fadeInDuration: 0.5, fadeOut: true, fadeOutDuration: 2,
    })).toMatchObject({ fadeIn: true, fadeInDuration: 0.5, fadeOut: true, fadeOutDuration: 2 });
    expect(normalizeSplitCompareSettings({
      ...compare(), fadeIn: false, fadeInDuration: -1, fadeOut: true, fadeOutDuration: 'x',
    })).toMatchObject({ fadeIn: false, fadeInDuration: 1, fadeOut: true, fadeOutDuration: 1 });
    // ON/OFF が無い（秒数だけ）旧データはオフ・1 秒
    const durationsOnly = { layout: 'horizontal', divider: 'straight', fit: 'cover', lineColor: 'white', fadeOutDuration: 2 };
    expect(hasSplitComparePairFadeFields(durationsOnly)).toBe(false);
    expect(normalizeSplitCompareSettings(durationsOnly))
      .toMatchObject({ fadeIn: false, fadeOut: false, fadeInDuration: 1, fadeOutDuration: 1 });
    expect(hasSplitComparePairFadeFields({ fadeOut: false })).toBe(true);
    expect(hasSplitComparePairFadeFields(null)).toBe(false);
  });

  it('pickSplitComparePairFade はフェードの 4 項目だけを正規化して返す（カードへの書き戻し用）', () => {
    expect(pickSplitComparePairFade(compare({ fadeIn: true, fadeInDuration: 2, lineColor: 'black' })))
      .toEqual({ fadeIn: true, fadeOut: false, fadeInDuration: 2, fadeOutDuration: 1 });
  });

  describe('deriveSplitComparePairFadeFromClips（旧データ・2 画面 ON 時の引き継ぎ）', () => {
    it('どちらかのカードで ON なら ON。秒数は ON のカードのうち長いほう', () => {
      expect(deriveSplitComparePairFadeFromClips(
        makeItem({ fadeOut: true, fadeOutDuration: 0.5, fadeIn: false, fadeInDuration: 2 }),
        makeItem({ fadeOut: true, fadeOutDuration: 2, fadeIn: true, fadeInDuration: 0.5 }),
      )).toEqual({ fadeIn: true, fadeInDuration: 0.5, fadeOut: true, fadeOutDuration: 2 });
    });

    it('片方だけ ON: OFF 側の秒数は使わない（ON がどちらでも同じ）', () => {
      const on = makeItem({ fadeOut: true, fadeOutDuration: 0.5 });
      const off = makeItem({ fadeOut: false, fadeOutDuration: 2 });
      const expected = { fadeIn: false, fadeInDuration: 1, fadeOut: true, fadeOutDuration: 0.5 };
      expect(deriveSplitComparePairFadeFromClips(on, off)).toEqual(expected);
      expect(deriveSplitComparePairFadeFromClips(off, on)).toEqual(expected);
    });

    it('どちらも OFF ならオフ・1 秒。秒数が不正な旧データは 1 秒', () => {
      expect(deriveSplitComparePairFadeFromClips(makeItem({ fadeInDuration: 2 }), makeItem({})))
        .toEqual(SPLIT_COMPARE_DEFAULT_PAIR_FADE);
      expect(deriveSplitComparePairFadeFromClips(
        makeItem({ fadeOut: true, fadeOutDuration: Number.NaN }),
        makeItem({ fadeIn: true, fadeInDuration: 0 }),
      )).toEqual({ fadeIn: true, fadeInDuration: 1, fadeOut: true, fadeOutDuration: 1 });
    });
  });

  describe('migrateLegacySplitComparePairFades（読み込み時の旧データ移行）', () => {
    const legacyPairRaw = { layout: 'horizontal', divider: 'straight', fit: 'cover', lineColor: 'white' };

    it('ペアにフェードが無い旧データは、2 枚のカードのフェードから求めてペア設定へ入れる', () => {
      const items = [
        makeItem({ id: 'h', duration: 6, fadeOut: true, fadeOutDuration: 0.5, splitCompareToNext: normalizeSplitCompareSettings(legacyPairRaw) }),
        makeItem({ id: 'p', duration: 4, fadeIn: true, fadeInDuration: 2, fadeOut: true, fadeOutDuration: 2 }),
        makeItem({ id: 'c', duration: 3 }),
      ];
      const migrated = migrateLegacySplitComparePairFades(items, [legacyPairRaw, undefined, undefined]);
      expect(migrated).not.toBe(items);
      expect(migrated[0].splitCompareToNext).toEqual({
        ...legacyPairRaw, fadeIn: true, fadeInDuration: 2, fadeOut: true, fadeOutDuration: 2,
      });
      // カード自身のフェードや他のカードは変えない
      expect(migrated[0]).toMatchObject({ fadeOut: true, fadeOutDuration: 0.5 });
      expect(migrated[1]).toBe(items[1]);
      expect(migrated[2]).toBe(items[2]);
    });

    it('移行後は以前（カードのフェードから求めていた頃）と同じフェードになる（按分も同じ）', () => {
      // 旧ルール: イン = カード h の 1 秒、アウト = カード p の 2 秒、ペア尺 1.5 秒 → 0.5 / 1 秒に按分
      const items = [
        makeItem({ id: 'h', duration: 1.5, fadeIn: true, fadeInDuration: 1, splitCompareToNext: normalizeSplitCompareSettings(legacyPairRaw) }),
        makeItem({ id: 'p', duration: 1, fadeOut: true, fadeOutDuration: 2 }),
      ];
      const [head, partner] = migrateLegacySplitComparePairFades(items, [legacyPairRaw, undefined]);
      // 保存値は選択肢の秒数のまま（按分は描画時）
      expect(head.splitCompareToNext).toMatchObject({ fadeIn: true, fadeInDuration: 1, fadeOut: true, fadeOutDuration: 2 });
      const fade = resolveSplitComparePairFade(head.splitCompareToNext!, head, partner);
      expect(fade.fadeInDuration).toBeCloseTo(0.5);
      expect(fade.fadeOutDuration).toBeCloseTo(1);
    });

    it('ペアにフェードが保存されていればそちらを優先し、カードのフェードでは上書きしない', () => {
      const savedRaw = { ...legacyPairRaw, fadeIn: false, fadeOut: false, fadeInDuration: 1, fadeOutDuration: 1 };
      const items = [
        makeItem({ id: 'h', fadeOut: true, fadeOutDuration: 2, splitCompareToNext: normalizeSplitCompareSettings(savedRaw) }),
        makeItem({ id: 'p', fadeIn: true, fadeInDuration: 2 }),
      ];
      const migrated = migrateLegacySplitComparePairFades(items, [savedRaw, undefined]);
      expect(migrated).toBe(items);
      expect(migrated[0].splitCompareToNext).toMatchObject({ fadeIn: false, fadeOut: false });
    });

    it('ペアになっていない設定（最後のカード・partner に残った設定）は既定のまま移行しない', () => {
      const items = [
        makeItem({ id: 'a', fadeOut: true, splitCompareToNext: normalizeSplitCompareSettings(legacyPairRaw) }),
        makeItem({ id: 'b', fadeOut: true, splitCompareToNext: normalizeSplitCompareSettings(legacyPairRaw) }), // partner
        makeItem({ id: 'c', fadeOut: true, splitCompareToNext: normalizeSplitCompareSettings(legacyPairRaw) }), // 最後
      ];
      const migrated = migrateLegacySplitComparePairFades(items, [legacyPairRaw, legacyPairRaw, legacyPairRaw]);
      expect(migrated[0].splitCompareToNext).toMatchObject({ fadeOut: true });
      expect(migrated[1]).toBe(items[1]);
      expect(migrated[2]).toBe(items[2]);
      expect(migrated[1].splitCompareToNext).toMatchObject({ fadeIn: false, fadeOut: false, fadeInDuration: 1, fadeOutDuration: 1 });
    });

    it('2 画面が無いプロジェクトは同じ配列を返す', () => {
      const items = [makeItem({ id: 'a', fadeOut: true }), makeItem({ id: 'b' })];
      expect(migrateLegacySplitComparePairFades(items, [undefined, undefined])).toBe(items);
    });
  });
});

describe('動画カードの音声フェード区間（書き出しのゲインエンベロープ）', () => {
  const FADE_DURATION_STOPS = [0.5, 1, 2] as const;

  it.each(FADE_DURATION_STOPS)(
    '2 画面ペア（フェード %s 秒）: 2 枚とも同じ区間（ペアの始まり〜長いほうの終わり）・同じ秒数で、カードのフェードは使わない',
    (seconds) => {
      const items = [
        makeItem({ id: 'pre', duration: 2 }),
        makeItem({
          id: 'h', duration: 6, fadeIn: false, fadeOut: false,
          splitCompareToNext: compare({ fadeIn: true, fadeInDuration: seconds, fadeOut: true, fadeOutDuration: seconds }),
        }),
        // 短いほう・カード自身のフェードは別の値（ペア中は使わない）
        makeItem({ id: 'p', duration: 4, fadeIn: true, fadeInDuration: 2, fadeOut: true, fadeOutDuration: 0.5 }),
      ];
      const head = resolveClipAudioFadeWindow(items, 1, 2);
      const partner = resolveClipAudioFadeWindow(items, 2, 2);
      expect(head).toEqual({ start: 2, end: 8, fadeInDuration: seconds, fadeOutDuration: seconds, isSplitComparePair: true });
      expect(partner).toEqual(head);
    },
  );

  it('2 画面ペアでフェードオフなら、カードにフェードが付いていても音はフェードしない', () => {
    const items = [
      makeItem({ id: 'h', duration: 6, fadeIn: true, fadeOut: true, splitCompareToNext: compare() }),
      makeItem({ id: 'p', duration: 6, fadeIn: true, fadeOut: true }),
    ];
    expect(resolveClipAudioFadeWindow(items, 0, 0)).toMatchObject({ fadeInDuration: 0, fadeOutDuration: 0, end: 6 });
    expect(resolveClipAudioFadeWindow(items, 1, 0)).toMatchObject({ fadeInDuration: 0, fadeOutDuration: 0, end: 6 });
  });

  it('2 画面でないカードは従来どおりカード自身のフェード（イン＋アウトが長いときは按分）', () => {
    const items = [
      makeItem({ id: 'a', duration: 4, fadeIn: true, fadeInDuration: 1, fadeOut: true, fadeOutDuration: 2 }),
      makeItem({ id: 'b', duration: 1, fadeIn: true, fadeInDuration: 1, fadeOut: true, fadeOutDuration: 1 }),
      makeItem({ id: 'c', duration: 3 }),
    ];
    expect(resolveClipAudioFadeWindow(items, 0, 0))
      .toEqual({ start: 0, end: 4, fadeInDuration: 1, fadeOutDuration: 2, isSplitComparePair: false });
    expect(resolveClipAudioFadeWindow(items, 1, 4))
      .toEqual({ start: 4, end: 5, fadeInDuration: 0.5, fadeOutDuration: 0.5, isSplitComparePair: false });
    expect(resolveClipAudioFadeWindow(items, 2, 5))
      .toEqual({ start: 5, end: 8, fadeInDuration: 0, fadeOutDuration: 0, isSplitComparePair: false });
  });
});

describe('左右・ななめの自動位置調整（±5%）', () => {
  const landscape = { width: 1920, height: 1080 };
  const untouched = { positionX: 0, positionY: 0, scale: 1, isLocked: false };
  const apply = { wasWanted: false, isWanted: true, sourceSize: landscape, canvasWidth: 1280 };
  const revert = { wasWanted: true, isWanted: false, sourceSize: landscape, canvasWidth: 1280 };

  it('左右・ななめのときだけ調整対象（まっすぐ・上下・比較なしは対象外）', () => {
    expect(isSplitCompareDiagonalOffsetWanted(compare({ layout: 'horizontal', divider: 'diagonal' }), 'landscape')).toBe(true);
    expect(isSplitCompareDiagonalOffsetWanted(compare({ layout: 'horizontal', divider: 'straight' }), 'landscape')).toBe(false);
    expect(isSplitCompareDiagonalOffsetWanted(compare({ layout: 'vertical', divider: 'diagonal' }), 'landscape')).toBe(false);
    expect(isSplitCompareDiagonalOffsetWanted(compare({ layout: 'auto', divider: 'diagonal' }), 'portrait')).toBe(false);
    expect(isSplitCompareDiagonalOffsetWanted(null, 'landscape')).toBe(false);
  });

  it('何も触っていない横長素材は、ななめにすると左 -5%・右 +5%', () => {
    expect(resolveSplitCompareAutoOffsetPatch({ ...apply, item: untouched, role: 'head' })).toEqual({ positionX: -64 });
    expect(resolveSplitCompareAutoOffsetPatch({ ...apply, item: untouched, role: 'partner' })).toEqual({ positionX: 64 });
  });

  it('自動で入れた ±5% のままなら、まっすぐに戻すと 0 に戻す', () => {
    expect(resolveSplitCompareAutoOffsetPatch({ ...revert, item: { ...untouched, positionX: -64 }, role: 'head' }))
      .toEqual({ positionX: 0 });
    expect(resolveSplitCompareAutoOffsetPatch({ ...revert, item: { ...untouched, positionX: 64 }, role: 'partner' }))
      .toEqual({ positionX: 0 });
  });

  it('ユーザーが位置・拡大・ズームを調整していたら、適用も復元もしない', () => {
    expect(resolveSplitCompareAutoOffsetPatch({ ...apply, item: { ...untouched, positionX: 30 }, role: 'head' })).toBeNull();
    expect(resolveSplitCompareAutoOffsetPatch({ ...apply, item: { ...untouched, scale: 1.2 }, role: 'head' })).toBeNull();
    expect(resolveSplitCompareAutoOffsetPatch({ ...apply, item: { ...untouched, positionY: 40 }, role: 'head' })).toBeNull();
    expect(resolveSplitCompareAutoOffsetPatch({ ...apply, item: { ...untouched, zoomDirection: 'in' }, role: 'head' })).toBeNull();
    expect(resolveSplitCompareAutoOffsetPatch({ ...apply, item: { ...untouched, isLocked: true }, role: 'head' })).toBeNull();
    // 自動値から動かした（-64 → -100）なら戻さない
    expect(resolveSplitCompareAutoOffsetPatch({ ...revert, item: { ...untouched, positionX: -100 }, role: 'head' })).toBeNull();
  });

  it('縦長・正方形・向き不明の素材、90度回転で縦長になる素材は対象外', () => {
    expect(resolveSplitCompareAutoOffsetPatch({ ...apply, sourceSize: { width: 1080, height: 1920 }, item: untouched, role: 'head' })).toBeNull();
    expect(resolveSplitCompareAutoOffsetPatch({ ...apply, sourceSize: { width: 1000, height: 1000 }, item: untouched, role: 'head' })).toBeNull();
    expect(resolveSplitCompareAutoOffsetPatch({ ...apply, sourceSize: null, item: untouched, role: 'head' })).toBeNull();
    expect(resolveSplitCompareAutoOffsetPatch({ ...apply, item: { ...untouched, rotation: 90 }, role: 'head' })).toBeNull();
  });

  it('調整の要否が変わらないとき（ななめのまま線の色を変える等）は何もしない', () => {
    expect(resolveSplitCompareAutoOffsetPatch({ ...apply, wasWanted: true, item: untouched, role: 'head' })).toBeNull();
  });
});

describe('長さを短い方に合わせる', () => {
  it('長い方の動画の終了位置を、短い方の長さに合わせて詰める', () => {
    const head = makeItem({ id: 'a', duration: 8, trimStart: 1, trimEnd: 9, originalDuration: 10 });
    const partner = makeItem({ id: 'b', duration: 5 });
    expect(resolveSplitCompareMatchDuration(head, partner)).toEqual({
      itemId: 'a', field: 'trimEnd', current: 9, next: 6,
    });
  });

  it('倍速の動画はタイムライン上の長さがそろうようにソース尺を換算する', () => {
    // 2 倍速: ソース 16 秒 → タイムライン 8 秒。5 秒にそろえるにはソース 10 秒
    const head = makeItem({ id: 'a', duration: 8, trimStart: 0, trimEnd: 16, originalDuration: 20, playbackSpeed: 2 });
    const partner = makeItem({ id: 'b', duration: 5 });
    expect(resolveSplitCompareMatchDuration(head, partner)?.next).toBe(10);
  });

  it('長い方が画像なら表示時間を短い方と同じにする・そろっていれば何もしない', () => {
    const image = makeItem({ id: 'img', type: 'image', duration: 7 });
    const video = makeItem({ id: 'v', duration: 4 });
    expect(resolveSplitCompareMatchDuration(video, image)).toEqual({
      itemId: 'img', field: 'duration', current: 7, next: 4,
    });
    expect(resolveSplitCompareMatchDuration(video, makeItem({ id: 'w', duration: 4.02 }))).toBeNull();
  });

  it('保存データの長さそろえ設定と戻し情報を読み込み、不正な戻し情報は捨てる', () => {
    const restore = { itemId: 'a', field: 'trimEnd', original: 9, applied: 6 };
    expect(normalizeSplitCompareSettings({ ...compare(), matchDuration: true, matchDurationRestore: restore }))
      .toMatchObject({ matchDuration: true, matchDurationRestore: restore });
    expect(normalizeSplitCompareSettings({ ...compare(), matchDuration: true, matchDurationRestore: { itemId: 'a', field: 'x' } }))
      .toMatchObject({ matchDuration: true, matchDurationRestore: null });
    expect(normalizeSplitCompareSettings({ ...compare(), matchDuration: false })).not.toHaveProperty('matchDuration');
  });
});
