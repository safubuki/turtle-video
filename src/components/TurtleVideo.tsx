/**
 * @file TurtleVideo.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 動画編集アプリケーションのメインコンポーネント。タイムライン管理、再生制御、レンダリングループ、および各種セクションの統合を行う。
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import type { AppFlavor } from '../app/resolveAppFlavor';
import { getAppFlavorUiCapabilities } from '../app/appFlavorUi';
import type {
  MediaItem,
  AudioTrack,
  NarrationClip,
  NarrationScriptLength,
  WatermarkOverlay,
  EndrollOverlay,
  ExportOutputOptions,
} from '../types';
import type { ExportRuntime } from './turtle-video/exportRuntime';
import type { SectionHelpKey } from '../constants/sectionHelp';
import type { PreviewRuntime } from './turtle-video/previewRuntime';
import type { SaveRuntime } from './turtle-video/saveRuntime';
import {
  VOICE_OPTIONS,
  GEMINI_API_BASE_URL,
  GEMINI_SCRIPT_MODEL,
  GEMINI_SCRIPT_FALLBACK_MODELS,
  GEMINI_TTS_MODEL,
  TTS_SAMPLE_RATE,
} from '../constants';
import { useCanvasStore } from '../stores/canvasStore';
import type { AspectRatio } from '../stores/canvasStore';

import type { ExportPreparationStep } from '../hooks/export-strategies/types';
import { usePreventUnload } from '../hooks/usePreventUnload';
import { useTimelineWaveform } from '../hooks/useTimelineWaveform';
import { findAdjacentSilenceBoundary } from '../utils/timelineWaveform';
import { useProjectStore } from '../stores/projectStore';

// Utils
import {
  captureCanvasAsImage,
  createCaptionFreeSnapshot,
  waitForPreviewFrameSettled,
  waitForVideoFrameAtTime,
} from '../utils/canvas';
import { resolveCaptureFrameTarget } from '../utils/previewCaptureFrame';
import { preserveOriginalFileName, resolveAiNarrationFileName } from '../utils/fileNames';
import { fetchGeminiWithRetry } from '../utils/geminiRetry';
import { saveBlobWithClientFileStrategy, saveObjectUrlWithClientFileStrategy } from '../utils/fileSave';
import {
  buildCaptionLayerVideoFileName,
  buildCaptionSubtitleFileName,
  DEFAULT_EXPORT_OUTPUT_OPTIONS,
  normalizeExportOutputOptions,
  resolveCaptionLayerFormatDescriptor,
} from '../utils/captionLayerExport';
import {
  buildSubtitleFileContent,
  subtitleMimeType,
} from '../utils/captionSubtitle';
import { openFilesWithPicker, shouldUseMediaOpenFilePicker } from '../utils/platform';
import { computeTransitionTimelineRanges } from '../utils/transitionTimeline';
import { getEndrollDuration } from '../utils/endrollOverlay';
import {
  buildNarrationCaptionPlan,
  mapNarrationSilencesToTimeline,
  snapNarrationCaptionPlanToSilences,
} from '../utils/narrationCaptionPlan';
import { analyzeNarrationWaveform } from '../hooks/useNarrationWaveform';
import { resolveEffectiveAudioClipPlayback } from '../stores/audioStore';
import {
  computeVideoTrimFromPreviewPosition,
  buildAutoProjectPosterContentKey,
  resolveAutoProjectPosterCaptureTime,
  isCanvasEffectivelyBlank,
  createPosterDataUrlFromCanvas,
} from '../utils/media';
import { computeTimelineDurationFromSource } from '../utils/playbackSpeed';

// Zustand Stores
import { useMediaStore, useAudioStore, useUIStore, useCaptionStore, useOverlayStore, useLogStore, createNarrationClip } from '../stores';
import { useOfflineModeStore } from '../stores/offlineModeStore';

// コンポーネント
import Toast from './common/Toast';
import ErrorMessage from './common/ErrorMessage';
import MediaResourceLoader from './media/MediaResourceLoader';
import Header from './Header';
import ClipsSection from './sections/ClipsSection';
import BgmSection from './sections/BgmSection';
import NarrationSection from './sections/NarrationSection';
import CaptionSection from './sections/CaptionSection';
import OverlaySection from './sections/OverlaySection';
import PreviewSection from './sections/PreviewSection';
import AiModal from './modals/AiModal';
import SettingsModal, { getStoredApiKey } from './modals/SettingsModal';
import SaveLoadModal from './modals/SaveLoadModal';
import SectionHelpModal from './modals/SectionHelpModal';
import type {
  PreviewCacheEntry,
  PreviewCacheStatus,
} from './turtle-video/previewCacheContract';
import { releaseSharedMediaElementsForRemount } from './turtle-video/mediaRemount';

// --- 自動プロジェクトポスターのキャプチャ待ち設定 ---
// 動画のシークは非同期で、rAF 1 回（約16ms）では完了しない。完了前に撮ると
// preview engine の描画条件（readyState >= 2 && !seeking）を満たさず黒を掴む。
/** 内容変更を検知してからキャプチャ開始までの猶予（要素の差し替え・再読込を待つ） */
const AUTO_POSTER_CAPTURE_INITIAL_DELAY_MS = 150;
/** アクティブ要素が描画可能になるまでの最大待ち時間 */
const AUTO_POSTER_MEDIA_SETTLE_TIMEOUT_MS = 2500;
/** 描画可能判定のポーリング間隔 */
const AUTO_POSTER_MEDIA_SETTLE_POLL_MS = 50;
/** 黒フレームを掴んだときの撮り直し回数 */
const AUTO_POSTER_CAPTURE_MAX_ATTEMPTS = 3;
/** 撮り直し前の待ち時間 */
const AUTO_POSTER_CAPTURE_RETRY_DELAY_MS = 120;

// API キー取得関数（localStorage優先、フォールバックで環境変数）
const getApiKey = (): string => {
  const storedKey = getStoredApiKey();
  if (storedKey) return storedKey;
  return import.meta.env.VITE_GEMINI_API_KEY || '';
};

const EXPORT_FINALIZING_EPSILON_SEC = 0.05;
const EXPORT_FINALIZING_TIMEOUT_WARNING = '保存ファイルの作成に時間がかかっています...';
const EXPORT_FINALIZING_TIMEOUT_ERROR = '保存ファイルの作成に時間がかかっています。ログを確認してください。';

interface TurtleVideoProps {
  appFlavor: AppFlavor;
  previewRuntime: PreviewRuntime;
  exportRuntime: ExportRuntime;
  saveRuntime: SaveRuntime;
}

const TurtleVideo: React.FC<TurtleVideoProps> = ({ appFlavor, previewRuntime, exportRuntime, saveRuntime }) => {
  // 離脱防止フックを使用
  usePreventUnload();
  const uiCapabilities = useMemo(() => getAppFlavorUiCapabilities(appFlavor), [appFlavor]);

  // === Zustand Stores ===
  // Canvas Store (動的キャンバスサイズ)
  const canvasWidth = useCanvasStore((s) => s.width);
  const canvasHeight = useCanvasStore((s) => s.height);
  const aspectRatio = useCanvasStore((s) => s.aspectRatio);
  const setAspectRatio = useCanvasStore((s) => s.setAspectRatio);
  const resetCanvasSize = useCanvasStore((s) => s.resetCanvasSize);
  const applyCanvasFromSource = useCanvasStore((s) => s.applyFromSource);

  // Media Store
  const mediaItems = useMediaStore((s) => s.mediaItems);
  /**
   * クリップだけの長さ（エンドロールを含まない）。
   * クリップの配置・active 判定・キャプション・ナレーションはこちらを基準にする。
   * 出力全体の長さは後段で算出する `totalDuration`（= clipsDuration + エンドロール尺）。
   */
  const clipsDuration = useMediaStore((s) => s.totalDuration);
  const isClipsLocked = useMediaStore((s) => s.isClipsLocked);
  const addMediaItems = useMediaStore((s) => s.addMediaItems);
  const removeMediaItem = useMediaStore((s) => s.removeMediaItem);
  const moveMediaItem = useMediaStore((s) => s.moveMediaItem);
  const setVideoDuration = useMediaStore((s) => s.setVideoDuration);
  const updateVideoTrim = useMediaStore((s) => s.updateVideoTrim);
  const setProjectPosterManual = useMediaStore((s) => s.setProjectPosterManual);
  const resetProjectPosterToAuto = useMediaStore((s) => s.resetProjectPosterToAuto);
  const projectPosterMode = useMediaStore((s) => s.projectPosterMode);
  const projectPosterTimelineTime = useMediaStore((s) => s.projectPosterTimelineTime);
  const projectPosterDataUrl = useMediaStore((s) => s.projectPosterDataUrl);
  const projectPosterAspectRatio = useMediaStore((s) => s.projectPosterAspectRatio);
  const setProjectPosterDataUrl = useMediaStore((s) => s.setProjectPosterDataUrl);
  const reconcileProjectPosterAspectRatio = useMediaStore(
    (s) => s.reconcileProjectPosterAspectRatio,
  );
  const updateImageDuration = useMediaStore((s) => s.updateImageDuration);
  const updateScale = useMediaStore((s) => s.updateScale);
  const updatePosition = useMediaStore((s) => s.updatePosition);
  const rotateClip = useMediaStore((s) => s.rotateClip);
  const updateBlur = useMediaStore((s) => s.updateBlur);
  const resetTransform = useMediaStore((s) => s.resetTransform);
  const toggleTransformPanel = useMediaStore((s) => s.toggleTransformPanel);
  const updateVolume = useMediaStore((s) => s.updateVolume);
  const toggleMute = useMediaStore((s) => s.toggleMute);
  const updateVideoPlaybackSpeed = useMediaStore((s) => s.updateVideoPlaybackSpeed);
  const updateVideoShowSpeedBadge = useMediaStore((s) => s.updateVideoShowSpeedBadge);
  const updateVideoSpeedBadgeLabelStyle = useMediaStore((s) => s.updateVideoSpeedBadgeLabelStyle);
  const updateVideoSpeedBadgePosition = useMediaStore((s) => s.updateVideoSpeedBadgePosition);
  const applyVideoSpeedBadgePreset = useMediaStore((s) => s.applyVideoSpeedBadgePreset);
  const setAllVideosMuted = useMediaStore((s) => s.setAllVideosMuted);
  const toggleFadeIn = useMediaStore((s) => s.toggleFadeIn);
  const toggleFadeOut = useMediaStore((s) => s.toggleFadeOut);
  const updateFadeInDuration = useMediaStore((s) => s.updateFadeInDuration);
  const updateFadeOutDuration = useMediaStore((s) => s.updateFadeOutDuration);
  const toggleItemLock = useMediaStore((s) => s.toggleItemLock);
  const toggleClipsLock = useMediaStore((s) => s.toggleClipsLock);
  const clearAllMedia = useMediaStore((s) => s.clearAllMedia);

  // Audio Store
  const bgm = useAudioStore((s) => s.bgm);
  const isBgmLocked = useAudioStore((s) => s.isBgmLocked);

  const setBgm = useAudioStore((s) => s.setBgm);
  const updateBgmStartPoint = useAudioStore((s) => s.updateBgmStartPoint);
  const updateBgmDelay = useAudioStore((s) => s.updateBgmDelay);
  const updateBgmVolume = useAudioStore((s) => s.updateBgmVolume);
  const toggleBgmFadeIn = useAudioStore((s) => s.toggleBgmFadeIn);
  const toggleBgmFadeOut = useAudioStore((s) => s.toggleBgmFadeOut);
  const updateBgmFadeInDuration = useAudioStore((s) => s.updateBgmFadeInDuration);
  const updateBgmFadeOutDuration = useAudioStore((s) => s.updateBgmFadeOutDuration);
  const toggleBgmLock = useAudioStore((s) => s.toggleBgmLock);
  const removeBgm = useAudioStore((s) => s.removeBgm);

  // 複数 BGM クリップ（standard フレーバー限定機能）
  const bgmClips = useAudioStore((s) => s.bgmClips);
  const addBgmClip = useAudioStore((s) => s.addBgmClip);
  const migrateLegacyBgmToClips = useAudioStore((s) => s.migrateLegacyBgmToClips);

  const narrations = useAudioStore((s) => s.narrations);
  const isNarrationLocked = useAudioStore((s) => s.isNarrationLocked);
  const addNarration = useAudioStore((s) => s.addNarration);
  const updateNarrationStartTime = useAudioStore((s) => s.updateNarrationStartTime);
  const updateNarrationVolume = useAudioStore((s) => s.updateNarrationVolume);
  const toggleNarrationMute = useAudioStore((s) => s.toggleNarrationMute);
  const updateNarrationTrim = useAudioStore((s) => s.updateNarrationTrim);
  const setNarrationEndTime = useAudioStore((s) => s.setNarrationEndTime);
  const updateNarrationMeta = useAudioStore((s) => s.updateNarrationMeta);
  const replaceNarrationAudio = useAudioStore((s) => s.replaceNarrationAudio);
  const moveNarration = useAudioStore((s) => s.moveNarration);
  const toggleNarrationLock = useAudioStore((s) => s.toggleNarrationLock);
  const removeNarration = useAudioStore((s) => s.removeNarration);
  const clearAllAudio = useAudioStore((s) => s.clearAllAudio);

  // UI Store
  const toastMessage = useUIStore((s) => s.toastMessage);
  const errorMsg = useUIStore((s) => s.errorMsg);
  const errorCount = useUIStore((s) => s.errorCount);
  const isPlaying = useUIStore((s) => s.isPlaying);
  const currentTime = useUIStore((s) => s.currentTime);
  const isProcessing = useUIStore((s) => s.isProcessing);
  const exportUrl = useUIStore((s) => s.exportUrl);
  const exportExt = useUIStore((s) => s.exportExt);
  const showAiModal = useUIStore((s) => s.showAiModal);
  const aiPrompt = useUIStore((s) => s.aiPrompt);
  const aiScript = useUIStore((s) => s.aiScript);
  const aiVoice = useUIStore((s) => s.aiVoice);
  const aiVoiceStyle = useUIStore((s) => s.aiVoiceStyle);
  const aiNarrationScene = useUIStore((s) => s.aiNarrationScene);
  const setAiNarrationScene = useUIStore((s) => s.setAiNarrationScene);
  const isAiLoading = useUIStore((s) => s.isAiLoading);

  const clearToast = useUIStore((s) => s.clearToast);
  const showToast = useUIStore((s) => s.showToast);
  const setError = useUIStore((s) => s.setError);
  const clearError = useUIStore((s) => s.clearError);
  const offlineMode = useOfflineModeStore((s) => s.offlineMode);
  const play = useUIStore((s) => s.play);
  const pause = useUIStore((s) => s.pause);
  const setCurrentTime = useUIStore((s) => s.setCurrentTime);
  const setProcessing = useUIStore((s) => s.setProcessing);
  const setLoading = useUIStore((s) => s.setLoading);
  const setPreviewPlaying = useUIStore((s) => s.setPreviewPlaying);

  const isLoading = useUIStore((s) => s.isLoading);
  const setExportUrl = useUIStore((s) => s.setExportUrl);
  const setExportExt = useUIStore((s) => s.setExportExt);
  const clearExport = useUIStore((s) => s.clearExport);
  const openAiModal = useUIStore((s) => s.openAiModal);
  const closeAiModal = useUIStore((s) => s.closeAiModal);
  const setAiPrompt = useUIStore((s) => s.setAiPrompt);
  const setAiScript = useUIStore((s) => s.setAiScript);
  const setAiVoice = useUIStore((s) => s.setAiVoice);
  const setAiVoiceStyle = useUIStore((s) => s.setAiVoiceStyle);
  const setAiLoading = useUIStore((s) => s.setAiLoading);
  const resetUI = useUIStore((s) => s.resetUI);

  // Caption Store
  const captions = useCaptionStore((s) => s.captions);
  const captionSettings = useCaptionStore((s) => s.settings);
  const isCaptionLocked = useCaptionStore((s) => s.isLocked);
  const addCaption = useCaptionStore((s) => s.addCaption);
  const addCaptions = useCaptionStore((s) => s.addCaptions);
  const replaceCaptions = useCaptionStore((s) => s.replaceCaptions);
  const shiftCaptions = useCaptionStore((s) => s.shiftCaptions);
  const updateCaption = useCaptionStore((s) => s.updateCaption);
  const setCaptionFontSizeCustom = useCaptionStore((s) => s.setFontSizeCustom);
  const setCaptionPositionCustom = useCaptionStore((s) => s.setPositionCustom);
  const removeCaption = useCaptionStore((s) => s.removeCaption);
  const moveCaption = useCaptionStore((s) => s.moveCaption);
  const clearAllCaptions = useCaptionStore((s) => s.clearAllCaptions);
  const setCaptionEnabled = useCaptionStore((s) => s.setEnabled);
  const setCaptionFontSize = useCaptionStore((s) => s.setFontSize);
  const setCaptionFontStyle = useCaptionStore((s) => s.setFontStyle);
  const setCaptionFontColor = useCaptionStore((s) => s.setFontColor);
  const setCaptionStrokeColor = useCaptionStore((s) => s.setStrokeColor);
  const setCaptionStrokeWidth = useCaptionStore((s) => s.setStrokeWidth);
  const setCaptionPosition = useCaptionStore((s) => s.setPosition);
  const setCaptionBlur = useCaptionStore((s) => s.setBlur);
  const setCaptionBackgroundEnabled = useCaptionStore((s) => s.setBackgroundEnabled);
  const setCaptionBackgroundColor = useCaptionStore((s) => s.setBackgroundColor);
  const setCaptionBackgroundOpacity = useCaptionStore((s) => s.setBackgroundOpacity);
  const setCaptionBackgroundRadius = useCaptionStore((s) => s.setBackgroundRadius);
  const setBulkFadeIn = useCaptionStore((s) => s.setBulkFadeIn);
  const setBulkFadeOut = useCaptionStore((s) => s.setBulkFadeOut);
  const setBulkFadeInDuration = useCaptionStore((s) => s.setBulkFadeInDuration);
  const setBulkFadeOutDuration = useCaptionStore((s) => s.setBulkFadeOutDuration);
  const toggleCaptionLock = useCaptionStore((s) => s.toggleLock);
  const resetCaptions = useCaptionStore((s) => s.resetCaptions);
  // 動画タイトル（Issue #211・キャプションとは別管理）
  const videoTitle = useCaptionStore((s) => s.title);
  const updateVideoTitle = useCaptionStore((s) => s.updateTitle);
  const setVideoTitleRange = useCaptionStore((s) => s.setTitleRange);
  const resetVideoTitle = useCaptionStore((s) => s.resetTitle);

  // プロジェクト全体ウォーターマーク（Issue #210・カードとは独立）
  const watermarkOverlay = useOverlayStore((s) => s.watermark);
  const setWatermarkImage = useOverlayStore((s) => s.setWatermarkImage);
  const updateWatermark = useOverlayStore((s) => s.updateWatermark);
  const setWatermarkRange = useOverlayStore((s) => s.setWatermarkRange);
  const removeWatermarkImage = useOverlayStore((s) => s.removeWatermarkImage);
  const resetWatermark = useOverlayStore((s) => s.resetWatermark);

  // エンドロール（クリップの後に続く単色背景 + ロゴ）。ウォーターマークとは独立
  const endrollOverlay = useOverlayStore((s) => s.endroll);
  const setEndrollImage = useOverlayStore((s) => s.setEndrollImage);
  const updateEndroll = useOverlayStore((s) => s.updateEndroll);
  const removeEndrollImage = useOverlayStore((s) => s.removeEndrollImage);

  /**
   * タイムラインが伸びる秒数。無効・画像なしなら 0。
   * 0 のとき totalDuration === clipsDuration となり、既存の挙動と完全に一致する。
   */
  const endrollDuration = useMemo(
    () => getEndrollDuration(endrollOverlay),
    [endrollOverlay],
  );

  /**
   * 出力全体の長さ（クリップ + エンドロール）。
   * シークバー範囲・再生終了判定・エクスポート尺・BGM の末尾フェードはこちらを使う。
   */
  const totalDuration = clipsDuration + endrollDuration;

  /**
   * プレビューがエンドロール区間を表示中か。
   * 自動サムネイルのキャプチャ（先頭付近を本物の canvas へ描く）を見送る判定に使う。
   * boolean にしておくことで、区間を出入りした時だけ effect が再評価される
   * （currentTime そのものを依存にすると毎フレーム再実行されてしまう）。
   */
  const isPreviewInEndroll = endrollDuration > 0 && currentTime >= clipsDuration;

  // Log Store
  const logInfo = useLogStore((s) => s.info);
  const logWarn = useLogStore((s) => s.warn);
  const logError = useLogStore((s) => s.error);
  const logDebug = useLogStore((s) => s.debug);
  const updateMemoryStats = useLogStore((s) => s.updateMemoryStats);

  // === Local State ===
  const [reloadKey, setReloadKey] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [editingNarrationId, setEditingNarrationId] = useState<string | null>(null);
  const [aiScriptLength, setAiScriptLength] = useState<NarrationScriptLength>('medium');
  const [activeHelpSection, setActiveHelpSection] = useState<SectionHelpKey | null>(null);
  const [exportPreparationStep, setExportPreparationStep] = useState<ExportPreparationStep | null>(null);
  const [previewCacheStatus, setPreviewCacheStatus] = useState<PreviewCacheStatus>('idle');
  const [previewLoadingLabel, setPreviewLoadingLabel] = useState<string | undefined>(undefined);
  const [captionGeneratingNarrationId, setCaptionGeneratingNarrationId] = useState<string | null>(
    null,
  );

  // Ref
  const mediaItemsRef = useRef<MediaItem[]>([]);
  const bgmRef = useRef<AudioTrack | null>(null);
  const narrationsRef = useRef<NarrationClip[]>([]);
  const aiSpeechRequestInFlightRef = useRef(false);
  const totalDurationRef = useRef(0);
  /** クリップだけの尺（エンドロールを含まない）。クリップ配置・active 判定に使う */
  const clipsDurationRef = useRef(0);
  // キャプションを描く直前のプレビューフレーム（キャプション設定のミニプレビュー用）。
  // メインプレビューの canvas を直接使うと焼き込み済みキャプションと二重になる。
  const captionFreeSnapshotRef = useRef(createCaptionFreeSnapshot());
  const currentTimeRef = useRef(0);
  const projectPosterCaptureGenerationRef = useRef(0);
  /** 自動ポスターの再キャプチャ判定用。並び替え・尺変更などでキーが変わったら先頭付近を取り直す */
  const autoProjectPosterContentKeyRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaElementsRef = useRef<Record<string, HTMLVideoElement | HTMLImageElement | HTMLAudioElement>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const previewCacheVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewCacheEntryRef = useRef<PreviewCacheEntry | null>(null);
  const previewCacheStatusRef = useRef<PreviewCacheStatus>('idle');
  const previewCacheKeyRef = useRef<string | null>(null);
  const previewCacheGenerationRef = useRef(0);
  const previewCachePlaybackActiveRef = useRef(false);
  const previewCacheHasBuiltOnceRef = useRef(false);
  const captionGeneratingNarrationIdRef = useRef<string | null>(null);

  // Audio Nodes
  const sourceNodesRef = useRef<Record<string, MediaElementAudioSourceNode>>({});
  const gainNodesRef = useRef<Record<string, GainNode>>({});
  const sourceElementsRef = useRef<Record<string, HTMLMediaElement>>({});
  const pendingAudioDetachTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const masterDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioRoutingModeRef = useRef<'preview' | 'export'>('preview');
  const reqIdRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const hiddenStartedAtRef = useRef<number | null>(null);
  const needsResyncAfterVisibilityRef = useRef(false);
  const audioResumeWaitFramesRef = useRef(0);
  const lastVisibilityRefreshAtRef = useRef(0);
  const loopIdRef = useRef(0); // ループの世代を追跡
  const isPlayingRef = useRef(false); // 再生状態を即座に反映するRef
  const isSeekingRef = useRef(false); // シーク中フラグ
  const activeVideoIdRef = useRef<string | null>(null); // 現在再生中のビデオID
  const lastToggleTimeRef = useRef(0); // デバウンス用
  const videoRecoveryAttemptsRef = useRef<Record<string, number>>({}); // ビデオリカバリー試行時刻を追跡
  const exportPlayFailedRef = useRef<Record<string, boolean>>({}); // エクスポート中にplay()が失敗した動画を追跡
  const exportFallbackSeekAtRef = useRef<Record<string, number>>({}); // フォールバックシーク実行時刻を追跡
  const seekingVideosRef = useRef<Set<string>>(new Set()); // シーク中のビデオIDを追跡
  const lastSeekTimeRef = useRef(0); // 最後のシーク時刻（スロットリング用）
  const pendingSeekRef = useRef<number | null>(null); // 保留中のシーク位置
  const wasPlayingBeforeSeekRef = useRef(false); // シーク前の再生状態を保持
  const wasExportProcessingRef = useRef(isProcessing);
  const exportCompletedRef = useRef(false);
  const exportFinalizingUiRef = useRef(false);
  const exportFinalizeWarningShownRef = useRef(false);
  const pendingSeekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 保留中のシーク処理用タイマー


  const playbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 再生開始待機用タイマー
  const seekSettleGenerationRef = useRef(0);
  const previewPlaybackAttemptRef = useRef(0);
  const pendingPausedSeekWaitRef = useRef<{ cleanup: () => void } | null>(null);
  const previewAudioRouteRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastIosSafariAudioLogRef = useRef<string>('');
  const requestPreviewAudioRouteRefreshRef = useRef<() => void>(() => { });
  const detachGlobalSeekEndListenersRef = useRef<(() => void) | null>(null);
  const handleSeekEndCallbackRef = useRef<(() => void) | null>(null);
  const renderPausedPreviewFrameAtTimeRef = useRef<(targetTime: number) => void>(() => { });
  const primePreviewAudioOnlyTracksAtTimeRef = useRef<(playbackTime: number) => void>(() => { });
  const cancelSeekPlaybackPrepareRef = useRef<(() => void) | null>(null);
  const isSeekPlaybackPreparingRef = useRef(false);
  const endFinalizedRef = useRef(false); // 終端ファイナライズ済みフラグ（遅延renderFrame競合防止）

  const captionsRef = useRef(captions);
  const captionSettingsRef = useRef(captionSettings);
  const videoTitleRef = useRef(videoTitle);
  const watermarkOverlayRef = useRef<WatermarkOverlay>(watermarkOverlay);
  const watermarkImageRef = useRef<HTMLImageElement | null>(null);
  const endrollOverlayRef = useRef<EndrollOverlay>(endrollOverlay);
  const endrollImageRef = useRef<HTMLImageElement | null>(null);

  // --- 生成済み export クリアヘルパー ---
  // 停止・再生・編集操作時に呼び出し、古いダウンロードボタンを消す。
  // isProcessing 中は何もしない（エクスポート中断は別ルートに任せる）。
  const clearGeneratedExport = useCallback((reason: string) => {
    if (isProcessing) return;
    if (!exportUrl) return;

    clearExport();
    exportCompletedRef.current = false;
    exportFinalizingUiRef.current = false;
    exportFinalizeWarningShownRef.current = false;
    setExportPreparationStep(null);

    logInfo('RENDER', '[DIAG-UI] generated export cleared', {
      reason,
      hadExportUrl: true,
    });
  }, [
    clearExport,
    exportUrl,
    isProcessing,
    logInfo,
    setExportPreparationStep,
  ]);

  const pausePreviewBeforeEdit = useCallback((reason: string) => {
    clearGeneratedExport(`edit:${reason}`);

    if (isProcessing || !isPlayingRef.current) return;

    pause();
    isPlayingRef.current = false;

    if (reqIdRef.current !== null) {
      cancelAnimationFrame(reqIdRef.current);
      reqIdRef.current = null;
    }

    logInfo('SYSTEM', 'preview paused before edit', { reason });
  }, [clearGeneratedExport, isProcessing, pause, logInfo]);

  const handleAddCaptionsFromNarration = useCallback(async (id: string) => {
    if (captionGeneratingNarrationIdRef.current !== null) return;
    if (isCaptionLocked) {
      showToast('キャプションのロックを解除してから追加してください。');
      return;
    }
    const clip = narrations.find((item) => item.id === id);
    const { stripDeliveryMarkers } = await import('../utils/narrationDelivery');
    const script = stripDeliveryMarkers(clip?.aiScript ?? '').trim();
    if (!clip || !script) {
      showToast('このナレーションにはキャプションに使える原稿がありません。');
      return;
    }

    const playback = resolveEffectiveAudioClipPlayback(clip, totalDuration);
    if (playback.isDisabled || playback.effectivePlayableDuration <= 0) {
      showToast('ナレーションを動画の再生範囲内へ配置してから追加してください。');
      return;
    }

    const initialPlan = buildNarrationCaptionPlan({
      text: script,
      startTime: playback.startTime,
      endTime: playback.effectiveTimelineEnd,
    });
    if (initialPlan.length === 0) {
      showToast('キャプションカードを作成できませんでした。');
      return;
    }

    captionGeneratingNarrationIdRef.current = id;
    setCaptionGeneratingNarrationId(id);

    let waveformAnalysis: Awaited<ReturnType<typeof analyzeNarrationWaveform>> | null = null;
    let analysisFailed = false;
    try {
      if (appFlavor === 'standard' && initialPlan.length > 1) {
        try {
          waveformAnalysis = await analyzeNarrationWaveform(clip);
        } catch (error) {
          analysisFailed = true;
          logWarn('AUDIO', 'キャプション生成用のナレーション無音解析に失敗', {
            clipId: clip.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // 解析中に削除・再生成・トリミングされた場合は、現在のクリップ状態を基準に作り直す。
      const currentClip = useAudioStore.getState().narrations.find((item) => item.id === id);
      const currentScript = stripDeliveryMarkers(currentClip?.aiScript ?? '').trim();
      if (!currentClip || !currentScript) {
        showToast('対象のナレーションが変更されたため、キャプションを追加しませんでした。');
        return;
      }
      if (useCaptionStore.getState().isLocked) {
        showToast('キャプションのロックを解除してから追加してください。');
        return;
      }
      if (useAudioStore.getState().isNarrationLocked) {
        showToast('ナレーションのロックを解除してから追加してください。');
        return;
      }

      const currentPlayback = resolveEffectiveAudioClipPlayback(
        currentClip,
        useMediaStore.getState().totalDuration,
      );
      if (currentPlayback.isDisabled || currentPlayback.effectivePlayableDuration <= 0) {
        showToast('ナレーションを動画の再生範囲内へ配置してから追加してください。');
        return;
      }

      const basePlan = buildNarrationCaptionPlan({
        text: currentScript,
        startTime: currentPlayback.startTime,
        endTime: currentPlayback.effectiveTimelineEnd,
      });
      if (basePlan.length === 0) {
        showToast('キャプションカードを作成できませんでした。');
        return;
      }

      const sourceUnchanged =
        currentClip.file === clip.file &&
        currentClip.url === clip.url &&
        currentClip.blobUrl === clip.blobUrl &&
        currentClip.duration === clip.duration;
      const silenceCandidates =
        waveformAnalysis && sourceUnchanged
          ? mapNarrationSilencesToTimeline({
              silenceCandidates: waveformAnalysis.splitPoints,
              timelineStart: currentPlayback.startTime,
              trimStart: currentPlayback.trimStart,
              trimEnd: currentPlayback.effectiveTrimEnd,
            })
          : [];
      const snapped = snapNarrationCaptionPlanToSilences({
        plan: basePlan,
        silenceCandidates,
      });

      pausePreviewBeforeEdit('add-narration-captions');
      addCaptions(snapped.plan);
      if (snapped.silentGapCount > 0) {
        showToast(
          `キャプションカードを${snapped.plan.length}枚追加し、${snapped.snappedBoundaryCount}箇所を無音に合わせました。そのうち${snapped.silentGapCount}箇所は中央をキャプションなしにしています。`,
          5000,
        );
      } else if (snapped.snappedBoundaryCount > 0) {
        showToast(
          `キャプションカードを${snapped.plan.length}枚追加し、${snapped.snappedBoundaryCount}箇所を短い無音の中央で切り替えました。`,
          5000,
        );
      } else if (analysisFailed) {
        showToast(
          `波形を解析できなかったため、文字数比でキャプションカードを${snapped.plan.length}枚追加しました。各カードで微調整できます。`,
          5000,
        );
      } else {
        showToast(
          `文字数比を基準にキャプションカードを${snapped.plan.length}枚追加しました。各カードで微調整できます。`,
          5000,
        );
      }
    } finally {
      captionGeneratingNarrationIdRef.current = null;
      setCaptionGeneratingNarrationId(null);
    }
  }, [
    addCaptions,
    appFlavor,
    isCaptionLocked,
    logWarn,
    narrations,
    pausePreviewBeforeEdit,
    showToast,
    totalDuration,
  ]);

  const withPreviewPause = useCallback(<T extends unknown[]>(reason: string, fn: (...args: T) => void) => {
    return (...args: T) => {
      pausePreviewBeforeEdit(reason);
      fn(...args);
    };
  }, [pausePreviewBeforeEdit]);

  /**
   * 再生を止めずに編集を反映する（音量など連続値スライダー用）。
   *
   * 音量スライダーは onChange をドラッグ中ずっと連続発火するため、withPreviewPause だと
   * 1 目盛ごとに pause() + cancelAnimationFrame() が走り、頻繁に動かすほど再生がカクつく。
   * 音量は「再生を聴きながら合わせたい」値なので、一時停止しない方が UX 上も正しい。
   * 生成済みエクスポートの破棄だけは従来どおり行い、出力と編集内容の乖離を防ぐ。
   */
  const withoutPreviewPause = useCallback(<T extends unknown[]>(reason: string, fn: (...args: T) => void) => {
    return (...args: T) => {
      clearGeneratedExport(`edit:${reason}`);
      fn(...args);
    };
  }, [clearGeneratedExport]);

  /**
   * 連続値スライダー版の `onBeforeEdit`。
   *
   * BgmClipList のように子側でストアを直接呼ぶ場合は、`withoutPreviewPause` のラップではなく
   * 「編集直前フック」だけを差し替える。pausePreviewBeforeEdit と同じ位置に置き換わり、
   * 一時停止せずエクスポート破棄だけを行う。
   */
  const clearGeneratedExportForContinuousEdit = useCallback((reason: string) => {
    clearGeneratedExport(`edit:${reason}`);
  }, [clearGeneratedExport]);

  const handleEndrollImageSelect = useCallback((file: File) => {
    const supportedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!supportedMimeTypes.has(file.type)) {
      setError('エンドロールには PNG・JPEG・WebP 画像を選択してください');
      return;
    }
    pausePreviewBeforeEdit('set-endroll-image');
    setEndrollImage(file);
    showToast('エンドロール画像を設定しました');
  }, [pausePreviewBeforeEdit, setEndrollImage, setError, showToast]);

  const handleWatermarkImageSelect = useCallback((file: File) => {
    const supportedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!supportedMimeTypes.has(file.type)) {
      setError('ウォーターマークには PNG・JPEG・WebP 画像を選択してください');
      return;
    }
    pausePreviewBeforeEdit('set-watermark-image');
    setWatermarkImage(file, totalDuration);
    showToast('ウォーターマーク画像を設定しました');
  }, [pausePreviewBeforeEdit, setError, setWatermarkImage, showToast, totalDuration]);

  // 描画が遅延実行されても最新状態を参照できるようにする
  captionsRef.current = captions;
  captionSettingsRef.current = captionSettings;
  videoTitleRef.current = videoTitle;
  watermarkOverlayRef.current = watermarkOverlay;
  // レンダー中に同期する（再描画 effect より先に確実へ反映させるため。
  // useEffect で代入すると effect の実行順に依存し、1 フレーム古い値で描くことがある）
  endrollOverlayRef.current = endrollOverlay;

  const platformCapabilities = useMemo(() => previewRuntime.getPlatformCapabilities(), [previewRuntime]);
  const previewPlatformPolicy = useMemo(
    () => previewRuntime.getPreviewPlatformPolicy(platformCapabilities),
    [platformCapabilities, previewRuntime]
  );

  // BGM クリップ（複数BGM・standard 限定）はナレーションと同形のクリップとして
  // 同じ再生・書き出しパイプライン（loader / engine / export音声ソース）へマージして流す。
  // iOS Safari（apple-safari）ではマージしない（BGM クリップは無視される）。
  const pipelineNarrations = useMemo(() => {
    if (platformCapabilities.isIosSafari || bgmClips.length === 0) return narrations;
    return [...narrations, ...bgmClips];
  }, [bgmClips, narrations, platformCapabilities.isIosSafari]);

  // レガシー単一 BGM を standard フレーバーではクリップ形式へ自動移行する。
  // bgmClips が既にある場合も呼ぶ（保存/復元で併存する iOS 互換ミラー bgm を
  // ストア側で破棄し、1 曲目の二重再生を防ぐ）。
  useEffect(() => {
    if (platformCapabilities.isIosSafari) return;
    if (bgm) {
      migrateLegacyBgmToClips(totalDuration);
    }
  }, [bgm, migrateLegacyBgmToClips, platformCapabilities.isIosSafari, totalDuration]);
  const useAndroidPreviewCacheForPlayback = useMemo(
    () => previewRuntime.shouldUsePreviewCache({
      isAndroid: platformCapabilities.isAndroid,
      isIosSafari: platformCapabilities.isIosSafari,
      isExportMode: false,
      mediaItems,
    }),
    [mediaItems, platformCapabilities.isAndroid, platformCapabilities.isIosSafari, previewRuntime],
  );
  const previewCacheKey = useMemo(
    () => previewRuntime.createPreviewCacheKey({
      mediaItems,
      bgm,
      narrations: pipelineNarrations,
      captions,
      captionSettings,
      // タイトル（Issue #211）もキャッシュ動画へ焼き込まれるためキーに含める
      videoTitle,
      watermarkOverlay,
      canvasWidth,
      canvasHeight,
      fps: 30,
    }),
    [bgm, captionSettings, captions, videoTitle, watermarkOverlay, mediaItems, pipelineNarrations, canvasWidth, canvasHeight, previewRuntime],
  );
  const supportsShowSaveFilePicker = platformCapabilities.supportsShowSaveFilePicker;
  const supportsShowOpenFilePicker = platformCapabilities.supportsShowOpenFilePicker;
  const shouldUseMediaPicker = shouldUseMediaOpenFilePicker(platformCapabilities);
  const refreshSaveHealth = useProjectStore((s) => s.refreshSaveHealth);

  const mediaTimelineRanges = useMemo(() => {
    // ディゾルブ（重ねる）トランジションのオーバーラップを考慮（store の totalDuration と同一規約）
    const ranges: Record<string, { start: number; end: number }> = {};
    for (const range of computeTransitionTimelineRanges(mediaItems)) {
      ranges[range.id] = { start: range.start, end: range.end };
    }
    return ranges;
  }, [mediaItems]);

  // Hooks
  const {
    recorderRef,
    startExport: startWebCodecsExport,
    stopExport: stopWebCodecsExport,
    completeExport: completeWebCodecsExport,
  } = exportRuntime.useExport();
  const {
    startExport: startPreviewCacheExport,
    stopExport: stopPreviewCacheExport,
    completeExport: completePreviewCacheExport,
  } = exportRuntime.useExport();

  useEffect(() => {
    saveRuntime.configureProjectStore();
    void refreshSaveHealth(saveRuntime.getPersistenceHealth);
    const exportLaunchDiagnostics = exportRuntime.getLaunchDiagnostics?.();
    if (exportLaunchDiagnostics) {
      useLogStore.getState().info('SYSTEM', 'エクスポートランタイム診断を記録', exportLaunchDiagnostics);
    }
  }, [exportRuntime, refreshSaveHealth, saveRuntime]);

  useEffect(() => {
    if (!offlineMode || !showAiModal) return;
    setEditingNarrationId(null);
    closeAiModal();
  }, [offlineMode, showAiModal, closeAiModal]);

  // --- 動的キャンバスサイズ: 最初のビデオメディアの解像度に応じて
  // エクスポート用キャンバスサイズを更新する（1920×1080 上限、横向き固定）。
  useEffect(() => {
    const firstVideo = mediaItems.find((item) => item.type === 'video');
    if (!firstVideo) {
      resetCanvasSize();
      return;
    }
    if (firstVideo.sourceWidth && firstVideo.sourceHeight) {
      applyCanvasFromSource(firstVideo.sourceWidth, firstVideo.sourceHeight);
    }
  }, [mediaItems, resetCanvasSize, applyCanvasFromSource]);

  // --- メモリ監視（10秒ごと） ---
  useEffect(() => {
    // 初回実行
    updateMemoryStats();

    const intervalId = setInterval(() => {
      updateMemoryStats();
    }, 10000); // 10秒ごと

    return () => clearInterval(intervalId);
  }, [updateMemoryStats]);

  const cancelPendingPausedSeekWait = useCallback(() => {
    const pendingWait = pendingPausedSeekWaitRef.current;
    if (pendingWait) {
      pendingWait.cleanup();
      pendingPausedSeekWaitRef.current = null;
    }
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }
  }, []);

  const cancelPendingSeekPlaybackPrepare = useCallback(() => {
    if (cancelSeekPlaybackPrepareRef.current) {
      cancelSeekPlaybackPrepareRef.current();
      cancelSeekPlaybackPrepareRef.current = null;
    }
    isSeekPlaybackPreparingRef.current = false;
  }, []);

  const detachGlobalSeekEndListeners = useCallback(() => {
    if (detachGlobalSeekEndListenersRef.current) {
      detachGlobalSeekEndListenersRef.current();
      detachGlobalSeekEndListenersRef.current = null;
    }
  }, []);

  const attachGlobalSeekEndListeners = useCallback(() => {
    if (detachGlobalSeekEndListenersRef.current || typeof window === 'undefined') {
      return;
    }

    const onSeekInteractionEnd = () => {
      if (!isSeekingRef.current) return;
      handleSeekEndCallbackRef.current?.();
    };

    window.addEventListener('pointerup', onSeekInteractionEnd);
    window.addEventListener('pointercancel', onSeekInteractionEnd);
    window.addEventListener('mouseup', onSeekInteractionEnd);
    window.addEventListener('touchend', onSeekInteractionEnd);
    window.addEventListener('touchcancel', onSeekInteractionEnd);
    window.addEventListener('blur', onSeekInteractionEnd);

    detachGlobalSeekEndListenersRef.current = () => {
      window.removeEventListener('pointerup', onSeekInteractionEnd);
      window.removeEventListener('pointercancel', onSeekInteractionEnd);
      window.removeEventListener('mouseup', onSeekInteractionEnd);
      window.removeEventListener('touchend', onSeekInteractionEnd);
      window.removeEventListener('touchcancel', onSeekInteractionEnd);
      window.removeEventListener('blur', onSeekInteractionEnd);
    };
  }, []);

  useEffect(() => {
    return () => {
      detachGlobalSeekEndListeners();
    };
  }, [detachGlobalSeekEndListeners]);

  useEffect(() => {
    return () => {
      cancelPendingSeekPlaybackPrepare();
    };
  }, [cancelPendingSeekPlaybackPrepare]);

  const clearExportUiState = useCallback(() => {
    setProcessing(false);
    setLoading(false);
    setExportPreparationStep(null);
  }, [setExportPreparationStep, setLoading, setProcessing]);

  const clearPreviewCacheEntry = useCallback((options?: { revokeUrl?: boolean }) => {
    const previousUrl = previewCacheEntryRef.current?.url ?? null;
    previewCacheEntryRef.current = null;
    previewCachePlaybackActiveRef.current = false;

    if (previewCacheVideoRef.current) {
      try {
        previewCacheVideoRef.current.pause();
        previewCacheVideoRef.current.removeAttribute('src');
        previewCacheVideoRef.current.load();
      } catch {
        /* ignore */
      }
    }

    if (!options?.revokeUrl || !previousUrl) {
      return;
    }

    try {
      URL.revokeObjectURL(previousUrl);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    previewCacheStatusRef.current = previewCacheStatus;
  }, [previewCacheStatus]);

  useEffect(() => {
    previewCacheKeyRef.current = previewCacheKey;
  }, [previewCacheKey]);

  useEffect(() => {
    const shouldKeepCache = useAndroidPreviewCacheForPlayback;
    const currentEntry = previewCacheEntryRef.current;
    const shouldInvalidate =
      !shouldKeepCache
      || (currentEntry !== null && currentEntry.cacheKey !== previewCacheKey);

    if (!shouldInvalidate) {
      return;
    }

    const wasPreparing = previewCacheStatusRef.current === 'preparing';
    const hadReadyCache = previewCacheStatusRef.current === 'ready' && currentEntry !== null;

    previewCacheGenerationRef.current += 1;
    previewCacheStatusRef.current = 'idle';
    setPreviewCacheStatus('idle');
    setPreviewLoadingLabel(undefined);
    clearPreviewCacheEntry({ revokeUrl: true });

    if (wasPreparing) {
      stopPreviewCacheExport({ silent: true, reason: 'superseded' });
    }

    if (hadReadyCache || wasPreparing) {
      logInfo('RENDER', 'preview.cache.invalidated', {
        reason: shouldKeepCache ? 'timeline-updated' : 'android-preview-cache-disabled',
        fallback: 'live-element-preview',
      });
    }
  }, [clearPreviewCacheEntry, logInfo, previewCacheKey, stopPreviewCacheExport, useAndroidPreviewCacheForPlayback]);

  useEffect(() => {
    return () => {
      clearPreviewCacheEntry({ revokeUrl: true });
    };
  }, [clearPreviewCacheEntry]);

  const handleExportCompleteUi = useCallback(() => {
    logInfo('RENDER', '[DIAG-UI] export complete callback received', {
      urlPresent: true,
      ext: exportExt,
    });
    exportCompletedRef.current = true;
    exportFinalizingUiRef.current = false;
    exportFinalizeWarningShownRef.current = false;
    logInfo('RENDER', '[DIAG-UI] export url committed to UI', {
      urlPresent: true,
      ext: exportExt,
    });
    clearExportUiState();
  }, [clearExportUiState, exportExt, logInfo]);

  useEffect(() => {
    const wasProcessing = wasExportProcessingRef.current;
    wasExportProcessingRef.current = isProcessing;

    if (exportUrl) {
      if (!exportCompletedRef.current) {
        handleExportCompleteUi();
      } else {
        exportFinalizingUiRef.current = false;
        exportFinalizeWarningShownRef.current = false;
        clearExportUiState();
      }
      return;
    }

    if (wasProcessing && !isProcessing) {
      exportFinalizingUiRef.current = false;
      exportFinalizeWarningShownRef.current = false;
      clearExportUiState();
    }
  }, [clearExportUiState, exportUrl, handleExportCompleteUi, isProcessing]);

  useEffect(() => {
    const isFinalizing =
      isProcessing
      && totalDuration > 0
      && currentTime >= totalDuration - EXPORT_FINALIZING_EPSILON_SEC
      && !exportUrl;
    exportFinalizingUiRef.current = isFinalizing;
    if (!isFinalizing) {
      exportFinalizeWarningShownRef.current = false;
    }
  }, [currentTime, exportUrl, isProcessing, totalDuration]);

  // --- Audio Context ---
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      masterDestRef.current = ctx.createMediaStreamDestination();
    }
    return audioCtxRef.current;
  }, []);

  const { resetInactiveVideos } = previewRuntime.useInactiveVideoManager({
    mediaItemsRef,
    mediaElementsRef,
    sourceNodesRef,
    activeVideoIdRef,
    previewPlatformPolicy,
  });

  const {
    detachAudioNode,
    ensureAudioNodeForElement,
    preparePreviewAudioNodesForTime,
    preparePreviewAudioNodesForUpcomingVideos,
    primePreviewAudioOnlyTracksAtTime,
    handleMediaRefAssign,
  } = previewRuntime.usePreviewAudioSession({
    mediaItemsRef,
    bgmRef,
    narrationsRef,
    totalDurationRef,
    currentTimeRef,
    mediaElementsRef,
    audioCtxRef,
    sourceNodesRef,
    gainNodesRef,
    sourceElementsRef,
    pendingAudioDetachTimersRef,
    masterDestRef,
    audioRoutingModeRef,
    previewAudioRouteRefreshInFlightRef,
    lastIosSafariAudioLogRef,
    requestPreviewAudioRouteRefreshRef,
    primePreviewAudioOnlyTracksAtTimeRef,
    previewPlaybackAttemptRef,
    isPlayingRef,
    isSeekingRef,
    previewPlatformPolicy,
    isIosSafari: platformCapabilities.isIosSafari,
    bgm,
    narrations: pipelineNarrations,
    isProcessing,
    getAudioContext,
    logInfo,
    logWarn,
  });

  // Issue #209: export 後は共有 <video> を DOM remount して decoder を作り直す。
  // 同一要素の hard src 再設定は previewlog2 で ready 直後に readyState1+seeking 再 wedge した。
  // flavors への import は ESLint 境界違反のため待ちロジックはここに閉じる（pure helper は engine 側テスト用）。
  const mediaRemountGenerationRef = useRef(0);
  const remountSharedPreviewMedia = useCallback(async (): Promise<'ready' | 'timeout' | 'cancelled'> => {
    const generation = ++mediaRemountGenerationRef.current;
    const timeoutMs = 5000;
    const pollMs = 40;
    const remountStartedAt = performance.now();
    const releasedMedia = releaseSharedMediaElementsForRemount(mediaElementsRef.current);

    // 待機処理から古い DOM 要素を不可視にしてから reloadKey を更新する。
    // これがないと React の commit 前に旧要素の readyState を見て ready を返してしまう。
    mediaElementsRef.current = releasedMedia.nextElements;

    // MediaElementSource は要素に 1 回だけ。古い要素のノードを破棄してから DOM を作り直す。
    Object.keys(sourceNodesRef.current).forEach((id) => {
      try {
        detachAudioNode(id);
      } catch {
        /* ignore */
      }
    });
    Object.keys(pendingAudioDetachTimersRef.current).forEach((id) => {
      clearTimeout(pendingAudioDetachTimersRef.current[id]);
      delete pendingAudioDetachTimersRef.current[id];
    });
    sourceElementsRef.current = {};

    setReloadKey((k) => k + 1);

    const waitUntil = Date.now() + timeoutMs;
    let result: 'ready' | 'timeout' | 'cancelled' = 'timeout';
    while (Date.now() < waitUntil) {
      if (mediaRemountGenerationRef.current !== generation) {
        result = 'cancelled';
        break;
      }
      const videos = mediaItemsRef.current.filter((item) => item.type === 'video');
      if (videos.length === 0) {
        result = 'ready';
        break;
      }
      let allReady = true;
      for (const item of videos) {
        const el = mediaElementsRef.current[item.id] as HTMLVideoElement | undefined;
        if (!el || el.readyState < 1 || el.error) {
          allReady = false;
          break;
        }
      }
      if (allReady) {
        for (const item of videos) {
          const el = mediaElementsRef.current[item.id] as HTMLVideoElement | undefined;
          if (!el) continue;
          const target = Number.isFinite(item.trimStart) ? Math.max(0, item.trimStart) : 0;
          try {
            if (Math.abs(el.currentTime - target) > 0.05) {
              el.currentTime = target;
            }
          } catch {
            /* ignore */
          }
        }
        result = 'ready';
        break;
      }
      await new Promise<void>((r) => setTimeout(r, pollMs));
    }

    logInfo('RENDER', 'preview.postExport.mediaRemount.wait', {
      result,
      generation,
      videoCount: mediaItemsRef.current.filter((item) => item.type === 'video').length,
      previousElementCount: releasedMedia.previousElementCount,
      pausedMediaCount: releasedMedia.pausedMediaCount,
      durationMs: Math.round(performance.now() - remountStartedAt),
    });
    return result;
  }, [detachAudioNode, logInfo]);

  const {
    handleMediaElementLoaded,
    handleSeeked,
    handleVideoLoadedData,
    renderFrame,
    stopAll,
    loop,
    startEngine,
  } = previewRuntime.usePreviewEngine({
    captions,
    captionSettings,
    videoTitle,
    watermarkOverlay,
    mediaItemsRef,
    bgmRef,
    narrationsRef,
    captionsRef,
    captionSettingsRef,
    videoTitleRef,
    watermarkOverlayRef,
    watermarkImageRef,
    endrollOverlayRef,
    endrollImageRef,
    clipsDurationRef,
    captionFreeSnapshotRef,
    totalDurationRef,
    currentTimeRef,
    canvasRef,
    mediaElementsRef,
    audioCtxRef,
    sourceNodesRef,
    gainNodesRef,
    masterDestRef,
    audioRoutingModeRef,
    reqIdRef,
    startTimeRef,
    audioResumeWaitFramesRef,
    recorderRef,
    loopIdRef,
    isPlayingRef,
    isSeekingRef,
    isSeekPlaybackPreparingRef,
    activeVideoIdRef,
    videoRecoveryAttemptsRef,
    exportPlayFailedRef,
    exportFallbackSeekAtRef,
    seekingVideosRef,
    pendingSeekRef,
    wasPlayingBeforeSeekRef,
    pendingSeekTimeoutRef,
    previewPlaybackAttemptRef,
    requestPreviewAudioRouteRefreshRef,
    primePreviewAudioOnlyTracksAtTimeRef,
    endFinalizedRef,
    previewCacheEnabled: useAndroidPreviewCacheForPlayback,
    previewCacheKeyRef,
    previewCacheStatusRef,
    previewCacheEntryRef,
    previewCacheVideoRef,
    previewCacheGenerationRef,
    previewCachePlaybackActiveRef,
    previewCacheHasBuiltOnceRef,
    setPreviewCacheStatus,
    setPreviewLoadingLabel,
    previewPlatformPolicy,
    platformCapabilities,
    setVideoDuration,
    setCurrentTime,
    setProcessing,
    setPreviewPlaying,
    setLoading,
    setExportPreparationStep,
    setExportUrl,
    setExportExt,
    clearExport,
    setError,
    play,
    pause,
    getAudioContext,
    cancelPendingPausedSeekWait,
    cancelPendingSeekPlaybackPrepare,
    detachGlobalSeekEndListeners,
    ensureAudioNodeForElement,
    detachAudioNode,
    preparePreviewAudioNodesForTime,
    preparePreviewAudioNodesForUpcomingVideos,
    primePreviewAudioOnlyTracksAtTime,
    resetInactiveVideos,
    startWebCodecsExport,
    stopWebCodecsExport,
    completeWebCodecsExport,
    startPreviewCacheExport,
    stopPreviewCacheExport,
    completePreviewCacheExport,
    logInfo,
    logWarn,
    logDebug,
    remountSharedPreviewMedia,
  });

  // --- 状態同期: Zustandの状態をRefに同期 ---
  // 目的: renderFrame等の非同期処理で最新の状態を参照できるようにする
  useEffect(() => {
    mediaItemsRef.current = mediaItems;
    totalDurationRef.current = totalDuration;
    // クリップ配置用（エンドロールを含まない）。エンドロール無効時は totalDuration と同値
    clipsDurationRef.current = clipsDuration;
  }, [mediaItems, totalDuration, clipsDuration]);

  // --- 再描画トリガー: メディア構成変更時のキャンバス更新 ---
  // 目的: メディアの追加・削除・リロード時にプレビューを更新
  // 補足: 削除で空になった場合も最後のフレームを残さないよう必ず再描画する
  useEffect(() => {
    if (isPlaying || isProcessing) return;

    const hasMedia = mediaItems.length > 0;
    const targetTime = hasMedia
      ? Math.max(0, Math.min(currentTimeRef.current, totalDuration))
      : 0;

    if (Math.abs(currentTimeRef.current - targetTime) > 0.001) {
      currentTimeRef.current = targetTime;
      setCurrentTime(targetTime);
    }

    // メディアがある場合のみ少し待って描画（要素準備待ち）
    const timeoutId = setTimeout(() => {
      renderFrame(targetTime, false);
    }, hasMedia ? 100 : 0);

    return () => clearTimeout(timeoutId);
  }, [mediaItems.length, totalDuration, reloadKey, isPlaying, isProcessing, renderFrame, setCurrentTime]);

  // --- 自動ポスター: 指定タイムライン時刻のアクティブメディア要素を引く ---
  // 並び替え直後は mediaItems の順序が変わるため、id ではなく時刻から解決する。
  const resolveActivePosterMediaElement = useCallback(
    (timelineTime: number): HTMLVideoElement | HTMLImageElement | null => {
      const items = mediaItemsRef.current;
      if (items.length === 0) return null;
      const activeItem =
        items.find((item) => {
          const range = mediaTimelineRanges[item.id];
          if (!range) return false;
          return timelineTime >= range.start && timelineTime < range.end;
        })
        // 範囲から外れた場合（総尺境界など）は先頭クリップを対象にする
        ?? items[0];
      const element = mediaElementsRef.current[activeItem.id];
      if (!element || element instanceof HTMLAudioElement) return null;
      return element;
    },
    [mediaTimelineRanges],
  );

  // --- 自動ポスター: 要素が canvas へ描画可能かを判定する ---
  // preview engine の描画条件（readyState >= 2 && !seeking）と揃える。
  const isPosterMediaElementDrawable = useCallback(
    (element: HTMLVideoElement | HTMLImageElement): boolean => {
      if (element instanceof HTMLImageElement) {
        return element.complete && element.naturalWidth > 0;
      }
      return (
        element.readyState >= 2
        && !element.seeking
        && element.videoWidth > 0
        && element.videoHeight > 0
      );
    },
    [],
  );

  // --- 自動プロジェクトポスター: 先頭付近の内容が変わったら再キャプチャ ---
  // 目的: 並び替え・追加・削除・尺/トリム変更で先頭付近の映像が変わっても、
  //       自動モードなら書き出し用 dataUrl と UI を新しい先頭付近へ追従させる。
  // 注意: 手動モードは触らない。再生/書き出し中はキーを進めず、停止後に再試行する。
  //       キャプチャはシーク完了を待ち、黒を掴んだら撮り直す（黒サムネ対策）。
  useEffect(() => {
    if (!uiCapabilities.supportsProjectPoster) {
      autoProjectPosterContentKeyRef.current = null;
      return;
    }
    if (projectPosterMode !== 'auto') {
      autoProjectPosterContentKeyRef.current = null;
      return;
    }

    const contentKey = buildAutoProjectPosterContentKey(
      mediaItems,
      totalDuration,
      aspectRatio,
    );
    if (contentKey === autoProjectPosterContentKeyRef.current) return;
    if (isPlaying || isProcessing) return;
    // プレビューがエンドロール区間にあるときは撮らない。
    // キャプチャは「先頭付近を本物の canvas へ描いて撮り、元の位置へ戻す」方式のため、
    // エンドロール表示中にサイズ等を変えると、その一瞬だけクリップの映像が見えてしまう。
    // ここで見送っても contentKey を進めないので、本編へ戻った時点で撮り直される。
    if (isPreviewInEndroll) return;

    autoProjectPosterContentKeyRef.current = contentKey;
    const captureGeneration = ++projectPosterCaptureGenerationRef.current;

    if (mediaItems.length === 0 || totalDuration <= 0) {
      resetProjectPosterToAuto(0, null, aspectRatio);
      return;
    }

    const previousTime = currentTimeRef.current;
    // 表示上の自動時刻は先頭付近だが、キャプチャは preview engine の
    // 先頭強制黒クリア帯（time <= 0.05）の外で撮る（黒画像対策）。
    const autoTime = resolveAutoProjectPosterCaptureTime(totalDuration);
    // タイムライン時刻だけ先に合わせ、画像はキャプチャ完了まで旧値を残してチラつきを抑える
    resetProjectPosterToAuto(
      totalDuration,
      useMediaStore.getState().projectPosterDataUrl,
      aspectRatio,
    );

    let disposed = false;
    const timeoutIds: number[] = [];
    const rafIds: number[] = [];

    const isStale = () =>
      disposed
      || projectPosterCaptureGenerationRef.current !== captureGeneration
      || useMediaStore.getState().projectPosterMode !== 'auto';

    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        timeoutIds.push(window.setTimeout(resolve, ms));
      });

    /**
     * 先頭付近のアクティブ動画がシーク完了して描画可能になるまで待つ。
     * rAF 1 回だけでは seek が終わらず、preview engine の描画条件
     * （readyState >= 2 && !seeking）を満たさないまま黒を撮っていた。
     */
    const waitForActiveMediaDrawable = async (): Promise<void> => {
      const deadline = Date.now() + AUTO_POSTER_MEDIA_SETTLE_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (isStale()) return;
        const element = resolveActivePosterMediaElement(autoTime);
        // 対象要素を特定できない場合は待っても状況が変わらないので抜ける
        if (!element) return;
        if (isPosterMediaElementDrawable(element)) return;
        await delay(AUTO_POSTER_MEDIA_SETTLE_POLL_MS);
      }
    };

    /**
     * サムネ用フレームを撮る。
     *
     * **同期ブロック内で「撮影用フレームを描く → 読み取る → 表示中フレームへ描き戻す」
     * まで完了させる**のが要点。間に await を挟むとブラウザがそこで描画してしまい、
     * 拡大・縮小などの調整中に「別の時刻のフレーム」が一瞬見えてチラつく。
     * rAF コールバック内で完結させれば、ユーザーには一度も表示されない。
     */
    const captureOnce = async (): Promise<string | null> => {
      if (isStale()) return null;
      // 描画・読み取り・復帰を 1 つの rAF 内で行い、途中経過を絶対に見せない
      const dataUrl = await new Promise<string | null>((resolve) => {
        rafIds.push(requestAnimationFrame(() => {
          if (isStale()) {
            resolve(null);
            return;
          }
          const canvas = canvasRef.current;
          if (!canvas) {
            resolve(null);
            return;
          }
          renderFrame(autoTime, false);
          // 黒（＝シーク未完了・描画スキップ）を掴んだら呼び出し元で撮り直す
          const captured = isCanvasEffectivelyBlank(canvas)
            ? null
            : createPosterDataUrlFromCanvas(canvas);
          // 同じフレーム内で表示中の位置へ戻す（ここまで画面には反映されない）
          renderFrame(previousTime, false);
          resolve(captured);
        }));
      });
      return dataUrl;
    };

    const runCapture = async () => {
      await delay(AUTO_POSTER_CAPTURE_INITIAL_DELAY_MS);
      if (isStale()) return;

      // 対象時刻の映像要素へシークを促す。ここで描いた結果は表示させたくないので、
      // 同じ同期ブロック内で必ず表示中の位置へ戻す（await を挟むと画面に出てしまう）。
      renderFrame(autoTime, false);
      renderFrame(previousTime, false);
      await waitForActiveMediaDrawable();
      if (isStale()) return;

      let dataUrl: string | null = null;
      for (let attempt = 0; attempt < AUTO_POSTER_CAPTURE_MAX_ATTEMPTS; attempt++) {
        dataUrl = await captureOnce();
        if (dataUrl || isStale()) break;
        // 黒を掴んだ: 少し待って描画・シークの落ち着きを待ち再試行
        await delay(AUTO_POSTER_CAPTURE_RETRY_DELAY_MS);
        await waitForActiveMediaDrawable();
      }

      if (isStale()) return;

      // 全試行で黒だった場合は既存画像を維持する（黒で上書きしない）。
      if (dataUrl) {
        setProjectPosterDataUrl(dataUrl, aspectRatio);
      } else {
        logWarn('MEDIA', '自動サムネイルのキャプチャが黒フレームのため既存画像を維持', {
          autoTime,
          totalDuration,
          attempts: AUTO_POSTER_CAPTURE_MAX_ATTEMPTS,
        });
      }

      // プレビュー位置を動かさない（自動更新は裏で先頭付近だけ撮る）。
      // canvas 自体は captureOnce 内で表示中フレームへ戻し済みだが、
      // 状態（currentTime）の整合はここで最終的に担保する。
      if (Math.abs(previousTime - autoTime) > 0.001) {
        currentTimeRef.current = previousTime;
        setCurrentTime(previousTime);
        renderFrame(previousTime, false);
      }
    };

    void runCapture();

    return () => {
      disposed = true;
      timeoutIds.forEach((id) => window.clearTimeout(id));
      rafIds.forEach((id) => cancelAnimationFrame(id));
    };
  }, [
    uiCapabilities.supportsProjectPoster,
    projectPosterMode,
    mediaItems,
    totalDuration,
    aspectRatio,
    isPlaying,
    isProcessing,
    // エンドロール区間を抜けたら、見送ったキャプチャを撮り直す
    isPreviewInEndroll,
    renderFrame,
    resetProjectPosterToAuto,
    setProjectPosterDataUrl,
    setCurrentTime,
    resolveActivePosterMediaElement,
    isPosterMediaElementDrawable,
    logWarn,
  ]);

  // --- BGM状態の同期 ---
  // 目的: BGMトラックの最新状態をRefに保持
  useEffect(() => {
    bgmRef.current = bgm;
  }, [bgm]);

  // --- ナレーション状態の同期 ---
  // 目的: ナレーショントラックの最新状態をRefに保持
  useEffect(() => {
    narrationsRef.current = pipelineNarrations;
  }, [pipelineNarrations]);

  // --- コンポーネントアンマウント時のクリーンアップ ---
  // 目的: メモリリークを防止し、リソースを適切に解放
  useEffect(() => {
    return () => {
      // Cancel animation frame
      if (reqIdRef.current) {
        cancelAnimationFrame(reqIdRef.current);
        reqIdRef.current = null;
      }

      // Stop and close AudioContext
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch (e) {
          console.error('Error closing AudioContext:', e);
        }
        audioCtxRef.current = null;
      }

      // Stop MediaRecorder
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch (e) {
          /* ignore */
        }
        recorderRef.current = null;
      }

      // Pause all media elements
      Object.values(mediaElementsRef.current).forEach((el) => {
        if (el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO')) {
          try {
            (el as HTMLMediaElement).pause();
          } catch (e) {
            /* ignore */
          }
        }
      });

      Object.values(pendingAudioDetachTimersRef.current).forEach((timer) => {
        clearTimeout(timer);
      });
      pendingAudioDetachTimersRef.current = {};
      sourceElementsRef.current = {};
    };
  }, []);

  previewRuntime.usePreviewVisibilityLifecycle({
    mediaElementsRef,
    mediaItemsRef,
    bgmRef,
    narrationsRef,
    activeVideoIdRef,
    currentTimeRef,
    totalDurationRef,
    hiddenStartedAtRef,
    needsResyncAfterVisibilityRef,
    startTimeRef,
    audioResumeWaitFramesRef,
    lastVisibilityRefreshAtRef,
    isPlayingRef,
    isSeekingRef,
    audioCtxRef,
    isProcessing,
    previewPlatformPolicy,
    cancelPendingSeekPlaybackPrepare,
    cancelPendingPausedSeekWait,
    renderFrame,
    renderPausedPreviewFrameAtTimeRef,
    pause,
    logInfo,
    logWarn,
  });

  // --- Gemini API Helpers ---
  const pcmToWav = useCallback((pcmData: ArrayBuffer, sampleRate: number): ArrayBuffer => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = pcmData.byteLength;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (v: DataView, offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        v.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    const pcmView = new Uint8Array(pcmData);
    const wavView = new Uint8Array(buffer, 44);
    wavView.set(pcmView);

    return buffer;
  }, []);

  const generateScript = useCallback(async () => {
    const trimmedPrompt = aiPrompt.trim();
    if (!trimmedPrompt) return;
    if (offlineMode) return;
    const apiKey = getApiKey();
    if (!apiKey) {
      setError('APIキーが設定されていません。右上の歯車アイコンから設定してください。');
      return;
    }
    setAiLoading(true);
    try {
      const modelsToTry = [GEMINI_SCRIPT_MODEL, ...GEMINI_SCRIPT_FALLBACK_MODELS]
        .filter((model, idx, arr) => arr.indexOf(model) === idx);
      const lengthTargetByMode: Record<NarrationScriptLength, string> = {
        short: '約5秒（20〜35文字）',
        medium: '約10秒（35〜60文字）',
        long: '約20秒（100〜140文字）',
      };
      const selectedLengthTarget = lengthTargetByMode[aiScriptLength];

      const systemInstruction = [
        'あなたは日本語の動画ナレーション原稿を作るプロです。',
        '出力は読み上げる本文のみ、1段落、1つだけ返してください。',
        '挨拶・見出し・箇条書き・注釈・引用符・絵文字は禁止です。',
        'テーマに沿って、短尺動画で使える自然な口語文にしてください。',
        '選択された長さ（短め=約5秒 / 中くらい=約10秒 / 長め=約20秒）を優先してください。',
        `文字数は${selectedLengthTarget}を目安にし、聞き取りやすい短文中心にしてください。`,
      ].join('\n');

      const userPrompt = [
        `テーマ: ${trimmedPrompt}`,
        '用途: 短い動画のナレーション',
        `希望する長さ: ${selectedLengthTarget}`,
        '出力: ナレーション本文のみ',
      ].join('\n');

      type ScriptPart = { text?: string };
      type ScriptCandidate = { content?: { parts?: ScriptPart[] } };
      type ScriptResponse = { candidates?: ScriptCandidate[] };

      const normalizeNarrationScript = (rawText: string): string => {
        const withoutFence = rawText
          .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, ''));
        const flattened = withoutFence
          .replace(/\r?\n+/g, ' ')
          .replace(/^(原稿案|ナレーション|台本)\s*[:：]\s*/i, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        return flattened.replace(/^[「『"']+|[」』"']+$/g, '').trim();
      };

      let lastErrorMessage = 'スクリプトの生成に失敗しました';
      for (let i = 0; i < modelsToTry.length; i++) {
        const model = modelsToTry[i];
        const hasNextModel = i < modelsToTry.length - 1;

        const response = await fetch(`${GEMINI_API_BASE_URL}/${model}:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          referrerPolicy: 'no-referrer',
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            contents: [
              {
                parts: [{ text: userPrompt }],
              },
            ],
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({} as { error?: { message?: string } }));
          const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
          lastErrorMessage = errorMessage;
          const isModelUnavailable = /no longer available|not found|404|model.+(available|found)/i.test(errorMessage);
          if (hasNextModel && isModelUnavailable) {
            console.warn('Script model unavailable. Retrying with fallback model.', { model, errorMessage });
            continue;
          }
          throw new Error(errorMessage);
        }

        const data = (await response.json()) as ScriptResponse;
        const rawText = (data.candidates ?? [])
          .flatMap((candidate) => candidate.content?.parts ?? [])
          .map((part) => (typeof part.text === 'string' ? part.text : ''))
          .join('\n')
          .trim();
        const script = normalizeNarrationScript(rawText);

        if (script) {
          setAiScript(script);
          if (model !== GEMINI_SCRIPT_MODEL) {
            showToast('スクリプト生成モデルを自動切替して生成しました。');
          }
          return;
        }

        lastErrorMessage = 'スクリプトの生成結果が空です';
        if (hasNextModel) {
          console.warn('Script text was empty. Retrying with fallback model.', { model });
          continue;
        }
      }

      throw new Error(lastErrorMessage);
    } catch (e) {
      console.error('Script generation error:', e);
      if (e instanceof TypeError && e.message.includes('fetch')) {
        // ネットワーク系エラーは下の共通ハンドリングへフォールスルー
      } else if (e instanceof Error) {
        // Quota/Limitエラーの判定
        const lowerMsg = e.message.toLowerCase();
        if (lowerMsg.includes('quota') || lowerMsg.includes('limit') || lowerMsg.includes('429')) {
          setError('スクリプト生成のリミットに達しました。しばらく待ってから再試行してください。');
        } else {
          setError(`スクリプト生成エラー: ${e.message}`);
        }
      } else {
        setError('スクリプト生成に失敗しました');
      }
    } finally {
      setAiLoading(false);
    }
  }, [aiPrompt, aiScriptLength, offlineMode, setAiLoading, setAiScript, setError, showToast]);

  const generateSpeech = useCallback(async () => {
    if (!aiScript) return;
    if (offlineMode) return;
    if (aiSpeechRequestInFlightRef.current) return;
    const apiKey = getApiKey();
    if (!apiKey) {
      setError('APIキーが設定されていません。右上の歯車アイコンから設定してください。');
      return;
    }
    aiSpeechRequestInFlightRef.current = true;
    setAiLoading(true);
    let pendingGeneratedUrl: string | null = null;
    try {
      // 場面 + 区間語り口調を 1 本の TTS プロンプトへ（原稿は単一テキスト＋マーカー）
      const { buildNarrationTtsPrompt, stripDeliveryMarkers } = await import('../utils/narrationDelivery');
      const sceneText = (useUIStore.getState().aiNarrationScene || '').trim();
      // 旧「声の調子」は場面未設定時のフォールバックとして残す
      const legacyStyle = aiVoiceStyle.trim();
      const effectiveScene = sceneText || legacyStyle;
      const delivery = buildNarrationTtsPrompt({
        scene: effectiveScene,
        script: aiScript,
      });
      const plainText = delivery.plainText || stripDeliveryMarkers(aiScript).trim();
      if (!plainText) {
        setError('読み上げる原稿が空です。語り口調の記号だけの状態になっていないか確認してください。');
        return;
      }

      const styledPrompt = delivery.prompt;
      const plainPrompt = `Say the following Japanese text:\n${plainText}`;
      const strictPrompt = `TTS the following text exactly as written. Do not add any extra words.\n${plainText}`;

      const requestTts = (text: string) => fetchGeminiWithRetry(
        () => fetch(`${GEMINI_API_BASE_URL}/${GEMINI_TTS_MODEL}:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          referrerPolicy: 'no-referrer',
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: aiVoice },
                },
              },
            },
          }),
        }), {
          onRetry: ({ retryNumber, delayMs, status, error }) => {
            if (retryNumber === 1) {
              showToast('音声生成APIの一時的な混雑・通信失敗を検知したため、自動で再試行しています。', 5000);
            }
            logWarn('AUDIO', 'AI音声合成を自動再試行', {
              retryNumber,
              delayMs,
              status,
              error: error instanceof Error ? error.message : undefined,
              editingNarration: Boolean(editingNarrationId),
            });
          },
        },
      );

      const readTtsErrorMessage = async (res: Response): Promise<string> => {
        const errorData = await res.json().catch(() => ({} as { error?: { message?: string } }));
        return errorData.error?.message || `HTTP ${res.status}: ${res.statusText}`;
      };

      type TtsInlineData = { data?: string; mimeType?: string };
      type TtsPart = { text?: string; inlineData?: TtsInlineData; inline_data?: TtsInlineData };
      type TtsCandidate = { finishReason?: string; content?: { parts?: TtsPart[] } };
      type TtsResponse = { candidates?: TtsCandidate[]; promptFeedback?: { blockReason?: string } };
      type TtsAttempt = {
        label: 'style' | 'plain' | 'strict';
        prompt: string;
        usedStyle: boolean;
      };

      const parseTtsResponse = (data: TtsResponse) => {
        const candidates = Array.isArray(data.candidates) ? data.candidates : [];
        const parts = candidates.flatMap((candidate) => (Array.isArray(candidate.content?.parts) ? candidate.content.parts : []));
        const inlineData = parts
          .map((part) => part.inlineData ?? part.inline_data)
          .find((candidateInlineData): candidateInlineData is TtsInlineData & { data: string } =>
            typeof candidateInlineData?.data === 'string' && candidateInlineData.data.length > 0
          );
        const hasTextPart = parts.some((part) => typeof part.text === 'string' && part.text.trim().length > 0);
        const finishReason = candidates.map((candidate) => candidate.finishReason).find((reason) => !!reason);
        return {
          inlineData,
          hasTextPart,
          finishReason,
          blockReason: data.promptFeedback?.blockReason,
          partsCount: parts.length,
        };
      };

      const attempts: TtsAttempt[] = delivery.hasDeliveryControl
        ? [
            { label: 'style', prompt: styledPrompt, usedStyle: true },
            { label: 'plain', prompt: plainPrompt, usedStyle: false },
          ]
        : [
            { label: 'plain', prompt: plainPrompt, usedStyle: false },
            { label: 'strict', prompt: strictPrompt, usedStyle: false },
          ];

      let resolvedInlineData: (TtsInlineData & { data: string }) | null = null;
      let resolvedAttempt: TtsAttempt | null = null;
      let lastFinishReason: string | undefined;
      let lastBlockReason: string | undefined;
      let lastHttpError: string | undefined;

      for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i];
        const hasNext = i < attempts.length - 1;
        const response = await requestTts(attempt.prompt);

        if (!response.ok) {
          const errorMessage = await readTtsErrorMessage(response);
          lastHttpError = errorMessage;
          const retryableHttpError = /model tried to generate text|only be used for tts|response modalities/i.test(errorMessage);
          if (hasNext && retryableHttpError) {
            console.warn('TTS attempt failed and will retry with fallback prompt/model.', {
              label: attempt.label,
              errorMessage,
            });
            continue;
          }
          throw new Error(errorMessage);
        }

        const data = (await response.json()) as TtsResponse;
        const parsed = parseTtsResponse(data);
        if (parsed.inlineData) {
          resolvedInlineData = parsed.inlineData;
          resolvedAttempt = attempt;
          lastFinishReason = parsed.finishReason;
          lastBlockReason = parsed.blockReason;
          break;
        }

        lastFinishReason = parsed.finishReason;
        lastBlockReason = parsed.blockReason;
        if (hasNext) {
          console.warn('TTS attempt returned no inline audio data. Retrying with fallback.', {
            label: attempt.label,
            finishReason: parsed.finishReason,
            blockReason: parsed.blockReason,
            hasTextPart: parsed.hasTextPart,
            partsCount: parsed.partsCount,
          });
          continue;
        }
      }

      if (!resolvedInlineData) {
        if (lastHttpError) {
          throw new Error(lastHttpError);
        }
        if (lastBlockReason) {
          throw new Error(`音声生成がブロックされました: ${lastBlockReason}`);
        }
        const reasonSuffix = lastFinishReason ? ` (${lastFinishReason})` : '';
        throw new Error(`音声データを取得できませんでした${reasonSuffix}`);
      }

      if (delivery.hasDeliveryControl && resolvedAttempt && !resolvedAttempt.usedStyle) {
        showToast('場面・語り口調の指定は適用できなかったため、通常の読み上げで生成しました。', 5000);
      }

      const binaryString = window.atob(resolvedInlineData.data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const normalizedMimeType = resolvedInlineData.mimeType?.toLowerCase() || '';
      const payloadIsWav = normalizedMimeType.includes('audio/wav') || normalizedMimeType.includes('audio/x-wav');
      const wavBuffer = payloadIsWav ? bytes.buffer : pcmToWav(bytes.buffer, TTS_SAMPLE_RATE);
      const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
      const blobUrl = URL.createObjectURL(wavBlob);
      pendingGeneratedUrl = blobUrl;

      const audio = new Audio(blobUrl);
      audio.preload = 'metadata';
      const duration = await new Promise<number>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          audio.onloadedmetadata = null;
          audio.onerror = null;
          reject(new Error('生成された音声のメタデータ読み込みがタイムアウトしました'));
        }, 15000);

        audio.onloadedmetadata = () => {
          window.clearTimeout(timeoutId);
          audio.onerror = null;
          resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
        };
        audio.onerror = () => {
          window.clearTimeout(timeoutId);
          audio.onloadedmetadata = null;
          reject(new Error('生成された音声の読み込みに失敗しました'));
        };
      });

      const voiceLabel = VOICE_OPTIONS.find((v) => v.id === aiVoice)?.label || 'AI音声';
      const currentNarrationName = editingNarrationId
        ? narrations.find((item) => item.id === editingNarrationId)?.file.name
        : null;
      const narrationFile = new File(
        [wavBlob],
        resolveAiNarrationFileName({
          currentName: currentNarrationName,
          voiceLabel,
        }),
        { type: 'audio/wav' },
      );
      const sceneForSave = useUIStore.getState().aiNarrationScene || '';
      if (editingNarrationId) {
        replaceNarrationAudio(editingNarrationId, {
          file: narrationFile,
          url: blobUrl,
          blobUrl,
          duration,
          sourceType: 'ai',
          isAiEditable: true,
          aiScript,
          aiVoice,
          aiVoiceStyle,
          aiNarrationScene: sceneForSave,
        });
        updateNarrationMeta(editingNarrationId, {
          aiScript,
          aiVoice,
          aiVoiceStyle,
          aiNarrationScene: sceneForSave,
        });
        setEditingNarrationId(null);
      } else {
        addNarration(
          createNarrationClip({
            file: narrationFile,
            url: blobUrl,
            blobUrl,
            duration,
            startTime: currentTimeRef.current,
            sourceType: 'ai',
            aiScript,
            aiVoice,
            aiVoiceStyle,
            aiNarrationScene: sceneForSave,
          })
        );
      }
      pendingGeneratedUrl = null;
      closeAiModal();
      clearError();
    } catch (e) {
      if (pendingGeneratedUrl) {
        URL.revokeObjectURL(pendingGeneratedUrl);
      }
      console.error('Speech generation error:', e);
      if (e instanceof TypeError && e.message.includes('fetch')) {
        setError('ネットワークエラー: インターネット接続を確認してください');
      } else if (e instanceof Error) {
        // Quota/Limitエラーの判定
        const lowerMsg = e.message.toLowerCase();
        if (lowerMsg.includes('quota') || lowerMsg.includes('limit') || lowerMsg.includes('429')) {
          setError('音声生成のリミットに達しました。しばらく待ってから再試行してください。');
        } else {
          setError(`音声生成エラー: ${e.message}`);
        }
      } else {
        setError('音声生成に失敗しました');
      }
    } finally {
      aiSpeechRequestInFlightRef.current = false;
      setAiLoading(false);
    }
  }, [
    aiScript,
    aiVoice,
    aiVoiceStyle,
    editingNarrationId,
    pcmToWav,
    replaceNarrationAudio,
    updateNarrationMeta,
    addNarration,
    closeAiModal,
    clearError,
    showToast,
    logWarn,
    setError,
    setAiLoading,
    narrations,
    offlineMode,
  ]);

  // --- アップロード処理 ---
  const processUploadedMediaFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    pausePreviewBeforeEdit('add-media');
    const ctx = getAudioContext();
    if ((ctx.state as AudioContextState | 'interrupted') !== 'running') {
      ctx.resume().catch(console.error);
    }
    clearExport();
    await addMediaItems(files);
    files.forEach(file => {
      logInfo('MEDIA', `メディア追加: ${file.name}`, {
        type: file.type.startsWith('video/') ? 'video' : 'image',
        fileName: file.name,
        fileSize: file.size,
      });
    });
  }, [pausePreviewBeforeEdit, getAudioContext, clearExport, addMediaItems, logInfo]);

  const handleMediaUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      try {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        await processUploadedMediaFiles(files);
      } catch (err) {
        setError('メディアの読み込みエラー');
        logError('MEDIA', 'メディア読み込みエラー', { error: String(err) });
      }
    },
    [processUploadedMediaFiles, setError, logError]
  );

  const handleOpenMediaPicker = useCallback(async () => {
    if (!supportsShowOpenFilePicker) return;

    try {
      const files = await openFilesWithPicker({
        multiple: true,
        types: [
          {
            description: '動画・画像',
            accept: {
              'video/*': ['.mp4', '.mov', '.m4v', '.webm'],
              'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.heic', '.heif'],
            },
          },
        ],
      });
      await processUploadedMediaFiles(files);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError('メディアの読み込みエラー');
      logError('MEDIA', 'メディアピッカー起動エラー', { error: String(err) });
    }
  }, [supportsShowOpenFilePicker, processUploadedMediaFiles, setError, logError]);

  // --- 動画トリミング更新ハンドラ ---
  // 目的: トリミングスライダー操作時に動画のカット位置を変更
  // 注意: 対象動画のみシークし、他の動画には影響しない
  const handleUpdateVideoTrim = useCallback(
    (id: string, type: 'start' | 'end', value: string) => {
      let val = parseFloat(value);
      if (isNaN(val)) val = 0;

      const before = mediaItems.find((v) => v.id === id);
      const wasManual = before?.type === 'video' && before.thumbnailMode === 'manual';

      pausePreviewBeforeEdit('update-video-trim');

      // ストアを更新（手動サムネイルが範囲外なら auto へフォールバック）
      updateVideoTrim(id, type, val);

      if (wasManual) {
        const after = useMediaStore.getState().mediaItems.find((v) => v.id === id);
        if (after?.thumbnailMode !== 'manual') {
          showToast(
            '手動設定した位置がトリミング範囲外になったため、サムネイルを自動設定に戻しました。',
            5000
          );
        }
      }

      // 対象動画の再生位置をトリミング位置に合わせる
      const item = mediaItems.find((v) => v.id === id);
      if (item) {
        const el = mediaElementsRef.current[id] as HTMLVideoElement;
        if (el && el.tagName === 'VIDEO' && !el.seeking) {
          const newStart = type === 'start' ? Math.max(0, Math.min(val, item.trimEnd - 0.1)) : item.trimStart;
          const newEnd = type === 'end' ? Math.min(item.originalDuration, Math.max(val, item.trimStart + 0.1)) : item.trimEnd;
          const seekTime = type === 'start' ? newStart : Math.max(newStart, newEnd - 0.1);
          if (Number.isFinite(seekTime)) {
            el.currentTime = Math.max(0, Math.min(item.originalDuration, seekTime));
          }
        }
      }
    },
    [pausePreviewBeforeEdit, updateVideoTrim, mediaItems, showToast]
  );

  // --- プレビュー現在位置 → 動画トリム開始/終了 ---
  // 目的: プレビューで確認したフレームを、元動画上の trimStart/trimEnd へ反映する
  // 計算: sourcePosition = sourceTrimStart + previewPosition（再トリムでも有効区間基準）
  const handleSetVideoTrimFromCurrent = useCallback(
    (id: string, type: 'start' | 'end') => {
      const item = mediaItems.find((v) => v.id === id);
      if (!item || item.type !== 'video') return;

      const range = mediaTimelineRanges[id] ?? { start: 0, end: item.duration };
      const previewPosition = currentTimeRef.current - range.start;
      const nextTrim = computeVideoTrimFromPreviewPosition({
        sourceTrimStart: item.trimStart,
        sourceTrimEnd: item.trimEnd,
        originalDuration: item.originalDuration,
        previewPosition,
        type,
        playbackSpeed: item.playbackSpeed,
      });
      if (!nextTrim) return;

      const wasManual = item.thumbnailMode === 'manual';
      pausePreviewBeforeEdit(`set-video-trim-from-current-${type}`);
      updateVideoTrim(id, type, type === 'start' ? nextTrim.start : nextTrim.end);

      if (wasManual) {
        const after = useMediaStore.getState().mediaItems.find((v) => v.id === id);
        if (after?.thumbnailMode !== 'manual') {
          showToast(
            '手動設定した位置がトリミング範囲外になったため、サムネイルを自動設定に戻しました。',
            5000
          );
        }
      }

      // タイムライン位置を新しい有効範囲内へ補正
      // - 開始点変更: そのフレームが新クリップ先頭になるのでクリップ先頭へ
      // - 終了点変更: ちょうど終端だと次クリップ扱いになるため、終端直前へ
      // nextTrim.duration はソース尺。タイムライン尺は倍速で割る
      const timelineClipDuration = computeTimelineDurationFromSource(
        nextTrim.duration,
        item.playbackSpeed,
      );
      const newTimelineStart = range.start;
      const newTimelineEnd = range.start + timelineClipDuration;
      let nextTimelineTime: number;
      if (type === 'start') {
        nextTimelineTime = newTimelineStart;
      } else {
        nextTimelineTime = Math.max(newTimelineStart, Math.min(currentTimeRef.current, newTimelineEnd - 0.001));
      }
      // プロジェクト全体が短くなった場合も totalDuration を超えない
      const clampedTimelineTime = Math.max(0, Math.min(nextTimelineTime, newTimelineEnd));
      currentTimeRef.current = clampedTimelineTime;
      setCurrentTime(clampedTimelineTime);

      const el = mediaElementsRef.current[id] as HTMLVideoElement | undefined;
      if (el && el.tagName === 'VIDEO' && !el.seeking) {
        const seekTime = type === 'start'
          ? nextTrim.start
          : Math.max(nextTrim.start, nextTrim.end - 0.1);
        if (Number.isFinite(seekTime)) {
          el.currentTime = Math.max(0, Math.min(item.originalDuration, seekTime));
        }
      }

      // 尺変更後のプレビューを即時反映
      requestAnimationFrame(() => {
        renderFrame(currentTimeRef.current, false);
      });
    },
    [
      mediaItems,
      mediaTimelineRanges,
      pausePreviewBeforeEdit,
      updateVideoTrim,
      setCurrentTime,
      renderFrame,
      showToast,
    ]
  );

  // --- プロジェクトポスター（アプリ内サムネ）をプレビュー現在フレームで手動設定 ---
  // タイムライン全体の現在位置を対象にする（複数クリップ合成後の1本の動画として扱う）。
  // ※エクスプローラーのファイルアイコンには埋め込まれない（OS が動画から別途生成する）。
  const handleSetProjectPosterFromCurrent = useCallback(() => {
    if (mediaItems.length === 0 || totalDuration <= 0) return;
    pausePreviewBeforeEdit('set-project-poster-from-current');
    const captureGeneration = ++projectPosterCaptureGenerationRef.current;
    // 停止描画を確定してからキャプチャ（再生中のブレ防止）
    requestAnimationFrame(() => {
      if (projectPosterCaptureGenerationRef.current !== captureGeneration) return;
      renderFrame(currentTimeRef.current, false);
      requestAnimationFrame(() => {
        if (projectPosterCaptureGenerationRef.current !== captureGeneration) return;
        const canvas = canvasRef.current;
        const dataUrl = canvas ? createPosterDataUrlFromCanvas(canvas) : null;
        if (!dataUrl) {
          showToast('サムネイル画像の取得に失敗しました。もう一度お試しください。', 4000);
          return;
        }
        setProjectPosterManual(currentTimeRef.current, dataUrl, aspectRatio);
        showToast('現在のフレームをプロジェクトのサムネイルに設定しました。', 3000);
      });
    });
  }, [
    mediaItems.length,
    totalDuration,
    pausePreviewBeforeEdit,
    renderFrame,
    setProjectPosterManual,
    aspectRatio,
    showToast,
  ]);

  // --- プロジェクトポスターを自動（タイムライン先頭+0.2s 付近）へ戻す ---
  const handleResetProjectPosterToAuto = useCallback(() => {
    if (mediaItems.length === 0) {
      autoProjectPosterContentKeyRef.current = buildAutoProjectPosterContentKey(
        [],
        0,
        aspectRatio,
      );
      resetProjectPosterToAuto(0, null, aspectRatio);
      return;
    }
    pausePreviewBeforeEdit('reset-project-poster-to-auto');
    const captureGeneration = ++projectPosterCaptureGenerationRef.current;
    // 手動画像は操作直後に破棄する。自動位置の画像は書き出し用として非同期で再取得する。
    resetProjectPosterToAuto(totalDuration, null, aspectRatio);
    // 自動追従 effect と同じキーにして、直後の二重キャプチャを避ける
    autoProjectPosterContentKeyRef.current = buildAutoProjectPosterContentKey(
      mediaItems,
      totalDuration,
      aspectRatio,
    );
    showToast('サムネイルを自動設定（先頭付近）に戻しました。', 3000);
    // 表示位置は先頭付近のままだが、キャプチャは先頭強制黒クリア帯の外で撮る
    const autoTime = resolveAutoProjectPosterCaptureTime(totalDuration);
    currentTimeRef.current = autoTime;
    setCurrentTime(autoTime);

    // 自動位置へシークし、描画可能になってからキャプチャする。
    // rAF 2 回だけではシークが完了せず黒を掴むため、明示的に待つ。
    void (async () => {
      const isStale = () =>
        projectPosterCaptureGenerationRef.current !== captureGeneration;

      const delay = (ms: number) => new Promise<void>((r) => { window.setTimeout(r, ms); });
      const nextFrame = () => new Promise<void>((r) => { requestAnimationFrame(() => r()); });

      renderFrame(autoTime, false);

      const deadline = Date.now() + AUTO_POSTER_MEDIA_SETTLE_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (isStale()) return;
        const element = resolveActivePosterMediaElement(autoTime);
        if (!element || isPosterMediaElementDrawable(element)) break;
        await delay(AUTO_POSTER_MEDIA_SETTLE_POLL_MS);
      }

      for (let attempt = 0; attempt < AUTO_POSTER_CAPTURE_MAX_ATTEMPTS; attempt++) {
        if (isStale()) return;
        renderFrame(autoTime, false);
        await nextFrame();
        await nextFrame();
        if (isStale()) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (!isCanvasEffectivelyBlank(canvas)) {
          setProjectPosterDataUrl(createPosterDataUrlFromCanvas(canvas), aspectRatio);
          return;
        }
        await delay(AUTO_POSTER_CAPTURE_RETRY_DELAY_MS);
      }

      if (isStale()) return;
      logWarn('MEDIA', '自動設定へ戻す際のキャプチャが黒フレームのため画像を設定しない', {
        autoTime,
        totalDuration,
      });
    })();
  }, [
    mediaItems,
    totalDuration,
    pausePreviewBeforeEdit,
    setCurrentTime,
    renderFrame,
    resetProjectPosterToAuto,
    setProjectPosterDataUrl,
    aspectRatio,
    showToast,
    resolveActivePosterMediaElement,
    isPosterMediaElementDrawable,
    logWarn,
  ]);

  // --- 動画形式（横/縦）変更時のプロジェクトポスター整合 ---
  const handleAspectRatioChange = useCallback((nextAspectRatio: AspectRatio) => {
    if (nextAspectRatio === aspectRatio) return;

    pausePreviewBeforeEdit('change-aspect-ratio');
    const captureGeneration = ++projectPosterCaptureGenerationRef.current;
    setAspectRatio(nextAspectRatio);
    const resetManual = reconcileProjectPosterAspectRatio(nextAspectRatio, totalDuration);
    const posterState = useMediaStore.getState();

    if (resetManual) {
      showToast(
        '動画形式を変更したため、比率の合わない手動サムネイルを自動設定に戻しました。',
        4000,
      );
    }

    // 自動モードは新しい比率の先頭付近フレームを再取得する。
    if (posterState.projectPosterMode !== 'auto' || mediaItems.length === 0) return;
    const autoTime = posterState.projectPosterTimelineTime;
    currentTimeRef.current = autoTime;
    setCurrentTime(autoTime);

    requestAnimationFrame(() => {
      if (projectPosterCaptureGenerationRef.current !== captureGeneration) return;
      // PreviewSection の再描画を待つだけでなく、同フレーム内でも確実に新寸法へ揃える。
      const canvas = canvasRef.current;
      const canvasState = useCanvasStore.getState();
      if (canvas) {
        if (canvas.width !== canvasState.width) canvas.width = canvasState.width;
        if (canvas.height !== canvasState.height) canvas.height = canvasState.height;
      }
      renderFrame(autoTime, false);
      requestAnimationFrame(() => {
        if (projectPosterCaptureGenerationRef.current !== captureGeneration) return;
        const updatedCanvas = canvasRef.current;
        const dataUrl = updatedCanvas ? createPosterDataUrlFromCanvas(updatedCanvas) : null;
        setProjectPosterDataUrl(dataUrl, nextAspectRatio);
      });
    });
  }, [
    aspectRatio,
    mediaItems.length,
    pausePreviewBeforeEdit,
    reconcileProjectPosterAspectRatio,
    renderFrame,
    setAspectRatio,
    setCurrentTime,
    setProjectPosterDataUrl,
    showToast,
    totalDuration,
  ]);

  // --- 画像表示時間更新ハンドラ ---
  // 目的: 画像クリップの表示時間を変更
  const handleUpdateImageDuration = useCallback((id: string, newDuration: string) => {
    let val = parseFloat(newDuration);
    if (isNaN(val) || val < 0.5) val = 0.5;
    pausePreviewBeforeEdit('update-image-duration');
    updateImageDuration(id, val);
  }, [pausePreviewBeforeEdit, updateImageDuration]);

  // --- スケール更新ハンドラ ---
  // 目的: メディアの拡大率を変更
  const handleUpdateMediaScale = useCallback((id: string, value: string | number) => {
    let val = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(val)) val = 1.0;
    pausePreviewBeforeEdit('update-media-scale');
    updateScale(id, val);
  }, [pausePreviewBeforeEdit, updateScale]);

  // --- 位置更新ハンドラ ---
  // 目的: メディアの表示位置（X/Y座標）を変更
  const handleUpdateMediaPosition = useCallback((id: string, axis: 'x' | 'y', value: string) => {
    let val = parseFloat(value);
    if (isNaN(val)) val = 0;
    pausePreviewBeforeEdit('update-media-position');
    updatePosition(id, axis, val);
  }, [pausePreviewBeforeEdit, updatePosition]);

  // --- 回転更新ハンドラ ---
  // 目的: メディアを 90 度単位で時計回りに回転（0→90→180→270→0）
  const handleRotateMedia = useCallback((id: string) => {
    pausePreviewBeforeEdit('rotate-media');
    rotateClip(id);
  }, [pausePreviewBeforeEdit, rotateClip]);

  // --- ぼかし更新ハンドラ ---
  // 目的: 動画・画像カードごとのぼかし強度を変更
  const handleUpdateMediaBlur = useCallback((id: string, value: number) => {
    pausePreviewBeforeEdit('update-media-blur');
    updateBlur(id, value);
  }, [pausePreviewBeforeEdit, updateBlur]);

  // --- 設定リセットハンドラ ---
  // 目的: スケール・位置・回転・ぼかしを初期値にリセット
  const handleResetMediaSetting = useCallback((id: string, type: 'scale' | 'x' | 'y' | 'rotation' | 'blur') => {
    pausePreviewBeforeEdit('reset-media-transform');
    resetTransform(id, type);
  }, [pausePreviewBeforeEdit, resetTransform]);

  // --- メディア順序変更ハンドラ ---
  // 目的: クリップの再生順序を上下に移動
  const handleMoveMedia = useCallback(
    (idx: number, dir: 'up' | 'down') => {
      pausePreviewBeforeEdit('move-media');
      moveMediaItem(idx, dir);
    },
    [pausePreviewBeforeEdit, moveMediaItem]
  );

  // --- メディア削除ハンドラ ---
  // 目的: クリップを削除し、関連するオーディオノードを解放
  const handleRemoveMedia = useCallback((id: string) => {
    pausePreviewBeforeEdit('remove-media');
    const pendingTimer = pendingAudioDetachTimersRef.current[id];
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      delete pendingAudioDetachTimersRef.current[id];
    }

    // オーディオノードを解放
    if (sourceNodesRef.current[id]) {
      try {
        sourceNodesRef.current[id].disconnect();
      } catch (e) {
        /* ignore */
      }
      delete sourceNodesRef.current[id];
    }
    if (gainNodesRef.current[id]) {
      try {
        gainNodesRef.current[id].disconnect();
      } catch (e) {
        /* ignore */
      }
      delete gainNodesRef.current[id];
    }
    delete sourceElementsRef.current[id];

    removeMediaItem(id);
    delete mediaElementsRef.current[id];
  }, [pausePreviewBeforeEdit, removeMediaItem]);

  // --- トランスフォームパネル開閉ハンドラ ---
  // 目的: スケール・位置設定UIの表示/非表示を切り替え
  const handleToggleTransformPanel = useCallback((id: string) => {
    toggleTransformPanel(id);
  }, [toggleTransformPanel]);

  // ==========================================================
  // オーディオトラック（BGM・ナレーション）ハンドラ
  // ==========================================================

  // --- BGMアップロードハンドラ ---
  // 目的: BGMファイルを読み込みストアに設定
  const handleBgmUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    pausePreviewBeforeEdit('add-bgm');
    clearExport();
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    let settled = false;
    // メタデータ読み込みがハングしたときに blob URL を残さないためのタイムアウト保険
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      audio.onloadedmetadata = null;
      audio.onerror = null;
      URL.revokeObjectURL(url);
      showToast('BGM の読み込みに失敗しました');
    }, 15000);
    audio.onloadedmetadata = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      setBgm({
        file,
        url,
        startPoint: 0,
        delay: 0,
        volume: 1.0,
        fadeIn: false,
        fadeOut: false,
        fadeInDuration: 2.0,
        fadeOutDuration: 2.0,
        duration,
        isAi: false,
      });
    };
    audio.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      URL.revokeObjectURL(url);
      showToast('BGM の読み込みに失敗しました');
    };
  }, [pausePreviewBeforeEdit, setBgm, clearExport, showToast]);

  // --- BGM クリップ追加ハンドラ（複数BGM・standard フレーバー限定） ---
  // 目的: 複数の BGM ファイルを読み込み、動画の長さへ自動フィットさせてクリップとして追加
  const handleAddBgmClips = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    e.target.value = '';
    pausePreviewBeforeEdit('add-bgm-clip');
    clearExport();

    const loadBgmMeta = (file: File): Promise<{ file: File; url: string; duration: number }> =>
      new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const audio = new Audio(url);
        let settled = false;
        // メタデータ読み込みハング時に blob URL を残さないためのタイムアウト保険
        const timeoutId = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          audio.onloadedmetadata = null;
          audio.onerror = null;
          URL.revokeObjectURL(url);
          reject(new Error(`音声メタデータ読み込みタイムアウト: ${file.name}`));
        }, 15000);

        audio.onloadedmetadata = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
          resolve({ file, url, duration });
        };

        audio.onerror = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          URL.revokeObjectURL(url);
          reject(new Error(`音声メタデータ読み込み失敗: ${file.name}`));
        };
      });

    void (async () => {
      let failedCount = 0;

      for (const file of files) {
        try {
          const { url, duration } = await loadBgmMeta(file);
          addBgmClip({ file, url, duration }, totalDurationRef.current);
        } catch {
          failedCount += 1;
        }
      }

      if (failedCount > 0) {
        showToast(`BGM ${failedCount}件の読み込みに失敗しました`);
      }
    })();
  }, [pausePreviewBeforeEdit, clearExport, addBgmClip, showToast]);

  // --- ナレーションアップロードハンドラ ---
  // 目的: ナレーションファイルを読み込みストアに設定
  const handleNarrationUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    e.target.value = '';
    pausePreviewBeforeEdit('add-narration');
    clearExport();

    const startTimeAtUpload = currentTimeRef.current;
    const loadNarrationMeta = (file: File): Promise<{ file: File; url: string; duration: number }> =>
      new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const audio = new Audio(url);
        let settled = false;
        // メタデータ読み込みハング時に blob URL を残さないためのタイムアウト保険
        const timeoutId = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          audio.onloadedmetadata = null;
          audio.onerror = null;
          URL.revokeObjectURL(url);
          reject(new Error(`音声メタデータ読み込みタイムアウト: ${file.name}`));
        }, 15000);

        audio.onloadedmetadata = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
          resolve({ file, url, duration });
        };

        audio.onerror = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          URL.revokeObjectURL(url);
          reject(new Error(`音声メタデータ読み込み失敗: ${file.name}`));
        };
      });

    void (async () => {
      let failedCount = 0;

      for (const file of files) {
        try {
          const { url, duration } = await loadNarrationMeta(file);
          addNarration(
            createNarrationClip({
              file,
              url,
              duration,
              startTime: startTimeAtUpload,
              sourceType: 'file',
            })
          );
        } catch {
          failedCount += 1;
        }
      }

      if (failedCount > 0) {
        showToast(`ナレーション${failedCount}件の読み込みに失敗しました`);
      }
    })();
  }, [pausePreviewBeforeEdit, addNarration, clearExport, showToast]);

  // --- BGM/ナレーション開始位置更新ハンドラ ---
  // 目的: オーディオトラックの再生開始位置（ファイル内の位置）を変更
  // ドラッグ中に連続発火するスライダーなので一時停止しない（withoutPreviewPause の説明を参照）。
  // 再生位置の追従は renderFrame 側が毎フレーム trackTime を再計算して吸収する。
  const handleUpdateBgmStart = useCallback((val: string) => {
    const numVal = parseFloat(val);
    if (isNaN(numVal)) return;
    clearGeneratedExport('edit:update-bgm-start-point');
    updateBgmStartPoint(numVal);
  }, [clearGeneratedExport, updateBgmStartPoint]);

  // --- BGM/ナレーション遅延更新ハンドラ ---
  // 目的: オーディオトラックの開始遅延（動画開始からの秒数）を変更
  // 同上。再生を止めずに「どのタイミングで鳴り始めるか」を聴きながら合わせられる。
  const handleUpdateBgmDelay = useCallback((val: string) => {
    const numVal = parseFloat(val);
    if (isNaN(numVal)) return;
    clearGeneratedExport('edit:update-bgm-delay');
    updateBgmDelay(numVal);
  }, [clearGeneratedExport, updateBgmDelay]);

  // --- BGM/ナレーション音量更新ハンドラ ---
  // 目的: オーディオトラックの音量を変更
  // 音量はドラッグ中に連続発火するため一時停止しない（withoutPreviewPause の説明を参照）
  const handleUpdateBgmVolume = useCallback((val: string) => {
    const numVal = parseFloat(val);
    if (isNaN(numVal)) return;
    clearGeneratedExport('edit:update-bgm-volume');
    updateBgmVolume(numVal);
  }, [clearGeneratedExport, updateBgmVolume]);

  // 開始位置はドラッグ中に連続発火するため一時停止しない（withoutPreviewPause の説明を参照）
  const handleUpdateNarrationStart = useCallback((id: string, val: string) => {
    const numVal = parseFloat(val);
    if (isNaN(numVal)) return;
    clearGeneratedExport('edit:update-narration-start-time');
    updateNarrationStartTime(id, numVal);
  }, [clearGeneratedExport, updateNarrationStartTime]);

  const handleSetNarrationStartToCurrent = useCallback((id: string) => {
    pausePreviewBeforeEdit('set-narration-start-to-current');
    updateNarrationStartTime(id, currentTimeRef.current);
  }, [pausePreviewBeforeEdit, updateNarrationStartTime]);

  const handleSetNarrationEndToCurrent = useCallback((id: string) => {
    pausePreviewBeforeEdit('set-narration-end-to-current');
    setNarrationEndTime(id, currentTimeRef.current);
  }, [pausePreviewBeforeEdit, setNarrationEndTime]);

  // 音量はドラッグ中に連続発火するため一時停止しない（withoutPreviewPause の説明を参照）
  const handleUpdateNarrationVolume = useCallback((id: string, val: string) => {
    const numVal = parseFloat(val);
    if (isNaN(numVal)) return;
    clearGeneratedExport('edit:update-narration-volume');
    updateNarrationVolume(id, numVal);
  }, [clearGeneratedExport, updateNarrationVolume]);

  const handleToggleNarrationMute = useCallback((id: string) => {
    pausePreviewBeforeEdit('toggle-narration-mute');
    toggleNarrationMute(id);
  }, [pausePreviewBeforeEdit, toggleNarrationMute]);

  // トリムはドラッグ中に連続発火するため一時停止しない（withoutPreviewPause の説明を参照）
  const handleUpdateNarrationTrimStart = useCallback((id: string, val: string) => {
    const numVal = parseFloat(val);
    if (isNaN(numVal)) return;
    clearGeneratedExport('edit:update-narration-trim-start');
    updateNarrationTrim(id, 'start', numVal);
  }, [clearGeneratedExport, updateNarrationTrim]);

  const handleUpdateNarrationTrimEnd = useCallback((id: string, val: string) => {
    const numVal = parseFloat(val);
    if (isNaN(numVal)) return;
    clearGeneratedExport('edit:update-narration-trim-end');
    updateNarrationTrim(id, 'end', numVal);
  }, [clearGeneratedExport, updateNarrationTrim]);

  const handleSaveNarration = useCallback(async (id: string) => {
    const clip = narrations.find((item) => item.id === id);
    if (!clip) return;

    const sourceUrl = clip.blobUrl || clip.url;
    if (!sourceUrl) {
      showToast('保存できる音声が見つかりませんでした');
      return;
    }

    const rawName = clip.file instanceof File ? clip.file.name : clip.file.name;
    const filename = preserveOriginalFileName(rawName, 'narration.wav');

    const inferredMimeType = clip.file instanceof File && clip.file.type
      ? clip.file.type
      : 'audio/wav';
    try {
      const result = await saveObjectUrlWithClientFileStrategy({
        sourceUrl,
        descriptor: {
          filename,
          mimeType: inferredMimeType,
          description: '音声ファイル',
        },
        supportsShowSaveFilePicker,
      });

      if (result.strategy === 'file-picker') {
        window.alert('音声の保存が完了しました。');
        showToast('音声の保存が完了しました');
        return;
      }

      window.alert('音声の保存を開始しました。完了はブラウザの通知をご確認ください。');
      showToast('音声の保存を開始しました。完了はブラウザの通知をご確認ください。', 5000);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        showToast('音声の保存をキャンセルしました');
        return;
      }
      setError('音声の保存に失敗しました');
    }
  }, [narrations, setError, showToast, supportsShowSaveFilePicker]);

  const handleCloseAiModal = useCallback(() => {
    setEditingNarrationId(null);
    closeAiModal();
  }, [closeAiModal]);

  const pausePreviewBeforeHeaderModal = useCallback(() => {
    pausePreviewBeforeEdit('open-header-modal');
  }, [pausePreviewBeforeEdit]);

  const handleAddAiNarration = useCallback(() => {
    if (offlineMode) return;
    pausePreviewBeforeEdit('add-ai-narration');
    setEditingNarrationId(null);
    setAiScript('');
    setAiPrompt('');
    setAiScriptLength('medium');
    setAiVoiceStyle('');
    setAiNarrationScene('');
    openAiModal();
  }, [offlineMode, openAiModal, pausePreviewBeforeEdit, setAiNarrationScene, setAiPrompt, setAiScript, setAiVoiceStyle]);

  const handleEditAiNarration = useCallback((id: string) => {
    if (offlineMode) return;
    const target = narrations.find((clip) => clip.id === id);
    if (!target || !target.isAiEditable) return;
    const currentScript = target.aiScript ?? '';
    const inferredLength: NarrationScriptLength =
      currentScript.length <= 70 ? 'short' : currentScript.length <= 120 ? 'medium' : 'long';
    pausePreviewBeforeEdit('edit-ai-narration');
    setEditingNarrationId(id);
    setAiPrompt('');
    setAiScript(currentScript);
    setAiScriptLength(inferredLength);
    setAiVoice(target.aiVoice ?? 'Aoede');
    setAiVoiceStyle(target.aiVoiceStyle ?? '');
    setAiNarrationScene(target.aiNarrationScene ?? '');
    openAiModal();
  }, [narrations, offlineMode, openAiModal, pausePreviewBeforeEdit, setAiNarrationScene, setAiPrompt, setAiScript, setAiVoice, setAiVoiceStyle]);

  const handleOpenSettingsModal = useCallback(() => {
    pausePreviewBeforeHeaderModal();
    setShowSettings(true);
  }, [pausePreviewBeforeHeaderModal]);

  const handleOpenProjectManagerModal = useCallback(() => {
    pausePreviewBeforeHeaderModal();
    setShowProjectManager(true);
  }, [pausePreviewBeforeHeaderModal]);

  const handleOpenAppHelpModal = useCallback(() => {
    pausePreviewBeforeHeaderModal();
    setActiveHelpSection('app');
  }, [pausePreviewBeforeHeaderModal]);

  // --- 全クリア処理 ---
  // 目的: 全てのメディア・オーディオ・キャプション・ウォーターマークを削除し初期状態に戻す
  const handleClearAll = useCallback(() => {
    if (
      mediaItems.length === 0
      && !bgm
      && bgmClips.length === 0
      && narrations.length === 0
      && captions.length === 0
      && !watermarkOverlay.file
    ) return;

    // 確認ダイアログを表示
    const confirmed = window.confirm(
      'すべてのメディア、ウォーターマーク、BGM、ナレーション、キャプションをクリアします。よろしいですか？',
    );
    if (!confirmed) return;

    projectPosterCaptureGenerationRef.current += 1;
    stopAll();
    pause();
    setProcessing(false);
    Object.values(sourceNodesRef.current).forEach((n) => {
      try {
        n.disconnect();
      } catch (e) {
        /* ignore */
      }
    });
    Object.values(gainNodesRef.current).forEach((n) => {
      try {
        n.disconnect();
      } catch (e) {
        /* ignore */
      }
    });
    sourceNodesRef.current = {};
    gainNodesRef.current = {};
    sourceElementsRef.current = {};
    Object.values(pendingAudioDetachTimersRef.current).forEach((timer) => clearTimeout(timer));
    pendingAudioDetachTimersRef.current = {};

    mediaItemsRef.current = [];
    mediaElementsRef.current = {};
    bgmRef.current = null;
    narrationsRef.current = [];

    // Zustand stores clear
    clearAllMedia();
    reconcileProjectPosterAspectRatio(aspectRatio, 0);
    clearAllAudio();
    resetCaptions();
    resetWatermark();
    resetUI();
    setReloadKey(0);

    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }
    }
  }, [
    mediaItems,
    bgm,
    bgmClips,
    narrations,
    captions,
    watermarkOverlay.file,
    stopAll,
    clearAllMedia,
    reconcileProjectPosterAspectRatio,
    aspectRatio,
    clearAllAudio,
    resetCaptions,
    resetWatermark,
    resetUI,
  ]);

  const {
    handleSeekStart: handleLiveSeekStart,
    handleSeekChange: handleLiveSeekChange,
    handleSeekEnd: handleLiveSeekEnd,
  } = previewRuntime.usePreviewSeekController({
    mediaItemsRef,
    mediaElementsRef,
    sourceNodesRef,
    gainNodesRef,
    audioCtxRef,
    totalDurationRef,
    currentTimeRef,
    activeVideoIdRef,
    isPlayingRef,
    isSeekingRef,
    wasPlayingBeforeSeekRef,
    seekingVideosRef,
    startTimeRef,
    reqIdRef,
    loopIdRef,
    playbackTimeoutRef,
    lastSeekTimeRef,
    pendingSeekRef,
    pendingSeekTimeoutRef,
    seekSettleGenerationRef,
    previewPlaybackAttemptRef,
    pendingPausedSeekWaitRef,
    handleSeekEndCallbackRef,
    renderPausedPreviewFrameAtTimeRef,
    cancelSeekPlaybackPrepareRef,
    isSeekPlaybackPreparingRef,
    endFinalizedRef,
    previewPlatformPolicy,
    setCurrentTime,
    attachGlobalSeekEndListeners,
    detachGlobalSeekEndListeners,
    cancelPendingSeekPlaybackPrepare,
    cancelPendingPausedSeekWait,
    renderFrame,
    loop,
    resetInactiveVideos,
    preparePreviewAudioNodesForTime,
    primePreviewAudioOnlyTracksAtTime,
  });

  const shouldHandleSeekWithPreviewCache = useCallback(() => {
    return previewCacheStatusRef.current === 'ready'
      && useAndroidPreviewCacheForPlayback
      && !!previewCacheEntryRef.current
      && !!previewCacheVideoRef.current;
  }, [useAndroidPreviewCacheForPlayback]);

  const handleSeekStart = useCallback(() => {
    if (!shouldHandleSeekWithPreviewCache()) {
      handleLiveSeekStart();
      // iOS Safari: シーク操作で再生を止め、自動再開せず手動で再開する仕様にする。
      // handleLiveSeekStart() は再生中だった場合に wasPlayingBeforeSeekRef を立てつつ
      // メディアを pause する。
      if (platformCapabilities.isIosSafari) {
        if (wasPlayingBeforeSeekRef.current) {
          // UI の再生状態も一時停止へ揃える（再生/一時停止ボタンを「再生(▶)」表示にする）。
          pause();
        }
        // controller の自動再開分岐 (handleSeekEnd 内 wasPlaying 判定) を無効化する。
        // これにより slider 由来の seek end も、window グローバル seek end リスナー
        // (handleSeekEndCallbackRef 経由で controller の handleSeekEnd を直接呼ぶ) も、
        // どちらの経路でも再開せず一時停止フレーム描画へ落ちる。
        wasPlayingBeforeSeekRef.current = false;
      }
      return;
    }

    const previewCacheVideo = previewCacheVideoRef.current;
    if (!previewCacheVideo) {
      handleLiveSeekStart();
      return;
    }

    wasPlayingBeforeSeekRef.current = isPlayingRef.current;
    isSeekingRef.current = true;
    previewCachePlaybackActiveRef.current = false;

    if (reqIdRef.current !== null) {
      cancelAnimationFrame(reqIdRef.current);
      reqIdRef.current = null;
    }

    try {
      previewCacheVideo.pause();
    } catch {
      /* ignore */
    }
  }, [handleLiveSeekStart, isPlayingRef, pause, platformCapabilities.isIosSafari, shouldHandleSeekWithPreviewCache, wasPlayingBeforeSeekRef]);

  const handleSeekChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (!shouldHandleSeekWithPreviewCache()) {
      handleLiveSeekChange(event);
      return;
    }

    const previewCacheVideo = previewCacheVideoRef.current;
    if (!previewCacheVideo) {
      handleLiveSeekChange(event);
      return;
    }

    const time = Math.max(0, Math.min(parseFloat(event.target.value), totalDurationRef.current));
    currentTimeRef.current = time;
    setCurrentTime(time);

    try {
      if (Math.abs(previewCacheVideo.currentTime - time) > 0.01) {
        previewCacheVideo.currentTime = time;
      }
    } catch {
      /* ignore */
    }

    renderFrame(time, false);
  }, [handleLiveSeekChange, renderFrame, setCurrentTime, shouldHandleSeekWithPreviewCache, totalDurationRef]);

  const handleSeekEnd = useCallback(() => {
    if (!shouldHandleSeekWithPreviewCache()) {
      handleLiveSeekEnd();
      return;
    }

    const previewCacheVideo = previewCacheVideoRef.current;
    if (!previewCacheVideo) {
      handleLiveSeekEnd();
      return;
    }

    const targetTime = Math.max(0, Math.min(currentTimeRef.current, totalDurationRef.current));
    isSeekingRef.current = false;

    try {
      if (Math.abs(previewCacheVideo.currentTime - targetTime) > 0.01) {
        previewCacheVideo.currentTime = targetTime;
      }
    } catch {
      /* ignore */
    }

    if (wasPlayingBeforeSeekRef.current) {
      wasPlayingBeforeSeekRef.current = false;
      previewCachePlaybackActiveRef.current = true;
      startTimeRef.current = performance.now() - targetTime * 1000;
      isPlayingRef.current = true;
      void previewCacheVideo.play().then(() => {
        loop(false, loopIdRef.current);
      }).catch(() => {
        previewCachePlaybackActiveRef.current = false;
        renderFrame(targetTime, false);
      });
      return;
    }

    wasPlayingBeforeSeekRef.current = false;
    previewCachePlaybackActiveRef.current = false;
    renderFrame(targetTime, false);
  }, [handleLiveSeekEnd, isPlayingRef, loop, renderFrame, shouldHandleSeekWithPreviewCache, totalDurationRef]);

  // --- 再生/一時停止トグル ---
  // 目的: 再生中なら停止、停止中なら再生を開始
  // 注意: 200msのデバウンスで連続クリックを防止
  const togglePlay = useCallback(() => {
    // デバウンス: 200ms以内の連続クリックを無視
    const now = Date.now();
    if (now - lastToggleTimeRef.current < 200) {
      return;
    }
    lastToggleTimeRef.current = now;

    // 再生/一時停止どちら側でも、生成済み export は古い成果物として破棄する
    clearGeneratedExport('play-toggle');

    if (isPlaying) {
      stopAll();
      pause();
    } else {
      let startT = currentTime;
      if (startT >= totalDuration - 0.1 || startT < 0) startT = 0;
      startEngine(startT, false);
    }
  }, [clearGeneratedExport, isPlaying, currentTime, totalDuration, stopAll, pause, startEngine]);

  // --- 絶対時刻シーク ---
  // 目的: 波形タップや無音区間ジャンプ（Issue #217）から、シークバーと同じ経路で
  //       プレビュー位置を動かす。シークバー・波形・時刻表示がすべて同じ位置になる。
  const handleSeekToTime = useCallback((time: number) => {
    const target = Math.max(0, Math.min(totalDurationRef.current, time));
    handleSeekStart();
    handleSeekChange({ target: { value: String(target) } } as React.ChangeEvent<HTMLInputElement>);
    handleSeekEnd();
  }, [handleSeekChange, handleSeekEnd, handleSeekStart]);

  // --- タイミング打ち用の相対シーク ---
  // 目的: タイミング打ちバーの「-1s / +1s」からシークバーと同じ経路でプレビュー位置を動かす
  const handleStampSeekBy = useCallback((deltaSec: number) => {
    handleSeekToTime(currentTimeRef.current + deltaSec);
  }, [handleSeekToTime]);

  // --- 無音区間ナビゲーション（Issue #217） ---
  // プレビューの波形とキャプションのタイミング打ちバーが同じ検出結果を使うよう、
  // 波形フックはここで 1 度だけ呼び、結果を両方へ配る。
  const supportsTimelineWaveform = !platformCapabilities.isIosSafari;
  const timelineWaveform = useTimelineWaveform(
    pipelineNarrations,
    mediaItems,
    totalDuration,
    supportsTimelineWaveform && mediaItems.length > 0,
  );

  // 移動先には無音区間の開始・終了に加えて動画の先頭（0秒）・末尾も含まれる。
  // タイミング打ちの「読みやすい位置へ調整」ON 時は comfortable モードで余白付き位置へ飛ぶ。
  const handleSeekToSilenceBoundary = useCallback((
    direction: 'next' | 'prev',
    options?: { comfortAdjust?: boolean },
  ) => {
    const adjustMode = options?.comfortAdjust ? 'comfortable' : 'exact';
    const target = findAdjacentSilenceBoundary(
      timelineWaveform.silences,
      currentTimeRef.current,
      direction,
      totalDurationRef.current,
      0.05,
      adjustMode,
    );
    if (target === null) return;
    handleSeekToTime(target);
  }, [handleSeekToTime, timelineWaveform.silences]);

  // ボタンの活性判定（exact 基準）。タイミング打ち側は comfort 時に CaptionSection 内でも再評価する。
  const hasPrevSilenceBoundary =
    findAdjacentSilenceBoundary(timelineWaveform.silences, currentTime, 'prev', totalDuration) !== null;
  const hasNextSilenceBoundary =
    findAdjacentSilenceBoundary(timelineWaveform.silences, currentTime, 'next', totalDuration) !== null;

  // --- 停止ハンドラ ---
  // 目的: 再生を停止し、時刻を0にリセット（リソースのリロードは行わない）
  // 改善: 以前はhandleReloadResourcesを呼んでいたが、DOM破棄により動画切り替え時にクラッシュするため
  //       安全な停止・巻き戻し処理に変更
  const handleStop = useCallback(() => {
    // export 中の停止は「プレビューを 0 秒へ戻す」ではなく、中断要求と UI 復旧を優先する。
    // ただし共有 video を再生したまま残すと decoder が wedge し、次プレビューが壊れる（Issue #209）。
    // abort に加えて stopAll で media を止め、preview 側の post-export リセット対象フラグ経路へ乗せる。
    if (isProcessing) {
      // 停止ボタン押下は user cancel 扱いだが、download 導線を消したいだけなので追加エラーは出さず状態だけ静かに復旧する。
      stopWebCodecsExport({ silent: true, reason: 'user' });
      clearExportUiState();
      stopAll();
      pause();
      // export 中断後も共有 video の decoder wedge を避けるため remount（Issue #209）。
      // startEngine 側でも needsRemount なら待つが、スクラブ前に DOM を先に直す。
      void remountSharedPreviewMedia();
      return;
    }

    // 生成済み export がある場合だけ、停止後に共有 decoder も初回相当へ戻す。
    // 通常プレビューの停止では再利用キャッシュを維持し、停止→再生を重くしない。
    const shouldReleaseGeneratedExportMedia = Boolean(exportUrl);

    // 停止ボタン押下で生成済み export を古い成果物として破棄し、ダウンロードボタンを消す。
    clearGeneratedExport('stop-button');

    stopAll();
    pause();
    seekSettleGenerationRef.current += 1;
    cancelPendingSeekPlaybackPrepare();
    cancelPendingPausedSeekWait();
    detachGlobalSeekEndListeners();
    isSeekingRef.current = false;
    wasPlayingBeforeSeekRef.current = false;
    setExportPreparationStep(null);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    endFinalizedRef.current = false;

    if (previewCacheStatusRef.current === 'ready' && previewCacheVideoRef.current) {
      try {
        previewCacheVideoRef.current.pause();
        previewCacheVideoRef.current.currentTime = 0;
      } catch {
        /* ignore */
      }
    }

    // [TV] 全メディアを安全に巻き戻し (DOM要素を維持したままリセット)
    // 各ビデオをtrimStart位置にリセット（0ではなく実際の開始位置へ）
    for (const item of mediaItemsRef.current) {
      const el = mediaElementsRef.current[item.id];
      if (el && el.tagName === 'VIDEO') {
        try {
          const videoEl = el as HTMLVideoElement;
          videoEl.pause();
          videoEl.currentTime = item.trimStart || 0;
        } catch (e) {
          /* ignore */
        }
      }
    }
    // BGM/ナレーションは0に戻す
    const audioTrackIds = [
      'bgm',
      ...narrationsRef.current.map((clip) => `narration:${clip.id}`),
    ];
    audioTrackIds.forEach((trackId) => {
      const el = mediaElementsRef.current[trackId];
      if (el && (el.tagName === 'AUDIO')) {
        try {
          const audioEl = el as HTMLAudioElement;
          audioEl.pause();
          audioEl.currentTime = 0;
        } catch (e) {
          /* ignore */
        }
      }
    });

    // 0秒時点を描画
    // 少し遅延させて確実にシーク反映させる
    renderPausedPreviewFrameAtTimeRef.current(0);

    if (shouldReleaseGeneratedExportMedia) {
      void remountSharedPreviewMedia().then((result) => {
        logInfo('RENDER', 'preview.postExport.mediaRemount', {
          result,
          phase: 'generated-export-stop',
        });
        if (result === 'ready') {
          renderPausedPreviewFrameAtTimeRef.current(0);
        }
      });
    }
  }, [
    clearGeneratedExport,
    clearExportUiState,
    exportUrl,
    isProcessing,
    logInfo,
    stopAll,
    stopWebCodecsExport,
    pause,
    remountSharedPreviewMedia,
    setProcessing,
    setPreviewPlaying,
    setLoading,
    setExportPreparationStep,
    setCurrentTime,
    cancelPendingPausedSeekWait,
    cancelPendingSeekPlaybackPrepare,
    detachGlobalSeekEndListeners,
    previewCacheVideoRef,
  ]);

  // --- キャプション・ロゴ変更時のプレビュー再描画 ---
  // キャプション／ウォーターマーク／エンドロールはプレビュー canvas へ焼き込まれるため、
  // 削除・編集しても再描画が走らないと「消したはずの文字が残る」「調整が反映されない」。
  // 停止中は自動で描き直す契機が無いので、ここで明示的に現在位置を描き直す。
  // （同時に、ミニプレビューが使う「キャプション抜きスナップショット」も更新される）
  //
  // ウォーターマーク・エンドロールの各パラメータ（位置・倍率・透過度・回転・マスク・
  // フェード・背景色など）もこの依存に含めること。含めないとスライダーを動かしても
  // 画が変わらず、シークバーを触るまで反映されない。
  useEffect(() => {
    if (isPlayingRef.current || isProcessing) return;
    const id = requestAnimationFrame(() => {
      renderFrame(currentTimeRef.current, false);
    });
    return () => cancelAnimationFrame(id);
  }, [
    captions,
    captionSettings,
    videoTitle,
    watermarkOverlay,
    endrollOverlay,
    isProcessing,
    renderFrame,
  ]);

  // Issue #114: 書き出しオプション（セッション中のみ。プロジェクト保存対象外）
  const [exportOutputOptions, setExportOutputOptions] = useState<ExportOutputOptions>(
    () => ({ ...DEFAULT_EXPORT_OUTPUT_OPTIONS }),
  );
  const supportsCaptionLayerExport = appFlavor === 'standard';

  useEffect(() => {
    if (captions.length > 0 || exportUrl || isProcessing) return;
    setExportOutputOptions((current) => (
      current.contentMode === 'caption-layer'
        ? { ...current, contentMode: 'composite' }
        : current
    ));
  }, [captions.length, exportUrl, isProcessing]);

  const downloadSubtitleFiles = useCallback(async () => {
    if (captions.length === 0) {
      showToast('書き出すキャプションがありません');
      return;
    }
    const timestampMs = Date.now();
    const formats = exportOutputOptions.subtitleFormats.length > 0
      ? exportOutputOptions.subtitleFormats
      : (['srt', 'vtt'] as const);
    try {
      for (const format of formats) {
        const content = buildSubtitleFileContent(captions, format);
        const blob = new Blob([content], { type: `${subtitleMimeType(format)};charset=utf-8` });
        await saveBlobWithClientFileStrategy({
          blob,
          descriptor: {
            filename: buildCaptionSubtitleFileName(format, timestampMs),
            mimeType: subtitleMimeType(format),
            description: format === 'srt' ? 'SubRip 字幕' : 'WebVTT 字幕',
          },
          supportsShowSaveFilePicker,
        });
      }
      showToast('字幕ファイルを保存しました');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        showToast('字幕の保存をキャンセルしました');
        return;
      }
      setError('字幕ファイルの保存に失敗しました');
    }
  }, [
    captions,
    exportOutputOptions.subtitleFormats,
    setError,
    showToast,
    supportsShowSaveFilePicker,
  ]);

  // --- エクスポート開始ハンドラ ---
  // 目的: 動画ファイルとして書き出しを開始
  // Issue #114: キャプションのみは startEngine を使わずオフライン encode 経路へ
  const handleExport = useCallback(() => {
    exportCompletedRef.current = false;
    exportFinalizingUiRef.current = false;
    exportFinalizeWarningShownRef.current = false;

    const options = normalizeExportOutputOptions(exportOutputOptions);
    if (
      supportsCaptionLayerExport
      && options.contentMode === 'caption-layer'
    ) {
      if (mediaItems.length === 0) {
        showToast('書き出すタイムラインがありません');
        return;
      }
      if (captions.length === 0) {
        showToast('キャプションを1件以上追加してください');
        return;
      }
      const hasCaptionContent =
        (captionSettings.enabled && captions.length > 0)
        || (videoTitle.enabled && videoTitle.text.trim().length > 0);
      if (!hasCaptionContent) {
        showToast('表示できるキャプションまたは動画タイトルがありません');
        return;
      }

      // 再生中なら止めてからオフライン書き出しへ
      if (isPlayingRef.current) {
        stopAll();
        pause();
      }

      setProcessing(true);
      setExportPreparationStep(1);
      clearExport();

      const { exportWidth, exportHeight } = useCanvasStore.getState();
      startWebCodecsExport(
        canvasRef,
        masterDestRef,
        (url, ext) => {
          setExportUrl(url);
          setExportExt(ext as 'mp4' | 'webm');
          setProcessing(false);
          setLoading(false);
          setExportPreparationStep(null);
          exportCompletedRef.current = true;
          showToast(
            options.includeSubtitles && captions.length > 0
              ? 'キャプション動画を作成しました。ダウンロード後に字幕ファイルも保存できます'
              : 'キャプション動画を作成しました',
          );
        },
        (message) => {
          setProcessing(false);
          setLoading(false);
          setExportPreparationStep(null);
          setError(message || 'キャプションのみ書き出しに失敗しました');
        },
        undefined,
        {
          output: options,
          captionLayer: {
            totalDurationSec: totalDurationRef.current,
            captions,
            captionSettings,
            videoTitle,
            exportWidth,
            exportHeight,
            onPreparationStepChange: (step) => {
              setExportPreparationStep(step);
            },
            // UI の「書き出し中 %」とフェーズ表示は currentTime 進行に依存するため、
            // オフライン encode の進捗をタイムライン相当へ反映する。
            onProgress: (ratio) => {
              const duration = totalDurationRef.current;
              if (!(duration > 0) || !Number.isFinite(ratio)) return;
              const t = Math.max(0, Math.min(duration, duration * ratio));
              currentTimeRef.current = t;
              setCurrentTime(t);
            },
          },
        },
      );
      return;
    }

    startEngine(0, true);
  }, [
    captionSettings,
    captions,
    clearExport,
    exportOutputOptions,
    mediaItems.length,
    pause,
    setCurrentTime,
    setError,
    setExportExt,
    setExportPreparationStep,
    setExportUrl,
    setLoading,
    setProcessing,
    showToast,
    startEngine,
    startWebCodecsExport,
    stopAll,
    supportsCaptionLayerExport,
    videoTitle,
  ]);

  const handleExportFinalizeTimeout = useCallback(() => {
    if (!isProcessing || exportUrl || exportCompletedRef.current) return;
    if (exportFinalizeWarningShownRef.current) return;
    exportFinalizeWarningShownRef.current = true;
    logWarn('RENDER', 'export finalize is taking longer than expected', {
      exportFinalizing: exportFinalizingUiRef.current,
      warning: EXPORT_FINALIZING_TIMEOUT_WARNING,
    });
    setError(EXPORT_FINALIZING_TIMEOUT_ERROR);
  }, [
    exportUrl,
    isProcessing,
    logWarn,
    setError,
  ]);

  // --- ダウンロードハンドラ ---
  // 目的: ダウンロード完了時にユーザーへ通知する
  const handleDownload = useCallback(async () => {
    if (!exportUrl) return;

    const ext = exportExt || 'mp4';
    const isCaptionLayer = exportOutputOptions.contentMode === 'caption-layer';
    const layerFormat = exportOutputOptions.captionLayerFormat;
    const filename = isCaptionLayer
      ? buildCaptionLayerVideoFileName(layerFormat)
      : `turtle_video_${Date.now()}.${ext}`;
    const mimeType = isCaptionLayer
      ? resolveCaptionLayerFormatDescriptor(layerFormat).mimeType
      : (ext === 'webm' ? 'video/webm' : 'video/mp4');
    const fileDescription = isCaptionLayer
      ? resolveCaptionLayerFormatDescriptor(layerFormat).label
      : (ext === 'webm' ? 'WebM 動画' : 'MP4 動画');
    try {
      const result = await saveObjectUrlWithClientFileStrategy({
        sourceUrl: exportUrl,
        descriptor: {
          filename,
          mimeType,
          description: fileDescription,
        },
        supportsShowSaveFilePicker,
      });

      if (
        isCaptionLayer
        && exportOutputOptions.includeSubtitles
        && captions.length > 0
      ) {
        try {
          await downloadSubtitleFiles();
        } catch {
          // 動画は成功しているので字幕失敗は downloadSubtitleFiles 内で通知
        }
      }

      if (result.strategy === 'file-picker') {
        window.alert('ダウンロードが完了しました。');
        showToast('ダウンロードが完了しました');
        return;
      }

      showToast('ダウンロードを開始しました。完了はブラウザの通知をご確認ください。', 5000);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        showToast('ダウンロードをキャンセルしました');
        return;
      }
      setError('ダウンロードに失敗しました');
    }
  }, [
    captions.length,
    downloadSubtitleFiles,
    exportExt,
    exportOutputOptions.captionLayerFormat,
    exportOutputOptions.contentMode,
    exportOutputOptions.includeSubtitles,
    exportUrl,
    setError,
    showToast,
    supportsShowSaveFilePicker,
  ]);

  // --- 時刻フォーマットヘルパー ---
  // 目的: 秒数を「分:秒」形式の文字列に変換
  const formatTime = useCallback((s: number): string => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }, []);

  // --- キャプチャハンドラ ---
  // 目的: プレビューの現在のフレームをPNG画像として保存
  // 再生中の場合は一時停止してからキャプチャする
  const handleCapture = useCallback(async () => {
    // メディアがない場合は何もしない
    if (mediaItems.length === 0) return;
    // エクスポート中はキャプチャ不可
    if (isProcessing) return;

    // 再生中の場合は一時停止
    const wasPlaying = isPlayingRef.current;
    if (wasPlaying) {
      stopAll();
      pause();
    }

    // Canvasからキャプチャ
    const canvas = canvasRef.current;
    if (!canvas) {
      showToast('キャプチャに失敗しました');
      return;
    }

    // 【重要】キャプチャは「シークバーの現在位置のフレーム」を確実に保存する。
    //
    // プレビュー再生中は video 要素を native 再生させたまま drawImage しているだけなので、
    // canvas に載るのは「その瞬間デコーダが持っていたフレーム」で、シークバーの位置とは
    // 数十 ms ずれ得る。特に終端まで再生し切った直後は
    //   - finalizePreviewAtTimelineEnd が currentTime を総尺へスナップする
    //   - 一方で終端判定は総尺 -30ms で先に発火し、video は最終フレーム手前で止まる
    // が重なり、「画面は終端なのに保存画像は 1 フレーム前」になっていた。
    //
    // 対策: 読み取り前に必ず
    //   1. 対象クリップと、その時刻に対応する元動画のソース時刻を解決する
    //   2. video を明示的にそのソース時刻へシークし、デコード完了（seeked）まで待つ
    //   3. 確定した時刻で再描画してから canvas を読む
    // という順序を踏む。終端でも途中停止でも同じ経路で一致する。
    const captureTarget = resolveCaptureFrameTarget(
      mediaItems,
      currentTimeRef.current,
      totalDurationRef.current,
    );

    if (captureTarget.videoId !== null && captureTarget.videoSourceTime !== null) {
      const targetVideo = mediaElementsRef.current[captureTarget.videoId];
      if (targetVideo instanceof HTMLVideoElement) {
        try {
          // 再生直後は paused でもデコーダが先へ進んでいることがあるため、
          // 目標時刻へ十分近い場合を除いて必ず明示シークする。
          if (Math.abs(targetVideo.currentTime - captureTarget.videoSourceTime) > 1 / 240) {
            targetVideo.currentTime = captureTarget.videoSourceTime;
          }
        } catch {
          /* シーク不能なら下の待ちとタイムアウトで従来動作へ落ちる */
        }
        await waitForVideoFrameAtTime(targetVideo, captureTarget.videoSourceTime);
      }
    }

    // 確定したソースフレームで canvas を描き直す（キャプション等の合成も同時刻で揃う）。
    renderPausedPreviewFrameAtTimeRef.current(captureTarget.renderTime);

    // 再描画（および内部で発生し得る追いシーク）が canvas へ反映されるのを待つ。
    await waitForPreviewFrameSettled(mediaElementsRef.current);

    const timestamp = formatTime(currentTimeRef.current).replace(':', 'm') + 's';
    const filename = `turtle_capture_${timestamp}_${Date.now()}`;
    const success = await captureCanvasAsImage(canvas, filename);

    if (success) {
      showToast('キャプチャを保存しました');
    } else {
      showToast('キャプチャに失敗しました');
    }
  }, [mediaItems, isProcessing, stopAll, pause, showToast, formatTime]);

  const openSectionHelp = useCallback((section: SectionHelpKey) => {
    setActiveHelpSection(section);
  }, []);

  const closeSectionHelp = useCallback(() => {
    setActiveHelpSection(null);
  }, []);

  const hiddenPreviewCacheStyle = useMemo<React.CSSProperties>(() => ({
    position: 'fixed',
    top: 0,
    left: 0,
    width: `${canvasWidth}px`,
    height: `${canvasHeight}px`,
    opacity: 0.001,
    pointerEvents: 'none',
    zIndex: -100,
    visibility: 'visible',
  }), [canvasWidth, canvasHeight]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans pb-24 select-none relative">
      <Toast message={toastMessage} onClose={clearToast} />

      {/* 隠しリソースローダー */}
      <MediaResourceLoader
        key={reloadKey}
        mediaItems={mediaItems}
        bgm={bgm}
        narrations={pipelineNarrations}
        onElementLoaded={handleMediaElementLoaded}
        onRefAssign={handleMediaRefAssign}
        onSeeked={handleSeeked}
        onVideoLoadedData={handleVideoLoadedData}
      />
      <video
        ref={previewCacheVideoRef}
        playsInline
        preload="auto"
        crossOrigin="anonymous"
        style={hiddenPreviewCacheStyle}
      />
      {watermarkOverlay.url && (
        <img
          ref={watermarkImageRef}
          src={watermarkOverlay.url}
          alt=""
          aria-hidden="true"
          style={hiddenPreviewCacheStyle}
          onLoad={() => {
            if (!isPlayingRef.current) {
              requestAnimationFrame(() => {
                renderFrame(currentTimeRef.current, false);
              });
            }
          }}
        />
      )}
      {endrollOverlay.url && (
        <img
          ref={endrollImageRef}
          src={endrollOverlay.url}
          alt=""
          aria-hidden="true"
          style={hiddenPreviewCacheStyle}
          onLoad={() => {
            if (!isPlayingRef.current) {
              requestAnimationFrame(() => {
                renderFrame(currentTimeRef.current, false);
              });
            }
          }}
        />
      )}

      {/* AI Modal */}
      <AiModal
        isOpen={showAiModal}
        onClose={handleCloseAiModal}
        aiPrompt={aiPrompt}
        aiScript={aiScript}
        aiScriptLength={aiScriptLength}
        aiVoice={aiVoice}
        aiVoiceStyle={aiVoiceStyle}
        aiNarrationScene={aiNarrationScene}
        isAiLoading={isAiLoading}
        voiceOptions={VOICE_OPTIONS}
        onPromptChange={setAiPrompt}
        onScriptChange={setAiScript}
        onScriptLengthChange={setAiScriptLength}
        onVoiceChange={setAiVoice}
        onVoiceStyleChange={setAiVoiceStyle}
        onNarrationSceneChange={setAiNarrationScene}
        onGenerateScript={generateScript}
        onGenerateSpeech={generateSpeech}
      />

      {/* Settings Modal */}
      <SettingsModal
        appFlavor={appFlavor}
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* SaveLoad Modal */}
      <SaveLoadModal
        isOpen={showProjectManager}
        onClose={() => setShowProjectManager(false)}
        onBeforeLoadProject={() => {
          projectPosterCaptureGenerationRef.current += 1;
          pausePreviewBeforeEdit('load-project');
        }}
        appFlavor={appFlavor}
        onToast={(msg, type) => {
          if (type === 'error') {
            setError(msg);
          } else {
            showToast(msg);
          }
        }}
        saveRuntime={saveRuntime}
      />

      {/* Section Help Modal */}
      <SectionHelpModal
        appFlavor={appFlavor}
        supportsShowSaveFilePicker={supportsShowSaveFilePicker}
        isOpen={activeHelpSection !== null}
        section={activeHelpSection}
        onClose={closeSectionHelp}
      />

      {/* Header */}
      <Header
        onOpenSettings={handleOpenSettingsModal}
        onOpenProjectManager={handleOpenProjectManagerModal}
        onOpenAppHelp={handleOpenAppHelpModal}
      />

      <div className="max-w-md md:max-w-3xl lg:max-w-6xl mx-auto p-4 lg:p-6">
        <ErrorMessage message={errorMsg} count={errorCount} onClose={clearError} />

        <div className="mt-4 lg:grid lg:grid-cols-[1fr_585px] lg:gap-8">
          {/* 左カラム: 編集コントロール（モバイルでは通常の縦並び） */}
          <div className="space-y-6">
            {/* 1. CLIPS */}
            <ClipsSection
              watermarkPanel={uiCapabilities.supportsWatermark ? (
                <OverlaySection
                  watermark={watermarkOverlay}
                  endroll={endrollOverlay}
                  totalDuration={totalDuration}
                  clipsDuration={clipsDuration}
                  currentTime={currentTime}
                  canvasWidth={canvasWidth}
                  canvasHeight={canvasHeight}
                  previewCanvasRef={canvasRef}
                  captionFreeSnapshotRef={captionFreeSnapshotRef}
                  hasNoBgm={!bgm && bgmClips.length === 0}
                  onImageSelect={handleWatermarkImageSelect}
                  onUpdate={withPreviewPause('update-watermark', updateWatermark)}
                  onSetRange={withPreviewPause('set-watermark-range', setWatermarkRange)}
                  onRemoveImage={withPreviewPause('remove-watermark-image', removeWatermarkImage)}
                  onEndrollImageSelect={handleEndrollImageSelect}
                  onEndrollUpdate={withPreviewPause('update-endroll', updateEndroll)}
                  onEndrollRemoveImage={withPreviewPause('remove-endroll-image', removeEndrollImage)}
                />
              ) : undefined}
              mediaItems={mediaItems}
              mediaTimelineRanges={mediaTimelineRanges}
              currentTime={currentTime}
              isClipsLocked={isClipsLocked}
              mediaElements={mediaElementsRef.current as Record<string, HTMLVideoElement | HTMLImageElement>}
              onToggleClipsLock={withPreviewPause('toggle-clips-lock', toggleClipsLock)}
              onMediaUpload={handleMediaUpload}
              onOpenMediaPicker={handleOpenMediaPicker}
              supportsShowOpenFilePicker={shouldUseMediaPicker}
              onAspectRatioChange={handleAspectRatioChange}
              onMoveMedia={handleMoveMedia}
              onRemoveMedia={handleRemoveMedia}
              onToggleMediaLock={withPreviewPause('toggle-media-lock', toggleItemLock)}
              onToggleTransformPanel={withPreviewPause('toggle-transform-panel', handleToggleTransformPanel)}
              onUpdateVideoTrim={handleUpdateVideoTrim}
              onSetVideoTrimFromCurrent={handleSetVideoTrimFromCurrent}
              onUpdateImageDuration={handleUpdateImageDuration}
              onUpdateMediaScale={handleUpdateMediaScale}
              onUpdateMediaPosition={handleUpdateMediaPosition}
              onRotateMedia={handleRotateMedia}
              onUpdateMediaBlur={handleUpdateMediaBlur}
              onResetMediaSetting={handleResetMediaSetting}
              onUpdateMediaVolume={withoutPreviewPause('update-media-volume', updateVolume)}
              onToggleMediaMute={withPreviewPause('toggle-media-mute', toggleMute)}
              onBeforeTransitionEdit={() => pausePreviewBeforeEdit('edit-clip-transition')}
              onUpdateVideoPlaybackSpeed={withPreviewPause('update-video-playback-speed', updateVideoPlaybackSpeed)}
              onUpdateVideoShowSpeedBadge={withPreviewPause('update-video-show-speed-badge', updateVideoShowSpeedBadge)}
              onUpdateVideoSpeedBadgeLabelStyle={withPreviewPause('update-video-speed-badge-label-style', updateVideoSpeedBadgeLabelStyle)}
              onUpdateVideoSpeedBadgePosition={withPreviewPause('update-video-speed-badge-position', updateVideoSpeedBadgePosition)}
              onApplyVideoSpeedBadgePreset={withPreviewPause('apply-video-speed-badge-preset', applyVideoSpeedBadgePreset)}
              onSetAllVideosMuted={withPreviewPause('set-all-videos-muted', setAllVideosMuted)}
              onToggleMediaFadeIn={withPreviewPause('toggle-media-fade-in', toggleFadeIn)}
              onToggleMediaFadeOut={withPreviewPause('toggle-media-fade-out', toggleFadeOut)}
              onUpdateFadeInDuration={withPreviewPause('update-media-fade-in-duration', updateFadeInDuration)}
              onUpdateFadeOutDuration={withPreviewPause('update-media-fade-out-duration', updateFadeOutDuration)}
              onOpenHelp={() => openSectionHelp('clips')}
            />

            {/* 2. BGM SETTINGS */}
            <BgmSection
              bgm={bgm}
              isBgmLocked={isBgmLocked}
              totalDuration={totalDuration}
              onToggleBgmLock={withPreviewPause('toggle-bgm-lock', toggleBgmLock)}
              onBgmUpload={handleBgmUpload}
              onRemoveBgm={withPreviewPause('remove-bgm', removeBgm)}
              onUpdateStartPoint={handleUpdateBgmStart}
              onUpdateDelay={handleUpdateBgmDelay}
              onUpdateVolume={handleUpdateBgmVolume}
              onToggleFadeIn={withPreviewPause('toggle-bgm-fade-in', toggleBgmFadeIn)}
              onToggleFadeOut={withPreviewPause('toggle-bgm-fade-out', toggleBgmFadeOut)}
              onUpdateFadeInDuration={withoutPreviewPause('update-bgm-fade-in-duration', updateBgmFadeInDuration)}
              onUpdateFadeOutDuration={withoutPreviewPause('update-bgm-fade-out-duration', updateBgmFadeOutDuration)}
              formatTime={formatTime}
              onOpenHelp={() => openSectionHelp('bgm')}
              bgmClips={bgmClips}
              currentTime={currentTime}
              onAddBgmClips={handleAddBgmClips}
              onBeforeBgmClipEdit={pausePreviewBeforeEdit}
              onBeforeBgmClipContinuousEdit={clearGeneratedExportForContinuousEdit}
            />

            {/* 3. NARRATION SETTINGS */}
            <NarrationSection
              narrations={narrations}
              offlineMode={offlineMode}
              isNarrationLocked={isNarrationLocked}
              isCaptionLocked={isCaptionLocked}
              totalDuration={totalDuration}
              currentTime={currentTime}
              onToggleNarrationLock={withPreviewPause('toggle-narration-lock', toggleNarrationLock)}
              onAddAiNarration={handleAddAiNarration}
              onEditAiNarration={handleEditAiNarration}
              onNarrationUpload={handleNarrationUpload}
              onRemoveNarration={withPreviewPause('remove-narration', removeNarration)}
              onMoveNarration={withPreviewPause('move-narration', moveNarration)}
              onSaveNarration={handleSaveNarration}
              onAddCaptionsFromNarration={handleAddCaptionsFromNarration}
              captionGeneratingNarrationId={captionGeneratingNarrationId}
              onUpdateStartTime={handleUpdateNarrationStart}
              onSetStartTimeToCurrent={handleSetNarrationStartToCurrent}
              onSetEndTimeToCurrent={handleSetNarrationEndToCurrent}
              onUpdateVolume={handleUpdateNarrationVolume}
              onToggleMute={handleToggleNarrationMute}
              onUpdateTrimStart={handleUpdateNarrationTrimStart}
              onUpdateTrimEnd={handleUpdateNarrationTrimEnd}
              formatTime={formatTime}
              onOpenHelp={() => openSectionHelp('narration')}
            />

            {/* 4. CAPTIONS */}
            <CaptionSection
              captions={captions}
              settings={captionSettings}
              isLocked={isCaptionLocked}
              totalDuration={totalDuration}
              currentTime={currentTime}
              // ミニプレビュー（一括設定・個別設定モーダル）の背景フレームの転写元。
              // プレビュー欄まで往復せずにサイズ・位置を確認できるようにする。
              previewCanvasRef={canvasRef}
              captionFreeSnapshotRef={captionFreeSnapshotRef}
              // 【Issue #216】エクスポート中は「現在位置に先頭を合わせる」の時刻表示を凍結する
              isExporting={isProcessing}
              onToggleLock={withPreviewPause('toggle-caption-lock', toggleCaptionLock)}
              onAddCaption={withPreviewPause('add-caption', addCaption)}
              onUpdateCaption={withPreviewPause('update-caption', updateCaption)}
              onRemoveCaption={withPreviewPause('remove-caption', removeCaption)}
              onMoveCaption={withPreviewPause('move-caption', moveCaption)}
              onClearAllCaptions={withPreviewPause('clear-all-captions', clearAllCaptions)}
              onSetEnabled={withPreviewPause('set-caption-enabled', setCaptionEnabled)}
              onSetFontSize={withPreviewPause('set-caption-font-size', setCaptionFontSize)}
              onSetFontStyle={withPreviewPause('set-caption-font-style', setCaptionFontStyle)}
              onSetFontColor={withPreviewPause('set-caption-font-color', setCaptionFontColor)}
              onSetStrokeColor={withPreviewPause('set-caption-stroke-color', setCaptionStrokeColor)}
              onSetStrokeWidth={withPreviewPause('set-caption-stroke-width', setCaptionStrokeWidth)}
              onSetPosition={withPreviewPause('set-caption-position', setCaptionPosition)}
              onSetBlur={withPreviewPause('set-caption-blur', setCaptionBlur)}
              onSetBackgroundEnabled={withPreviewPause(
                'set-caption-background-enabled',
                setCaptionBackgroundEnabled,
              )}
              onSetBackgroundColor={withPreviewPause(
                'set-caption-background-color',
                setCaptionBackgroundColor,
              )}
              onSetBackgroundOpacity={withPreviewPause(
                'set-caption-background-opacity',
                setCaptionBackgroundOpacity,
              )}
              onSetBackgroundRadius={withPreviewPause(
                'set-caption-background-radius',
                setCaptionBackgroundRadius,
              )}
              onSetBulkFadeIn={withPreviewPause('set-caption-bulk-fade-in', setBulkFadeIn)}
              onSetBulkFadeOut={withPreviewPause('set-caption-bulk-fade-out', setBulkFadeOut)}
              onSetBulkFadeInDuration={withPreviewPause('set-caption-bulk-fade-in-duration', setBulkFadeInDuration)}
              onSetBulkFadeOutDuration={withPreviewPause('set-caption-bulk-fade-out-duration', setBulkFadeOutDuration)}
              onOpenHelp={() => openSectionHelp('caption')}
              formatTime={formatTime}
              onApplyCaptions={withPreviewPause('bulk-apply-captions', replaceCaptions)}
              onShiftCaptions={withPreviewPause('shift-captions', shiftCaptions)}
              isPlaying={isPlaying}
              onTogglePlay={togglePlay}
              onSeekBy={handleStampSeekBy}
              onSeekToSilenceBoundary={handleSeekToSilenceBoundary}
              hasPrevSilenceBoundary={hasPrevSilenceBoundary}
              hasNextSilenceBoundary={hasNextSilenceBoundary}
              silenceRegions={timelineWaveform.silences}
              onUpdateCaptionLive={updateCaption}
              onSetFontSizeCustom={withPreviewPause('set-caption-font-size-custom', setCaptionFontSizeCustom)}
              onSetPositionCustom={withPreviewPause('set-caption-position-custom', setCaptionPositionCustom)}
              videoTitle={videoTitle}
              onUpdateVideoTitle={withPreviewPause('update-video-title', updateVideoTitle)}
              onSetVideoTitleRange={withPreviewPause('set-video-title-range', setVideoTitleRange)}
              onResetVideoTitle={withPreviewPause('reset-video-title', resetVideoTitle)}
            />

          </div>

          {/* 右カラム: プレビュー（モバイルでは下部に表示、PCではスティッキーサイドバー） */}
          <div className="mt-6 lg:mt-0">
            <div className="lg:sticky lg:top-20">
              {/* 5. PREVIEW */}
              <PreviewSection
                appFlavor={appFlavor}
                supportsShowSaveFilePicker={supportsShowSaveFilePicker}
                mediaItems={mediaItems}
                bgm={bgm}
                narrations={pipelineNarrations}
                canvasRef={canvasRef}
                currentTime={currentTime}
                totalDuration={totalDuration}
                clipsDuration={clipsDuration}
                isPlaying={isPlaying}
                isProcessing={isProcessing}
                isLoading={isLoading}
                loadingLabel={previewLoadingLabel}
                exportPreparationStep={exportPreparationStep}
                exportUrl={exportUrl}
                exportExt={exportExt}
                onSeekChange={handleSeekChange}
                onSeekStart={handleSeekStart}
                onSeekEnd={handleSeekEnd}
                onSeekToTime={handleSeekToTime}
                supportsTimelineWaveform={supportsTimelineWaveform}
                timelineWaveform={timelineWaveform}
                onTogglePlay={togglePlay}
                onStop={handleStop}
                onExport={handleExport}
                onDownload={handleDownload}
                onClearAll={handleClearAll}
                onCapture={handleCapture}
                onExportFinalizeTimeout={handleExportFinalizeTimeout}
                onOpenHelp={() => openSectionHelp('preview')}
                formatTime={formatTime}
                projectPosterMode={projectPosterMode}
                projectPosterTimelineTime={projectPosterTimelineTime}
                projectPosterDataUrl={projectPosterDataUrl}
                projectPosterAspectRatio={projectPosterAspectRatio}
                onSetProjectPosterFromCurrent={handleSetProjectPosterFromCurrent}
                onResetProjectPosterToAuto={handleResetProjectPosterToAuto}
                exportOutputOptions={exportOutputOptions}
                onExportOutputOptionsChange={setExportOutputOptions}
                supportsCaptionLayerExport={supportsCaptionLayerExport}
                onDownloadSubtitles={downloadSubtitleFiles}
                hasCaptionsForSubtitleExport={captions.length > 0}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TurtleVideo;
