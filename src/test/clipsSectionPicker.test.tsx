import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClipsSection from '../components/sections/ClipsSection';
import { PlatformCapabilitiesProvider } from '../app/PlatformCapabilitiesContext';
import type { MediaItem } from '../types';
import { getPlatformCapabilities } from '../utils/platform';

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

function renderClipsSection(
  overrides: Partial<ComponentProps<typeof ClipsSection>> = {},
  isIosSafari = false,
) {
  const props: ComponentProps<typeof ClipsSection> = {
    mediaItems: [],
    mediaTimelineRanges: {},
    currentTime: 0,
    isClipsLocked: false,
    mediaElements: {},
    onToggleClipsLock: vi.fn(),
    onMediaUpload: vi.fn(),
    onOpenMediaPicker: vi.fn(),
    supportsShowOpenFilePicker: false,
    onAspectRatioChange: vi.fn(),
    onMoveMedia: vi.fn(),
    onRemoveMedia: vi.fn(),
    onToggleMediaLock: vi.fn(),
    onToggleTransformPanel: vi.fn(),
    onUpdateVideoTrim: vi.fn(),
    onSetVideoTrimFromCurrent: vi.fn(),
    onUpdateImageDuration: vi.fn(),
    onUpdateMediaScale: vi.fn(),
    onUpdateMediaPosition: vi.fn(),
    onRotateMedia: vi.fn(),
    onUpdateMediaBlur: vi.fn(),
    onResetMediaSetting: vi.fn(),
    onUpdateMediaVolume: vi.fn(),
    onToggleMediaMute: vi.fn(),
    onBeforeTransitionEdit: vi.fn(),
    onSetAllVideosMuted: vi.fn(),
    onToggleMediaFadeIn: vi.fn(),
    onToggleMediaFadeOut: vi.fn(),
    onUpdateFadeInDuration: vi.fn(),
    onUpdateFadeOutDuration: vi.fn(),
    onOpenHelp: vi.fn(),
    ...overrides,
  };

  const section = <ClipsSection {...props} />;
  const view = isIosSafari ? (
    <PlatformCapabilitiesProvider
      capabilities={{
        ...getPlatformCapabilities(),
        isIOS: true,
        isSafari: true,
        isIosSafari: true,
      }}
    >
      {section}
    </PlatformCapabilitiesProvider>
  ) : section;

  return {
    ...render(view),
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

describe('ClipsSection bulk mute', () => {
  function createVideoItem(id: string, isMuted = false): MediaItem {
    return {
      id,
      file: new File(['video'], `${id}.mp4`, { type: 'video/mp4' }),
      type: 'video',
      url: `blob:${id}`,
      volume: 1,
      isMuted,
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
      blur: 0,
      isTransformOpen: false,
      isLocked: false,
    };
  }

  it('タイトル横の一括ミュートで全動画をミュートする', () => {
    const { props } = renderClipsSection({
      // MiniPreview（IntersectionObserver）を開かないよう transform は閉じる
      mediaItems: [
        createVideoItem('v1'),
        createVideoItem('v2'),
        createImageItem({ isTransformOpen: false }),
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'すべての動画をミュート' }));
    expect(props.onSetAllVideosMuted).toHaveBeenCalledWith(true);
  });

  it('全動画がミュート済みなら解除を呼ぶ', () => {
    const { props } = renderClipsSection({
      mediaItems: [createVideoItem('v1', true), createVideoItem('v2', true)],
    });

    fireEvent.click(screen.getByRole('button', { name: 'すべての動画のミュートを解除' }));
    expect(props.onSetAllVideosMuted).toHaveBeenCalledWith(false);
  });

  it('動画が無いときは一括ミュートボタンを無効化する', () => {
    renderClipsSection({ mediaItems: [createImageItem({ isTransformOpen: false })] });
    expect(screen.getByRole('button', { name: 'ミュート対象の動画がありません' })).toBeDisabled();
  });
});

describe('ClipsSection transition editing', () => {
  const twoImages = [
    createImageItem({ isTransformOpen: false }),
    createImageItem({
      id: 'image-2',
      file: new File(['image-2'], 'image-2.png', { type: 'image/png' }),
      url: 'blob:image-2',
      isTransformOpen: false,
    }),
  ];

  it('設定を開く時とトランジションを選ぶ時に再生停止を要求する', () => {
    const onBeforeTransitionEdit = vi.fn();
    renderClipsSection({
      mediaItems: twoImages,
      onBeforeTransitionEdit,
    });

    fireEvent.click(screen.getByRole('button', { name: 'トランジション' }));
    expect(onBeforeTransitionEdit).toHaveBeenCalledTimes(1);

    onBeforeTransitionEdit.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'ディゾルブ' }));
    expect(onBeforeTransitionEdit).toHaveBeenCalledTimes(1);
  });

  it('開いた設定で時間を変更する時にも再生停止を要求する', () => {
    const onBeforeTransitionEdit = vi.fn();
    renderClipsSection({
      mediaItems: [
        createImageItem({
          isTransformOpen: false,
          transitionToNext: { type: 'dissolve', duration: 1 },
        }),
        twoImages[1],
      ],
      onBeforeTransitionEdit,
    });

    fireEvent.click(screen.getByRole('button', { name: 'ディゾルブ 1秒' }));
    onBeforeTransitionEdit.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '2秒' }));

    expect(onBeforeTransitionEdit).toHaveBeenCalledTimes(1);
  });
});

describe('ClipsSection aspect ratio controls', () => {
  it('スマホ表示ではカード1件とトランジションを確認しやすい一覧高さにする', () => {
    const { container } = renderClipsSection();
    const scrollArea = container.querySelector('.custom-scrollbar');

    expect(scrollArea).not.toBeNull();
    expect(scrollArea?.className).toContain('max-h-[min(32rem,72svh)]');
    expect(scrollArea?.className).toContain('lg:max-h-128');
  });

  it('縦画面ボタンから親の向き変更ハンドラを呼ぶ', () => {
    const onAspectRatioChange = vi.fn();
    renderClipsSection({ onAspectRatioChange });

    fireEvent.click(screen.getByTitle('縦画面 (9:16)'));

    expect(onAspectRatioChange).toHaveBeenCalledWith('portrait');
  });

  it('ウォーターマーク設定を動画・画像カード一覧の先頭へ配置する', () => {
    renderClipsSection({
      watermarkPanel: <div>ウォーターマーク設定パネル</div>,
    });

    const watermark = screen.getByText('ウォーターマーク設定パネル');
    const emptyState = screen.getByText('動画または画像ファイルを追加してください');
    expect(
      watermark.compareDocumentPosition(emptyState) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('apple-safari では新しい素材操作を表示せず操作経路も渡さない', () => {
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });

    renderClipsSection(
      {
        mediaItems: [createImageItem()],
        watermarkPanel: <div>ウォーターマーク設定パネル</div>,
      },
      true,
    );

    expect(screen.queryByTitle('縦画面 (9:16)')).not.toBeInTheDocument();
    expect(screen.queryByText('ウォーターマーク設定パネル')).not.toBeInTheDocument();
    expect(screen.queryByText('90°回転')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'ぼかし強度' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ミュート対象の動画がありません' })).not.toBeInTheDocument();
  });
});

describe('クリップ調整パネルのミニプレビュー配置', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ミニプレビューを調整スライダーより「上」に置く', () => {
    // MiniPreview は IntersectionObserver を使うためスタブする
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });

    const { container } = renderClipsSection({
      mediaItems: [createImageItem()],
    });

    const panel = container.querySelector('[id^="clip-transform-settings-"]');
    expect(panel).toBeTruthy();

    // ミニプレビュー（canvas）と最初の調整スライダーの DOM 上の前後関係を見る。
    // 調整結果を確認する場所なので、操作するスライダーより前（＝画面上では上）に出す。
    // 下に置くと、スマホでスライダーを操作する指がプレビューを隠してしまう。
    const miniPreviewCanvas = panel!.querySelector('canvas');
    const firstSlider = panel!.querySelector('input[type="range"]');
    expect(miniPreviewCanvas).toBeTruthy();
    expect(firstSlider).toBeTruthy();

    const position = miniPreviewCanvas!.compareDocumentPosition(firstSlider!);
    // DOCUMENT_POSITION_FOLLOWING = スライダーがミニプレビューより後ろにある
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
