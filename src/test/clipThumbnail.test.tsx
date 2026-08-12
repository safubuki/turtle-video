import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    const { container } = render(<ClipThumbnail file={file} type="video" />);

    const trigger = await screen.findByRole('button', { name: /マウスオーバーで拡大/ });
    await waitFor(() => expect(trigger).not.toBeDisabled());

    // 表示は小さいが、拡大用に高解像度でキャプチャしている
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.width).toBeGreaterThan(200);
    expect(canvas?.height).toBeGreaterThan(100);
    expect(canvas?.style.width).toBe('48px');
    expect(canvas?.style.height).toBe('28px');

    fireEvent.mouseEnter(trigger);
    expect(await screen.findByTestId('clip-thumbnail-hover-preview')).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);
    await waitFor(() => {
      expect(screen.queryByTestId('clip-thumbnail-hover-preview')).not.toBeInTheDocument();
    });
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
