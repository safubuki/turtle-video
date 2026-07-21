import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClipsSection from '../components/sections/ClipsSection';
import type { MediaItem } from '../types';

function createImageItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'image-1',
    file: new File(['image'], 'image.png', { type: 'image/png' }),
    type: 'image',
    url: 'blob:image-1',
    volume: 1,
    isMuted: false,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 1,
    fadeOutDuration: 1,
    duration: 5,
    originalDuration: 5,
    trimStart: 0,
    trimEnd: 5,
    scale: 1,
    positionX: 0,
    positionY: 0,
    rotation: 0,
    blur: 4,
    isTransformOpen: true,
    isLocked: false,
    ...overrides,
  };
}

function renderClipsSection(overrides: Partial<ComponentProps<typeof ClipsSection>> = {}) {
  const props: ComponentProps<typeof ClipsSection> = {
    mediaItems: [],
    mediaTimelineRanges: {},
    isClipsLocked: false,
    mediaElements: {},
    onToggleClipsLock: vi.fn(),
    onMediaUpload: vi.fn(),
    onOpenMediaPicker: vi.fn(),
    supportsShowOpenFilePicker: false,
    onMoveMedia: vi.fn(),
    onRemoveMedia: vi.fn(),
    onToggleMediaLock: vi.fn(),
    onToggleTransformPanel: vi.fn(),
    onUpdateVideoTrim: vi.fn(),
    onUpdateImageDuration: vi.fn(),
    onUpdateMediaScale: vi.fn(),
    onUpdateMediaPosition: vi.fn(),
    onRotateMedia: vi.fn(),
    onUpdateMediaBlur: vi.fn(),
    onResetMediaSetting: vi.fn(),
    onUpdateMediaVolume: vi.fn(),
    onToggleMediaMute: vi.fn(),
    onToggleMediaFadeIn: vi.fn(),
    onToggleMediaFadeOut: vi.fn(),
    onUpdateFadeInDuration: vi.fn(),
    onUpdateFadeOutDuration: vi.fn(),
    onOpenHelp: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<ClipsSection {...props} />),
    props,
  };
}

function getFileInput(container: HTMLElement): HTMLInputElement {
  const fileInput = container.querySelector('input[type="file"]');
  if (!(fileInput instanceof HTMLInputElement)) {
    throw new Error('file input not found');
  }
  return fileInput;
}

describe('ClipsSection media picker routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('showOpenFilePicker 経路が有効なときは専用 picker を開く', () => {
    const onOpenMediaPicker = vi.fn();
    const { container } = renderClipsSection({
      supportsShowOpenFilePicker: true,
      onOpenMediaPicker,
    });
    const inputClickSpy = vi.spyOn(getFileInput(container), 'click');
    try {
      fireEvent.click(screen.getByRole('button', { name: '追加' }));

      expect(onOpenMediaPicker).toHaveBeenCalledTimes(1);
      expect(inputClickSpy).not.toHaveBeenCalled();
    } finally {
      inputClickSpy.mockRestore();
    }
  });

  it('カード内のぼかしスライダーを対象カードの更新へルーティングする', () => {
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const onUpdateMediaBlur = vi.fn();
    renderClipsSection({
      mediaItems: [createImageItem()],
      onUpdateMediaBlur,
    });

    expect(screen.getByText('ぼかし: 4 px')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: 'ぼかし強度' }), {
      target: { value: '12' },
    });

    expect(onUpdateMediaBlur).toHaveBeenCalledWith('image-1', 12);
  });

  it('showOpenFilePicker 経路を無効化したときは hidden input を使う', () => {
    const onOpenMediaPicker = vi.fn();
    const { container } = renderClipsSection({
      supportsShowOpenFilePicker: false,
      onOpenMediaPicker,
    });
    const inputClickSpy = vi.spyOn(getFileInput(container), 'click');
    try {
      fireEvent.click(screen.getByRole('button', { name: '追加' }));

      expect(onOpenMediaPicker).not.toHaveBeenCalled();
      expect(inputClickSpy).toHaveBeenCalledTimes(1);
    } finally {
      inputClickSpy.mockRestore();
    }
  });
});
