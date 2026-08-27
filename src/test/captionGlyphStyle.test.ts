import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTION_GLYPH_CANVAS_CACHE_MAX_ENTRIES,
  createCaptionGlyphCanvas,
  getOrCreateCaptionGlyphCanvas,
} from '../utils/canvas';

function stubCanvasContext(): CanvasRenderingContext2D {
  return {
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineJoin: 'miter',
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    fontKerning: 'auto',
    textRendering: 'auto',
    scale: vi.fn(),
    strokeText: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({
      width: 40,
      actualBoundingBoxAscent: 20,
      actualBoundingBoxDescent: 8,
    })),
  } as unknown as CanvasRenderingContext2D;
}

describe('caption glyph style', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('設定した黒い縁と白い文字本体をオフスクリーンCanvasへ反映する', () => {
    const measureContext = {
      font: '',
      textBaseline: 'alphabetic',
      measureText: vi.fn(() => ({
        width: 120,
        actualBoundingBoxAscent: 60,
        actualBoundingBoxDescent: 20,
      })),
    } as unknown as CanvasRenderingContext2D;
    const drawContext = {
      font: '',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      lineJoin: 'miter',
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      fontKerning: 'auto',
      textRendering: 'auto',
      scale: vi.fn(),
      strokeText: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValueOnce(measureContext)
      .mockReturnValueOnce(drawContext);

    createCaptionGlyphCanvas({
      text: '見本',
      font: '80px sans-serif',
      fillColor: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 4.5,
    });

    expect(drawContext.strokeStyle).toBe('#000000');
    expect(drawContext.lineWidth).toBe(9);
    expect(drawContext.fillStyle).toBe('#FFFFFF');
    expect(drawContext.strokeText).toHaveBeenCalledOnce();
    expect(drawContext.fillText).toHaveBeenCalledOnce();
    expect(vi.mocked(drawContext.strokeText).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(drawContext.fillText).mock.invocationCallOrder[0]
    );
  });

  it('品質優先時はグリフを2倍解像度で描き、論理座標系を維持する', () => {
    const measureContext = {
      font: '',
      textBaseline: 'alphabetic',
      measureText: vi.fn(() => ({
        width: 100,
        actualBoundingBoxAscent: 50,
        actualBoundingBoxDescent: 10,
      })),
    } as unknown as CanvasRenderingContext2D;
    const drawContext = {
      font: '',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      lineJoin: 'miter',
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      fontKerning: 'auto',
      textRendering: 'auto',
      scale: vi.fn(),
      strokeText: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValueOnce(measureContext)
      .mockReturnValueOnce(drawContext);

    const canvas = createCaptionGlyphCanvas({
      text: '字幕',
      font: '80px sans-serif',
      fillColor: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 4,
      pixelRatio: 2,
    });

    expect(canvas.width).toBe(264);
    expect(canvas.height).toBe(184);
    expect(drawContext.scale).toHaveBeenCalledWith(2, 2);
    expect(drawContext.imageSmoothingQuality).toBe('high');
    expect(drawContext.fontKerning).toBe('normal');
    expect(drawContext.textRendering).toBe('optimizeLegibility');
  });

  it('同一オプションはキャッシュを再利用し、文字が変わったら作り直す', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => stubCanvasContext());
    const cache = new Map<string, HTMLCanvasElement>();
    const options = {
      text: '字幕',
      font: '80px sans-serif',
      fillColor: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 4,
    };

    const first = getOrCreateCaptionGlyphCanvas(options, cache);
    const second = getOrCreateCaptionGlyphCanvas(options, cache);
    expect(second).toBe(first);
    expect(cache.size).toBe(1);

    const other = getOrCreateCaptionGlyphCanvas({ ...options, text: '別' }, cache);
    expect(other).not.toBe(first);
    expect(cache.size).toBe(2);
  });

  it('キャッシュ上限を超えたら最も古いエントリだけを捨て、描画中に全件破棄しない', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => stubCanvasContext());
    const cache = new Map<string, HTMLCanvasElement>();
    const base = {
      font: '80px sans-serif',
      fillColor: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 4,
    };
    const kept = getOrCreateCaptionGlyphCanvas({ ...base, text: '残す' }, cache);
    const oldestExtra = getOrCreateCaptionGlyphCanvas({ ...base, text: 't0' }, cache);

    for (let i = 1; i < CAPTION_GLYPH_CANVAS_CACHE_MAX_ENTRIES - 1; i += 1) {
      getOrCreateCaptionGlyphCanvas({ ...base, text: `t${i}` }, cache);
    }
    expect(cache.size).toBe(CAPTION_GLYPH_CANVAS_CACHE_MAX_ENTRIES);

    expect(getOrCreateCaptionGlyphCanvas({ ...base, text: '残す' }, cache)).toBe(kept);
    getOrCreateCaptionGlyphCanvas({ ...base, text: '新しい' }, cache);

    expect(cache.size).toBe(CAPTION_GLYPH_CANVAS_CACHE_MAX_ENTRIES);
    expect(getOrCreateCaptionGlyphCanvas({ ...base, text: '残す' }, cache)).toBe(kept);
    expect(getOrCreateCaptionGlyphCanvas({ ...base, text: 't0' }, cache)).not.toBe(oldestExtra);
  });
});
