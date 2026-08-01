import { describe, expect, it } from 'vitest';
import {
  buildCaptionLayerVideoFileName,
  buildCaptionSubtitleFileName,
  canAttemptAlphaWebmExport,
  DEFAULT_EXPORT_OUTPUT_OPTIONS,
  normalizeExportOutputOptions,
  resolveCaptionLayerFormatDescriptor,
  resolveCaptionLayerFormatWithFallback,
} from '../utils/captionLayerExport';

describe('captionLayerExport pure logic', () => {
  it('normalizes defaults', () => {
    expect(normalizeExportOutputOptions(null)).toEqual(DEFAULT_EXPORT_OUTPUT_OPTIONS);
    expect(normalizeExportOutputOptions({ contentMode: 'caption-layer' }).contentMode).toBe(
      'caption-layer',
    );
  });

  it('resolves format descriptors', () => {
    expect(resolveCaptionLayerFormatDescriptor('black-matte-mp4').ext).toBe('mp4');
    expect(resolveCaptionLayerFormatDescriptor('alpha-webm').matte).toBe('transparent');
    expect(resolveCaptionLayerFormatDescriptor('luminance-key-mp4').forceWhiteGlyphs).toBe(true);
  });

  it('falls back from alpha when unsupported', () => {
    const result = resolveCaptionLayerFormatWithFallback('alpha-webm', { canAlphaWebm: false });
    expect(result).toEqual({ format: 'black-matte-mp4', fellBack: true });
  });

  it('builds file names', () => {
    expect(buildCaptionLayerVideoFileName('black-matte-mp4', 1)).toBe('turtle_caption_layer_1.mp4');
    expect(buildCaptionLayerVideoFileName('alpha-webm', 2)).toBe('turtle_caption_alpha_2.webm');
    expect(buildCaptionSubtitleFileName('srt', 3)).toBe('turtle_captions_3.srt');
  });

  it('detects alpha attempt capability heuristically', () => {
    expect(canAttemptAlphaWebmExport({ VideoEncoder: function VideoEncoder() {} })).toBe(true);
    expect(canAttemptAlphaWebmExport({})).toBe(false);
  });
});
