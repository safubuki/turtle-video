import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEDIA_ZOOM_AMOUNT,
  MAX_MEDIA_ZOOM_AMOUNT,
  MIN_MEDIA_ZOOM_AMOUNT,
  normalizeMediaZoomAmount,
  resolveMediaScaleFactor,
  resolveMediaZoomMultiplier,
  mediaScaleToPercent,
  mediaPercentToScale,
  resolveMediaZoomRange,
  createMediaZoomRangePatch,
  createMediaZoomHoldPatch,
  resolveMediaZoomEndpointPreview,
} from '../utils/mediaZoom';

describe('media zoom over the clip duration', () => {
  it('端点確認は素材IDを選び、末尾の映像取得と正確な終了倍率を分ける', () => {
    const items = [{ id: 'a', duration: 4 }, { id: 'b', duration: 2 }];
    expect(resolveMediaZoomEndpointPreview(items, { id: 'b', endpoint: 'start' })).toMatchObject({ index: 1, localTime: 0, scaleTime: 0 });
    expect(resolveMediaZoomEndpointPreview(items, { id: 'a', endpoint: 'end' })).toMatchObject({ index: 0, localTime: 3.999, scaleTime: 4 });
    expect(resolveMediaZoomEndpointPreview(items, { id: 'missing', endpoint: 'end' })).toBeNull();
    expect(resolveMediaZoomEndpointPreview(items, { id: 'a', endpoint: 'end' }, true)).toBeNull();
    expect(resolveMediaZoomEndpointPreview(items, { id: 'a', endpoint: 'end' }, false, true)).toBeNull();
    expect(resolveMediaZoomEndpointPreview([{ id: 'a', duration: 0 }], { id: 'a', endpoint: 'end' })).toMatchObject({ localTime: 0, scaleTime: 0 });
  });
  it('UIの％と保存倍率を共通変換し、基準倍率を重ねず絶対値で補間する', () => {
    expect(mediaPercentToScale(125.5)).toBe(1.255);
    expect(mediaScaleToPercent(1.255)).toBe(125.5);
    const source = { duration: 10, ...createMediaZoomRangePatch(1.4, 1.82) };
    expect(resolveMediaScaleFactor(source, 0)).toBeCloseTo(1.4);
    expect(resolveMediaScaleFactor(source, 5)).toBeCloseTo(1.61);
    expect(resolveMediaScaleFactor(source, 10)).toBeCloseTo(1.82);
    expect(resolveMediaScaleFactor(source, -1)).toBeCloseTo(1.4);
    expect(resolveMediaScaleFactor(source, Number.NaN)).toBeCloseTo(1.4);
    expect(createMediaZoomRangePatch(-5, 10)).toMatchObject({ zoomStartScale: 0.5, zoomEndScale: 6 });
  });

  it('旧倍率を実効両端へ変換し、方向にかかわらず最後の倍率を固定できる', () => {
    const zoomIn = { scale: 1.4, duration: 4, zoomDirection: 'in' as const, zoomAmount: 1.3 };
    expect(resolveMediaZoomRange(zoomIn)).toEqual({ start: 1.4, end: 1.8199999999999998 });
    const held = { duration: 4, ...createMediaZoomHoldPatch(zoomIn), scale: 0.8 };
    expect(held.zoomDirection).toBe('none');
    expect(resolveMediaScaleFactor(held, 0)).toBeCloseTo(1.82);
    expect(resolveMediaScaleFactor(held, 4)).toBeCloseTo(1.82);
    const zoomOut = { ...zoomIn, zoomDirection: 'out' as const };
    expect(createMediaZoomHoldPatch(zoomOut).zoomStartScale).toBeCloseTo(1.4);
    expect(resolveMediaZoomRange({ ...zoomIn, zoomStartScale: 1.25, zoomEndScale: Number.NaN })).toEqual(resolveMediaZoomRange(zoomIn));
  });
  it('keeps old clips unchanged when zoom is missing', () => {
    expect(resolveMediaZoomMultiplier({ scale: 1.5, duration: 4 }, 2)).toBe(1);
    expect(resolveMediaZoomMultiplier({ duration: 4, zoomDirection: 'none', zoomAmount: 1.4 }, 2)).toBe(1);
    expect(resolveMediaScaleFactor({ scale: 1.5, duration: 4 }, 2)).toBe(1.5);
  });

  it('zooms in from 100% to the amount across the display duration', () => {
    const source = { scale: 2, duration: 4, zoomDirection: 'in' as const, zoomAmount: 1.2 };
    expect(resolveMediaZoomMultiplier(source, 0)).toBeCloseTo(1);
    expect(resolveMediaZoomMultiplier(source, 2)).toBeCloseTo(1.1);
    expect(resolveMediaZoomMultiplier(source, 4)).toBeCloseTo(1.2);
    expect(resolveMediaZoomMultiplier(source, 9)).toBeCloseTo(1.2);
    expect(resolveMediaScaleFactor(source, 4)).toBeCloseTo(2.4);
  });

  it('zooms out from the amount to 100% and does not change the source', () => {
    const source = { scale: 1, duration: 5, zoomDirection: 'out' as const, zoomAmount: 1.5 };
    expect(resolveMediaZoomMultiplier(source, 0)).toBeCloseTo(1.5);
    expect(resolveMediaZoomMultiplier(source, 2.5)).toBeCloseTo(1.25);
    expect(resolveMediaZoomMultiplier(source, 5)).toBeCloseTo(1);
    expect(source.zoomAmount).toBe(1.5);
  });

  it('holds the start scale when the clip has no duration yet', () => {
    expect(resolveMediaZoomMultiplier({ duration: 0, zoomDirection: 'in', zoomAmount: 1.2 }, 1)).toBe(1);
    expect(resolveMediaZoomMultiplier({ duration: 0, zoomDirection: 'out', zoomAmount: 1.2 }, 1)).toBeCloseTo(1.2);
  });

  it('clamps the amount and falls back when it is missing', () => {
    expect(normalizeMediaZoomAmount(undefined)).toBe(DEFAULT_MEDIA_ZOOM_AMOUNT);
    expect(normalizeMediaZoomAmount(Number.NaN)).toBe(DEFAULT_MEDIA_ZOOM_AMOUNT);
    expect(normalizeMediaZoomAmount(1)).toBe(MIN_MEDIA_ZOOM_AMOUNT);
    expect(normalizeMediaZoomAmount(4)).toBe(MAX_MEDIA_ZOOM_AMOUNT);
    expect(resolveMediaZoomMultiplier({ duration: 2, zoomDirection: 'in' }, 2)).toBeCloseTo(DEFAULT_MEDIA_ZOOM_AMOUNT);
  });
});
