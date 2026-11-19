/**
 * @file clipSplitDisplay.test.tsx
 * @description 分割点（例 13.38 秒）が、見出し・トリミング欄・開始/終了の数値で同じに見えること
 */
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClipItem from '../components/media/ClipItem';
import type { MediaItem } from '../types';
import {
  formatClipCompactClock,
  formatClipDurationLabel,
  stepStartTime,
} from '../utils/timeStepperInput';

vi.mock('../components/common/ClipThumbnail', () => ({
  default: () => <div data-testid="clip-thumbnail" />,
}));

vi.mock('../components/common/MiniPreview', () => ({
  default: () => <div data-testid="mini-preview" />,
}));

function createVideo(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'video-2',
    file: new File(['x'], 'clip.mp4', { type: 'video/mp4' }),
    type: 'video',
    url: 'blob:video-2',
    volume: 1,
    isMuted: false,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 1,
    fadeOutDuration: 1,
    // 13.38333 秒（プレビュー位置そのまま）で分割した後半
    duration: 15.04 - 13.383333,
    originalDuration: 15.04,
    trimStart: 13.383333,
    trimEnd: 15.04,
    scale: 1,
    positionX: 0,
    positionY: 0,
    rotation: 0,
    blur: 0,
    isTransformOpen: false,
    isLocked: false,
    playbackSpeed: 1,
    ...overrides,
  };
}

function renderClipItem(overrides: Partial<ComponentProps<typeof ClipItem>> = {}) {
  const props: ComponentProps<typeof ClipItem> = {
    item: createVideo(),
    timelineRange: { start: 13.383333, end: 15.04 },
    currentTime: 0,
    index: 1,
    totalItems: 2,
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
    onToggleFadeIn: vi.fn(),
    onToggleFadeOut: vi.fn(),
    onUpdateFadeInDuration: vi.fn(),
    onUpdateFadeOutDuration: vi.fn(),
    ...overrides,
  };
  return { ...render(<ClipItem {...props} />), props };
}

describe('カード見出しの時刻・長さ', () => {
  it('0.1 秒で表せる値は従来どおり、表せない値だけ 1/100 秒で出す', () => {
    expect(formatClipCompactClock(0)).toBe('0:00.0');
    expect(formatClipCompactClock(5)).toBe('0:05.0');
    expect(formatClipCompactClock(13.4)).toBe('0:13.4');
    expect(formatClipCompactClock(13.383333)).toBe('0:13.38');
    expect(formatClipCompactClock(75.05)).toBe('1:15.05');
    expect(formatClipDurationLabel(5)).toBe('5秒');
    expect(formatClipDurationLabel(13.4)).toBe('13.4秒');
    expect(formatClipDurationLabel(15.04 - 13.383333)).toBe('1.66秒');
  });
});

describe('開始の −/+', () => {
  it('1/100 秒の開始からでも 0.1 秒格子へ吸着する（終了の −/+ と同じ）', () => {
    expect(stepStartTime(13.38, 1)).toBe(13.5);
    expect(stepStartTime(13.38, -1)).toBe(13.3);
    expect(stepStartTime(13.4, 1)).toBe(13.5);
    expect(stepStartTime(0.03, -1)).toBe(0);
  });
});

describe('分割した後半カードの表示', () => {
  it('見出し・トリミング欄・開始/終了の数値が同じ 13.38 を指す', () => {
    renderClipItem();
    expect(screen.getByTestId('clip-card-summary-video-2')).toHaveTextContent('0:13.38–0:15.04');
    expect(screen.getByTestId('clip-card-summary-video-2')).toHaveTextContent('1.66秒');
    expect(screen.getByText('トリミング: 13.38s - 15.04s')).toBeInTheDocument();
    expect(screen.getByLabelText('トリミング開始位置（数値）')).toHaveValue('13.38');
    expect(screen.getByLabelText('トリミング終了位置（数値）')).toHaveValue('15.04');
  });

  it('開始の + は 0.1 秒格子の 13.5 へ進める', () => {
    const onUpdateVideoTrim = vi.fn();
    renderClipItem({ onUpdateVideoTrim });
    fireEvent.click(screen.getByRole('button', { name: 'トリミング開始位置を0.1増やす' }));
    expect(onUpdateVideoTrim).toHaveBeenCalledWith('start', '13.5');
  });
});
