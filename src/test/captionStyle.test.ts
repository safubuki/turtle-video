/**
 * captionStyle（サイズ/位置解決）のテスト
 */

import { describe, expect, it } from 'vitest';
import {
  CAPTION_FONT_SIZE_PRESETS,
  clampCustomFontSize,
  clampPositionPercent,
  resolveCaptionBaseFontSize,
  resolveCaptionAnchor,
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
});
