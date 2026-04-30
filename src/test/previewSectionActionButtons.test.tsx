import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PreviewSection from '../components/sections/PreviewSection';
import type { AppFlavor } from '../app/resolveAppFlavor';
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
    appFlavor: 'standard' as AppFlavor,
    supportsShowSaveFilePicker: false,
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
  it('停止とキャプチャの既定スタイルを表示する', () => {
    renderPreviewSection();

    const stopButton = screen.getByRole('button', { name: 'プレビューを停止' });
    const captureButton = screen.getByRole('button', { name: 'プレビューをキャプチャ' });

    expect(stopButton.className).toContain('bg-gray-800');
    expect(stopButton.className).toContain('text-gray-300');
    expect(captureButton.className).toContain('bg-gray-800');
    expect(captureButton.className).toContain('text-gray-300');
  });

  it('キャプチャ押下時だけ強調表示を適用する', () => {
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

  it('停止位置から 0 秒へ戻る初期化は進捗扱いせず準備表示を維持する', () => {
    vi.useFakeTimers();
    const { rerender, props } = renderPreviewSection({
      currentTime: 6,
      isProcessing: false,
      exportPreparationStep: null,
    });

    rerender(
      <PreviewSection
        {...props}
        currentTime={6}
        isProcessing
        exportPreparationStep={1}
      />,
    );

    rerender(
      <PreviewSection
        {...props}
        currentTime={0}
        isProcessing
        exportPreparationStep={1}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1800);
    });

    expect(screen.getByRole('button', { name: '書き出し準備 1/4...' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'フレーム待機中...' })).not.toBeInTheDocument();
  });

  it('開始直後の微小な進行は準備表示を維持する', () => {
    vi.useFakeTimers();
    const { rerender, props } = renderPreviewSection({
      isProcessing: true,
      currentTime: 0,
      totalDuration: 100,
      exportPreparationStep: 4,
    });

    rerender(
      <PreviewSection
        {...props}
        isProcessing
        currentTime={0.05}
        totalDuration={100}
        exportPreparationStep={4}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1800);
    });

    expect(screen.getByRole('button', { name: '書き出し準備 4/4...' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'フレーム待機中...' })).not.toBeInTheDocument();
  });

  it('開始直後の閾値を超えた後は生成中表示に切り替わる', () => {
    vi.useFakeTimers();
    const { rerender, props } = renderPreviewSection({
      isProcessing: true,
      currentTime: 0,
      totalDuration: 100,
      exportPreparationStep: 4,
    });

    rerender(
      <PreviewSection
        {...props}
        isProcessing
        currentTime={1}
        totalDuration={100}
        exportPreparationStep={4}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByRole('button', { name: '映像を生成中... 1%' })).toBeInTheDocument();
  });

  it('apple-safari flavor では安定動作優先の案内を表示する', () => {
    renderPreviewSection({
      appFlavor: 'apple-safari',
      supportsShowSaveFilePicker: false,
    });

    expect(screen.getByText('Apple Safari 検証モード')).toBeInTheDocument();
    expect(screen.getByText(/共有メニューまたは標準ダウンロード導線/)).toBeInTheDocument();
  });

  it('export 完了後は processing が false のときだけ download ボタンを表示する', () => {
    const onDownload = vi.fn();
    const onExport = vi.fn();
    const { rerender, props } = renderPreviewSection({
      isProcessing: true,
      exportPreparationStep: 1,
      exportUrl: 'blob:export',
      exportExt: 'mp4',
      onDownload,
      onExport,
    });

    expect(screen.queryByRole('button', { name: 'ダウンロード (.mp4)' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '書き出し準備 1/4...' })).toBeInTheDocument();

    rerender(
      <PreviewSection
        {...props}
        isProcessing={false}
        exportUrl="blob:export"
        exportExt="mp4"
        onDownload={onDownload}
        onExport={onExport}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'ダウンロード (.mp4)' }));

    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '動画ファイルを作成' })).not.toBeInTheDocument();
  });

  it('exportUrl が空文字の間は download ボタンを表示しない', () => {
    renderPreviewSection({
      isProcessing: false,
      exportUrl: '',
      exportExt: 'mp4',
    });

    expect(screen.queryByRole('button', { name: 'ダウンロード (.mp4)' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '動画ファイルを作成' })).toBeInTheDocument();
  });
});
