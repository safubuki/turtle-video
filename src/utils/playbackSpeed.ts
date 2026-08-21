/**
 * @file playbackSpeed.ts
 * @description 動画カード再生速度（0.5〜8.0・0.1刻み）の正規化・タイムライン/ソース時刻変換・速度バッジ描画。
 * Docs/specs/2026-08-01_video-playback-speed.md
 */
import type { MediaItem, SpeedBadgeLabelStyle, VideoPlaybackSpeed } from '../types';

/** スライダーの下限（スロー）。0.1 は実用性が低いため 0.5 を下限にする */
export const MIN_VIDEO_PLAYBACK_SPEED = 0.5;
/** スライダーの上限（従来の 8x を維持） */
export const MAX_VIDEO_PLAYBACK_SPEED = 8;
/** スライダー / ステッパーの刻み */
export const VIDEO_PLAYBACK_SPEED_STEP = 0.1;

/** よく使う倍率のショートカット（スライダー本体とは別に任意で置く） */
export const VIDEO_PLAYBACK_SPEEDS: readonly VideoPlaybackSpeed[] = [0.5, 1, 2, 4, 8];

export const DEFAULT_VIDEO_PLAYBACK_SPEED: VideoPlaybackSpeed = 1;

/** バッジ文言の既定（日本語「N倍速」） */
export const DEFAULT_SPEED_BADGE_LABEL_STYLE: SpeedBadgeLabelStyle = 'ja';

/** 四隅プリセットの角からの余白（中心 %）。横・縦とも同じ距離 */
export const SPEED_BADGE_CORNER_INSET_PERCENT = 9;

/** バッジ既定位置（右上寄り・中心 %） */
export const DEFAULT_SPEED_BADGE_POSITION = {
  x: 100 - SPEED_BADGE_CORNER_INSET_PERCENT,
  y: SPEED_BADGE_CORNER_INSET_PERCENT,
} as const;

export type SpeedBadgePositionPreset =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToPlaybackSpeedStep(value: number): number {
  const stepped = Math.round(value / VIDEO_PLAYBACK_SPEED_STEP) * VIDEO_PLAYBACK_SPEED_STEP;
  return Number(stepped.toFixed(1));
}

/**
 * 未知値・旧データを 0.5〜8.0（0.1刻み）へ正規化する。
 * 旧プロジェクトの 1/2/4/8 はそのまま通る。0.5 未満は 0.5。不正値は 1。
 */
export function normalizeVideoPlaybackSpeed(value: unknown): VideoPlaybackSpeed {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_VIDEO_PLAYBACK_SPEED;
  return Math.min(
    MAX_VIDEO_PLAYBACK_SPEED,
    Math.max(MIN_VIDEO_PLAYBACK_SPEED, roundToPlaybackSpeedStep(n)),
  );
}

export function formatPlaybackSpeedValue(speed: unknown): string {
  const s = normalizeVideoPlaybackSpeed(speed);
  return Number.isInteger(s) ? String(s) : s.toFixed(1);
}

/**
 * 元動画上の有効尺（trim 後・速度適用前）。
 */
export function getVideoSourceClipDuration(item: {
  trimStart?: number;
  trimEnd?: number;
  originalDuration?: number;
}): number {
  const start = Number.isFinite(item.trimStart) ? Math.max(0, item.trimStart as number) : 0;
  let end = Number.isFinite(item.trimEnd) ? (item.trimEnd as number) : start;
  if (end <= start) {
    const original = Number.isFinite(item.originalDuration)
      ? Math.max(0, item.originalDuration as number)
      : 0;
    if (original > start) end = original;
  }
  return Math.max(0, end - start);
}

/**
 * ソース尺と速度からタイムライン尺を求める。
 */
export function computeTimelineDurationFromSource(
  sourceDuration: number,
  speed: unknown,
): number {
  const s = normalizeVideoPlaybackSpeed(speed);
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) return 0;
  return sourceDuration / s;
}

/**
 * 動画 MediaItem のタイムライン尺を trim と speed から再計算する。
 */
export function resolveVideoTimelineDuration(item: {
  type?: string;
  trimStart?: number;
  trimEnd?: number;
  originalDuration?: number;
  playbackSpeed?: unknown;
  duration?: number;
}): number {
  if (item.type === 'image') {
    return Number.isFinite(item.duration) ? Math.max(0, item.duration as number) : 0;
  }
  const source = getVideoSourceClipDuration(item);
  return computeTimelineDurationFromSource(source, item.playbackSpeed);
}

/**
 * タイムライン上の localTime → 元動画 currentTime。
 */
export function resolveVideoSourceTime(params: {
  trimStart?: number;
  localTime: number;
  playbackSpeed?: unknown;
}): number {
  const speed = normalizeVideoPlaybackSpeed(params.playbackSpeed);
  const trimStart = Number.isFinite(params.trimStart)
    ? Math.max(0, params.trimStart as number)
    : 0;
  const localTime = Number.isFinite(params.localTime) ? Math.max(0, params.localTime) : 0;
  return trimStart + localTime * speed;
}

/**
 * クリップ終端直前のソース時刻（ended や境界ガード用）。
 */
export function resolveVideoSafeEndSourceTime(params: {
  trimStart?: number;
  trimEnd?: number;
  timelineDuration?: number;
  playbackSpeed?: unknown;
  epsilon?: number;
}): number {
  const epsilon = Number.isFinite(params.epsilon) ? Math.max(0, params.epsilon as number) : 0.001;
  const trimStart = Number.isFinite(params.trimStart)
    ? Math.max(0, params.trimStart as number)
    : 0;
  if (Number.isFinite(params.trimEnd) && (params.trimEnd as number) > trimStart) {
    return Math.max(trimStart, (params.trimEnd as number) - epsilon);
  }
  const timelineDuration = Number.isFinite(params.timelineDuration)
    ? Math.max(0, params.timelineDuration as number)
    : 0;
  const speed = normalizeVideoPlaybackSpeed(params.playbackSpeed);
  return trimStart + Math.max(0, timelineDuration * speed - epsilon);
}

export function normalizeSpeedBadgePosition(
  x?: number,
  y?: number,
): { x: number; y: number } {
  return {
    x: clamp(
      Number.isFinite(x) ? (x as number) : DEFAULT_SPEED_BADGE_POSITION.x,
      0,
      100,
    ),
    y: clamp(
      Number.isFinite(y) ? (y as number) : DEFAULT_SPEED_BADGE_POSITION.y,
      0,
      100,
    ),
  };
}

export function resolveSpeedBadgePresetPosition(
  preset: SpeedBadgePositionPreset,
): { x: number; y: number } {
  const inset = SPEED_BADGE_CORNER_INSET_PERCENT;
  const left = inset;
  const right = 100 - inset;
  const top = inset;
  const bottom = 100 - inset;
  switch (preset) {
    case 'top-left':
      return { x: left, y: top };
    case 'bottom-left':
      return { x: left, y: bottom };
    case 'bottom-right':
      return { x: right, y: bottom };
    case 'top-right':
    default:
      return { x: right, y: top };
  }
}

export function normalizeSpeedBadgeLabelStyle(value: unknown): SpeedBadgeLabelStyle {
  return value === 'en' ? 'en' : DEFAULT_SPEED_BADGE_LABEL_STYLE;
}

/**
 * バッジ表示文言。既定は日本語（例: » 2倍速）。英語は » 2x。
 */
export function formatSpeedBadgeLabel(
  speed: unknown,
  labelStyle?: unknown,
): string {
  const shown = formatPlaybackSpeedValue(speed);
  const style = normalizeSpeedBadgeLabelStyle(labelStyle);
  if (style === 'en') {
    return `\u00BB ${shown}x`;
  }
  return `\u00BB ${shown}倍速`;
}

/**
 * エクスポート時の動画同期しきい値（ソース時刻秒）。
 * 等倍: 基本しきい値。
 * 倍速: プレビューは rate 連続、export は 1x 連続 + 壁時計 dilation のため、
 * いずれも過剰な correction seek を避ける緩めしきい値。
 */
export function resolveSpeedAwareVideoSyncThresholdSec(
  baseThresholdSec: number,
  playbackSpeed: unknown,
): number {
  const base = Number.isFinite(baseThresholdSec) && baseThresholdSec > 0
    ? baseThresholdSec
    : 0.5;
  const speed = normalizeVideoPlaybackSpeed(playbackSpeed);
  if (speed <= 1) return base;
  // プレビュー連続再生用: 2x なら 0.5→1.0 程度まで緩める
  return Math.max(base, base * speed * 0.75);
}

/**
 * export 壁時計 1 秒あたり、タイムラインを 1/divisor 秒進める。
 * 倍速（speed>1）では divisor=speed（映像は 1x 連続再生し、タイムラインだけ縮める）。
 * スロー（speed<1）・画像・等倍は 1（スローは playbackRate=speed で壁時計=タイムライン）。
 *
 * 採用しない方式:
 * - 倍速で playbackRate=speed の連続再生: デコード遅れでソース終端まで届かず途中切れ
 * - paused + 毎フレーム seek: 連続 seek で静止画化（export-video-backpressure-postmortem）
 * - スローで壁時計 dilation: タイムラインが壁より速く進み、出力フレームが不足する
 */
export function resolveExportTimelineWallDivisorForItem(
  item: { type?: string; playbackSpeed?: unknown } | null | undefined,
): number {
  if (!item || item.type === 'image') return 1;
  const speed = normalizeVideoPlaybackSpeed(item.playbackSpeed);
  return speed > 1 ? speed : 1;
}

/**
 * 壁時計差分を export タイムライン進行に変換する。
 * timelineDelta = wallDelta / divisor
 */
export function wallDeltaToExportTimelineDelta(
  wallDeltaSec: number,
  wallDivisor: number,
): number {
  const divisor = Number.isFinite(wallDivisor) && wallDivisor > 0 ? wallDivisor : 1;
  const wall = Number.isFinite(wallDeltaSec) ? Math.max(0, wallDeltaSec) : 0;
  return wall / divisor;
}

/**
 * `<video>.playbackRate` に渡す値。
 * - preview: 設定速度
 * - export の倍速（>1）: 常に 1（壁時計 dilation と対）
 * - export のスロー（<1）: 設定速度（デコーダに余裕があるので native slow が安全）
 */
export function resolveVideoElementPlaybackRateForContext(
  isExporting: boolean,
  playbackSpeed: unknown,
): VideoPlaybackSpeed {
  const speed = normalizeVideoPlaybackSpeed(playbackSpeed);
  if (isExporting && speed > 1) return DEFAULT_VIDEO_PLAYBACK_SPEED;
  return speed;
}

export function shouldDrawSpeedBadge(
  item: Pick<MediaItem, 'type' | 'playbackSpeed' | 'showSpeedBadge'> | null | undefined,
): boolean {
  if (!item || item.type !== 'video') return false;
  if (!item.showSpeedBadge) return false;
  return Math.abs(normalizeVideoPlaybackSpeed(item.playbackSpeed) - 1) >= VIDEO_PLAYBACK_SPEED_STEP / 2;
}

/**
 * アクティブ動画クリップの倍速バッジを Canvas に描画する。
 * @returns 描画したら true
 */
export function drawSpeedBadgeFrame(
  ctx: CanvasRenderingContext2D,
  item: Pick<
    MediaItem,
    | 'type'
    | 'playbackSpeed'
    | 'showSpeedBadge'
    | 'speedBadgeLabelStyle'
    | 'speedBadgePositionX'
    | 'speedBadgePositionY'
  > | null | undefined,
): boolean {
  if (!shouldDrawSpeedBadge(item) || !item) return false;
  const speed = normalizeVideoPlaybackSpeed(item.playbackSpeed);
  const pos = normalizeSpeedBadgePosition(item.speedBadgePositionX, item.speedBadgePositionY);
  const canvasW = ctx.canvas.width;
  const canvasH = ctx.canvas.height;
  if (canvasW <= 0 || canvasH <= 0) return false;

  const shortSide = Math.min(canvasW, canvasH);
  const fontSize = Math.max(14, Math.round(shortSide * 0.045));
  const padX = Math.max(8, Math.round(fontSize * 0.55));
  const padY = Math.max(5, Math.round(fontSize * 0.35));
  const label = formatSpeedBadgeLabel(speed, item.speedBadgeLabelStyle);

  ctx.save();
  ctx.font = `600 ${fontSize}px system-ui, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(label);
  const textW = metrics.width;
  const boxW = textW + padX * 2;
  const boxH = fontSize + padY * 2;
  const cx = (canvasW * pos.x) / 100;
  const cy = (canvasH * pos.y) / 100;
  const left = cx - boxW / 2;
  const top = cy - boxH / 2;
  const radius = Math.min(boxH / 2, Math.max(6, fontSize * 0.35));

  // 背景ピル
  ctx.beginPath();
  const r = radius;
  const x = left;
  const y = top;
  const w = boxW;
  const h = boxH;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = Math.max(1, shortSide * 0.002);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillText(label, cx, cy + fontSize * 0.04);
  ctx.restore();
  return true;
}

/**
 * HTMLVideoElement の playbackRate を設定する。
 * - プレビュー: 設定速度で連続再生。preservesPitch で音程維持。
 * - エクスポートの倍速: 必ず 1（`resolveVideoElementPlaybackRateForContext` 経由）。
 *   倍速は壁時計 dilation でタイムラインを縮める。rate=speed は途中切れ、
 *   seek 駆動は静止画化するため使わない。
 * - エクスポートのスロー: 設定速度（native slow）。dilation するとフレーム不足になる。
 * 失敗しても再生継続できるよう例外は握りつぶす。
 */
export function applyVideoElementPlaybackRate(
  video: HTMLVideoElement | null | undefined,
  speed: unknown,
): void {
  if (!video) return;
  const rate = normalizeVideoPlaybackSpeed(speed);
  try {
    // プレビューは音程を保ったままテンポだけ変える（Chrome 既定も true だが明示）。
    const media = video as HTMLMediaElement & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };
    try {
      media.preservesPitch = true;
      if ('mozPreservesPitch' in media) media.mozPreservesPitch = true;
      if ('webkitPreservesPitch' in media) media.webkitPreservesPitch = true;
    } catch { /* ignore */ }
    if (Math.abs(video.playbackRate - rate) > 0.001) {
      video.playbackRate = rate;
    }
  } catch {
    // 一部環境で rate 設定が拒否されても致命ではない
  }
}
