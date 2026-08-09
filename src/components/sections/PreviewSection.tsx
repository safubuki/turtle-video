/**
 * @file PreviewSection.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 編集中の動画をリアルタイムでプレビュー再生、シーク、およびファイルへの書き出しを行うセクションコンポーネント。
 */
import React, {
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Play,
  Pause,
  Square,
  Download,
  Loader,
  RotateCcw,
  MonitorPlay,
  AlertCircle,
  Camera,
  CircleHelp,
  Image as ImageIcon,
  RefreshCw,
} from 'lucide-react';
import type {
  MediaItem,
  AudioTrack,
  NarrationClip,
  ExportContentMode,
  CaptionLayerVideoFormat,
  ExportOutputOptions,
} from '../../types';
import type { ExportPreparationStep } from '../../hooks/export-strategies/types';
import type { AppFlavor } from '../../app/resolveAppFlavor';
import { getAppFlavorUiCapabilities, getPreviewRuntimeNotice } from '../../app/appFlavorUi';
import { formatTimeCentiseconds } from '../../utils/format';
import { computeTransitionTimelineRanges } from '../../utils/transitionTimeline';
import { useLogStore } from '../../stores/logStore';
import { useCanvasStore } from '../../stores/canvasStore';
import type { AspectRatio } from '../../stores/canvasStore';
import SettingsAccordionHeader from '../common/SettingsAccordionHeader';
import TimelineWaveform from '../media/TimelineWaveform';
import type { TimelineWaveformData } from '../../hooks/useTimelineWaveform';
import { useSwipeProtectedValue } from '../../hooks/useSwipeProtectedValue';
import {
  canAttemptAlphaWebmExport,
  resolveCaptionLayerFormatDescriptor,
} from '../../utils/captionLayerExport';

const PREVIEW_ICON_BUTTON_BASE =
  'relative overflow-hidden p-3 lg:p-4 rounded-full border transition-[transform,background-color,color,box-shadow,filter] duration-200 shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
const PREVIEW_STOP_BUTTON =
  'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500';
const PREVIEW_CAPTURE_BUTTON =
  'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500';
const EXPORT_RENDERING_READY_TIME_SEC = 0.25;
const EXPORT_FINALIZING_EPSILON_SEC = 0.05;
const EXPORT_FINALIZING_TIMEOUT_MS = 30000;

type ExportPhase = 'preparing' | 'rendering' | 'finalizing';

type PreparationStage = 'initializing' | 'audioAnalysis' | 'audioMix' | 'encoding';

const PREPARATION_STAGE_COPY: Record<
  PreparationStage,
  { description: string }
> = {
  initializing: {
    description: '書き出しに必要な準備を進めています。',
  },
  audioAnalysis: {
    description: '同じ動画が複数ある場合は解析結果を再利用します。',
  },
  audioMix: {
    description: 'BGM とナレーションをタイムラインへ配置しています。',
  },
  encoding: {
    description: '映像生成を始める前の確認を行っています。',
  },
};

const PREPARATION_STAGE_BOUNDARIES = {
  initializingEnd: 2,
  audioAnalysisEnd: 5,
  audioMixEnd: 7,
} as const;

const resolvePreparationStage = (step: ExportPreparationStep | null): PreparationStage => {
  if (step === null || step <= PREPARATION_STAGE_BOUNDARIES.initializingEnd) return 'initializing';
  if (step <= PREPARATION_STAGE_BOUNDARIES.audioAnalysisEnd) return 'audioAnalysis';
  if (step <= PREPARATION_STAGE_BOUNDARIES.audioMixEnd) return 'audioMix';
  return 'encoding';
};

interface PreviewSectionProps {
  appFlavor: AppFlavor;
  supportsShowSaveFilePicker: boolean;
  mediaItems: MediaItem[];
  bgm: AudioTrack | null;
  narrations: NarrationClip[];
  canvasRef: RefObject<HTMLCanvasElement | null>;
  currentTime: number;
  /** 出力全体の長さ（クリップ + エンドロール） */
  totalDuration: number;
  /** クリップだけの長さ。エンドロール区間の境界に使う */
  clipsDuration?: number;
  isPlaying: boolean;
  isProcessing: boolean;
  exportPreparationStep: ExportPreparationStep | null;
  isLoading: boolean;
  loadingLabel?: string;
  exportUrl: string | null;
  exportExt: string | null;
  onSeekChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
  /** 波形タップ・無音区間ジャンプからの絶対時刻シーク（Issue #217） */
  onSeekToTime: (time: number) => void;
  /**
   * シークバー直下の音量波形を出せる環境か。
   * iOS Safari は decodeAudioData が不安定なため false（波形なしで従来どおり動く）。
   */
  supportsTimelineWaveform: boolean;
  /** 波形データ（TurtleVideo が生成し、キャプションのタイミング打ちバーとも共有する） */
  timelineWaveform: TimelineWaveformData;
  onTogglePlay: () => void;
  onStop: () => void;
  onExport: () => void;
  onDownload: () => void;
  onClearAll: () => void;
  onCapture: () => void;
  onExportFinalizeTimeout?: () => void;
  onOpenHelp: () => void;
  formatTime: (seconds: number) => string;
  /** プロジェクト全体ポスター（アプリ内表示用。OS アイコンとは別） */
  projectPosterMode: 'auto' | 'manual';
  projectPosterTimelineTime: number;
  projectPosterDataUrl: string | null;
  projectPosterAspectRatio: AspectRatio;
  onSetProjectPosterFromCurrent: () => void;
  onResetProjectPosterToAuto: () => void;
  /** Issue #114: 書き出し内容（完成動画 / キャプションのみ） */
  exportOutputOptions: ExportOutputOptions;
  onExportOutputOptionsChange: (next: ExportOutputOptions) => void;
  /** キャプションのみが使えるフレーバーか（standard のみ true） */
  supportsCaptionLayerExport: boolean;
  /** 字幕ファイルのみダウンロード（キャプションがあるとき） */
  onDownloadSubtitles?: () => void;
  hasCaptionsForSubtitleExport?: boolean;
}

/**
 * プレビューセクションコンポーネント
 */
const PreviewSection: React.FC<PreviewSectionProps> = ({
  appFlavor,
  supportsShowSaveFilePicker,
  mediaItems,
  bgm,
  narrations,
  canvasRef,
  currentTime,
  totalDuration,
  clipsDuration,
  isPlaying,
  isProcessing,
  exportPreparationStep,
  isLoading,
  loadingLabel,
  exportUrl,
  exportExt,
  onSeekChange,
  onSeekStart,
  onSeekEnd,
  onSeekToTime,
  supportsTimelineWaveform,
  timelineWaveform,
  onTogglePlay,
  onStop,
  onExport,
  onDownload,
  onClearAll,
  onCapture,
  onExportFinalizeTimeout,
  onOpenHelp,
  formatTime,
  projectPosterMode,
  projectPosterTimelineTime,
  projectPosterDataUrl,
  projectPosterAspectRatio,
  onSetProjectPosterFromCurrent,
  onResetProjectPosterToAuto,
  exportOutputOptions,
  onExportOutputOptionsChange,
  supportsCaptionLayerExport,
  onDownloadSubtitles,
  hasCaptionsForSubtitleExport = false,
}) => {
  const log = useLogStore.getState();
  const canvasWidth = useCanvasStore((s) => s.width);
  const canvasHeight = useCanvasStore((s) => s.height);
  const [isVideoOutputOptionsOpen, setIsVideoOutputOptionsOpen] = useState(false);
  const canAlphaWebm = useMemo(() => canAttemptAlphaWebmExport(), []);
  /**
   * シークバーの色帯。
   *
   * ディゾルブはクリップを重ねるためタイムラインが縮む（5秒+5秒＋1秒ディゾルブ＝9秒）。
   * 単純に duration を並べると 10 秒ぶんの帯になり、実際の尺と表示がずれるため、
   * **transitionTimeline の実レンジ（start/end）から絶対配置で描く**。
   * 重なっている区間はトランジションのイメージカラー（紫）で示す。
   */
  const previewTimelineSegments = useMemo(() => {
    const ranges = computeTransitionTimelineRanges(mediaItems);
    let imageSegmentIndex = 0;

    return mediaItems.map((item, index) => {
      const range = ranges[index];
      const segment = {
        item,
        index,
        start: range?.start ?? 0,
        end: range?.end ?? 0,
        imageSegmentIndex: item.type === 'image' ? imageSegmentIndex : null,
      };

      if (item.type === 'image') {
        imageSegmentIndex += 1;
      }

      return segment;
    });
  }, [mediaItems]);

  /**
   * ディゾルブで重なっている区間（前クリップの終わり ∩ 次クリップの始まり）。
   * ここを紫で塗り、「重ねたぶん短くなっている」ことを視覚的に示す。
   */
  const previewOverlapSegments = useMemo(() => {
    const ranges = computeTransitionTimelineRanges(mediaItems);
    const overlaps: { key: string; start: number; end: number }[] = [];
    for (let i = 0; i < ranges.length - 1; i++) {
      const current = ranges[i];
      const next = ranges[i + 1];
      if (!current || !next) continue;
      // 次クリップが前クリップの終端より早く始まっていれば、その差が重なり
      if (next.start < current.end) {
        overlaps.push({ key: `${current.id}-${next.id}`, start: next.start, end: current.end });
      }
    }
    return overlaps;
  }, [mediaItems]);

  /** エンドロール区間（クリップ終端〜総尺）。無効なら null */
  const previewEndrollSegment = useMemo(() => {
    if (!Number.isFinite(clipsDuration)) return null;
    const start = clipsDuration as number;
    if (!(totalDuration > start)) return null;
    return { start, end: totalDuration };
  }, [clipsDuration, totalDuration]);
  const areVideoOutputOptionsLocked = isProcessing || Boolean(exportUrl);

  const setContentMode = useCallback((contentMode: ExportContentMode) => {
    if (areVideoOutputOptionsLocked) return;
    if (contentMode === 'caption-layer' && !hasCaptionsForSubtitleExport) return;
    onExportOutputOptionsChange({ ...exportOutputOptions, contentMode });
  }, [
    areVideoOutputOptionsLocked,
    exportOutputOptions,
    hasCaptionsForSubtitleExport,
    onExportOutputOptionsChange,
  ]);

  const setCaptionLayerFormat = useCallback((captionLayerFormat: CaptionLayerVideoFormat) => {
    if (areVideoOutputOptionsLocked) return;
    onExportOutputOptionsChange({ ...exportOutputOptions, captionLayerFormat });
  }, [areVideoOutputOptionsLocked, exportOutputOptions, onExportOutputOptionsChange]);

  const setIncludeSubtitles = useCallback((includeSubtitles: boolean) => {
    if (areVideoOutputOptionsLocked) return;
    onExportOutputOptionsChange({ ...exportOutputOptions, includeSubtitles });
  }, [areVideoOutputOptionsLocked, exportOutputOptions, onExportOutputOptionsChange]);

  // シークバーは特殊な start/end ライフサイクルがあるため SwipeProtectedSlider は使わず、
  // 同じ誤操作防止フックを合成する。タップでの位置ジャンプは許可（minTouchDuration=0）。
  const restoreSeekOnVerticalScroll = useCallback(
    (restoredTime: number) => {
      onSeekChange({
        target: { value: String(restoredTime) },
      } as React.ChangeEvent<HTMLInputElement>);
    },
    [onSeekChange],
  );
  const {
    onTouchStart: swipeSeekTouchStart,
    onTouchMove: swipeSeekTouchMove,
    onTouchEnd: swipeSeekTouchEnd,
  } = useSwipeProtectedValue(currentTime, restoreSeekOnVerticalScroll, {
    minMovement: 15,
    minTouchDuration: 0,
  });

  // canvas.width / canvas.height をセットすると内容がクリアされるので、
  // 実際にサイズが変わるときだけ書き換える（毎レンダリングでの再代入を避ける）。
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== canvasWidth) {
      canvas.width = canvasWidth;
    }
    if (canvas.height !== canvasHeight) {
      canvas.height = canvasHeight;
    }
  }, [canvasWidth, canvasHeight, canvasRef]);
  const [exportPhase, setExportPhase] = useState<ExportPhase>('preparing');
  const [isCapturePressed, setIsCapturePressed] = useState(false);
  const lastObservedTimeRef = useRef<number>(currentTime);
  const hasExportProgressRef = useRef<boolean>(false);
  const flashTimeoutRef = useRef<number | null>(null);
  const exportStartedAtRef = useRef<number | null>(null);
  const exportButtonStateRef = useRef<'download' | 'processing' | 'create' | null>(null);
  const exportFinalizingStartedAtRef = useRef<number | null>(null);
  const hasTriggeredFinalizingTimeoutRef = useRef(false);
  const [processingNowMs, setProcessingNowMs] = useState(() => Date.now());
  const isFinalizingExport =
    isProcessing
    && totalDuration > 0
    && currentTime >= totalDuration - EXPORT_FINALIZING_EPSILON_SEC
    && !exportUrl;

  useEffect(() => {
    if (!isProcessing) {
      setExportPhase('preparing');
      lastObservedTimeRef.current = currentTime;
      hasExportProgressRef.current = false;
      return;
    }

    const delta = currentTime - lastObservedTimeRef.current;
    const renderingReadyTime = totalDuration > 0
      ? Math.min(EXPORT_RENDERING_READY_TIME_SEC, Math.max(0.05, totalDuration * 0.1))
      : EXPORT_RENDERING_READY_TIME_SEC;

    // Export 開始時に前回の停止位置から 0 秒へ戻る巻き戻しは、進捗ではなく準備フェーズとして扱う。
    if (delta <= -0.05) {
      lastObservedTimeRef.current = currentTime;
      hasExportProgressRef.current = false;
      return;
    }

    if (delta >= 0.05) {
      lastObservedTimeRef.current = currentTime;
      if (currentTime >= renderingReadyTime) {
        hasExportProgressRef.current = true;
      }
    }
  }, [currentTime, isProcessing, totalDuration]);

  useEffect(() => {
    if (!isProcessing) return;

    const updatePhase = () => {
      if (isFinalizingExport) {
        setExportPhase('finalizing');
        return;
      }
      if (!hasExportProgressRef.current) {
        setExportPhase('preparing');
        return;
      }
      setExportPhase('rendering');
    };

    updatePhase();
    const timer = setInterval(updatePhase, 250);
    return () => clearInterval(timer);
  }, [isFinalizingExport, isProcessing]);

  const hasExportUrl = Boolean(exportUrl);
  const exportButtonState: 'download' | 'processing' | 'create' = hasExportUrl
    ? 'download'
    : isProcessing
      ? 'processing'
      : 'create';

  useEffect(() => {
    if (exportButtonStateRef.current === exportButtonState) return;
    exportButtonStateRef.current = exportButtonState;
    log.info('RENDER', '[DIAG-UI] export button state', {
      state: exportButtonState,
      hasExportUrl,
      isProcessing,
    });
  }, [exportButtonState, hasExportUrl, isProcessing, log]);

  useEffect(() => {
    if (isProcessing && !hasExportUrl) {
      if (exportStartedAtRef.current === null) {
        const startedAt = Date.now();
        exportStartedAtRef.current = startedAt;
        setProcessingNowMs(startedAt);
      }
      return;
    }

    exportStartedAtRef.current = null;
    setProcessingNowMs(Date.now());
  }, [exportUrl, hasExportUrl, isProcessing]);

  useEffect(() => {
    if (!isProcessing || hasExportUrl) return undefined;

    const timer = window.setInterval(() => {
      setProcessingNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [exportUrl, hasExportUrl, isProcessing]);

  useEffect(() => {
    if (!isFinalizingExport || hasExportUrl || !isProcessing) {
      exportFinalizingStartedAtRef.current = null;
      hasTriggeredFinalizingTimeoutRef.current = false;
      return;
    }

    if (exportFinalizingStartedAtRef.current === null) {
      exportFinalizingStartedAtRef.current = Date.now();
    }

    if (
      exportFinalizingStartedAtRef.current !== null
      && processingNowMs - exportFinalizingStartedAtRef.current >= EXPORT_FINALIZING_TIMEOUT_MS
      && !hasTriggeredFinalizingTimeoutRef.current
    ) {
      hasTriggeredFinalizingTimeoutRef.current = true;
      onExportFinalizeTimeout?.();
    }
  }, [exportUrl, hasExportUrl, isFinalizingExport, isProcessing, onExportFinalizeTimeout, processingNowMs]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current !== null) {
        window.clearTimeout(flashTimeoutRef.current);
      }
    };
  }, []);

  const exportProgressPct = useMemo(() => {
    if (!isProcessing || totalDuration <= 0) return 0;
    return Math.min(100, Math.max(0, (currentTime / totalDuration) * 100));
  }, [currentTime, isProcessing, totalDuration]);

  const preparationStage = resolvePreparationStage(exportPreparationStep);
  const preparationStageCopy = PREPARATION_STAGE_COPY[preparationStage];
  const exportProcessingElapsedSec =
    isProcessing && exportStartedAtRef.current !== null
      ? Math.max(0, Math.floor((processingNowMs - exportStartedAtRef.current) / 1000))
      : 0;
  const exportProcessingElapsedText =
    exportProcessingElapsedSec >= 3 ? `（${exportProcessingElapsedSec}秒経過）` : '';

  const exportButtonText = useMemo(() => {
    const isCaptionLayer = exportOutputOptions.contentMode === 'caption-layer';
    if (!isProcessing) {
      return isCaptionLayer ? 'キャプションのみ書き出し' : '動画ファイルを作成';
    }
    if (exportPhase === 'preparing') {
      return `書き出し準備中...${exportProcessingElapsedText}`;
    }
    if (exportPhase === 'finalizing') {
      return '保存ファイルを作成中...';
    }
    return isCaptionLayer
      ? `キャプション書き出し中... ${exportProgressPct.toFixed(0)}%`
      : `映像を書き出し中... ${exportProgressPct.toFixed(0)}%`;
  }, [
    exportOutputOptions.contentMode,
    exportPhase,
    exportProcessingElapsedText,
    exportProgressPct,
    isProcessing,
  ]);

  const exportStatusText = useMemo(() => {
    if (!isProcessing) return null;
    if (exportPhase === 'preparing') {
      return `${preparationStageCopy.description}${exportProcessingElapsedText}`;
    }
    if (exportPhase === 'finalizing') {
      return '保存ファイルを作成中...';
    }
    return exportOutputOptions.contentMode === 'caption-layer'
      ? 'キャプション動画を書き出し中です。'
      : '映像を書き出し中です。';
  }, [
    exportOutputOptions.contentMode,
    exportPhase,
    exportProcessingElapsedText,
    isProcessing,
    preparationStageCopy.description,
  ]);

  const exportActionButton = exportButtonState === 'download' ? (
    <button
      type="button"
      onClick={onDownload}
      className="bg-green-600 hover:bg-green-500 text-white px-6 py-2.5 rounded-full text-sm lg:text-base font-bold flex items-center gap-2 animate-bounce-short shadow-lg"
    >
      <Download className="w-4 h-4 lg:w-5 lg:h-5" /> ダウンロード (.{exportExt})
    </button>
  ) : exportButtonState === 'processing' ? (
    <button
      onClick={onExport}
      disabled
      className="flex-1 max-w-xs flex items-center justify-center gap-2 px-6 py-2.5 lg:py-3 rounded-full text-sm lg:text-base font-bold shadow-lg transition bg-gray-700 text-gray-400 cursor-wait"
    >
      <Loader className="animate-spin w-4 h-4 lg:w-5 lg:h-5" />
      {exportButtonText}
    </button>
  ) : (
    <button
      onClick={onExport}
      disabled={mediaItems.length === 0}
      className="flex-1 max-w-xs flex items-center justify-center gap-2 px-6 py-2.5 lg:py-3 rounded-full text-sm lg:text-base font-bold shadow-lg transition bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20"
    >
      {exportButtonText}
    </button>
  );

  const previewRuntimeNotice = useMemo(
    () => getPreviewRuntimeNotice({ appFlavor, supportsShowSaveFilePicker }),
    [appFlavor, supportsShowSaveFilePicker],
  );
  const uiCapabilities = useMemo(() => getAppFlavorUiCapabilities(appFlavor), [appFlavor]);

  const triggerCaptureFeedback = (callback: () => void) => {
    if (flashTimeoutRef.current !== null) {
      window.clearTimeout(flashTimeoutRef.current);
    }
    setIsCapturePressed(true);
    callback();
    flashTimeoutRef.current = window.setTimeout(() => {
      setIsCapturePressed(false);
      flashTimeoutRef.current = null;
    }, 420);
  };

  return (
    <section className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden shadow-xl">
      <div className="p-3 lg:p-4 border-b border-gray-800 bg-gray-850 flex items-center justify-between">
        <h2 className="font-bold flex items-center gap-2 text-green-400 md:text-base lg:text-lg">
          <span className="w-6 h-6 lg:w-7 lg:h-7 rounded-full bg-green-500/10 flex items-center justify-center text-xs lg:text-sm">
            5
          </span>{' '}
          プレビュー
          <button
            onClick={onOpenHelp}
            className="p-1 rounded-lg transition border border-blue-500/45 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200"
            title="このセクションの説明"
            aria-label="プレビューセクションの説明"
          >
            <CircleHelp className="w-4 h-4" />
          </button>
        </h2>
        <div className="flex items-center gap-2">
          {isProcessing && (
            <span className="text-[10px] md:text-xs text-green-400 font-mono animate-pulse bg-green-900/30 px-2 py-0.5 rounded">
              REC ●
            </span>
          )}
        </div>
      </div>
      <div
        className={
          canvasHeight > canvasWidth
            // 縦(9:16): 高さ上限つきで中央に収める（画面が縦長になりすぎないよう max-height を設定）。
            ? 'relative aspect-[9/16] bg-black group mx-auto max-h-[70vh] h-[70vh] max-w-full'
            // 横(16:9): 従来どおり。
            : 'relative aspect-video bg-black w-full group'
        }
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain"
        />
        {mediaItems.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <MonitorPlay className="w-12 h-12 lg:w-16 lg:h-16 text-gray-800" />
          </div>
        )}
        {isLoading && mediaItems.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <div className="flex flex-col items-center gap-2">
              <Loader className="w-8 h-8 lg:w-10 lg:h-10 text-blue-400 animate-spin" />
              <span className="text-xs lg:text-sm text-gray-300">{loadingLabel ?? '読み込み中...'}</span>
            </div>
          </div>
        )}
        {!isPlaying && !isProcessing && !isLoading && mediaItems.length > 0 && (
          <button
            onClick={onTogglePlay}
            className="absolute inset-0 m-auto w-14 h-14 lg:w-16 lg:h-16 bg-white/20 hover:bg-white/30 backdrop-blur rounded-full flex items-center justify-center text-white transition-transform active:scale-95"
          >
            <Play className="w-6 h-6 lg:w-8 lg:h-8 fill-current ml-1" />
          </button>
        )}
      </div>
      <div className="p-4 lg:p-5 bg-gray-900 border-t border-gray-800">
        {/* 現在位置・総尺とも 1/100 秒まで表示する。
            ・「分:秒」だけだと 3.00〜3.99 秒がすべて 0:03 に潰れ、スライダーを動かしても
              数字が変わらないように見える。
            ・総尺も同じ桁で出す必要がある。10.5 秒の動画を floor して「0:10」と出すと、
              終端まで再生したとき現在位置が「0:10.50」となり、**現在位置のほうが総尺より
              大きく見える**という矛盾が起きるため（左右で必ず桁を揃える）。
            currentTime は元々毎フレーム更新されており（setCurrentTime を rAF ごとに呼ぶ）、
            表示桁を増やしても描画回数は変わらない。 */}
        <div className="flex justify-between text-[10px] md:text-xs lg:text-sm font-mono text-gray-400 mb-2">
          <span aria-label={`現在位置 ${formatTimeCentiseconds(currentTime)}`}>
            {formatTimeCentiseconds(currentTime)}
          </span>
          <span aria-label={`全体の長さ ${formatTimeCentiseconds(totalDuration)}`}>
            {formatTimeCentiseconds(totalDuration)}
          </span>
        </div>

        {isProcessing && (
          <div className="mb-3 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-rose-500/10 px-3 py-2.5 lg:px-4 lg:py-3 shadow-[0_6px_20px_rgba(251,146,60,0.14)]">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 w-6 h-6 rounded-lg border border-amber-300/40 bg-amber-300/10 flex items-center justify-center shrink-0">
                <AlertCircle className="w-3.5 h-3.5 text-amber-200" />
              </div>
              <div>
                <p className="text-[11px] md:text-[12px] lg:text-sm leading-snug font-semibold text-amber-100">
                  動画作成中はこの画面のままお待ちください
                </p>
                <p className="text-[10px] md:text-[11px] lg:text-xs leading-snug text-amber-200/90 mt-0.5">
                  画面を切り替えると映像・音声が乱れます
                </p>
                {exportStatusText && (
                  <p className="text-[10px] md:text-[11px] lg:text-xs leading-snug text-amber-100/90 mt-1">
                    {exportStatusText}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        {previewRuntimeNotice && !isProcessing && (
          <div className="mb-3 rounded-xl border border-sky-400/35 bg-linear-to-r from-sky-500/10 via-cyan-500/10 to-emerald-500/10 px-3 py-2.5 lg:px-4 lg:py-3 shadow-[0_6px_20px_rgba(34,211,238,0.12)]">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 w-6 h-6 rounded-lg border border-sky-300/35 bg-sky-300/10 flex items-center justify-center shrink-0">
                <CircleHelp className="w-3.5 h-3.5 text-sky-200" />
              </div>
              <div>
                <p className="text-[11px] md:text-[12px] lg:text-sm leading-snug font-semibold text-sky-100">
                  {previewRuntimeNotice.title}
                </p>
                <p className="text-[10px] md:text-[11px] lg:text-xs leading-snug text-sky-100/90 mt-0.5">
                  {previewRuntimeNotice.description}
                </p>
              </div>
            </div>
          </div>
        )}
        <div className="relative h-8 w-full select-none">
          <div className="absolute top-3 w-full h-2 bg-gray-800 rounded-full overflow-hidden">
            {/* 実タイムライン（ディゾルブの重なりを反映）に沿って絶対配置で描く */}
            <div className="relative w-full h-full opacity-60" data-testid="preview-timeline-bar">
              {previewTimelineSegments.map(({ item: v, index: i, start, end, imageSegmentIndex }) => {
                const span = totalDuration > 0 ? ((end - start) / totalDuration) * 100 : 0;
                if (!(span > 0)) return null;
                return (
                  <div
                    key={v.id}
                    style={{
                      position: 'absolute',
                      left: `${(start / totalDuration) * 100}%`,
                      width: `${span}%`,
                      top: 0,
                      bottom: 0,
                    }}
                    className={
                      v.type === 'image'
                        ? `${imageSegmentIndex !== null && imageSegmentIndex % 2 === 0 ? 'bg-yellow-600' : 'bg-orange-500'} border-r border-gray-950/35`
                        : i % 2 === 0
                          ? 'bg-blue-600'
                          : 'bg-blue-500'
                    }
                  />
                );
              })}
              {/* エンドロール区間はクリップとは別の色（スレート）で示す */}
              {previewEndrollSegment && totalDuration > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${(previewEndrollSegment.start / totalDuration) * 100}%`,
                    width: `${((previewEndrollSegment.end - previewEndrollSegment.start) / totalDuration) * 100}%`,
                    top: 0,
                    bottom: 0,
                  }}
                  className="bg-slate-500 border-l border-gray-950/35"
                />
              )}
              {/* ディゾルブの重なり区間はトランジションのイメージカラー（紫）で最前面へ */}
              {totalDuration > 0 && previewOverlapSegments.map((overlap) => (
                <div
                  key={overlap.key}
                  style={{
                    position: 'absolute',
                    left: `${(overlap.start / totalDuration) * 100}%`,
                    width: `${((overlap.end - overlap.start) / totalDuration) * 100}%`,
                    top: 0,
                    bottom: 0,
                  }}
                  className="bg-purple-500"
                />
              ))}
            </div>
          </div>
          <input
            type="range"
            min="0"
            max={totalDuration || 0.1}
            // 表示を 1/100 秒にしたので、刻みも合わせて 0.01 秒にする。
            // step="0.1" のままだと、つまみを動かしても 0.1 秒単位でしか値が変わらず
            // 「動かしているのに表示が飛ぶ」ことになる。
            // シーク自体は SEEK_THROTTLE_MS と seeked 完了駆動で間引かれるため、
            // 刻みを細かくしてもデコーダへの負荷は増えない。
            step="0.01"
            value={currentTime}
            onChange={onSeekChange}
            onPointerDown={onSeekStart}
            onMouseDown={onSeekStart}
            onTouchStart={(e) => {
              swipeSeekTouchStart(e);
              onSeekStart();
            }}
            onTouchMove={swipeSeekTouchMove}
            onPointerUp={onSeekEnd}
            onPointerCancel={onSeekEnd}
            onMouseUp={onSeekEnd}
            onTouchEnd={(e) => {
              swipeSeekTouchEnd(e);
              onSeekEnd();
            }}
            onTouchCancel={(e) => {
              swipeSeekTouchEnd(e);
              onSeekEnd();
            }}
            onBlur={onSeekEnd}
            className="absolute top-0 w-full h-full opacity-0 cursor-pointer z-10"
            disabled={mediaItems.length === 0 || isProcessing}
            aria-label="プレビュー位置"
          />
          {!isProcessing && mediaItems.length > 0 && (
            <div
              className="absolute top-1.5 w-5 h-5 bg-white shadow-lg rounded-full pointer-events-none z-0 border-2 border-gray-200"
              style={{ left: `calc(${(currentTime / (totalDuration || 1)) * 100}% - 10px)` }}
            />
          )}
        </div>

        {/*
          音量波形と無音区間ナビゲーション（Issue #217）。
          シークバーと同じ親（この padding 付きコンテナ）の直下に幅 100% で置くので、
          左右の余白・左端・右端・同一時刻の横位置がシークバーと完全に一致する。
        */}
        <TimelineWaveform
          waveform={timelineWaveform}
          totalDuration={totalDuration}
          currentTime={currentTime}
          enabled={supportsTimelineWaveform && mediaItems.length > 0}
          disabled={isProcessing}
          onSeek={onSeekToTime}
        />

        <div className="mt-4 flex justify-center gap-4 border-b border-gray-800 pb-6">
          <button
            type="button"
            onClick={onStop}
            disabled={mediaItems.length === 0 || isLoading}
            title="プレビューを停止"
            aria-label="プレビューを停止"
            className={`${PREVIEW_ICON_BUTTON_BASE} ${PREVIEW_STOP_BUTTON}`}
          >
            <Square className="w-5 h-5 lg:w-6 lg:h-6 fill-current" />
          </button>
          <button
            onClick={onTogglePlay}
            disabled={mediaItems.length === 0 || isLoading}
            aria-label={isPlaying ? 'プレビューを一時停止' : 'プレビューを再生'}
            className={`p-3 lg:p-4 rounded-full transition shadow-lg ${isLoading ? 'bg-gray-700 text-gray-400 cursor-wait' : isPlaying ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
          >
            {isLoading ? <Loader className="w-5 h-5 lg:w-6 lg:h-6 animate-spin" /> : isPlaying ? <Pause className="w-5 h-5 lg:w-6 lg:h-6" /> : <Play className="w-5 h-5 lg:w-6 lg:h-6 ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={() => triggerCaptureFeedback(onCapture)}
            disabled={mediaItems.length === 0 || isProcessing || isLoading}
            title="プレビューをキャプチャ"
            aria-label="プレビューをキャプチャ"
            className={`${PREVIEW_ICON_BUTTON_BASE} ${PREVIEW_CAPTURE_BUTTON} ${
              isCapturePressed
                ? 'animate-preview-capture-press bg-emerald-700 text-white border-emerald-400/90 shadow-[0_0_0_4px_rgba(167,243,208,0.42),0_0_26px_rgba(16,185,129,0.52)]'
                : ''
            }`}
          >
            <Camera className="w-5 h-5 lg:w-6 lg:h-6" />
          </button>
        </div>
        <div className="mt-6 flex flex-col gap-4">
          {/* サムネイルと動画書き出し設定を一か所にまとめる */}
          {mediaItems.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-gray-700/70 bg-gray-850/80">
              <SettingsAccordionHeader
                title="動画出力オプション"
                isOpen={isVideoOutputOptionsOpen}
                controlsId="video-output-options"
                onToggle={() => setIsVideoOutputOptionsOpen((open) => !open)}
              />
              {isVideoOutputOptionsOpen && (
                <div
                  id="video-output-options"
                  className="space-y-4 border-t border-gray-700/60 px-3 py-3"
                >
                  {exportUrl && (
                    <div className="rounded-lg border border-emerald-600/40 bg-emerald-950/30 px-3 py-2">
                      <p className="text-[10px] font-semibold text-emerald-200 md:text-xs">
                        この設定で動画を作成済みです
                      </p>
                      <p className="mt-0.5 text-[10px] leading-snug text-emerald-200/70 md:text-[11px]">
                        設定変更には生成済み動画の解除が必要です。
                      </p>
                    </div>
                  )}

                  {uiCapabilities.supportsProjectPoster && (
                    <section aria-labelledby="project-poster-heading">
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
                      <p
                        id="project-poster-heading"
                        className="text-[10px] font-medium text-gray-300 md:text-xs"
                      >
                        サムネイル設定
                      </p>
                      <span className="text-[9px] text-gray-500 md:text-[10px]">
                        {projectPosterMode === 'manual' ? '手動' : '自動'}・{formatTime(projectPosterTimelineTime)}
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-600/70 bg-black ${
                          projectPosterAspectRatio === 'portrait'
                            ? 'h-20 aspect-[9/16]'
                            : 'h-12 aspect-video'
                        }`}
                        title={
                          projectPosterMode === 'manual'
                            ? `手動設定（${formatTime(projectPosterTimelineTime)}）`
                            : `自動設定（${formatTime(projectPosterTimelineTime)}）`
                        }
                      >
                        {projectPosterDataUrl ? (
                          <img
                            src={projectPosterDataUrl}
                            alt="プロジェクトのサムネイル"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="px-1 text-center text-[9px] leading-tight text-gray-500">
                            未表示
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={onSetProjectPosterFromCurrent}
                            disabled={areVideoOutputOptionsLocked || isLoading}
                            className="flex min-h-9 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-[10px] text-gray-200 transition hover:border-amber-500/60 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-30 md:text-xs"
                            title="プレビューに表示中のフレームをプロジェクトのサムネイルに設定"
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                            {projectPosterMode === 'manual'
                              ? '現在のフレームで再設定'
                              : '現在のフレームをサムネイルに設定'}
                          </button>
                          {projectPosterMode === 'manual' && (
                            <button
                              type="button"
                              onClick={onResetProjectPosterToAuto}
                              disabled={areVideoOutputOptionsLocked || isLoading}
                              className="flex min-h-9 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-[10px] text-gray-200 transition hover:border-blue-500/60 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-30 md:text-xs"
                              title="タイムライン先頭付近（約0.2秒）のフレームを自動取得"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              自動設定に戻す
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    </section>
                  )}

                  {supportsCaptionLayerExport && (
                    <section
                      aria-labelledby="export-content-heading"
                      className="space-y-3 border-t border-gray-700/60 pt-3"
                    >
                      <div>
                        <p
                          id="export-content-heading"
                          className="mb-1.5 text-[10px] font-medium text-gray-300 md:text-xs"
                        >
                          出力内容
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(
                            [
                              { value: 'composite' as const, label: '完成動画' },
                              { value: 'caption-layer' as const, label: 'キャプションのみ' },
                            ] as const
                          ).map((option) => {
                            const selected = exportOutputOptions.contentMode === option.value;
                            const unavailableWithoutCaptions =
                              option.value === 'caption-layer'
                              && !hasCaptionsForSubtitleExport;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                disabled={
                                  areVideoOutputOptionsLocked
                                  || unavailableWithoutCaptions
                                }
                                title={
                                  unavailableWithoutCaptions
                                    ? 'キャプションを1件以上追加すると選択できます'
                                    : undefined
                                }
                                onClick={() => setContentMode(option.value)}
                                className={`min-h-9 rounded-lg border px-2.5 text-[10px] transition disabled:cursor-not-allowed disabled:opacity-50 md:text-xs ${
                                  selected
                                    ? 'border-blue-500/70 bg-blue-600/25 text-blue-100'
                                    : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500 hover:text-white'
                                }`}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                        <p className="mt-1.5 text-[10px] leading-snug text-gray-500 md:text-[11px]">
                          ベース映像を含めず、キャプションと動画タイトルだけを書き出します。
                        </p>
                        {!hasCaptionsForSubtitleExport && (
                          <p className="mt-1.5 text-[10px] leading-snug text-amber-300/80 md:text-[11px]">
                            キャプションを追加すると選択できます。
                          </p>
                        )}
                      </div>

                      {exportOutputOptions.contentMode === 'caption-layer' && (
                        <>
                          <div>
                            <p className="mb-1.5 text-[10px] font-medium text-gray-400 md:text-xs">
                              キャプション動画の形式
                            </p>
                            <div className="flex flex-col gap-1.5">
                              {(
                                [
                                  'alpha-webm',
                                  'black-matte-mp4',
                                  'luminance-key-mp4',
                                ] as const
                              ).map((format) => {
                                const desc = resolveCaptionLayerFormatDescriptor(format);
                                const unsupported = format === 'alpha-webm' && !canAlphaWebm;
                                const disabled = areVideoOutputOptionsLocked || unsupported;
                                const selected = exportOutputOptions.captionLayerFormat === format;
                                return (
                                  <button
                                    key={format}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => setCaptionLayerFormat(format)}
                                    className={`rounded-lg border px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                                      selected
                                        ? 'border-emerald-500/60 bg-emerald-600/15 text-emerald-50'
                                        : 'border-gray-700 bg-gray-800/80 text-gray-300 hover:border-gray-500'
                                    }`}
                                  >
                                    <span className="block text-[11px] font-semibold md:text-xs">
                                      {desc.label}
                                      {unsupported ? '（この環境では非対応）' : ''}
                                    </span>
                                    <span className="mt-0.5 block text-[10px] leading-snug text-gray-500 md:text-[11px]">
                                      {desc.description}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            <p className="mt-1.5 text-[10px] leading-snug text-gray-500 md:text-[11px]">
                              背景透過は WebM のみ。MP4 は黒背景または白文字キー用です。
                            </p>
                          </div>
                          <div className="rounded-lg border border-gray-700/80 bg-gray-800/50 px-2.5 py-2">
                            <label
                              className={`flex items-start gap-2 ${
                                areVideoOutputOptionsLocked
                                  ? 'cursor-not-allowed opacity-50'
                                  : 'cursor-pointer'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                disabled={areVideoOutputOptionsLocked}
                                checked={exportOutputOptions.includeSubtitles}
                                onChange={(e) => setIncludeSubtitles(e.target.checked)}
                              />
                              <span>
                                <span className="block text-[11px] font-medium text-gray-200 md:text-xs">
                                  字幕ファイル（SRT / VTT）も保存
                                </span>
                                <span className="mt-0.5 block text-[10px] leading-snug text-gray-500">
                                  SRT / VTT を動画と一緒に保存し、他の編集ソフトで使えます。
                                </span>
                              </span>
                            </label>
                            {hasCaptionsForSubtitleExport &&
                              onDownloadSubtitles &&
                              !isProcessing && (
                              <button
                                type="button"
                                onClick={onDownloadSubtitles}
                                className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-[10px] text-gray-300 transition hover:border-indigo-500/50 hover:text-indigo-100 md:text-xs"
                              >
                                字幕ファイルだけダウンロード
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </section>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <button
              onClick={onClearAll}
              disabled={mediaItems.length === 0 && !bgm && narrations.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm lg:text-base font-medium text-gray-400 hover:bg-red-900/20 hover:text-red-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-4 h-4 lg:w-5 lg:h-5" /> 一括クリア
            </button>
            {exportActionButton}
          </div>
          {exportUrl && exportExt === 'webm' && (
            <div className="bg-yellow-900/30 border border-yellow-700/50 p-3 rounded-lg flex items-start gap-2 text-xs text-yellow-200">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">
                  {exportOutputOptions.contentMode === 'caption-layer'
                    ? '透過形式について'
                    : '重要: SNS投稿について'}
                </p>
                <p>
                  {exportOutputOptions.contentMode === 'caption-layer'
                    ? '透過キャプションは WebM で保存されます（MP4 / H.264 は非対応）。'
                    : 'お使いのブラウザはMP4出力に非対応のため、互換性の高いWebM形式で保存しました。'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default React.memo(PreviewSection);
