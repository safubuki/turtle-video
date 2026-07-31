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
    onSeekToTime: vi.fn(),
    supportsTimelineWaveform: false,
    timelineWaveform: {
      status: 'idle',
      peaks: null,
      silences: [],
      resolvedSilenceSource: 'all',
      duration: 0,
    },
    onTogglePlay: vi.fn(),
    onStop: vi.fn(),
    onExport: vi.fn(),
    onDownload: vi.fn(),
    onClearAll: vi.fn(),
    onCapture: vi.fn(),
    onExportFinalizeTimeout: vi.fn(),
    onOpenHelp: vi.fn(),
    formatTime: (seconds: number) => `${seconds.toFixed(1)}s`,
    projectPosterMode: 'auto',
    projectPosterTimelineTime: 0.2,
    projectPosterDataUrl: null,
    projectPosterAspectRatio: 'landscape' as const,
    onSetProjectPosterFromCurrent: vi.fn(),
    onResetProjectPosterToAuto: vi.fn(),
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
  it('サムネイル設定は現在値を見出しに表示して初期状態では閉じている', () => {
    renderPreviewSection();

    const settingsButton = screen.getByRole('button', { name: /サムネイル設定/ });

    expect(settingsButton).toHaveAttribute('aria-expanded', 'false');
    expect(settingsButton).toHaveTextContent('自動');
    expect(settingsButton).toHaveTextContent('0.2s');
    expect(screen.queryByRole('button', { name: '現在のフレームをサムネイルに設定' })).not.toBeInTheDocument();
    expect(screen.queryByText(/完成1本の代表フレーム/)).not.toBeInTheDocument();
  });

  it('サムネイル設定を開くと設定操作を表示する', () => {
    const onSetProjectPosterFromCurrent = vi.fn();
    renderPreviewSection({ onSetProjectPosterFromCurrent });

    const settingsButton = screen.getByRole('button', { name: /サムネイル設定/ });
    fireEvent.click(settingsButton);

    expect(settingsButton).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: '現在のフレームをサムネイルに設定' }));
    expect(onSetProjectPosterFromCurrent).toHaveBeenCalledTimes(1);
  });

  it('手動設定時は見出しに手動と設定時刻を表示する', () => {
    renderPreviewSection({
      projectPosterMode: 'manual',
      projectPosterTimelineTime: 3.5,
    });

    const settingsButton = screen.getByRole('button', { name: /サムネイル設定/ });
    expect(settingsButton).toHaveTextContent('手動');
    expect(settingsButton).toHaveTextContent('3.5s');

    fireEvent.click(settingsButton);
    expect(screen.getByRole('button', { name: '自動設定に戻す' })).toBeInTheDocument();
  });

  it('縦向きポスターは9:16のプレビュー枠で表示する', () => {
    renderPreviewSection({
      projectPosterMode: 'manual',
      projectPosterDataUrl: 'data:image/jpeg;base64,portrait',
      projectPosterAspectRatio: 'portrait',
    });

    fireEvent.click(screen.getByRole('button', { name: /サムネイル設定/ }));

    const poster = screen.getByRole('img', { name: 'プロジェクトのサムネイル' });
    expect(poster.parentElement?.className).toContain('aspect-[9/16]');
    expect(poster.parentElement?.className).not.toContain('aspect-video');
  });

  it('自動設定でもキャプチャ済み画像があればミニ画面に表示する', () => {
    renderPreviewSection({
      projectPosterMode: 'auto',
      projectPosterDataUrl: 'data:image/jpeg;base64,auto-frame',
    });

    fireEvent.click(screen.getByRole('button', { name: /サムネイル設定/ }));

    const poster = screen.getByRole('img', { name: 'プロジェクトのサムネイル' });
    expect(poster).toHaveAttribute('src', 'data:image/jpeg;base64,auto-frame');
    expect(screen.queryByText('未表示')).not.toBeInTheDocument();
  });

  it('自動設定で画像が無いときは未表示にする', () => {
    renderPreviewSection({
      projectPosterMode: 'auto',
      projectPosterDataUrl: null,
    });

    fireEvent.click(screen.getByRole('button', { name: /サムネイル設定/ }));

    expect(screen.queryByRole('img', { name: 'プロジェクトのサムネイル' })).not.toBeInTheDocument();
    expect(screen.getByText('未表示')).toBeInTheDocument();
  });

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

  it('準備中はグルーピングされた準備文言を表示する', () => {
    renderPreviewSection({
      isProcessing: true,
      currentTime: 0,
      exportPreparationStep: 1,
    });

    expect(screen.getByRole('button', { name: '書き出し準備中...' })).toBeInTheDocument();
    expect(screen.getByText('書き出しに必要な準備を進めています。')).toBeInTheDocument();
  });

  it('音声解析ステージをボタンに反映する', () => {
    renderPreviewSection({
      isProcessing: true,
      currentTime: 0,
      exportPreparationStep: 3,
    });

    expect(screen.getByRole('button', { name: '書き出し準備中...' })).toBeInTheDocument();
    expect(screen.getByText('同じ動画が複数ある場合は解析結果を再利用します。')).toBeInTheDocument();
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

    expect(screen.getByRole('button', { name: '書き出し準備中...' })).toBeInTheDocument();
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

    expect(screen.getByRole('button', { name: '書き出し準備中...' })).toBeInTheDocument();
  });

  it('準備が長いと経過秒数つきの説明を表示する', () => {
    vi.useFakeTimers();
    renderPreviewSection({
      isProcessing: true,
      currentTime: 0,
      exportPreparationStep: 3,
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByRole('button', { name: '書き出し準備中...（3秒経過）' })).toBeInTheDocument();
    expect(screen.getByText('同じ動画が複数ある場合は解析結果を再利用します。（3秒経過）')).toBeInTheDocument();
  });

  it('開始直後の閾値を超えた後は生成中表示に切り替わる', () => {
    vi.useFakeTimers();
    const { rerender, props } = renderPreviewSection({
      isProcessing: true,
      currentTime: 0,
      totalDuration: 100,
      exportPreparationStep: 9,
    });

    rerender(
      <PreviewSection
        {...props}
        isProcessing
        currentTime={1}
        totalDuration={100}
        exportPreparationStep={9}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByRole('button', { name: '映像を書き出し中... 1%' })).toBeInTheDocument();
  });

  it('apple-safari flavor では安定動作優先の案内を表示する', () => {
    renderPreviewSection({
      appFlavor: 'apple-safari',
      supportsShowSaveFilePicker: false,
    });

    expect(screen.getByText('Apple Safari 動作モード')).toBeInTheDocument();
    expect(screen.getByText(/共有メニュー、または通常のダウンロード手順/)).toBeInTheDocument();
  });

  it('export 完了後に processing=false なら download ボタンを表示する', () => {
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

    expect(screen.getByRole('button', { name: 'ダウンロード (.mp4)' })).toBeInTheDocument();

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

  it('100%到達後に exportUrl が無ければ保存ファイル作成中表示を出す', () => {
    renderPreviewSection({
      isProcessing: true,
      currentTime: 9.99,
      totalDuration: 10,
      exportPreparationStep: 10,
    });

    expect(screen.getByRole('button', { name: '保存ファイルを作成中...' })).toBeInTheDocument();
    expect(screen.getByText('保存ファイルを作成中...', { selector: 'p' })).toBeInTheDocument();
  });

  it('終端到達後は stalled ではなく finalizing を維持する', () => {
    vi.useFakeTimers();
    renderPreviewSection({
      isProcessing: true,
      currentTime: 10,
      totalDuration: 10,
      exportPreparationStep: 10,
    });

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByRole('button', { name: '保存ファイルを作成中...' })).toBeInTheDocument();
  });

  it('保存ファイル作成が30秒を超えたら timeout callback を一度だけ呼ぶ', () => {
    vi.useFakeTimers();
    const onExportFinalizeTimeout = vi.fn();
    renderPreviewSection({
      isProcessing: true,
      currentTime: 10,
      totalDuration: 10,
      exportPreparationStep: 10,
      onExportFinalizeTimeout,
    });

    act(() => {
      vi.advanceTimersByTime(30000);
    });

    expect(onExportFinalizeTimeout).toHaveBeenCalledTimes(1);
  });

  it('exportUrl が届いた後は processing 中でも timeout callback を呼ばない', () => {
    vi.useFakeTimers();
    const onExportFinalizeTimeout = vi.fn();
    renderPreviewSection({
      isProcessing: true,
      currentTime: 10,
      totalDuration: 10,
      exportPreparationStep: 10,
      exportUrl: 'blob:export',
      exportExt: 'mp4',
      onExportFinalizeTimeout,
    });

    act(() => {
      vi.advanceTimersByTime(30000);
    });

    expect(onExportFinalizeTimeout).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'ダウンロード (.mp4)' })).toBeInTheDocument();
  });

  it('停止ボタンを押すと生成済み export をクリアして作成ボタンへ戻す', () => {
    const onStop = vi.fn();
    const onClearGeneratedExport = vi.fn();

    renderPreviewSection({
      exportUrl: 'blob:export',
      exportExt: 'mp4',
      isProcessing: false,
      onStop: () => {
        onClearGeneratedExport();
        onStop();
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'プレビューを停止' }));

    expect(onClearGeneratedExport).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('再生ボタンを押すと onTogglePlay が呼ばれる（export クリアは TurtleVideo 側で実行）', () => {
    const onTogglePlay = vi.fn();

    renderPreviewSection({
      exportUrl: 'blob:export',
      exportExt: 'mp4',
      isProcessing: false,
      onTogglePlay,
    });

    fireEvent.click(screen.getByRole('button', { name: 'プレビューを再生' }));

    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('エクスポート中に停止ボタンを押しても onStop が呼ばれる', () => {
    const onStop = vi.fn();

    renderPreviewSection({
      exportUrl: null,
      isProcessing: true,
      exportPreparationStep: 5,
      onStop,
    });

    fireEvent.click(screen.getByRole('button', { name: 'プレビューを停止' }));

    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
