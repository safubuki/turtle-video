/**
 * @file captionLayerRender.ts
 * @description キャプションレイヤー（キャプション + 動画タイトル）のみを Canvas へ描く共通描画（Issue #114）。
 *
 * preview の通常合成とは独立した経路で、export の「キャプションのみ」オフライン encode から使う。
 * キャプションの見た目解決は captionStyle / captionTimeline / videoTitle と同じ純関数群を使う。
 */
import type { Caption, CaptionSettings, VideoTitleSettings } from '../types';
import { getOrCreateCaptionGlyphCanvas, normalizeCaptionGlyphPixelRatio } from './canvas';
import type { CaptionGlyphCanvasCache } from './canvas';
import { resolveCaptionFontFamily } from './captionFontCatalog';
import {
  drawCaptionBackgroundBand,
  resolveCaptionAnchor,
  resolveCaptionBackgroundStyle,
  resolveCaptionBaseFontSize,
  resolveCaptionGlyphCenterX,
  resolveCaptionGlyphStyle,
  resolveCaptionLayoutScale,
} from './captionStyle';
import { isCaptionActiveAtTime, resolveCaptionDisplaySegment } from './captionTimeline';
import { drawVideoTitleFrame } from './videoTitle';
import type { CaptionLayerMatte } from './captionLayerExport';

export interface DrawCaptionLayerFrameOptions {
  matte: CaptionLayerMatte;
  /**
   * すでに描かれている背景を残し、その上へキャプションだけを重ねる。
   * キャプション設定のミニプレビュー（現在フレームへの重ね描き）で使う。
   * true のときは `matte` の塗り／クリアを行わない。
   */
  preserveBackground?: boolean;
  /** ルミナンスキー用に文字を白・縁を黒へ強制する */
  forceWhiteGlyphs?: boolean;
  /** iOS 等で filter blur が弱い場合の多重描画 */
  useBlurFallback?: boolean;
  /** 文字だけを高解像度で描いて縮小転写する倍率。通常描画は 1、品質優先 export は 2。 */
  glyphPixelRatio?: number;
  /** export セッション内で同一グリフを再利用し、毎フレームの高解像度再生成を防ぐ。 */
  glyphCanvasCache?: CaptionGlyphCanvasCache;
}

const LUMINANCE_KEY_FILL = '#FFFFFF';
const LUMINANCE_KEY_STROKE = '#000000';

/**
 * マットを塗り、キャプションと動画タイトルだけを描く。
 * @returns 何らかの描画を行ったら true
 */
export function drawCaptionLayerFrame(
  ctx: CanvasRenderingContext2D,
  timeSec: number,
  captions: Caption[],
  captionSettings: CaptionSettings,
  videoTitle: VideoTitleSettings | null | undefined,
  options: DrawCaptionLayerFrameOptions
): boolean {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  if (width <= 0 || height <= 0) return false;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';

  // ミニプレビューは現在フレームの上へ重ねるため、背景の塗り／クリアをしない。
  if (!options.preserveBackground) {
    if (options.matte === 'transparent') {
      ctx.clearRect(0, 0, width, height);
    } else {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
    }
  }
  ctx.restore();

  let didDraw = false;
  const forceWhite = Boolean(options.forceWhiteGlyphs) || options.matte === 'luminance-key';

  if (captionSettings.enabled && captions.length > 0) {
    if (
      drawCaptionsAtTime(ctx, timeSec, captions, captionSettings, {
        forceWhiteGlyphs: forceWhite,
        useBlurFallback: options.useBlurFallback,
        glyphPixelRatio: options.glyphPixelRatio,
        glyphCanvasCache: options.glyphCanvasCache,
      })
    ) {
      didDraw = true;
    }
  }

  if (videoTitle) {
    const titleForDraw = forceWhite
      ? {
          ...videoTitle,
          fontColor: LUMINANCE_KEY_FILL,
          strokeColor: LUMINANCE_KEY_STROKE,
        }
      : videoTitle;
    if (
      drawVideoTitleFrame(ctx, titleForDraw, timeSec, {
        useBlurFallback: options.useBlurFallback,
        glyphPixelRatio: options.glyphPixelRatio,
        glyphCanvasCache: options.glyphCanvasCache,
      })
    ) {
      didDraw = true;
    }
  }

  return didDraw;
}

function drawCaptionsAtTime(
  ctx: CanvasRenderingContext2D,
  timeSec: number,
  captions: Caption[],
  captionSettings: CaptionSettings,
  options: {
    forceWhiteGlyphs: boolean;
    useBlurFallback?: boolean;
    glyphPixelRatio?: number;
    glyphCanvasCache?: CaptionGlyphCanvasCache;
  }
): boolean {
  let didDraw = false;
  const activeCaptions = captions.filter((c) => isCaptionActiveAtTime(c, timeSec));

  for (const activeCaption of activeCaptions) {
    const displaySegment = resolveCaptionDisplaySegment(activeCaption, timeSec);
    if (!displaySegment) continue;

    const baseFontSize = resolveCaptionBaseFontSize(activeCaption, captionSettings);
    const captionScale = resolveCaptionLayoutScale(ctx.canvas.width, ctx.canvas.height);
    const fontSize = Math.max(1, baseFontSize * captionScale);
    const effectiveFontStyle = activeCaption.overrideFontStyle ?? captionSettings.fontStyle;
    const fontFamily = resolveCaptionFontFamily(effectiveFontStyle);
    const padding = 50 * captionScale;
    const captionAnchor = resolveCaptionAnchor(activeCaption, captionSettings, {
      canvasWidth: ctx.canvas.width,
      canvasHeight: ctx.canvas.height,
      fontSize,
      padding,
    });
    const y = captionAnchor.y;

    const useLineFadeBasis =
      displaySegment.isSequential && activeCaption.sequentialFadeMode === 'line';
    const fadeBasisStart = useLineFadeBasis ? displaySegment.startTime : activeCaption.startTime;
    const fadeBasisEnd = useLineFadeBasis ? displaySegment.endTime : activeCaption.endTime;
    const captionDuration = fadeBasisEnd - fadeBasisStart;
    const captionLocalTime = timeSec - fadeBasisStart;

    const useFadeIn =
      activeCaption.overrideFadeIn !== undefined
        ? activeCaption.overrideFadeIn === 'on'
        : captionSettings.bulkFadeIn;
    const useFadeOut =
      activeCaption.overrideFadeOut !== undefined
        ? activeCaption.overrideFadeOut === 'on'
        : captionSettings.bulkFadeOut;

    let fadeInDur =
      activeCaption.overrideFadeIn === 'on' && activeCaption.overrideFadeInDuration !== undefined
        ? activeCaption.overrideFadeInDuration
        : captionSettings.bulkFadeInDuration || 1.0;
    let fadeOutDur =
      activeCaption.overrideFadeOut === 'on' && activeCaption.overrideFadeOutDuration !== undefined
        ? activeCaption.overrideFadeOutDuration
        : captionSettings.bulkFadeOutDuration || 1.0;

    if (useLineFadeBasis && captionDuration > 0) {
      const inEffective = useFadeIn ? fadeInDur : 0;
      const outEffective = useFadeOut ? fadeOutDur : 0;
      if (inEffective + outEffective > captionDuration) {
        const ratio = captionDuration / (inEffective + outEffective);
        fadeInDur *= ratio;
        fadeOutDur *= ratio;
      }
    }

    let fadeInAlpha = 1.0;
    let fadeOutAlpha = 1.0;
    if (useFadeIn && captionLocalTime < fadeInDur) {
      fadeInAlpha = captionLocalTime / fadeInDur;
    }
    if (useFadeOut && captionLocalTime > captionDuration - fadeOutDur) {
      const remaining = captionDuration - captionLocalTime;
      fadeOutAlpha = remaining / fadeOutDur;
    }
    const alpha = Math.max(0, Math.min(1, fadeInAlpha * fadeOutAlpha));
    if (alpha <= 0) continue;

    ctx.save();
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const glyphStyle = resolveCaptionGlyphStyle(activeCaption, captionSettings);
    const fillColor = options.forceWhiteGlyphs ? LUMINANCE_KEY_FILL : glyphStyle.fontColor;
    const strokeColor = options.forceWhiteGlyphs ? LUMINANCE_KEY_STROKE : glyphStyle.strokeColor;
    const scaledStrokeWidth = glyphStyle.strokeWidth * captionScale;
    const blurStrength = glyphStyle.blur * captionScale;
    const glyphPixelRatio = normalizeCaptionGlyphPixelRatio(options.glyphPixelRatio);
    const glyphCanvas = getOrCreateCaptionGlyphCanvas(
      {
        text: displaySegment.text,
        font: `bold ${fontSize}px ${fontFamily}`,
        fillColor,
        strokeColor,
        strokeWidth: scaledStrokeWidth,
        pixelRatio: glyphPixelRatio,
      },
      options.glyphCanvasCache
    );
    const glyphW = glyphCanvas.width / glyphPixelRatio;
    const glyphH = glyphCanvas.height / glyphPixelRatio;
    const centerX = resolveCaptionGlyphCenterX(activeCaption, captionSettings, {
      canvasWidth: ctx.canvas.width,
      padding,
      positionAnchorX: captionAnchor.x,
      glyphWidth: glyphW,
    });

    // ルミナンスキー時は背景帯があるとキーが汚れるため描かない
    if (!options.forceWhiteGlyphs) {
      const backgroundStyle = resolveCaptionBackgroundStyle(activeCaption, captionSettings);
      if (
        drawCaptionBackgroundBand(ctx, {
          centerX,
          centerY: y,
          glyphWidth: glyphW,
          glyphHeight: glyphH,
          fontSize,
          fadeAlpha: alpha,
          backgroundEnabled: backgroundStyle.backgroundEnabled,
          backgroundColor: backgroundStyle.backgroundColor,
          backgroundOpacity: backgroundStyle.backgroundOpacity,
          backgroundRadius: backgroundStyle.backgroundRadius,
          layoutScale: captionScale,
        })
      ) {
        didDraw = true;
      }
    }

    const drawGlyphAt = (cx: number, cy: number, localAlpha: number) => {
      const clamped = Math.max(0, Math.min(1, localAlpha));
      if (clamped <= 0) return;
      didDraw = true;
      ctx.globalAlpha = alpha * clamped;
      const previousSmoothing = ctx.imageSmoothingEnabled;
      const previousSmoothingQuality = ctx.imageSmoothingQuality;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(glyphCanvas, cx - glyphW / 2, cy - glyphH / 2, glyphW, glyphH);
      ctx.imageSmoothingEnabled = previousSmoothing;
      ctx.imageSmoothingQuality = previousSmoothingQuality;
    };

    if (options.useBlurFallback && blurStrength > 0) {
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
            centerX + Math.cos(angle) * radius,
            y + Math.sin(angle) * radius,
            sampleAlpha
          );
        }
      }
      ctx.globalCompositeOperation = prevComposite;
      const coreAlpha = Math.max(0.35, 0.9 - blurNorm * 0.45);
      if (coreAlpha > 0.01) {
        drawGlyphAt(centerX, y, coreAlpha);
      }
      ctx.restore();
      continue;
    }

    ctx.filter = blurStrength > 0 ? `blur(${blurStrength}px)` : 'none';
    drawGlyphAt(centerX, y, 1);
    ctx.restore();
  }

  return didDraw;
}
