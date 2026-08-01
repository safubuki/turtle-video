import { describe, expect, it } from 'vitest';
import { computeCaptionLayerVideoBitrate } from '../flavors/standard/export/captionLayerOfflineEncode';

describe('caption layer offline encode quality', () => {
  it('文字と透過境界を守るため通常エクスポートの2倍ビットレートを要求する', () => {
    expect(computeCaptionLayerVideoBitrate(1920, 1080)).toBe(24_000_000);
    expect(computeCaptionLayerVideoBitrate(1280, 720)).toBe(12_000_000);
  });
});
