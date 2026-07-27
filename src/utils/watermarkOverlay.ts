/**
 * @file watermarkOverlay.ts
 * @description Issue #210 の範囲指定ウォーターマークに関する正規化と共通 Canvas 描画。
 */
import type { WatermarkMask, WatermarkOverlay } from '../types';

export const WATERMARK_MIN_DURATION_SEC = 0.1;
export const WATERMARK_POSITION_MIN = 0;
export const WATERMARK_POSITION_MAX = 100;
export const WATERMARK_SIZE_MIN = 0.1;
export const WATERMARK_SIZE_MAX = 3;
export const WATERMARK_OPACITY_MIN = 0;
export const WATERMARK_OPACITY_MAX = 1;
export const WATERMARK_ROTATION_MIN = -180;
export const WATERMARK_ROTATION_MAX = 180;
export const WATERMARK_MASK_SIZE_MIN = 5;
export const WATERMARK_MASK_SIZE_MAX = 100;
export const WATERMARK_FEATHER_MIN = 0;
export const WATERMARK_FEATHER_MAX = 40;
export type WatermarkPositionPreset =
  | 'bottom-left'
  | 'bottom-right'
  | 'center'
  | 'top-left'
  | 'top-right';

export const DEFAULT_WATERMARK_OVERLAY: WatermarkOverlay = {
  file: null,
  url: null,
  enabled: true,
  startTime: 0,
  endTime: 4,
  positionX: 50,
  positionY: 50,
  size: 1,
  opacity: 1,
  rotation: 0,
  mask: 'rectangle',
  maskSize: 100,
  feather: 0,
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeWatermarkMask(value: unknown): WatermarkMask {
  return value === 'circle' || value === 'rounded' ? value : 'rectangle';
}

export function normalizeWatermarkRange(
  startTime: unknown,
  endTime: unknown,
  totalDuration?: number,
): Pick<WatermarkOverlay, 'startTime' | 'endTime'> {
  const max = Number.isFinite(totalDuration) && (totalDuration as number) > 0
    ? totalDuration as number
    : Number.POSITIVE_INFINITY;
  const requestedStart = Number(startTime);
  const finiteStart = Number.isFinite(requestedStart) ? requestedStart : 0;
  const maxStart = Number.isFinite(max)
    ? Math.max(0, max - Math.min(WATERMARK_MIN_DURATION_SEC, max))
    : max;
  const start = Math.min(maxStart, Math.max(0, finiteStart));
  const requestedEnd = Number(endTime);
  const fallbackEnd = Number.isFinite(max) ? max : DEFAULT_WATERMARK_OVERLAY.endTime;
  const end = Math.min(
    max,
    Math.max(start + WATERMARK_MIN_DURATION_SEC, Number.isFinite(requestedEnd) ? requestedEnd : fallbackEnd),
  );
  return { startTime: start, endTime: end };
}

export function normalizeWatermarkOverlay(
  value: Partial<WatermarkOverlay> | null | undefined,
): WatermarkOverlay {
  const source = value ?? {};
  const range = normalizeWatermarkRange(source.startTime, source.endTime);
  return {
    file: source.file instanceof File ? source.file : null,
    url: typeof source.url === 'string' && source.url ? source.url : null,
    enabled: source.enabled !== false,
    ...range,
    positionX: clamp(
      source.positionX,
      WATERMARK_POSITION_MIN,
      WATERMARK_POSITION_MAX,
      DEFAULT_WATERMARK_OVERLAY.positionX,
    ),
    positionY: clamp(
      source.positionY,
      WATERMARK_POSITION_MIN,
      WATERMARK_POSITION_MAX,
      DEFAULT_WATERMARK_OVERLAY.positionY,
    ),
    size: clamp(source.size, WATERMARK_SIZE_MIN, WATERMARK_SIZE_MAX, DEFAULT_WATERMARK_OVERLAY.size),
    opacity: clamp(
      source.opacity,
      WATERMARK_OPACITY_MIN,
      WATERMARK_OPACITY_MAX,
      DEFAULT_WATERMARK_OVERLAY.opacity,
    ),
    rotation: clamp(
      source.rotation,
      WATERMARK_ROTATION_MIN,
      WATERMARK_ROTATION_MAX,
      DEFAULT_WATERMARK_OVERLAY.rotation,
    ),
    mask: normalizeWatermarkMask(source.mask),
    maskSize: clamp(
      source.maskSize,
      WATERMARK_MASK_SIZE_MIN,
      WATERMARK_MASK_SIZE_MAX,
      DEFAULT_WATERMARK_OVERLAY.maskSize,
    ),
    feather: clamp(
      source.feather,
      WATERMARK_FEATHER_MIN,
      WATERMARK_FEATHER_MAX,
      DEFAULT_WATERMARK_OVERLAY.feather,
    ),
  };
}

export function shouldDrawWatermarkOverlay(
  overlay: WatermarkOverlay | null | undefined,
  image: HTMLImageElement | null | undefined,
  timeSec: number,
): boolean {
  return Boolean(
    overlay?.enabled
    && overlay.url
    && image
    && image.complete
    && image.naturalWidth > 0
    && image.naturalHeight > 0
    && timeSec >= overlay.startTime
    && timeSec < overlay.endTime,
  );
}

/**
 * 基準位置（左右 9/91%、上下 15/85%）へ寄せた中心位置を返す。
 * 大きなロゴだけは、可視マスクの回転後サイズを基準に過度な見切れを抑える。
 */
export function resolveWatermarkPresetPosition(params: {
  overlay: WatermarkOverlay;
  preset: WatermarkPositionPreset;
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}): Pick<WatermarkOverlay, 'positionX' | 'positionY'> {
  const {
    overlay,
    preset,
    imageNaturalWidth,
    imageNaturalHeight,
    canvasWidth,
    canvasHeight,
  } = params;
  if (
    preset === 'center'
    || !Number.isFinite(imageNaturalWidth)
    || !Number.isFinite(imageNaturalHeight)
    || !Number.isFinite(canvasWidth)
    || !Number.isFinite(canvasHeight)
    || imageNaturalWidth <= 0
    || imageNaturalHeight <= 0
    || canvasWidth <= 0
    || canvasHeight <= 0
  ) {
    return { positionX: 50, positionY: 50 };
  }

  const naturalCircleSize = Math.min(imageNaturalWidth, imageNaturalHeight);
  const renderedWidth = (overlay.mask === 'circle' ? naturalCircleSize : imageNaturalWidth)
    * overlay.size;
  const renderedHeight = (overlay.mask === 'circle' ? naturalCircleSize : imageNaturalHeight)
    * overlay.size;
  const maskRatio = overlay.maskSize / 100;
  const featherPx = overlay.feather * (canvasHeight / 1080);
  const visibleWidth = Math.min(renderedWidth, renderedWidth * maskRatio + featherPx * 4);
  const visibleHeight = Math.min(renderedHeight, renderedHeight * maskRatio + featherPx * 4);
  const radians = (overlay.rotation * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(radians));
  const absSin = Math.abs(Math.sin(radians));
  const halfExtentX = (visibleWidth * absCos + visibleHeight * absSin) / 2;
  const halfExtentY = (visibleWidth * absSin + visibleHeight * absCos) / 2;
  const preferredLeft = 9;
  const preferredTop = 15;
  // 端へ少し重ねる配置は許容しつつ、可視領域の 87.5% 以上を画面内へ残す。
  const visibleCenterRatio = 0.75;
  const minimumLeft = (halfExtentX / canvasWidth) * 100 * visibleCenterRatio;
  const minimumTop = (halfExtentY / canvasHeight) * 100 * visibleCenterRatio;
  const left = Math.min(50, Math.max(preferredLeft, minimumLeft));
  const top = Math.min(50, Math.max(preferredTop, minimumTop));

  return {
    positionX: preset.endsWith('left') ? left : 100 - left,
    positionY: preset.startsWith('top') ? top : 100 - top,
  };
}

interface WatermarkRasterCache {
  image: HTMLImageElement;
  key: string;
  canvas: HTMLCanvasElement;
}

let rasterCache: WatermarkRasterCache | null = null;

function createMaskPath(
  ctx: CanvasRenderingContext2D,
  mask: WatermarkMask,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  ctx.beginPath();
  if (mask === 'circle') {
    ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  } else if (mask === 'rounded') {
    const radius = Math.min(width, height) * 0.14;
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, width, height, radius);
    } else {
      ctx.rect(x, y, width, height);
    }
  } else {
    ctx.rect(x, y, width, height);
  }
  ctx.closePath();
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const sourceAspect = image.naturalWidth / image.naturalHeight;
  const targetAspect = width / height;
  if (sourceAspect > targetAspect) {
    const sourceWidth = image.naturalHeight * targetAspect;
    const sourceX = (image.naturalWidth - sourceWidth) / 2;
    ctx.drawImage(image, sourceX, 0, sourceWidth, image.naturalHeight, x, y, width, height);
  } else {
    const sourceHeight = image.naturalWidth / targetAspect;
    const sourceY = (image.naturalHeight - sourceHeight) / 2;
    ctx.drawImage(image, 0, sourceY, image.naturalWidth, sourceHeight, x, y, width, height);
  }
}

function getRasterizedWatermark(
  image: HTMLImageElement,
  width: number,
  height: number,
  mask: WatermarkMask,
  maskSize: number,
  featherPx: number,
): HTMLCanvasElement {
  const pad = Math.ceil(featherPx * 2);
  const rasterWidth = Math.max(1, Math.ceil(width));
  const rasterHeight = Math.max(1, Math.ceil(height));
  const key = `${rasterWidth}x${rasterHeight}:${mask}:${maskSize.toFixed(2)}:${featherPx.toFixed(2)}:${image.currentSrc || image.src}`;
  if (rasterCache?.image === image && rasterCache.key === key) {
    return rasterCache.canvas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = rasterWidth + pad * 2;
  canvas.height = rasterHeight + pad * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  if (mask === 'circle') {
    drawImageCover(ctx, image, pad, pad, rasterWidth, rasterHeight);
  } else {
    ctx.drawImage(image, pad, pad, rasterWidth, rasterHeight);
  }

  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = '#fff';
  if (featherPx > 0) {
    ctx.filter = `blur(${featherPx}px)`;
  }
  const maskRatio = maskSize / 100;
  const maskWidth = rasterWidth * maskRatio;
  const maskHeight = rasterHeight * maskRatio;
  const maskX = pad + (rasterWidth - maskWidth) / 2;
  const maskY = pad + (rasterHeight - maskHeight) / 2;
  createMaskPath(ctx, mask, maskX, maskY, maskWidth, maskHeight);
  ctx.fill();
  ctx.restore();

  rasterCache = { image, key, canvas };
  return canvas;
}

/**
 * ウォーターマークを最前面へ描画する。preview / export の両 flavor がこの関数を共有する。
 */
export function drawWatermarkOverlayFrame(
  ctx: CanvasRenderingContext2D,
  overlay: WatermarkOverlay | null | undefined,
  image: HTMLImageElement | null | undefined,
  timeSec: number,
): boolean {
  if (!shouldDrawWatermarkOverlay(overlay, image, timeSec) || !overlay || !image) return false;

  const naturalCircleSize = Math.min(image.naturalWidth, image.naturalHeight);
  const width = (overlay.mask === 'circle' ? naturalCircleSize : image.naturalWidth) * overlay.size;
  const height = (overlay.mask === 'circle' ? naturalCircleSize : image.naturalHeight) * overlay.size;
  const featherPx = overlay.feather * (ctx.canvas.height / 1080);
  const raster = getRasterizedWatermark(
    image,
    width,
    height,
    overlay.mask,
    overlay.maskSize,
    featherPx,
  );
  const padX = (raster.width - Math.ceil(width)) / 2;
  const padY = (raster.height - Math.ceil(height)) / 2;
  const centerX = ctx.canvas.width * (overlay.positionX / 100);
  const centerY = ctx.canvas.height * (overlay.positionY / 100);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((overlay.rotation * Math.PI) / 180);
  ctx.globalAlpha = overlay.opacity;
  ctx.drawImage(raster, -width / 2 - padX, -height / 2 - padY);
  ctx.restore();
  return true;
}
