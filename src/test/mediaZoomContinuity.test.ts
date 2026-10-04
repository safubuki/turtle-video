import { beforeEach, describe, expect, it } from 'vitest';
import type { MediaItem } from '../types';
import { useMediaStore } from '../stores/mediaStore';
import { resolveMediaScaleFactor, createMediaZoomRangePatch } from '../utils/mediaZoom';
import { resolveVideoSplitSourceTime } from '../utils/media';

function item(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'a', type: 'video', file: new File(['x'], 'test.mp4', { type: 'video/mp4' }), url: 'blob:a',
    volume: 0.7, isMuted: false, fadeIn: true, fadeOut: true, fadeInDuration: 0.5, fadeOutDuration: 0.5,
    scale: 1.4, zoomDirection: 'in', zoomAmount: 1.3,
    duration: 10, originalDuration: 16, trimStart: 2, trimEnd: 12,
    positionX: 50, positionY: -20, rotation: 90, blur: 3, isLocked: false, isTransformOpen: false,
    transitionToNext: { type: 'dissolve', duration: 0.5 },
    ...overrides,
  };
}

beforeEach(() => useMediaStore.setState({ mediaItems: [], totalDuration: 0, isClipsLocked: false }));

describe('ズーム編集・継承・分割の連続性（#249 / #250）', () => {
  it.each(['in', 'out'] as const)('サイズ調整後に%sを選んでも開始倍率が変わらず、サイズと開始が連動する', (direction) => {
    const source = item({ scale: 1, zoomDirection: undefined, zoomAmount: undefined });
    useMediaStore.setState({ mediaItems: [source] });
    const store = useMediaStore.getState();
    store.updateScale(source.id, 1.4);
    store.updateZoomDirection(source.id, direction);
    let edited = useMediaStore.getState().mediaItems[0];
    expect(resolveMediaScaleFactor(edited, 0)).toBe(1.4);
    expect(resolveMediaScaleFactor(edited, edited.duration)).toBeCloseTo(direction === 'in' ? 1.68 : 1.4 / 1.2);
    store.updateZoomEndpoint(source.id, 'end', 1.9);
    store.updateScale(source.id, 1.6);
    edited = useMediaStore.getState().mediaItems[0];
    expect(edited).toMatchObject({ scale: 1.6, zoomStartScale: 1.6, zoomEndScale: 1.9 });
    store.updateZoomEndpoint(source.id, 'start', 1.25);
    expect(useMediaStore.getState().mediaItems[0]).toMatchObject({ scale: 1.25, zoomStartScale: 1.25, zoomEndScale: 1.9 });
    store.resetTransform(source.id, 'scale');
    expect(useMediaStore.getState().mediaItems[0]).toMatchObject({ scale: 1, zoomStartScale: 1, zoomEndScale: 1.9 });
    store.updateZoomDirection(source.id, 'none');
    store.updateScale(source.id, 2.8);
    expect(useMediaStore.getState().mediaItems[0]).toMatchObject({ scale: 2.8, zoomStartScale: 2.8, zoomEndScale: 2.8, zoomDirection: 'none' });
  });

  it('旧ズームアウトの開始の見た目を保って新形式へ編集する', () => {
    const source = item({ zoomDirection: 'out' });
    useMediaStore.setState({ mediaItems: [source] });
    const before = resolveMediaScaleFactor(source, 0);
    useMediaStore.getState().updateZoomEndpoint(source.id, 'end', 1.2);
    const edited = useMediaStore.getState().mediaItems[0];
    expect(resolveMediaScaleFactor(edited, 0)).toBeCloseTo(before);
    expect(edited.scale).toBeCloseTo(before);
    expect(edited.zoomEndScale).toBe(1.2);
  });

  it.each(['in', 'out'] as const)('コピーは設定を保ち、明示的な継承で%sの最後の倍率を固定する', (direction) => {
    const source = item({ zoomDirection: direction });
    useMediaStore.setState({ mediaItems: [source], totalDuration: source.duration });
    useMediaStore.getState().duplicateMediaItem(source.id);
    const copy = useMediaStore.getState().mediaItems[1];
    expect(copy.url).not.toBe(source.url);
    expect(copy.zoomDirection).toBe(direction);
    const end = resolveMediaScaleFactor(source, source.duration);
    useMediaStore.getState().inheritPreviousZoom(copy.id);
    const held = useMediaStore.getState().mediaItems[1];
    expect(resolveMediaScaleFactor(held, 0)).toBeCloseTo(end);
    expect(resolveMediaScaleFactor(held, held.duration)).toBeCloseTo(end);
    expect(held).toMatchObject({ positionX: 50, positionY: -20, rotation: 90, blur: 3 });
  });

  it('通常の別素材も現在の並びから一度だけ引き継ぎ、対象の位置・回転を保持する', () => {
    const source = item();
    const target = item({ id: 'b', type: 'image', scale: 0.8, positionX: -100, rotation: 0 });
    useMediaStore.setState({ mediaItems: [source, target] });
    useMediaStore.getState().inheritPreviousZoom(target.id);
    useMediaStore.getState().updateZoomAmount(source.id, 1.5);
    expect(useMediaStore.getState().mediaItems[1]).toMatchObject({ zoomStartScale: expect.closeTo(1.82), zoomEndScale: expect.closeTo(1.82), scale: expect.closeTo(1.82), positionX: -100, rotation: 0 });
    useMediaStore.setState({ mediaItems: [target, source] });
    useMediaStore.getState().inheritPreviousZoom(source.id);
    expect(resolveMediaScaleFactor(useMediaStore.getState().mediaItems[1], 0)).toBeCloseTo(1.04);
  });

  it.each([0.5, 1, 2, 8])('速度%sのトリム済み動画を分割し、元の倍率曲線と総尺を維持する', (speed) => {
    const source = item({ playbackSpeed: speed, duration: 10 / speed });
    const split = source.duration * 0.4;
    useMediaStore.setState({ mediaItems: [source], totalDuration: source.duration });
    useMediaStore.getState().splitMediaItem(source.id, split);
    const [first, second] = useMediaStore.getState().mediaItems;
    expect(first.trimEnd).toBeCloseTo(6);
    expect(second.trimStart).toBeCloseTo(6);
    expect(second.trimEnd).toBe(12);
    expect(first.duration + second.duration).toBeCloseTo(source.duration);
    expect(useMediaStore.getState().totalDuration).toBeCloseTo(source.duration);
    expect(first).toMatchObject({ fadeIn: true, fadeOut: false, transitionToNext: null });
    expect(second).toMatchObject({ fadeIn: false, fadeOut: true, transitionToNext: source.transitionToNext, playbackSpeed: speed, positionX: source.positionX, rotation: 90 });
    for (const t of [0, split / 2, split, split + second.duration / 2, source.duration]) {
      const piece = t <= split ? first : second;
      const local = t <= split ? t : t - split;
      expect(resolveMediaScaleFactor(piece, local)).toBeCloseTo(resolveMediaScaleFactor(source, t));
    }
    expect(second.id).not.toBe(source.id);
    expect(second.url).not.toBe(source.url);
  });

  it('ズームアウト・固定・再分割も補間済みの端点を保つ', () => {
    for (const range of [[1.5, 1.2], [1.3, 1.3]]) {
      const source = item({ ...createMediaZoomRangePatch(range[0], range[1]) });
      useMediaStore.setState({ mediaItems: [source] });
      useMediaStore.getState().splitMediaItem(source.id, 5);
      const [first, second] = useMediaStore.getState().mediaItems;
      expect(resolveMediaScaleFactor(first, 5)).toBeCloseTo(resolveMediaScaleFactor(second, 0));
      useMediaStore.getState().splitMediaItem(second.id, 2.5);
      const pieces = useMediaStore.getState().mediaItems;
      expect(resolveMediaScaleFactor(pieces[1], 2.5)).toBeCloseTo(resolveMediaScaleFactor(pieces[2], 0));
      expect(resolveMediaScaleFactor(pieces[2], 2.5)).toBeCloseTo(range[1]);
    }
  });

  it('続きを追加コピーは終了倍率を固定し、ズーム端点をリセットできる', () => {
    const source = item();
    useMediaStore.setState({ mediaItems: [source] });
    useMediaStore.getState().addContinuationMediaItem(source.id);
    const copy = useMediaStore.getState().mediaItems[1];
    expect(resolveMediaScaleFactor(copy, 0)).toBeCloseTo(1.82);
    expect(resolveMediaScaleFactor(copy, copy.duration)).toBeCloseTo(1.82);
    useMediaStore.getState().updateZoomEndpoint(copy.id, 'end', 1.9);
    useMediaStore.getState().updateScale(copy.id, 2.8);
    expect(resolveMediaScaleFactor(useMediaStore.getState().mediaItems[1], 0)).toBeCloseTo(2.8);
    expect(resolveMediaScaleFactor(useMediaStore.getState().mediaItems[1], copy.duration)).toBeCloseTo(1.9);
    useMediaStore.getState().resetTransform(copy.id, 'zoom');
    expect(resolveMediaScaleFactor(useMediaStore.getState().mediaItems[1], 0)).toBe(2.8);
  });

  it.each<{ label: string; settings: Partial<MediaItem> }>([
    { label: '旧画像のズームイン', settings: { type: 'image' } },
    { label: '旧動画のズームアウト', settings: { zoomDirection: 'out' } },
    { label: '画像の実効端点', settings: { type: 'image', scale: 3, zoomStartScale: 3, zoomEndScale: 4 } },
    { label: '動画の実効端点', settings: { scale: 4, zoomStartScale: 4, zoomEndScale: 3, zoomDirection: 'out' } },
    { label: '固定表示', settings: { scale: 6, zoomStartScale: 6, zoomEndScale: 6, zoomDirection: 'none' } },
  ])('$labelを開始倍率で固定でき、別のリセットで両端とサイズを100%へ戻す', ({ settings }) => {
    const source = item(settings);
    const other = item({ id: 'other' });
    const start = resolveMediaScaleFactor(source, 0);
    useMediaStore.setState({ mediaItems: [source, other] });
    useMediaStore.getState().resetTransform(source.id, 'zoom');
    const held = useMediaStore.getState().mediaItems[0];
    expect(resolveMediaScaleFactor(held, 0)).toBeCloseTo(start);
    expect(resolveMediaScaleFactor(held, held.duration)).toBeCloseTo(start);

    // 旧形式も直接初期化でき、別カードや拡大率以外の設定は変更しない。
    useMediaStore.setState({ mediaItems: [source, other] });
    useMediaStore.getState().resetTransform(source.id, 'zoom-default');
    const reset = useMediaStore.getState().mediaItems[0];
    expect(reset).toMatchObject({ scale: 1, zoomStartScale: 1, zoomEndScale: 1, zoomDirection: 'none' });
    expect(reset.zoomAmount).toBeUndefined();
    for (const time of [0, reset.duration / 2, reset.duration]) {
      expect(resolveMediaScaleFactor(reset, time)).toBe(1);
    }
    expect(reset).toMatchObject({
      id: source.id, type: source.type, file: source.file, url: source.url,
      positionX: 50, positionY: -20, rotation: 90, blur: 3,
      duration: 10, originalDuration: 16, trimStart: 2, trimEnd: 12,
      volume: 0.7, isMuted: false, fadeIn: true, fadeOut: true,
      fadeInDuration: 0.5, fadeOutDuration: 0.5, transitionToNext: source.transitionToNext,
    });
    expect(useMediaStore.getState().mediaItems[1]).toBe(other);
  });

  it('範囲外・境界・画像・先頭・ロックは変更しない', () => {
    const source = item();
    useMediaStore.setState({ mediaItems: [source] });
    for (const t of [-1, 0, 0.01, 10, 11, Number.NaN]) {
      expect(resolveVideoSplitSourceTime(source, t)).toBeNull();
      useMediaStore.getState().splitMediaItem(source.id, t);
    }
    useMediaStore.getState().inheritPreviousZoom(source.id);
    expect(useMediaStore.getState().mediaItems).toEqual([source]);
    useMediaStore.setState({ isClipsLocked: true });
    useMediaStore.getState().splitMediaItem(source.id, 5);
    useMediaStore.getState().updateZoomEndpoint(source.id, 'start', 2);
    useMediaStore.getState().updateScale(source.id, 2);
    useMediaStore.getState().updateZoomDirection(source.id, 'out');
    useMediaStore.getState().resetTransform(source.id, 'zoom');
    useMediaStore.getState().resetTransform(source.id, 'zoom-default');
    expect(useMediaStore.getState().mediaItems).toEqual([source]);
    const locked = item({ id: 'b', isLocked: true });
    useMediaStore.setState({ mediaItems: [source, locked], isClipsLocked: false });
    useMediaStore.getState().inheritPreviousZoom(locked.id);
    useMediaStore.getState().splitMediaItem(locked.id, 5);
    useMediaStore.getState().resetTransform(locked.id, 'zoom-default');
    expect(useMediaStore.getState().mediaItems).toEqual([source, locked]);
    expect(resolveVideoSplitSourceTime(item({ type: 'image' }), 5)).toBeNull();
  });
});
