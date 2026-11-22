/**
 * @file splitCompare.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 「並べて比較（同時再生）」の純ロジック（standard フレーバー限定機能）。
 *
 * 上のカードに `splitCompareToNext` を設定すると、そのカードと直後のカードを
 * 同じ時刻から同時に再生し、画面を 2 分割して並べる。
 *
 * - ペアは「上のカード（head）＋直後のカード（partner）」の 2 枚まで。3 枚以上の連鎖はしない
 *   （partner に設定が残っていても無視する）。
 * - タイムライン: 2 枚は同じ時刻に始まり、長いほうの終わりで次のカードへ進む。
 *   短いほうは最後のコマ（画像はそのまま）で止めて表示し続ける。
 * - ペアの前後の境界のディゾルブはカット扱い（重ねる相手が 3 枚になるため）。
 *   フェード(黒/白) はペアの前後でもそのまま使える。
 * - 描画: head は左/上、partner は右/下の領域へ、領域ごとに素材を収めて描く。
 * - フェードイン/アウト: ペア設定（SplitCompareSettings.fadeIn など）が持つ。2 画面を 1 つの画面として
 *   扱い、左右の映像・境界線・2 枚の音声に同じ係数を掛ける（resolveSplitComparePairFade）。
 *   ペア中はカード自身のフェードは使わない。旧データ（ペアにフェードが無い）は読み込み時に
 *   2 枚のカードのフェードから求める（migrateLegacySplitComparePairFades）。
 *
 * タイムライン計算は `transitionTimeline.ts` が、描画は standard エンジンの renderFrame が行う
 * （プレビューと書き出しで同じ描画 = WYSIWYG）。
 */
import { normalizeVideoPlaybackSpeed } from './playbackSpeed';
import type {
  MediaItem,
  SplitCompareMatchDurationRestore,
  SplitCompareDivider,
  SplitCompareFit,
  SplitCompareLayout,
  SplitCompareLineColor,
  SplitCompareSettings,
} from '../types';

/**
 * 保存データの正規化で使う既定値。layout の 'auto'（キャンバスの向きに従う）は
 * 旧データ互換のためだけに残す。UI からは選べない（新規は createDefaultSplitCompareSettings）。
 */
/** ペアのフェード秒数の既定（新しいカードと同じ 1 秒） */
export const SPLIT_COMPARE_DEFAULT_FADE_DURATION = 1;

/** ペア設定のうちフェードにかかわる値（2 画面まとめて掛ける） */
export type SplitComparePairFadeSettings = Pick<
  SplitCompareSettings,
  'fadeIn' | 'fadeOut' | 'fadeInDuration' | 'fadeOutDuration'
>;

/** ペアのフェードの既定（オフ・1 秒） */
export const SPLIT_COMPARE_DEFAULT_PAIR_FADE: Readonly<SplitComparePairFadeSettings> = {
  fadeIn: false,
  fadeOut: false,
  fadeInDuration: SPLIT_COMPARE_DEFAULT_FADE_DURATION,
  fadeOutDuration: SPLIT_COMPARE_DEFAULT_FADE_DURATION,
};

export const SPLIT_COMPARE_DEFAULT_SETTINGS: SplitCompareSettings = {
  layout: 'auto',
  divider: 'straight',
  fit: 'cover',
  lineColor: 'white',
  ...SPLIT_COMPARE_DEFAULT_PAIR_FADE,
};

/**
 * 比較を ON にしたときの初期設定。横動画（16:9）・正方形は左右、縦動画は上下。
 * initialFade は 2 枚のカードに付いていたフェード（deriveSplitComparePairFadeFromClips）。
 * ON にしただけでカードに付けていたフェードが消えないよう、ペアへ引き継ぐ。
 */
export function createDefaultSplitCompareSettings(
  aspectRatio: 'landscape' | 'portrait' | 'auto',
  isCanvasPortrait: boolean = false,
  initialFade: SplitComparePairFadeSettings = SPLIT_COMPARE_DEFAULT_PAIR_FADE,
): SplitCompareSettings {
  const vertical = aspectRatio === 'portrait' || (aspectRatio === 'auto' && isCanvasPortrait);
  return {
    ...SPLIT_COMPARE_DEFAULT_SETTINGS,
    layout: vertical ? 'vertical' : 'horizontal',
    ...pickSplitComparePairFade(initialFade),
  };
}

export const SPLIT_COMPARE_LAYOUT_OPTIONS: { value: 'horizontal' | 'vertical'; label: string }[] = [
  { value: 'horizontal', label: '左右' },
  { value: 'vertical', label: '上下' },
];

/** UI に出す並べ方（旧データの 'auto' はキャンバスの向きで左右/上下に読み替える） */
export function resolveSplitCompareDisplayLayout(
  layout: SplitCompareLayout,
  aspectRatio: 'landscape' | 'portrait' | 'auto',
  isCanvasPortrait: boolean = false,
): 'horizontal' | 'vertical' {
  if (layout === 'horizontal' || layout === 'vertical') return layout;
  const vertical = aspectRatio === 'portrait' || (aspectRatio === 'auto' && isCanvasPortrait);
  return vertical ? 'vertical' : 'horizontal';
}

export const SPLIT_COMPARE_DIVIDER_OPTIONS: { value: SplitCompareDivider; label: string }[] = [
  { value: 'straight', label: 'まっすぐ' },
  { value: 'diagonal', label: 'ななめ' },
];

export const SPLIT_COMPARE_FIT_OPTIONS: { value: SplitCompareFit; label: string }[] = [
  { value: 'cover', label: '枠を埋める' },
  { value: 'contain', label: '全体を表示' },
];

export const SPLIT_COMPARE_LINE_COLOR_OPTIONS: { value: SplitCompareLineColor; label: string }[] = [
  { value: 'white', label: '白' },
  { value: 'black', label: '黒' },
  { value: 'none', label: 'なし' },
];

/** ななめ境界線の傾き（キャンバス幅/高さに対する、中央からのずれ量の比率） */
export const SPLIT_COMPARE_DIAGONAL_OFFSET_RATIO = 0.1;

const LAYOUTS: readonly SplitCompareLayout[] = ['auto', 'horizontal', 'vertical'];
const DIVIDERS: readonly SplitCompareDivider[] = ['straight', 'diagonal'];
const FITS: readonly SplitCompareFit[] = ['cover', 'contain'];
const LINE_COLORS: readonly SplitCompareLineColor[] = ['white', 'black', 'none'];

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** フェード秒数の正規化。未設定・0 以下・不正値は 1 秒（カードのフェードと同じ扱い） */
function normalizePairFadeDuration(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : SPLIT_COMPARE_DEFAULT_FADE_DURATION;
}

/** ペア設定からフェードの 4 項目だけを取り出す（カードへ書き戻すときにも使う） */
export function pickSplitComparePairFade(
  settings: SplitComparePairFadeSettings,
): SplitComparePairFadeSettings {
  return {
    fadeIn: settings.fadeIn === true,
    fadeOut: settings.fadeOut === true,
    fadeInDuration: normalizePairFadeDuration(settings.fadeInDuration),
    fadeOutDuration: normalizePairFadeDuration(settings.fadeOutDuration),
  };
}

/**
 * 保存データのペア設定にフェードの ON/OFF が入っているか。
 * 入っていない旧データは、読み込み時に 2 枚のカードのフェードから求める（秒数だけでは判断しない）。
 */
export function hasSplitComparePairFadeFields(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const value = raw as Partial<Record<keyof SplitCompareSettings, unknown>>;
  return typeof value.fadeIn === 'boolean' || typeof value.fadeOut === 'boolean';
}

type SplitCompareFadeItem = Pick<
  MediaItem,
  'duration' | 'fadeIn' | 'fadeOut' | 'fadeInDuration' | 'fadeOutDuration'
>;

function resolveEnabledFadeSeconds(enabled: boolean, seconds: number | undefined): number {
  if (!enabled) return 0;
  // 動画・画像カードと同じく、未設定は 1 秒
  return normalizePairFadeDuration(seconds);
}

/**
 * 2 枚のカードに付いていたフェードから、ペアのフェードを求める（旧データの移行と、2 画面を ON にしたとき）。
 * - フェードイン / アウトは、どちらかのカードで ON なら ON。
 * - 秒数は ON のカードのうち長いほう。どちらも OFF なら既定の 1 秒。
 * - イン＋アウトがペアの長さを超えるときの按分は描画時（resolveSplitComparePairFade）に行う
 *   （保存値は 0.5 / 1 / 2 秒の選択肢のまま残す）。
 */
export function deriveSplitComparePairFadeFromClips(
  head: SplitCompareFadeItem,
  partner: SplitCompareFadeItem | null | undefined,
): SplitComparePairFadeSettings {
  const cards = partner ? [head, partner] : [head];
  const fadeInSeconds = Math.max(0, ...cards.map((card) => resolveEnabledFadeSeconds(card.fadeIn, card.fadeInDuration)));
  const fadeOutSeconds = Math.max(0, ...cards.map((card) => resolveEnabledFadeSeconds(card.fadeOut, card.fadeOutDuration)));
  return {
    fadeIn: fadeInSeconds > 0,
    fadeOut: fadeOutSeconds > 0,
    fadeInDuration: fadeInSeconds > 0 ? fadeInSeconds : SPLIT_COMPARE_DEFAULT_FADE_DURATION,
    fadeOutDuration: fadeOutSeconds > 0 ? fadeOutSeconds : SPLIT_COMPARE_DEFAULT_FADE_DURATION,
  };
}

/**
 * 保存データや外部入力から設定を正規化する。未設定（null/undefined/非オブジェクト）は null。
 * 未知の値は既定値へ寄せる（前方互換）。
 * フェードが保存されていない旧データはオフ・1 秒で読む。2 画面ペアとして使われている旧データは、
 * 読み込み後に migrateLegacySplitComparePairFades がカードのフェードから求めた値へ置き換える。
 */
export function normalizeSplitCompareSettings(raw: unknown): SplitCompareSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<Record<keyof SplitCompareSettings, unknown>>;
  const fade = pickSplitComparePairFade(
    hasSplitComparePairFadeFields(value)
      ? value as SplitComparePairFadeSettings
      : SPLIT_COMPARE_DEFAULT_PAIR_FADE,
  );
  const normalized: SplitCompareSettings = {
    layout: pick(value.layout, LAYOUTS, SPLIT_COMPARE_DEFAULT_SETTINGS.layout),
    divider: pick(value.divider, DIVIDERS, SPLIT_COMPARE_DEFAULT_SETTINGS.divider),
    fit: pick(value.fit, FITS, SPLIT_COMPARE_DEFAULT_SETTINGS.fit),
    lineColor: pick(value.lineColor, LINE_COLORS, SPLIT_COMPARE_DEFAULT_SETTINGS.lineColor),
    ...fade,
  };
  if (value.matchDuration === true) {
    normalized.matchDuration = true;
    normalized.matchDurationRestore = normalizeMatchDurationRestore(value.matchDurationRestore);
  }
  return normalized;
}

type LegacyPairFadeMigrationItem = SplitCompareFadeItem & Pick<MediaItem, 'splitCompareToNext'>;

/**
 * 読み込んだプロジェクトの 2 画面ペアのうち、保存データにペアのフェードが無かったもの（旧データ）へ、
 * 2 枚のカードのフェードから求めた値（deriveSplitComparePairFadeFromClips）を入れる。
 * 以前と同じ見え方・聞こえ方のまま開き、次の保存でペア設定として残る。
 *
 * @param items 正規化済みのカード（splitCompareToNext は normalizeSplitCompareSettings 済み）
 * @param rawSplitCompareList items[i] の保存データ上の splitCompareToNext（正規化前）
 * @returns 変更があったカードだけ差し替えた新しい配列（無ければ同じ配列）
 */
export function migrateLegacySplitComparePairFades<T extends LegacyPairFadeMigrationItem>(
  items: T[],
  rawSplitCompareList: ReadonlyArray<unknown>,
): T[] {
  const roles = resolveSplitCompareRoles(items);
  let result: T[] | null = null;
  for (let i = 0; i < items.length; i++) {
    if (roles[i] !== 'head') continue;
    const settings = items[i].splitCompareToNext;
    if (!settings || hasSplitComparePairFadeFields(rawSplitCompareList[i])) continue;
    const migrated: SplitCompareSettings = {
      ...settings,
      ...deriveSplitComparePairFadeFromClips(items[i], items[i + 1]),
    };
    result ??= [...items];
    result[i] = { ...items[i], splitCompareToNext: migrated };
  }
  return result ?? items;
}

function normalizeMatchDurationRestore(raw: unknown): SplitCompareMatchDurationRestore | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<Record<keyof SplitCompareMatchDurationRestore, unknown>>;
  if (typeof value.itemId !== 'string' || !value.itemId) return null;
  if (value.field !== 'trimEnd' && value.field !== 'duration') return null;
  if (!Number.isFinite(value.original) || !Number.isFinite(value.applied)) return null;
  return {
    itemId: value.itemId,
    field: value.field,
    original: value.original as number,
    applied: value.applied as number,
  };
}

/** 長さをそろえたとみなす差（秒） */
const MATCH_DURATION_TOLERANCE_SEC = 0.05;

type MatchDurationItem = Pick<MediaItem, 'id' | 'type' | 'duration' | 'trimStart' | 'trimEnd'>
  & Partial<Pick<MediaItem, 'playbackSpeed'>>;

/** 2 枚の長さ（タイムライン秒）がそろっているか */
export function areSplitCompareDurationsMatched(head: MatchDurationItem, partner: MatchDurationItem): boolean {
  return Math.abs((head.duration || 0) - (partner.duration || 0)) <= MATCH_DURATION_TOLERANCE_SEC;
}

/**
 * 「長さを短い方に合わせる」で、長い方のカードへ入れる値を求める。そろっていれば null。
 * 動画は終了位置（trimEnd）を詰め、画像は表示時間を短い方と同じにする。
 * 再生速度が 1 以外の動画は、タイムライン上の長さがそろうようにソース尺を換算する。
 */
export function resolveSplitCompareMatchDuration(
  head: MatchDurationItem,
  partner: MatchDurationItem,
): { itemId: string; field: 'trimEnd' | 'duration'; current: number; next: number } | null {
  if (areSplitCompareDurationsMatched(head, partner)) return null;
  const longer = (head.duration || 0) > (partner.duration || 0) ? head : partner;
  const shorter = longer === head ? partner : head;
  const target = Math.max(0, shorter.duration || 0);
  if (!(target > 0)) return null;
  if (longer.type === 'image') {
    return { itemId: longer.id, field: 'duration', current: longer.duration, next: target };
  }
  const speed = normalizeVideoPlaybackSpeed(longer.playbackSpeed);
  return {
    itemId: longer.id,
    field: 'trimEnd',
    current: longer.trimEnd,
    next: Number((longer.trimStart + target * speed).toFixed(3)),
  };
}

export type SplitCompareRole = 'head' | 'partner' | null;

/**
 * 各カードの役割（head / partner / なし）を配列順で返す。
 * head は「設定あり かつ 直後のカードがある かつ 自身が partner でない」カード。
 */
export function resolveSplitCompareRoles(
  items: ReadonlyArray<Pick<MediaItem, 'splitCompareToNext'>>,
): SplitCompareRole[] {
  const roles: SplitCompareRole[] = new Array(items.length).fill(null);
  for (let i = 0; i < items.length; i++) {
    if (roles[i] === 'partner') continue;
    if (items[i]?.splitCompareToNext && i + 1 < items.length) {
      roles[i] = 'head';
      roles[i + 1] = 'partner';
    }
  }
  return roles;
}

export interface SplitComparePairInfo {
  headIndex: number;
  partnerIndex: number;
  settings: SplitCompareSettings;
}

/** index のカードが属するペアを返す（属さなければ null） */
export function getSplitComparePairForIndex(
  items: ReadonlyArray<Pick<MediaItem, 'splitCompareToNext'>>,
  index: number,
  precomputedRoles?: SplitCompareRole[],
): SplitComparePairInfo | null {
  const roles = precomputedRoles ?? resolveSplitCompareRoles(items);
  const role = roles[index];
  if (!role) return null;
  const headIndex = role === 'head' ? index : index - 1;
  const settings = normalizeSplitCompareSettings(items[headIndex]?.splitCompareToNext);
  if (!settings) return null;
  return { headIndex, partnerIndex: headIndex + 1, settings };
}

/** 「自動」を解決した実際の並べ方。横長キャンバスは左右、縦長キャンバスは上下 */
export function resolveSplitCompareOrientation(
  layout: SplitCompareLayout,
  canvasWidth: number,
  canvasHeight: number,
): 'horizontal' | 'vertical' {
  if (layout === 'horizontal' || layout === 'vertical') return layout;
  return canvasHeight > canvasWidth ? 'vertical' : 'horizontal';
}

export interface SplitCompareRegion {
  /** 描画をクリップする多角形（キャンバス座標） */
  polygon: Array<[number, number]>;
  /** 素材を収める基準矩形（多角形の外接矩形） */
  fitRect: { x: number; y: number; width: number; height: number };
}

export interface SplitCompareGeometry {
  orientation: 'horizontal' | 'vertical';
  /** [0] = head（左/上）, [1] = partner（右/下） */
  regions: [SplitCompareRegion, SplitCompareRegion];
  /** 境界線（両端がキャンバスの辺上） */
  line: { x1: number; y1: number; x2: number; y2: number };
  /** 境界線の太さ（px）。lineColor が none のときは 0 */
  lineWidth: number;
  lineColor: string | null;
}

function boundingRect(polygon: Array<[number, number]>): SplitCompareRegion['fitRect'] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of polygon) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

/**
 * キャンバス寸法から 2 領域と境界線を求める。
 *
 * - 左右・まっすぐ: 中央の縦線
 * - 左右・ななめ: 上辺は少し右寄り、下辺は少し左寄りを結ぶ線
 * - 上下・まっすぐ: 中央の横線
 * - 上下・ななめ: 左辺は少し下寄り、右辺は少し上寄りを結ぶ線
 */
export function resolveSplitCompareGeometry(
  settings: SplitCompareSettings,
  canvasWidth: number,
  canvasHeight: number,
): SplitCompareGeometry {
  const w = Math.max(1, canvasWidth);
  const h = Math.max(1, canvasHeight);
  const orientation = resolveSplitCompareOrientation(settings.layout, w, h);
  const isDiagonal = settings.divider === 'diagonal';
  const lineWidth = settings.lineColor === 'none'
    ? 0
    : Math.max(2, Math.round(Math.min(w, h) * 0.006));
  const lineColor = settings.lineColor === 'none'
    ? null
    : settings.lineColor === 'black' ? '#000000' : '#ffffff';

  if (orientation === 'horizontal') {
    const offset = isDiagonal ? w * SPLIT_COMPARE_DIAGONAL_OFFSET_RATIO : 0;
    const topX = w / 2 + offset;
    const bottomX = w / 2 - offset;
    const left: Array<[number, number]> = [[0, 0], [topX, 0], [bottomX, h], [0, h]];
    const right: Array<[number, number]> = [[topX, 0], [w, 0], [w, h], [bottomX, h]];
    return {
      orientation,
      regions: [
        { polygon: left, fitRect: boundingRect(left) },
        { polygon: right, fitRect: boundingRect(right) },
      ],
      line: { x1: topX, y1: 0, x2: bottomX, y2: h },
      lineWidth,
      lineColor,
    };
  }

  const offset = isDiagonal ? h * SPLIT_COMPARE_DIAGONAL_OFFSET_RATIO : 0;
  const leftY = h / 2 + offset;
  const rightY = h / 2 - offset;
  const top: Array<[number, number]> = [[0, 0], [w, 0], [w, rightY], [0, leftY]];
  const bottom: Array<[number, number]> = [[0, leftY], [w, rightY], [w, h], [0, h]];
  return {
    orientation,
    regions: [
      { polygon: top, fitRect: boundingRect(top) },
      { polygon: bottom, fitRect: boundingRect(bottom) },
    ],
    line: { x1: 0, y1: leftY, x2: w, y2: rightY },
    lineWidth,
    lineColor,
  };
}

/** Canvas 2D の最小インターフェース（テストでモックしやすいよう必要分だけ） */
type SplitCompareCanvasContext = Pick<
  CanvasRenderingContext2D,
  'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'clip' | 'stroke' | 'save' | 'restore'
> & {
  lineWidth: number;
  strokeStyle: CanvasRenderingContext2D['strokeStyle'];
  globalAlpha: number;
  lineCap: CanvasRenderingContext2D['lineCap'];
};

/** 領域の多角形でクリップする（呼び出し側で save/restore すること） */
export function clipToSplitCompareRegion(
  ctx: SplitCompareCanvasContext,
  region: SplitCompareRegion,
): void {
  ctx.beginPath();
  region.polygon.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
}

/**
 * 境界線を描く。色が none のときは何もしない。
 * alpha は左右の映像と同じペア共通のフェード係数を渡す（0 以下・不正値は描かない）。
 * NaN を globalAlpha に入れると Canvas は無視して不透明のまま描くため、ここで弾く。
 */
export function drawSplitCompareDivider(
  ctx: SplitCompareCanvasContext,
  geometry: SplitCompareGeometry,
  alpha = 1,
): boolean {
  if (!geometry.lineColor || geometry.lineWidth <= 0) return false;
  const clamped = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0;
  if (clamped <= 0) return false;
  ctx.save();
  try {
    ctx.globalAlpha = clamped;
    ctx.strokeStyle = geometry.lineColor;
    ctx.lineWidth = geometry.lineWidth;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    // 辺の外まで少し伸ばし、端に隙間が見えないようにする
    const { x1, y1, x2, y2 } = geometry.line;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1;
    const extend = geometry.lineWidth;
    ctx.moveTo(x1 - (dx / length) * extend, y1 - (dy / length) * extend);
    ctx.lineTo(x2 + (dx / length) * extend, y2 + (dy / length) * extend);
    ctx.stroke();
  } finally {
    ctx.restore();
  }
  return true;
}

/**
 * 左右・ななめのとき、横長素材を境界線から少し離すための横位置（中央原点 %）。
 * 左（head）は −5%、右（partner）は ＋5%。ななめの線で素材の中心が隠れにくくなる。
 */
export const SPLIT_COMPARE_DIAGONAL_AUTO_OFFSET_PERCENT = 5;
/** 自動調整済みとみなす許容差（%）。キャンバス幅の px 丸め分 */
const AUTO_OFFSET_TOLERANCE_PERCENT = 0.2;

/** この設定で「左右・ななめ」の自動位置調整を掛けるべきか（比較なしは false） */
export function isSplitCompareDiagonalOffsetWanted(
  settings: SplitCompareSettings | null | undefined,
  aspectRatio: 'landscape' | 'portrait' | 'auto',
  isCanvasPortrait: boolean = false,
): boolean {
  if (!settings) return false;
  return settings.divider === 'diagonal'
    && resolveSplitCompareDisplayLayout(settings.layout, aspectRatio, isCanvasPortrait) === 'horizontal';
}

type AutoOffsetItem = Pick<MediaItem, 'positionX' | 'positionY' | 'scale' | 'isLocked'>
  & Partial<Pick<MediaItem, 'rotation' | 'zoomDirection' | 'zoomStartScale' | 'zoomEndScale'
    | 'panEndPositionX' | 'panEndPositionY'>>;

/** 拡大・縦位置・ズームを触っていない（横位置だけを見る前提の）カードか */
function hasUntouchedTransform(item: AutoOffsetItem): boolean {
  const hasZoom = (item.zoomDirection === 'in' || item.zoomDirection === 'out')
    || (Number.isFinite(item.zoomStartScale) && Number.isFinite(item.zoomEndScale)
      && Math.abs((item.zoomStartScale as number) - (item.zoomEndScale as number)) > 1e-6);
  return !item.isLocked
    && Math.abs((item.scale ?? 1) - 1) < 1e-6
    && Math.abs(item.positionY || 0) < 0.5
    && !hasZoom
    // 位置の移動（パン）を設定したカードは利用者が位置を決めているので自動調整しない
    && !(Number.isFinite(item.panEndPositionX) && Number.isFinite(item.panEndPositionY));
}

/**
 * 「左右・ななめ」の自動位置調整のパッチ（positionX の px）を返す。不要なら null。
 *
 * - 調整が必要になった（ななめにした等）とき: 横長素材で、位置・拡大・ズームを何も触っていない
 *   （横位置 0）なら、左は −5%・右は ＋5% にする。
 * - 不要になった（まっすぐに戻した・上下にした・比較をやめた）とき: 自動で入れた ±5% のまま
 *   何も触っていなければ 0 に戻す。ユーザーが動かした位置・拡大は変えない。
 * 素材の向きが分からない（未読込）・縦長・正方形は何もしない。
 */
export function resolveSplitCompareAutoOffsetPatch(params: {
  item: AutoOffsetItem;
  role: 'head' | 'partner';
  wasWanted: boolean;
  isWanted: boolean;
  /** 素材の幅・高さ（回転前）。不明なら null */
  sourceSize: { width: number; height: number } | null;
  /** 位置の px 基準（キャンバス幅） */
  canvasWidth: number;
}): { positionX: number } | null {
  const { item, role, wasWanted, isWanted, sourceSize, canvasWidth } = params;
  if (wasWanted === isWanted || !sourceSize || !(canvasWidth > 0)) return null;
  const rotated = ((item.rotation ?? 0) % 180 + 180) % 180 === 90;
  const width = rotated ? sourceSize.height : sourceSize.width;
  const height = rotated ? sourceSize.width : sourceSize.height;
  if (!(width > height)) return null;
  if (!hasUntouchedTransform(item)) return null;

  const offsetPercent = role === 'head'
    ? -SPLIT_COMPARE_DIAGONAL_AUTO_OFFSET_PERCENT
    : SPLIT_COMPARE_DIAGONAL_AUTO_OFFSET_PERCENT;
  const currentPercent = ((item.positionX || 0) / canvasWidth) * 100;
  if (isWanted) {
    if (Math.abs(currentPercent) > AUTO_OFFSET_TOLERANCE_PERCENT) return null;
    return { positionX: Math.round((offsetPercent / 100) * canvasWidth) };
  }
  if (Math.abs(currentPercent - offsetPercent) > AUTO_OFFSET_TOLERANCE_PERCENT) return null;
  return { positionX: 0 };
}

/** ペアを 1 つの画面として扱うときのフェード（秒）。なしは 0 */
export interface SplitComparePairFade {
  /** ペア全体の長さ（長いほうの尺） */
  duration: number;
  /** 共通のフェードイン秒（按分後） */
  fadeInDuration: number;
  /** 共通のフェードアウト秒（按分後） */
  fadeOutDuration: number;
}

/** 1 フレームぶんのペア共通フェード */
export interface SplitComparePairFadeState {
  /** 左右の映像・境界線・2 枚の音声に共通で掛ける係数（0〜1） */
  alpha: number;
  /** ペアの先頭からの経過秒（0〜ペア尺にクランプ） */
  localTime: number;
  isFadingIn: boolean;
  isFadingOut: boolean;
}

function normalizePairDuration(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * 並べて比較（2 画面表示）のペアに掛ける共通フェードを求める。
 *
 * 2 画面は 1 つの画面として扱い、左右（上下）の映像・境界線・2 枚の音声を同じ係数でフェードさせる
 * （片方だけ・線だけが残らないようにする）。フェードの ON/OFF と秒数は**ペア設定**から読む
 * （カード自身のフェードは見ない。旧データは読み込み時にカードから移行済み）。
 * - フェードアウト: ペア全体の終わり（長いほうの終わり）に掛ける。
 * - フェードイン: ペアの始まり（2 枚が同時に始まる時刻）に掛ける。
 * - フェードイン + フェードアウトがペア尺を超えるときは、単体のクリップと同じく按分する。
 */
export function resolveSplitComparePairFade(
  settings: SplitComparePairFadeSettings,
  head: Pick<MediaItem, 'duration'>,
  partner: Pick<MediaItem, 'duration'>,
): SplitComparePairFade {
  const duration = Math.max(normalizePairDuration(head.duration), normalizePairDuration(partner.duration));
  let fadeInDuration = resolveEnabledFadeSeconds(settings.fadeIn === true, settings.fadeInDuration);
  let fadeOutDuration = resolveEnabledFadeSeconds(settings.fadeOut === true, settings.fadeOutDuration);
  if (fadeInDuration + fadeOutDuration > duration && duration > 0) {
    const ratio = duration / (fadeInDuration + fadeOutDuration);
    fadeInDuration *= ratio;
    fadeOutDuration *= ratio;
  }
  return { duration, fadeInDuration, fadeOutDuration };
}

/** ペアの先頭からの経過秒で、共通フェードの係数と区間を返す */
export function resolveSplitComparePairFadeState(
  fade: SplitComparePairFade,
  pairLocalTime: number,
): SplitComparePairFadeState {
  const localTime = Number.isFinite(pairLocalTime)
    ? Math.max(0, Math.min(fade.duration, pairLocalTime))
    : 0;
  const isFadingIn = fade.fadeInDuration > 0 && localTime < fade.fadeInDuration;
  const isFadingOut = !isFadingIn
    && fade.fadeOutDuration > 0
    && localTime > fade.duration - fade.fadeOutDuration;
  let alpha = 1;
  if (isFadingIn) {
    alpha = localTime / fade.fadeInDuration;
  } else if (isFadingOut) {
    alpha = (fade.duration - localTime) / fade.fadeOutDuration;
  }
  return {
    alpha: Math.max(0, Math.min(1, alpha)),
    localTime,
    isFadingIn,
    isFadingOut,
  };
}

/** ペア共通フェードの係数（0〜1）。左右の映像・境界線・2 枚の音声に同じ値を使う */
export function resolveSplitComparePairFadeAlpha(
  fade: SplitComparePairFade,
  pairLocalTime: number,
): number {
  return resolveSplitComparePairFadeState(fade, pairLocalTime).alpha;
}

/**
 * index のカードが 2 画面ペアに入っていれば、ペア共通のフェードを返す（入っていなければ null）。
 * 音声（プレビューの準備・書き出しのエンベロープ）で、映像と同じ係数を使うための入口。
 */
export function resolveSplitComparePairFadeForIndex(
  items: ReadonlyArray<Pick<MediaItem, 'duration' | 'splitCompareToNext'>>,
  index: number,
  precomputedRoles?: SplitCompareRole[],
): (SplitComparePairInfo & { fade: SplitComparePairFade }) | null {
  const pair = getSplitComparePairForIndex(items, index, precomputedRoles);
  if (!pair) return null;
  const head = items[pair.headIndex];
  const partner = items[pair.partnerIndex];
  if (!head || !partner) return null;
  return { ...pair, fade: resolveSplitComparePairFade(pair.settings, head, partner) };
}

/** 動画カードの音声フェード（タイムライン秒）。書き出しのゲインエンベロープに使う */
export interface ClipAudioFadeWindow {
  /** フェードを測る区間の始まり（カード単体はカードの始まり、ペアはペアの始まり） */
  start: number;
  /** 区間の終わり（カード単体はカードの終わり、ペアは長いほうの終わり） */
  end: number;
  /** 按分後のフェードイン秒（なしは 0） */
  fadeInDuration: number;
  /** 按分後のフェードアウト秒（なしは 0） */
  fadeOutDuration: number;
  /** 2 画面ペアの共通フェードか */
  isSplitComparePair: boolean;
}

/**
 * 書き出しで動画カードの音声に掛けるフェードの区間を求める。
 * - 2 画面ペア: 2 枚とも同じ区間（ペアの始まり〜長いほうの終わり）と同じ秒数（ペア設定）。
 *   映像と同じ係数で、2 枚の音が一緒に立ち上がり・一緒に消える。短いほうは自分の終わりで音が止まる。
 * - それ以外: 従来どおりカード自身のフェード（イン＋アウトがカード長を超えるときは按分）。
 *
 * @param clipStart このカードのタイムライン上の開始秒（ペアは 2 枚とも同じ）
 */
export function resolveClipAudioFadeWindow(
  items: ReadonlyArray<SplitCompareFadeItem & Pick<MediaItem, 'splitCompareToNext'>>,
  index: number,
  clipStart: number,
): ClipAudioFadeWindow {
  const item = items[index];
  const pair = resolveSplitComparePairFadeForIndex(items, index);
  if (pair) {
    return {
      start: clipStart,
      end: clipStart + pair.fade.duration,
      fadeInDuration: pair.fade.fadeInDuration,
      fadeOutDuration: pair.fade.fadeOutDuration,
      isSplitComparePair: true,
    };
  }
  const duration = item?.duration ?? 0;
  let fadeInDuration = item?.fadeIn ? item.fadeInDuration || 1.0 : 0;
  let fadeOutDuration = item?.fadeOut ? item.fadeOutDuration || 1.0 : 0;
  // 書き出しの従来ロジックのまま（重なった場合に按分）
  if (fadeInDuration + fadeOutDuration > duration) {
    const ratio = duration / (fadeInDuration + fadeOutDuration);
    fadeInDuration *= ratio;
    fadeOutDuration *= ratio;
  }
  return {
    start: clipStart,
    end: clipStart + duration,
    fadeInDuration,
    fadeOutDuration,
    isSplitComparePair: false,
  };
}

/** コネクタやログに出す短い説明（例: 「左右・まっすぐ」） */
export function describeSplitCompareSettings(
  settings: SplitCompareSettings,
  aspectRatio: 'landscape' | 'portrait' | 'auto' = 'landscape',
  isCanvasPortrait: boolean = false,
): string {
  const displayLayout = resolveSplitCompareDisplayLayout(settings.layout, aspectRatio, isCanvasPortrait);
  const layout = SPLIT_COMPARE_LAYOUT_OPTIONS.find((o) => o.value === displayLayout)?.label ?? '';
  const divider = SPLIT_COMPARE_DIVIDER_OPTIONS.find((o) => o.value === settings.divider)?.label ?? '';
  return `${layout}・${divider}`;
}
