/**
 * @file clipThumbnailComposition.test.tsx
 * @description サムネイルと実際のミニビューで、素材のズーム・位置・回転・出力枠が一致すること。
 */
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClipThumbnail from '../components/common/ClipThumbnail';
import MiniPreview from '../components/common/MiniPreview';
import { useCanvasStore } from '../stores/canvasStore';
import type { MediaItem } from '../types';

vi.mock('../app/PlatformCapabilitiesContext', () => ({
  usePlatformCapabilities: () => ({ isIosSafari: false }),
}));

// 実画素のない jsdom で構図だけを検証する。黒フレーム判定は media.test.ts が扱う。
vi.mock('../utils/media', async () => ({
  ...await vi.importActual<typeof import('../utils/media')>('../utils/media'),
  isCanvasEffectivelyBlank: () => false,
}));

type Matrix = [number, number, number, number, number, number];
type Point = [number, number];
type DrawRecord = { source: CanvasImageSource; points: Point[] };
type RecordingContext = { context: CanvasRenderingContext2D; draws: DrawRecord[] };

const sourceLandmarks: Point[] = [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5], [0.25, 0.75]];
const sourceSizes = [
  { label: '正方形', width: 1200, height: 1200 },
  { label: '4:3', width: 1600, height: 1200 },
  { label: '横16:9', width: 1920, height: 1080 },
  { label: '縦9:16', width: 1080, height: 1920 },
];

let sourceWidth = 1920;
let sourceHeight = 1080;
let imageLoadCount = 0;
let videoCreateCount = 0;
let initialCanvasState: ReturnType<typeof useCanvasStore.getState>;
let contexts: Map<HTMLCanvasElement, RecordingContext>;

/** Canvas の行列合成と drawImage の素材内座標を記録し、実描画の構図を比較する。 */
function createRecordingContext(canvas: HTMLCanvasElement): RecordingContext {
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const draws: DrawRecord[] = [];
  const multiply = ([a, b, c, d, e, f]: Matrix) => {
    const [m0, m1, m2, m3, m4, m5] = matrix;
    matrix = [
      m0 * a + m2 * b, m1 * a + m3 * b,
      m0 * c + m2 * d, m1 * c + m3 * d,
      m0 * e + m2 * f + m4, m1 * e + m3 * f + m5,
    ];
  };
  const context = {
    canvas,
    save: () => stack.push([...matrix]),
    restore: () => { matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0]; },
    translate: (x: number, y: number) => multiply([1, 0, 0, 1, x, y]),
    rotate: (angle: number) => multiply([Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]),
    scale: (x: number, y: number) => multiply([x, 0, 0, y, 0, 0]),
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => { matrix = [a, b, c, d, e, f]; },
    resetTransform: () => { matrix = [1, 0, 0, 1, 0, 0]; },
    drawImage: (source: CanvasImageSource, ...args: number[]) => {
      const [x, y, width, height] = args.length === 8 ? args.slice(4) : args;
      const [a, b, c, d, e, f] = matrix;
      draws.push({
        source,
        points: sourceLandmarks.map(([u, v]) => {
          const px = x + u * width;
          const py = y + v * height;
          return [(a * px + c * py + e) / canvas.width, (b * px + d * py + f) / canvas.height];
        }),
      });
    },
    fillRect: vi.fn(), clearRect: vi.fn(), strokeRect: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
    filter: 'none', fillStyle: '#000000', strokeStyle: '', lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
  return { context, draws };
}

function installMediaMocks() {
  vi.stubGlobal('Image', class {
    naturalWidth = sourceWidth;
    naturalHeight = sourceHeight;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      imageLoadCount += 1;
      queueMicrotask(() => this.onload?.());
    }
  });
  vi.stubGlobal('createImageBitmap', undefined);

  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
    const element = originalCreateElement(tagName);
    if (tagName.toLowerCase() !== 'video') return element;
    videoCreateCount += 1;
    const video = element as HTMLVideoElement;
    let currentTime = 0;
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: sourceWidth },
      videoHeight: { configurable: true, value: sourceHeight },
      readyState: { configurable: true, value: 4 },
      duration: { configurable: true, value: 10 },
      seeking: { configurable: true, value: false },
      paused: { configurable: true, value: true },
      currentTime: {
        configurable: true,
        get: () => currentTime,
        set: (value: number) => {
          currentTime = value;
          window.setTimeout(() => video.dispatchEvent(new Event('seeked')), 0);
        },
      },
      load: {
        configurable: true,
        value: () => window.setTimeout(() => {
          video.dispatchEvent(new Event('loadedmetadata'));
          video.dispatchEvent(new Event('loadeddata'));
          video.dispatchEvent(new Event('canplay'));
        }, 0),
      },
      play: { configurable: true, value: vi.fn(async () => undefined) },
      pause: { configurable: true, value: vi.fn() },
    });
    return video;
  }) as typeof document.createElement);
}

function createItem(type: MediaItem['type'], overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'composition',
    file: new File(['media'], type === 'image' ? 'still.png' : 'clip.mp4'),
    type, url: 'blob:composition', volume: 1, isMuted: false,
    fadeIn: false, fadeOut: false, fadeInDuration: 1, fadeOutDuration: 1,
    duration: 5, originalDuration: 10, trimStart: 0, trimEnd: 5,
    scale: 1, positionX: 0, positionY: 0, rotation: 0, blur: 0,
    isTransformOpen: true, isLocked: false,
    ...overrides,
  };
}

function createPreviewMedia(type: MediaItem['type']): HTMLImageElement | HTMLVideoElement {
  if (type === 'video') return document.createElement('video');
  const image = document.createElement('img');
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: sourceWidth },
    naturalHeight: { configurable: true, value: sourceHeight },
  });
  return image;
}

function setOutput(portrait: boolean) {
  useCanvasStore.setState({
    width: portrait ? 720 : 1280,
    height: portrait ? 1280 : 720,
    aspectRatio: portrait ? 'portrait' : 'landscape',
  });
}

function PreviewPair({ item, mediaElement }: { item: MediaItem; mediaElement: HTMLImageElement | HTMLVideoElement }) {
  return <>
    <div data-testid="thumbnail-composition">
      <ClipThumbnail
        file={item.file} type={item.type} scale={item.scale}
        positionX={item.positionX} positionY={item.positionY} rotation={item.rotation}
        sourceTime={0} displaySize="card"
      />
    </div>
    <div data-testid="mini-composition"><MiniPreview item={item} mediaElement={mediaElement} /></div>
  </>;
}

async function expectMatchingComposition(container: HTMLElement) {
  const thumbnail = container.querySelector('[data-testid="thumbnail-composition"] canvas') as HTMLCanvasElement;
  const mini = container.querySelector('[data-testid="mini-composition"] canvas') as HTMLCanvasElement;
  let thumbnailPoints: Point[] = [];
  await waitFor(() => {
    expect(thumbnail).toHaveClass('opacity-100');
    expect(contexts.get(thumbnail)?.draws.length).toBeGreaterThan(0);
    expect(contexts.get(mini)?.draws.length).toBeGreaterThan(0);
    const thumbnailDraws = contexts.get(thumbnail)!.draws;
    const miniDraws = contexts.get(mini)!.draws;
    const thumbnailDraw = thumbnailDraws[thumbnailDraws.length - 1];
    thumbnailPoints = thumbnailDraw.points;
    const miniPoints = miniDraws[miniDraws.length - 1].points;
    // キャッシュに黒帯が混じると、その黒帯も素材として拡大される。
    // 表示の行列が一致しても見た目がずれるため、取得時の素材全体が枠全体を占めることを別に確認する。
    expect(thumbnailDraw.source).toBeInstanceOf(HTMLCanvasElement);
    const captureDraws = contexts.get(thumbnailDraw.source as HTMLCanvasElement)!.draws;
    const capturedPoints = captureDraws[captureDraws.length - 1].points;
    for (let index = 0; index < 4; index += 1) {
      expect(capturedPoints[index][0]).toBeCloseTo(sourceLandmarks[index][0], 6);
      expect(capturedPoints[index][1]).toBeCloseTo(sourceLandmarks[index][1], 6);
    }
    for (let index = 0; index < sourceLandmarks.length; index += 1) {
      expect(thumbnailPoints[index][0]).toBeCloseTo(miniPoints[index][0], 6);
      expect(thumbnailPoints[index][1]).toBeCloseTo(miniPoints[index][1], 6);
    }
  });
  const project = useCanvasStore.getState();
  expect(thumbnail.width / thumbnail.height).toBeCloseTo(project.width / project.height, 6);
  return thumbnailPoints;
}

beforeEach(() => {
  initialCanvasState = useCanvasStore.getState();
  contexts = new Map();
  imageLoadCount = 0;
  videoCreateCount = 0;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    if (!contexts.has(this)) contexts.set(this, createRecordingContext(this));
    return contexts.get(this)!.context;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,composition');
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    disconnect() {}
  });
  installMediaMocks();
});

afterEach(() => {
  cleanup();
  useCanvasStore.setState(initialCanvasState);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('サムネイルとミニビューの構図一致', () => {
  const cases = sourceSizes.flatMap((source) => [false, true].flatMap((portrait) => ['image', 'video'].map((type) => ({
    ...source, portrait, output: portrait ? '縦出力' : '横出力', type: type as MediaItem['type'],
  }))));

  it.each(cases)('$type・$label素材・$outputで、拡大後の素材内ランドマークが一致する', async ({ width, height, portrait, type }) => {
    sourceWidth = width;
    sourceHeight = height;
    setOutput(portrait);
    const item = createItem(type, { scale: 2 });
    const mediaElement = createPreviewMedia(type);
    const { container } = render(<PreviewPair item={item} mediaElement={mediaElement} />);
    await expectMatchingComposition(container);
  });

  it.each([0, 90, 180, 270])('%i度回転とXY移動を含む構図が、双方で一致する', async (rotation) => {
    sourceWidth = 1600;
    sourceHeight = 1200;
    setOutput(false);
    const item = createItem('image', { scale: 1.5, positionX: 160, positionY: -80, rotation });
    const mediaElement = createPreviewMedia('image');
    const { container } = render(<PreviewPair item={item} mediaElement={mediaElement} />);
    const points = await expectMatchingComposition(container);
    // 枠内の素材中心が設定した移動量になる。両実装が同時に位置を無視する退行も検出する。
    expect(points[4][0]).toBeCloseTo(0.5 + 160 / 1280, 6);
    expect(points[4][1]).toBeCloseTo(0.5 - 80 / 720, 6);
  });

  it('出力の向きと変形を変更すると、取得済みフレームで双方の構図を更新する', async () => {
    sourceWidth = 1920;
    sourceHeight = 1080;
    setOutput(false);
    const item = createItem('image', { scale: 1.5 });
    const mediaElement = createPreviewMedia('image');
    const createUrlSpy = vi.spyOn(URL, 'createObjectURL');
    const { container, rerender } = render(<PreviewPair item={item} mediaElement={mediaElement} />);
    const landscape = await expectMatchingComposition(container);
    const captures = { images: imageLoadCount, videos: videoCreateCount, urls: createUrlSpy.mock.calls.length };

    await act(async () => setOutput(true));
    const portrait = await expectMatchingComposition(container);
    expect(portrait[0][0]).not.toBeCloseTo(landscape[0][0], 4);
    rerender(<PreviewPair item={{ ...item, scale: 0.75, rotation: 90, positionX: 72, positionY: 128 }} mediaElement={mediaElement} />);
    const moved = await expectMatchingComposition(container);
    expect(moved[4][0]).toBeCloseTo(0.6, 6);
    expect(moved[4][1]).toBeCloseTo(0.6, 6);
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 220)); });
    expect(imageLoadCount).toBe(captures.images);
    expect(videoCreateCount).toBe(captures.videos);
    expect(createUrlSpy).toHaveBeenCalledTimes(captures.urls);
  });
});
