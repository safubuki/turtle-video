import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PreviewSection from '../components/sections/PreviewSection';
import type { MediaItem } from '../types';

const mediaItem: MediaItem = {
  id: 'media-1',
  file: new File(['video'], 'sample.mp4', { type: 'video/mp4' }),
  type: 'video',
  url: 'blob:sample',
  volume: 1,
  isMuted: false,
  fadeIn: false,
  fadeOut: false,
  fadeInDuration: 0,
  fadeOutDuration: 0,
  duration: 10,
  originalDuration: 10,
  trimStart: 0,
  trimEnd: 10,
  scale: 1,
  positionX: 0,
  positionY: 0,
  isTransformOpen: false,
  isLocked: false,
};

function renderPreviewSection(overrides?: Partial<React.ComponentProps<typeof PreviewSection>>) {
  const props: React.ComponentProps<typeof PreviewSection> = {
    mediaItems: [mediaItem],
    bgm: null,
    narrations: [],
    canvasRef: React.createRef<HTMLCanvasElement>(),
    currentTime: 1,
    totalDuration: 10,
    isPlaying: false,
    isProcessing: false,
    isLoading: false,
    exportPreparationStep: null,
    exportUrl: null,
    exportExt: null,
    onSeekChange: vi.fn(),
    onSeekStart: vi.fn(),
    onSeekEnd: vi.fn(),
    onTogglePlay: vi.fn(),
    onStop: vi.fn(),
    onExport: vi.fn(),
    onDownload: vi.fn(),
    onClearAll: vi.fn(),
    onCapture: vi.fn(),
    onOpenHelp: vi.fn(),
    formatTime: (seconds: number) => `${seconds.toFixed(1)}s`,
    ...overrides,
  };

  return {
    ...render(<PreviewSection {...props} />),
    props,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('PreviewSection action buttons', () => {
  it('停止とキャプチャの初期状態は既存のグレー系を維持する', () => {
    renderPreviewSection();

    const stopButton = screen.getByRole('button', { name: 'プレビューを停止' });
    const captureButton = screen.getByRole('button', { name: 'プレビューをキャプチャ' });

    expect(stopButton.className).toContain('bg-gray-800');
    expect(stopButton.className).toContain('text-gray-300');
    expect(captureButton.className).toContain('bg-gray-800');
    expect(captureButton.className).toContain('text-gray-300');
  });

  it('キャプチャ押下時だけ追加ボタン色の変化で押下感を出す', () => {
    vi.useFakeTimers();
    const onStop = vi.fn();
    const onCapture = vi.fn();
    renderPreviewSection({ onStop, onCapture });

    const stopButton = screen.getByRole('button', { name: 'プレビューを停止' });
    const captureButton = screen.getByRole('button', { name: 'プレビューをキャプチャ' });

    fireEvent.click(stopButton);

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(stopButton.className).not.toContain('animate-preview-capture-press');

    fireEvent.click(captureButton);

    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(captureButton.className).toContain('animate-preview-capture-press');
    expect(captureButton.className).toContain('bg-emerald-700');

    act(() => {
      vi.advanceTimersByTime(450);
    });

    expect(captureButton.className).not.toContain('animate-preview-capture-press');
  });

  it('準備中はフェーズ番号付きのボタン文言を表示する', () => {
    renderPreviewSection({
      isProcessing: true,
      currentTime: 0,
      exportPreparationStep: 1,
    });

    expect(screen.getByRole('button', { name: '書き出し準備 1/4...' })).toBeInTheDocument();
  });

  it('準備フェーズ番号をボタンに反映する', () => {
    renderPreviewSection({
      isProcessing: true,
      currentTime: 0,
      exportPreparationStep: 3,
    });

    expect(screen.getByRole('button', { name: '書き出し準備 3/4...' })).toBeInTheDocument();
  });
});
