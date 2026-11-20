/**
 * @file mediaPan.test.ts
 * @description 位置の移動（パン）: 補間・固定・端点編集・分割・続き・引き継ぎ・ロック
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { MediaItem } from '../types';
import { useMediaStore } from '../stores/mediaStore';
import {
  createMediaPanEndpointPatch,
  createMediaPanHoldPatch,
  createMediaPanRangePatch,
  hasMediaPanRange,
  isMediaPanMoving,
  resolveMediaPanRange,
  resolveMediaPosition,
} from '../utils/mediaPan';
import { createMediaZoomRangePatch, resolveMediaScaleFactor } from '../utils/mediaZoom';
import { resolveSplitCompareAutoOffsetPatch } from '../utils/splitCompare';

function item(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'a', type: 'video', file: new File(['x'], 'test.mp4', { type: 'video/mp4' }), url: 'blob:a',
    volume: 1, isMuted: false, fadeIn: false, fadeOut: false, fadeInDuration: 0.5, fadeOutDuration: 0.5,
    scale: 1, duration: 10, originalDuration: 16, trimStart: 2, trimEnd: 12,
    positionX: 0, positionY: 0, rotation: 0, blur: 0, isLocked: false, isTransformOpen: false,
    ...overrides,
  };
}

beforeEach(() => useMediaStore.setState({ mediaItems: [], totalDuration: 0, isClipsLocked: false }));

describe('位置の移動（パン）の補間', () => {
  it('終了位置が無ければ開始位置で固定（旧データと同じ）', () => {
    const source = item({ positionX: 40, positionY: -20 });
    expect(hasMediaPanRange(source)).toBe(false);
    expect(isMediaPanMoving(source)).toBe(false);
    for (const t of [0, 5, 10, 99]) {
      expect(resolveMediaPosition(source, t)).toEqual({ x: 40, y: -20 });
    }
    // 片方だけの不正データも固定扱い
    expect(resolveMediaPosition({ ...source, panEndPositionX: 100 }, 10)).toEqual({ x: 40, y: -20 });
  });

  it('表示時間全体で開始→終了へ線形に動き、範囲外・不正時刻は端に留まる', () => {
    const source = item({ positionX: 0, positionY: 0, panEndPositionX: 200, panEndPositionY: -100 });
    expect(isMediaPanMoving(source)).toBe(true);
    expect(resolveMediaPosition(source, 0)).toEqual({ x: 0, y: 0 });
    expect(resolveMediaPosition(source, 5)).toEqual({ x: 100, y: -50 });
    expect(resolveMediaPosition(source, 10)).toEqual({ x: 200, y: -100 });
    expect(resolveMediaPosition(source, -3)).toEqual({ x: 0, y: 0 });
    expect(resolveMediaPosition(source, 30)).toEqual({ x: 200, y: -100 });
    expect(resolveMediaPosition(source, Number.NaN)).toEqual({ x: 0, y: 0 });
    expect(resolveMediaPosition({ ...source, duration: 0 }, 5)).toEqual({ x: 0, y: 0 });
  });

  it('ズームと同じ進み方なので、同時に使うと同じ瞬間に始まり同じ瞬間に終わる', () => {
    const source = item({ ...createMediaZoomRangePatch(1, 2), panEndPositionX: 300, panEndPositionY: 0 });
    for (const t of [0, 2.5, 5, 7.5, 10]) {
      const zoomProgress = resolveMediaScaleFactor(source, t) - 1;
      const panProgress = resolveMediaPosition(source, t).x / 300;
      expect(panProgress).toBeCloseTo(zoomProgress);
    }
  });

  it('同じ位置の範囲は終了を消して固定にし、範囲外の値はクランプする', () => {
    expect(createMediaPanRangePatch({ x: 10, y: 10 }, { x: 10.2, y: 9.9 })).toEqual({
      positionX: 10, positionY: 10, panEndPositionX: undefined, panEndPositionY: undefined,
    });
    const huge = createMediaPanRangePatch({ x: 0, y: 0 }, { x: 1e9, y: -1e9 });
    expect(Math.abs(huge.panEndPositionX!)).toBeLessThan(1e9);
    expect(Math.abs(huge.panEndPositionY!)).toBeLessThan(1e9);
  });

  it('固定中に終了を触ると開始位置から動き始め、開始を触ると移動中は終了を保つ', () => {
    const fixed = item({ positionX: 50, positionY: 20 });
    const started = { ...fixed, ...createMediaPanEndpointPatch(fixed, 'end', 'x', 150) };
    expect(resolveMediaPanRange(started)).toEqual({ start: { x: 50, y: 20 }, end: { x: 150, y: 20 } });
    const moved = { ...started, ...createMediaPanEndpointPatch(started, 'start', 'y', -30) };
    expect(resolveMediaPanRange(moved)).toEqual({ start: { x: 50, y: -30 }, end: { x: 150, y: 20 } });
    // 固定中に開始を触ると終了も一緒に動く（固定のまま）
    const fixedMoved = { ...fixed, ...createMediaPanEndpointPatch(fixed, 'start', 'x', -80) };
    expect(hasMediaPanRange(fixedMoved)).toBe(false);
    expect(resolveMediaPosition(fixedMoved, 10)).toEqual({ x: -80, y: 20 });
    // 終了を開始と同じへ戻すと固定へ戻る
    const back = { ...started, ...createMediaPanEndpointPatch(started, 'end', 'x', 50) };
    expect(hasMediaPanRange(back)).toBe(false);
  });

  it('その時刻の位置で固定する（続き・引き継ぎ用）', () => {
    const source = item({ positionX: 0, positionY: 0, panEndPositionX: 100, panEndPositionY: 40 });
    expect(createMediaPanHoldPatch(source)).toEqual({
      positionX: 100, positionY: 40, panEndPositionX: undefined, panEndPositionY: undefined,
    });
    expect(createMediaPanHoldPatch(source, 5)).toMatchObject({ positionX: 50, positionY: 20 });
  });
});

describe('ストア: 移動の編集・分割・続き・引き継ぎ', () => {
  it('端点を 1 軸ずつ編集でき、「開始位置で固定」で止まる。位置欄の横・縦は開始と共通', () => {
    const source = item();
    useMediaStore.setState({ mediaItems: [source] });
    const store = useMediaStore.getState();
    store.updatePanEndpoint(source.id, 'end', 'x', 300);
    store.updatePanEndpoint(source.id, 'end', 'y', -120);
    let edited = useMediaStore.getState().mediaItems[0];
    expect(edited).toMatchObject({ positionX: 0, positionY: 0, panEndPositionX: 300, panEndPositionY: -120 });
    // 位置・サイズの横を変えると開始だけ変わり、終了は保つ
    store.updatePosition(source.id, 'x', 60);
    edited = useMediaStore.getState().mediaItems[0];
    expect(resolveMediaPanRange(edited)).toEqual({ start: { x: 60, y: 0 }, end: { x: 300, y: -120 } });
    store.updatePanEndpoint(source.id, 'start', 'y', 25);
    expect(useMediaStore.getState().mediaItems[0]).toMatchObject({ positionY: 25, panEndPositionY: -120 });
    store.resetTransform(source.id, 'pan');
    edited = useMediaStore.getState().mediaItems[0];
    expect(hasMediaPanRange(edited)).toBe(false);
    expect(edited).toMatchObject({ positionX: 60, positionY: 25 });
    // 不正値は無視
    store.updatePanEndpoint(source.id, 'end', 'x', Number.NaN);
    expect(useMediaStore.getState().mediaItems[0]).toBe(edited);
  });

  it('分割は分割地点の位置を前半の終了・後半の開始へ引き継ぎ、再分割しても連続する', () => {
    const source = item({ positionX: -200, positionY: 100, panEndPositionX: 200, panEndPositionY: -100 });
    useMediaStore.setState({ mediaItems: [source] });
    useMediaStore.getState().splitMediaItem(source.id, 4);
    const [first, second] = useMediaStore.getState().mediaItems;
    expect(resolveMediaPosition(first, 0)).toEqual({ x: -200, y: 100 });
    expect(resolveMediaPosition(first, first.duration)).toEqual({ x: -40, y: 20 });
    expect(resolveMediaPosition(second, 0)).toEqual({ x: -40, y: 20 });
    expect(resolveMediaPosition(second, second.duration)).toEqual({ x: 200, y: -100 });
    // 分割前と同じ軌跡（前半 4 秒・後半 6 秒）
    expect(resolveMediaPosition(first, 2).x).toBeCloseTo(resolveMediaPosition(source, 2).x);
    expect(resolveMediaPosition(second, 3).x).toBeCloseTo(resolveMediaPosition(source, 7).x);
    useMediaStore.getState().splitMediaItem(second.id, 3);
    const pieces = useMediaStore.getState().mediaItems;
    expect(resolveMediaPosition(pieces[1], pieces[1].duration)).toEqual(resolveMediaPosition(pieces[2], 0));
  });

  it('移動していないクリップの分割は位置を変えない', () => {
    const source = item({ positionX: 30, positionY: -10 });
    useMediaStore.setState({ mediaItems: [source] });
    useMediaStore.getState().splitMediaItem(source.id, 4);
    for (const piece of useMediaStore.getState().mediaItems) {
      expect(piece).toMatchObject({ positionX: 30, positionY: -10 });
      expect(hasMediaPanRange(piece)).toBe(false);
    }
  });

  it('続きを追加コピーは終了位置で固定し、通常コピーは移動設定ごと複製する', () => {
    const source = item({ positionX: 0, positionY: 0, panEndPositionX: 120, panEndPositionY: 60 });
    useMediaStore.setState({ mediaItems: [source] });
    useMediaStore.getState().addContinuationMediaItem(source.id);
    const continuation = useMediaStore.getState().mediaItems[1];
    expect(continuation).toMatchObject({ positionX: 120, positionY: 60 });
    expect(hasMediaPanRange(continuation)).toBe(false);

    useMediaStore.setState({ mediaItems: [source] });
    useMediaStore.getState().duplicateMediaItem(source.id);
    const copy = useMediaStore.getState().mediaItems[1];
    expect(copy).toMatchObject({ positionX: 0, positionY: 0, panEndPositionX: 120, panEndPositionY: 60 });
  });

  it('前の素材の終了位置で固定し、先頭・ロック中は変えない', () => {
    const previous = item({ id: 'p', positionX: 0, positionY: 0, panEndPositionX: -90, panEndPositionY: 45 });
    const target = item({ id: 't', positionX: 10, positionY: 10, panEndPositionX: 20, panEndPositionY: 20, rotation: 90 });
    useMediaStore.setState({ mediaItems: [previous, target] });
    useMediaStore.getState().inheritPreviousPan('t');
    const inherited = useMediaStore.getState().mediaItems[1];
    expect(inherited).toMatchObject({ positionX: -90, positionY: 45, rotation: 90 });
    expect(hasMediaPanRange(inherited)).toBe(false);

    useMediaStore.getState().inheritPreviousPan('p');
    expect(useMediaStore.getState().mediaItems[0]).toMatchObject({ panEndPositionX: -90 });

    const locked = item({ id: 'l', isLocked: true });
    useMediaStore.setState({ mediaItems: [previous, locked] });
    useMediaStore.getState().inheritPreviousPan('l');
    useMediaStore.getState().updatePanEndpoint('l', 'end', 'x', 500);
    useMediaStore.getState().resetTransform('l', 'pan');
    expect(useMediaStore.getState().mediaItems[1]).toBe(locked);

    useMediaStore.setState({ mediaItems: [previous, target], isClipsLocked: true });
    useMediaStore.getState().updatePanEndpoint('t', 'end', 'x', 500);
    expect(useMediaStore.getState().mediaItems[1]).toBe(target);
  });

  it('移動を設定したカードは 2 画面表示の横位置の自動調整をしない', () => {
    const apply = {
      role: 'head' as const, wasWanted: false, isWanted: true,
      sourceSize: { width: 1920, height: 1080 }, canvasWidth: 1280,
    };
    expect(resolveSplitCompareAutoOffsetPatch({ ...apply, item: item() })).toEqual({ positionX: -64 });
    expect(resolveSplitCompareAutoOffsetPatch({
      ...apply, item: item({ panEndPositionX: 100, panEndPositionY: 0 }),
    })).toBeNull();
  });
});
