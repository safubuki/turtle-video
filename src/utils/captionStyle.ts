/**
 * @file captionStyle.ts
 * @author Turtle Village
 * @description キャプションのサイズ・位置の解決純ロジック。
 * プリセット（小中大特大 / 上中下）に加え、一括設定のカスタム値
 * （fontSizeCustom / positionCustom）を解決する。
 * カスタム値の描画反映は standard フレーバーのエンジンのみが行う（iOS はプリセットで描画）。
 */
import type { Caption, CaptionSettings, CaptionSize } from '../types';

/** 1080p 基準のプリセットサイズ（px）。各段階 ~1.4 倍の読みやすさ重視スケール */
export const CAPTION_FONT_SIZE_PRESETS: Record<CaptionSize, number> = {
  small: 56,
  medium: 80,
  large: 112,
  xlarge: 148,
};

/** カスタムサイズの可変範囲（px @1080p 基準） */
export const CAPTION_FONT_SIZE_CUSTOM_MIN = 24;
export const CAPTION_FONT_SIZE_CUSTOM_MAX = 240;

/** キャプション縁幅の可変範囲（px @1080p 基準） */
export const CAPTION_STROKE_WIDTH_MIN = 0;
export const CAPTION_STROKE_WIDTH_MAX = 20;
export const CAPTION_STROKE_WIDTH_STEP = 0.5;
export const CAPTION_BLUR_MIN = 0;
export const CAPTION_BLUR_MAX = 5;
export const CAPTION_BLUR_STEP = 0.1;

/** カスタム位置の既定値（% / テキスト中心）。横画面の下部プリセット相当 */
export const CAPTION_POSITION_CUSTOM_DEFAULT = { x: 50, y: 85 };

/**
 * 縦画面（9:16）時の下部プリセット Y 位置（%・テキスト中心）。
 * 横画面の端寄り配置より上に置き、スマホ UI やセーフエリアで字幕が見づらくならないようにする。
 */
export const CAPTION_PORTRAIT_BOTTOM_Y_PERCENT = 80;

/** 縦画面時のカスタム位置既定値（% / テキスト中心） */
export const CAPTION_POSITION_CUSTOM_DEFAULT_PORTRAIT = {
  x: 50,
  y: CAPTION_PORTRAIT_BOTTOM_Y_PERCENT,
};

/**
 * キャプション／タイトルのレイアウト基準（px）。
 * 短辺を 1080 とみなしてスケールする（横 16:9 / 縦 9:16 で文字の見た目比率を揃える）。
 * 高さだけを基準にすると縦画面で文字が約 1.78 倍になりすぎる。
 */
export const CAPTION_REFERENCE_SIZE = 1080;

/**
 * キャンバス寸法からレイアウトスケールを求める。
 * 短辺 / 1080。プレビュー 720p と export 1080p の WYSIWYG を保ちつつ、
 * 縦画面でも横画面と同程度の文字サイズになる。
 */
export function resolveCaptionLayoutScale(canvasWidth: number, canvasHeight: number): number {
  const shortSide = Math.min(
    Number.isFinite(canvasWidth) ? canvasWidth : 0,
    Number.isFinite(canvasHeight) ? canvasHeight : 0,
  );
  return Math.max(0.1, shortSide / CAPTION_REFERENCE_SIZE);
}

/** キャンバスが縦長（9:16 等）かどうか */
export function isPortraitCanvas(canvasWidth: number, canvasHeight: number): boolean {
  return Number.isFinite(canvasWidth) && Number.isFinite(canvasHeight) && canvasHeight > canvasWidth;
}

export function clampCustomFontSize(value: number): number {
  if (!Number.isFinite(value)) return CAPTION_FONT_SIZE_PRESETS.medium;
  return Math.max(CAPTION_FONT_SIZE_CUSTOM_MIN, Math.min(CAPTION_FONT_SIZE_CUSTOM_MAX, value));
}

export function clampCaptionStrokeWidth(value: number): number {
  if (!Number.isFinite(value)) return 2;
  const clamped = Math.max(CAPTION_STROKE_WIDTH_MIN, Math.min(CAPTION_STROKE_WIDTH_MAX, value));
  return Math.round(clamped / CAPTION_STROKE_WIDTH_STEP) * CAPTION_STROKE_WIDTH_STEP;
}

export function clampCaptionBlur(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(CAPTION_BLUR_MIN, Math.min(CAPTION_BLUR_MAX, value));
  return Math.round(clamped / CAPTION_BLUR_STEP) * CAPTION_BLUR_STEP;
}

export function resolveCaptionGlyphStyle(
  caption: Pick<Caption, 'overrideFontColor' | 'overrideStrokeColor' | 'overrideStrokeWidth' | 'overrideBlur'>,
  settings: Pick<CaptionSettings, 'fontColor' | 'strokeColor' | 'strokeWidth' | 'blur'>,
): { fontColor: string; strokeColor: string; strokeWidth: number; blur: number } {
  return {
    fontColor: caption.overrideFontColor ?? settings.fontColor,
    strokeColor: caption.overrideStrokeColor ?? settings.strokeColor,
    strokeWidth: clampCaptionStrokeWidth(caption.overrideStrokeWidth ?? settings.strokeWidth),
    blur: clampCaptionBlur(caption.overrideBlur ?? settings.blur),
  };
}

export function clampPositionPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, value));
}

/**
 * ベースフォントサイズ（px @1080p 基準）を解決する。
 * 優先度: 個別カスタム値 > 個別 override（プリセット）> 一括カスタム値 > 一括プリセット
 */
export function resolveCaptionBaseFontSize(
  caption: Pick<Caption, 'overrideFontSize' | 'overrideFontSizeCustom'>,
  settings: Pick<CaptionSettings, 'fontSize' | 'fontSizeCustom'>,
): number {
  if (caption.overrideFontSizeCustom != null) {
    return clampCustomFontSize(caption.overrideFontSizeCustom);
  }
  if (caption.overrideFontSize) {
    return CAPTION_FONT_SIZE_PRESETS[caption.overrideFontSize];
  }
  if (settings.fontSizeCustom != null) {
    return clampCustomFontSize(settings.fontSizeCustom);
  }
  return CAPTION_FONT_SIZE_PRESETS[settings.fontSize] ?? CAPTION_FONT_SIZE_PRESETS.medium;
}

/**
 * テキスト中心のアンカー座標を解決する。
 * 優先度: 個別カスタム XY > 個別 override（プリセット）> 一括カスタム XY > 一括プリセット
 */
export function resolveCaptionAnchor(
  caption: Pick<Caption, 'overridePosition' | 'overridePositionCustom'>,
  settings: Pick<CaptionSettings, 'position' | 'positionCustom'>,
  layout: {
    canvasWidth: number;
    canvasHeight: number;
    fontSize: number;
    padding: number;
  },
): { x: number; y: number } {
  const { canvasWidth, canvasHeight, fontSize, padding } = layout;

  if (caption.overridePositionCustom) {
    return {
      x: (canvasWidth * clampPositionPercent(caption.overridePositionCustom.x)) / 100,
      y: (canvasHeight * clampPositionPercent(caption.overridePositionCustom.y)) / 100,
    };
  }

  if (!caption.overridePosition && settings.positionCustom) {
    return {
      x: (canvasWidth * clampPositionPercent(settings.positionCustom.x)) / 100,
      y: (canvasHeight * clampPositionPercent(settings.positionCustom.y)) / 100,
    };
  }

  const position = caption.overridePosition ?? settings.position;
  const x = canvasWidth / 2;
  if (position === 'top') {
    return { x, y: padding + fontSize / 2 };
  }
  if (position === 'center') {
    return { x, y: canvasHeight / 2 };
  }
  // 縦画面は端寄りだと字幕が下すぎて見づらいため、既定をやや上へ寄せる
  if (isPortraitCanvas(canvasWidth, canvasHeight)) {
    return { x, y: (canvasHeight * CAPTION_PORTRAIT_BOTTOM_Y_PERCENT) / 100 };
  }
  return { x, y: canvasHeight - padding - fontSize / 2 };
}
