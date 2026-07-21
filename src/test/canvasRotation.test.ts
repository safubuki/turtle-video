/**
 * canvas.ts の回転ヘルパー（純ロジック）のテスト。
 * normalizeRotation / getNextRotation / resolveRotatedFitDimensions は
 * preview / export / MiniPreview の全描画サイトで共有されるため、単体で不変条件を固定する。
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeRotation,
  getNextRotation,
  resolveRotatedFitDimensions,
} from '../utils/canvas';

describe('normalizeRotation', () => {
  it('passes through the four canonical angles', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(270)).toBe(270);
  });

  it('treats undefined / null / NaN as 0 (旧データ後方互換)', () => {
    expect(normalizeRotation(undefined)).toBe(0);
    expect(normalizeRotation(null)).toBe(0);
    expect(normalizeRotation(NaN)).toBe(0);
    expect(normalizeRotation(Infinity)).toBe(0);
  });

  it('wraps values >= 360 and negative values into [0, 360)', () => {
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-360)).toBe(0);
  });

  it('snaps off-grid angles to the nearest 90-degree step', () => {
    expect(normalizeRotation(44)).toBe(0);
    expect(normalizeRotation(46)).toBe(90);
    expect(normalizeRotation(135)).toBe(180);
  });
});

describe('getNextRotation', () => {
  it('advances one 90-degree step and wraps at 360', () => {
    expect(getNextRotation(0)).toBe(90);
    expect(getNextRotation(90)).toBe(180);
    expect(getNextRotation(180)).toBe(270);
    expect(getNextRotation(270)).toBe(0);
  });

  it('advances a legacy (undefined) rotation to 90', () => {
    expect(getNextRotation(undefined)).toBe(90);
  });

  it('completes a full cycle back to the start in four presses', () => {
    let r: number = 0;
    for (let i = 0; i < 4; i++) r = getNextRotation(r);
    expect(r).toBe(0);
  });
});

describe('resolveRotatedFitDimensions', () => {
  it('keeps dimensions for 0 and 180 degrees', () => {
    expect(resolveRotatedFitDimensions(1920, 1080, 0)).toEqual({ width: 1920, height: 1080 });
    expect(resolveRotatedFitDimensions(1920, 1080, 180)).toEqual({ width: 1920, height: 1080 });
  });

  it('swaps width/height for 90 and 270 degrees', () => {
    expect(resolveRotatedFitDimensions(1920, 1080, 90)).toEqual({ width: 1080, height: 1920 });
    expect(resolveRotatedFitDimensions(1920, 1080, 270)).toEqual({ width: 1080, height: 1920 });
  });

  it('normalizes the rotation argument before deciding (undefined = 0)', () => {
    expect(resolveRotatedFitDimensions(800, 600, undefined)).toEqual({ width: 800, height: 600 });
    expect(resolveRotatedFitDimensions(800, 600, 450)).toEqual({ width: 600, height: 800 });
  });
});
