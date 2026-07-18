/**
 * captionFontCatalog のテスト
 */

import { describe, expect, it } from 'vitest';
import type { CaptionFontStyle } from '../types';
import {
  BASIC_CAPTION_FONT_OPTIONS,
  CAPTION_FONT_FALLBACK_FAMILY,
  CAPTION_FONT_OPTIONS,
  DROPDOWN_CAPTION_FONT_OPTIONS,
  EXTENDED_CAPTION_FONT_OPTIONS,
  createLocalFontValue,
  getAvailableDropdownFontOptions,
  getAvailablePinnedFontOptions,
  getLocalFontFamilyFromValue,
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

describe('captionFontCatalog v3 (availability & local fonts)', () => {
  it('resolves local: values to the raw family with a safe fallback', () => {
    expect(resolveCaptionFontFamily('local:Meiryo UI')).toBe('"Meiryo UI", sans-serif');
    expect(getLocalFontFamilyFromValue('local:Meiryo UI')).toBe('Meiryo UI');
    expect(getLocalFontFamilyFromValue('gothic')).toBeNull();
    expect(getLocalFontFamilyFromValue('local:')).toBeNull();
    expect(createLocalFontValue('Yu Gothic UI')).toBe('local:Yu Gothic UI');
    // local: 値は拡張フォント扱い
    expect(isExtendedCaptionFontStyle('local:Meiryo UI')).toBe(true);
  });

  it('hides legacy-only entries (handwriting) from the dropdown but keeps rendering', () => {
    expect(DROPDOWN_CAPTION_FONT_OPTIONS.some((o) => o.value === 'handwriting')).toBe(false);
    // 過去データの描画互換は維持
    expect(resolveCaptionFontFamily('handwriting')).toContain('cursive');
  });

  it('filters dropdown options by font availability (detector injected)', () => {
    // 何も実在しない端末 → 総称ファミリ（等幅/端末標準など detectFamilies なし）だけ残る
    const none = getAvailableDropdownFontOptions(() => false);
    expect(none.every((o) => !o.detectFamilies)).toBe(true);
    expect(none.some((o) => o.value === 'system')).toBe(true);
    expect(none.some((o) => o.value === 'mono')).toBe(true);

    // 全部実在する端末 → 候補が全て出る
    const all = getAvailableDropdownFontOptions(() => true);
    expect(all.length).toBe(DROPDOWN_CAPTION_FONT_OPTIONS.length);
    expect(all.some((o) => o.value === 'meiryo')).toBe(true);
    expect(all.some((o) => o.value === 'gyosho')).toBe(true);
  });

  it('hides the rounded pinned button when the font is not installed', () => {
    const noneAvailable = getAvailablePinnedFontOptions(() => false);
    expect(noneAvailable.map((o) => o.value)).toEqual(['gothic', 'mincho']);

    const allAvailable = getAvailablePinnedFontOptions(() => true);
    expect(allAvailable.map((o) => o.value)).toEqual(['gothic', 'mincho', 'rounded']);
  });

  it('keeps every catalog family ending with a generic fallback', () => {
    const generic = ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui'];
    for (const option of CAPTION_FONT_OPTIONS) {
      const last = option.family.split(',').map((s) => s.trim()).pop() ?? '';
      expect(generic).toContain(last);
    }
  });
});
