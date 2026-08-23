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
    exportOutputOptions: {
      contentMode: 'composite',
      captionLayerFormat: 'black-matte-mp4',
      includeSubtitles: true,
      subtitleFormats: ['srt', 'vtt'],
    },
    onExportOutputOptionsChange: vi.fn(),
    supportsCaptionLayerExport: true,
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
  it('連続する画像カードはシークバー上でオレンジ系の濃淡により区切って表示する', () => {
    const imageItems: MediaItem[] = [2, 3, 4].map((duration, index) => ({
      ...mediaItem,
      id: `image-${index + 1}`,
      file: new File(['image'], `sample-${index + 1}.png`, { type: 'image/png' }),
      type: 'image',
      duration,
      originalDuration: duration,
      trimEnd: duration,
    }));
    const { container } = renderPreviewSection({
      mediaItems: imageItems,
      totalDuration: 9,
    });

    const segments = container.querySelector('[data-testid="preview-timeline-bar"]')?.children;

    expect(segments).toHaveLength(3);
    expect(segments?.[0]).toHaveClass('bg-yellow-600', 'border-r');
    expect(segments?.[1]).toHaveClass('bg-orange-500', 'border-r');
    expect(segments?.[2]).toHaveClass('bg-yellow-600', 'border-r');
  });

  it('動画出力オプションは初期状態では閉じている', () => {
    renderPreviewSection();

    const settingsButton = screen.getByRole('button', { name: '動画出力オプション' });

    expect(settingsButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('サムネイル設定')).not.toBeInTheDocument();
    expect(screen.queryByText('出力内容')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '現在のフレームをサムネイルに設定' })).not.toBeInTheDocument();
    expect(screen.queryByText(/完成1本の代表フレーム/)).not.toBeInTheDocument();
  });

  it('動画出力オプションを開くとサムネイルと出力内容の設定を表示する', () => {
    const onSetProjectPosterFromCurrent = vi.fn();
    renderPreviewSection({ onSetProjectPosterFromCurrent });

    const settingsButton = screen.getByRole('button', { name: '動画出力オプション' });
    fireEvent.click(settingsButton);

    expect(settingsButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('サムネイル設定')).toBeInTheDocument();
    expect(screen.getByText('出力内容')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '現在のフレームをサムネイルに設定' }));
    expect(onSetProjectPosterFromCurrent).toHaveBeenCalledTimes(1);
  });

  it('apple-safari の動画出力オプションにはプロジェクトサムネイルを表示しない', () => {
    renderPreviewSection({
      appFlavor: 'apple-safari',
      supportsCaptionLayerExport: false,
    });

    fireEvent.click(screen.getByRole('button', { name: '動画出力オプション' }));

    expect(screen.queryByText('サムネイル設定')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '現在のフレームをサムネイルに設定' }))
      .not.toBeInTheDocument();
  });

  it('キャプションが0件のときはキャプションのみを選択できない', () => {
    const onExportOutputOptionsChange = vi.fn();
    renderPreviewSection({
      hasCaptionsForSubtitleExport: false,
      onExportOutputOptionsChange,
    });

    fireEvent.click(screen.getByRole('button', { name: '動画出力オプション' }));

    const captionOnlyButton = screen.getByRole('button', { name: 'キャプションのみ' });
    expect(captionOnlyButton).toBeDisabled();
    expect(captionOnlyButton).toHaveAttribute(
      'title',
      'キャプションを1件以上追加すると選択できます',
    );
    expect(screen.getByText('キャプションを追加すると選択できます。')).toBeInTheDocument();
    fireEvent.click(captionOnlyButton);
    expect(onExportOutputOptionsChange).not.toHaveBeenCalled();
  });

  it('手動設定時はサムネイル設定内に手動と設定時刻を表示する', () => {
    renderPreviewSection({
      projectPosterMode: 'manual',
      projectPosterTimelineTime: 3.5,
    });

    const settingsButton = screen.getByRole('button', { name: '動画出力オプション' });
    fireEvent.click(settingsButton);
    expect(screen.getByText('手動・3.5s')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '自動設定に戻す' })).toBeInTheDocument();
  });

  it('縦向きポスターは9:16のプレビュー枠で表示する', () => {
    renderPreviewSection({
      projectPosterMode: 'manual',
      projectPosterDataUrl: 'data:image/jpeg;base64,portrait',
      projectPosterAspectRatio: 'portrait',
    });

    fireEvent.click(screen.getByRole('button', { name: '動画出力オプション' }));

    const poster = screen.getByRole('img', { name: 'プロジェクトのサムネイル' });
    expect(poster.parentElement?.className).toContain('aspect-[9/16]');
    expect(poster.parentElement?.className).not.toContain('aspect-video');
  });

  it('自動設定でもキャプチャ済み画像があればミニ画面に表示する', () => {
    renderPreviewSection({
      projectPosterMode: 'auto',
      projectPosterDataUrl: 'data:image/jpeg;base64,auto-frame',
    });

    fireEvent.click(screen.getByRole('button', { name: '動画出力オプション' }));

    const poster = screen.getByRole('img', { name: 'プロジェクトのサムネイル' });
    expect(poster).toHaveAttribute('src', 'data:image/jpeg;base64,auto-frame');
    expect(screen.queryByText('未表示')).not.toBeInTheDocument();
  });

  it('自動設定で画像が無いときは未表示にする', () => {
    renderPreviewSection({
      projectPosterMode: 'auto',
      projectPosterDataUrl: null,
    });

    fireEvent.click(screen.getByRole('button', { name: '動画出力オプション' }));

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

  it('生成済み動画のダウンロード表示中は動画出力オプションを変更できない', () => {
    const onExportOutputOptionsChange = vi.fn();
    const onSetProjectPosterFromCurrent = vi.fn();
    renderPreviewSection({
      exportUrl: 'blob:caption-layer',
      exportExt: 'webm',
      exportOutputOptions: {
        contentMode: 'caption-layer',
        captionLayerFormat: 'alpha-webm',
        includeSubtitles: true,
        subtitleFormats: ['srt', 'vtt'],
      },
      onExportOutputOptionsChange,
      onSetProjectPosterFromCurrent,
      hasCaptionsForSubtitleExport: true,
    });

    fireEvent.click(screen.getByRole('button', { name: '動画出力オプション' }));

    expect(screen.getByText('この設定で動画を作成済みです')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '現在のフレームをサムネイルに設定' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '完成動画' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'キャプションのみ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /黒背景 MP4/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /白文字キー用 MP4/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /透過 WebM/ })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /字幕ファイル/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '完成動画' }));
    fireEvent.click(screen.getByRole('button', { name: /黒背景 MP4/ }));
    fireEvent.click(screen.getByRole('button', { name: '現在のフレームをサムネイルに設定' }));
    expect(onExportOutputOptionsChange).not.toHaveBeenCalled();
    expect(onSetProjectPosterFromCurrent).not.toHaveBeenCalled();
  });

  it('キャプションのみ設定で透過 WebM、黒背景、白文字キーの順に表示する', () => {
    renderPreviewSection({
      hasCaptionsForSubtitleExport: true,
      exportOutputOptions: {
        contentMode: 'caption-layer',
        captionLayerFormat: 'black-matte-mp4',
        includeSubtitles: true,
        subtitleFormats: ['srt', 'vtt'],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '動画出力オプション' }));

    const alpha = screen.getByRole('button', { name: /透過 WebM/ });
    const black = screen.getByRole('button', { name: /黒背景 MP4/ });
    const white = screen.getByRole('button', { name: /白文字キー用 MP4/ });
    expect(
      alpha.compareDocumentPosition(black) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      black.compareDocumentPosition(white) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText('背景透過の WebM。別の動画に重ねて合成できます。')).toBeInTheDocument();
    expect(screen.getByText('黒背景の通常キャプション。加算・スクリーン合成向けです。')).toBeInTheDocument();
    expect(screen.getByText('黒背景に白文字。ルミナンスキー合成に使えます。')).toBeInTheDocument();
    expect(screen.getByText('背景透過は WebM のみ。MP4 は黒背景または白文字キー用です。')).toBeInTheDocument();
  });

  it('字幕ファイルだけダウンロードを字幕ファイル設定内に表示する', () => {
    const onDownloadSubtitles = vi.fn();
    const { container } = renderPreviewSection({
      hasCaptionsForSubtitleExport: true,
      onDownloadSubtitles,
      exportOutputOptions: {
        contentMode: 'caption-layer',
        captionLayerFormat: 'alpha-webm',
        includeSubtitles: true,
        subtitleFormats: ['srt', 'vtt'],
      },
    });

    expect(
      screen.queryByRole('button', { name: '字幕ファイルだけダウンロード' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '動画出力オプション' }));

    const downloadButton = screen.getByRole('button', {
      name: '字幕ファイルだけダウンロード',
    });
    expect(container.querySelector('#video-output-options')).toContainElement(downloadButton);

    fireEvent.click(downloadButton);
    expect(onDownloadSubtitles).toHaveBeenCalledTimes(1);
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

  it('エクスポート中もカスタムつまみを波形と同じ百分率で出し、ネイティブつまみは隠す', () => {
    const { container } = renderPreviewSection({
      isProcessing: true,
      currentTime: 15,
      totalDuration: 20,
    });

    const thumb = screen.getByTestId('preview-seek-thumb');
    expect(thumb.style.left).toBe('calc(75% - 10px)');

    const seek = container.querySelector('input[type="range"][aria-label="プレビュー位置"]');
    expect(seek).toBeInstanceOf(HTMLInputElement);
    expect((seek as HTMLInputElement).style.opacity).toBe('0');
    expect((seek as HTMLInputElement).disabled).toBe(true);
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

describe('プレビューの現在位置表示（1/100 秒）', () => {
  it('現在位置を 1/100 秒まで表示する', () => {
    renderPreviewSection({ currentTime: 3.07, totalDuration: 15 });
    expect(screen.getByText('0:03.07')).toBeTruthy();
  });

  it('同じ「秒」でも 1/100 秒が違えば表示が変わる（スライダー操作に追従する）', () => {
    // 従来の「分:秒」表示では 3.00 も 3.50 も同じ「0:03」に潰れていた
    const { unmount } = renderPreviewSection({ currentTime: 3.0, totalDuration: 15 });
    expect(screen.getByText('0:03.00')).toBeTruthy();
    unmount();

    renderPreviewSection({ currentTime: 3.5, totalDuration: 15 });
    expect(screen.getByText('0:03.50')).toBeTruthy();
    expect(screen.queryByText('0:03.00')).toBeNull();
  });

  it('総尺も 1/100 秒まで表示する（現在位置と桁を揃える）', () => {
    renderPreviewSection({ currentTime: 3.07, totalDuration: 15 });
    expect(screen.getByText('0:15.00')).toBeTruthy();
  });

  it('端数のある総尺で「現在位置 > 総尺」に見えない', () => {
    // 10.5 秒の動画を floor して「0:10」と出すと、終端まで再生したとき
    // 現在位置が「0:10.50」となり現在位置のほうが大きく見えてしまう
    renderPreviewSection({ currentTime: 10.5, totalDuration: 10.5 });
    // 終端では左右がぴったり同じ表示になる（現在位置だけ大きく見えない）
    expect(screen.getAllByText('0:10.50')).toHaveLength(2);
    expect(screen.queryByText('0:10')).toBeNull();
    expect(screen.getByLabelText('現在位置 0:10.50')).toBeTruthy();
    expect(screen.getByLabelText('全体の長さ 0:10.50')).toBeTruthy();
  });

  it('クリップ尺の加算で生じる浮動小数の誤差を吸収する', () => {
    // 0.1 秒を 105 回足すと 10.499999999999979 になる。
    // 素朴な floor だと「0:10.49」と 1/100 秒ずれて見える
    const accumulated = Array.from({ length: 105 }).reduce<number>((a) => a + 0.1, 0);
    renderPreviewSection({ currentTime: 0, totalDuration: accumulated });
    expect(screen.getByLabelText('全体の長さ 0:10.50')).toBeTruthy();
  });

  it('シークバーの刻みを 1/100 秒に合わせる（表示だけ細かくても動かせないと意味がない）', () => {
    const { container } = renderPreviewSection({ currentTime: 3, totalDuration: 15 });
    const seekBar = container.querySelector('input[type="range"]');
    expect(seekBar?.getAttribute('step')).toBe('0.01');
  });

  it('現在位置には読み上げ用のラベルを付ける', () => {
    renderPreviewSection({ currentTime: 3.07, totalDuration: 15 });
    expect(screen.getByLabelText('現在位置 0:03.07')).toBeTruthy();
  });
});

/**
 * シークバーの色帯は「実際のタイムライン」を表す。
 * ディゾルブは重ねるぶんタイムラインが縮む（5+5 で 1 秒ディゾルブ＝9 秒）ため、
 * duration をそのまま並べると尺と表示がずれる。
 */
describe('シークバーの区間表示（ディゾルブ・エンドロール）', () => {
  const videoClip = (id: string, duration: number, extra: Record<string, unknown> = {}) => ({
    ...mediaItem,
    id,
    file: new File(['v'], `${id}.mp4`, { type: 'video/mp4' }),
    type: 'video' as const,
    duration,
    originalDuration: duration,
    trimEnd: duration,
    ...extra,
  });

  const getBar = (container: HTMLElement) =>
    container.querySelector('[data-testid="preview-timeline-bar"]');

  const pct = (el: Element | null | undefined) => ({
    left: (el as HTMLElement | null)?.style.left,
    width: (el as HTMLElement | null)?.style.width,
  });

  it('ディゾルブで重なるぶん、2本目の帯が前倒しで配置される', () => {
    // 5秒 + 5秒 を 1 秒ディゾルブ → 本編 9 秒
    const { container } = renderPreviewSection({
      mediaItems: [
        videoClip('a', 5, { transitionToNext: { type: 'dissolve', duration: 1 } }),
        videoClip('b', 5),
      ],
      totalDuration: 9,
      clipsDuration: 9,
    });

    const bar = getBar(container);
    const first = bar?.children[0];
    const second = bar?.children[1];

    // 1本目: 0〜5秒 → 左端から 5/9
    expect(pct(first).left).toBe('0%');
    expect(pct(first).width).toBe(`${(5 / 9) * 100}%`);
    // 2本目: 4〜9秒（1秒前倒し）。10秒ぶんに引き伸ばされていないこと
    expect(pct(second).left).toBe(`${(4 / 9) * 100}%`);
    expect(pct(second).width).toBe(`${(5 / 9) * 100}%`);
  });

  it('ディゾルブの重なり区間を中央が濃い紫のグラデーションで示す', () => {
    const { container } = renderPreviewSection({
      mediaItems: [
        videoClip('a', 5, { transitionToNext: { type: 'dissolve', duration: 1 } }),
        videoClip('b', 5),
      ],
      totalDuration: 9,
      clipsDuration: 9,
    });

    const dissolve = container.querySelector(
      '[data-testid="preview-transition-segment"][data-transition-type="dissolve"]',
    ) as HTMLElement | null;
    expect(dissolve).not.toBeNull();
    // 4〜5秒の 1 秒ぶん
    expect(dissolve?.style.left).toBe(`${(4 / 9) * 100}%`);
    expect(dissolve?.style.width).toBe(`${(1 / 9) * 100}%`);
    expect(dissolve?.style.backgroundImage).toContain('linear-gradient');
    expect(dissolve?.style.backgroundImage).toContain('50%');
  });

  it('トランジションが無ければ影響範囲の帯は出ない', () => {
    const { container } = renderPreviewSection({
      mediaItems: [videoClip('a', 5), videoClip('b', 5)],
      totalDuration: 10,
      clipsDuration: 10,
    });
    expect(container.querySelector('[data-testid="preview-transition-segment"]')).toBeNull();
  });

  it('黒フェードは境界前後の影響範囲を紫から中央の黒へ変わるグラデーションで示す', () => {
    const { container } = renderPreviewSection({
      mediaItems: [
        videoClip('a', 5, { transitionToNext: { type: 'fade-black', duration: 2 } }),
        videoClip('b', 5),
      ],
      totalDuration: 10,
      clipsDuration: 10,
    });

    const fade = container.querySelector(
      '[data-testid="preview-transition-segment"][data-transition-type="fade-black"]',
    ) as HTMLElement | null;
    expect(fade).not.toBeNull();
    // 境界 5 秒の前後 1 秒（4〜6秒）
    expect(fade?.style.left).toBe('40%');
    expect(fade?.style.width).toBe('20%');
    expect(fade?.style.backgroundImage).toContain('linear-gradient');
    expect(fade?.style.backgroundImage).toMatch(/#000000|rgb\(0, 0, 0\)/);
  });

  it('白フェードは境界前後の影響範囲を紫から中央の白へ変わるグラデーションで示す', () => {
    const { container } = renderPreviewSection({
      mediaItems: [
        videoClip('a', 5, { transitionToNext: { type: 'fade-white', duration: 1 } }),
        videoClip('b', 5),
      ],
      totalDuration: 10,
      clipsDuration: 10,
    });

    const fade = container.querySelector(
      '[data-testid="preview-transition-segment"][data-transition-type="fade-white"]',
    ) as HTMLElement | null;
    expect(fade).not.toBeNull();
    // 境界 5 秒の前後 0.5 秒（4.5〜5.5秒）
    expect(fade?.style.left).toBe('45%');
    expect(fade?.style.width).toBe('10%');
    expect(fade?.style.backgroundImage).toContain('linear-gradient');
    expect(fade?.style.backgroundImage).toMatch(/#ffffff|rgb\(255, 255, 255\)/);
  });

  it('短いクリップでは黒フェードの最大効果点を表示区間中央ではなく実際の境界へ寄せる', () => {
    const { container } = renderPreviewSection({
      mediaItems: [
        videoClip('short', 0.25, { transitionToNext: { type: 'fade-black', duration: 2 } }),
        videoClip('b', 5),
      ],
      totalDuration: 5.25,
      clipsDuration: 5.25,
    });

    const fade = container.querySelector(
      '[data-testid="preview-transition-segment"][data-transition-type="fade-black"]',
    ) as HTMLElement | null;
    // 表示範囲は 0〜1.25 秒、最大効果点の境界 0.25 秒はその20%位置。
    expect(fade?.style.backgroundImage).toMatch(/(?:#000000|rgb\(0, 0, 0\)) 20%/);
  });

  it('エンドロール区間を別色で末尾に描く（9秒 + 5秒 = 14秒）', () => {
    const { container } = renderPreviewSection({
      mediaItems: [
        videoClip('a', 5, { transitionToNext: { type: 'dissolve', duration: 1 } }),
        videoClip('b', 5),
      ],
      totalDuration: 14,
      clipsDuration: 9,
    });

    const endroll = container.querySelector('.bg-slate-500') as HTMLElement | null;
    expect(endroll).not.toBeNull();
    expect(endroll?.style.left).toBe(`${(9 / 14) * 100}%`);
    expect(endroll?.style.width).toBe(`${(5 / 14) * 100}%`);
  });

  it('エンドロールが無ければ専用の帯は出ない', () => {
    const { container } = renderPreviewSection({
      mediaItems: [videoClip('a', 5), videoClip('b', 5)],
      totalDuration: 10,
      clipsDuration: 10,
    });
    expect(container.querySelector('.bg-slate-500')).toBeNull();
  });

});
