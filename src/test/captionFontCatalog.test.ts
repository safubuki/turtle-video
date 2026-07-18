/**
 * captionFontCatalog のテスト
 */

import { describe, expect, it } from 'vitest';
import type { CaptionFontStyle } from '../types';
import {
  BASIC_CAPTION_FONT_OPTIONS,
  CAPTION_FONT_FALLBACK_FAMILY,
  CAPTION_FONT_OPTIONS,
  EXTENDED_CAPTION_FONT_OPTIONS,
  isExtendedCaptionFontStyle,
  resolveCaptionFontFamily,
} from '../utils/captionFontCatalog';

describe('captionFontCatalog', () => {
  it('resolves every known font style to a non-empty family', () => {
    for (const option of CAPTION_FONT_OPTIONS) {
      expect(resolveCaptionFontFamily(option.value)).toBe(option.family);
      expect(option.family.length).toBeGreaterThan(0);
    }
  });

  it('keeps existing gothic/mincho families unchanged (regression guard)', () => {
    expect(resolveCaptionFontFamily('gothic')).toBe('sans-serif');
    expect(resolveCaptionFontFamily('mincho')).toContain('Yu Mincho');
    expect(resolveCaptionFontFamily('mincho')).toContain('serif');
  });

  it('falls back to sans-serif for unknown or missing values', () => {
    expect(resolveCaptionFontFamily(undefined)).toBe(CAPTION_FONT_FALLBACK_FAMILY);
    expect(resolveCaptionFontFamily(null)).toBe(CAPTION_FONT_FALLBACK_FAMILY);
    expect(resolveCaptionFontFamily('future-font' as CaptionFontStyle)).toBe(
      CAPTION_FONT_FALLBACK_FAMILY,
    );
  });

  it('splits basic (2) and extended options with no overlap', () => {
    expect(BASIC_CAPTION_FONT_OPTIONS.map((o) => o.value)).toEqual(['gothic', 'mincho']);
    expect(EXTENDED_CAPTION_FONT_OPTIONS.length).toBeGreaterThanOrEqual(4);
    for (const option of EXTENDED_CAPTION_FONT_OPTIONS) {
      expect(isExtendedCaptionFontStyle(option.value)).toBe(true);
    }
    expect(isExtendedCaptionFontStyle('gothic')).toBe(false);
    expect(isExtendedCaptionFontStyle(undefined)).toBe(false);
  });
});
