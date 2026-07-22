import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCaptionGlyphCanvas } from '../utils/canvas';

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
    expect(vi.mocked(drawContext.strokeText).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(drawContext.fillText).mock.invocationCallOrder[0]);
  });
});
