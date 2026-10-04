/**
 * @file mediaZoom.ts
 * @description クリップ表示時間全体のズーム倍率。プレビューと書き出しで同じ計算を使う。
 */
import type { MediaZoomDirection } from '../types';
import { MIN_SCALE, MAX_SCALE } from '../constants';

export const DEFAULT_MEDIA_ZOOM_AMOUNT = 1.2;
export const MIN_MEDIA_ZOOM_AMOUNT = 1.1;
export const MAX_MEDIA_ZOOM_AMOUNT = 1.5;
export const MIN_MEDIA_ZOOM_SCALE = MIN_SCALE;
export const MAX_MEDIA_ZOOM_SCALE = MAX_SCALE * MAX_MEDIA_ZOOM_AMOUNT;

export type MediaTransformResetKind = 'scale' | 'x' | 'y' | 'rotation' | 'blur' | 'zoom' | 'zoom-default';

export interface MediaZoomSource {
  scale?: number;
  duration?: number;
  zoomDirection?: MediaZoomDirection | null;
  zoomAmount?: number | null;
  zoomStartScale?: number;
  zoomEndScale?: number;
}

/** UIと保存倍率の変換はここだけで行う。 */
export function mediaScaleToPercent(scale: number): number {
  return Math.round(scale * 1000) / 10;
}

export function mediaPercentToScale(percent: number): number {
  return percent / 100;
}

export function normalizeMediaZoomScale(value: unknown, fallback = 1): number {
  const scale = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(MAX_MEDIA_ZOOM_SCALE, Math.max(MIN_MEDIA_ZOOM_SCALE, scale));
}

function baseScale(source: MediaZoomSource): number {
  return typeof source.scale === 'number' && Number.isFinite(source.scale) && source.scale > 0
    ? source.scale : 1;
}

export function hasMediaZoomRange(source: MediaZoomSource): boolean {
  return Number.isFinite(source.zoomStartScale) && Number.isFinite(source.zoomEndScale);
}

/** 旧データは基礎倍率×相対ズーム、新データは実効倍率の両端。 */
export function resolveMediaZoomRange(source: MediaZoomSource): { start: number; end: number } {
  if (hasMediaZoomRange(source)) {
    return {
      start: normalizeMediaZoomScale(source.zoomStartScale),
      end: normalizeMediaZoomScale(source.zoomEndScale),
    };
  }
  const scale = baseScale(source);
  const direction = normalizeMediaZoomDirection(source.zoomDirection);
  const amount = normalizeMediaZoomAmount(source.zoomAmount);
  return {
    start: direction === 'out' ? scale * amount : scale,
    end: direction === 'in' ? scale * amount : scale,
  };
}

/** 継承・分割・端点編集の状態生成。将来の中心点もこの契約へ追加する。 */
export function createMediaZoomRangePatch(start: number, end: number) {
  const zoomStartScale = normalizeMediaZoomScale(start);
  const zoomEndScale = normalizeMediaZoomScale(end);
  const zoomDirection: MediaZoomDirection = Math.abs(zoomEndScale - zoomStartScale) < 1e-9
    ? 'none' : zoomEndScale > zoomStartScale ? 'in' : 'out';
  return { scale: zoomStartScale, zoomStartScale, zoomEndScale, zoomDirection, zoomAmount: undefined };
}

/** サイズは開始倍率と同じ値。固定表示なら終了も連動し、ズーム中なら終了は保つ。 */
export function createMediaStartScalePatch(source: MediaZoomSource, scale: number) {
  const range = resolveMediaZoomRange(source);
  const start = normalizeMediaZoomScale(scale, range.start);
  return createMediaZoomRangePatch(start, Math.abs(range.end - range.start) < 1e-9 ? start : range.end);
}

export interface MediaZoomEndpointPreview {
  id: string;
  endpoint: 'start' | 'end';
}

/** 最終フレームの取得は区間内、倍率の計算は端点そのものを使う。 */
export function resolveMediaZoomEndpointPreview<T extends MediaZoomSource & { id: string; duration: number }>(
  items: readonly T[],
  selection: MediaZoomEndpointPreview | null | undefined,
  isPlaying = false,
  isExporting = false,
) {
  if (!selection || isPlaying || isExporting) return null;
  const index = items.findIndex((item) => item.id === selection.id);
  if (index < 0) return null;
  const duration = Math.max(0, items[index].duration);
  return {
    id: selection.id,
    index,
    localTime: selection.endpoint === 'start' ? 0 : Math.max(0, duration - 0.001),
    scaleTime: selection.endpoint === 'start' ? 0 : duration,
  };
}

export function createMediaZoomHoldPatch(source: MediaZoomSource, localTimeSec = source.duration ?? 0) {
  const scale = resolveMediaScaleFactor(source, localTimeSec);
  return createMediaZoomRangePatch(scale, scale);
}

export function normalizeMediaZoomDirection(value: unknown): MediaZoomDirection {
  return value === 'in' || value === 'out' ? value : 'none';
}

export function normalizeMediaZoomAmount(value: unknown): number {
  const amount = typeof value === 'number' ? value : DEFAULT_MEDIA_ZOOM_AMOUNT;
  if (!Number.isFinite(amount)) return DEFAULT_MEDIA_ZOOM_AMOUNT;
  return Math.min(MAX_MEDIA_ZOOM_AMOUNT, Math.max(MIN_MEDIA_ZOOM_AMOUNT, amount));
}

/**
 * 基礎拡大率に対するその時刻の倍率（従来の相対倍率APIとの互換用）。
 * 新しい実効端点で固定した場合は none でも 1 以外になり得る。
 */
export function resolveMediaZoomMultiplier(source: MediaZoomSource, localTimeSec: number): number {
  return resolveMediaScaleFactor(source, localTimeSec) / baseScale(source);
}

/** プレビュー・書き出し・継承・分割が使う実効倍率の単一ソース。 */
export function resolveMediaScaleFactor(source: MediaZoomSource, localTimeSec: number): number {
  const { start, end } = resolveMediaZoomRange(source);
  const duration = typeof source.duration === 'number' && Number.isFinite(source.duration)
    ? Math.max(0, source.duration)
    : 0;
  const localTime = typeof localTimeSec === 'number' && Number.isFinite(localTimeSec)
    ? localTimeSec
    : 0;
  const progress = duration <= 0 ? 0 : Math.min(1, Math.max(0, localTime / duration));
  return start + (end - start) * progress;
}
