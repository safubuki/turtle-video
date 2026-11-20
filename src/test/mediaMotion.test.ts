/**
 * @file mediaMotion.test.ts
 * @description 「サイズ・位置・動き」の共通層: 開始・終了の構図を、既存のズーム・移動の保存値で読み書きする
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { MediaItem } from '../types';
import { useMediaStore } from '../stores/mediaStore';
import {
  createDefaultCompositionPatch,
  createInheritCompositionPatch,
  createMediaMotionEndPatch,
  createMediaMotionPointPatch,
  isMediaMotionActive,
  resolveMediaComposition,
  resolveMediaMotionRange,
} from '../utils/mediaMotion';

function item(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'a', type: 'image', file: new File(['x'], 'a.png', { type: 'image/png' }), url: 'blob:a',
    volume: 1, isMuted: false, fadeIn: false, fadeOut: false, fadeInDuration: 1, fadeOutDuration: 1,
    scale: 1, duration: 10, originalDuration: 0, trimStart: 0, trimEnd: 0,
    positionX: 0, positionY: 0, rotation: 90, blur: 3, isLocked: false, isTransformOpen: false,
    ...overrides,
  };
}

beforeEach(() => useMediaStore.setState({ mediaItems: [], totalDuration: 0, isClipsLocked: false }));

describe('構図の読み書き', () => {
  it('ズームと移動の保存値を開始・終了の構図として読む（旧ズームも含む）', () => {
    expect(resolveMediaMotionRange(item({ positionX: 10 }))).toEqual({
      start: { scale: 1, x: 10, y: 0 }, end: { scale: 1, x: 10, y: 0 },
    });
    const legacy = item({ scale: 1.4, zoomDirection: 'in', zoomAmount: 1.3, panEndPositionX: 50, panEndPositionY: 5 });
    const range = resolveMediaMotionRange(legacy);
    expect(range.start).toEqual({ scale: 1.4, x: 0, y: 0 });
    expect(range.end.scale).toBeCloseTo(1.82);
    expect(range.end).toMatchObject({ x: 50, y: 5 });
    expect(isMediaMotionActive(item())).toBe(false);
    expect(isMediaMotionActive(item({ zoomStartScale: 1, zoomEndScale: 1.2 }))).toBe(true);
    expect(isMediaMotionActive(item({ panEndPositionX: 30, panEndPositionY: 0 }))).toBe(true);
    const mid = resolveMediaComposition(item({ zoomStartScale: 1, zoomEndScale: 2, panEndPositionX: 100, panEndPositionY: 0 }), 5);
    expect(mid).toEqual({ scale: 1.5, x: 50, y: 0 });
  });

  it('選んだ時点だけを変え、もう一方は保つ（固定から開始を変えると動きが生まれる）', () => {
    const fixed = item({ scale: 1.2, zoomStartScale: 1.2, zoomEndScale: 1.2, positionX: 40 });
    const startEdited = { ...fixed, ...createMediaMotionPointPatch(fixed, 'start', { scale: 1.5 }) };
    expect(resolveMediaMotionRange(startEdited)).toEqual({
      start: { scale: 1.5, x: 40, y: 0 }, end: { scale: 1.2, x: 40, y: 0 },
    });
    expect(startEdited.scale).toBe(1.5);
    const endEdited = { ...startEdited, ...createMediaMotionPointPatch(startEdited, 'end', { x: -60, y: 30 }) };
    expect(resolveMediaMotionRange(endEdited).end).toEqual({ scale: 1.2, x: -60, y: 30 });
    // 不正値は無視
    const ignored = { ...endEdited, ...createMediaMotionPointPatch(endEdited, 'end', { scale: Number.NaN }) };
    expect(resolveMediaMotionRange(ignored).end.scale).toBe(1.2);
  });

  it('終了の指定・停止、引き継ぎ（動いていれば開始へ・固定なら全体）、初期化', () => {
    const base = item({ positionX: 10 });
    const moved = { ...base, ...createMediaMotionEndPatch(base, { scale: 1.5, x: 100, y: 0 }) };
    expect(isMediaMotionActive(moved)).toBe(true);
    const stopped = { ...moved, ...createMediaMotionEndPatch(moved, null) };
    expect(isMediaMotionActive(stopped)).toBe(false);
    expect(resolveMediaMotionRange(stopped).end).toEqual({ scale: 1, x: 10, y: 0 });

    const previousEnd = { scale: 2, x: -50, y: 20 };
    const inheritedMoving = { ...moved, ...createInheritCompositionPatch(moved, previousEnd) };
    expect(resolveMediaMotionRange(inheritedMoving)).toEqual({ start: previousEnd, end: { scale: 1.5, x: 100, y: 0 } });
    const inheritedFixed = { ...base, ...createInheritCompositionPatch(base, previousEnd) };
    expect(resolveMediaMotionRange(inheritedFixed)).toEqual({ start: previousEnd, end: previousEnd });
    expect(isMediaMotionActive(inheritedFixed)).toBe(false);

    const reset = { ...moved, ...createDefaultCompositionPatch() };
    expect(resolveMediaMotionRange(reset)).toEqual({ start: { scale: 1, x: 0, y: 0 }, end: { scale: 1, x: 0, y: 0 } });
  });
});

describe('ストア', () => {
  it('updateMotionPoint / setMotionEnd / composition-default は回転・ぼかしを変えない', () => {
    const source = item();
    useMediaStore.setState({ mediaItems: [source] });
    const store = useMediaStore.getState();
    store.updateMotionPoint('a', 'end', { scale: 1.5, x: 128 });
    let edited = useMediaStore.getState().mediaItems[0];
    expect(resolveMediaMotionRange(edited)).toEqual({ start: { scale: 1, x: 0, y: 0 }, end: { scale: 1.5, x: 128, y: 0 } });
    expect(edited).toMatchObject({ rotation: 90, blur: 3 });
    store.setMotionEnd('a', null);
    expect(isMediaMotionActive(useMediaStore.getState().mediaItems[0])).toBe(false);
    store.setMotionEnd('a', { scale: 0.9, x: 0, y: -40 });
    store.resetTransform('a', 'composition-default');
    edited = useMediaStore.getState().mediaItems[0];
    expect(resolveMediaMotionRange(edited)).toEqual({ start: { scale: 1, x: 0, y: 0 }, end: { scale: 1, x: 0, y: 0 } });
    expect(edited).toMatchObject({ rotation: 90, blur: 3 });
  });

  it('前の素材の最後の構図を引き継ぎ、先頭・ロック中は変えない', () => {
    const previous = item({ id: 'p', zoomStartScale: 1, zoomEndScale: 1.6, panEndPositionX: -90, panEndPositionY: 45 });
    const target = item({ id: 't', zoomStartScale: 1, zoomEndScale: 1.2, scale: 1 });
    useMediaStore.setState({ mediaItems: [previous, target] });
    useMediaStore.getState().inheritPreviousComposition('t');
    const inherited = useMediaStore.getState().mediaItems[1];
    expect(resolveMediaMotionRange(inherited).start).toEqual({ scale: 1.6, x: -90, y: 45 });
    // 動いていたので終了は保つ
    expect(resolveMediaMotionRange(inherited).end.scale).toBeCloseTo(1.2);

    useMediaStore.getState().inheritPreviousComposition('p');
    expect(useMediaStore.getState().mediaItems[0]).toBe(previous);

    const locked = item({ id: 'l', isLocked: true });
    useMediaStore.setState({ mediaItems: [previous, locked] });
    useMediaStore.getState().inheritPreviousComposition('l');
    useMediaStore.getState().updateMotionPoint('l', 'end', { scale: 2 });
    useMediaStore.getState().setMotionEnd('l', { scale: 2, x: 0, y: 0 });
    expect(useMediaStore.getState().mediaItems[1]).toBe(locked);

    useMediaStore.setState({ mediaItems: [previous, target], isClipsLocked: true });
    useMediaStore.getState().updateMotionPoint('t', 'start', { x: 300 });
    expect(useMediaStore.getState().mediaItems[1]).toBe(target);
  });
});
