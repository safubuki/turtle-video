/**
 * @file canvasStore.test.ts
 * @description Tests for dynamic canvas size resolution and computed export bitrate.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyExportCanvasSize,
  useCanvasStore,
  computeCanvasSizeFromSource,
  resolveExportCanvasSize,
  resolveMediaBaseScale,
} from '../stores/canvasStore';
import {
  computeExportVideoBitrate,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
  MAX_CANVAS_WIDTH,
  MAX_CANVAS_HEIGHT,
  MAX_PREVIEW_CANVAS_WIDTH,
  MAX_PREVIEW_CANVAS_HEIGHT,
  EXPORT_VIDEO_BITRATE,
  EXPORT_VIDEO_BITRATE_MIN,
} from '../constants';

describe('computeCanvasSizeFromSource', () => {
  it('returns landscape fallback when source dimensions are invalid', () => {
    const fallback = computeCanvasSizeFromSource(0, 0);
    expect(fallback.width).toBe(MAX_CANVAS_WIDTH);
    expect(fallback.height).toBe(MAX_CANVAS_HEIGHT);
    const nanFallback = computeCanvasSizeFromSource(NaN, 720);
    expect(nanFallback.width).toBe(MAX_CANVAS_WIDTH);
    expect(nanFallback.height).toBe(MAX_CANVAS_HEIGHT);
  });

  it('keeps 16:9 source dimensions within cap', () => {
    expect(computeCanvasSizeFromSource(1280, 720)).toEqual({
      width: 1280,
      height: 720,
    });
    expect(computeCanvasSizeFromSource(854, 480)).toEqual({
      width: 854,
      height: 480,
    });
  });

  it('caps source dimensions to 1920x1080 maintaining aspect ratio (export cap)', () => {
    expect(computeCanvasSizeFromSource(3840, 2160)).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(computeCanvasSizeFromSource(1920, 1080)).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it('falls back to landscape default for portrait sources (landscape-only policy)', () => {
    const result = computeCanvasSizeFromSource(1080, 1920);
    expect(result.width).toBe(MAX_CANVAS_WIDTH);
    expect(result.height).toBe(MAX_CANVAS_HEIGHT);
  });

  it('normalizes non-16:9 landscape sources to a 16:9 canvas (pillarbox, source resolution preserved)', () => {
    // 16:9 より縦長: 高さを基準に左右へ 16:9 まで広げる（左右が黒帯）。
    expect(computeCanvasSizeFromSource(1024, 768)).toEqual({
      width: 1366,
      height: 768,
    });
    // ユーザー報告の例。元の 764px 高さを保持したまま 16:9 にする。
    expect(computeCanvasSizeFromSource(1204, 764)).toEqual({
      width: 1358,
      height: 764,
    });
  });

  it('normalizes ultra-wide landscape sources to 16:9 (letterbox)', () => {
    // 16:9 より横長: 幅を基準に上下へ広げる（上下が黒帯）。
    expect(computeCanvasSizeFromSource(1280, 536)).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it('caps preview at 1280x720 when given preview limits', () => {
    const result = computeCanvasSizeFromSource(
      1920,
      1080,
      MAX_PREVIEW_CANVAS_WIDTH,
      MAX_PREVIEW_CANVAS_HEIGHT,
    );
    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
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

  it('defaults to preview size 1280x720 with separate export cap of 1920x1080', () => {
    const state = useCanvasStore.getState();
    expect(state.width).toBe(DEFAULT_CANVAS_WIDTH);
    expect(state.height).toBe(DEFAULT_CANVAS_HEIGHT);
    expect(state.previewWidth).toBe(MAX_PREVIEW_CANVAS_WIDTH);
    expect(state.previewHeight).toBe(MAX_PREVIEW_CANVAS_HEIGHT);
    expect(state.exportWidth).toBe(MAX_CANVAS_WIDTH);
    expect(state.exportHeight).toBe(MAX_CANVAS_HEIGHT);
    expect(state.isExportMode).toBe(false);
  });

  it('applyFromSource updates both preview and export sizes independently', () => {
    useCanvasStore.getState().applyFromSource(1920, 1080);
    const state = useCanvasStore.getState();
    expect(state.previewWidth).toBe(1280);
    expect(state.previewHeight).toBe(720);
    expect(state.exportWidth).toBe(1920);
    expect(state.exportHeight).toBe(1080);
    // current visible size is preview while not in export mode
    expect(state.width).toBe(1280);
    expect(state.height).toBe(720);
  });

  it('beginExportMode switches current size to export dimensions', () => {
    useCanvasStore.getState().applyFromSource(1920, 1080);
    useCanvasStore.getState().beginExportMode();
    const state = useCanvasStore.getState();
    expect(state.isExportMode).toBe(true);
    expect(state.width).toBe(1920);
    expect(state.height).toBe(1080);
  });

  it('endExportMode restores preview dimensions', () => {
    useCanvasStore.getState().applyFromSource(1920, 1080);
    useCanvasStore.getState().beginExportMode();
    useCanvasStore.getState().endExportMode();
    const state = useCanvasStore.getState();
    expect(state.isExportMode).toBe(false);
    expect(state.width).toBe(1280);
    expect(state.height).toBe(720);
  });

  it('resetCanvasSize returns to defaults and exits export mode', () => {
    useCanvasStore.getState().applyFromSource(1920, 1080);
    useCanvasStore.getState().beginExportMode();
    useCanvasStore.getState().resetCanvasSize();
    const state = useCanvasStore.getState();
    expect(state.isExportMode).toBe(false);
    expect(state.width).toBe(DEFAULT_CANVAS_WIDTH);
    expect(state.height).toBe(DEFAULT_CANVAS_HEIGHT);
  });
});

describe('export quality mode', () => {
  beforeEach(() => {
    useCanvasStore.getState().resetCanvasSize();
    useCanvasStore.getState().setExportQuality('auto');
  });

  it('resolveExportCanvasSize maps quality modes to sizes', () => {
    // auto はソース基準（上限 1920×1080）
    expect(resolveExportCanvasSize('auto', 1280, 720)).toEqual({ width: 1280, height: 720 });
    expect(resolveExportCanvasSize('auto', 3840, 2160)).toEqual({ width: 1920, height: 1080 });
    expect(resolveExportCanvasSize('auto', null, null)).toEqual({ width: MAX_CANVAS_WIDTH, height: MAX_CANVAS_HEIGHT });
    // 固定モードはソースに依存しない
    expect(resolveExportCanvasSize('fhd', 640, 360)).toEqual({ width: 1920, height: 1080 });
    expect(resolveExportCanvasSize('hd', 3840, 2160)).toEqual({ width: 1280, height: 720 });
  });

  it('fhd forces 1920x1080 export even for low-res sources', () => {
    useCanvasStore.getState().setExportQuality('fhd');
    useCanvasStore.getState().applyFromSource(854, 480);
    const state = useCanvasStore.getState();
    expect(state.exportWidth).toBe(1920);
    expect(state.exportHeight).toBe(1080);
    // プレビューはソース基準のまま
    expect(state.previewWidth).toBe(854);
  });

  it('changing quality after applyFromSource recomputes export size', () => {
    useCanvasStore.getState().applyFromSource(854, 480);
    expect(useCanvasStore.getState().exportWidth).toBe(854);
    useCanvasStore.getState().setExportQuality('hd');
    expect(useCanvasStore.getState().exportWidth).toBe(1280);
    expect(useCanvasStore.getState().exportHeight).toBe(720);
    // auto に戻すとソース基準へ復帰
    useCanvasStore.getState().setExportQuality('auto');
    expect(useCanvasStore.getState().exportWidth).toBe(854);
  });

  it.each([
    ['fhd', 1920, 1080],
    ['hd', 1280, 720],
  ] as const)(
    '%s applies the selected size before returning encoder dimensions',
    (_quality, targetWidth, targetHeight) => {
      const canvas = { width: 854, height: 480 };

      const encoderSize = applyExportCanvasSize(canvas, targetWidth, targetHeight);

      expect(canvas).toEqual({ width: targetWidth, height: targetHeight });
      expect(encoderSize).toEqual({ width: targetWidth, height: targetHeight });
    },
  );
});

describe('computeExportVideoBitrate', () => {
  it('returns max 12 Mbps at 1920x1080', () => {
    expect(computeExportVideoBitrate(1920, 1080)).toBe(EXPORT_VIDEO_BITRATE);
  });

  it('scales down proportionally for smaller resolutions but respects min', () => {
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

describe('aspect ratio (portrait 9:16) support', () => {
  beforeEach(() => {
    useCanvasStore.getState().setAspectRatio('landscape');
    useCanvasStore.getState().resetCanvasSize();
    useCanvasStore.getState().setExportQuality('auto');
  });

  it('computeCanvasSizeFromSource portrait: 縦ソースはそのまま 9:16 枠に内包', () => {
    // 9:16 縦ソース（1080x1920 上限内）
    expect(computeCanvasSizeFromSource(1080, 1920, MAX_CANVAS_WIDTH, MAX_CANVAS_HEIGHT, 'portrait'))
      .toEqual({ width: 1080, height: 1920 });
    // 縦長だが 9:16 より細い（例 1000x1920）→ 高さ基準で 9:16 枠へ広げる
    const tall = computeCanvasSizeFromSource(1000, 1920, MAX_CANVAS_WIDTH, MAX_CANVAS_HEIGHT, 'portrait');
    expect(tall.height).toBe(1920);
    expect(tall.width % 2).toBe(0);
  });

  it('computeCanvasSizeFromSource portrait: 横ソースは既定 9:16 枠へフォールバック', () => {
    expect(computeCanvasSizeFromSource(1920, 1080, MAX_CANVAS_WIDTH, MAX_CANVAS_HEIGHT, 'portrait'))
      .toEqual({ width: 1080, height: 1920 });
  });

  it('resolveExportCanvasSize portrait: fhd=1080x1920 / hd=720x1280', () => {
    expect(resolveExportCanvasSize('fhd', 640, 360, 'portrait')).toEqual({ width: 1080, height: 1920 });
    expect(resolveExportCanvasSize('hd', 1920, 1080, 'portrait')).toEqual({ width: 720, height: 1280 });
    // auto でソース未知なら向きの既定枠（縦）
    expect(resolveExportCanvasSize('auto', null, null, 'portrait')).toEqual({ width: 1080, height: 1920 });
  });

  it('landscape の既定挙動は不変（回帰ガード）', () => {
    expect(resolveExportCanvasSize('fhd', 640, 360)).toEqual({ width: 1920, height: 1080 });
    expect(resolveExportCanvasSize('hd', 3840, 2160)).toEqual({ width: 1280, height: 720 });
    expect(computeCanvasSizeFromSource(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it('setAspectRatio(portrait) がプレビュー/エクスポート寸法を縦へ再計算する', () => {
    useCanvasStore.getState().setExportQuality('fhd');
    useCanvasStore.getState().applyFromSource(1920, 1080); // 横ソース
    // landscape 時
    expect(useCanvasStore.getState().exportWidth).toBe(1920);
    expect(useCanvasStore.getState().exportHeight).toBe(1080);
    // 縦へ切替
    useCanvasStore.getState().setAspectRatio('portrait');
    const s = useCanvasStore.getState();
    expect(s.aspectRatio).toBe('portrait');
    expect(s.exportWidth).toBe(1080);
    expect(s.exportHeight).toBe(1920);
    // プレビューも縦（横ソースは既定 9:16 枠へ）
    expect(s.previewWidth).toBeLessThan(s.previewHeight);
  });

  it('setAspectRatio(portrait) 後の resetCanvasSize は縦の既定枠を保つ', () => {
    useCanvasStore.getState().setAspectRatio('portrait');
    useCanvasStore.getState().resetCanvasSize();
    const s = useCanvasStore.getState();
    expect(s.aspectRatio).toBe('portrait');
    // プレビュー既定枠は縦（幅 < 高さ）
    expect(s.previewWidth).toBeLessThan(s.previewHeight);
  });
});

describe('resolveMediaBaseScale', () => {
  // 縦 canvas(1080x1920) に横素材(1920x1080)を cover: 高さを合わせ左右はみ出し
  it('cover は短辺を合わせて枠を埋める（横素材を縦フレームへ）', () => {
    const scale = resolveMediaBaseScale({
      canvasWidth: 1080, canvasHeight: 1920, elementWidth: 1920, elementHeight: 1080, mode: 'cover',
    });
    // cover = max(1080/1920, 1920/1080) = max(0.5625, 1.777) = 1.777...
    expect(scale).toBeCloseTo(1920 / 1080, 4);
    // 素材の描画高さ = 1080 * 1.777 = 1920（縦を埋める）、幅は 1920*1.777 > 1080（左右カット）
    expect(1080 * scale).toBeCloseTo(1920, 1);
    expect(1920 * scale).toBeGreaterThan(1080);
  });

  it('contain は全体が収まる（従来の横挙動）', () => {
    const scale = resolveMediaBaseScale({
      canvasWidth: 1920, canvasHeight: 1080, elementWidth: 1920, elementHeight: 1080, mode: 'contain',
    });
    // 16:9 素材を 16:9 枠へ → ぴったり 1.0
    expect(scale).toBeCloseTo(1, 4);
  });

  it('縦素材を縦 canvas に cover（同比率）はぴったり', () => {
    const scale = resolveMediaBaseScale({
      canvasWidth: 1080, canvasHeight: 1920, elementWidth: 1080, elementHeight: 1920, mode: 'cover',
    });
    expect(scale).toBeCloseTo(1, 4);
  });

  it('不正な素材寸法は 1 を返す（防御）', () => {
    expect(resolveMediaBaseScale({
      canvasWidth: 1080, canvasHeight: 1920, elementWidth: 0, elementHeight: 0, mode: 'cover',
    })).toBe(1);
  });
});
