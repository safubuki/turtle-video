/**
 * キャプション背景帯の純ロジックテスト
 */
import { describe, expect, it, vi } from 'vitest';
import {
  CAPTION_BACKGROUND_DEFAULT,
  clampCaptionBackgroundOpacity,
  clampCaptionBackgroundRadius,
  drawCaptionBackgroundBand,
  resolveCaptionBackgroundStyle,
} from '../utils/captionStyle';
import type { CaptionSettings } from '../types';

const bulkSettings: Pick<
  CaptionSettings,
  'backgroundEnabled' | 'backgroundColor' | 'backgroundOpacity' | 'backgroundRadius'
> = {
  backgroundEnabled: false,
  backgroundColor: '#000000',
  backgroundOpacity: 0.45,
  backgroundRadius: 16,
};

describe('clampCaptionBackgroundOpacity / Radius', () => {
  it('既定値と範囲・刻みを守る', () => {
    expect(clampCaptionBackgroundOpacity(Number.NaN)).toBe(
      CAPTION_BACKGROUND_DEFAULT.backgroundOpacity,
    );
    expect(clampCaptionBackgroundOpacity(-1)).toBe(0);
    expect(clampCaptionBackgroundOpacity(2)).toBe(1);
    expect(clampCaptionBackgroundOpacity(0.47)).toBe(0.45);

    expect(clampCaptionBackgroundRadius(Number.NaN)).toBe(
      CAPTION_BACKGROUND_DEFAULT.backgroundRadius,
    );
    expect(clampCaptionBackgroundRadius(-5)).toBe(0);
    expect(clampCaptionBackgroundRadius(999)).toBe(80);
  });
});

describe('resolveCaptionBackgroundStyle', () => {
  it('未設定なら一括設定を継承する', () => {
    expect(resolveCaptionBackgroundStyle({}, bulkSettings)).toEqual(bulkSettings);
  });

  it('個別 override だけを優先する', () => {
    const resolved = resolveCaptionBackgroundStyle(
      {
        overrideBackgroundEnabled: true,
        overrideBackgroundOpacity: 0.65,
      },
      bulkSettings,
    );
    expect(resolved.backgroundEnabled).toBe(true);
    expect(resolved.backgroundColor).toBe('#000000');
    expect(resolved.backgroundOpacity).toBe(0.65);
    expect(resolved.backgroundRadius).toBe(16);
  });
});

describe('drawCaptionBackgroundBand', () => {
  function createCtx() {
    const fillRect = vi.fn();
    const beginPath = vi.fn();
    const roundRect = vi.fn();
    const fill = vi.fn();
    const ctx = {
      globalAlpha: 1,
      filter: 'none',
      fillStyle: '',
      fillRect,
      beginPath,
      roundRect,
      fill,
    } as unknown as CanvasRenderingContext2D;
    return { ctx, fillRect, beginPath, roundRect, fill };
  }

  it('OFF または opacity 0 では描画しない', () => {
    const { ctx, fillRect } = createCtx();
    expect(
      drawCaptionBackgroundBand(ctx, {
        centerX: 100,
        centerY: 200,
        glyphWidth: 80,
        glyphHeight: 40,
        fontSize: 40,
        fadeAlpha: 1,
        backgroundEnabled: false,
        backgroundColor: '#000000',
        backgroundOpacity: 0.45,
        backgroundRadius: 16,
        layoutScale: 1,
      }),
    ).toBe(false);
    expect(fillRect).not.toHaveBeenCalled();
  });

  it('ON のとき文字サイズ＋余白で帯を敷く', () => {
    const { ctx, fillRect, beginPath, roundRect, fill } = createCtx();
    const drew = drawCaptionBackgroundBand(ctx, {
      centerX: 100,
      centerY: 200,
      glyphWidth: 80,
      glyphHeight: 40,
      fontSize: 40,
      fadeAlpha: 0.8,
      backgroundEnabled: true,
      backgroundColor: '#000000',
      backgroundOpacity: 0.5,
      backgroundRadius: 16,
      layoutScale: 1,
    });
    expect(drew).toBe(true);
    // roundRect がある環境では roundRect 経路
    expect(beginPath).toHaveBeenCalled();
    expect(roundRect).toHaveBeenCalled();
    expect(fill).toHaveBeenCalled();
    expect(fillRect).not.toHaveBeenCalled();
    // alpha は fade * opacity
    expect(ctx.globalAlpha).toBe(1); // 復元される
  });
});
