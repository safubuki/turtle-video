/**
 * captionStyle（サイズ/位置解決）のテスト
 */

import { describe, expect, it } from 'vitest';
import {
  CAPTION_FONT_SIZE_PRESETS,
  clampCaptionStrokeWidth,
  clampCustomFontSize,
  clampPositionPercent,
  resolveCaptionBaseFontSize,
  resolveCaptionAnchor,
  resolveCaptionGlyphStyle,
} from '../utils/captionStyle';

const layout = { canvasWidth: 1920, canvasHeight: 1080, fontSize: 80, padding: 50 };

describe('resolveCaptionBaseFontSize', () => {
  it('prefers per-caption override preset over settings custom value', () => {
    expect(resolveCaptionBaseFontSize(
      { overrideFontSize: 'large' },
      { fontSize: 'medium', fontSizeCustom: 100 },
    )).toBe(CAPTION_FONT_SIZE_PRESETS.large);
  });

  it('uses the custom value when no override is set', () => {
    expect(resolveCaptionBaseFontSize(
      {},
      { fontSize: 'medium', fontSizeCustom: 100 },
    )).toBe(100);
  });

  it('falls back to the preset when custom is null', () => {
    expect(resolveCaptionBaseFontSize(
      {},
      { fontSize: 'small', fontSizeCustom: null },
    )).toBe(CAPTION_FONT_SIZE_PRESETS.small);
  });

  it('clamps out-of-range custom values', () => {
    expect(clampCustomFontSize(5)).toBe(24);
    expect(clampCustomFontSize(999)).toBe(240);
  });

  it('per-caption custom px wins over every other source', () => {
    expect(resolveCaptionBaseFontSize(
      { overrideFontSize: 'large', overrideFontSizeCustom: 64 },
      { fontSize: 'medium', fontSizeCustom: 100 },
    )).toBe(64);
    // クランプも適用される
    expect(resolveCaptionBaseFontSize(
      { overrideFontSizeCustom: 999 },
      { fontSize: 'medium', fontSizeCustom: null },
    )).toBe(240);
  });
});

describe('clampCaptionStrokeWidth', () => {
  it('縁幅を0〜20pxの0.5px刻みに正規化する', () => {
    expect(clampCaptionStrokeWidth(-1)).toBe(0);
    expect(clampCaptionStrokeWidth(4.26)).toBe(4.5);
    expect(clampCaptionStrokeWidth(99)).toBe(20);
    expect(clampCaptionStrokeWidth(Number.NaN)).toBe(2);
  });
});

describe('resolveCaptionGlyphStyle', () => {
  const settings = {
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 4,
    blur: 1.5,
  };

  it('個別値がない項目は一括設定へフォールバックする', () => {
    expect(resolveCaptionGlyphStyle({}, settings)).toEqual(settings);
  });

  it('設定された項目だけ個別値を優先し、範囲外の幅とぼかしを正規化する', () => {
    expect(resolveCaptionGlyphStyle({
      overrideFontColor: '#123456',
      overrideStrokeColor: '#ABCDEF',
      overrideStrokeWidth: 99,
      overrideBlur: -1,
    }, settings)).toEqual({
      fontColor: '#123456',
      strokeColor: '#ABCDEF',
      strokeWidth: 20,
      blur: 0,
    });
  });
});

describe('resolveCaptionAnchor', () => {
  it('uses preset positions when no custom XY is set', () => {
    expect(resolveCaptionAnchor({}, { position: 'top', positionCustom: null }, layout))
      .toEqual({ x: 960, y: 50 + 40 });
    expect(resolveCaptionAnchor({}, { position: 'center', positionCustom: null }, layout))
      .toEqual({ x: 960, y: 540 });
    expect(resolveCaptionAnchor({}, { position: 'bottom', positionCustom: null }, layout))
      .toEqual({ x: 960, y: 1080 - 50 - 40 });
  });

  it('uses the custom XY percentage when set', () => {
    expect(resolveCaptionAnchor({}, { position: 'bottom', positionCustom: { x: 25, y: 10 } }, layout))
      .toEqual({ x: 480, y: 108 });
  });

  it('per-caption override preset wins over custom XY', () => {
    expect(resolveCaptionAnchor(
      { overridePosition: 'center' },
      { position: 'bottom', positionCustom: { x: 25, y: 10 } },
      layout,
    )).toEqual({ x: 960, y: 540 });
  });

  it('clamps custom percentages into 0-100', () => {
    expect(clampPositionPercent(-10)).toBe(0);
    expect(clampPositionPercent(140)).toBe(100);
  });

  it('per-caption custom XY wins over override preset and bulk custom', () => {
    expect(resolveCaptionAnchor(
      { overridePosition: 'center', overridePositionCustom: { x: 10, y: 20 } },
      { position: 'bottom', positionCustom: { x: 25, y: 10 } },
      layout,
    )).toEqual({ x: 192, y: 216 });
  });
});
