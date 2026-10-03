import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClipThumbnail from '../components/common/ClipThumbnail';

const getPlatformCapabilitiesMock = vi.fn();
const matchMediaMatchesMock = vi.fn((_query: string) => false);

vi.mock('../utils/platform', () => ({
  getPlatformCapabilities: () => getPlatformCapabilitiesMock(),
}));

vi.mock('../app/PlatformCapabilitiesContext', () => ({
  usePlatformCapabilities: () => getPlatformCapabilitiesMock(),
}));

// 黒フレーム判定は別テスト（media.test.ts）でカバーする。
// jsdom では video/image の実画素が無く、判定が不安定になるため常に非黒とする。
vi.mock('../utils/media', async () => {
  const actual = await vi.importActual<typeof import('../utils/media')>('../utils/media');
  return {
    ...actual,
    isCanvasEffectivelyBlank: () => false,
  };
});

async function flushHoverSettleFrames() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });
}

function installMatchMediaMock(matches: boolean) {
  matchMediaMatchesMock.mockReturnValue(matches);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matchMediaMatchesMock(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

type VideoMockControls = {
  createElementSpy: ReturnType<typeof vi.spyOn>;
  playSpy: ReturnType<typeof vi.fn>;
  pauseSpy: ReturnType<typeof vi.fn>;
  getCreatedVideo: () => HTMLVideoElement | null;
};

function installVideoElementMock(): VideoMockControls {
  const originalCreateElement = document.createElement.bind(document);
  let createdVideo: HTMLVideoElement | null = null;

  const playSpy = vi.fn(async () => {
    setTimeout(() => {
      createdVideo?.dispatchEvent(new Event('playing'));
      createdVideo?.dispatchEvent(new Event('timeupdate'));
    }, 0);
  });
  const pauseSpy = vi.fn();
  const loadSpy = vi.fn(function (this: HTMLVideoElement) {
    setTimeout(() => {
      this.dispatchEvent(new Event('loadedmetadata'));
      this.dispatchEvent(new Event('loadeddata'));
      this.dispatchEvent(new Event('canplay'));
    }, 0);
  });

  const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
    const element = originalCreateElement(tagName);
    if (tagName.toLowerCase() !== 'video') {
      return element;
    }

    const video = element as HTMLVideoElement;
    createdVideo = video;
    let currentTime = 0;

    Object.defineProperty(video, 'readyState', {
      configurable: true,
      get: () => 4,
    });
    Object.defineProperty(video, 'duration', {
      configurable: true,
      get: () => 10,
    });
    Object.defineProperty(video, 'videoWidth', {
      configurable: true,
      get: () => 1920,
    });
    Object.defineProperty(video, 'videoHeight', {
      configurable: true,
      get: () => 1080,
    });
    Object.defineProperty(video, 'seeking', {
      configurable: true,
      get: () => false,
    });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
        setTimeout(() => {
          video.dispatchEvent(new Event('loadeddata'));
          video.dispatchEvent(new Event('canplay'));
          video.dispatchEvent(new Event('seeked'));
        }, 0);
      },
    });
    Object.defineProperty(video, 'play', {
      configurable: true,
      value: playSpy,
    });
    Object.defineProperty(video, 'pause', {
      configurable: true,
      value: pauseSpy,
    });
    Object.defineProperty(video, 'load', {
      configurable: true,
      value: loadSpy,
    });

    return video;
  }) as typeof document.createElement);

  return {
    createElementSpy,
    playSpy,
    pauseSpy,
    getCreatedVideo: () => createdVideo,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  getPlatformCapabilitiesMock.mockReturnValue({ isIosSafari: false });
  // 既定はタッチ端末相当（ホバー不可）
  installMatchMediaMock(false);
  // jsdom の canvas は toDataURL を持たない環境があるため、拡大プレビュー用に固定値を返す
  if (!HTMLCanvasElement.prototype.toDataURL) {
    HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,preview';
  } else {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,preview');
  }
});

describe('ClipThumbnail', () => {
  it.each([
    { type: 'image' as const, isIosSafari: false, hover: false },
    { type: 'video' as const, isIosSafari: false, hover: true },
    { type: 'video' as const, isIosSafari: true, hover: false },
  ])('$type の倍率を取得中・取得後に変更すると描画と拡大表示へ反映する（iOS: $isIosSafari）', async ({ type, isIosSafari, hover }) => {
    getPlatformCapabilitiesMock.mockReturnValue({ isIosSafari });
    installMatchMediaMock(hover);
    const { createElementSpy } = installVideoElementMock();
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      naturalWidth = 1920;
      naturalHeight = 1080;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    });
    const contexts = new Map<HTMLCanvasElement, {
      drawImage: ReturnType<typeof vi.fn>;
      scale: ReturnType<typeof vi.fn>;
    }>();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      if (!contexts.has(this)) {
        contexts.set(this, { drawImage: vi.fn(), scale: vi.fn() });
      }
      return {
        ...contexts.get(this),
        clearRect: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
      } as unknown as CanvasRenderingContext2D;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
      return `data:image/jpeg;base64,snapshot-${contexts.get(this)?.drawImage.mock.calls.length ?? 0}`;
    });
    const createUrlSpy = vi.spyOn(URL, 'createObjectURL');
    const file = new File(['media'], type === 'video' ? 'clip.mp4' : 'photo.png');
    const thumbnail = (scale: number) => <ClipThumbnail {...{ file, type, scale }} sourceTime={0} />;
    const { container, rerender } = render(thumbnail(0.5));
    // 最初のデコードが終わる前に変更しても、最新の倍率で表示する。
    rerender(thumbnail(2));
    const canvas = container.querySelector('canvas')!;
    await waitFor(() => expect(canvas).toHaveClass('opacity-100'));
    const displayDraw = contexts.get(canvas)!.drawImage;
    const expectScale = (scale: number) => {
      const calls = contexts.get(canvas)!.scale.mock.calls;
      const baseScale = Math.min(canvas.width / 1920, canvas.height / 1080);
      expect(calls[calls.length - 1]).toEqual([baseScale * scale, baseScale * scale]);
      expect(displayDraw.mock.calls[displayDraw.mock.calls.length - 1]?.slice(1)).toEqual([-960, -540, 1920, 1080]);
    };
    expectScale(2);

    const trigger = screen.getByRole('button', { name: hover ? /マウスオーバーで拡大/ : 'サムネイルを拡大表示' });
    if (hover) fireEvent.mouseEnter(trigger);
    else fireEvent.click(trigger);
    const preview = screen.getByTestId(hover ? 'clip-thumbnail-hover-preview' : 'clip-thumbnail-lightbox');
    const countVideos = () => createElementSpy.mock.calls.filter((call: unknown[]) => call[0] === 'video').length;
    const videoCount = countVideos();
    const urlCount = createUrlSpy.mock.calls.length;

    for (const scale of [4, 1, 0.5, 2]) {
      const previousSnapshot = preview.querySelector('img')!.src;
      rerender(thumbnail(scale));
      await waitFor(() => expectScale(scale));
      expect(preview.querySelector('img')!.src).not.toBe(previousSnapshot);
      expect(canvas).toHaveClass('opacity-100');
    }
    // 取得処理のデバウンス期間を過ぎても、倍率変更では再デコードしない。
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 220)); });
    expect(countVideos()).toBe(videoCount);
    expect(createUrlSpy).toHaveBeenCalledTimes(urlCount);
  });

  it('画像の取得に失敗した代替アイコンは、拡大縮小しても等倍を保つ', async () => {
    vi.stubGlobal('Image', class {
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    });
    vi.stubGlobal('createImageBitmap', undefined);
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const displayDraws = new Map<HTMLCanvasElement, ReturnType<typeof vi.fn>>();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      if (!displayDraws.has(this)) displayDraws.set(this, vi.fn());
      return { ...originalGetContext.call(this, '2d'), drawImage: displayDraws.get(this) } as unknown as CanvasRenderingContext2D;
    });
    const file = new File(['broken'], 'broken.png', { type: 'image/png' });
    const { container, rerender } = render(<ClipThumbnail file={file} type="image" scale={4} />);
    const canvas = container.querySelector('canvas')!;
    await waitFor(() => expect(canvas).toHaveClass('opacity-100'));
    rerender(<ClipThumbnail file={file} type="image" scale={0.5} />);
    const calls = displayDraws.get(canvas)!.mock.calls;
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      // アイコン本来の12:7比率を保ち、16:9出力枠の中央へ収める。
      expect(call.slice(1)).toEqual([6, 0, 324, 189]);
    }
  });

  it('トリムを連続変更しても前のサムネイルを消さず、再キャプチャをまとめる', async () => {
    const { createElementSpy } = installVideoElementMock();
    const file = new File(['video'], 'stable-thumbnail.mp4', { type: 'video/mp4' });
    const { container, rerender } = render(
      <ClipThumbnail file={file} type="video" sourceTime={1} rangeStart={1} rangeEnd={8} />,
    );
    const canvas = container.querySelector('canvas');

    await waitFor(() => expect(canvas).toHaveClass('opacity-100'));
    const countCreatedVideos = () => createElementSpy.mock.calls
      .filter((call: unknown[]) => String(call[0]).toLowerCase() === 'video').length;
    const initialVideoCount = countCreatedVideos();

    rerender(<ClipThumbnail file={file} type="video" sourceTime={2} rangeStart={2} rangeEnd={8} />);
    rerender(<ClipThumbnail file={file} type="video" sourceTime={3} rangeStart={3} rangeEnd={8} />);
    rerender(<ClipThumbnail file={file} type="video" sourceTime={4} rangeStart={4} rangeEnd={8} />);

    // 更新待ちでも既存キャンバスを隠さない。
    expect(canvas).toHaveClass('opacity-100');
    expect(canvas).not.toHaveClass('opacity-0');

    await waitFor(() => expect(countCreatedVideos()).toBe(initialVideoCount + 1));
    expect(canvas).toHaveClass('opacity-100');
  });

  it('iOS Safari では一時 video を DOM に置いてフレームを prime する', async () => {
    const { getCreatedVideo, playSpy } = installVideoElementMock();
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');
    getPlatformCapabilitiesMock.mockReturnValue({ isIosSafari: true });

    const file = new File(['video'], 'ios.mov', { type: 'video/quicktime' });
    const { container } = render(<ClipThumbnail file={file} type="video" />);
    const canvas = container.querySelector('canvas');

    await waitFor(() => expect(playSpy).toHaveBeenCalled());
    await waitFor(() => expect(canvas).toHaveClass('opacity-100'));

    const createdVideo = getCreatedVideo();
    expect(createdVideo).not.toBeNull();
    expect(createdVideo?.getAttribute('playsinline')).toBe('');
    expect(createdVideo?.getAttribute('webkit-playsinline')).toBe('');
    expect(appendSpy.mock.calls.some(([node]) => node === createdVideo)).toBe(true);
    expect(removeSpy.mock.calls.some(([node]) => node === createdVideo)).toBe(true);
  });

  it('非 iOS でも DOM 配置してフレームを確保し、prime 再生は行わない', async () => {
    const { getCreatedVideo, playSpy } = installVideoElementMock();
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');

    const file = new File(['video'], 'desktop.mp4', { type: 'video/mp4' });
    const { container } = render(<ClipThumbnail file={file} type="video" />);
    const canvas = container.querySelector('canvas');

    await waitFor(() => expect(canvas).toHaveClass('opacity-100'));

    const createdVideo = getCreatedVideo();
    expect(createdVideo).not.toBeNull();
    // iOS 限定の prime 再生は走らない
    expect(playSpy).not.toHaveBeenCalled();
    // ただし DOM 配置は全環境で行い、キャプチャ後に外す
    expect(appendSpy.mock.calls.some(([node]) => node === createdVideo)).toBe(true);
    expect(removeSpy.mock.calls.some(([node]) => node === createdVideo)).toBe(true);
  });

  it('画像サムネイルが読み込めたら表示状態になる', async () => {
    const originalImage = globalThis.Image;
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 200;
      naturalHeight = 100;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    // @ts-expect-error test double
    globalThis.Image = MockImage;

    const file = new File(['img'], 'photo.png', { type: 'image/png' });
    const { container } = render(<ClipThumbnail file={file} type="image" />);
    const canvas = container.querySelector('canvas');

    await waitFor(() => expect(canvas).toHaveClass('opacity-100'));

    globalThis.Image = originalImage;
  });

  it('ホバー可能な PC ではマウスオーバーで拡大プレビューを出す', async () => {
    installMatchMediaMock(true);
    installVideoElementMock();

    const file = new File(['video'], 'desktop.mp4', { type: 'video/mp4' });
    const { container, rerender } = render(<ClipThumbnail file={file} type="video" />);

    const trigger = await screen.findByRole('button', { name: /マウスオーバーで拡大/ });
    await waitFor(() => expect(trigger).not.toBeDisabled());

    // 表示は小さいが、拡大用に高解像度でキャプチャしている
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.width).toBeGreaterThan(200);
    expect(canvas?.height).toBeGreaterThan(100);
    expect(canvas?.style.width).toBe('48px');
    expect(canvas?.style.height).toBe('28px');
    expect(trigger).toHaveAttribute('data-thumbnail-size', 'compact');

    rerender(<ClipThumbnail file={file} type="video" displaySize="prominent" />);
    expect(container.querySelector('canvas')?.style.width).toBe('96px');
    expect(container.querySelector('canvas')?.style.height).toBe('56px');
    expect(screen.getByRole('button', { name: /マウスオーバーで拡大/ })).toHaveAttribute(
      'data-thumbnail-size',
      'prominent',
    );

    rerender(<ClipThumbnail file={file} type="video" displaySize="card" />);
    expect(container.querySelector('canvas')?.style.width).toBe('104px');
    expect(container.querySelector('canvas')?.style.height).toBe('61px');
    expect(container.querySelector('canvas')?.style.objectFit).toBe('contain');

    const cardTrigger = screen.getByRole('button', { name: /マウスオーバーで拡大/ });
    await flushHoverSettleFrames();
    fireEvent.mouseEnter(cardTrigger);
    expect(await screen.findByTestId('clip-thumbnail-hover-preview')).toBeInTheDocument();

    fireEvent.mouseLeave(cardTrigger);
    await waitFor(() => {
      expect(screen.queryByTestId('clip-thumbnail-hover-preview')).not.toBeInTheDocument();
    });
  });

  it('閉じたときに乗っていた場合だけ、外してから再度載せると拡大する', async () => {
    installMatchMediaMock(true);
    installVideoElementMock();

    const file = new File(['video'], 'already-hover.mp4', { type: 'video/mp4' });
    const { rerender } = render(<ClipThumbnail file={file} type="video" />);
    const trigger = await screen.findByRole('button', { name: /マウスオーバーで拡大/ });
    await waitFor(() => expect(trigger).not.toBeDisabled());

    const matches = vi.spyOn(trigger, 'matches').mockImplementation((selector: string) => selector === ':hover');
    rerender(<ClipThumbnail file={file} type="video" displaySize="prominent" />);
    await flushHoverSettleFrames();

    fireEvent.mouseEnter(trigger);
    fireEvent.mouseMove(trigger, { movementX: 6, movementY: 3 });
    expect(screen.queryByTestId('clip-thumbnail-hover-preview')).not.toBeInTheDocument();

    fireEvent.mouseLeave(trigger);
    matches.mockImplementation(() => false);
    fireEvent.mouseEnter(trigger);
    expect(await screen.findByTestId('clip-thumbnail-hover-preview')).toBeInTheDocument();
  });

  it('タッチ端末ではタップでライトボックスを開き、背景タップで閉じる', async () => {
    installMatchMediaMock(false);
    installVideoElementMock();

    const file = new File(['video'], 'mobile.mp4', { type: 'video/mp4' });
    render(<ClipThumbnail file={file} type="video" />);

    const trigger = await screen.findByRole('button', { name: 'サムネイルを拡大表示' });
    await waitFor(() => expect(trigger).not.toBeDisabled());

    fireEvent.click(trigger);
    const lightbox = await screen.findByTestId('clip-thumbnail-lightbox');
    expect(lightbox).toBeInTheDocument();

    fireEvent.click(lightbox);
    await waitFor(() => {
      expect(screen.queryByTestId('clip-thumbnail-lightbox')).not.toBeInTheDocument();
    });
  });

  it('ホバー可能な PC ではクリックしてもライトボックスを開かない', async () => {
    installMatchMediaMock(true);
    installVideoElementMock();

    const file = new File(['video'], 'desktop.mp4', { type: 'video/mp4' });
    render(<ClipThumbnail file={file} type="video" />);

    const trigger = await screen.findByRole('button', { name: /マウスオーバーで拡大/ });
    await waitFor(() => expect(trigger).not.toBeDisabled());

    fireEvent.click(trigger);
    expect(screen.queryByTestId('clip-thumbnail-lightbox')).not.toBeInTheDocument();
  });
});
