/**
 * @file watermarkOverlay.test.ts
 * @description Issue #210 の正規化・時間範囲・共通 Canvas 描画テスト。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WatermarkOverlay } from '../types';
import {
  DEFAULT_WATERMARK_OVERLAY,
  drawWatermarkOverlayFrame,
  normalizeWatermarkOverlay,
  normalizeWatermarkRange,
  resolveWatermarkPresetPosition,
  shouldDrawWatermarkOverlay,
} from '../utils/watermarkOverlay';

function createImage(): HTMLImageElement {
  return {
    complete: true,
    naturalWidth: 400,
    naturalHeight: 200,
    currentSrc: 'blob:logo',
    src: 'blob:logo',
  } as HTMLImageElement;
}

function activeOverlay(overrides: Partial<WatermarkOverlay> = {}): WatermarkOverlay {
  return {
    ...DEFAULT_WATERMARK_OVERLAY,
    file: new File(['logo'], 'logo.png', { type: 'image/png' }),
    url: 'blob:logo',
    startTime: 2,
    endTime: 8,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ウォーターマーク正規化', () => {
  it('数値を許容範囲へクランプし、不明なマスクを四角へ戻す', () => {
    const normalized = normalizeWatermarkOverlay({
      positionX: -10,
      positionY: 120,
      size: 999,
      opacity: -1,
      rotation: 999,
      maskSize: -1,
      feather: 999,
      mask: 'unknown' as WatermarkOverlay['mask'],
    });

    expect(normalized).toMatchObject({
      positionX: 0,
      positionY: 100,
      size: 3,
      opacity: 0,
      rotation: 180,
      maskSize: 5,
      feather: 40,
      mask: 'rectangle',
    });
  });

  it('表示範囲の逆転を防ぎ、プロジェクト尺へ収める', () => {
    expect(normalizeWatermarkRange(9, 2, 10)).toEqual({
      startTime: 9,
      endTime: 9.1,
    });
    expect(normalizeWatermarkRange(20, 30, 10)).toEqual({
      startTime: 9.9,
      endTime: 10,
    });
    expect(normalizeWatermarkRange(Number.POSITIVE_INFINITY, Number.NaN)).toEqual({
      startTime: 0,
      endTime: DEFAULT_WATERMARK_OVERLAY.endTime,
    });
  });
});

describe('ウォーターマーク描画', () => {
  it('非表示・範囲外・画像未準備では描かない', () => {
    const image = createImage();
    expect(shouldDrawWatermarkOverlay(activeOverlay({ enabled: false }), image, 4)).toBe(false);
    expect(shouldDrawWatermarkOverlay(activeOverlay(), image, 1.99)).toBe(false);
    expect(shouldDrawWatermarkOverlay(activeOverlay(), image, 8)).toBe(false);
    expect(shouldDrawWatermarkOverlay(activeOverlay(), { ...image, complete: false } as HTMLImageElement, 4)).toBe(false);
  });

  it('Canvas 比率の位置・サイズ・回転・不透明度で 1 回合成する', () => {
    const rasterDraw = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: rasterDraw,
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      filter: 'none',
    } as unknown as CanvasRenderingContext2D);

    const outerDraw = vi.fn();
    const translate = vi.fn();
    const rotate = vi.fn();
    const ctx = {
      canvas: { width: 1920, height: 1080 },
      globalAlpha: 1,
      save: vi.fn(),
      restore: vi.fn(),
      translate,
      rotate,
      drawImage: outerDraw,
    } as unknown as CanvasRenderingContext2D;

    const drew = drawWatermarkOverlayFrame(ctx, activeOverlay(), createImage(), 4);

    expect(drew).toBe(true);
    expect(rasterDraw).toHaveBeenCalled();
    expect(translate).toHaveBeenCalledWith(960, 540);
    expect(rotate).toHaveBeenCalledWith(0);
    expect(outerDraw).toHaveBeenCalledTimes(1);
    expect(ctx.globalAlpha).toBe(1);
  });

  it('マスク範囲を画像外周より内側へ縮めて描画する', () => {
    const rect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect,
      closePath: vi.fn(),
      fill: vi.fn(),
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      filter: 'none',
    } as unknown as CanvasRenderingContext2D);

    const ctx = {
      canvas: { width: 1920, height: 1080 },
      globalAlpha: 1,
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawWatermarkOverlayFrame(
      ctx,
      activeOverlay({ maskSize: 50 }),
      createImage(),
      4,
    );

    expect(rect).toHaveBeenCalledWith(100, 50, 200, 100);
  });

  it('円形マスクも画像の内側へ縮めて周辺余白を確保する', () => {
    const ellipse = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      ellipse,
      closePath: vi.fn(),
      fill: vi.fn(),
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      filter: 'none',
    } as unknown as CanvasRenderingContext2D);

    const ctx = {
      canvas: { width: 1920, height: 1080 },
      globalAlpha: 1,
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawWatermarkOverlayFrame(
      ctx,
      activeOverlay({ mask: 'circle', maskSize: 50 }),
      createImage(),
      4,
    );

    expect(ellipse).toHaveBeenCalledWith(100, 100, 50, 50, 0, 0, Math.PI * 2);
  });
});

describe('ウォーターマーク位置の簡単設定', () => {
  it('通常サイズでは左下を9/85、右下を91/85へ配置する', () => {
    const overlay = activeOverlay({
      positionX: 50,
      positionY: 50,
      size: 1,
      rotation: 0,
      maskSize: 100,
      feather: 0,
    });

    const leftBottom = resolveWatermarkPresetPosition({
      overlay,
      preset: 'bottom-left',
      imageNaturalWidth: 400,
      imageNaturalHeight: 200,
      canvasWidth: 1920,
      canvasHeight: 1080,
    });
    const rightBottom = resolveWatermarkPresetPosition({
      overlay,
      preset: 'bottom-right',
      imageNaturalWidth: 400,
      imageNaturalHeight: 200,
      canvasWidth: 1920,
      canvasHeight: 1080,
    });
    const leftTop = resolveWatermarkPresetPosition({
      overlay,
      preset: 'top-left',
      imageNaturalWidth: 400,
      imageNaturalHeight: 200,
      canvasWidth: 1920,
      canvasHeight: 1080,
    });
    const rightTop = resolveWatermarkPresetPosition({
      overlay,
      preset: 'top-right',
      imageNaturalWidth: 400,
      imageNaturalHeight: 200,
      canvasWidth: 1920,
      canvasHeight: 1080,
    });

    expect(leftBottom.positionX).toBe(9);
    expect(leftBottom.positionY).toBe(85);
    expect(rightBottom.positionX).toBe(91);
    expect(rightBottom.positionY).toBe(85);
    expect(leftTop).toEqual({ positionX: 9, positionY: 15 });
    expect(rightTop).toEqual({ positionX: 91, positionY: 15 });
  });

  it('回転・マスクサイズ・ぼかし後の可視範囲を位置余白へ反映する', () => {
    const position = resolveWatermarkPresetPosition({
      overlay: activeOverlay({
        size: 2,
        rotation: 90,
        maskSize: 50,
        feather: 10,
      }),
      preset: 'top-left',
      imageNaturalWidth: 400,
      imageNaturalHeight: 200,
      canvasWidth: 1920,
      canvasHeight: 1080,
    });

    expect(position.positionX).toBe(9);
    expect(position.positionY).toBeCloseTo(15.2778, 4);
  });

  it('中央は画像サイズにかかわらず縦横50%へ設定する', () => {
    expect(resolveWatermarkPresetPosition({
      overlay: activeOverlay(),
      preset: 'center',
      imageNaturalWidth: 400,
      imageNaturalHeight: 200,
      canvasWidth: 1920,
      canvasHeight: 1080,
    })).toEqual({ positionX: 50, positionY: 50 });
  });
});
