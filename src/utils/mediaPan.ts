/**
 * @file mediaPan.ts
 * @description クリップ表示時間全体の位置移動（パン）。プレビュー・ミニビュー・書き出しで同じ計算を使う。
 *
 * 契約（ズームの mediaZoom.ts と同じ考え方）:
 * - 開始位置は既存の `positionX` / `positionY`（位置・サイズの横・縦と共通）。
 * - 終了位置は任意の `panEndPositionX` / `panEndPositionY`（px・中心原点・下が＋の保存座標）。
 *   **両方が有限値のときだけ**移動する。どちらか欠けていれば開始位置で固定（旧データと同じ）。
 * - 進み方はズームと同じ `localTime / duration` の線形補間。ズームと同時に使うと
 *   「移動しながら拡大」になり、両方が同じ瞬間に始まり同じ瞬間に終わる。
 */
import type { MediaItem } from '../types';
import { validatePosition } from './media';

export interface MediaPanSource {
  positionX?: number;
  positionY?: number;
  duration?: number;
  panEndPositionX?: number;
  panEndPositionY?: number;
}

export interface MediaPanPoint {
  x: number;
  y: number;
}

/** 端点がこの差（px）未満なら「動かない」とみなして終了位置を消す */
const MEDIA_PAN_FIXED_EPSILON_PX = 0.5;

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function hasMediaPanRange(source: MediaPanSource): boolean {
  return Number.isFinite(source.panEndPositionX) && Number.isFinite(source.panEndPositionY);
}

export function resolveMediaPanRange(source: MediaPanSource): { start: MediaPanPoint; end: MediaPanPoint } {
  const start = { x: finiteOr(source.positionX, 0), y: finiteOr(source.positionY, 0) };
  if (!hasMediaPanRange(source)) return { start, end: { ...start } };
  return {
    start,
    end: { x: source.panEndPositionX as number, y: source.panEndPositionY as number },
  };
}

/** 開始と終了が（ほぼ）同じなら移動なし */
export function isMediaPanMoving(source: MediaPanSource): boolean {
  const { start, end } = resolveMediaPanRange(source);
  return Math.abs(end.x - start.x) >= MEDIA_PAN_FIXED_EPSILON_PX
    || Math.abs(end.y - start.y) >= MEDIA_PAN_FIXED_EPSILON_PX;
}

/** 位置の補間に使う進み具合（ズームの resolveMediaScaleFactor と同じ式） */
function resolveProgress(source: MediaPanSource, localTimeSec: number): number {
  const duration = typeof source.duration === 'number' && Number.isFinite(source.duration)
    ? Math.max(0, source.duration)
    : 0;
  const localTime = typeof localTimeSec === 'number' && Number.isFinite(localTimeSec) ? localTimeSec : 0;
  return duration <= 0 ? 0 : Math.min(1, Math.max(0, localTime / duration));
}

/** プレビュー・ミニビュー・書き出し・分割・続きが使う、その時刻の位置（px）の単一ソース */
export function resolveMediaPosition(source: MediaPanSource, localTimeSec: number): MediaPanPoint {
  const { start, end } = resolveMediaPanRange(source);
  if (end.x === start.x && end.y === start.y) return start;
  const progress = resolveProgress(source, localTimeSec);
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
}

type MediaPanPatch = Pick<MediaItem, 'positionX' | 'positionY'> & {
  panEndPositionX: number | undefined;
  panEndPositionY: number | undefined;
};

/** 継承・分割・端点編集の状態生成。同じ位置なら終了位置を消して「固定」にする */
export function createMediaPanRangePatch(start: MediaPanPoint, end: MediaPanPoint): MediaPanPatch {
  const startX = validatePosition(start.x);
  const startY = validatePosition(start.y);
  const endX = validatePosition(end.x);
  const endY = validatePosition(end.y);
  const fixed = Math.abs(endX - startX) < MEDIA_PAN_FIXED_EPSILON_PX
    && Math.abs(endY - startY) < MEDIA_PAN_FIXED_EPSILON_PX;
  return {
    positionX: startX,
    positionY: startY,
    panEndPositionX: fixed ? undefined : endX,
    panEndPositionY: fixed ? undefined : endY,
  };
}

/** その時刻（既定は末尾）の位置で固定する。続きコピー・前の素材の終了位置の引き継ぎ用 */
export function createMediaPanHoldPatch(source: MediaPanSource, localTimeSec = source.duration ?? 0): MediaPanPatch {
  const point = resolveMediaPosition(source, localTimeSec);
  return createMediaPanRangePatch(point, point);
}

/** 片方の端点の片方の軸だけを変える。固定中に終了を触ったら開始位置から動かし始める */
export function createMediaPanEndpointPatch(
  source: MediaPanSource,
  endpoint: 'start' | 'end',
  axis: 'x' | 'y',
  value: number,
): MediaPanPatch {
  const { start, end } = resolveMediaPanRange(source);
  const target = endpoint === 'start' ? { ...start } : { ...end };
  if (axis === 'x') target.x = value;
  else target.y = value;
  return endpoint === 'start'
    ? createMediaPanRangePatch(target, hasMediaPanRange(source) ? end : target)
    : createMediaPanRangePatch(start, target);
}
