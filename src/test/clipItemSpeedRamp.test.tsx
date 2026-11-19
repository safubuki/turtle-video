/**
 * @file clipItemSpeedRamp.test.tsx
 * @description 動画カードの「前の動画から速度をなめらかにつなぐ」UI
 */
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClipItem from '../components/media/ClipItem';
import type { MediaItem } from '../types';

vi.mock('../components/common/ClipThumbnail', () => ({
  default: ({ scale, positionX, positionY, rotation }: {
    scale?: number; positionX?: number; positionY?: number; rotation?: number;
  }) => (
    <div data-testid="clip-thumbnail" data-scale={scale} data-position-x={positionX} data-position-y={positionY} data-rotation={rotation} />
  ),
}));

vi.mock('../components/common/MiniPreview', () => ({
  default: () => <div data-testid="mini-preview" />,
}));

function createVideo(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'video-1',
    file: new File(['x'], 'clip.mp4', { type: 'video/mp4' }),
    type: 'video',
    url: 'blob:video-1',
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
    blur: 0,
    isTransformOpen: false,
    isLocked: false,
    playbackSpeed: 1,
    showSpeedBadge: false,
    ...overrides,
  };
}

function renderClipItem(overrides: Partial<ComponentProps<typeof ClipItem>> = {}) {
  const props: ComponentProps<typeof ClipItem> = {
    item: createVideo(),
    timelineRange: { start: 0, end: 5 },
    currentTime: 0,
    index: 0,
    totalItems: 1,
    isClipsLocked: false,
    mediaElement: null,
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onRemove: vi.fn(),
    onToggleLock: vi.fn(),
    onToggleTransformPanel: vi.fn(),
    onUpdateVideoTrim: vi.fn(),
    onUpdateImageDuration: vi.fn(),
    onUpdateScale: vi.fn(),
    onUpdateZoomDirection: vi.fn(),
    onUpdateZoomAmount: vi.fn(),
    onUpdatePosition: vi.fn(),
    onResetSetting: vi.fn(),
    onUpdateVolume: vi.fn(),
    onToggleMute: vi.fn(),
    onUpdatePlaybackSpeed: vi.fn(),
    onUpdateShowSpeedBadge: vi.fn(),
    onUpdateSpeedBadgeLabelStyle: vi.fn(),
    onUpdateSpeedBadgePosition: vi.fn(),
    onApplySpeedBadgePreset: vi.fn(),
    onToggleFadeIn: vi.fn(),
    onToggleFadeOut: vi.fn(),
    onUpdateFadeInDuration: vi.fn(),
    onUpdateFadeOutDuration: vi.fn(),
    ...overrides,
  };
  return { ...render(<ClipItem {...props} />), props };
}

function openPlaybackSpeed() {
  fireEvent.click(screen.getByRole('button', { name: /再生速度/ }));
}

describe('ClipItem 速度のなめらか接続', () => {
  it('直前が動画のときだけ出し、ON/OFF を通知する', () => {
    const onUpdateSpeedRampIn = vi.fn();
    const { rerender, props } = renderClipItem({
      item: createVideo({ playbackSpeed: 0.8, duration: 6.25 }),
      onUpdateSpeedRampIn,
      onUpdateSpeedRampDuration: vi.fn(),
      previousVideoSpeed: 1,
    });
    openPlaybackSpeed();
    const toggle = screen.getByTestId('clip-speed-ramp-toggle-video-1');
    expect(toggle).not.toBeChecked();
    expect(screen.getByTestId('clip-speed-ramp-note-video-1')).toHaveTextContent('前の動画（1倍）');
    expect(screen.queryByRole('slider', { name: '速度をなめらかにつなぐ時間' })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(onUpdateSpeedRampIn).toHaveBeenCalledWith(true);

    rerender(
      <ClipItem
        {...props}
        item={createVideo({ playbackSpeed: 0.8, speedRampIn: true, speedRampFromSpeed: 1, speedRampDuration: 1 })}
      />,
    );
    expect(screen.getByTestId('clip-speed-ramp-toggle-video-1')).toBeChecked();
    expect(screen.getByRole('slider', { name: '速度をなめらかにつなぐ時間' })).toBeInTheDocument();
    expect(screen.getByTestId('clip-speed-ramp-note-video-1')).toHaveTextContent('1倍 → 0.8倍');
  });

  it('先頭や画像の次（直前が動画でない）では出さない', () => {
    renderClipItem({
      item: createVideo({ playbackSpeed: 0.8 }),
      onUpdateSpeedRampIn: vi.fn(),
      previousVideoSpeed: null,
    });
    openPlaybackSpeed();
    expect(screen.queryByTestId('clip-speed-ramp-video-1')).not.toBeInTheDocument();
  });

  it('前と同じ速さ・2 画面表示のペアでは効かないことを伝える', () => {
    const { rerender, props } = renderClipItem({
      item: createVideo({ playbackSpeed: 1 }),
      onUpdateSpeedRampIn: vi.fn(),
      previousVideoSpeed: 1,
    });
    openPlaybackSpeed();
    expect(screen.getByTestId('clip-speed-ramp-note-video-1')).toHaveTextContent('変化しません');
    rerender(<ClipItem {...props} item={createVideo({ playbackSpeed: 0.8 })} isInSplitComparePair />);
    expect(screen.getByTestId('clip-speed-ramp-note-video-1')).toHaveTextContent('2画面表示のペアでは使えません');
  });

  it('前のカード（0.8倍）から「次の動画へ」を操作でき、設定の実体は次のカードへ通知する', () => {
    const onUpdateNextSpeedRampIn = vi.fn();
    const nextInfo = {
      speed: 1,
      enabled: false,
      duration: 1,
      actualSec: null,
      isLocked: false,
      isSplitComparePair: false,
    };
    const { rerender, props } = renderClipItem({
      item: createVideo({ playbackSpeed: 0.8 }),
      onUpdateSpeedRampIn: vi.fn(),
      nextClipSpeedRamp: nextInfo,
      onUpdateNextSpeedRampIn,
      onUpdateNextSpeedRampDuration: vi.fn(),
    });
    openPlaybackSpeed();
    // 先頭カードなので「前の動画から」は出さず、「次の動画へ」だけ出す
    expect(screen.queryByTestId('clip-speed-ramp-video-1')).not.toBeInTheDocument();
    const toggle = screen.getByTestId('clip-next-speed-ramp-toggle-video-1');
    expect(toggle).not.toBeChecked();
    expect(screen.getByTestId('clip-next-speed-ramp-note-video-1')).toHaveTextContent('次の動画（1倍）');

    fireEvent.click(toggle);
    expect(onUpdateNextSpeedRampIn).toHaveBeenCalledWith(true);

    rerender(
      <ClipItem
        {...props}
        item={createVideo({ playbackSpeed: 0.8 })}
        nextClipSpeedRamp={{ ...nextInfo, enabled: true, actualSec: 1 }}
      />,
    );
    expect(screen.getByTestId('clip-next-speed-ramp-toggle-video-1')).toBeChecked();
    expect(screen.getByRole('slider', { name: '次の動画へ速度をなめらかにつなぐ時間' })).toBeInTheDocument();
    expect(screen.getByTestId('clip-next-speed-ramp-note-video-1')).toHaveTextContent('0.8倍 → 1倍');
    expect(screen.getByTestId('clip-next-speed-ramp-note-video-1')).toHaveTextContent('この動画はそのままです');
  });

  it('次のカードがロック中なら「次の動画へ」は変えられない。次が動画でなければ出さない', () => {
    const { rerender, props } = renderClipItem({
      item: createVideo({ playbackSpeed: 0.8 }),
      onUpdateSpeedRampIn: vi.fn(),
      nextClipSpeedRamp: {
        speed: 1, enabled: false, duration: 1, actualSec: null, isLocked: true, isSplitComparePair: false,
      },
      onUpdateNextSpeedRampIn: vi.fn(),
    });
    openPlaybackSpeed();
    expect(screen.getByTestId('clip-next-speed-ramp-toggle-video-1')).toBeDisabled();
    rerender(<ClipItem {...props} nextClipSpeedRamp={null} />);
    expect(screen.queryByTestId('clip-next-speed-ramp-video-1')).not.toBeInTheDocument();
  });

  it('再生速度を出さない画面（onUpdateSpeedRampIn なし）では出さない', () => {
    renderClipItem({ item: createVideo({ playbackSpeed: 0.8 }), previousVideoSpeed: 1 });
    openPlaybackSpeed();
    expect(screen.queryByTestId('clip-speed-ramp-video-1')).not.toBeInTheDocument();
  });
});
