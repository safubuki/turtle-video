/**
 * @file mediaMotion.ts
 * @description 「サイズ・位置・動き」欄の構図（サイズ＋横・縦）を、開始・終了の 2 点として扱う共通層。
 *
 * 保存形式・描画計算は既存のズーム（mediaZoom.ts: zoomStartScale/zoomEndScale）と
 * 移動（mediaPan.ts: positionX/Y と panEndPositionX/Y）のまま変えない。
 * UI は「どちらの時点を編集しているか」だけを持ち、サイズ・横・縦の 1 組のスライダーで
 * その時点を編集する。ここでは両者をまとめて読み書きする関数だけを提供する。
 */
import type { MediaItem } from '../types';
import {
  createMediaZoomRangePatch,
  resolveMediaScaleFactor,
  resolveMediaZoomRange,
  type MediaZoomSource,
} from './mediaZoom';
import {
  createMediaPanRangePatch,
  isMediaPanMoving,
  resolveMediaPanRange,
  resolveMediaPosition,
  type MediaPanSource,
} from './mediaPan';

/** ある時点の構図。scale は実効倍率（1.2 = 120%）、x/y は保存座標の px */
export interface MediaComposition {
  scale: number;
  x: number;
  y: number;
}

export type MediaMotionPoint = 'start' | 'end';

export type MediaMotionSource = MediaZoomSource & MediaPanSource;

const SCALE_EPSILON = 1e-9;

export function resolveMediaMotionRange(source: MediaMotionSource): { start: MediaComposition; end: MediaComposition } {
  const zoom = resolveMediaZoomRange(source);
  const pan = resolveMediaPanRange(source);
  return {
    start: { scale: zoom.start, x: pan.start.x, y: pan.start.y },
    end: { scale: zoom.end, x: pan.end.x, y: pan.end.y },
  };
}

/** サイズか位置のどちらかが開始と終了で違えば「動いている」 */
export function isMediaMotionActive(source: MediaMotionSource): boolean {
  const zoom = resolveMediaZoomRange(source);
  return Math.abs(zoom.end - zoom.start) > SCALE_EPSILON || isMediaPanMoving(source);
}

/** その時刻の構図（描画と同じ計算） */
export function resolveMediaComposition(source: MediaMotionSource, localTimeSec: number): MediaComposition {
  const position = resolveMediaPosition(source, localTimeSec);
  return { scale: resolveMediaScaleFactor(source, localTimeSec), x: position.x, y: position.y };
}

type MediaMotionPatch = ReturnType<typeof createMediaZoomRangePatch> & ReturnType<typeof createMediaPanRangePatch>;

/** 開始・終了の構図から、ズームと移動の保存値をまとめて作る（同じ値なら固定になる） */
export function createMediaMotionPatch(start: MediaComposition, end: MediaComposition): MediaMotionPatch {
  return {
    ...createMediaZoomRangePatch(start.scale, end.scale),
    ...createMediaPanRangePatch({ x: start.x, y: start.y }, { x: end.x, y: end.y }),
  };
}

/**
 * 指定した時点だけを変える。もう一方の時点は今の値をそのまま保つ
 * （固定中に開始を変えると終了は元の値のまま＝そこから動きが生まれる。動かす欄での編集用）。
 */
export function createMediaMotionPointPatch(
  source: MediaMotionSource,
  point: MediaMotionPoint,
  patch: Partial<MediaComposition>,
): MediaMotionPatch {
  const range = resolveMediaMotionRange(source);
  const next = { ...range[point], ...definedOnly(patch) };
  return point === 'start'
    ? createMediaMotionPatch(next, range.end)
    : createMediaMotionPatch(range.start, next);
}

/** 終了を指定の構図にする。null なら開始と同じにして動きを止める */
export function createMediaMotionEndPatch(
  source: MediaMotionSource,
  end: MediaComposition | null,
): MediaMotionPatch {
  const range = resolveMediaMotionRange(source);
  return createMediaMotionPatch(range.start, end ?? range.start);
}

/**
 * 前の素材の最後の構図を引き継ぐ。
 * このカードが動いていれば開始だけをそこへ合わせ（終了は保つ＝そこから動き続ける）、
 * 動いていなければ全体をその構図で固定する。
 */
export function createInheritCompositionPatch(
  source: MediaMotionSource,
  previousEnd: MediaComposition,
): MediaMotionPatch {
  if (isMediaMotionActive(source)) {
    return createMediaMotionPatch(previousEnd, resolveMediaMotionRange(source).end);
  }
  return createMediaMotionPatch(previousEnd, previousEnd);
}

/** サイズ 100%・中央・動きなし */
export function createDefaultCompositionPatch(): MediaMotionPatch {
  const origin = { scale: 1, x: 0, y: 0 };
  return createMediaMotionPatch(origin, origin);
}

/** 直前カードの最後の構図（引き継ぎボタンの表示用） */
export function resolvePreviousComposition(
  previous: Pick<MediaItem, 'duration'> & MediaMotionSource,
): MediaComposition {
  return resolveMediaComposition(previous, previous.duration);
}

function definedOnly(patch: Partial<MediaComposition>): Partial<MediaComposition> {
  const out: Partial<MediaComposition> = {};
  if (typeof patch.scale === 'number' && Number.isFinite(patch.scale)) out.scale = patch.scale;
  if (typeof patch.x === 'number' && Number.isFinite(patch.x)) out.x = patch.x;
  if (typeof patch.y === 'number' && Number.isFinite(patch.y)) out.y = patch.y;
  return out;
}
