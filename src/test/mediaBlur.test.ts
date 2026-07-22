import { describe, expect, it } from 'vitest';
import {
  MAX_MEDIA_BLUR,
  normalizeMediaBlur,
  prepareUniformMediaBlurSource,
  resolveMediaBlurPixels,
  resolveMediaBlurFilter,
  resolveUniformMediaBlurSize,
} from '../utils/canvas';

describe('media blur', () => {
  it('旧データや不正値をぼかしなしとして扱い、UI上限へ正規化する', () => {
    expect(normalizeMediaBlur(undefined)).toBe(0);
    expect(normalizeMediaBlur(Number.NaN)).toBe(0);
    expect(normalizeMediaBlur(-1)).toBe(0);
    expect(normalizeMediaBlur(12.5)).toBe(12.5);
    expect(normalizeMediaBlur(100)).toBe(MAX_MEDIA_BLUR);
  });

  it('1080p基準値を横長・縦長Canvasへ同じ比率で変換する', () => {
    expect(resolveMediaBlurPixels(12, 1920, 1080)).toBe(12);
    expect(resolveMediaBlurPixels(12, 1280, 720)).toBe(8);
    expect(resolveMediaBlurFilter(12, 1920, 1080)).toBe('blur(12px)');
    expect(resolveMediaBlurFilter(12, 1080, 1920)).toBe('blur(12px)');
    expect(resolveMediaBlurFilter(12, 1280, 720)).toBe('blur(8px)');
  });

  it('ぼかしなしとミニプレビューの縮尺を正しく返す', () => {
    expect(resolveMediaBlurFilter(0, 1920, 1080)).toBe('none');
    expect(resolveMediaBlurFilter(30, 96, 54)).toBe('blur(1.5px)');
  });

  it('素材範囲内の縮小平均化Canvasを作り、外側の透明色をぼかしへ混ぜない', () => {
    expect(resolveUniformMediaBlurSize(1920, 1080, 15, 1)).toEqual({
      width: 226,
      height: 127,
    });

    const source = document.createElement('canvas');
    source.width = 1920;
    source.height = 1080;
    const blurredSource = prepareUniformMediaBlurSource(source, 1920, 1080, 15, 1);

    expect(blurredSource).toBeInstanceOf(HTMLCanvasElement);
    expect(blurredSource).not.toBe(source);
    expect((blurredSource as HTMLCanvasElement).width).toBe(226);
    expect((blurredSource as HTMLCanvasElement).height).toBe(127);
  });
});
