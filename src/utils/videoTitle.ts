/**
 * @file videoTitle.ts
 * @author Turtle Village
 * @description 動画タイトル（Issue #211）の既定値・クランプ・表示判定・スタイル解決の純ロジック。
 *
 * タイトルは通常キャプション（Caption[]）とは別管理の 1 件だけの設定で、
 * キャプション一覧・時分割・まとめて入力・一括シフトの対象には含めない。
 *
 * 描画は preview / export 共通の renderFrame が行い、
 * サイズ・位置・フェードの解決はすべて本モジュールを単一ソースとする
 * （キャプション側の captionStyle.ts と同じ役割分担）。
 */
import type { CaptionPosition, VideoTitleSettings } from '../types';
import {
  CAPTION_FONT_SIZE_PRESETS,
  CAPTION_PORTRAIT_BOTTOM_Y_PERCENT,
  CAPTION_REFERENCE_SIZE,
  CAPTION_STROKE_WIDTH_MAX,
  CAPTION_STROKE_WIDTH_MIN,
  CAPTION_STROKE_WIDTH_STEP,
  clampCaptionBlur,
  clampCaptionStrokeWidth,
  clampCustomFontSize,
  clampPositionPercent,
  isPortraitCanvas,
  resolveCaptionLayoutScale,
} from './captionStyle';
import { resolveCaptionFontFamily } from './captionFontCatalog';
import { getOrCreateCaptionGlyphCanvas, normalizeCaptionGlyphPixelRatio } from './canvas';
import type { CaptionGlyphCanvasCache } from './canvas';

/**
 * タイトルの既定文字サイズプリセット。
 * 通常キャプションの既定（medium = 80px）より大きくするため xlarge（148px）を使う。
 */
export const VIDEO_TITLE_DEFAULT_FONT_SIZE_PRESET = 'xlarge' as const;
/** 既定の実サイズ（px @1080p 基準）。テスト・比較用 */
export const VIDEO_TITLE_DEFAULT_FONT_SIZE = CAPTION_FONT_SIZE_PRESETS.xlarge;

/**
 * タイトル縁幅の可変範囲（px @1080p 基準）。
 * キャプション（captionStyle.ts）と同じ範囲・刻みに揃える。
 */
export const VIDEO_TITLE_STROKE_WIDTH_MIN = CAPTION_STROKE_WIDTH_MIN;
export const VIDEO_TITLE_STROKE_WIDTH_MAX = CAPTION_STROKE_WIDTH_MAX;
export const VIDEO_TITLE_STROKE_WIDTH_STEP = CAPTION_STROKE_WIDTH_STEP;

/** 背景の帯の不透明度の範囲 */
export const VIDEO_TITLE_BACKGROUND_OPACITY_MIN = 0;
export const VIDEO_TITLE_BACKGROUND_OPACITY_MAX = 1;
export const VIDEO_TITLE_BACKGROUND_OPACITY_STEP = 0.05;

/** 背景の帯の角丸半径の範囲（px @1080p 基準） */
export const VIDEO_TITLE_BACKGROUND_RADIUS_MIN = 0;
export const VIDEO_TITLE_BACKGROUND_RADIUS_MAX = 80;
export const VIDEO_TITLE_BACKGROUND_RADIUS_STEP = 1;

/** 表示時間の既定（秒）。動画の頭 4 秒 */
export const VIDEO_TITLE_DEFAULT_START_TIME = 0;
export const VIDEO_TITLE_DEFAULT_END_TIME = 4;
/** 表示時間の最小長（秒）。開始/終了の逆転を防ぐ */
export const VIDEO_TITLE_MIN_DURATION_SEC = 0.1;

/** フェード時間の既定（秒）。開始フェードは既定 OFF、終了フェードは 1 秒で ON */
export const VIDEO_TITLE_DEFAULT_FADE_IN_DURATION = 0.5;
export const VIDEO_TITLE_DEFAULT_FADE_OUT_DURATION = 1;

/** タイトルの既定設定。デフォルト位置は中央、文字サイズは通常キャプションより大きめ */
export const DEFAULT_VIDEO_TITLE_SETTINGS: VideoTitleSettings = {
  enabled: true,
  text: '',
  startTime: VIDEO_TITLE_DEFAULT_START_TIME,
  endTime: VIDEO_TITLE_DEFAULT_END_TIME,
  fontStyle: 'gothic',
  fontColor: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 5,
  fontSize: VIDEO_TITLE_DEFAULT_FONT_SIZE_PRESET,
  fontSizeCustom: null,
  position: 'center',
  positionCustom: null,
  backgroundEnabled: false,
  backgroundColor: '#000000',
  backgroundOpacity: 0.45,
  backgroundRadius: 16,
  /** キャプションと同じ 0〜5px。既定はぼかしなし */
  blur: 0,
  // 開始フェードは OFF（頭から出す）、終了フェードは 1 秒でなじませる
  fadeIn: false,
  fadeOut: true,
  fadeInDuration: VIDEO_TITLE_DEFAULT_FADE_IN_DURATION,
  fadeOutDuration: VIDEO_TITLE_DEFAULT_FADE_OUT_DURATION,
};

/**
 * タイトルのベースフォントサイズ（px @1080p 基準）を解決する。
 * 優先度: カスタム値 > プリセット。キャプションの
 * `resolveCaptionBaseFontSize()` と同じ考え方・同じ範囲（24〜240px）を使う。
 */
export function resolveVideoTitleBaseFontSize(
  title: Pick<VideoTitleSettings, 'fontSize' | 'fontSizeCustom'>
): number {
  if (title.fontSizeCustom != null) {
    return clampCustomFontSize(title.fontSizeCustom);
  }
  return CAPTION_FONT_SIZE_PRESETS[title.fontSize] ?? VIDEO_TITLE_DEFAULT_FONT_SIZE;
}

/** 縁幅のクランプ。キャプションと同一の実装を使う（範囲・刻みを揃えるため） */
export function clampVideoTitleStrokeWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VIDEO_TITLE_SETTINGS.strokeWidth;
  return clampCaptionStrokeWidth(value);
}

/** ぼかしのクランプ。キャプションと同一の範囲（0〜5px・0.1 刻み） */
export function clampVideoTitleBlur(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VIDEO_TITLE_SETTINGS.blur;
  return clampCaptionBlur(value);
}

export function clampVideoTitleBackgroundOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VIDEO_TITLE_SETTINGS.backgroundOpacity;
  const clamped = Math.max(
    VIDEO_TITLE_BACKGROUND_OPACITY_MIN,
    Math.min(VIDEO_TITLE_BACKGROUND_OPACITY_MAX, value)
  );
  return (
    Math.round(clamped / VIDEO_TITLE_BACKGROUND_OPACITY_STEP) * VIDEO_TITLE_BACKGROUND_OPACITY_STEP
  );
}

export function clampVideoTitleBackgroundRadius(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VIDEO_TITLE_SETTINGS.backgroundRadius;
  const clamped = Math.max(
    VIDEO_TITLE_BACKGROUND_RADIUS_MIN,
    Math.min(VIDEO_TITLE_BACKGROUND_RADIUS_MAX, value)
  );
  return (
    Math.round(clamped / VIDEO_TITLE_BACKGROUND_RADIUS_STEP) * VIDEO_TITLE_BACKGROUND_RADIUS_STEP
  );
}

/** 時刻（秒）を 0.1 秒刻みへ量子化し、負値を 0 へ丸める */
function quantizeTime(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 10) / 10);
}

/**
 * 表示開始・終了時間を正規化する。
 * - 0.1 秒刻みへ量子化し、負値は 0 へクランプ
 * - 終了が開始以下になる場合は最小表示時間を確保する
 * - totalDuration が有効なときは、その範囲内へ収める
 */
export function normalizeVideoTitleRange(
  startTime: number,
  endTime: number,
  totalDuration?: number
): { startTime: number; endTime: number } {
  const hasLimit = Number.isFinite(totalDuration) && (totalDuration as number) > 0;
  const limit = hasLimit ? quantizeTime(totalDuration as number) : null;

  let start = quantizeTime(startTime);
  if (limit !== null) {
    start = Math.min(start, Math.max(0, limit - VIDEO_TITLE_MIN_DURATION_SEC));
  }

  let end = quantizeTime(endTime);
  if (end < start + VIDEO_TITLE_MIN_DURATION_SEC) {
    end = start + VIDEO_TITLE_MIN_DURATION_SEC;
  }
  if (limit !== null) {
    end = Math.min(end, limit);
    if (end < start + VIDEO_TITLE_MIN_DURATION_SEC) {
      start = Math.max(0, end - VIDEO_TITLE_MIN_DURATION_SEC);
    }
  }

  return {
    startTime: Math.round(start * 10) / 10,
    endTime: Math.round(end * 10) / 10,
  };
}

/** 描画対象となるタイトル行（空行を除去）。空配列なら描画しない */
export function resolveVideoTitleLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * この時刻にタイトルを描画すべきか。
 * enabled かつテキストが実質空でなく、[startTime, endTime) に入っているとき true。
 */
export function isVideoTitleActiveAtTime(
  title: VideoTitleSettings | null | undefined,
  timeSec: number
): boolean {
  if (!title || !title.enabled) return false;
  if (resolveVideoTitleLines(title.text).length === 0) return false;
  return timeSec >= title.startTime && timeSec < title.endTime;
}

/**
 * タイトルのアンカー座標（テキスト中心）を解決する。
 * 優先度: カスタム XY > プリセット（上/中央/下）。
 * キャプションの resolveCaptionAnchor と同じ座標系（1080p 基準の px を渡す）。
 */
export function resolveVideoTitleAnchor(
  title: Pick<VideoTitleSettings, 'position' | 'positionCustom'>,
  layout: { canvasWidth: number; canvasHeight: number; blockHeight: number; padding: number }
): { x: number; y: number } {
  const { canvasWidth, canvasHeight, blockHeight, padding } = layout;

  if (title.positionCustom) {
    return {
      x: (canvasWidth * clampPositionPercent(title.positionCustom.x)) / 100,
      y: (canvasHeight * clampPositionPercent(title.positionCustom.y)) / 100,
    };
  }

  const x = canvasWidth / 2;
  const position: CaptionPosition = title.position;
  if (position === 'top') {
    return { x, y: padding + blockHeight / 2 };
  }
  if (position === 'bottom') {
    // キャプションと同じく、縦画面では下部プリセットをやや上へ寄せる
    if (isPortraitCanvas(canvasWidth, canvasHeight)) {
      return { x, y: (canvasHeight * CAPTION_PORTRAIT_BOTTOM_Y_PERCENT) / 100 };
    }
    return { x, y: canvasHeight - padding - blockHeight / 2 };
  }
  return { x, y: canvasHeight / 2 };
}

/**
 * フェードを考慮した不透明度（0〜1）を解決する。
 * フェードイン + アウトが表示時間を超える場合は按分してクランプする
 * （キャプションの行ごとフェードと同じ考え方）。
 */
export function resolveVideoTitleAlpha(
  title: Pick<
    VideoTitleSettings,
    'startTime' | 'endTime' | 'fadeIn' | 'fadeOut' | 'fadeInDuration' | 'fadeOutDuration'
  >,
  timeSec: number
): number {
  const duration = title.endTime - title.startTime;
  if (duration <= 0) return 0;

  const localTime = timeSec - title.startTime;
  let fadeInDur = title.fadeIn ? Math.max(0, title.fadeInDuration) : 0;
  let fadeOutDur = title.fadeOut ? Math.max(0, title.fadeOutDuration) : 0;

  if (fadeInDur + fadeOutDur > duration) {
    const ratio = duration / (fadeInDur + fadeOutDur);
    fadeInDur *= ratio;
    fadeOutDur *= ratio;
  }

  let alpha = 1;
  if (fadeInDur > 0 && localTime < fadeInDur) {
    alpha = Math.min(alpha, localTime / fadeInDur);
  }
  if (fadeOutDur > 0 && localTime > duration - fadeOutDur) {
    alpha = Math.min(alpha, (duration - localTime) / fadeOutDur);
  }
  return Math.max(0, Math.min(1, alpha));
}

/**
 * タイトル描画のスケール基準（px @1080p）。キャプションと同じ短辺基準を使う。
 * プレビュー（720p）と export（1080p）で「フレームに対する文字の比率」を一致させ、
 * 「プレビューで見たまま export される（WYSIWYG）」を保証する。
 * 縦画面でも横画面と同程度の文字サイズになるよう、高さではなく短辺を基準にする。
 */
export const VIDEO_TITLE_REFERENCE_HEIGHT = CAPTION_REFERENCE_SIZE;

/** キャンバス端からの余白（px @1080p 基準）。キャプションと同じ 50px */
const VIDEO_TITLE_PADDING = 50;

/** 複数行タイトルの行間（フォントサイズ比） */
const VIDEO_TITLE_LINE_HEIGHT_RATIO = 1.25;

/** 背景板のテキスト周囲の余白（フォントサイズ比） */
const VIDEO_TITLE_BACKGROUND_PADDING_X_RATIO = 0.45;
const VIDEO_TITLE_BACKGROUND_PADDING_Y_RATIO = 0.3;

/**
 * 動画タイトルを Canvas へ描画する。
 *
 * **preview / export 共通の単一実装**（standard / apple-safari の両エンジンから呼ぶ）。
 * ここを唯一の描画経路にすることで、Issue #211 の確認項目
 * 「エクスポート結果がプレビューと一致する」を構造的に担保する。
 *
 * 描画方針（キャプション実装 13-131 / 13-133 と揃える）:
 * - サイズ・縁幅・余白・ぼかしは 1080p 基準の値をキャンバス短辺で按分する
 * - 文字は stroke + fill を 1 枚のオフスクリーン Canvas に不透明で合成してから
 *   globalAlpha 付きで転写する（フェード時に輪郭だけ残る現象を回避）
 * - 複数行は中央揃えで積み、時分割はしない（キャプションとの差別化）
 * - ぼかしは通常 `ctx.filter`、iOS Safari 等では多重描画フォールバック
 *
 * @returns 実際に描画したら true（呼び出し側の didUpdateCanvas 判定に使う）
 */
export function drawVideoTitleFrame(
  ctx: CanvasRenderingContext2D,
  title: VideoTitleSettings | null | undefined,
  timeSec: number,
  options?: {
    useBlurFallback?: boolean;
    glyphPixelRatio?: number;
    glyphCanvasCache?: CaptionGlyphCanvasCache;
  }
): boolean {
  if (!title) return false;
  if (!isVideoTitleActiveAtTime(title, timeSec)) return false;

  const lines = resolveVideoTitleLines(title.text);
  if (lines.length === 0) return false;

  const alpha = resolveVideoTitleAlpha(title, timeSec);
  if (alpha <= 0) return false;

  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  if (canvasWidth <= 0 || canvasHeight <= 0) return false;

  // 短辺基準。縦 9:16 で高さ基準だと文字が大きくなりすぎるため
  const scale = resolveCaptionLayoutScale(canvasWidth, canvasHeight);
  const fontSize = Math.max(1, resolveVideoTitleBaseFontSize(title) * scale);
  const strokeWidth = clampVideoTitleStrokeWidth(title.strokeWidth) * scale;
  const blurStrength = clampVideoTitleBlur(title.blur) * scale;
  const padding = VIDEO_TITLE_PADDING * scale;
  const lineHeight = fontSize * VIDEO_TITLE_LINE_HEIGHT_RATIO;
  const blockHeight = lineHeight * lines.length;

  const anchor = resolveVideoTitleAnchor(title, {
    canvasWidth,
    canvasHeight,
    blockHeight,
    padding,
  });

  const fontFamily = resolveCaptionFontFamily(title.fontStyle);
  const font = `bold ${fontSize}px ${fontFamily}`;
  const glyphPixelRatio = normalizeCaptionGlyphPixelRatio(options?.glyphPixelRatio);

  // 各行のグリフを先に作る（背景板の幅を実測値から決めるため）
  const glyphCanvases = lines.map((line) => {
    const canvas = getOrCreateCaptionGlyphCanvas(
      {
        text: line,
        font,
        fillColor: title.fontColor,
        strokeColor: title.strokeColor,
        strokeWidth,
        pixelRatio: glyphPixelRatio,
      },
      options?.glyphCanvasCache
    );
    return {
      canvas,
      width: canvas.width / glyphPixelRatio,
      height: canvas.height / glyphPixelRatio,
    };
  });

  ctx.save();
  ctx.globalAlpha = alpha;

  // 背景の帯: 映像に重なっても読めるようにする任意の視認性補助
  const backgroundOpacity = clampVideoTitleBackgroundOpacity(title.backgroundOpacity);
  if (title.backgroundEnabled && backgroundOpacity > 0) {
    const maxGlyphWidth = glyphCanvases.reduce((max, glyph) => Math.max(max, glyph.width), 0);
    const boxWidth = maxGlyphWidth + fontSize * VIDEO_TITLE_BACKGROUND_PADDING_X_RATIO * 2;
    const boxHeight = blockHeight + fontSize * VIDEO_TITLE_BACKGROUND_PADDING_Y_RATIO * 2;
    const boxX = anchor.x - boxWidth / 2;
    const boxY = anchor.y - boxHeight / 2;
    // 角丸半径も 1080p 基準でスケールし、帯の短辺の半分を超えないようにする
    const radius = Math.min(
      clampVideoTitleBackgroundRadius(title.backgroundRadius) * scale,
      boxWidth / 2,
      boxHeight / 2
    );
    ctx.globalAlpha = alpha * backgroundOpacity;
    ctx.fillStyle = title.backgroundColor;
    // roundRect は比較的新しい API。未対応環境では従来どおり角丸なしで描く
    if (radius > 0 && typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, radius);
      ctx.fill();
    } else {
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    }
    ctx.globalAlpha = alpha;
  }

  // 文字（中央揃えで上から積む）。ぼかしはキャプションと同じく filter または多重描画
  const firstLineCenterY = anchor.y - blockHeight / 2 + lineHeight / 2;
  const useBlurFallback = Boolean(options?.useBlurFallback) && blurStrength > 0;

  const drawGlyphAt = (
    glyph: { canvas: HTMLCanvasElement; width: number; height: number },
    centerX: number,
    centerY: number,
    localAlpha: number
  ) => {
    const clamped = Math.max(0, Math.min(1, localAlpha));
    if (clamped <= 0) return;
    ctx.globalAlpha = alpha * clamped;
    const previousSmoothing = ctx.imageSmoothingEnabled;
    const previousSmoothingQuality = ctx.imageSmoothingQuality;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      glyph.canvas,
      centerX - glyph.width / 2,
      centerY - glyph.height / 2,
      glyph.width,
      glyph.height
    );
    ctx.imageSmoothingEnabled = previousSmoothing;
    ctx.imageSmoothingQuality = previousSmoothingQuality;
  };

  glyphCanvases.forEach((glyph, index) => {
    const centerY = firstLineCenterY + lineHeight * index;
    const centerX = anchor.x;

    if (useBlurFallback) {
      // iOS Safari 向け: filter blur が効かないためキャプションと同じ多重描画
      const blurNorm = Math.min(1, blurStrength / 5);
      const ringCount = Math.max(3, Math.round(blurStrength * 3.5));
      const samplesPerRing = 18;
      const maxRadius = Math.max(1.5, blurStrength * 2.6);
      const totalSamples = ringCount * samplesPerRing;
      const prevComposite = ctx.globalCompositeOperation;

      ctx.globalCompositeOperation = 'lighter';
      for (let ring = 1; ring <= ringCount; ring++) {
        const radius = (ring / ringCount) * maxRadius;
        const ringWeight = Math.max(0.3, 1 - ((ring - 1) / Math.max(1, ringCount - 1)) * 0.55);
        const sampleAlpha = ((0.95 + blurNorm * 0.55) * ringWeight) / totalSamples;
        for (let i = 0; i < samplesPerRing; i++) {
          const angle = (Math.PI * 2 * i) / samplesPerRing;
          drawGlyphAt(
            glyph,
            centerX + Math.cos(angle) * radius,
            centerY + Math.sin(angle) * radius,
            sampleAlpha
          );
        }
      }
      ctx.globalCompositeOperation = prevComposite;

      const coreAlpha = Math.max(0.35, 0.9 - blurNorm * 0.45);
      if (coreAlpha > 0.01) {
        drawGlyphAt(glyph, centerX, centerY, coreAlpha);
      }
      return;
    }

    ctx.filter = blurStrength > 0 ? `blur(${blurStrength}px)` : 'none';
    drawGlyphAt(glyph, centerX, centerY, 1);
    ctx.filter = 'none';
  });

  ctx.restore();
  ctx.globalAlpha = 1.0;
  return true;
}

/**
 * 保存データ・復元データからタイトル設定を正規化する。
 * 旧データ（タイトル未対応バージョン）は undefined なので既定値をそのまま返す。
 */
export function normalizeVideoTitleSettings(
  value: Partial<VideoTitleSettings> | null | undefined
): VideoTitleSettings {
  if (!value) return { ...DEFAULT_VIDEO_TITLE_SETTINGS };
  const merged = { ...DEFAULT_VIDEO_TITLE_SETTINGS, ...value };
  const range = normalizeVideoTitleRange(merged.startTime, merged.endTime);
  return {
    ...merged,
    startTime: range.startTime,
    endTime: range.endTime,
    // プリセット外の値（旧形式の数値など）は既定プリセットへ落とす
    fontSize: CAPTION_FONT_SIZE_PRESETS[merged.fontSize]
      ? merged.fontSize
      : VIDEO_TITLE_DEFAULT_FONT_SIZE_PRESET,
    fontSizeCustom:
      merged.fontSizeCustom != null ? clampCustomFontSize(merged.fontSizeCustom) : null,
    strokeWidth: clampVideoTitleStrokeWidth(merged.strokeWidth),
    backgroundOpacity: clampVideoTitleBackgroundOpacity(merged.backgroundOpacity),
    backgroundRadius: clampVideoTitleBackgroundRadius(merged.backgroundRadius),
    // 旧データ（ぼかし未対応）は undefined → 既定 0
    blur: clampVideoTitleBlur(merged.blur ?? DEFAULT_VIDEO_TITLE_SETTINGS.blur),
    positionCustom: merged.positionCustom
      ? {
          x: clampPositionPercent(merged.positionCustom.x),
          y: clampPositionPercent(merged.positionCustom.y),
        }
      : null,
  };
}
