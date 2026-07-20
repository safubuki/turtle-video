import { describe, expect, it } from 'vitest';
import type { Caption } from '../types';
import {
  createClearedCaptionIndividualSettings,
  hasCaptionIndividualSettings,
} from '../utils/captionIndividualSettings';

const baseCaption: Caption = {
  id: 'caption-1',
  text: '1行目\n2行目',
  startTime: 1,
  endTime: 5,
  fadeIn: true,
  fadeOut: true,
  fadeInDuration: 0.5,
  fadeOutDuration: 0.5,
};

describe('caption individual settings', () => {
  it('detects every persisted individual setting including durations and sequential settings', () => {
    expect(hasCaptionIndividualSettings(baseCaption)).toBe(false);
    expect(hasCaptionIndividualSettings({ ...baseCaption, overrideFadeOutDuration: 1 })).toBe(true);
    expect(hasCaptionIndividualSettings({ ...baseCaption, overridePositionCustom: { x: 20, y: 80 } })).toBe(true);
    expect(hasCaptionIndividualSettings({ ...baseCaption, sequentialGapSec: 0 })).toBe(true);
  });

  it('clears only individual settings and keeps text and timeline values', () => {
    const configured: Caption = {
      ...baseCaption,
      overrideFontStyle: 'mincho',
      overrideFadeOut: 'on',
      overrideFadeOutDuration: 1,
      sequentialFadeMode: 'line',
      sequentialGapSec: 0.2,
    };
    const cleared = { ...configured, ...createClearedCaptionIndividualSettings() };

    expect(hasCaptionIndividualSettings(cleared)).toBe(false);
    expect(cleared.text).toBe(configured.text);
    expect(cleared.startTime).toBe(configured.startTime);
    expect(cleared.endTime).toBe(configured.endTime);
    expect(cleared.fadeIn).toBe(configured.fadeIn);
    expect(cleared.fadeOut).toBe(configured.fadeOut);
  });
});
