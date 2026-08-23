/**
 * @file captionStyle.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description キャプションのサイズ・位置の解決純ロジック。
 * プリセット（小中大特大 / 上中下）に加え、一括設定のカスタム値
 * （fontSizeCustom / positionCustom）を解決する。
 * カスタム値の描画反映は standard フレーバーのエンジンのみが行う（iOS はプリセットで描画）。
 */
import type {
  Caption,
  CaptionPosition,
  CaptionSettings,
  CaptionSize,
  CaptionTextAlign,
} from '../types';

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

/** キャプション背景帯の不透明度（タイトル帯と同じ範囲） */
export const CAPTION_BACKGROUND_OPACITY_MIN = 0;
export const CAPTION_BACKGROUND_OPACITY_MAX = 1;
export const CAPTION_BACKGROUND_OPACITY_STEP = 0.05;

/** キャプション背景帯の角丸半径 px @1080p 基準 */
export const CAPTION_BACKGROUND_RADIUS_MIN = 0;
export const CAPTION_BACKGROUND_RADIUS_MAX = 80;
export const CAPTION_BACKGROUND_RADIUS_STEP = 1;

/**
 * 背景帯の余白（fontSize に対する比率）。
 * 縦はグリフ Canvas 自体に縁取り分の高さがあるため、タイトル帯（0.3）より狭くする。
 */
export const CAPTION_BACKGROUND_PADDING_X_RATIO = 0.45;
export const CAPTION_BACKGROUND_PADDING_Y_RATIO = 0.12;

/** 背景帯の既定（OFF・黒 45%） */
export const CAPTION_BACKGROUND_DEFAULT = {
  backgroundEnabled: false,
  backgroundColor: '#000000',
  backgroundOpacity: 0.45,
  backgroundRadius: 16,
} as const;

/** 旧保存データを含むキャプション文字揃えの既定 */
export const CAPTION_TEXT_ALIGN_DEFAULT: CaptionTextAlign = 'center';

/** 不正値・旧データの未設定値を中央揃えへ正規化する */
export function normalizeCaptionTextAlign(value: unknown): CaptionTextAlign {
  return value === 'left' || value === 'right' ? value : CAPTION_TEXT_ALIGN_DEFAULT;
}

/** 個別設定を優先して実効文字揃えを解決する */
export function resolveCaptionTextAlign(
  caption: Pick<Caption, 'overrideTextAlign'>,
  settings: Pick<CaptionSettings, 'textAlign'>,
): CaptionTextAlign {
  return normalizeCaptionTextAlign(caption.overrideTextAlign ?? settings.textAlign);
}

/**
 * 文字揃えを反映したグリフ Canvas の中心 X を返す。
 *
 * プリセット位置では、左揃え＝左余白、中央揃え＝画面中央、右揃え＝右余白を
 * 揃えの基準線にする。カスタム XY 使用時は指定 X を基準線として扱う。
 * グリフ Canvas 自体は常に中央原点で生成されるため、幅の半分を補正して配置する。
 */
export function resolveCaptionGlyphCenterX(
  caption: Pick<Caption, 'overridePosition' | 'overridePositionCustom' | 'overrideTextAlign'>,
  settings: Pick<CaptionSettings, 'positionCustom' | 'textAlign'>,
  layout: {
    canvasWidth: number;
    padding: number;
    positionAnchorX: number;
    glyphWidth: number;
    /** apple-safari のプリセット専用描画など、カスタム XY を使わない経路は false */
    useCustomPosition?: boolean;
  },
): number {
  const textAlign = resolveCaptionTextAlign(caption, settings);
  const glyphWidth = Number.isFinite(layout.glyphWidth) ? Math.max(0, layout.glyphWidth) : 0;
  const padding = Number.isFinite(layout.padding) ? Math.max(0, layout.padding) : 0;
  const usesCustomPosition = layout.useCustomPosition !== false && Boolean(
    caption.overridePositionCustom
    || (!caption.overridePosition && settings.positionCustom),
  );
  const alignmentAnchorX = usesCustomPosition
    ? layout.positionAnchorX
    : textAlign === 'left'
      ? padding
      : textAlign === 'right'
        ? layout.canvasWidth - padding
        : layout.canvasWidth / 2;

  if (textAlign === 'left') return alignmentAnchorX + glyphWidth / 2;
  if (textAlign === 'right') return alignmentAnchorX - glyphWidth / 2;
  return alignmentAnchorX;
}

/** カスタム位置の既定値（% / テキスト中心）。横画面の下部プリセット相当 */
export const CAPTION_POSITION_CUSTOM_DEFAULT = { x: 50, y: 85 };

/**
 * 縦画面（9:16）時の下部プリセット Y 位置（%・テキスト中心）。
 * 横画面の端寄り配置より上に置き、スマホ UI やセーフエリアで字幕が見づらくならないようにする。
 */
export const CAPTION_PORTRAIT_BOTTOM_Y_PERCENT = 80;

/**
 * 縦画面（9:16）時の上部プリセット Y 位置（%・テキスト中心）。
 * 端へ詰めすぎず、下部プリセットほど大きな余白にはならない位置へ置く。
 */
export const CAPTION_PORTRAIT_TOP_Y_PERCENT = 10;

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

export function clampCaptionBackgroundOpacity(value: number): number {
  if (!Number.isFinite(value)) return CAPTION_BACKGROUND_DEFAULT.backgroundOpacity;
  const clamped = Math.max(
    CAPTION_BACKGROUND_OPACITY_MIN,
    Math.min(CAPTION_BACKGROUND_OPACITY_MAX, value),
  );
  return (
    Math.round(clamped / CAPTION_BACKGROUND_OPACITY_STEP) * CAPTION_BACKGROUND_OPACITY_STEP
  );
}

export function clampCaptionBackgroundRadius(value: number): number {
  if (!Number.isFinite(value)) return CAPTION_BACKGROUND_DEFAULT.backgroundRadius;
  const clamped = Math.max(
    CAPTION_BACKGROUND_RADIUS_MIN,
    Math.min(CAPTION_BACKGROUND_RADIUS_MAX, value),
  );
  return (
    Math.round(clamped / CAPTION_BACKGROUND_RADIUS_STEP) * CAPTION_BACKGROUND_RADIUS_STEP
  );
}

/**
 * キャプション文字の背後に背景帯を描く（preview / export 共通）。
 * 文字グリフの実寸 + 余白で帯サイズを決め、文字をカバーする。
 * @returns 描画したら true
 */
export function drawCaptionBackgroundBand(
  ctx: CanvasRenderingContext2D,
  options: {
    centerX: number;
    centerY: number;
    glyphWidth: number;
    glyphHeight: number;
    /** スケール済みフォントサイズ（余白計算用） */
    fontSize: number;
    /** キャプション全体のフェード α */
    fadeAlpha: number;
    backgroundEnabled: boolean;
    backgroundColor: string;
    backgroundOpacity: number;
    /** @1080p 基準の角丸。layoutScale でキャンバス寸法へ換算する */
    backgroundRadius: number;
    layoutScale: number;
  },
): boolean {
  const {
    centerX,
    centerY,
    glyphWidth,
    glyphHeight,
    fontSize,
    fadeAlpha,
    backgroundEnabled,
    backgroundColor,
    backgroundOpacity: rawOpacity,
    backgroundRadius: rawRadius,
    layoutScale,
  } = options;

  const backgroundOpacity = clampCaptionBackgroundOpacity(rawOpacity);
  if (!backgroundEnabled || backgroundOpacity <= 0 || fadeAlpha <= 0) {
    return false;
  }
  if (glyphWidth <= 0 || glyphHeight <= 0 || fontSize <= 0) {
    return false;
  }

  const boxWidth = glyphWidth + fontSize * CAPTION_BACKGROUND_PADDING_X_RATIO * 2;
  const boxHeight = glyphHeight + fontSize * CAPTION_BACKGROUND_PADDING_Y_RATIO * 2;
  const boxX = centerX - boxWidth / 2;
  const boxY = centerY - boxHeight / 2;
  const radius = Math.min(
    clampCaptionBackgroundRadius(rawRadius) * Math.max(0.1, layoutScale),
    boxWidth / 2,
    boxHeight / 2,
  );

  const prevAlpha = ctx.globalAlpha;
  const prevFilter = ctx.filter;
  ctx.filter = 'none';
  ctx.globalAlpha = fadeAlpha * backgroundOpacity;
  ctx.fillStyle = backgroundColor || CAPTION_BACKGROUND_DEFAULT.backgroundColor;
  if (radius > 0 && typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, radius);
    ctx.fill();
  } else {
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
  }
  ctx.globalAlpha = prevAlpha;
  ctx.filter = prevFilter;
  return true;
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

/**
 * 背景帯の実効値を解決する。
 * 優先度: 個別 override > 一括 CaptionSettings（未設定の項目だけ継承）。
 */
export function resolveCaptionBackgroundStyle(
  caption: Pick<
    Caption,
    | 'overrideBackgroundEnabled'
    | 'overrideBackgroundColor'
    | 'overrideBackgroundOpacity'
    | 'overrideBackgroundRadius'
  >,
  settings: Pick<
    CaptionSettings,
    'backgroundEnabled' | 'backgroundColor' | 'backgroundOpacity' | 'backgroundRadius'
  >,
): {
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundRadius: number;
} {
  return {
    backgroundEnabled: caption.overrideBackgroundEnabled ?? settings.backgroundEnabled,
    backgroundColor:
      caption.overrideBackgroundColor
      || settings.backgroundColor
      || CAPTION_BACKGROUND_DEFAULT.backgroundColor,
    backgroundOpacity: clampCaptionBackgroundOpacity(
      caption.overrideBackgroundOpacity ?? settings.backgroundOpacity,
    ),
    backgroundRadius: clampCaptionBackgroundRadius(
      caption.overrideBackgroundRadius ?? settings.backgroundRadius,
    ),
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
/**
 * プリセット位置（上部/中央/下部）を、カスタム位置と同じ「左上原点 %」へ変換する。
 *
 * プリセットからカスタムへ切り替えたときに、**見た目を保ったまま**微調整を始められるようにする。
 * （従来はカスタムへ切り替えると既定の中央 50/50 へ飛んでいた）
 * 実際の描画位置は `resolveCaptionAnchor` が単一ソースなので、そこへ委譲して % 化する。
 */
export function resolveCaptionPresetAsCustomPercent(
  position: CaptionPosition,
  layout: {
    canvasWidth: number;
    canvasHeight: number;
    fontSize: number;
    padding: number;
  },
): { x: number; y: number } {
  const anchor = resolveCaptionAnchor(
    { overridePosition: position, overridePositionCustom: undefined },
    { position, positionCustom: undefined },
    layout,
  );
  const { canvasWidth, canvasHeight } = layout;
  return {
    x: clampPositionPercent(canvasWidth > 0 ? (anchor.x / canvasWidth) * 100 : 50),
    y: clampPositionPercent(canvasHeight > 0 ? (anchor.y / canvasHeight) * 100 : 50),
  };
}

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
  return {
    x,
    y: resolveCaptionPresetY(position, { canvasWidth, canvasHeight, fontSize, padding }),
  };
}

/**
 * 上部／中央／下部プリセットのテキスト中心 Y 座標を解決する。
 * standard と apple-safari の描画経路で同じ位置を使うための単一ソース。
 */
export function resolveCaptionPresetY(
  position: CaptionPosition,
  layout: {
    canvasWidth: number;
    canvasHeight: number;
    fontSize: number;
    padding: number;
  },
): number {
  const { canvasWidth, canvasHeight, fontSize, padding } = layout;
  if (position === 'top') {
    if (isPortraitCanvas(canvasWidth, canvasHeight)) {
      return (canvasHeight * CAPTION_PORTRAIT_TOP_Y_PERCENT) / 100;
    }
    return padding + fontSize / 2;
  }
  if (position === 'center') {
    return canvasHeight / 2;
  }
  // 縦画面は端寄りだと字幕が下すぎて見づらいため、既定をやや上へ寄せる
  if (isPortraitCanvas(canvasWidth, canvasHeight)) {
    return (canvasHeight * CAPTION_PORTRAIT_BOTTOM_Y_PERCENT) / 100;
  }
  return canvasHeight - padding - fontSize / 2;
}
