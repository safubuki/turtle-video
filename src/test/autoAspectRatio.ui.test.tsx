/**
 * @file autoAspectRatio.ui.test.tsx
 * @description 「素材に合わせる（auto）」アスペクト比モードと「画面いっぱいに合わせる（切り抜き）」ボタンの UI テスト。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClipCompositionPanel from '../components/media/ClipCompositionPanel';
import ClipsSection from '../components/sections/ClipsSection';
import { useCanvasStore } from '../stores/canvasStore';
import type { MediaItem } from '../types';

vi.mock('../components/common/MiniPreview', () => ({
  default: () => <div data-testid="mini-preview" />,
}));

vi.mock('../components/common/ClipThumbnail', () => ({
  default: () => <div data-testid="clip-thumbnail" />,
}));

function createMediaItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'clip-1',
    file: new File(['x'], 'square.png', { type: 'image/png' }),
    type: 'image',
    url: 'blob:clip-1',
    volume: 1,
    isMuted: false,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 1,
    fadeOutDuration: 1,
    duration: 4,
    originalDuration: 0,
    trimStart: 0,
    trimEnd: 0,
    scale: 1,
    positionX: 0,
    positionY: 0,
    rotation: 0,
    blur: 0,
    isTransformOpen: false,
    isLocked: false,
    sourceWidth: 1080,
    sourceHeight: 1080,
    ...overrides,
  };
}

describe('画面いっぱいに合わせる（切り抜き）ボタン', () => {
  beforeEach(() => {
    useCanvasStore.getState().setAspectRatio('landscape');
    useCanvasStore.getState().applyFromSource(1920, 1080);
  });

  it('16:9 キャンバスに正方形素材を入れたときボタンが出て、押すとちょうどの切り抜き倍率（177.8%）を設定する', () => {
    const onUpdateScale = vi.fn();
    const onPreviewScale = vi.fn();
    render(
      <ClipCompositionPanel
        item={createMediaItem({ sourceWidth: 1080, sourceHeight: 1080 })}
        isDisabled={false}
        canvasWidth={1280}
        canvasHeight={720}
        mediaElement={null}
        currentLocalTime={0}
        onUpdateScale={onUpdateScale}
        onUpdatePosition={vi.fn()}
        onPreviewScale={onPreviewScale}
        onResetSetting={vi.fn()}
      />,
    );

    const button = screen.getByTestId('clip-cover-fill-clip-1');
    expect(button).toHaveTextContent('画面いっぱいに合わせる（切り抜き・177.8%）');
    fireEvent.click(button);
    expect(onUpdateScale).toHaveBeenCalledTimes(1);
    expect(onUpdateScale.mock.calls[0][0]).toBeCloseTo(16 / 9, 3);
    expect(onPreviewScale).toHaveBeenCalledTimes(1);
  });

  it('出力枠と同じ比率（正方形キャンバスに正方形素材）や縦固定（cover）ではボタンを出さない', () => {
    useCanvasStore.getState().setAspectRatio('auto');
    useCanvasStore.getState().applyFromSource(1080, 1080);
    const { rerender } = render(
      <ClipCompositionPanel
        item={createMediaItem({ sourceWidth: 1080, sourceHeight: 1080 })}
        isDisabled={false}
        canvasWidth={720}
        canvasHeight={720}
        mediaElement={null}
        currentLocalTime={0}
        onUpdateScale={vi.fn()}
        onUpdatePosition={vi.fn()}
        onResetSetting={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('clip-cover-fill-clip-1')).not.toBeInTheDocument();

    // 縦 9:16 固定（cover 基準）では最初から埋まるので出さない
    act(() => {
      useCanvasStore.getState().setAspectRatio('portrait');
    });
    rerender(
      <ClipCompositionPanel
        item={createMediaItem({ sourceWidth: 1920, sourceHeight: 1080 })}
        isDisabled={false}
        canvasWidth={720}
        canvasHeight={1280}
        mediaElement={null}
        currentLocalTime={0}
        onUpdateScale={vi.fn()}
        onUpdatePosition={vi.fn()}
        onResetSetting={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('clip-cover-fill-clip-1')).not.toBeInTheDocument();
  });
});

describe('ClipsSection の出力向き 3 択トグル', () => {
  beforeEach(() => {
    useCanvasStore.getState().setAspectRatio('landscape');
  });

  it('横画面・縦画面・素材に合わせる の 3 択を表示し、素材に合わせるを押すと auto で通知する', () => {
    const onAspectRatioChange = vi.fn();
    render(
      <ClipsSection
        mediaItems={[]}
        mediaTimelineRanges={{}}
        currentTime={0}
        isClipsLocked={false}
        mediaElements={{}}
        onToggleClipsLock={vi.fn()}
        onMediaUpload={vi.fn()}
        onOpenMediaPicker={vi.fn()}
        supportsShowOpenFilePicker={false}
        onAspectRatioChange={onAspectRatioChange}
        onMoveMedia={vi.fn()}
        onRemoveMedia={vi.fn()}
        onToggleMediaLock={vi.fn()}
        onToggleTransformPanel={vi.fn()}
        onUpdateVideoTrim={vi.fn()}
        onSetVideoTrimFromCurrent={vi.fn()}
        onUpdateImageDuration={vi.fn()}
        onUpdateMediaScale={vi.fn()}
        onUpdateMediaPosition={vi.fn()}
        onRotateMedia={vi.fn()}
        onUpdateMediaBlur={vi.fn()}
        onResetMediaSetting={vi.fn()}
        onUpdateMediaVolume={vi.fn()}
        onToggleMediaMute={vi.fn()}
        onBeforeTransitionEdit={vi.fn()}
        onToggleMediaFadeIn={vi.fn()}
        onToggleMediaFadeOut={vi.fn()}
        onUpdateFadeInDuration={vi.fn()}
        onUpdateFadeOutDuration={vi.fn()}
        onOpenHelp={vi.fn()}
      />,
    );

    const autoButton = screen.getByRole('button', { name: '素材に合わせる' });
    expect(autoButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(autoButton);
    expect(onAspectRatioChange).toHaveBeenCalledWith('auto');
  });
});
