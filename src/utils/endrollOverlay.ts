/**
 * @file endrollOverlay.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description クリップ再生後に続けて表示するエンドロールの正規化・尺計算・描画。
 * ウォーターマークと違いタイムラインを延長するため、尺計算まわりが本体。
 * ロゴの合成自体は watermarkOverlay.ts の共通コアへ委譲し、見た目を完全に一致させる。
 */
import type { EndrollBackgroundMode, EndrollOverlay } from '../types';
import {
  WATERMARK_FADE_DURATION_MAX,
  WATERMARK_FADE_DURATION_MIN,
  WATERMARK_FEATHER_MAX,
  WATERMARK_FEATHER_MIN,
  WATERMARK_MASK_SIZE_MAX,
  WATERMARK_MASK_SIZE_MIN,
  WATERMARK_OPACITY_MAX,
  WATERMARK_OPACITY_MIN,
  WATERMARK_POSITION_MAX,
  WATERMARK_POSITION_MIN,
  WATERMARK_ROTATION_MAX,
  WATERMARK_ROTATION_MIN,
  WATERMARK_SIZE_MAX,
  WATERMARK_SIZE_MIN,
  drawLogoImageFrame,
  normalizeWatermarkMask,
} from './watermarkOverlay';

export const ENDROLL_DURATION_MIN_SEC = 0.5;
export const ENDROLL_DURATION_MAX_SEC = 30;
export const ENDROLL_DEFAULT_DURATION_SEC = 5;
/** 背景色の既定（黒）。custom 未設定時のフォールバックにも使う */
export const ENDROLL_DEFAULT_CUSTOM_COLOR = '#000000';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_ENDROLL_OVERLAY: EndrollOverlay = {
  file: null,
  url: null,
  enabled: false,
  durationSec: ENDROLL_DEFAULT_DURATION_SEC,
  backgroundMode: 'black',
  backgroundColor: ENDROLL_DEFAULT_CUSTOM_COLOR,
  bgmFadeOut: false,
  positionX: 50,
  positionY: 50,
  size: 1,
  opacity: 1,
  rotation: 0,
  mask: 'rectangle',
  maskSize: 100,
  feather: 0,
  fadeIn: false,
  fadeOut: false,
  fadeInDuration: 1.0,
  fadeOutDuration: 1.0,
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeEndrollBackgroundMode(value: unknown): EndrollBackgroundMode {
  return value === 'white' || value === 'custom' ? value : 'black';
}

function normalizeHexColor(value: unknown): string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value)
    ? value.toLowerCase()
    : ENDROLL_DEFAULT_CUSTOM_COLOR;
}

/**
 * 保存データ・不正値をエンドロール設定へ正規化する。
 * 旧バージョンのプロジェクト（endroll 自体が無い）は既定値（無効・5秒・黒）になる。
 */
export function normalizeEndrollOverlay(
  value: Partial<EndrollOverlay> | null | undefined,
): EndrollOverlay {
  const source = value ?? {};
  return {
    file: source.file instanceof File ? source.file : null,
    url: typeof source.url === 'string' && source.url ? source.url : null,
    // ウォーターマークと違い既定は OFF（勝手に尺が伸びないようにする）
    enabled: source.enabled === true,
    durationSec: clamp(
      source.durationSec,
      ENDROLL_DURATION_MIN_SEC,
      ENDROLL_DURATION_MAX_SEC,
      DEFAULT_ENDROLL_OVERLAY.durationSec,
    ),
    backgroundMode: normalizeEndrollBackgroundMode(source.backgroundMode),
    backgroundColor: normalizeHexColor(source.backgroundColor),
    bgmFadeOut: source.bgmFadeOut === true,
    positionX: clamp(
      source.positionX,
      WATERMARK_POSITION_MIN,
      WATERMARK_POSITION_MAX,
      DEFAULT_ENDROLL_OVERLAY.positionX,
    ),
    positionY: clamp(
      source.positionY,
      WATERMARK_POSITION_MIN,
      WATERMARK_POSITION_MAX,
      DEFAULT_ENDROLL_OVERLAY.positionY,
    ),
    size: clamp(source.size, WATERMARK_SIZE_MIN, WATERMARK_SIZE_MAX, DEFAULT_ENDROLL_OVERLAY.size),
    opacity: clamp(
      source.opacity,
      WATERMARK_OPACITY_MIN,
      WATERMARK_OPACITY_MAX,
      DEFAULT_ENDROLL_OVERLAY.opacity,
    ),
    rotation: clamp(
      source.rotation,
      WATERMARK_ROTATION_MIN,
      WATERMARK_ROTATION_MAX,
      DEFAULT_ENDROLL_OVERLAY.rotation,
    ),
    mask: normalizeWatermarkMask(source.mask),
    maskSize: clamp(
      source.maskSize,
      WATERMARK_MASK_SIZE_MIN,
      WATERMARK_MASK_SIZE_MAX,
      DEFAULT_ENDROLL_OVERLAY.maskSize,
    ),
    feather: clamp(
      source.feather,
      WATERMARK_FEATHER_MIN,
      WATERMARK_FEATHER_MAX,
      DEFAULT_ENDROLL_OVERLAY.feather,
    ),
    fadeIn: source.fadeIn === true,
    fadeOut: source.fadeOut === true,
    fadeInDuration: clamp(
      source.fadeInDuration,
      WATERMARK_FADE_DURATION_MIN,
      WATERMARK_FADE_DURATION_MAX,
      DEFAULT_ENDROLL_OVERLAY.fadeInDuration,
    ),
    fadeOutDuration: clamp(
      source.fadeOutDuration,
      WATERMARK_FADE_DURATION_MIN,
      WATERMARK_FADE_DURATION_MAX,
      DEFAULT_ENDROLL_OVERLAY.fadeOutDuration,
    ),
  };
}

/**
 * タイムラインが伸びる秒数を返す。
 *
 * **本機能の心臓部**。ここが 0 を返す限り totalDuration は従来と完全に一致し、
 * 既存の挙動は 1 ビットも変わらない。
 * 無効時に加え、画像が無いときも 0 とする（何も映らない黒画面だけが伸びるのを防ぐ）。
 */
export function getEndrollDuration(endroll: EndrollOverlay | null | undefined): number {
  if (!endroll?.enabled) return 0;
  if (!endroll.url) return 0;
  const duration = Number(endroll.durationSec);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(ENDROLL_DURATION_MAX_SEC, Math.max(ENDROLL_DURATION_MIN_SEC, duration));
}

/** エンドロールが実際にタイムラインを延長するか */
export function isEndrollActive(endroll: EndrollOverlay | null | undefined): boolean {
  return getEndrollDuration(endroll) > 0;
}

/** 指定時刻がエンドロール区間かどうか（clipsDuration 以降） */
export function isEndrollTime(
  endroll: EndrollOverlay | null | undefined,
  clipsDuration: number,
  timeSec: number,
): boolean {
  const duration = getEndrollDuration(endroll);
  if (duration <= 0) return false;
  return timeSec >= clipsDuration && timeSec < clipsDuration + duration;
}

export function resolveEndrollBackgroundColor(endroll: EndrollOverlay): string {
  if (endroll.backgroundMode === 'white') return '#ffffff';
  if (endroll.backgroundMode === 'custom') return normalizeHexColor(endroll.backgroundColor);
  return '#000000';
}

/**
 * エンドロール区間のローカル時刻からロゴのフェード係数（0〜1）を返す。
 * 区間 = エンドロール全体なので、先頭からフェードイン・末尾へフェードアウトする。
 * イン＋アウトが区間より長いときは按分する（ウォーターマークと同じ規約）。
 */
export function calculateEndrollFadeAlpha(
  endroll: Pick<EndrollOverlay, 'fadeIn' | 'fadeOut' | 'fadeInDuration' | 'fadeOutDuration'>,
  durationSec: number,
  localTimeSec: number,
): number {
  if (durationSec <= 0) return 1;

  let fadeInDur = endroll.fadeIn ? endroll.fadeInDuration : 0;
  let fadeOutDur = endroll.fadeOut ? endroll.fadeOutDuration : 0;
  if (fadeInDur + fadeOutDur > durationSec) {
    const ratio = durationSec / (fadeInDur + fadeOutDur);
    fadeInDur *= ratio;
    fadeOutDur *= ratio;
  }

  let alpha = 1;
  if (fadeInDur > 0 && localTimeSec < fadeInDur) {
    alpha = localTimeSec / fadeInDur;
  } else if (fadeOutDur > 0 && localTimeSec > durationSec - fadeOutDur) {
    alpha = (durationSec - localTimeSec) / fadeOutDur;
  }
  return Math.max(0, Math.min(1, alpha));
}

/**
 * エンドロール区間の BGM フェードアウト係数（0〜1）を返す。
 *
 * 「エンドロール中に徐々に消す」ためのオプションで、既存の末尾フェードアウト
 * （0.5/1/2 秒）とは独立。clipsDuration から totalDuration にかけて線形に 0 へ落とす。
 * 呼び出し側で既存フェードと **小さい方を採用** して合成する。
 */
export function resolveBgmEndrollFadeGain(params: {
  endroll: EndrollOverlay | null | undefined;
  clipsDuration: number;
  timeSec: number;
}): number {
  const { endroll, clipsDuration, timeSec } = params;
  if (!endroll?.bgmFadeOut) return 1;
  const duration = getEndrollDuration(endroll);
  if (duration <= 0) return 1;
  if (timeSec <= clipsDuration) return 1;

  const elapsed = timeSec - clipsDuration;
  if (elapsed >= duration) return 0;
  return Math.max(0, Math.min(1, 1 - elapsed / duration));
}

export function shouldDrawEndrollLogo(
  endroll: EndrollOverlay | null | undefined,
  image: HTMLImageElement | null | undefined,
): boolean {
  return Boolean(
    endroll
    && getEndrollDuration(endroll) > 0
    && image
    && image.complete
    && image.naturalWidth > 0
    && image.naturalHeight > 0,
  );
}

/**
 * エンドロールの 1 フレーム（背景 + ロゴ）を描く。
 *
 * preview / export で同じこの関数を使い、WYSIWYG を保証する。
 * 背景は必ず塗る（前フレームの映像が残らないようにする）。
 */
export function drawEndrollFrame(
  ctx: CanvasRenderingContext2D,
  endroll: EndrollOverlay | null | undefined,
  image: HTMLImageElement | null | undefined,
  localTimeSec: number,
): boolean {
  const duration = getEndrollDuration(endroll);
  if (!endroll || duration <= 0) return false;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = resolveEndrollBackgroundColor(endroll);
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();

  if (shouldDrawEndrollLogo(endroll, image) && image) {
    const alpha = calculateEndrollFadeAlpha(endroll, duration, localTimeSec);
    drawLogoImageFrame(ctx, endroll, image, alpha);
  }
  return true;
}
