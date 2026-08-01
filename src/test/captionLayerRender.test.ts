import { describe, expect, it, vi } from 'vitest';
import type { Caption, CaptionSettings, VideoTitleSettings } from '../types';
import { drawCaptionLayerFrame } from '../utils/captionLayerRender';
import { DEFAULT_VIDEO_TITLE_SETTINGS } from '../utils/videoTitle';

function createMockCtx(width = 320, height = 180) {
  const fillRect = vi.fn();
  const clearRect = vi.fn();
  const drawImage = vi.fn();
  const save = vi.fn();
  const restore = vi.fn();
  const beginPath = vi.fn();
  const fill = vi.fn();
  const roundRect = vi.fn();
  const setTransform = vi.fn();

  const canvas = {
    width,
    height,
  } as HTMLCanvasElement;

  const ctx = {
    canvas,
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    fillRect,
    clearRect,
    drawImage,
    save,
    restore,
    beginPath,
    fill,
    roundRect,
    setTransform,
  } as unknown as CanvasRenderingContext2D;

  return { ctx, fillRect, clearRect, drawImage, save, restore };
}

const baseSettings: CaptionSettings = {
  enabled: true,
  fontSize: 'medium',
  fontStyle: 'gothic',
  fontColor: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 2,
  position: 'bottom',
  blur: 0,
  backgroundEnabled: false,
  backgroundColor: '#000000',
  backgroundOpacity: 0.45,
  backgroundRadius: 16,
  bulkFadeIn: false,
  bulkFadeOut: false,
  bulkFadeInDuration: 0.5,
  bulkFadeOutDuration: 0.5,
};

function makeCaption(partial: Partial<Caption> & Pick<Caption, 'id' | 'text' | 'startTime' | 'endTime'>): Caption {
  return {
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 0.5,
    fadeOutDuration: 0.5,
    ...partial,
  };
}

describe('drawCaptionLayerFrame', () => {
  it('fills black matte and does not clear for black matte', () => {
    const { ctx, fillRect, clearRect } = createMockCtx();
    // createCaptionGlyphCanvas needs real canvas in jsdom — may fail draw but matte runs first
    try {
      drawCaptionLayerFrame(ctx, 0.5, [], baseSettings, null, { matte: 'black' });
    } catch {
      // glyph canvas may throw in minimal mock; matte calls happen before
    }
    expect(clearRect).not.toHaveBeenCalled();
    expect(fillRect).toHaveBeenCalled();
  });

  it('clears for transparent matte', () => {
    const { ctx, clearRect, fillRect } = createMockCtx();
    try {
      drawCaptionLayerFrame(ctx, 0.5, [], baseSettings, null, { matte: 'transparent' });
    } catch {
      // ignore glyph path
    }
    expect(clearRect).toHaveBeenCalled();
    // transparent path should not fill black as matte (fillRect may still be used by glyphs)
    expect(fillRect).not.toHaveBeenCalled();
  });
});

// jsdom では createCaptionGlyphCanvas が実 Canvas を使うため、統合に近い描画は
// 実ブラウザ検証に委ね、ここでは matte 分岐の契約だけを固定する。
describe('drawCaptionLayerFrame contracts', () => {
  it('accepts luminance-key matte without throwing on empty captions', () => {
    const { ctx } = createMockCtx();
    expect(() =>
      drawCaptionLayerFrame(ctx, 0, [], baseSettings, {
        ...DEFAULT_VIDEO_TITLE_SETTINGS,
        text: '',
        enabled: false,
      } satisfies VideoTitleSettings, { matte: 'luminance-key', forceWhiteGlyphs: true }),
    ).not.toThrow();
  });

  it('skips disabled captions list when settings.enabled is false', () => {
    const { ctx, drawImage } = createMockCtx();
    const captions = [makeCaption({ id: 'c1', text: 'Hi', startTime: 0, endTime: 2 })];
    drawCaptionLayerFrame(
      ctx,
      0.5,
      captions,
      { ...baseSettings, enabled: false },
      null,
      { matte: 'black' },
    );
    expect(drawImage).not.toHaveBeenCalled();
  });
});
