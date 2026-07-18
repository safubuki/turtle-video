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

/** カスタム位置の既定値（% / テキスト中心）。下部プリセット相当 */
export const CAPTION_POSITION_CUSTOM_DEFAULT = { x: 50, y: 85 };

export function clampCustomFontSize(value: number): number {
  if (!Number.isFinite(value)) return CAPTION_FONT_SIZE_PRESETS.medium;
  return Math.max(CAPTION_FONT_SIZE_CUSTOM_MIN, Math.min(CAPTION_FONT_SIZE_CUSTOM_MAX, value));
}

export function clampPositionPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, value));
}

/**
 * ベースフォントサイズ（px @1080p 基準）を解決する。
 * 優先度: 個別 override（プリセット）> 一括カスタム値 > 一括プリセット
 */
export function resolveCaptionBaseFontSize(
  caption: Pick<Caption, 'overrideFontSize'>,
  settings: Pick<CaptionSettings, 'fontSize' | 'fontSizeCustom'>,
): number {
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
 * 優先度: 個別 override（プリセット）> 一括カスタム XY > 一括プリセット
 */
export function resolveCaptionAnchor(
  caption: Pick<Caption, 'overridePosition'>,
  settings: Pick<CaptionSettings, 'position' | 'positionCustom'>,
  layout: {
    canvasWidth: number;
    canvasHeight: number;
    fontSize: number;
    padding: number;
  },
): { x: number; y: number } {
  const { canvasWidth, canvasHeight, fontSize, padding } = layout;

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
  return { x, y: canvasHeight - padding - fontSize / 2 };
}
