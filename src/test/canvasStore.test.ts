/**
 * @file canvasStore.test.ts
 * @description Tests for dynamic canvas size resolution and computed export bitrate.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasStore, computeCanvasSizeFromSource } from '../stores/canvasStore';
import {
  computeExportVideoBitrate,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
  MAX_CANVAS_WIDTH,
  MAX_CANVAS_HEIGHT,
  EXPORT_VIDEO_BITRATE,
  EXPORT_VIDEO_BITRATE_MIN,
} from '../constants';

describe('computeCanvasSizeFromSource', () => {
  it('returns default 1920x1080 when source dimensions are invalid', () => {
    expect(computeCanvasSizeFromSource(0, 0)).toEqual({
      width: DEFAULT_CANVAS_WIDTH,
      height: DEFAULT_CANVAS_HEIGHT,
    });
    expect(computeCanvasSizeFromSource(NaN, 720)).toEqual({
      width: DEFAULT_CANVAS_WIDTH,
      height: DEFAULT_CANVAS_HEIGHT,
    });
  });

  it('uses source dimensions when within cap (landscape)', () => {
    expect(computeCanvasSizeFromSource(1280, 720)).toEqual({
      width: 1280,
      height: 720,
    });
    expect(computeCanvasSizeFromSource(854, 480)).toEqual({
      width: 854,
      height: 480,
    });
  });

  it('caps source dimensions to 1920x1080 maintaining aspect ratio', () => {
    expect(computeCanvasSizeFromSource(3840, 2160)).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(computeCanvasSizeFromSource(1920, 1080)).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it('falls back to default 1920x1080 for portrait sources (landscape-only policy)', () => {
    expect(computeCanvasSizeFromSource(1080, 1920)).toEqual({
      width: DEFAULT_CANVAS_WIDTH,
      height: DEFAULT_CANVAS_HEIGHT,
    });
  });

  it('preserves non-16:9 landscape aspect ratios', () => {
    // 4:3 source 1024x768
    expect(computeCanvasSizeFromSource(1024, 768)).toEqual({
      width: 1024,
      height: 768,
    });
  });

  it('produces even width/height values (H.264 requirement)', () => {
    const result = computeCanvasSizeFromSource(1919, 1079);
    expect(result.width % 2).toBe(0);
    expect(result.height % 2).toBe(0);
  });
});

describe('useCanvasStore', () => {
  beforeEach(() => {
    useCanvasStore.getState().resetCanvasSize();
  });

  it('defaults to 1920x1080', () => {
    const { width, height } = useCanvasStore.getState();
    expect(width).toBe(MAX_CANVAS_WIDTH);
    expect(height).toBe(MAX_CANVAS_HEIGHT);
  });

  it('applyFromSource updates dimensions according to source', () => {
    useCanvasStore.getState().applyFromSource(1280, 720);
    expect(useCanvasStore.getState().width).toBe(1280);
    expect(useCanvasStore.getState().height).toBe(720);
  });

  it('applyFromSource caps oversized sources', () => {
    useCanvasStore.getState().applyFromSource(3840, 2160);
    expect(useCanvasStore.getState().width).toBe(1920);
    expect(useCanvasStore.getState().height).toBe(1080);
  });

  it('resetCanvasSize returns to default', () => {
    useCanvasStore.getState().applyFromSource(1280, 720);
    useCanvasStore.getState().resetCanvasSize();
    expect(useCanvasStore.getState().width).toBe(DEFAULT_CANVAS_WIDTH);
    expect(useCanvasStore.getState().height).toBe(DEFAULT_CANVAS_HEIGHT);
  });
});

describe('computeExportVideoBitrate', () => {
  it('returns max 12 Mbps at 1920x1080', () => {
    expect(computeExportVideoBitrate(1920, 1080)).toBe(EXPORT_VIDEO_BITRATE);
  });

  it('scales down proportionally for smaller resolutions', () => {
    // 1280x720 has ~44% of the pixels of 1920x1080
    // but minimum is 6 Mbps so the 1280x720 result is the floor
    const bitrate = computeExportVideoBitrate(1280, 720);
    expect(bitrate).toBeGreaterThanOrEqual(EXPORT_VIDEO_BITRATE_MIN);
    expect(bitrate).toBeLessThanOrEqual(EXPORT_VIDEO_BITRATE);
  });

  it('does not go below the minimum (6 Mbps)', () => {
    expect(computeExportVideoBitrate(640, 360)).toBe(EXPORT_VIDEO_BITRATE_MIN);
  });

  it('returns max bitrate for invalid dimensions', () => {
    expect(computeExportVideoBitrate(0, 0)).toBe(EXPORT_VIDEO_BITRATE);
  });
});
