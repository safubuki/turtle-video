/**
 * @file clipItemSpeedBadge.test.tsx
 * @description 等倍でも速度バッジのチェックと位置設定ができること
 */
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClipItem from '../components/media/ClipItem';
import type { MediaItem } from '../types';
import { DEFAULT_SPEED_BADGE_POSITION } from '../utils/playbackSpeed';

vi.mock('../components/common/ClipThumbnail', () => ({
  default: () => <div data-testid="clip-thumbnail" />,
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

describe('ClipItem 速度バッジ', () => {
  it('等倍でもチェックでき、ON にすると位置設定が出る', () => {
    const onUpdateShowSpeedBadge = vi.fn();
    const { rerender, props } = renderClipItem({ onUpdateShowSpeedBadge });
    openPlaybackSpeed();

    const checkbox = screen.getByTestId('clip-show-speed-badge-video-1');
    expect(checkbox).not.toBeDisabled();
    expect(checkbox.closest('label')).toHaveClass('text-[10px]', 'md:text-xs', 'text-gray-300');
    expect(screen.queryByTestId('clip-speed-badge-settings-video-1')).not.toBeInTheDocument();
    expect(
      screen.getByText('等倍の映像には出しません。先にチェックしてから速度を変えられます。'),
    ).toHaveClass('text-[10px]', 'md:text-xs', 'text-gray-400');

    fireEvent.click(checkbox);
    expect(onUpdateShowSpeedBadge).toHaveBeenCalledWith(true);

    rerender(
      <ClipItem
        {...props}
        item={createVideo({ showSpeedBadge: true })}
        onUpdateShowSpeedBadge={onUpdateShowSpeedBadge}
      />,
    );

    expect(screen.getByTestId('clip-speed-badge-settings-video-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '右上' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: '速度バッジの縦位置' })).toHaveValue(
      String(DEFAULT_SPEED_BADGE_POSITION.y),
    );
    expect(screen.getByRole('slider', { name: '速度バッジの横位置' })).toHaveValue(
      String(DEFAULT_SPEED_BADGE_POSITION.x),
    );
  });

  it('ロック中だけチェックを無効化する', () => {
    const { rerender, props } = renderClipItem();
    openPlaybackSpeed();
    expect(screen.getByTestId('clip-show-speed-badge-video-1')).not.toBeDisabled();

    rerender(
      <ClipItem
        {...props}
        item={createVideo({ isLocked: true, playbackSpeed: 1 })}
      />,
    );
    expect(screen.getByTestId('clip-show-speed-badge-video-1')).toBeDisabled();
  });
});
