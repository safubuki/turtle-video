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
 *
 * タイムライン計算は `transitionTimeline.ts` が、描画は standard エンジンの renderFrame が行う
 * （プレビューと書き出しで同じ描画 = WYSIWYG）。
 */
import type {
  MediaItem,
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
export const SPLIT_COMPARE_DEFAULT_SETTINGS: SplitCompareSettings = {
  layout: 'auto',
  divider: 'straight',
  fit: 'cover',
  lineColor: 'white',
};

/** 比較を ON にしたときの初期設定。横動画（16:9）は左右、縦動画（9:16）は上下 */
export function createDefaultSplitCompareSettings(
  aspectRatio: 'landscape' | 'portrait',
): SplitCompareSettings {
  return {
    ...SPLIT_COMPARE_DEFAULT_SETTINGS,
    layout: aspectRatio === 'portrait' ? 'vertical' : 'horizontal',
  };
}

export const SPLIT_COMPARE_LAYOUT_OPTIONS: { value: 'horizontal' | 'vertical'; label: string }[] = [
  { value: 'horizontal', label: '左右' },
  { value: 'vertical', label: '上下' },
];

/** UI に出す並べ方（旧データの 'auto' はキャンバスの向きで左右/上下に読み替える） */
export function resolveSplitCompareDisplayLayout(
  layout: SplitCompareLayout,
  aspectRatio: 'landscape' | 'portrait',
): 'horizontal' | 'vertical' {
  if (layout === 'horizontal' || layout === 'vertical') return layout;
  return aspectRatio === 'portrait' ? 'vertical' : 'horizontal';
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

/**
 * 保存データや外部入力から設定を正規化する。未設定（null/undefined/非オブジェクト）は null。
 * 未知の値は既定値へ寄せる（前方互換）。
 */
export function normalizeSplitCompareSettings(raw: unknown): SplitCompareSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<Record<keyof SplitCompareSettings, unknown>>;
  return {
    layout: pick(value.layout, LAYOUTS, SPLIT_COMPARE_DEFAULT_SETTINGS.layout),
    divider: pick(value.divider, DIVIDERS, SPLIT_COMPARE_DEFAULT_SETTINGS.divider),
    fit: pick(value.fit, FITS, SPLIT_COMPARE_DEFAULT_SETTINGS.fit),
    lineColor: pick(value.lineColor, LINE_COLORS, SPLIT_COMPARE_DEFAULT_SETTINGS.lineColor),
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

/** 境界線を描く。色が none のときは何もしない */
export function drawSplitCompareDivider(
  ctx: SplitCompareCanvasContext,
  geometry: SplitCompareGeometry,
  alpha = 1,
): boolean {
  if (!geometry.lineColor || geometry.lineWidth <= 0) return false;
  const clamped = Math.max(0, Math.min(1, alpha));
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
  aspectRatio: 'landscape' | 'portrait',
): boolean {
  if (!settings) return false;
  return settings.divider === 'diagonal'
    && resolveSplitCompareDisplayLayout(settings.layout, aspectRatio) === 'horizontal';
}

type AutoOffsetItem = Pick<MediaItem, 'positionX' | 'positionY' | 'scale' | 'isLocked'>
  & Partial<Pick<MediaItem, 'rotation' | 'zoomDirection' | 'zoomStartScale' | 'zoomEndScale'>>;

/** 拡大・縦位置・ズームを触っていない（横位置だけを見る前提の）カードか */
function hasUntouchedTransform(item: AutoOffsetItem): boolean {
  const hasZoom = (item.zoomDirection === 'in' || item.zoomDirection === 'out')
    || (Number.isFinite(item.zoomStartScale) && Number.isFinite(item.zoomEndScale)
      && Math.abs((item.zoomStartScale as number) - (item.zoomEndScale as number)) > 1e-6);
  return !item.isLocked
    && Math.abs((item.scale ?? 1) - 1) < 1e-6
    && Math.abs(item.positionY || 0) < 0.5
    && !hasZoom;
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

/**
 * ペアのもう一方（peer）に掛けるクリップ自身のフェード係数（0〜1）。
 * active と同じく、フェードイン + フェードアウトがクリップ長を超えるときは按分する。
 */
export function resolveSplitComparePeerFadeAlpha(
  item: Pick<MediaItem, 'duration' | 'fadeIn' | 'fadeOut' | 'fadeInDuration' | 'fadeOutDuration'>,
  localTime: number,
): number {
  const duration = Number.isFinite(item.duration) ? Math.max(0, item.duration) : 0;
  let fadeInDur = item.fadeIn ? (item.fadeInDuration || 1.0) : 0;
  let fadeOutDur = item.fadeOut ? (item.fadeOutDuration || 1.0) : 0;
  if (fadeInDur + fadeOutDur > duration && duration > 0) {
    const ratio = duration / (fadeInDur + fadeOutDur);
    fadeInDur *= ratio;
    fadeOutDur *= ratio;
  }
  let alpha = 1;
  if (fadeInDur > 0 && localTime < fadeInDur) {
    alpha = localTime / fadeInDur;
  } else if (fadeOutDur > 0 && localTime > duration - fadeOutDur) {
    alpha = (duration - localTime) / fadeOutDur;
  }
  return Math.max(0, Math.min(1, alpha));
}

/** コネクタやログに出す短い説明（例: 「左右・まっすぐ」） */
export function describeSplitCompareSettings(
  settings: SplitCompareSettings,
  aspectRatio: 'landscape' | 'portrait' = 'landscape',
): string {
  const displayLayout = resolveSplitCompareDisplayLayout(settings.layout, aspectRatio);
  const layout = SPLIT_COMPARE_LAYOUT_OPTIONS.find((o) => o.value === displayLayout)?.label ?? '';
  const divider = SPLIT_COMPARE_DIVIDER_OPTIONS.find((o) => o.value === settings.divider)?.label ?? '';
  return `${layout}・${divider}`;
}
