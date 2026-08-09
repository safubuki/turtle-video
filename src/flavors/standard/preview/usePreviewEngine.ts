/**
 * @file usePreviewEngine.ts (standard flavor)
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description Android / PC (standard) フレーバー専用のプレビュー再生エンジン。
 * renderFrame による Canvas 描画、タイムライン進行、音声ルーティング、
 * トランジション合成、stall 検知とリカバリを担う。
 * apple-safari フレーバーとは物理的に分離されており、このファイルの変更は
 * iOS Safari のプレビューに影響しない。
 */
import { useCallback, useRef, type MutableRefObject } from 'react';

import {
  FPS,
} from '../../../constants';
import { createCaptionGlyphCanvas } from '../../../utils/canvas';
import type {
  AudioTrack,
  Caption,
  CaptionSettings,
  MediaElementsRef,
  MediaItem,
  NarrationClip,
  VideoTitleSettings,
  WatermarkOverlay,
  EndrollOverlay,
} from '../../../types';
import type { ExportPreparationStep, UseExportReturn } from '../../../hooks/export-strategies/types';
import { resolveCaptionFontFamily } from '../../../utils/captionFontCatalog';
import {
  drawCaptionBackgroundBand,
  resolveCaptionAnchor,
  resolveCaptionBackgroundStyle,
  resolveCaptionBaseFontSize,
  resolveCaptionGlyphStyle,
  resolveCaptionLayoutScale,
} from '../../../utils/captionStyle';
import { drawVideoTitleFrame } from '../../../utils/videoTitle';
import { drawWatermarkOverlayFrame } from '../../../utils/watermarkOverlay';
import {
  drawEndrollFrame,
  getEndrollDuration,
  resolveBgmEndrollFadeGain,
} from '../../../utils/endrollOverlay';
import { captureCaptionFreeSnapshot, type CaptionFreeSnapshot } from '../../../utils/canvas';
import {
  applyVideoElementPlaybackRate,
  drawSpeedBadgeFrame,
  resolveExportTimelineWallDivisorForItem,
  resolveSpeedAwareVideoSyncThresholdSec,
  resolveVideoElementPlaybackRateForContext,
  resolveVideoSafeEndSourceTime,
  resolveVideoSourceTime,
  wallDeltaToExportTimelineDelta,
} from '../../../utils/playbackSpeed';
import {
  getIncomingTransitionOverlay,
  getOutgoingTransitionOverlay,
} from '../../../utils/clipTransitions';
import {
  computeTransitionTimelineRanges,
  findActiveTimelineItemWithTransitions,
  getClipOverlapToNext,
  getTimelineAdvanceForItem,
} from '../../../utils/transitionTimeline';
import type { LogCategory } from '../../../stores/logStore';
import { useMediaStore } from '../../../stores';
import {
  isBgmClipId,
  resolveBgmClipsEffectivePlayback,
  resolvePipelineClipEffectivePlayback,
  useAudioStore,
} from '../../../stores/audioStore';
import { useProjectStore } from '../../../stores/projectStore';
import type { PlatformCapabilities } from '../../../utils/platform';
import { collectPlaybackBlockingVideos } from '../../../utils/playbackTimeline';
import { isCaptionActiveAtTime, resolveCaptionDisplaySegment } from '../../../utils/captionTimeline';
import {
  getExportFrameTiming,
  resolveExportDuration,
  resolveFrameDrivenExportTimeSec,
  shouldUseFrameDrivenExportPacing,
  evaluateFrameDrivenExportStall,
} from '../../../utils/exportTimeline';
import { createRenderedFrameTracker } from '../../../utils/exportDiagnostics';
import { createExportFrameProfiler } from '../../../utils/exportFrameProfiler';
import { resolveMediaBaseScale } from '../../../stores/canvasStore';
import {
  normalizeRotation,
  prepareUniformMediaBlurSource,
  resolveMediaBlurPixels,
  resolveMediaBlurFilter,
  resolveRotatedFitDimensions,
} from '../../../utils/canvas';
import {
  ANDROID_PREVIEW_RESYNC_THRESHOLD_SEC,
  ANDROID_PREVIEW_SOFT_DRAW_DRIFT_THRESHOLD_SEC,
  EXPORT_IMAGE_TO_VIDEO_STABILIZATION_SYNC_TOLERANCE_SEC,
  getPreviewAudioOutputMode,
  getPreviewVideoSyncThreshold,
  shouldAttemptDeferredPreviewPlay,
  shouldBlackoutVideoFadeTail,
  shouldBundlePreviewStartForWebAudioMix,
  shouldHoldFrameForImageToVideoExportTransition,
  shouldHoldVideoFrameAtClipEnd,
  shouldKeepInactiveVideoPrewarmed,
  shouldMuteNativeMediaElement,
  shouldPrimeFutureInactiveVideoInPreview,
  getAndroidPreviewRecoveryDecision,
  getStandardPreviewStallKickDecision,
  shouldDrawFadeStallSnapshotFrame,
  shouldRecoverAudioOnlyAfterVideoBoundary,
  shouldReinitializeAudioRoute,
  shouldRetryAudioOnlyPrimeAtPreviewStart,
  shouldStabilizeImageToVideoTransitionDuringExport,
  shouldStopBeforePreviewAudioRouteInit,
  shouldUseCaptionBlurFallback,
  shouldAvoidPauseInactiveVideoInPreview,
  type PreviewPlatformPolicy,
} from './previewPlatform';
import { getStandardPreviewNow } from './playbackClock';
import type { ResetInactiveVideosOptions } from './useInactiveVideoManager';
import {
  clampPreviewAudioGain,
  resolvePreviewAudioGain,
  resolvePreviewBgmGain,
} from './usePreviewAudioSession';
import type {
  PreviewCacheEntry,
  PreviewCacheStatus,
} from './androidPreviewCache';

type LogFn = (category: LogCategory, message: string, details?: Record<string, unknown>) => void;

interface PreparedPreviewAudioNodesResult {
  activeVideoId: string | null;
  audibleSourceCount: number;
  requiresWebAudio: boolean;
}

interface UsePreviewEngineParams {
  captions: Caption[];
  captionSettings: CaptionSettings;
  /**
   * 動画タイトル（Issue #211）。描画自体は videoTitleRef から読むが、
   * 変更でプレビューを再描画させるため値としても受け取る（captionSettings と同じ理由）。
   */
  videoTitle: VideoTitleSettings;
  /** ウォーターマーク。停止中の編集反映のため値としても受け取る */
  watermarkOverlay?: WatermarkOverlay;
  mediaItemsRef: MutableRefObject<MediaItem[]>;
  bgmRef: MutableRefObject<AudioTrack | null>;
  narrationsRef: MutableRefObject<NarrationClip[]>;
  captionsRef: MutableRefObject<Caption[]>;
  captionSettingsRef: MutableRefObject<CaptionSettings>;
  /** 動画タイトル（Issue #211）。キャプションとは別管理で 1 件だけ描画する */
  videoTitleRef: MutableRefObject<VideoTitleSettings>;
  watermarkOverlayRef?: MutableRefObject<WatermarkOverlay>;
  watermarkImageRef?: MutableRefObject<HTMLImageElement | null>;
  /** エンドロール（クリップ後に続く単色背景 + ロゴ）。無効時は尺 0 で従来どおり */
  endrollOverlayRef?: MutableRefObject<EndrollOverlay>;
  endrollImageRef?: MutableRefObject<HTMLImageElement | null>;
  /** クリップだけの尺。エンドロール区間の判定境界に使う */
  clipsDurationRef?: MutableRefObject<number>;
  /**
   * キャプションを描く直前のフレームを保存する先（キャプション設定のミニプレビュー用）。
   * メインプレビューの canvas を直接転写すると焼き込み済みキャプションと二重になるため、
   * キャプション抜きの状態をここへ控える。
   */
  captionFreeSnapshotRef?: MutableRefObject<CaptionFreeSnapshot>;
  totalDurationRef: MutableRefObject<number>;
  currentTimeRef: MutableRefObject<number>;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  mediaElementsRef: MutableRefObject<MediaElementsRef>;
  audioCtxRef: MutableRefObject<AudioContext | null>;
  sourceNodesRef: MutableRefObject<Record<string, MediaElementAudioSourceNode>>;
  gainNodesRef: MutableRefObject<Record<string, GainNode>>;
  masterDestRef: MutableRefObject<MediaStreamAudioDestinationNode | null>;
  audioRoutingModeRef: MutableRefObject<'preview' | 'export'>;
  reqIdRef: MutableRefObject<number | null>;
  startTimeRef: MutableRefObject<number>;
  audioResumeWaitFramesRef: MutableRefObject<number>;
  recorderRef: MutableRefObject<MediaRecorder | null>;
  loopIdRef: MutableRefObject<number>;
  isPlayingRef: MutableRefObject<boolean>;
  isSeekingRef: MutableRefObject<boolean>;
  isSeekPlaybackPreparingRef: MutableRefObject<boolean>;
  activeVideoIdRef: MutableRefObject<string | null>;
  videoRecoveryAttemptsRef: MutableRefObject<Record<string, number>>;
  exportPlayFailedRef: MutableRefObject<Record<string, boolean>>;
  exportFallbackSeekAtRef: MutableRefObject<Record<string, number>>;
  seekingVideosRef: MutableRefObject<Set<string>>;
  pendingSeekRef: MutableRefObject<number | null>;
  wasPlayingBeforeSeekRef: MutableRefObject<boolean>;
  pendingSeekTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  previewPlaybackAttemptRef: MutableRefObject<number>;
  requestPreviewAudioRouteRefreshRef: MutableRefObject<() => void>;
  primePreviewAudioOnlyTracksAtTimeRef: MutableRefObject<(playbackTime: number) => void>;
  endFinalizedRef: MutableRefObject<boolean>;
  previewCacheEnabled?: boolean;
  previewCacheKeyRef?: MutableRefObject<string | null>;
  previewCacheStatusRef?: MutableRefObject<PreviewCacheStatus>;
  previewCacheEntryRef?: MutableRefObject<PreviewCacheEntry | null>;
  previewCacheVideoRef?: MutableRefObject<HTMLVideoElement | null>;
  previewCacheGenerationRef?: MutableRefObject<number>;
  previewCachePlaybackActiveRef?: MutableRefObject<boolean>;
  previewCacheHasBuiltOnceRef?: MutableRefObject<boolean>;
  setPreviewCacheStatus?: (status: PreviewCacheStatus) => void;
  setPreviewLoadingLabel?: (label?: string) => void;
  previewPlatformPolicy: PreviewPlatformPolicy;
  platformCapabilities: Pick<PlatformCapabilities, 'isAndroid' | 'isIosSafari'>;
  setVideoDuration: (id: string, duration: number) => void;
  setCurrentTime: (time: number) => void;
  setProcessing: (processing: boolean) => void;
  setPreviewPlaying: (playing: boolean) => void;
  setLoading: (loading: boolean) => void;
  setExportPreparationStep: (step: ExportPreparationStep | null) => void;
  setExportUrl: (url: string | null) => void;
  setExportExt: (ext: 'mp4' | 'webm') => void;
  clearExport: () => void;
  setError: (message: string) => void;
  play: () => void;
  pause: () => void;
  getAudioContext: () => AudioContext;
  cancelPendingPausedSeekWait: () => void;
  cancelPendingSeekPlaybackPrepare: () => void;
  detachGlobalSeekEndListeners: () => void;
  ensureAudioNodeForElement: (id: string, mediaEl: HTMLMediaElement) => boolean;
  detachAudioNode: (id: string) => void;
  preparePreviewAudioNodesForTime: (time: number) => PreparedPreviewAudioNodesResult;
  preparePreviewAudioNodesForUpcomingVideos: (fromTime: number) => void;
  primePreviewAudioOnlyTracksAtTime: (playbackTime: number) => void;
  resetInactiveVideos: (options?: ResetInactiveVideosOptions) => void;
  startWebCodecsExport: UseExportReturn['startExport'];
  stopWebCodecsExport: UseExportReturn['stopExport'];
  completeWebCodecsExport: UseExportReturn['completeExport'];
  startPreviewCacheExport?: UseExportReturn['startExport'];
  stopPreviewCacheExport?: UseExportReturn['stopExport'];
  completePreviewCacheExport?: UseExportReturn['completeExport'];
  logInfo: LogFn;
  logWarn: LogFn;
  logDebug: LogFn;
  /**
   * エクスポート後に共有 <video>/<audio> DOM を作り直す（MediaResourceLoader remount）。
   * 同一要素上の hard src reset では Chromium の decoder wedge が再発するため Issue #209 の本命経路。
   */
  remountSharedPreviewMedia?: () => Promise<'ready' | 'timeout' | 'cancelled'>;
}

interface UsePreviewEngineResult {
  handleMediaElementLoaded: (id: string, element: HTMLVideoElement | HTMLImageElement | HTMLAudioElement) => void;
  handleSeeked: () => void;
  handleVideoLoadedData: () => void;
  renderFrame: (time: number, isActivePlaying?: boolean, isExporting?: boolean) => boolean;
  stopAll: () => void;
  loop: (isExportMode: boolean, myLoopId: number) => void;
  startEngine: (fromTime: number, isExportMode: boolean) => Promise<void>;
}

type PreviewEngineMode =
  | 'idle'
  | 'preview'
  | 'export'
  | 'preview-cache-build'
  | 'preview-cache-playback';

const resetNativeMediaAudioState = (mediaEl: HTMLMediaElement) => {
  mediaEl.defaultMuted = false;
  mediaEl.muted = false;
  mediaEl.volume = 1;
};

const silencePreviewBgmOutput = (
  mediaElementsRef: MutableRefObject<MediaElementsRef>,
  gainNodesRef: MutableRefObject<Record<string, GainNode>>,
  audioCtxRef: MutableRefObject<AudioContext | null>,
) => {
  const bgmEl = mediaElementsRef.current.bgm as HTMLAudioElement | undefined;
  if (bgmEl) {
    try {
      bgmEl.defaultMuted = false;
      bgmEl.muted = false;
      bgmEl.volume = 0;
      bgmEl.pause();
    } catch {
      /* ignore */
    }
  }

  const ctx = audioCtxRef.current;
  const bgmGain = gainNodesRef.current.bgm;
  if (bgmGain && ctx) {
    try {
      bgmGain.gain.setValueAtTime(0, ctx.currentTime);
    } catch {
      /* ignore */
    }
  }
};

export const applyPreviewAudioOutputState = (
  policy: PreviewPlatformPolicy,
  mediaEl: HTMLMediaElement,
  options: {
    hasAudioNode: boolean;
    desiredVolume: number;
    audibleSourceCount: number;
    isExporting: boolean;
    baseVolume?: number;
  },
) => {
  const sourceType = mediaEl.tagName === 'AUDIO' ? 'audio' : 'video';
  const outputMode = getPreviewAudioOutputMode(policy, {
    hasAudioNode: options.hasAudioNode,
    isExporting: options.isExporting,
    audibleSourceCount: options.audibleSourceCount,
    desiredVolume: options.desiredVolume,
    baseVolume: options.baseVolume,
    sourceType,
  });
  const shouldMuteNative =
    outputMode === 'webaudio'
      && shouldMuteNativeMediaElement(policy, {
        hasAudioNode: options.hasAudioNode,
        isExporting: options.isExporting,
      });

  // エクスポート中に WebAudio ノードを持たない要素は、ソースノードで
  // スピーカー出力が横取りされないため native 再生がそのまま漏れる。
  // 出力音声は OfflineAudioContext で別途生成されており、この要素の live 再生は
  // ファイルに入らない（＝スピーカーから聞こえるだけ）ため、必ず無音にする。
  const shouldSilenceUncapturedDuringExport =
    options.isExporting && outputMode === 'webaudio' && !options.hasAudioNode;

  if (shouldMuteNative && options.hasAudioNode) {
    mediaEl.defaultMuted = false;
    mediaEl.muted = false;
    mediaEl.volume = 0;
  } else if (shouldSilenceUncapturedDuringExport) {
    mediaEl.defaultMuted = true;
    mediaEl.muted = true;
    mediaEl.volume = 0;
  } else {
    mediaEl.defaultMuted = shouldMuteNative;
    mediaEl.muted = shouldMuteNative;
    mediaEl.volume = outputMode === 'native'
      ? Math.max(0, Math.min(1, options.desiredVolume))
      : 1;
  }

  return outputMode;
};

const findNextVideoItem = (items: MediaItem[], activeIndex: number): MediaItem | null => {
  if (activeIndex < 0 || activeIndex + 1 >= items.length) {
    return null;
  }

  return items.slice(activeIndex + 1).find((item) => item.type === 'video') ?? null;
};

// HTMLMediaElement.HAVE_METADATA: currentTime を安全に合わせ直せる最小 readyState。
const MIN_VIDEO_READY_STATE_FOR_SEEK = 1;
// HTMLMediaElement.HAVE_CURRENT_DATA: canvas 描画と play retry を始められる最小 readyState。
const MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME = 2;
// 再生開始前に許容する currentTime のずれ。既存 preview sync しきい値より厳しく合わせる。
const PREVIEW_START_READY_SYNC_TOLERANCE_SEC = 0.05;
// Android preview の trim 済み video 先頭だけは厳しめに currentTime を合わせてカクつきを抑える。
const PREVIEW_ANDROID_BGM_SOFT_SYNC_TOLERANCE_SEC = 0.3;
// 次動画を trimStart に合わせ直す際の許容ずれ。ブラウザの自然な buffering を尊重しつつ
// 大きく外れているときだけ補正する。
const STANDARD_PREVIEW_NEXT_VIDEO_PREWARM_DRIFT_TOLERANCE_SEC = 0.05;
// 描画不能時に last stable frame を許容する上限。問題を hold で隠さないよう 200ms で打ち切る。
const PREVIEW_ANDROID_PASSIVE_HOLD_MAX_SEC = 0.2;
// recovery seek は Android Chrome の seek 連打を避けるため 1 秒以上あける。
const PREVIEW_ANDROID_RECOVERY_MIN_INTERVAL_MS = 1000;
// timeline drift が 0.8s を超える明確な破綻時だけ recovery seek を許可する。
const PREVIEW_ANDROID_RECOVERY_DRIFT_THRESHOLD_SEC = 0.8;
// 境界通過直後 500ms は media clock の自然再生に任せ、recovery seek を抑止する。
const PREVIEW_ANDROID_RECOVERY_SKIP_AFTER_BOUNDARY_SEC = 0.5;
// recovery seek は最低間隔 (1秒) を守りつつ、1 segment あたり最大 3 回まで再試行を許可する。
// 旧実装の「1 回限り」は、その 1 回が失敗すると区間まるごとフリーズする穴があった。
const PREVIEW_ANDROID_RECOVERY_MAX_SEEKS_PER_SEGMENT = 3;
// stall watchdog の状態は rAF の連続性 (250ms 以内の再評価) を前提に保持する。
// それ以上途切れたら境界跨ぎ・タブ非表示などとみなし、stall 計測をやり直す。
const PREVIEW_STALL_STATE_CONTINUITY_MS = 250;
// fade 用の非黒スナップショットは 200ms ごとに取り直す (毎フレームの drawImage 二重化を避ける)。
const PREVIEW_FADE_STALL_SNAPSHOT_INTERVAL_MS = 200;
const PREVIEW_FADE_STALL_HOLD_LOG_INTERVAL_MS = 1000;
const PREVIEW_END_THRESHOLD_SEC = 0.03;
// プレビュー開始時、active/先頭 video が warmup 目標より大きく先行した位置（エクスポート等で
// 終端まで再生され ended で残った状態）にある場合に load() で decoder をリセットする閾値。
// 通常の warmup シーク（±0.2s 程度）では発火せず、明らかな取り残し（終端付近）だけを対象にする。
const PREVIEW_STRANDED_SEEK_RESET_THRESHOLD_SEC = 0.5;

/**
 * プレビュー開始 warmup で、active/先頭 video の decoder を load() でリセットすべきか判定する純ロジック。
 *
 * - `readyState === 0`: メタデータ未取得。従来どおり load() で読み込ませる。
 * - `ended` もしくは warmup 目標を大きく超えた currentTime: エクスポート等で終端まで再生された
 *   取り残し状態。この位置から先頭へ巻き戻すと Chrome で逆方向シークが settle せず、
 *   preflight 早期判定→ループ側の毎フレーム再シークで黒フレーム点滅を起こす（Issue #209）。
 *   load() で一度クリーンにリセットしてから warmup シークを待たせる。
 */
export function shouldResetStrandedPreviewVideo(input: {
  readyState: number;
  ended: boolean;
  currentTime: number;
  warmupTargetTime: number;
  strandedThresholdSec?: number;
}): boolean {
  const threshold = input.strandedThresholdSec ?? PREVIEW_STRANDED_SEEK_RESET_THRESHOLD_SEC;
  if (input.readyState === 0) return true;
  if (input.ended) return true;
  return input.currentTime > input.warmupTargetTime + threshold;
}

// active video のデコード停止（readyState が 1 以下 + seeking のまま）が「継続している」と
// みなすまでの猶予。通常の seek は数十〜百数十ms で settle するため、これを超えて
// readyState が上がらない場合だけを異常な stall として recover 対象にする。
const PREVIEW_DECODE_STALL_RECOVER_AFTER_MS = 300;
// recover（load()+reseek）の最短間隔。連続再試行で load ループに陥らないよう throttle する。
const PREVIEW_DECODE_STALL_RECOVER_THROTTLE_MS = 1200;

/**
 * 再生中 active video が「Canvas に描ける状態でない」まま張り付いているか。
 * Issue #209 再発: readyState1+seeking 固着で videoCT だけ進む。
 * paused 単体は stall に含めない（hard reset 直後の pause を再 reset ループにしない）。
 * paused 放置は play() 経路で扱う。
 */
export function isActiveVideoUndrawableForStall(input: {
  readyState: number;
  seeking: boolean;
  paused?: boolean;
  videoWidth: number;
  videoHeight: number;
}): boolean {
  if (input.readyState < MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME) return true;
  if (input.seeking) return true;
  if (input.videoWidth <= 0 || input.videoHeight <= 0) return true;
  return false;
}

/**
 * 再生中 active video のデコード停止を検知し、load() による decoder リセットで復旧すべきか判定する純ロジック。
 *
 * 症状（Issue #209 / エクスポート後プレビュー）:
 * - `readyState` が低い / `seeking` 残留 / 寸法 0 / paused 残留で描画不能
 * - wall-clock（スライダー）は進むのに映像が更新されない
 * 通常の seek は短時間で settle するため、stall 継続時間が猶予を超え、かつ throttle 間隔を空けたときだけ
 * recover する（`seeked` 待ちの正常状態を誤って壊さない）。
 *
 * @returns recover すべきなら true。呼び出し側は load()+目標への reseek を行う。
 */
export function shouldRecoverDecodeStalledActiveVideo(input: {
  isActivePlaying: boolean;
  isExporting: boolean;
  isUserSeeking: boolean;
  hasError: boolean;
  readyState: number;
  seeking: boolean;
  /** 省略時は readyState<=1 && seeking のみ（後方互換）。指定時は描画不能条件を広く見る。 */
  paused?: boolean;
  videoWidth?: number;
  videoHeight?: number;
  nowMs: number;
  stallSinceMs: number | null;
  lastRecoverAtMs: number;
  stallGraceMs?: number;
  throttleMs?: number;
}): boolean {
  if (!input.isActivePlaying || input.isExporting || input.isUserSeeking || input.hasError) {
    return false;
  }
  const useExtended =
    input.paused !== undefined
    || input.videoWidth !== undefined
    || input.videoHeight !== undefined;
  const isStalled = useExtended
    ? isActiveVideoUndrawableForStall({
      readyState: input.readyState,
      seeking: input.seeking,
      paused: input.paused ?? false,
      videoWidth: input.videoWidth ?? 0,
      videoHeight: input.videoHeight ?? 0,
    })
    : (input.readyState <= 1 && input.seeking);
  if (!isStalled || input.stallSinceMs === null) return false;
  const grace = input.stallGraceMs ?? PREVIEW_DECODE_STALL_RECOVER_AFTER_MS;
  const throttle = input.throttleMs ?? PREVIEW_DECODE_STALL_RECOVER_THROTTLE_MS;
  if (input.nowMs - input.stallSinceMs < grace) return false;
  if (input.nowMs - input.lastRecoverAtMs < throttle) return false;
  return true;
}

/** エクスポート直後の video decoder リセットで metadata 待ちに使う既定タイムアウト。 */
export const POST_EXPORT_VIDEO_RESET_TIMEOUT_MS = 4500;
/** 再生中の seek-stall 復旧を急かす（ログ実測では 300ms 猶予でも recover が間に合わず黒点滅が継続）。 */
const PREVIEW_DECODE_STALL_RECOVER_AFTER_MS_POST_EXPORT = 180;
/**
 * post-export guard 中に連続で描画できたフレーム数。
 * 2026-07-24 previewlog2: 8 フレーム（~80ms）で clear すると直後に readyState1+seeking 再 wedge。
 * remount 後も短い偽 drawable を弾くため多めに取る。
 */
export const POST_EXPORT_DRAWABLE_FRAMES_TO_CLEAR_GUARD = 45;
/** remount 完了待ちの既定タイムアウト（MediaResourceLoader 再生成 + metadata）。 */
export const POST_EXPORT_MEDIA_REMOUNT_TIMEOUT_MS = 5000;

export type ResetSharedPreviewVideoMode = 'load' | 'hard';

/**
 * remount 後に共有 video が mediaElementsRef に揃い、metadata が立つまで待つ（Issue #209）。
 * TurtleVideo の setReloadKey + 本 helper で、同一 DOM 上の hard reset では潰せない decoder wedge を回避する。
 */
export async function waitForSharedPreviewMediaRemount(options: {
  getVideoItems: () => Array<{ id: string; trimStart?: number }>;
  getVideoElement: (id: string) => HTMLVideoElement | undefined;
  shouldContinue: () => boolean;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<'ready' | 'timeout' | 'cancelled'> {
  const timeoutMs = options.timeoutMs ?? POST_EXPORT_MEDIA_REMOUNT_TIMEOUT_MS;
  const pollMs = options.pollMs ?? 40;
  const waitUntil = Date.now() + timeoutMs;

  while (Date.now() < waitUntil) {
    if (!options.shouldContinue()) return 'cancelled';
    const videos = options.getVideoItems();
    if (videos.length === 0) return 'ready';

    let allReady = true;
    for (const item of videos) {
      const el = options.getVideoElement(item.id);
      if (!el || el.readyState < MIN_VIDEO_READY_STATE_FOR_SEEK || el.error) {
        allReady = false;
        break;
      }
    }
    if (allReady) {
      for (const item of videos) {
        const el = options.getVideoElement(item.id);
        if (!el) continue;
        const target = Number.isFinite(item.trimStart) ? Math.max(0, item.trimStart!) : 0;
        try {
          if (Math.abs(el.currentTime - target) > PREVIEW_START_READY_SYNC_TOLERANCE_SEC) {
            el.currentTime = target;
          }
        } catch {
          /* ignore */
        }
      }
      return 'ready';
    }
    await new Promise<void>((r) => setTimeout(r, pollMs));
  }
  return options.shouldContinue() ? 'timeout' : 'cancelled';
}

/**
 * 共有 <video> の decoder をリセットし、目標時刻へ seek 完了まで待つ（Issue #209）。
 *
 * - `load`: src を維持したまま load()（MediaElementSource を壊さない軽量経路）
 * - `hard`: src を一度外して再設定し、Chrome の wedge した decoder を作り直す。
 *   2026-07-24 実機ログでは load のみの eager reset 後も再生 1 秒で readyState1+seeking 固着したため hard を本命にする。
 *   previewlog2 では hard でも再 wedge するため、主経路は MediaResourceLoader remount（waitForSharedPreviewMediaRemount）。
 */
export async function resetSharedPreviewVideoElement(
  videoElement: HTMLVideoElement,
  targetTime: number,
  shouldContinue: () => boolean,
  timeoutMs = POST_EXPORT_VIDEO_RESET_TIMEOUT_MS,
  mode: ResetSharedPreviewVideoMode = 'hard',
): Promise<'ready' | 'timeout' | 'cancelled'> {
  const safeTarget = Number.isFinite(targetTime) ? Math.max(0, targetTime) : 0;
  const preservedSrc =
    videoElement.getAttribute('src')
    || videoElement.currentSrc
    || '';

  try {
    videoElement.pause();
  } catch {
    /* ignore */
  }

  try {
    if (mode === 'hard' && preservedSrc) {
      // decoder を完全に捨てる。MediaElementSource は element に紐づくため src 再設定は安全。
      videoElement.removeAttribute('src');
      videoElement.load();
      await new Promise<void>((r) => setTimeout(r, 0));
      if (!shouldContinue()) return 'cancelled';
      videoElement.src = preservedSrc;
      videoElement.preload = 'auto';
      videoElement.load();
    } else {
      videoElement.load();
    }
  } catch {
    /* ignore */
  }

  const waitUntil = Date.now() + timeoutMs;
  const pollMs = 40;

  // metadata 待ち
  while (Date.now() < waitUntil) {
    if (!shouldContinue()) return 'cancelled';
    if (videoElement.error) return 'timeout';
    if (videoElement.readyState >= MIN_VIDEO_READY_STATE_FOR_SEEK) break;
    await new Promise<void>((r) => setTimeout(r, pollMs));
  }
  if (!shouldContinue()) return 'cancelled';
  if (videoElement.readyState < MIN_VIDEO_READY_STATE_FOR_SEEK) return 'timeout';

  try {
    if (Math.abs(videoElement.currentTime - safeTarget) > PREVIEW_START_READY_SYNC_TOLERANCE_SEC) {
      videoElement.currentTime = safeTarget;
    }
  } catch {
    /* ignore */
  }

  // seek + 描画可能フレーム待ち（readyState>=2 かつ寸法あり、seeking でない）
  while (Date.now() < waitUntil) {
    if (!shouldContinue()) return 'cancelled';
    if (videoElement.error) return 'timeout';
    const drift = Math.abs(videoElement.currentTime - safeTarget);
    if (
      !videoElement.seeking
      && videoElement.readyState >= MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME
      && videoElement.videoWidth > 0
      && videoElement.videoHeight > 0
      && drift <= PREVIEW_START_READY_SYNC_TOLERANCE_SEC
    ) {
      // デコーダを温める: 無音で一瞬 play→pause（描画可能を維持したまま）
      try {
        const prevMuted = videoElement.muted;
        videoElement.muted = true;
        await videoElement.play().catch(() => undefined);
        if (!shouldContinue()) return 'cancelled';
        videoElement.pause();
        videoElement.muted = prevMuted;
        if (Math.abs(videoElement.currentTime - safeTarget) > PREVIEW_START_READY_SYNC_TOLERANCE_SEC) {
          videoElement.currentTime = safeTarget;
          await new Promise<void>((r) => setTimeout(r, 40));
        }
      } catch {
        /* ignore */
      }
      if (
        !videoElement.seeking
        && videoElement.readyState >= MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME
        && videoElement.videoWidth > 0
      ) {
        return 'ready';
      }
    }
    await new Promise<void>((r) => setTimeout(r, pollMs));
  }
  return shouldContinue() ? 'timeout' : 'cancelled';
}

/**
 * 同期版 hard reset（renderFrame 内から呼ぶ）。await できないため load/src 再設定だけ行い、
 * 次フレーム以降の readyState 上昇に任せる。
 */
export function kickHardResetPreviewVideoElement(
  videoElement: HTMLVideoElement,
  targetTime: number,
): void {
  const preservedSrc =
    videoElement.getAttribute('src')
    || videoElement.currentSrc
    || '';
  try {
    videoElement.pause();
  } catch {
    /* ignore */
  }
  try {
    if (preservedSrc) {
      videoElement.removeAttribute('src');
      videoElement.load();
      videoElement.src = preservedSrc;
      videoElement.preload = 'auto';
    }
    videoElement.load();
  } catch {
    /* ignore */
  }
  const reseek = () => {
    try {
      if (videoElement.readyState >= MIN_VIDEO_READY_STATE_FOR_SEEK && Number.isFinite(targetTime)) {
        videoElement.currentTime = Math.max(0, targetTime);
      }
    } catch {
      /* ignore */
    }
    videoElement.removeEventListener('loadedmetadata', reseek);
    videoElement.removeEventListener('loadeddata', reseek);
  };
  videoElement.addEventListener('loadedmetadata', reseek);
  videoElement.addEventListener('loadeddata', reseek);
  window.setTimeout(reseek, 80);
}

/** hard reset 直後の play 抑止時間。decoder が metadata を上げる前に play すると再 wedge しやすい。 */
export const POST_EXPORT_PLAY_SUPPRESS_AFTER_HARD_RESET_MS = 350;

// フレーム駆動エクスポートで VideoEncoder への投入が停滞したとみなすまでの許容時間。
// これを超えて投入数が進まない場合は壁時計ペーシングへフォールバックし、
// 「書き出し準備中」から進まないハングを防ぐ。
const FRAME_DRIVEN_EXPORT_STALL_TIMEOUT_MS = 2000;
// 再生開始直後は seeked / canplay の到着を数フレームだけ待ち、遅ければ loop を止めない。
const PREVIEW_START_READY_POLL_INTERVAL_MS = 40;
const PREVIEW_START_READY_TIMEOUT_MS = 800;
const DISPLAY_TIME_CLAMP_EPSILON_SEC = 0.001;
const PREVIEW_DETAILED_TICK_LOG_INTERVAL_MS = 500;
const MIN_VIDEO_READY_STATE_FOR_PLAY = MIN_VIDEO_READY_STATE_FOR_SEEK;

type PreviewLogMode = 'smooth' | 'detailed' | 'boundary';

const resolvePreviewLogMode = (): PreviewLogMode => {
  if (typeof globalThis === 'undefined') {
    return 'smooth';
  }

  let mode: string | null = null;
  try {
    mode = globalThis.localStorage?.getItem('preview.log.mode') ?? null;
  } catch {
    mode = null;
  }
  if (mode === 'detailed') {
    return 'detailed';
  }
  if (mode === 'boundary') {
    return 'boundary';
  }

  return 'smooth';
};

const isPreviewDiagnosticsLogMode = (mode: PreviewLogMode): boolean => mode !== 'smooth';

let previewExportSessionSequence = 0;

const createPreviewExportSessionId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const randomValues = new Uint32Array(4);
    globalThis.crypto.getRandomValues(randomValues);
    return `preview-export-${Date.now()}-${Array.from(randomValues).join('-')}`;
  }

  previewExportSessionSequence += 1;
  return `preview-export-${Date.now()}-${previewExportSessionSequence}`;
};
interface BoundaryDiagState {
  boundaryGlobalTimeMs: number;
  enterRafNowMs: number;
  previousId: string | null;
  activeId: string | null;
  segmentIndex: number;
  trimStart: number;
  prerollStartedAtMs: number | null;
  prerollTargetSec: number | null;
  prerollLeadSec: number | null;
  readyStateAtBoundary: number | null;
  seekingAtBoundary: boolean | null;
  pausedAtBoundary: boolean | null;
  currentTimeAtBoundary: number | null;
  targetTimeAtBoundary: number | null;
  driftAtBoundaryMs: number | null;
  prerollArmed: boolean;
  maxFrameGapMs: number;
  holdFrameCount: number;
  clockAbsorbMs: number;
  isAutoSaveRunningAtBoundary: boolean;
  isProjectSavingAtBoundary: boolean;
  isProjectLoadingAtBoundary: boolean;
  samplePhasesDone: Set<string>;
  smoothPlanEmitted: boolean;
  currentTimeAt100ms: number | null;
  targetTimeAt100ms: number | null;
  readyStateAt100ms: number | null;
  seekingAt100ms: boolean | null;
  pausedAt100ms: boolean | null;
  readyStateAt200ms: number | null;
  seekingAt200ms: boolean | null;
}

interface NextVideoPrebufferDiagState {
  videoId: string;
  startedAtMs: number;
  targetSec: number;
  leadSec: number | null;
  armed: boolean;
}

// Android 実機で一発 play が落ちても数回は吸収するための retry 設定。
const PREVIEW_PLAY_RETRY_INTERVAL_MS = 160;
const PREVIEW_PLAY_RETRY_MAX_ATTEMPTS = 4;
const ANDROID_PREVIEW_HOLD_LOG_INTERVAL_MS = 1000;

/**
 * standard preview の開始直後に `play()` が一発失敗しても置き去りにしないための retry。
 * 呼び出し側は `shouldContinue()` で loop 世代や seek 状態を監視し、古い再生試行を自然終了させる。
 */
const requestVideoPlayWithRetry = (
  videoElement: HTMLVideoElement,
  shouldContinue: () => boolean,
  retryIntervalMs = PREVIEW_PLAY_RETRY_INTERVAL_MS,
  minReadyState = MIN_VIDEO_READY_STATE_FOR_PLAY,
) => {
  const tryPlay = (currentAttempt: number) => {
    if (!shouldContinue() || !videoElement.paused) return;
    if (videoElement.readyState === 0 && !videoElement.error) {
      try {
        videoElement.load();
      } catch {
        /* ignore */
      }
    }
    if (videoElement.readyState >= minReadyState && !videoElement.seeking) {
      videoElement.play().catch(() => {
        // play() の失敗要因は毎回変わりうるため、次回 retry 時に readyState / seeking を再評価する。
        if (currentAttempt < PREVIEW_PLAY_RETRY_MAX_ATTEMPTS) {
          setTimeout(() => tryPlay(currentAttempt + 1), retryIntervalMs);
        }
      });
      return;
    }
    if (currentAttempt < PREVIEW_PLAY_RETRY_MAX_ATTEMPTS) {
      setTimeout(() => tryPlay(currentAttempt + 1), retryIntervalMs);
    }
  };
  tryPlay(1);
};

const canDrawVideo = (video: HTMLVideoElement): boolean => (
  video.readyState >= MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME
  && !video.seeking
  && video.videoWidth > 0
  && video.videoHeight > 0
);

/**
 * standard preview の startEngine で、active video が seek 完了・描画可能 readyState に入るまで短時間待機する。
 * timeout やキャンセル時も resolve して呼び出し元へ制御を返し、古い試行は `shouldContinue()` 側で打ち切る。
 */
const waitForPreviewStartVideoReady = async (
  videoElement: HTMLVideoElement,
  targetTime: number,
  shouldContinue: () => boolean,
): Promise<void> => {
  const needsWait =
    videoElement.seeking
    || videoElement.readyState < MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME
    || Math.abs(videoElement.currentTime - targetTime) > PREVIEW_START_READY_SYNC_TOLERANCE_SEC;

  if (!needsWait) {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      videoElement.removeEventListener('seeked', onReady);
      videoElement.removeEventListener('loadeddata', onReady);
      videoElement.removeEventListener('canplay', onReady);
      videoElement.removeEventListener('error', onReady);
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onReady = () => {
      if (!shouldContinue()) {
        finish();
        return;
      }
      if (videoElement.readyState === 0 && !videoElement.error) {
        try {
          videoElement.load();
        } catch {
          /* ignore */
        }
      }
      const drift = Math.abs(videoElement.currentTime - targetTime);
      if (
        !videoElement.seeking
        && videoElement.readyState >= MIN_VIDEO_READY_STATE_FOR_SEEK
        && drift > PREVIEW_START_READY_SYNC_TOLERANCE_SEC
      ) {
        try {
          videoElement.currentTime = targetTime;
        } catch {
          /* ignore */
        }
        // currentTime 補正で新しい seek が走るため、この回は終了して次の seeked / poll で再評価する。
        return;
      }
      if (
        videoElement.readyState >= MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME
        && !videoElement.seeking
        && drift <= PREVIEW_START_READY_SYNC_TOLERANCE_SEC
      ) {
        finish();
      }
    };

    pollTimer = setInterval(onReady, PREVIEW_START_READY_POLL_INTERVAL_MS);
    timeoutId = setTimeout(finish, PREVIEW_START_READY_TIMEOUT_MS);
    videoElement.addEventListener('seeked', onReady);
    videoElement.addEventListener('loadeddata', onReady);
    videoElement.addEventListener('canplay', onReady);
    videoElement.addEventListener('error', onReady);
    onReady();
  });
};

const waitForPreviewCacheVideoReady = async (
  videoElement: HTMLVideoElement,
  targetTime: number,
  shouldContinue: () => boolean,
): Promise<void> => {
  if (videoElement.readyState >= MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME && !videoElement.seeking) {
    if (Math.abs(videoElement.currentTime - targetTime) <= PREVIEW_START_READY_SYNC_TOLERANCE_SEC) {
      return;
    }
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      videoElement.removeEventListener('seeked', onReady);
      videoElement.removeEventListener('loadeddata', onReady);
      videoElement.removeEventListener('canplay', onReady);
      videoElement.removeEventListener('error', onReady);
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onReady = () => {
      if (!shouldContinue()) {
        finish();
        return;
      }

      if (videoElement.readyState === 0 && !videoElement.error) {
        try {
          videoElement.load();
        } catch {
          /* ignore */
        }
      }

      if (videoElement.readyState < MIN_VIDEO_READY_STATE_FOR_SEEK || videoElement.seeking) {
        return;
      }

      const drift = Math.abs(videoElement.currentTime - targetTime);
      if (drift > PREVIEW_START_READY_SYNC_TOLERANCE_SEC) {
        try {
          videoElement.currentTime = targetTime;
        } catch {
          /* ignore */
        }
        return;
      }

      if (videoElement.readyState >= MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME) {
        finish();
      }
    };

    timeoutId = setTimeout(finish, PREVIEW_START_READY_TIMEOUT_MS);
    videoElement.addEventListener('seeked', onReady);
    videoElement.addEventListener('loadeddata', onReady);
    videoElement.addEventListener('canplay', onReady);
    videoElement.addEventListener('error', onReady);
    onReady();
  });
};

export function usePreviewEngine({
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
  previewCacheEnabled,
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
  // 経路ラッチ導入により rAF ループ内での detach は廃止（音量変更時のカクつき対策）。
  // クリーンアップ経路（要素差し替え/アンマウント）は usePreviewAudioSession 側が担当する。
  detachAudioNode: _detachAudioNode,
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
}: UsePreviewEngineParams): UsePreviewEngineResult {
  const safeSetPreviewPlaying = (playing: boolean) => {
    setPreviewPlaying(playing);
  };
  const previewCacheKeyFallbackRef = useRef<string | null>(null);
  const previewCacheStatusFallbackRef = useRef<PreviewCacheStatus>('idle');
  const previewCacheEntryFallbackRef = useRef<PreviewCacheEntry | null>(null);
  const previewCacheVideoFallbackRef = useRef<HTMLVideoElement | null>(null);
  const previewCacheGenerationFallbackRef = useRef(0);
  const previewCachePlaybackActiveFallbackRef = useRef(false);
  const previewCacheHasBuiltOnceFallbackRef = useRef(false);
  const previewCacheEnabledFlag = previewCacheEnabled ?? false;
  const previewCacheKeyRefValue = previewCacheKeyRef ?? previewCacheKeyFallbackRef;
  const previewCacheStatusRefValue = previewCacheStatusRef ?? previewCacheStatusFallbackRef;
  const previewCacheEntryRefValue = previewCacheEntryRef ?? previewCacheEntryFallbackRef;
  const previewCacheVideoRefValue = previewCacheVideoRef ?? previewCacheVideoFallbackRef;
  const previewCacheGenerationRefValue = previewCacheGenerationRef ?? previewCacheGenerationFallbackRef;
  const previewCachePlaybackActiveRefValue = previewCachePlaybackActiveRef ?? previewCachePlaybackActiveFallbackRef;
  const previewCacheHasBuiltOnceRefValue = previewCacheHasBuiltOnceRef ?? previewCacheHasBuiltOnceFallbackRef;
  const setPreviewCacheStatusValue = setPreviewCacheStatus ?? (() => undefined);
  const setPreviewLoadingLabelValue = setPreviewLoadingLabel ?? (() => undefined);
  const activePreviewModeRef = useRef<PreviewEngineMode>('idle');
  const currentExportSessionIdRef = useRef<string | null>(null);
  const frameDrivenExportEnabledRef = useRef(false);
  // 【Issue #215】export の render loop が実際に描画した最後のフレーム番号（未描画は null）。
  const exportRenderedFrameIndexRef = useRef<number | null>(null);
  // 【#215 再発調査】実際に描かれた「相異なる」フレーム番号を数える。
  // 投入数との差が「同じ画の複製投入」＝映像が止まって見える量になる。
  const exportRenderedFrameTrackerRef = useRef(createRenderedFrameTracker());
  // エクスポート 1 フレームの内訳（描画 / エンコード / その他）を実測する。
  // 「プレビューは滑らかなのに書き出しだけ遅い」原因を数字で切り分けるため。
  const exportFrameProfilerRef = useRef(createExportFrameProfiler(() => getStandardPreviewNow()));
  // 動画を含む export で VideoEncoder が詰まった間だけ、共有 <video> と壁時計を
  // 一緒に停止する。エンコーダーだけが遅れて終端の黒 Canvas を大量補完する回帰を防ぐ。
  const exportBackpressurePausedRef = useRef(false);
  const exportBackpressurePausedAtMsRef = useRef<number | null>(null);
  // 倍速 export: 映像は 1x 連続再生し、タイムラインだけ wall/speed で進める（seek 駆動は静止画化するため不採用）。
  const exportTimelineSecRef = useRef(0);
  const exportLastWallNowMsRef = useRef<number | null>(null);
  const frameDrivenExportSubmittedCountRef = useRef(0);
  const frameDrivenExportLastRenderedCountRef = useRef<number | null>(null);
  // フレーム駆動ウォッチドッグ: 投入数が進まないまま停滞したら壁時計へフォールバックする。
  const frameDrivenExportStallObservedCountRef = useRef(0);
  const frameDrivenExportStallLastAdvanceAtMsRef = useRef(0);
  const frameDrivenExportForcedWallClockRef = useRef(false);
  const currentPreviewCacheBuildSessionIdRef = useRef<string | null>(null);
  const pendingPreviewCacheBuildResolverRef = useRef<((success: boolean) => void) | null>(null);
  const androidPreviewRecoveryRef = useRef<Record<string, {
    active: boolean;
    reason: string;
    startedAt: number;
    lastAttemptAt: number;
    lastTargetTime: number;
    attempts: number;
  }>>({});
  const androidPreviewHoldLogAtRef = useRef<Record<string, number>>({});
  const androidPreviewLastSeekAtRef = useRef<Record<string, number>>({});
  const androidPreviewRecoveredSegmentRef = useRef<Record<string, { key: string; count: number }>>({});
  // 再生中 active video の seeking / readyState 固着を検出する watchdog の per-video 状態。
  const videoStallWatchdogRef = useRef<Record<string, {
    stalledSinceMs: number;
    lastKickAtMs: number;
    kickCount: number;
    lastSeenAtMs: number;
  }>>({});
  // fade region 中のデコーダ固着時に黒の代わりに描く、直前の正常フレームのスナップショット。
  const fadeStallSnapshotRef = useRef<{
    videoId: string | null;
    canvas: HTMLCanvasElement | null;
    capturedAtMs: number;
  }>({ videoId: null, canvas: null, capturedAtMs: 0 });
  const fadeStallHoldLogAtRef = useRef<Record<string, number>>({});
  const previewPlayFailureLogAtRef = useRef<Record<string, number>>({});
  // active video のデコード停止（readyState<=1 + seeking 継続）を検知するための状態。
  // stall を最初に観測した時刻と、直近に load() 復旧を試みた時刻を video 単位で保持する。
  const videoDecodeStallSinceRef = useRef<Record<string, number>>({});
  const videoDecodeStallRecoverAtRef = useRef<Record<string, number>>({});
  // 直近にエクスポートを実行したか。true の間は post-export guard 有効。
  // **最初の描画可能フレームが連続で揃うまで clear しない**（2026-07-24 ログ:
  // eager reset 完了で即 clear → 5 秒後の play で startEngine 再 reset が走らず黒点滅）。
  const exportRanSinceLastPreviewRef = useRef(false);
  // remount が未完了のとき true。同一 DOM 上 hard reset では wedge が再発するため必須（previewlog2）。
  const postExportNeedsRemountRef = useRef(false);
  // post-export guard 中に連続で canDraw できたフレーム数。
  const postExportDrawableStreakRef = useRef(0);
  // hard reset 直後は play() を短時間抑止して再 wedge を防ぐ。
  const videoHardResetAtRef = useRef<Record<string, number>>({});
  const standardNextVideoPrebufferDiagRef = useRef<Record<string, NextVideoPrebufferDiagState>>({});
  const previewTimelineDiagnosticsRef = useRef<{
    lastRafNowMs: number | null;
    lastSegmentIndex: number;
    lastTickLogAtMs: number | null;
    lastShouldSuppressEndClear: boolean | null;
    activeBoundary: BoundaryDiagState | null;
    beforeBoundarySampled: boolean;
  }>({
    lastRafNowMs: null,
    lastSegmentIndex: -1,
    lastTickLogAtMs: null,
    lastShouldSuppressEndClear: null,
    activeBoundary: null,
    beforeBoundarySampled: false,
  });
  const previewLogModeRef = useRef<PreviewLogMode>(resolvePreviewLogMode());
  const resetBoundaryDiagnosticsState = useCallback(() => {
    previewTimelineDiagnosticsRef.current.lastRafNowMs = null;
    previewTimelineDiagnosticsRef.current.lastSegmentIndex = -1;
    previewTimelineDiagnosticsRef.current.lastTickLogAtMs = null;
    previewTimelineDiagnosticsRef.current.lastShouldSuppressEndClear = null;
    previewTimelineDiagnosticsRef.current.activeBoundary = null;
    previewTimelineDiagnosticsRef.current.beforeBoundarySampled = false;
    androidPreviewRecoveredSegmentRef.current = {};
    standardNextVideoPrebufferDiagRef.current = {};
    videoStallWatchdogRef.current = {};
    // canvas の確保は再利用し、参照情報だけ無効化する。
    fadeStallSnapshotRef.current = {
      videoId: null,
      canvas: fadeStallSnapshotRef.current.canvas,
      capturedAtMs: 0,
    };
  }, []);
  const maybeAssignAndroidPreviewSeek = useCallback((
    {
      videoEl,
      reason,
      videoId,
      segmentIndex,
      segmentRecoveryKey,
      targetTime,
      currentTimeBefore,
      drift,
      sinceLastSeekMs,
    }: {
      videoEl: HTMLVideoElement;
      reason: string;
      videoId: string;
      segmentIndex: number;
      segmentRecoveryKey: string;
      targetTime: number;
      currentTimeBefore: number;
      drift: number;
      sinceLastSeekMs: number;
    },
  ) => {
    try {
      videoEl.currentTime = targetTime;
      androidPreviewLastSeekAtRef.current[videoId] = Date.now();
      const previousRecovery = androidPreviewRecoveredSegmentRef.current[videoId];
      const recoverySeekCount = previousRecovery?.key === segmentRecoveryKey
        ? previousRecovery.count + 1
        : 1;
      androidPreviewRecoveredSegmentRef.current[videoId] = {
        key: segmentRecoveryKey,
        count: recoverySeekCount,
      };
      logWarn('RENDER', 'preview.android.seek-assignment', {
        reason,
        videoId,
        segmentIndex,
        targetTime,
        currentTimeBefore,
        drift,
        sinceLastSeekMs,
        recoverySeekCount,
      });
      return true;
    } catch {
      return false;
    }
  }, [logWarn]);
  const toDisplayTime = useCallback((globalTimeSec: number) => {
    const totalDuration = Math.max(0, totalDurationRef.current);
    if (totalDuration <= 0) return 0;
    const clamped = Math.max(0, Math.min(globalTimeSec, Math.max(0, totalDuration - DISPLAY_TIME_CLAMP_EPSILON_SEC)));
    if (clamped !== globalTimeSec) {
      logInfo('RENDER', 'segment.display.clamped', {
        globalTimeMs: Math.round(globalTimeSec * 1000),
        displayGlobalTimeMs: Math.round(clamped * 1000),
        totalDurationMs: Math.round(totalDuration * 1000),
        isCompleted: globalTimeSec >= totalDuration,
      });
    }
    return clamped;
  }, [logInfo, totalDurationRef]);
  const logAndroidPreviewHold = useCallback(
    (videoId: string, timelineTime: number, activeEl?: HTMLVideoElement) => {
      const now = Date.now();
      const lastLoggedAt = androidPreviewHoldLogAtRef.current[videoId] ?? 0;
      if (now - lastLoggedAt < ANDROID_PREVIEW_HOLD_LOG_INTERVAL_MS) {
        return;
      }

      androidPreviewHoldLogAtRef.current[videoId] = now;
      logInfo('RENDER', 'Android preview hold frame instead of black clear', {
        videoId,
        readyState: activeEl?.readyState,
        paused: activeEl?.paused,
        seeking: activeEl?.seeking,
        videoWidth: activeEl?.videoWidth,
        videoHeight: activeEl?.videoHeight,
        currentTime: activeEl?.currentTime,
        timelineTime,
      });
    },
    [logInfo],
  );
  // active video の正常フレームを定期スナップショットし、fade region 中のデコーダ固着時に
  // 黒クリアの代わりへ流用する。出力 canvas に収まるサイズへ縮小してメモリを抑える。
  const captureFadeStallSnapshot = useCallback(
    (videoId: string, videoEl: HTMLVideoElement, maxWidth: number, maxHeight: number) => {
      const now = Date.now();
      const snapshot = fadeStallSnapshotRef.current;
      if (
        snapshot.videoId === videoId
        && now - snapshot.capturedAtMs < PREVIEW_FADE_STALL_SNAPSHOT_INTERVAL_MS
      ) {
        return;
      }
      const videoWidth = videoEl.videoWidth;
      const videoHeight = videoEl.videoHeight;
      if (videoWidth <= 0 || videoHeight <= 0 || maxWidth <= 0 || maxHeight <= 0) {
        return;
      }
      const scale = Math.min(1, maxWidth / videoWidth, maxHeight / videoHeight);
      const width = Math.max(1, Math.round(videoWidth * scale));
      const height = Math.max(1, Math.round(videoHeight * scale));
      try {
        let canvas = snapshot.canvas;
        // サイズ変更は canvas 内容を破壊するため、既存スナップショットを温存して新規確保する。
        if (!canvas || canvas.width !== width || canvas.height !== height) {
          canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
        }
        const snapshotCtx = canvas.getContext('2d');
        if (!snapshotCtx) {
          return;
        }
        snapshotCtx.drawImage(videoEl, 0, 0, width, height);
        fadeStallSnapshotRef.current = { videoId, canvas, capturedAtMs: now };
      } catch {
        // drawImage は decode 状態次第で失敗しうる。失敗時は直前のスナップショットを維持する。
      }
    },
    [],
  );
  const handleMediaElementLoaded = useCallback(
    (id: string, element: HTMLVideoElement | HTMLImageElement | HTMLAudioElement) => {
      if (element.tagName === 'VIDEO') {
        const videoEl = element as HTMLVideoElement;
        const duration = videoEl.duration;
        if (!isNaN(duration) && duration !== Infinity) {
          setVideoDuration(id, duration);
          if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
            useMediaStore.getState().setMediaSourceDimensions(id, videoEl.videoWidth, videoEl.videoHeight);
          }
          logInfo('MEDIA', `ビデオロード完了: ${id.substring(0, 8)}...`, {
            duration: Math.round(duration * 10) / 10,
            readyState: videoEl.readyState,
            videoWidth: videoEl.videoWidth,
            videoHeight: videoEl.videoHeight,
          });
        }
      }
    },
    [setVideoDuration, logInfo],
  );

  const waitForVideoMetadata = useCallback(
    async (item: MediaItem, timeoutMs: number = 5000): Promise<boolean> => {
      if (item.type !== 'video') return true;

      let videoEl = mediaElementsRef.current[item.id] as HTMLVideoElement | undefined;
      if (!videoEl) {
        for (let i = 0; i < 10; i++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          videoEl = mediaElementsRef.current[item.id] as HTMLVideoElement | undefined;
          if (videoEl) break;
        }
      }

      if (!videoEl) {
        logWarn('MEDIA', '動画要素の取得に失敗', { id: item.id.substring(0, 8) });
        return false;
      }

      const syncDurationFromElement = (): boolean => {
        const duration = videoEl.duration;
        if (Number.isFinite(duration) && duration > 0) {
          setVideoDuration(item.id, duration);
          return true;
        }
        return false;
      };

      if (syncDurationFromElement()) {
        return true;
      }

      if (videoEl.readyState === 0 && !videoEl.error) {
        try {
          videoEl.load();
        } catch {
          // ignore
        }
      }

      return await new Promise<boolean>((resolve) => {
        let settled = false;

        const settle = (ok: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          videoEl.removeEventListener('loadedmetadata', onReady);
          videoEl.removeEventListener('durationchange', onReady);
          videoEl.removeEventListener('canplay', onReady);
          videoEl.removeEventListener('error', onError);
          resolve(ok);
        };

        const onReady = () => {
          if (syncDurationFromElement()) {
            settle(true);
          }
        };

        const onError = () => settle(false);

        const timeoutId = setTimeout(() => settle(false), timeoutMs);
        videoEl.addEventListener('loadedmetadata', onReady);
        videoEl.addEventListener('durationchange', onReady);
        videoEl.addEventListener('canplay', onReady);
        videoEl.addEventListener('error', onError);

        onReady();
      });
    },
    [logWarn, mediaElementsRef, setVideoDuration],
  );

  const ensureVideoMetadataReady = useCallback(
    async (targets: MediaItem[], fromTime: number): Promise<boolean> => {
      if (targets.length === 0) return true;

      logInfo('MEDIA', '再生前に動画メタデータ読み込み待機', {
        fromTime,
        videoCount: targets.length,
        ids: targets.map((v) => v.id.substring(0, 8)),
      });

      const results = await Promise.all(targets.map((item) => waitForVideoMetadata(item)));
      const allReady = results.every(Boolean);

      const latest = useMediaStore.getState();
      mediaItemsRef.current = latest.mediaItems;
      totalDurationRef.current = latest.totalDuration;

      if (!allReady) {
        logWarn('MEDIA', '動画メタデータの読み込み待機がタイムアウト', {
          fromTime,
          failedIds: targets
            .filter((_, index) => !results[index])
            .map((item) => item.id.substring(0, 8)),
        });
      }

      return allReady;
    },
    [logInfo, logWarn, mediaItemsRef, totalDurationRef, waitForVideoMetadata],
  );

  const hasReadyPreviewCache = useCallback(() => {
    return previewCacheEnabledFlag
      && previewCacheStatusRefValue.current === 'ready'
      && !!previewCacheEntryRefValue.current
      && previewCacheEntryRefValue.current.cacheKey === previewCacheKeyRefValue.current
      && !!previewCacheVideoRefValue.current;
  }, [previewCacheEnabledFlag]);

  const startPreviewCachePlayback = async (fromTime: number): Promise<boolean> => {
    if (!hasReadyPreviewCache()) {
      return false;
    }

    const previewCacheVideo = previewCacheVideoRefValue.current;
    const previewCacheEntry = previewCacheEntryRefValue.current;
    if (!previewCacheVideo || !previewCacheEntry) {
      return false;
    }

    activePreviewModeRef.current = 'preview-cache-playback';
    previewCachePlaybackActiveRefValue.current = true;
    safeSetPreviewPlaying(true);
    setPreviewCacheStatusValue('ready');
    setPreviewLoadingLabelValue(undefined);

    const targetTime = Math.max(0, Math.min(fromTime, previewCacheEntry.duration));
    currentTimeRef.current = targetTime;
    setCurrentTime(targetTime);

    if (previewCacheVideo.src !== previewCacheEntry.url) {
      previewCacheVideo.src = previewCacheEntry.url;
    }

    if (previewCacheVideo.readyState === 0 && !previewCacheVideo.error) {
      try {
        previewCacheVideo.load();
      } catch {
        /* ignore */
      }
    }

    await waitForPreviewCacheVideoReady(
      previewCacheVideo,
      targetTime,
      () => activePreviewModeRef.current === 'preview-cache-playback' && !isSeekingRef.current,
    );

    if (activePreviewModeRef.current !== 'preview-cache-playback') {
      return false;
    }

    if (Math.abs(previewCacheVideo.currentTime - targetTime) > PREVIEW_START_READY_SYNC_TOLERANCE_SEC) {
      try {
        previewCacheVideo.currentTime = targetTime;
      } catch {
        /* ignore */
      }
    }

    renderFrame(targetTime, false, false);

    isPlayingRef.current = true;
    play();
    try {
      await previewCacheVideo.play();
    } catch (error) {
      previewCachePlaybackActiveRefValue.current = false;
      activePreviewModeRef.current = 'preview';
      logWarn('RENDER', 'preview.cache.failed', {
        reason: error instanceof Error ? error.message : String(error),
        fallback: 'live-element-preview',
      });
      return false;
    }

    setLoading(false);
    startTimeRef.current = getStandardPreviewNow() - targetTime * 1000;
    logInfo('RENDER', 'preview.cache.play', {
      globalTimeMs: Math.round(targetTime * 1000),
      totalDurationMs: Math.round(totalDurationRef.current * 1000),
    });
    return true;
  };

  const buildPreviewCache = async (myLoopId: number): Promise<boolean> => {
    if (
      !previewCacheEnabledFlag
      || !startPreviewCacheExport
      || !canvasRef.current
      || !masterDestRef.current
      || !previewCacheKeyRefValue.current
    ) {
      return false;
    }

    const sessionId = createPreviewExportSessionId();
    const cacheKey = previewCacheKeyRefValue.current;
    const generation = previewCacheGenerationRefValue.current + 1;
    previewCacheGenerationRefValue.current = generation;
    currentPreviewCacheBuildSessionIdRef.current = sessionId;
    activePreviewModeRef.current = 'preview-cache-build';
    previewCachePlaybackActiveRefValue.current = false;
    previewCacheStatusRefValue.current = 'preparing';
    setPreviewCacheStatusValue('preparing');
    setPreviewLoadingLabelValue(previewCacheHasBuiltOnceRefValue.current ? 'プレビューを更新中...' : 'プレビュー準備中...');
    setLoading(true);
    safeSetPreviewPlaying(false);
    isPlayingRef.current = false;
    pause();
    logInfo('RENDER', 'preview.cache.start', {
      cacheKey,
      totalDurationMs: Math.round(totalDurationRef.current * 1000),
    });

    return await new Promise<boolean>((resolve) => {
      const settle = (success: boolean) => {
        if (pendingPreviewCacheBuildResolverRef.current) {
          pendingPreviewCacheBuildResolverRef.current = null;
        }
        if (currentPreviewCacheBuildSessionIdRef.current === sessionId) {
          currentPreviewCacheBuildSessionIdRef.current = null;
        }
        resolve(success);
      };

      pendingPreviewCacheBuildResolverRef.current = settle;

      startPreviewCacheExport(
        canvasRef,
        masterDestRef,
        (url) => {
          const isCurrentBuild =
            currentPreviewCacheBuildSessionIdRef.current === sessionId
            && previewCacheGenerationRefValue.current === generation
            && previewCacheKeyRefValue.current === cacheKey;
          if (!isCurrentBuild) {
            try {
              URL.revokeObjectURL(url);
            } catch {
              /* ignore */
            }
            settle(false);
            return;
          }

          const previousUrl = previewCacheEntryRefValue.current?.url;
          previewCacheEntryRefValue.current = {
            url,
            duration: totalDurationRef.current,
            cacheKey,
            createdAt: Date.now(),
          };
          previewCacheHasBuiltOnceRefValue.current = true;
          previewCacheStatusRefValue.current = 'ready';
          setPreviewCacheStatusValue('ready');
          setPreviewLoadingLabelValue(undefined);
          setLoading(false);

          if (previousUrl && previousUrl !== url) {
            try {
              URL.revokeObjectURL(previousUrl);
            } catch {
              /* ignore */
            }
          }

          const previewCacheVideo = previewCacheVideoRefValue.current;
          if (previewCacheVideo && previewCacheVideo.src !== url) {
            previewCacheVideo.pause();
            previewCacheVideo.src = url;
            previewCacheVideo.load();
          }

          logInfo('RENDER', 'preview.cache.ready', {
            totalDurationMs: Math.round(totalDurationRef.current * 1000),
          });
          settle(true);
        },
        (message) => {
          if (currentPreviewCacheBuildSessionIdRef.current !== sessionId) {
            settle(false);
            return;
          }

          previewCacheStatusRefValue.current = 'failed';
          setPreviewCacheStatusValue('failed');
          setPreviewLoadingLabelValue(undefined);
          setLoading(false);
          logWarn('RENDER', 'preview.cache.failed', {
            reason: message,
            fallback: 'live-element-preview',
          });
          settle(false);
        },
        {
          mediaItems: mediaItemsRef.current,
          bgm: bgmRef.current,
          narrations: narrationsRef.current,
          totalDuration: totalDurationRef.current,
          // エンドロールの BGM フェード用（無効時は clipsDuration === totalDuration で無効化される）
          clipsDuration: clipsDurationRef?.current ?? totalDurationRef.current,
          endrollBgmFadeOut: getEndrollDuration(endrollOverlayRef?.current) > 0
            && endrollOverlayRef?.current?.bgmFadeOut === true,
          getPlaybackTimeSec: () => currentTimeRef.current,
          onAudioPreRenderComplete: () => {
            startTimeRef.current = getStandardPreviewNow();
            loop(true, myLoopId);
          },
        },
      );
    });
  };

  const renderFrame = useCallback(
    (time: number, isActivePlaying = false, _isExporting = false) => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        let didUpdateCanvas = false;

        if (!_isExporting && hasReadyPreviewCache()) {
          const previewCacheVideo = previewCacheVideoRefValue.current;
          if (previewCacheVideo?.readyState && previewCacheVideo.readyState >= MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.drawImage(previewCacheVideo, 0, 0, ctx.canvas.width, ctx.canvas.height);
            return true;
          }
        }

        // === エンドロール区間の判定 ===
        // クリップ再生後は単色背景 + ロゴだけを描く。キャプション・ウォーターマーク・
        // 倍速バッジは描かない（いずれも映像に付随するもの）。
        // ただし **BGM は流し続ける**ため、ここでは return せず描画だけを差し替える。
        // エンドロール無効時は getEndrollDuration() が 0 を返し、以降は完全に従来どおり。
        const activeEndroll = endrollOverlayRef?.current;
        const endrollDurationSec = getEndrollDuration(activeEndroll);
        const clipsDurationSec = clipsDurationRef?.current ?? totalDurationRef.current;
        const isEndrollFrame = endrollDurationSec > 0 && time >= clipsDurationSec;

        if (isEndrollFrame) {
          // 動画要素は止めておく（エンドロール中に裏でデコードを回さない）
          for (const item of mediaItemsRef.current) {
            if (item.type !== 'video') continue;
            const el = mediaElementsRef.current[item.id] as HTMLVideoElement | undefined;
            if (el && !el.paused) {
              el.pause();
            }
          }
        }

        const currentItems = mediaItemsRef.current;
        const currentBgm = bgmRef.current;
        const currentNarrations = narrationsRef.current;
        // ディゾルブ（重ねる）トランジションのオーバーラップを考慮したタイムライン区間。
        // レンジ計算は 1 フレーム 1 回に抑え、active 判定へも同じ結果を渡す（GC 負荷対策）
        const timelineRangeList = computeTransitionTimelineRanges(currentItems);
        const timelineRanges = new Map<string, { start: number; end: number }>();
        for (const rangeEntry of timelineRangeList) {
          timelineRanges.set(rangeEntry.id, { start: rangeEntry.start, end: rangeEntry.end });
        }

        let activeId: string | null = null;
        let localTime = 0;
        let activeIndex = -1;
        const currentLoopId = loopIdRef.current;
        const isStandardLivePreviewPlayback =
          !platformCapabilities.isIosSafari
          && isActivePlaying
          && !_isExporting
          && !isSeekingRef.current;
        const isAndroidPreviewPlayback =
          platformCapabilities.isAndroid
          && isStandardLivePreviewPlayback;
        const active = findActiveTimelineItemWithTransitions(
          currentItems,
          time,
          totalDurationRef.current,
          timelineRangeList,
        );
        if (active) {
          activeId = active.id;
          activeIndex = active.index;
          localTime = active.localTime;
        } else if (currentItems.length > 0) {
          const END_FALLBACK_TOLERANCE_SEC = 0.2;
          if (time >= totalDurationRef.current - END_FALLBACK_TOLERANCE_SEC) {
            const lastIndex = currentItems.length - 1;
            const lastItem = currentItems[lastIndex];
            activeId = lastItem.id;
            activeIndex = lastIndex;
            localTime = Math.max(0, lastItem.duration - 0.001);
          }
        }
        // === ディゾルブ(重ねる)のオーバーラップ判定 ===
        // 窓内では「前のクリップ」を準アクティブ(peer)として描画・再生継続し、
        // 映像は次クリップを上にクロスフェード、音声は双方をクロスフェードする。
        let overlapPeerId: string | null = null;
        let overlapPeerLocalTime: number | null = null;
        let overlapCrossInAlpha: number | null = null;
        let overlapAudioCrossIn: number | null = null;
        let overlapAudioCrossOut = 0;
        if (activeId && activeIndex > 0) {
          const prevOverlapItem = currentItems[activeIndex - 1];
          const prevOverlapRange = timelineRanges.get(prevOverlapItem.id);
          const activeOverlapRange = timelineRanges.get(activeId);
          const overlapSec = getClipOverlapToNext(prevOverlapItem, currentItems[activeIndex]);
          if (
            overlapSec > 0
            && prevOverlapRange
            && activeOverlapRange
            && time >= activeOverlapRange.start
            && time < prevOverlapRange.end - 0.001
          ) {
            const elapsedInOverlap = time - activeOverlapRange.start;
            const overlapRatio = Math.max(0, Math.min(1, elapsedInOverlap / overlapSec));
            overlapPeerId = prevOverlapItem.id;
            overlapPeerLocalTime = time - prevOverlapRange.start;
            overlapCrossInAlpha = overlapRatio;
            overlapAudioCrossIn = overlapRatio;
            overlapAudioCrossOut = 1 - overlapRatio;
          }
        }

        const holdAudioThisFrame = isActivePlaying && audioResumeWaitFramesRef.current > 0;
        const isNearTimelineStart =
          currentItems.length > 0 &&
          time <= 0.05;
        const activePreviewAudioSourceCount = (() => {
          if (!isActivePlaying || holdAudioThisFrame) {
            return 0;
          }

          let count = 0;
          if (activeIndex !== -1) {
            const activeItem = currentItems[activeIndex];
            if (activeItem?.type === 'video' && !activeItem.isMuted && activeItem.volume > 0) {
              count += 1;
            }
          }
          if (overlapPeerId) {
            const peerItem = currentItems.find((item) => item.id === overlapPeerId);
            if (peerItem?.type === 'video' && !peerItem.isMuted && peerItem.volume > 0) {
              count += 1;
            }
          }

          if (currentBgm && currentBgm.volume > 0 && time >= currentBgm.delay) {
            const trackTime = time - currentBgm.delay + currentBgm.startPoint;
            if (trackTime >= 0 && trackTime <= currentBgm.duration) {
              count += 1;
            }
          }

          const bgmAutoAdjust = useAudioStore.getState().bgmAutoAdjustToTimeline;
          const bgmEffectiveForCount = resolveBgmClipsEffectivePlayback(
            currentNarrations.filter((item) => isBgmClipId(item.id)),
            totalDurationRef.current,
            { autoAdjust: bgmAutoAdjust },
          );
          for (const clip of currentNarrations) {
            if (clip.isMuted || clip.volume <= 0) {
              continue;
            }
            const effective = resolvePipelineClipEffectivePlayback(
              clip,
              currentNarrations,
              totalDurationRef.current,
              bgmEffectiveForCount,
              bgmAutoAdjust,
            );
            if (effective.isDisabled) continue;
            const clipTime = time - effective.startTime;
            if (clipTime >= 0 && clipTime <= effective.effectivePlayableDuration) {
              count += 1;
            }
          }

          return count;
        })();

        let holdFrame = false;
        let shouldBlackoutFadeTail = false;
        let shouldSkipAndroidPreviewActiveDraw = false;
        let shouldPlayAndroidPreviewActiveVideoAfterDraw = false;
        // fade 中であるかは canvas clear 制御 (line ~1530 の shouldSuppressEndClear) でも参照するため、
        // active item ブロックの外で初期化しておき、active が無いときは false で扱う。
        let isInFadeInRegion = false;
        let isInFadeOutRegion = false;
        let isInFadeRegion = false;
        if (activeId && activeIndex !== -1) {
          const activeItem = currentItems[activeIndex];
          const previousItem = activeIndex > 0 ? currentItems[activeIndex - 1] : null;
          const activeFadeOutDur = activeItem.fadeOutDuration || 1.0;
          const hasExplicitFadeToBlack = !!activeItem.fadeOut;
          const shouldPreferBlackoutAtFadeTail = shouldBlackoutVideoFadeTail({
            clipLocalTime: localTime,
            clipDuration: activeItem.duration,
            fadeOut: hasExplicitFadeToBlack,
            fadeOutDuration: activeFadeOutDur,
          });

          const activeFadeInDur = activeItem.fadeInDuration || 1.0;
          // fade region は video / image の両方に適用される (MediaItem 共通プロパティ)。
          // type==='video' に絞ると画像クリップで fade region が拾われず、
          // 下流の shouldSuppressEndClear / freezeFrame / holdFrame ガードが効かなくなる。
          isInFadeOutRegion =
            activeItem.fadeOut &&
            localTime > activeItem.duration - activeFadeOutDur;
          isInFadeInRegion =
            activeItem.fadeIn &&
            localTime < activeFadeInDur;
          isInFadeRegion = isInFadeInRegion || isInFadeOutRegion;

          if (activeItem.type === 'video' && hasExplicitFadeToBlack && shouldPreferBlackoutAtFadeTail) {
            shouldBlackoutFadeTail = true;
          }

          if (activeItem.type === 'video') {
            const activeEl = mediaElementsRef.current[activeId] as HTMLVideoElement | undefined;

            if (!activeEl) {
              if (isAndroidPreviewPlayback) {
                holdFrame = true;
                shouldSkipAndroidPreviewActiveDraw = true;
                logAndroidPreviewHold(activeId, time);
              }
              if (!shouldPreferBlackoutAtFadeTail && !isInFadeRegion) {
                holdFrame = true;
              }
            } else {
              const trimStart = activeItem.trimStart || 0;
              const targetTime = resolveVideoSourceTime({ trimStart, localTime, playbackSpeed: activeItem.playbackSpeed });
              // プレビュー: playbackRate=speed で連続再生。
              // export: 常に rate=1 連続再生 + ループ側の壁時計 dilation（seek 駆動は静止画化）。
              applyVideoElementPlaybackRate(
                activeEl,
                isActivePlaying
                  ? resolveVideoElementPlaybackRateForContext(_isExporting, activeItem.playbackSpeed)
                  : 1,
              );
              const activeVideoDrift = Math.abs(activeEl.currentTime - targetTime);
              const isAndroidPassiveBoundaryWindow =
                isAndroidPreviewPlayback
                && localTime >= 0
                && localTime <= PREVIEW_ANDROID_PASSIVE_HOLD_MAX_SEC;
              const isTimelineEnd =
                totalDurationRef.current > 0 &&
                time >= totalDurationRef.current - PREVIEW_END_THRESHOLD_SEC;
              const isLastTimelineItem = activeIndex === currentItems.length - 1;
              const isNearTimelineEnd =
                totalDurationRef.current > 0 &&
                time >= totalDurationRef.current - 0.05;
              const safeEndTime = resolveVideoSafeEndSourceTime({ trimStart, timelineDuration: activeItem.duration, playbackSpeed: activeItem.playbackSpeed, trimEnd: activeItem.trimEnd });

              // === デコード停止の検知と復旧（Issue #209）===
              // previewlog2: preflight readyState4 → 短時間 drawable → readyState1+seeking 再 wedge。
              // remount が本命。同一要素 hard reset は保険。isActivePlaying に加え isPlayingRef も見る。
              {
                const nowStallMs = Date.now();
                const postExportGuard = exportRanSinceLastPreviewRef.current;
                const playingForStall =
                  isActivePlaying || (isPlayingRef.current && !_isExporting);
                const isDecodeStallCandidate =
                  playingForStall
                  && !_isExporting
                  && !isSeekingRef.current
                  && !activeEl.error
                  && isActiveVideoUndrawableForStall({
                    readyState: activeEl.readyState,
                    seeking: activeEl.seeking,
                    paused: activeEl.paused,
                    videoWidth: activeEl.videoWidth,
                    videoHeight: activeEl.videoHeight,
                  });
                if (isDecodeStallCandidate) {
                  if (videoDecodeStallSinceRef.current[activeId] === undefined) {
                    videoDecodeStallSinceRef.current[activeId] = nowStallMs;
                  }
                  postExportDrawableStreakRef.current = 0;
                } else {
                  delete videoDecodeStallSinceRef.current[activeId];
                  // remount 未完了の間は guard を落とさない（偽 drawable で clear して再 wedge した実測あり）
                  if (
                    postExportGuard
                    && !postExportNeedsRemountRef.current
                    && playingForStall
                    && !_isExporting
                    && activeEl.readyState >= MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME
                    && !activeEl.seeking
                    && activeEl.videoWidth > 0
                    && activeEl.videoHeight > 0
                  ) {
                    postExportDrawableStreakRef.current += 1;
                    if (postExportDrawableStreakRef.current >= POST_EXPORT_DRAWABLE_FRAMES_TO_CLEAR_GUARD) {
                      exportRanSinceLastPreviewRef.current = false;
                      postExportDrawableStreakRef.current = 0;
                      logInfo('RENDER', 'preview.postExport.guardCleared', {
                        videoId: activeId,
                        reason: 'consecutive drawable frames after export remount',
                        requiredFrames: POST_EXPORT_DRAWABLE_FRAMES_TO_CLEAR_GUARD,
                      });
                    }
                  }
                }
                if (
                  shouldRecoverDecodeStalledActiveVideo({
                    isActivePlaying: playingForStall,
                    isExporting: _isExporting,
                    isUserSeeking: isSeekingRef.current,
                    hasError: !!activeEl.error,
                    readyState: activeEl.readyState,
                    seeking: activeEl.seeking,
                    paused: activeEl.paused,
                    videoWidth: activeEl.videoWidth,
                    videoHeight: activeEl.videoHeight,
                    nowMs: nowStallMs,
                    stallSinceMs: videoDecodeStallSinceRef.current[activeId] ?? null,
                    lastRecoverAtMs: videoDecodeStallRecoverAtRef.current[activeId] ?? 0,
                    stallGraceMs: postExportGuard
                      ? PREVIEW_DECODE_STALL_RECOVER_AFTER_MS_POST_EXPORT
                      : PREVIEW_DECODE_STALL_RECOVER_AFTER_MS,
                  })
                ) {
                  videoDecodeStallRecoverAtRef.current[activeId] = nowStallMs;
                  videoRecoveryAttemptsRef.current[activeId] = nowStallMs;
                  delete videoDecodeStallSinceRef.current[activeId];
                  // メッセージに時刻を含め DUPLICATE_SUPPRESS(10s) で recover ログが消えないようにする
                  logInfo('RENDER', `preview.decodeStall.recover@${nowStallMs}`, {
                    videoId: activeId,
                    readyState: activeEl.readyState,
                    seeking: activeEl.seeking,
                    paused: activeEl.paused,
                    videoWidth: activeEl.videoWidth,
                    videoHeight: activeEl.videoHeight,
                    videoCurrentTime: Math.round(activeEl.currentTime * 10000) / 10000,
                    reseekTarget: Math.round(targetTime * 10000) / 10000,
                    localTime: Math.round(localTime * 10000) / 10000,
                    mode: postExportNeedsRemountRef.current ? 'hard-fallback-needs-remount' : 'hard',
                    postExportGuard,
                    needsRemount: postExportNeedsRemountRef.current,
                  });
                  videoHardResetAtRef.current[activeId] = nowStallMs;
                  kickHardResetPreviewVideoElement(activeEl, targetTime);
                }
              }

              const shouldForceEndFrameAlign =
                _isExporting &&
                !isActivePlaying &&
                isLastTimelineItem &&
                isNearTimelineEnd;
              const exportSyncThreshold = resolveSpeedAwareVideoSyncThresholdSec(
                getPreviewVideoSyncThreshold(previewPlatformPolicy, {
                  isExporting: _isExporting,
                  hasExportPlayFailure: false,
                }),
                activeItem.playbackSpeed,
              );
              const shouldHoldForImageToVideoTransition = shouldHoldFrameForImageToVideoExportTransition({
                isExporting: _isExporting,
                isAndroid: platformCapabilities.isAndroid,
                activeItemType: activeItem.type,
                previousItemType: previousItem?.type ?? null,
                clipLocalTime: localTime,
                videoReadyState: activeEl.readyState,
                isVideoSeeking: activeEl.seeking,
                videoCurrentTime: activeEl.currentTime,
                targetTime,
                syncToleranceSec: EXPORT_IMAGE_TO_VIDEO_STABILIZATION_SYNC_TOLERANCE_SEC,
              });
              const hasExportPlayFailure = _isExporting && !!exportPlayFailedRef.current[activeId];
              // export も native 連続再生。過剰 seek は静止画化するため緩めしきい値のみ補正。
              const needsCorrection =
                _isExporting
                && isActivePlaying
                && !isSeekingRef.current
                && !activeEl.seeking
                && !activeEl.paused
                && !hasExportPlayFailure
                && activeVideoDrift > exportSyncThreshold;

              if (
                !_isExporting
                && isActivePlaying
                && isTimelineEnd
                // フェード途中で freezeFrame を alpha=1.0 で上書きすると fade が見えなくなるため、
                // fadeIn / fadeOut の途中であれば下流の通常 drawImage パス (line ~1916) に処理を委ねる。
                && !isInFadeRegion
                && activeEl.readyState >= MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME
                && !activeEl.seeking
                && activeEl.videoWidth > 0
                && activeEl.videoHeight > 0
              ) {
                activeEl.pause();
                ctx.globalAlpha = 1.0;
                ctx.save();
                ctx.filter = resolveMediaBlurFilter(activeItem.blur, ctx.canvas.width, ctx.canvas.height);
                try {
                  ctx.drawImage(activeEl, 0, 0, ctx.canvas.width, ctx.canvas.height);
                } finally {
                  ctx.restore();
                  ctx.filter = 'none';
                  ctx.globalAlpha = 1.0;
                }
                didUpdateCanvas = true;
                holdFrame = true;
                shouldSkipAndroidPreviewActiveDraw = true;
                logInfo('RENDER', 'preview.end.freezeFrame', {
                  activeId,
                  activeIndex,
                  isLastTimelineItem,
                  localTime,
                  trimStart,
                  videoCurrentTime: activeEl.currentTime,
                  readyState: activeEl.readyState,
                  paused: activeEl.paused,
                  seeking: activeEl.seeking,
                  ended: activeEl.ended,
                });
              } else if (shouldForceEndFrameAlign && activeEl.readyState >= 1 && !activeEl.seeking) {
                const endAlignThreshold = 0.0001;
                const desired = Math.min(targetTime, safeEndTime);
                const drift = Math.abs(activeEl.currentTime - desired);
                const isAhead = activeEl.currentTime > desired + endAlignThreshold;
                if (drift > endAlignThreshold || isAhead) {
                  activeEl.currentTime = desired;
                }
              }

              if (activeEl.readyState === 0 && !activeEl.error) {
                const now = Date.now();
                const lastAttempt = videoRecoveryAttemptsRef.current[activeId] || 0;
                if (now - lastAttempt > 2000) {
                  videoRecoveryAttemptsRef.current[activeId] = now;
                  try { activeEl.load(); } catch { /* ignore */ }
                }
              }

              const hasFrame =
                activeEl.readyState >= 2 &&
                activeEl.videoWidth > 0 &&
                activeEl.videoHeight > 0 &&
                !activeEl.seeking;

              const shouldHoldForVideoEnd = shouldHoldVideoFrameAtClipEnd({
                clipLocalTime: localTime,
                clipDuration: activeItem.duration,
                trimStart,
                playbackSpeed: activeItem.playbackSpeed,
                trimEnd: activeItem.trimEnd,
                videoCurrentTime: activeEl.currentTime,
                videoEnded: activeEl.ended,
                isExporting: _isExporting,
                isIosSafari: platformCapabilities.isIosSafari,
                isLastTimelineItem,
                nextItemType: activeIndex + 1 < currentItems.length
                  ? currentItems[activeIndex + 1]?.type ?? null
                  : null,
                fps: FPS,
              });

              const shouldHoldForAndroidPreviewNotDrawable = isAndroidPreviewPlayback
                && isAndroidPassiveBoundaryWindow
                && !canDrawVideo(activeEl)
                && (
                  activeEl.seeking
                  || activeEl.readyState < MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME
                  || activeEl.videoWidth <= 0
                  || activeEl.videoHeight <= 0
                );

              const shouldHoldActiveVideoFrame =
                !hasFrame
                || shouldHoldForAndroidPreviewNotDrawable
                || needsCorrection
                || shouldHoldForVideoEnd
                || shouldHoldForImageToVideoTransition;

              const shouldBypassHoldForReadyActiveVideo =
                isAndroidPreviewPlayback
                && canDrawVideo(activeEl)
                && activeEl.paused;

              if (shouldBypassHoldForReadyActiveVideo) {
                holdFrame = false;
                shouldSkipAndroidPreviewActiveDraw = false;
                shouldPlayAndroidPreviewActiveVideoAfterDraw = true;
                if (isPreviewDiagnosticsLogMode(previewLogModeRef.current)) {
                  logInfo('RENDER', '[DIAG-BOUNDARY-ACTIVE] Android active video ready', {
                    activeId,
                    localTime,
                    targetTime,
                    videoCurrentTime: activeEl.currentTime,
                    drift: Math.abs(activeEl.currentTime - targetTime),
                    readyState: activeEl.readyState,
                    paused: activeEl.paused,
                    seeking: activeEl.seeking,
                    holdFrame,
                  });
                }
              }

              if (shouldHoldActiveVideoFrame) {
                // fade 中 (fadeIn / fadeOut) は holdFrame で前フレームを保持すると
                // 旧 clip の絵柄が透けて見え、フェードが効いていないように見える。
                // fade 中は canvas を毎フレーム黒クリアして alpha 付きで描画するパスへ委ねる。
                if (!shouldPreferBlackoutAtFadeTail && !isInFadeRegion) {
                  holdFrame = true;
                }
                if (shouldHoldForAndroidPreviewNotDrawable) {
                  shouldSkipAndroidPreviewActiveDraw = true;
                  logAndroidPreviewHold(activeId, time, activeEl);
                  if (previewTimelineDiagnosticsRef.current.activeBoundary !== null) {
                    previewTimelineDiagnosticsRef.current.activeBoundary.holdFrameCount += 1;
                  }
                } else if (previewLogModeRef.current === 'detailed') {
                  logInfo('RENDER', shouldPreferBlackoutAtFadeTail ? 'fade tail blackout' : 'active video frame hold', {
                    videoId: activeId,
                    readyState: activeEl.readyState,
                    seeking: activeEl.seeking,
                    ended: activeEl.ended,
                    videoCT: Math.round(activeEl.currentTime * 10000) / 10000,
                    videoDur: activeEl.duration,
                    currentTime: time,
                    needsCorrection,
                    shouldHoldForVideoEnd,
                    shouldHoldForImageToVideoTransition,
                    shouldHoldActiveVideoFrame,
                    shouldBlackoutFadeTail: shouldPreferBlackoutAtFadeTail,
                  });
                }
              }
              if (
                !isTimelineEnd
                && isAndroidPreviewPlayback
                && activeEl.readyState >= MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME
                && !activeEl.seeking
                && (localTime > 0.3 || activeVideoDrift > ANDROID_PREVIEW_SOFT_DRAW_DRIFT_THRESHOLD_SEC)
                && activeEl.paused
                && !shouldPlayAndroidPreviewActiveVideoAfterDraw
              ) {
                requestVideoPlayWithRetry(activeEl, () =>
                  isPlayingRef.current
                  && !isSeekingRef.current
                  && loopIdRef.current === currentLoopId,
                );
              }
            }
          } else if (activeItem.type === 'image') {
            const activeEl = mediaElementsRef.current[activeId] as HTMLImageElement | undefined;
            const isImageReady =
              !!activeEl &&
              activeEl.complete &&
              activeEl.naturalWidth > 0 &&
              activeEl.naturalHeight > 0;
            if (!isImageReady) {
              holdFrame = true;
            }
          }
        }

        const shouldHoldAtTimelineEnd =
          !activeId &&
          currentItems.length > 0 &&
          totalDurationRef.current > 0 &&
          time >= totalDurationRef.current - 0.0005;

        const shouldGuardNearEnd =
          !isActivePlaying &&
          currentItems.length > 0 &&
          totalDurationRef.current > 0 &&
          time >= totalDurationRef.current - 0.1;

        const shouldGuardAfterFinalize = endFinalizedRef.current && !isActivePlaying;

        const shouldForceStartClear = isNearTimelineStart && (
          _isExporting || (!isActivePlaying && !isPlayingRef.current)
        );
        const shouldSuppressAndroidPreviewClear =
          isAndroidPreviewPlayback
          && holdFrame;
        // post-export 中に holdFrame でも黒クリアすると、直前の endClear 黒が保持され黒点滅になる。
        // Android と同様、描画不能 hold 中はクリアを抑止して前フレームを残す。
        const shouldSuppressPostExportHoldClear =
          exportRanSinceLastPreviewRef.current
          && isActivePlaying
          && holdFrame
          && !shouldBlackoutFadeTail;
        const shouldClearCanvas = !shouldSuppressAndroidPreviewClear
          && !shouldSuppressPostExportHoldClear
          && (
            shouldForceStartClear
            || shouldBlackoutFadeTail
            || (!holdFrame && !shouldHoldAtTimelineEnd && !shouldGuardNearEnd && !shouldGuardAfterFinalize)
          );

        if (shouldClearCanvas) {
          const hasExplicitFadeToBlack = activeIndex !== -1 && !!currentItems[activeIndex]?.fadeOut;
          const hasActiveItem = activeIndex !== -1;
          const isBeforeTimelineEnd = totalDurationRef.current > 0 && time < totalDurationRef.current;
          const shouldSuppressEndClear =
            isAndroidPreviewPlayback
            && isActivePlaying
            && hasActiveItem
            && isBeforeTimelineEnd
            && !endFinalizedRef.current
            && !shouldBlackoutFadeTail
            // fade 中 (fadeIn / fadeOut) は毎フレーム黒クリア + alpha 描画で
            // 仕様通りの「黒へ落とす / 黒から立ち上げる」を実現する必要があるため、
            // Android end-clear suppression を fade region では無効化する。
            // これを外すと canvas 上に直前フレーム (= 同じ動画) が残留し、
            // alpha 付き drawImage の math が
            //   result = 0.5*V + 0.5*previousV = V
            // となって fade が視認できない (0df405e 退行).
            && !isInFadeRegion;
          if (shouldSuppressEndClear) {
            if (previewTimelineDiagnosticsRef.current.lastShouldSuppressEndClear !== true) {
              logInfo('RENDER', 'preview.endClear.suppressed', {
                globalTimeMs: Math.round(time * 1000),
                totalDurationMs: Math.round(totalDurationRef.current * 1000),
                isActivePlaying,
                endFinalized: endFinalizedRef.current,
                hasExplicitFadeToBlack,
                shouldBlackoutFadeTail,
                loopId: currentLoopId,
                currentLoopId: loopIdRef.current,
              });
            }
            previewTimelineDiagnosticsRef.current.lastShouldSuppressEndClear = true;
          } else {
            if (previewTimelineDiagnosticsRef.current.lastShouldSuppressEndClear !== false) {
              logInfo('RENDER', 'preview.endClear.executed', {
                globalTimeMs: Math.round(time * 1000),
                totalDurationMs: Math.round(totalDurationRef.current * 1000),
                isActivePlaying,
                endFinalized: endFinalizedRef.current,
                hasExplicitFadeToBlack,
                shouldBlackoutFadeTail,
                loopId: currentLoopId,
                currentLoopId: loopIdRef.current,
              });
            }
            previewTimelineDiagnosticsRef.current.lastShouldSuppressEndClear = false;
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            didUpdateCanvas = true;
          }
        }

        // video -> video 境界では、次動画 element を境界までの残り時間に依存せず常に preload="auto"
        // で trimStart に合わせて待機させる。これにより境界到達時に .load() で readyState を 0 へ
        // 戻すような破壊的再フェッチを必要としない (端末性能や負荷に依存しない不変条件)。
        // image -> video 境界は Android Chrome の seek 挙動を考慮し対象外とする (旧挙動を踏襲)。
        let standardImmediateNextVideoId: string | null = null;
        if (isStandardLivePreviewPlayback && activeIndex !== -1) {
          const activeItemForPrewarm = currentItems[activeIndex];
          const immediateNextItem = activeIndex + 1 < currentItems.length
            ? currentItems[activeIndex + 1]
            : null;
          if (
            activeItemForPrewarm?.type === 'video'
            && immediateNextItem?.type === 'video'
          ) {
            const nextElement = mediaElementsRef.current[immediateNextItem.id] as HTMLVideoElement | undefined;
            if (nextElement) {
              standardImmediateNextVideoId = immediateNextItem.id;
              const nextStart = immediateNextItem.trimStart || 0;
              let prebufferDiag: NextVideoPrebufferDiagState | null = null;
              if (isPreviewDiagnosticsLogMode(previewLogModeRef.current)) {
                const remainingToBoundarySec = Math.max(0, activeItemForPrewarm.duration - localTime);
                const existingPrebufferDiag = standardNextVideoPrebufferDiagRef.current[immediateNextItem.id];
                prebufferDiag =
                  existingPrebufferDiag &&
                  Math.abs(existingPrebufferDiag.targetSec - nextStart) <= 0.001
                    ? existingPrebufferDiag
                    : {
                      videoId: immediateNextItem.id,
                      startedAtMs: Date.now(),
                      targetSec: nextStart,
                      leadSec: Number.isFinite(remainingToBoundarySec) ? remainingToBoundarySec : null,
                      armed: false,
                    };
                standardNextVideoPrebufferDiagRef.current[immediateNextItem.id] = prebufferDiag;
              }
              if (nextElement.preload !== 'auto') {
                nextElement.preload = 'auto';
              }
              // .load() は readyState を 0 にリセットする破壊的操作なので、自然復旧目的
              // (まだ何も読まれていない、かつエラーも無い) のときだけ初回ロードを促す。
              if (nextElement.readyState === 0 && !nextElement.error) {
                try { nextElement.load(); } catch { /* ignore */ }
              }
              // 停止中で seek 完了済みなら、trimStart から大きく外れたときだけ静かに合わせる。
              // 再生中の動画 (= 直前 clip と入れ替わる直前) は触らずに browser の buffering に任せる。
              if (
                nextElement.paused
                && !nextElement.seeking
                && nextElement.readyState >= MIN_VIDEO_READY_STATE_FOR_SEEK
                && Math.abs(nextElement.currentTime - nextStart)
                  > STANDARD_PREVIEW_NEXT_VIDEO_PREWARM_DRIFT_TOLERANCE_SEC
              ) {
                nextElement.currentTime = nextStart;
              }
              if (prebufferDiag) {
                prebufferDiag.armed =
                  nextElement.readyState >= MIN_VIDEO_READY_STATE_FOR_SEEK
                  && !nextElement.seeking
                  && Math.abs(nextElement.currentTime - nextStart)
                    <= STANDARD_PREVIEW_NEXT_VIDEO_PREWARM_DRIFT_TOLERANCE_SEC;
              }
            }
          }
        }
        const allowExtendedFutureVideoPrewarm = !activeId || currentItems[activeIndex]?.type !== 'video';
        let nearestFutureVideoId: string | null = null;
        for (const item of currentItems) {
          const timelineRange = timelineRanges.get(item.id);
          if (!timelineRange || item.type !== 'video') {
            continue;
          }
          if (timelineRange.start - time > 0.0005) {
            nearestFutureVideoId = item.id;
            break;
          }
        }

        // タイムライン配列順に処理する（マウント順の Object.keys だと並べ替え後に
        // ディゾルブの描画順が逆転し、前クリップ(peer)が次クリップの上へ被さる）。
        // 配列順なら peer（activeIndex-1）が先に下層へ描かれ、active が上に重なる。
        currentItems.forEach((conf) => {
          const id = conf.id;
          const element = mediaElementsRef.current[id];
          const gainNode = gainNodesRef.current[id];

          if (!element) return;

          if (id === activeId) {
            const shouldStabilizeImageToVideoTransition =
              shouldStabilizeImageToVideoTransitionDuringExport({
                isExporting: _isExporting,
                isAndroid: platformCapabilities.isAndroid,
                activeItemType: conf.type,
                previousItemType: activeIndex > 0 ? currentItems[activeIndex - 1]?.type ?? null : null,
                clipLocalTime: localTime,
              });
            if (conf.type === 'video') {
              const videoEl = element as HTMLVideoElement;
              const targetTime = resolveVideoSourceTime({ trimStart: conf.trimStart || 0, localTime, playbackSpeed: conf.playbackSpeed });
              // プレビュー: rate=speed。export: rate=1 + ループ壁時計 dilation。
              if (isActivePlaying) {
                applyVideoElementPlaybackRate(
                  videoEl,
                  resolveVideoElementPlaybackRateForContext(_isExporting, conf.playbackSpeed),
                );
              }
              const activeVideoDrift = Math.abs(videoEl.currentTime - targetTime);
              const hasExportPlayFailure = _isExporting && !!exportPlayFailedRef.current[id];
              const baseSyncThreshold = shouldStabilizeImageToVideoTransition
                ? 0.01
                : getPreviewVideoSyncThreshold(previewPlatformPolicy, {
                  isExporting: _isExporting,
                  hasExportPlayFailure,
                });
              const syncThreshold = shouldStabilizeImageToVideoTransition
                ? baseSyncThreshold
                : resolveSpeedAwareVideoSyncThresholdSec(baseSyncThreshold, conf.playbackSpeed);

              if (isActivePlaying && activeVideoIdRef.current !== id) {
                activeVideoIdRef.current = id;
              }

              if (videoEl.readyState === 0 && !videoEl.error) {
                const now = Date.now();
                const lastAttempt = videoRecoveryAttemptsRef.current[id] || 0;
                if (now - lastAttempt > 2000) {
                  videoRecoveryAttemptsRef.current[id] = now;
                  try { videoEl.load(); } catch { /* ignore */ }
                }
              }

              const isUserSeeking = isSeekingRef.current;
              const isVideoSeeking = videoEl.seeking;

              if (isActivePlaying && !isUserSeeking) {
                if (shouldStabilizeImageToVideoTransition) {
                  if (
                    !isVideoSeeking
                    && Math.abs(videoEl.currentTime - targetTime)
                    > EXPORT_IMAGE_TO_VIDEO_STABILIZATION_SYNC_TOLERANCE_SEC
                  ) {
                    videoEl.currentTime = targetTime;
                  }
                  if (!videoEl.paused) {
                    videoEl.pause();
                  }
                }
                const shouldHoldVideoAtClipEnd = shouldHoldVideoFrameAtClipEnd({
                  clipLocalTime: localTime,
                  clipDuration: conf.duration,
                  trimStart: conf.trimStart || 0,
                  playbackSpeed: conf.playbackSpeed,
                  trimEnd: conf.trimEnd,
                  videoCurrentTime: videoEl.currentTime,
                  videoEnded: videoEl.ended,
                  isExporting: _isExporting,
                  isIosSafari: platformCapabilities.isIosSafari,
                  isLastTimelineItem: activeIndex === currentItems.length - 1,
                  nextItemType: activeIndex + 1 < currentItems.length
                    ? currentItems[activeIndex + 1]?.type ?? null
                    : null,
                  fps: FPS,
                });

                const shouldUseExportFallbackSeek =
                  _isExporting &&
                  hasExportPlayFailure &&
                  videoEl.paused &&
                  !isVideoSeeking &&
                  !shouldHoldVideoAtClipEnd &&
                  Math.abs(videoEl.currentTime - targetTime) > 0.04;
                if (shouldUseExportFallbackSeek) {
                  const nowMs = Date.now();
                  const lastSeekAtMs = exportFallbackSeekAtRef.current[id] || 0;
                  if (nowMs - lastSeekAtMs >= 140) {
                    exportFallbackSeekAtRef.current[id] = nowMs;
                    videoEl.currentTime = targetTime;
                  }
                }
                  const shouldDeferTrimmedHeadSync =
                  // trimStart 付き clip の head は hold 優先で安定させる。ここで currentTime correction を強制すると
                  // Android fallback が boundary 到達後の場当たり seek に戻りやすい。
                    isAndroidPreviewPlayback
                    && conf.trimStart > 0.001
                    && localTime <= 0.3;
                  const androidPreviewSyncThreshold = isAndroidPreviewPlayback
                    ? Math.max(syncThreshold, ANDROID_PREVIEW_RESYNC_THRESHOLD_SEC)
                    : syncThreshold;

                  if (
                    !isAndroidPreviewPlayback &&
                    !shouldDeferTrimmedHeadSync &&
                    !isVideoSeeking &&
                    !shouldHoldVideoAtClipEnd &&
                    !hasExportPlayFailure &&
                    !(
                      isAndroidPreviewPlayback
                      && localTime <= 0.3
                      && videoEl.readyState >= MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME
                      && Math.abs(videoEl.currentTime - targetTime) <= ANDROID_PREVIEW_SOFT_DRAW_DRIFT_THRESHOLD_SEC
                  ) &&
                    Math.abs(videoEl.currentTime - targetTime) > androidPreviewSyncThreshold
                  ) {
                    videoEl.currentTime = targetTime;
                  }
                const msSinceHardReset = Date.now() - (videoHardResetAtRef.current[id] ?? 0);
                const suppressPlayAfterHardReset =
                  msSinceHardReset < POST_EXPORT_PLAY_SUPPRESS_AFTER_HARD_RESET_MS;
                // seeking 固着中や hard reset 直後の play() は decoder を再 wedge させる（Issue #209 ログ）。
                const canRequestPlay =
                  !shouldStabilizeImageToVideoTransition
                  && videoEl.paused
                  && videoEl.readyState >= 1
                  && !shouldHoldVideoAtClipEnd
                  && !hasExportPlayFailure
                  && !isVideoSeeking
                  && !suppressPlayAfterHardReset
                  && !(
                    exportRanSinceLastPreviewRef.current
                    && videoEl.readyState < MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME
                  );
                if (canRequestPlay) {
                  const canPlayAndroidPreviewActiveVideoAfterDraw =
                    isAndroidPreviewPlayback
                    && !isVideoSeeking
                    && canDrawVideo(videoEl);
                  if (isAndroidPreviewPlayback) {
                    if (canPlayAndroidPreviewActiveVideoAfterDraw) {
                      shouldPlayAndroidPreviewActiveVideoAfterDraw = true;
                    } else {
                      requestVideoPlayWithRetry(videoEl, () =>
                        isPlayingRef.current
                        && !isSeekingRef.current
                        && loopIdRef.current === currentLoopId,
                      );
                    }
                  } else {
                    videoEl.play().then(() => {
                      if (_isExporting) {
                        delete exportPlayFailedRef.current[id];
                        delete exportFallbackSeekAtRef.current[id];
                      }
                    }).catch((err) => {
                      if (_isExporting) {
                        if (!exportPlayFailedRef.current[id]) {
                          exportPlayFailedRef.current[id] = true;
                          exportFallbackSeekAtRef.current[id] = 0;
                          logWarn('RENDER', 'エクスポート中の動画再生開始に失敗。シーク同期フォールバックへ切替', {
                            videoId: id,
                            error: err instanceof Error ? err.message : String(err),
                          });
                        }
                        return;
                      }
                      // preview では一発失敗で区間が paused のまま固まらないよう retry へ繋ぐ。
                      const nowMs = Date.now();
                      if (nowMs - (previewPlayFailureLogAtRef.current[id] ?? 0) > 2000) {
                        previewPlayFailureLogAtRef.current[id] = nowMs;
                        logWarn('RENDER', 'preview.play.failed: retrying', {
                          videoId: id,
                          error: err instanceof Error ? err.message : String(err),
                        });
                      }
                      requestVideoPlayWithRetry(videoEl, () =>
                        isPlayingRef.current
                        && !isSeekingRef.current
                        && loopIdRef.current === currentLoopId,
                      );
                    });
                  }
                }

                const androidRecoveryDecision = getAndroidPreviewRecoveryDecision({
                  isAndroid: platformCapabilities.isAndroid,
                  isIosSafari: platformCapabilities.isIosSafari,
                  isExporting: _isExporting,
                  isActivePlaying,
                  isUserSeeking,
                  videoPaused: videoEl.paused,
                  videoSeeking: isVideoSeeking,
                  videoReadyState: videoEl.readyState,
                  videoWidth: videoEl.videoWidth,
                  videoHeight: videoEl.videoHeight,
                  videoCurrentTime: videoEl.currentTime,
                  targetTime,
                  syncThresholdSec: PREVIEW_ANDROID_RECOVERY_DRIFT_THRESHOLD_SEC,
                  softDrawDriftThresholdSec: ANDROID_PREVIEW_SOFT_DRAW_DRIFT_THRESHOLD_SEC,
                });
                if (androidRecoveryDecision.shouldRecover) {
                  const now = Date.now();
                  const lastAttempt = videoRecoveryAttemptsRef.current[id] || 0;
                  const shouldHoldRecoveryFrame =
                    androidRecoveryDecision.shouldHoldFrame
                    && localTime >= 0
                    && localTime <= PREVIEW_ANDROID_PASSIVE_HOLD_MAX_SEC;
                  holdFrame = holdFrame || shouldHoldRecoveryFrame;
                  if (now - lastAttempt > 220) {
                    videoRecoveryAttemptsRef.current[id] = now;
                    const recoveryState = androidPreviewRecoveryRef.current[id] ?? {
                      active: true,
                      reason: androidRecoveryDecision.reason ?? 'ready-state-low',
                      startedAt: now,
                      lastAttemptAt: 0,
                      lastTargetTime: targetTime,
                      attempts: 0,
                    };
                    recoveryState.attempts += 1;
                    recoveryState.lastAttemptAt = now;
                    recoveryState.lastTargetTime = targetTime;
                    androidPreviewRecoveryRef.current[id] = recoveryState;
                    if (videoEl.readyState === 0 && !videoEl.error) {
                      try { videoEl.load(); } catch { /* ignore */ }
                    }
                    if (
                      androidRecoveryDecision.shouldResyncTime
                      && !videoEl.seeking
                      && videoEl.readyState >= 1
                    ) {
                      const lastSeekAtMs = androidPreviewLastSeekAtRef.current[id] || 0;
                      const sinceLastSeekMs = now - lastSeekAtMs;
                      const segmentRecoveryKey = `${activeIndex}:${id}`;
                      const segmentRecoveryState = androidPreviewRecoveredSegmentRef.current[id];
                      const segmentRecoverySeekCount =
                        segmentRecoveryState?.key === segmentRecoveryKey
                          ? segmentRecoveryState.count
                          : 0;
                      // recovery seek は Android passive preview の最後の手段。最低 1 秒間隔を守りつつ、
                      // drift が解消しない限り 1 segment あたり最大 N 回まで再試行する
                      // (1 回限りだと、その seek 自体が失敗したとき区間まるごとフリーズする)。
                      if (
                        localTime >= 0
                        &&
                        sinceLastSeekMs >= PREVIEW_ANDROID_RECOVERY_MIN_INTERVAL_MS
                        && activeVideoDrift >= PREVIEW_ANDROID_RECOVERY_DRIFT_THRESHOLD_SEC
                        && localTime > PREVIEW_ANDROID_RECOVERY_SKIP_AFTER_BOUNDARY_SEC
                        && segmentRecoverySeekCount < PREVIEW_ANDROID_RECOVERY_MAX_SEEKS_PER_SEGMENT
                      ) {
                        maybeAssignAndroidPreviewSeek({
                          videoEl,
                          reason: androidRecoveryDecision.reason ?? 'timeline-drift',
                          videoId: id,
                          segmentIndex: activeIndex,
                          segmentRecoveryKey,
                          targetTime,
                          currentTimeBefore: videoEl.currentTime,
                          drift: activeVideoDrift,
                          sinceLastSeekMs,
                        });
                      }
                    }
                    if (
                      androidRecoveryDecision.shouldRetryPlay
                      && !shouldPlayAndroidPreviewActiveVideoAfterDraw
                      && !isVideoSeeking
                      && videoEl.readyState >= MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME
                    ) {
                      requestVideoPlayWithRetry(videoEl, () =>
                        isPlayingRef.current
                        && !isSeekingRef.current
                        && loopIdRef.current === currentLoopId,
                      );
                    }
                  }
                } else if (androidPreviewRecoveryRef.current[id]) {
                  delete androidPreviewRecoveryRef.current[id];
                  const rebasedStartTime = getStandardPreviewNow() - currentTimeRef.current * 1000;
                  const clockAbsorbMs = Math.abs(rebasedStartTime - startTimeRef.current);
                  startTimeRef.current = rebasedStartTime;
                  if (previewTimelineDiagnosticsRef.current.activeBoundary !== null) {
                    previewTimelineDiagnosticsRef.current.activeBoundary.clockAbsorbMs += clockAbsorbMs;
                  }
                  primePreviewAudioOnlyTracksAtTimeRef.current(currentTimeRef.current);
                }

                // stall watchdog: seeking のまま戻らない / readyState が上がらないデコーダ固着は、
                // Android recovery (`!seeking` ガード付き) では一切叩き起こせないため、
                // 一定時間継続したら currentTime の割り込み再代入でシークを再発行する (PC / Android 共通)。
                if (!_isExporting) {
                  const watchdogNowMs = Date.now();
                  const stallStates = videoStallWatchdogRef.current;
                  const isStalledNow =
                    videoEl.seeking
                    || videoEl.readyState < MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME;
                  if (!isStalledNow) {
                    if (stallStates[id]) {
                      delete stallStates[id];
                    }
                  } else {
                    let stallState = stallStates[id];
                    // 前回評価から間が空いていたら (境界跨ぎ / タブ非表示など) 計測をやり直す。
                    if (
                      !stallState
                      || watchdogNowMs - stallState.lastSeenAtMs > PREVIEW_STALL_STATE_CONTINUITY_MS
                    ) {
                      stallState = {
                        stalledSinceMs: watchdogNowMs,
                        lastKickAtMs: 0,
                        kickCount: 0,
                        lastSeenAtMs: watchdogNowMs,
                      };
                      stallStates[id] = stallState;
                    }
                    stallState.lastSeenAtMs = watchdogNowMs;
                    const stallKickDecision = getStandardPreviewStallKickDecision({
                      isExporting: _isExporting,
                      isActivePlaying,
                      isUserSeeking,
                      videoSeeking: videoEl.seeking,
                      videoReadyState: videoEl.readyState,
                      videoHasError: !!videoEl.error,
                      stalledForMs: watchdogNowMs - stallState.stalledSinceMs,
                      sinceLastKickMs: stallState.lastKickAtMs === 0
                        ? Number.POSITIVE_INFINITY
                        : watchdogNowMs - stallState.lastKickAtMs,
                    });
                    if (stallKickDecision.shouldKick) {
                      stallState.lastKickAtMs = watchdogNowMs;
                      stallState.kickCount += 1;
                      // Android recovery seek の最低間隔判定とも整合させる。
                      androidPreviewLastSeekAtRef.current[id] = watchdogNowMs;
                      const currentTimeBeforeKick = videoEl.currentTime;
                      try {
                        videoEl.currentTime = targetTime;
                        logWarn('RENDER', 'preview.stall.watchdog.kick', {
                          videoId: id,
                          reason: stallKickDecision.reason,
                          kickCount: stallState.kickCount,
                          stalledForMs: watchdogNowMs - stallState.stalledSinceMs,
                          targetTime,
                          currentTimeBefore: currentTimeBeforeKick,
                          readyState: videoEl.readyState,
                          seeking: videoEl.seeking,
                        });
                      } catch {
                        /* ignore */
                      }
                    }
                  }
                }
              } else if (!isActivePlaying && !isUserSeeking) {
                if (!videoEl.paused) {
                  videoEl.pause();
                }
              }
            } else {
              if (isActivePlaying && activeVideoIdRef.current !== null) {
                activeVideoIdRef.current = null;
              }
            }

            const isVideo = conf.type === 'video';
            const videoEl = element as HTMLVideoElement;
            const imgEl = element as HTMLImageElement;
            const isVideoReady = isVideo
              ? videoEl.readyState >= 2 && !videoEl.seeking
              : false;
            const isReady = isVideo ? isVideoReady : imgEl.complete;
            const shouldSkipVideoDrawForFadeTail =
              isVideo
              && id === activeId
              && shouldBlackoutFadeTail;
            const shouldSkipVideoDrawForAndroidHold =
              isVideo
              && id === activeId
              && shouldSkipAndroidPreviewActiveDraw;
            // fade region 中は canvas を毎フレーム黒クリアするため holdFrame で前フレームを残せない。
            // デコーダ固着で実フレームが無いときは、直前の非黒スナップショットに fade alpha を
            // 掛けて描画し、ブラックアウト固着を防ぐ。
            const fadeStallSnapshot = fadeStallSnapshotRef.current;
            const shouldUseFadeStallSnapshot =
              isVideo
              && id === activeId
              && !shouldSkipVideoDrawForAndroidHold
              && shouldDrawFadeStallSnapshotFrame({
                isExporting: _isExporting,
                isVideoDrawable:
                  isVideoReady && videoEl.videoWidth > 0 && videoEl.videoHeight > 0,
                isInFadeRegion,
                shouldBlackoutFadeTail,
                activeVideoId: activeId,
                snapshotVideoId: fadeStallSnapshot.videoId,
                snapshotWidth: fadeStallSnapshot.canvas?.width ?? 0,
                snapshotHeight: fadeStallSnapshot.canvas?.height ?? 0,
              });
            const stallSnapshotCanvas = shouldUseFadeStallSnapshot
              ? fadeStallSnapshot.canvas
              : null;

            if (
              (isReady || stallSnapshotCanvas)
              && !shouldSkipVideoDrawForFadeTail
              && !shouldSkipVideoDrawForAndroidHold
            ) {
              const elemW = stallSnapshotCanvas
                ? stallSnapshotCanvas.width
                : isVideo ? videoEl.videoWidth : imgEl.naturalWidth;
              const elemH = stallSnapshotCanvas
                ? stallSnapshotCanvas.height
                : isVideo ? videoEl.videoHeight : imgEl.naturalHeight;
              if (elemW && elemH) {
                const scaleFactor = conf.scale || 1.0;
                const userX = conf.positionX || 0;
                const userY = conf.positionY || 0;
                const rotationDeg = normalizeRotation(conf.rotation);

                // 90/270 度回転では素材の縦横がキャンバス上で入れ替わるため、
                // fit 計算には回転後の実効寸法を渡す（回転しても cover/contain が成立する）。
                const fitDims = resolveRotatedFitDimensions(elemW, elemH, rotationDeg);

                // 縦(9:16)キャンバスは横素材を「縦フレームを埋める」cover 配置、
                // 横(16:9)キャンバスは従来どおり contain。Canvas 寸法から向きを判定する。
                const baseScale = resolveMediaBaseScale({
                  canvasWidth: ctx.canvas.width,
                  canvasHeight: ctx.canvas.height,
                  elementWidth: fitDims.width,
                  elementHeight: fitDims.height,
                  mode: ctx.canvas.height > ctx.canvas.width ? 'cover' : 'contain',
                });
                const renderScale = baseScale * scaleFactor;
                const rawDrawSource = (stallSnapshotCanvas ?? element) as CanvasImageSource;
                const blurPixels = resolveMediaBlurPixels(
                  conf.blur,
                  ctx.canvas.width,
                  ctx.canvas.height,
                );
                const drawSource = !isVideo && blurPixels > 0
                  ? prepareUniformMediaBlurSource(
                      rawDrawSource,
                      elemW,
                      elemH,
                      blurPixels,
                      renderScale,
                    )
                  : rawDrawSource;

                ctx.save();
                ctx.filter = isVideo
                  ? resolveMediaBlurFilter(conf.blur, ctx.canvas.width, ctx.canvas.height)
                  : 'none';
                ctx.translate(ctx.canvas.width / 2 + userX, ctx.canvas.height / 2 + userY);
                if (rotationDeg !== 0) {
                  ctx.rotate((rotationDeg * Math.PI) / 180);
                }
                ctx.scale(renderScale, renderScale);

                let alpha = 1.0;
                let fadeInDur = conf.fadeIn ? (conf.fadeInDuration || 1.0) : 0;
                let fadeOutDur = conf.fadeOut ? (conf.fadeOutDuration || 1.0) : 0;
                // フェード時間のクランプ（フェードイン + フェードアウト > クリップ長の場合に按分）。
                // export と同じロジックを使い、プレビューと書き出しでフェード挙動を一致させる。
                if (fadeInDur + fadeOutDur > conf.duration && conf.duration > 0) {
                  const ratio = conf.duration / (fadeInDur + fadeOutDur);
                  fadeInDur *= ratio;
                  fadeOutDur *= ratio;
                }

                if (fadeInDur > 0 && localTime < fadeInDur) {
                  alpha = localTime / fadeInDur;
                } else if (fadeOutDur > 0 && localTime > conf.duration - fadeOutDur) {
                  const remaining = conf.duration - localTime;
                  alpha = remaining / fadeOutDur;
                }

                // ディゾルブ(重ねる): 前クリップの上へクロスフェードで重なる
                if (id === activeId && overlapCrossInAlpha !== null) {
                  alpha *= overlapCrossInAlpha;
                }
                ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
                try {
                  ctx.drawImage(
                    drawSource,
                    -elemW / 2,
                    -elemH / 2,
                    elemW,
                    elemH,
                  );
                  didUpdateCanvas = true;
                  if (isVideo && id === activeId && !_isExporting) {
                    if (stallSnapshotCanvas) {
                      const nowMs = Date.now();
                      if (
                        nowMs - (fadeStallHoldLogAtRef.current[id] ?? 0)
                        >= PREVIEW_FADE_STALL_HOLD_LOG_INTERVAL_MS
                      ) {
                        fadeStallHoldLogAtRef.current[id] = nowMs;
                        logInfo('RENDER', 'preview.fade.stallSnapshotHold', {
                          videoId: id,
                          readyState: videoEl.readyState,
                          seeking: videoEl.seeking,
                          timelineTime: time,
                          snapshotAgeMs: nowMs - fadeStallSnapshot.capturedAtMs,
                        });
                      }
                    } else {
                      captureFadeStallSnapshot(id, videoEl, ctx.canvas.width, ctx.canvas.height);
                    }
                  }
                } finally {
                  if (
                    shouldPlayAndroidPreviewActiveVideoAfterDraw
                    && isVideo
                    && id === activeId
                    && videoEl.paused
                  ) {
                    shouldPlayAndroidPreviewActiveVideoAfterDraw = false;
                    requestVideoPlayWithRetry(videoEl, () =>
                      isPlayingRef.current
                      && !isSeekingRef.current
                      && loopIdRef.current === currentLoopId,
                    );
                  }
                  ctx.restore();
                  ctx.filter = 'none';
                  ctx.globalAlpha = 1.0;
                }
              }
            }

            if (conf.type === 'video') {
              const videoMediaEl = element as HTMLMediaElement;
              let hasAudioNode = !!sourceNodesRef.current[id];
              const currentGainNode = gainNodesRef.current[id];
              if (isActivePlaying) {
                let vol = holdAudioThisFrame ? 0 : (conf.isMuted ? 0 : conf.volume);
                const fadeInDur = conf.fadeInDuration || 1.0;
                const fadeOutDur = conf.fadeOutDuration || 1.0;

                if (conf.fadeIn && localTime < fadeInDur) {
                  vol *= localTime / fadeInDur;
                } else if (conf.fadeOut && localTime > conf.duration - fadeOutDur) {
                  const remaining = conf.duration - localTime;
                  vol *= remaining / fadeOutDur;
                }
                // ディゾルブ(重ねる): 音声もクロスフェードイン
                if (overlapAudioCrossIn !== null) {
                  vol *= overlapAudioCrossIn;
                }

                if (
                  !hasAudioNode &&
                  getPreviewAudioOutputMode(previewPlatformPolicy, {
                    hasAudioNode: false,
                    isExporting: _isExporting,
                    audibleSourceCount: vol > 0 ? activePreviewAudioSourceCount : 0,
                    desiredVolume: vol,
                    baseVolume: conf.isMuted ? 0 : conf.volume,
                    sourceType: 'video',
                  }) === 'webaudio'
                ) {
                  hasAudioNode = ensureAudioNodeForElement(id, videoMediaEl);
                  if (hasAudioNode && !_isExporting) {
                    requestPreviewAudioRouteRefreshRef.current();
                  }
                }

                const outputMode = applyPreviewAudioOutputState(previewPlatformPolicy, videoMediaEl, {
                  hasAudioNode,
                  desiredVolume: vol,
                  audibleSourceCount: vol > 0 ? activePreviewAudioSourceCount : 0,
                  isExporting: _isExporting,
                  baseVolume: conf.isMuted ? 0 : conf.volume,
                });

                // 経路ラッチ（getPreviewAudioOutputMode 参照）により、ノードを持つ要素は
                // 再生中に native へ戻らない。ここで detach すると 100% を跨ぐ音量変更のたびに
                // メディアパイプライン再構成が走りプレビューがカクつくため、rAF 内では剥がさない。
                const effectiveGain = outputMode === 'native' ? 0 : vol;
                if (currentGainNode && audioCtxRef.current) {
                  const currentGain = currentGainNode.gain.value;
                  if (Math.abs(currentGain - effectiveGain) > 0.01) {
                    currentGainNode.gain.setTargetAtTime(
                      effectiveGain,
                      audioCtxRef.current.currentTime,
                      shouldStabilizeImageToVideoTransition ? 0.01 : 0.05,
                    );
                  }
                }
              } else {
                applyPreviewAudioOutputState(previewPlatformPolicy, videoMediaEl, {
                  hasAudioNode,
                  desiredVolume: 0,
                  audibleSourceCount: 0,
                  isExporting: _isExporting,
                });
                if (currentGainNode && audioCtxRef.current) {
                  currentGainNode.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.05);
                }
              }
            }
          } else {
            // === ディゾルブ(重ねる)中の前クリップ(peer)処理 ===
            // overlap 窓では前クリップを描画（下層）・再生継続し、音声をフェードアウトする。
            // 通常の inactive 処理（pause / prewarm / reset）はスキップする。
            if (id === overlapPeerId && overlapPeerLocalTime !== null) {
              const peerIsVideo = conf.type === 'video';
              const peerVideoEl = element as HTMLVideoElement;
              const peerImageEl = element as HTMLImageElement;
              if (peerIsVideo && isActivePlaying && peerVideoEl.paused && !peerVideoEl.seeking && peerVideoEl.readyState >= 2) {
                peerVideoEl.play().catch(() => { /* ignore */ });
              }
              if (peerIsVideo && !isActivePlaying) {
                const peerTarget = resolveVideoSourceTime({ trimStart: conf.trimStart || 0, localTime: overlapPeerLocalTime, playbackSpeed: conf.playbackSpeed });
                if (
                  peerVideoEl.readyState >= MIN_VIDEO_READY_STATE_FOR_SEEK
                  && !peerVideoEl.seeking
                  && Math.abs(peerVideoEl.currentTime - peerTarget) > 0.3
                ) {
                  try { peerVideoEl.currentTime = peerTarget; } catch { /* ignore */ }
                }
              }
              const peerReady = peerIsVideo
                ? peerVideoEl.readyState >= MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME && peerVideoEl.videoWidth > 0
                : peerImageEl.naturalWidth > 0;
              if (peerReady) {
                const peerW = peerIsVideo ? peerVideoEl.videoWidth : peerImageEl.naturalWidth;
                const peerH = peerIsVideo ? peerVideoEl.videoHeight : peerImageEl.naturalHeight;
                if (peerW && peerH) {
                  const peerRotationDeg = normalizeRotation(conf.rotation);
                  const peerFitDims = resolveRotatedFitDimensions(peerW, peerH, peerRotationDeg);
                  const peerBase = resolveMediaBaseScale({
                    canvasWidth: ctx.canvas.width,
                    canvasHeight: ctx.canvas.height,
                    elementWidth: peerFitDims.width,
                    elementHeight: peerFitDims.height,
                    mode: ctx.canvas.height > ctx.canvas.width ? 'cover' : 'contain',
                  });
                  const peerRenderScale = peerBase * (conf.scale || 1);
                  const peerBlurPixels = resolveMediaBlurPixels(
                    conf.blur,
                    ctx.canvas.width,
                    ctx.canvas.height,
                  );
                  const peerDrawSource = !peerIsVideo && peerBlurPixels > 0
                    ? prepareUniformMediaBlurSource(
                        element as CanvasImageSource,
                        peerW,
                        peerH,
                        peerBlurPixels,
                        peerRenderScale,
                      )
                    : element as CanvasImageSource;
                  ctx.save();
                  ctx.filter = peerIsVideo
                    ? resolveMediaBlurFilter(conf.blur, ctx.canvas.width, ctx.canvas.height)
                    : 'none';
                  ctx.translate(
                    ctx.canvas.width / 2 + (conf.positionX || 0),
                    ctx.canvas.height / 2 + (conf.positionY || 0),
                  );
                  if (peerRotationDeg !== 0) {
                    ctx.rotate((peerRotationDeg * Math.PI) / 180);
                  }
                  ctx.scale(peerRenderScale, peerRenderScale);
                  ctx.globalAlpha = 1.0;
                  try {
                    ctx.drawImage(peerDrawSource, -peerW / 2, -peerH / 2, peerW, peerH);
                    didUpdateCanvas = true;
                  } catch {
                    /* ignore */
                  } finally {
                    ctx.restore();
                    ctx.filter = 'none';
                    ctx.globalAlpha = 1.0;
                  }
                }
              }
              if (peerIsVideo) {
                const peerGainNode = gainNodesRef.current[id];
                const peerHasNode = !!sourceNodesRef.current[id];
                let peerVol = (conf.isMuted ? 0 : conf.volume) * overlapAudioCrossOut;
                if (!isActivePlaying || holdAudioThisFrame) peerVol = 0;
                const peerMode = applyPreviewAudioOutputState(previewPlatformPolicy, peerVideoEl, {
                  hasAudioNode: peerHasNode,
                  desiredVolume: peerVol,
                  audibleSourceCount: peerVol > 0 ? activePreviewAudioSourceCount : 0,
                  isExporting: _isExporting,
                  baseVolume: conf.isMuted ? 0 : conf.volume,
                });
                const peerGainValue = peerMode === 'native' ? 0 : peerVol;
                if (peerGainNode && audioCtxRef.current) {
                  peerGainNode.gain.setTargetAtTime(peerGainValue, audioCtxRef.current.currentTime, 0.05);
                }
              }
              return;
            }
            if (conf.type === 'video') {
              const videoEl = element as HTMLVideoElement;
              const hasVideoAudioNode = !!sourceNodesRef.current[id];
              const timelineRange = timelineRanges.get(id);
              const timeSinceVideoEndSec = timelineRange
                ? time - timelineRange.end
                : null;
              const timeUntilVideoStartSec = timelineRange
                ? timelineRange.start - time
                : null;
              const shouldKeepVideoPrewarmed = !isAndroidPreviewPlayback && shouldKeepInactiveVideoPrewarmed(previewPlatformPolicy, {
                hasAudioNode: hasVideoAudioNode,
                isExporting: _isExporting,
                isActivePlaying,
                timeSinceVideoEndSec,
                timeUntilVideoStartSec,
                isNearestFutureVideo: id === nearestFutureVideoId,
                allowExtendedFuturePrewarm: allowExtendedFutureVideoPrewarm,
              });
              const avoidPausePlayForInactive = shouldAvoidPauseInactiveVideoInPreview(previewPlatformPolicy, {
                hasAudioNode: hasVideoAudioNode,
                isExporting: _isExporting,
                isActivePlaying,
              });
              const shouldPrimeFutureVideo = !isAndroidPreviewPlayback && shouldPrimeFutureInactiveVideoInPreview(previewPlatformPolicy, {
                hasAudioNode: hasVideoAudioNode,
                isExporting: _isExporting,
                isActivePlaying,
                shouldKeepVideoPrewarmed,
                timeUntilVideoStartSec,
              });
              const shouldRecoverAudioOnlyAfterBoundary = shouldRecoverAudioOnlyAfterVideoBoundary(previewPlatformPolicy, {
                hasAudioNode: hasVideoAudioNode,
                isExporting: _isExporting,
                isActivePlaying,
                timeSinceVideoEndSec,
              });
              const isStandardImmediateNextVideo = id === standardImmediateNextVideoId;

              if (shouldRecoverAudioOnlyAfterBoundary) {
                const ctx = audioCtxRef.current;
                if (ctx && (ctx.state as AudioContextState | 'interrupted') !== 'running') {
                  ctx.resume().catch(() => { });
                }
                primePreviewAudioOnlyTracksAtTimeRef.current(time);
              }

              if (shouldPrimeFutureVideo && videoEl.paused && !videoEl.seeking && videoEl.readyState >= 2) {
                const startTime = conf.trimStart || 0;
                if (Math.abs(videoEl.currentTime - startTime) > 0.1) {
                  videoEl.currentTime = startTime;
                }
                videoEl.play().catch(() => { });
              }

              if (!shouldKeepVideoPrewarmed && !isStandardImmediateNextVideo && id !== activeVideoIdRef.current) {
                videoEl.preload = 'metadata';
              }

              // 非アクティブは等倍に戻し、次クリップ active 化時の rate 残留を防ぐ
              applyVideoElementPlaybackRate(videoEl, 1);
              if (!shouldKeepVideoPrewarmed && !avoidPausePlayForInactive && !videoEl.paused) {
                videoEl.pause();
                if (
                  hasVideoAudioNode
                  && isActivePlaying
                  && previewPlatformPolicy.muteNativeMediaWhenAudioRouted
                  && !_isExporting
                ) {
                  const ctx = audioCtxRef.current;
                  if (ctx && (ctx.state as AudioContextState | 'interrupted') !== 'running') {
                    ctx.resume().catch(() => { });
                  }
                  primePreviewAudioOnlyTracksAtTimeRef.current(time);
                }
              }
              applyPreviewAudioOutputState(previewPlatformPolicy, videoEl, {
                hasAudioNode: hasVideoAudioNode,
                desiredVolume: 0,
                audibleSourceCount: 0,
                isExporting: _isExporting,
              });
            }
            if (conf.type === 'video' && gainNode && audioCtxRef.current) {
              gainNode.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.05);
            }
          }
        });

        const currentCaptions = captionsRef.current;
        const currentCaptionSettings = captionSettingsRef.current;
        const exportFrameIndex = _isExporting ? Math.max(0, Math.floor(time * FPS + 1e-9)) : null;
        const exportDurationAlignment = _isExporting
          ? resolveExportDuration(totalDurationRef.current, FPS)
          : null;
        const exportFrameTiming = (_isExporting && exportDurationAlignment && exportFrameIndex !== null && exportFrameIndex < exportDurationAlignment.frameCount)
          ? getExportFrameTiming(exportDurationAlignment, FPS, exportFrameIndex)
          : null;
        // === クリップ間トランジション描画（standard 限定機能・タイムライン長は不変） ===
        // ディゾルブ: 現クリップの終端 d 秒で次クリップのフレームを重ねる
        // フェード(黒/白): 境界の前後 d/2 秒で色板をディップさせる
        if (activeId) {
          const transitionActiveIndex = currentItems.findIndex((item) => item.id === activeId);
          const transitionActiveItem = transitionActiveIndex >= 0 ? currentItems[transitionActiveIndex] : null;
          const transitionActiveRange = transitionActiveItem
            ? timelineRanges.get(transitionActiveItem.id)
            : undefined;
          if (transitionActiveItem && transitionActiveRange) {
            const drawTransitionColorOverlay = (color: string, alpha: number) => {
              const clamped = Math.max(0, Math.min(1, alpha));
              if (clamped <= 0) return;
              ctx.save();
              ctx.globalAlpha = clamped;
              ctx.fillStyle = color;
              ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
              ctx.restore();
              ctx.globalAlpha = 1.0;
              didUpdateCanvas = true;
            };

            // フェード(黒/白)のディップのみ（ディゾルブは overlap 方式で peer/active 描画に統合済み）
            const outgoing = transitionActiveItem.transitionToNext;
            if (outgoing && transitionActiveIndex < currentItems.length - 1) {
              const overlay = getOutgoingTransitionOverlay(outgoing, transitionActiveRange.end - time);
              if (overlay) {
                drawTransitionColorOverlay(overlay.color, overlay.alpha);
              }
            }

            const transitionPrevItem = transitionActiveIndex > 0
              ? currentItems[transitionActiveIndex - 1]
              : null;
            const incoming = transitionPrevItem?.transitionToNext;
            if (incoming) {
              const overlayIn = getIncomingTransitionOverlay(incoming, time - transitionActiveRange.start);
              if (overlayIn) {
                drawTransitionColorOverlay(overlayIn.color, overlayIn.alpha);
              }
            }
          }
        }

        // === キャプション抜きフレームのスナップショット ===
        // キャプション設定のミニプレビューは「現在フレームへ設定中のキャプションを重ねて」
        // 見た目を確かめる。ここでメインプレビューの canvas をそのまま転写元にすると
        // **既に焼き込まれたキャプションの上へもう 1 枚描く**ことになり、文字が二重に見える
        // （サイズ変更時に前のサイズが残る／削除したはずの文字が残る）。
        // そのため、キャプションを描く直前の状態を控えておき、ミニプレビューはこちらを使う。
        if (!_isExporting && captionFreeSnapshotRef) {
          captureCaptionFreeSnapshot(ctx, captionFreeSnapshotRef.current);
        }

        // エンドロール区間ではキャプションを表示しない（映像に付随するものなので）。
        // どのみち後段のエンドロール描画が全面を覆うが、無駄なグリフ生成を避ける。
        if (!isEndrollFrame && currentCaptionSettings.enabled && currentCaptions.length > 0) {
          const activeCaptions = currentCaptions.filter(
            (c) => isCaptionActiveAtTime(c, time),
          );
          for (const activeCaption of activeCaptions) {
            // 複数行テキストは時分割（文字数比で配分した 1 行）を順次表示する。
            // 行間ギャップ（sequentialGapSec）中は何も描画しない
            const displaySegment = resolveCaptionDisplaySegment(activeCaption, time);
            if (!displaySegment) continue;
            if (_isExporting && exportFrameTiming && time <= 3) {
              logInfo('RENDER', '[DIAG-CAPTION-EXPORT-TIMING]', {
                frameIndex: exportFrameIndex,
                frameTimestampUs: exportFrameTiming.timestampUs,
                exportFrameTimeSec: time,
                captionId: activeCaption.id,
                captionStart: activeCaption.startTime,
                captionEnd: activeCaption.endTime,
                isActive: isCaptionActiveAtTime(activeCaption, time),
              });
            }
            // fontSize は 1080p export を基準にした絶対 px (medium = 7.41% of 短辺 1080)。
            // 短辺基準で按分するため、横 16:9 / 縦 9:16 でも「フレーム短辺に対する文字の比率」が揃う (WYSIWYG)。
            // 高さだけを基準にすると縦画面で文字が約 1.78 倍になり見づらくなる。
            // プリセット + 一括カスタム値（fontSizeCustom）の解決は captionStyle.ts に集約。
            const baseFontSize = resolveCaptionBaseFontSize(activeCaption, currentCaptionSettings);

            // プレビューは 720p、エクスポートは 1080p で同じ canvas を使い回すため、
            // 短辺 1080 を基準にスケールすると「プレビューで見たまま export される (WYSIWYG)」になる。
            // 720p プレビュー時は fontSize/padding/stroke/blur を 0.667 倍に縮小する。
            const captionScale = resolveCaptionLayoutScale(ctx.canvas.width, ctx.canvas.height);
            const fontSize = Math.max(1, baseFontSize * captionScale);

            const effectiveFontStyle = activeCaption.overrideFontStyle ?? currentCaptionSettings.fontStyle;
            const fontFamily = resolveCaptionFontFamily(effectiveFontStyle);

            // 位置はプリセット（上中下）+ 一括カスタム XY（positionCustom）を解決
            const padding = 50 * captionScale;
            const captionAnchor = resolveCaptionAnchor(activeCaption, currentCaptionSettings, {
              canvasWidth: ctx.canvas.width,
              canvasHeight: ctx.canvas.height,
              fontSize,
              padding,
            });
            const y = captionAnchor.y;

            // フェード基準区間: 既定はカード全体（最初の行の頭・最後の行の尻）。
            // 時分割 + sequentialFadeMode='line' のときは行区間ごとにフェードする
            const useLineFadeBasis = displaySegment.isSequential
              && activeCaption.sequentialFadeMode === 'line';
            const fadeBasisStart = useLineFadeBasis ? displaySegment.startTime : activeCaption.startTime;
            const fadeBasisEnd = useLineFadeBasis ? displaySegment.endTime : activeCaption.endTime;
            const captionDuration = fadeBasisEnd - fadeBasisStart;
            const captionLocalTime = time - fadeBasisStart;

            const useFadeIn = activeCaption.overrideFadeIn !== undefined
              ? activeCaption.overrideFadeIn === 'on'
              : currentCaptionSettings.bulkFadeIn;
            const useFadeOut = activeCaption.overrideFadeOut !== undefined
              ? activeCaption.overrideFadeOut === 'on'
              : currentCaptionSettings.bulkFadeOut;

            let fadeInDur = activeCaption.overrideFadeIn === 'on' && activeCaption.overrideFadeInDuration !== undefined
              ? activeCaption.overrideFadeInDuration
              : (currentCaptionSettings.bulkFadeInDuration || 1.0);
            let fadeOutDur = activeCaption.overrideFadeOut === 'on' && activeCaption.overrideFadeOutDuration !== undefined
              ? activeCaption.overrideFadeOutDuration
              : (currentCaptionSettings.bulkFadeOutDuration || 1.0);

            // 行ごとフェードでは短い行区間をフェードが食い潰さないよう按分クランプする
            if (useLineFadeBasis && captionDuration > 0) {
              const inEffective = useFadeIn ? fadeInDur : 0;
              const outEffective = useFadeOut ? fadeOutDur : 0;
              if (inEffective + outEffective > captionDuration) {
                const ratio = captionDuration / (inEffective + outEffective);
                fadeInDur *= ratio;
                fadeOutDur *= ratio;
              }
            }

            let fadeInAlpha = 1.0;
            let fadeOutAlpha = 1.0;

            if (useFadeIn && captionLocalTime < fadeInDur) {
              fadeInAlpha = captionLocalTime / fadeInDur;
            }
            if (useFadeOut && captionLocalTime > captionDuration - fadeOutDur) {
              const remaining = captionDuration - captionLocalTime;
              fadeOutAlpha = remaining / fadeOutDur;
            }

            const alpha = Math.max(0, Math.min(1, fadeInAlpha * fadeOutAlpha));

            ctx.save();
            ctx.font = `bold ${fontSize}px ${fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // 個別値が未設定の項目だけ一括設定へフォールバックする。
            const glyphStyle = resolveCaptionGlyphStyle(activeCaption, currentCaptionSettings);
            // strokeWidth / blur も fontSize と同じスケールで縮小し、プレビュー/export で太さの比率を保つ。
            const scaledStrokeWidth = glyphStyle.strokeWidth * captionScale;
            const blurStrength = glyphStyle.blur * captionScale;
            const centerX = captionAnchor.x;

            // フェード時の輪郭残りを防ぐため、stroke+fill を 1 枚のオフスクリーン Canvas に
            // 100% の不透明度で合成してから、メインキャンバスへ globalAlpha 付きで転写する。
            const glyphCanvas = createCaptionGlyphCanvas({
              text: displaySegment.text,
              font: `bold ${fontSize}px ${fontFamily}`,
              fillColor: glyphStyle.fontColor,
              strokeColor: glyphStyle.strokeColor,
              strokeWidth: scaledStrokeWidth,
            });
            const glyphW = glyphCanvas.width;
            const glyphH = glyphCanvas.height;

            // 背景帯は文字の下に敷く（個別 override > 一括設定。既定 OFF）
            const backgroundStyle = resolveCaptionBackgroundStyle(
              activeCaption,
              currentCaptionSettings,
            );
            if (
              drawCaptionBackgroundBand(ctx, {
                centerX,
                centerY: y,
                glyphWidth: glyphW,
                glyphHeight: glyphH,
                fontSize,
                fadeAlpha: alpha,
                backgroundEnabled: backgroundStyle.backgroundEnabled,
                backgroundColor: backgroundStyle.backgroundColor,
                backgroundOpacity: backgroundStyle.backgroundOpacity,
                backgroundRadius: backgroundStyle.backgroundRadius,
                layoutScale: captionScale,
              })
            ) {
              didUpdateCanvas = true;
            }

            const drawGlyphAt = (cx: number, cy: number, localAlpha: number) => {
              const clamped = Math.max(0, Math.min(1, localAlpha));
              if (clamped <= 0) return;
              didUpdateCanvas = true;
              ctx.globalAlpha = alpha * clamped;
              ctx.drawImage(glyphCanvas, cx - glyphW / 2, cy - glyphH / 2);
            };

            if (shouldUseCaptionBlurFallback(previewPlatformPolicy, blurStrength)) {
              const blurNorm = Math.min(1, blurStrength / 5);
              const ringCount = Math.max(3, Math.round(blurStrength * 3.5));
              const samplesPerRing = 18;
              const maxRadius = Math.max(1.5, blurStrength * 2.6);
              const totalSamples = ringCount * samplesPerRing;
              const prevComposite = ctx.globalCompositeOperation;

              ctx.globalCompositeOperation = 'lighter';

              for (let ring = 1; ring <= ringCount; ring++) {
                const radius = (ring / ringCount) * maxRadius;
                const ringWeight = Math.max(0.3, 1 - ((ring - 1) / Math.max(1, ringCount - 1)) * 0.55);
                const sampleAlpha = ((0.95 + blurNorm * 0.55) * ringWeight) / totalSamples;
                for (let i = 0; i < samplesPerRing; i++) {
                  const angle = (Math.PI * 2 * i) / samplesPerRing;
                  const offsetX = Math.cos(angle) * radius;
                  const offsetY = Math.sin(angle) * radius;
                  drawGlyphAt(centerX + offsetX, y + offsetY, sampleAlpha);
                }
              }

              ctx.globalCompositeOperation = prevComposite;

              // 中央のクリスプなコア層。stroke と fill は glyphCanvas 内で既に合成済みのため、
              // 単一のアルファ値で同期してフェードする (輪郭だけ残る現象を回避)。
              const coreAlpha = Math.max(0.35, 0.9 - blurNorm * 0.45);
              if (coreAlpha > 0.01) {
                drawGlyphAt(centerX, y, coreAlpha);
              }
              ctx.restore();
              continue;
            }

            ctx.filter = blurStrength > 0 ? `blur(${blurStrength}px)` : 'none';
            drawGlyphAt(centerX, y, 1);
            ctx.restore();
          }
        }

        // === 動画タイトル描画（Issue #211・キャプションとは別管理） ===
        // キャプションの後（＝最前面）に描く。描画実装は utils/videoTitle.ts が単一ソースで、
        // apple-safari エンジンからも同じ関数を呼ぶため preview と export が必ず一致する。
        if (!isEndrollFrame && drawVideoTitleFrame(ctx, videoTitleRef.current, time, {
          useBlurFallback: previewPlatformPolicy.needsCaptionBlurFallback,
        })) {
          didUpdateCanvas = true;
        }
        const activeWatermark = watermarkOverlayRef?.current ?? watermarkOverlay;
        // 「全編」指定のときはエンドロール上にもウォーターマークを重ねる。
        // その場合は下のエンドロール描画（全面塗り）の後に描かないと隠れてしまう。
        const drawsWatermarkOverEndroll = isEndrollFrame && activeWatermark?.scope === 'full';

        // タイトルを含む既存合成の後へ置き、カード境界・トランジション中も継続表示する。
        if (!isEndrollFrame && drawWatermarkOverlayFrame(
          ctx,
          activeWatermark,
          watermarkImageRef?.current,
          time,
        )) {
          didUpdateCanvas = true;
        }
        // 倍速バッジは最前面（ウォーターマークより上）
        if (!isEndrollFrame) {
          const badgeItem = activeIndex >= 0 ? currentItems[activeIndex] : null;
          if (badgeItem?.type === 'video' && drawSpeedBadgeFrame(ctx, badgeItem)) {
            didUpdateCanvas = true;
          }
        }

        // === エンドロール描画 ===
        // クリップ由来の合成をすべて覆い隠す形で最後に描く（背景を全面塗りするため、
        // 直前のフレームや取り残しの映像が残らない）。BGM 処理はこの後も従来どおり走る。
        if (isEndrollFrame) {
          const endrollLocalTime = Math.max(
            0,
            Math.min(endrollDurationSec, time - clipsDurationSec),
          );
          if (drawEndrollFrame(ctx, activeEndroll, endrollImageRef?.current, endrollLocalTime)) {
            didUpdateCanvas = true;
          }
          // 全編指定のウォーターマークはエンドロール背景の上へ重ねる
          if (drawsWatermarkOverEndroll && drawWatermarkOverlayFrame(
            ctx,
            activeWatermark,
            watermarkImageRef?.current,
            time,
          )) {
            didUpdateCanvas = true;
          }
        }

        const ensurePreviewAudioGainNode = (trackId: string, element: HTMLAudioElement) => {
          let gainNode = gainNodesRef.current[trackId];
          let hasAudioNode = !!sourceNodesRef.current[trackId];

          if (!_isExporting && !hasAudioNode) {
            hasAudioNode = ensureAudioNodeForElement(trackId, element);
            gainNode = gainNodesRef.current[trackId];
          }

          return { hasAudioNode, gainNode };
        };

        const processAudioTrack = (track: AudioTrack | null, trackId: 'bgm') => {
          const element = mediaElementsRef.current[trackId] as HTMLAudioElement;
          let { gainNode, hasAudioNode } = element
            ? ensurePreviewAudioGainNode(trackId, element)
            : { gainNode: gainNodesRef.current[trackId], hasAudioNode: !!sourceNodesRef.current[trackId] };
          const isAndroidPreviewBgmTrack =
            isAndroidPreviewPlayback
            && trackId === 'bgm';

          if (track && element) {
            const avoidPausePlay = hasAudioNode
              && previewPlatformPolicy.muteNativeMediaWhenAudioRouted
              && !_isExporting;

            if (isActivePlaying) {
              if (time < track.delay) {
                applyPreviewAudioOutputState(previewPlatformPolicy, element, {
                  hasAudioNode,
                  desiredVolume: 0,
                  audibleSourceCount: 0,
                  isExporting: _isExporting,
                });
                if (gainNode && audioCtxRef.current) {
                  gainNode.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.01);
                }
                if (!avoidPausePlay && !element.paused) element.pause();
              } else {
                let vol = clampPreviewAudioGain(track.volume);
                const trackTime = time - track.delay + track.startPoint;

                if (trackTime <= track.duration) {
                  if (isAndroidPreviewBgmTrack) {
                    // Android standard preview の BGM は active video を待たせないため、
                    // readyState を待たずに緩めのしきい値で fire-and-forget に同期する。
                    if (element.readyState === 0 && !element.error) {
                      try { element.load(); } catch { /* ignore */ }
                    }
                    if (
                      element.readyState >= MIN_VIDEO_READY_STATE_FOR_SEEK
                      && !element.seeking
                      && Math.abs(element.currentTime - trackTime) > PREVIEW_ANDROID_BGM_SOFT_SYNC_TOLERANCE_SEC
                    ) {
                      element.currentTime = trackTime;
                    }
                    if (holdAudioThisFrame) {
                      if (!element.paused) {
                        element.pause();
                      }
                    } else if (element.paused && element.readyState >= MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME) {
                      element.play().catch(() => { });
                    }
                  } else {
                    const needsSeek = Math.abs(element.currentTime - trackTime) > (avoidPausePlay ? 2.0 : 0.5);

                    if (needsSeek) {
                      if (avoidPausePlay) {
                        element.currentTime = trackTime;
                      } else {
                        if (!element.paused) {
                          element.pause();
                        }
                        element.currentTime = trackTime;
                      }
                    }

                    if (avoidPausePlay) {
                      if (element.paused && !element.seeking && element.readyState >= 2) {
                        element.play().catch(() => { });
                      }
                    } else if (holdAudioThisFrame) {
                      if (!element.paused) {
                        element.pause();
                      }
                    } else if (!element.seeking && element.readyState >= 2 && element.paused) {
                      element.play().catch(() => { });
                    }
                  }

                    vol = resolvePreviewAudioGain({
                      baseVolume: track.volume,
                      time,
                      startTime: track.delay,
                      totalDuration: totalDurationRef.current,
                      fadeIn: track.fadeIn,
                      fadeOut: track.fadeOut,
                      fadeInDuration: track.fadeInDuration,
                      fadeOutDuration: track.fadeOutDuration,
                    });

                  // エンドロール区間の BGM フェードアウト（オプション）。
                  // 既存の末尾フェードとは独立で、より小さい方（＝早く消える方）を採用する。
                  vol *= resolveBgmEndrollFadeGain({
                    endroll: endrollOverlayRef?.current,
                    clipsDuration: clipsDurationSec,
                    timeSec: time,
                  });

                  // BGM soft sync 中は active video 優先で進めたいので、
                  // audio resume wait による追加ミュートを掛けず独立に追従させる。
                  if (element.seeking || (!isAndroidPreviewBgmTrack && !avoidPausePlay && holdAudioThisFrame)) {
                    vol = 0;
                  }

                    const outputMode = applyPreviewAudioOutputState(previewPlatformPolicy, element, {
                      hasAudioNode,
                      desiredVolume: vol,
                      audibleSourceCount: vol > 0 ? activePreviewAudioSourceCount : 0,
                      isExporting: _isExporting,
                    });
                    const effectiveGain = outputMode === 'native' ? 0 : vol;
                    if (gainNode && audioCtxRef.current) {
                      const currentGain = gainNode.gain.value;
                      if (Math.abs(currentGain - effectiveGain) > 0.01) {
                        gainNode.gain.setTargetAtTime(effectiveGain, audioCtxRef.current.currentTime, 0.1);
                    }
                  }
                } else {
                  applyPreviewAudioOutputState(previewPlatformPolicy, element, {
                    hasAudioNode,
                    desiredVolume: 0,
                    audibleSourceCount: 0,
                    isExporting: _isExporting,
                  });
                  if (gainNode && audioCtxRef.current) {
                    const endAt = Math.max(0, track.delay + track.duration);
                    gainNode.gain.setValueAtTime(0, endAt);
                  }
                  if (!avoidPausePlay && !element.paused) element.pause();
                }
              }
            } else {
              applyPreviewAudioOutputState(previewPlatformPolicy, element, {
                hasAudioNode,
                desiredVolume: 0,
                audibleSourceCount: 0,
                isExporting: _isExporting,
              });
              if (gainNode && audioCtxRef.current) {
                gainNode.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.1);
              }
              if (!element.paused) element.pause();

              const trackTime = time - track.delay + track.startPoint;
              if (trackTime >= 0 && trackTime <= track.duration) {
                if (Math.abs(element.currentTime - trackTime) > 0.1) {
                  element.currentTime = trackTime;
                }
              }
            }
          }
        };

        // BGM は自動調整 ON 時のみ末尾合わせ。1 フレームで Map を共有する。
        const bgmAutoAdjust = useAudioStore.getState().bgmAutoAdjustToTimeline;
        const bgmEffectiveMap = resolveBgmClipsEffectivePlayback(
          currentNarrations.filter((item) => isBgmClipId(item.id)),
          totalDurationRef.current,
          { autoAdjust: bgmAutoAdjust },
        );

        const processNarrationClip = (clip: NarrationClip) => {
          const trackId = `narration:${clip.id}`;
          const element = mediaElementsRef.current[trackId] as HTMLAudioElement;
          let { gainNode, hasAudioNode } = element
            ? ensurePreviewAudioGainNode(trackId, element)
            : { gainNode: gainNodesRef.current[trackId], hasAudioNode: !!sourceNodesRef.current[trackId] };

          if (!element) return;

          // 設定区間はストアに保持し、動画尺 D で有効区間だけを適用（Issue #206）
          const effective = resolvePipelineClipEffectivePlayback(
            clip,
            currentNarrations,
            totalDurationRef.current,
            bgmEffectiveMap,
            bgmAutoAdjust,
          );
          const trimStart = effective.trimStart;
          const playableDuration = effective.effectivePlayableDuration;
          const clipTime = time - effective.startTime;
          const sourceTime = trimStart + clipTime;
          // エンドロール区間ではナレーションを鳴らさない（BGM だけを流し続ける）。
          // BGM クリップも同じ経路を通るため、ナレーション本体のみを対象にする。
          const isSilencedByEndroll = isEndrollFrame && !isBgmClipId(clip.id);
          const inRange = !effective.isDisabled
            && !isSilencedByEndroll
            && clipTime >= 0
            && clipTime <= playableDuration;

          const avoidNarPause = hasAudioNode
            && previewPlatformPolicy.muteNativeMediaWhenAudioRouted
            && !_isExporting;

          if (isActivePlaying) {
            if (!inRange) {
              applyPreviewAudioOutputState(previewPlatformPolicy, element, {
                hasAudioNode,
                desiredVolume: 0,
                audibleSourceCount: 0,
                isExporting: _isExporting,
              });
              if (gainNode && audioCtxRef.current) {
                gainNode.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.1);
              }
              if (!avoidNarPause && !element.paused) element.pause();
              return;
            }

            const needsSeek = Math.abs(element.currentTime - sourceTime) > (avoidNarPause ? 2.0 : 0.5);
            if (needsSeek) {
              if (avoidNarPause) {
                element.currentTime = sourceTime;
              } else {
                if (!element.paused) {
                  element.pause();
                }
                element.currentTime = sourceTime;
              }
            }

            if (avoidNarPause) {
              if (element.paused && !element.seeking && element.readyState >= 2) {
                element.play().catch(() => { });
              }
            } else if (holdAudioThisFrame) {
              if (!element.paused) {
                element.pause();
              }
            } else if (!element.seeking && element.readyState >= 2 && element.paused) {
              element.play().catch(() => { });
            }

            let vol = clip.isMuted ? 0 : clampPreviewAudioGain(clip.volume);
            // クリップ範囲基準のフェード（BGM クリップ用の任意フィールド。未指定なら無効）
            if (vol > 0 && clip.fadeIn) {
              const fadeInDur = clip.fadeInDuration || 1;
              if (clipTime < fadeInDur) {
                vol *= Math.max(0, clipTime / fadeInDur);
              }
            }
            if (vol > 0 && clip.fadeOut) {
              const fadeOutDur = clip.fadeOutDuration || 1;
              const remainingInClip = playableDuration - clipTime;
              if (remainingInClip < fadeOutDur) {
                vol *= Math.max(0, remainingInClip / fadeOutDur);
              }
            }
            // エンドロールの BGM フェードは **BGM クリップにだけ**掛ける。
            // ナレーションはエンドロール区間では鳴らさないので対象外。
            if (isBgmClipId(clip.id)) {
              vol *= resolveBgmEndrollFadeGain({
                endroll: endrollOverlayRef?.current,
                clipsDuration: clipsDurationSec,
                timeSec: time,
              });
            }
            if (element.seeking || holdAudioThisFrame) {
              vol = 0;
            }

            const outputMode = applyPreviewAudioOutputState(previewPlatformPolicy, element, {
              hasAudioNode,
              desiredVolume: vol,
              audibleSourceCount: vol > 0 ? activePreviewAudioSourceCount : 0,
              isExporting: _isExporting,
            });
            const effectiveGain = outputMode === 'native' ? 0 : vol;
            if (gainNode && audioCtxRef.current) {
              const currentGain = gainNode.gain.value;
              if (Math.abs(currentGain - effectiveGain) > 0.01) {
                gainNode.gain.setTargetAtTime(effectiveGain, audioCtxRef.current.currentTime, 0.1);
              }
            } else if (outputMode !== 'native') {
              // WebAudio ノードが作れない環境（AudioContext 再生成後の
              // createMediaElementSource 失敗など）では gain が存在せず、
              // このままだと音量もフェードも一切反映されない。
              // element.volume はソースノード経由の出力にも作用するため、
              // フェード込みの音量を native 側へ直接反映してフォールバックする。
              // ただしエクスポート中は出力音声を OfflineAudioContext で別途生成しており、
              // ソースノードの無い native 要素の再生はファイルに入らず「スピーカーから
              // 音が漏れるだけ」になるため、必ず無音（volume=0）にする。
              element.volume = _isExporting ? 0 : Math.max(0, Math.min(1, vol));
            }
          } else {
            applyPreviewAudioOutputState(previewPlatformPolicy, element, {
              hasAudioNode,
              desiredVolume: 0,
              audibleSourceCount: 0,
              isExporting: _isExporting,
            });
            if (gainNode && audioCtxRef.current) {
              gainNode.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.1);
            }
            if (!element.paused) element.pause();

            if (inRange && Math.abs(element.currentTime - sourceTime) > 0.1) {
              element.currentTime = sourceTime;
            }
          }
        };

        if (isActivePlaying && previewPlatformPolicy.muteNativeMediaWhenAudioRouted && !_isExporting) {
          const ctx = audioCtxRef.current;
          if (ctx && (ctx.state as AudioContextState | 'interrupted') !== 'running') {
            ctx.resume().catch(() => {});
          }
        }

        processAudioTrack(currentBgm, 'bgm');
        if (
          !_isExporting
          && currentBgm
          && (!isActivePlaying || time < totalDurationRef.current || endFinalizedRef.current)
        ) {
          const bgmGainValue = resolvePreviewBgmGain(
            currentBgm,
            time,
            totalDurationRef.current,
          );
          const bgmEl = mediaElementsRef.current.bgm as HTMLAudioElement | undefined;
          const { gainNode: bgmGain } = bgmEl
            ? ensurePreviewAudioGainNode('bgm', bgmEl)
            : { gainNode: gainNodesRef.current.bgm };
          if (bgmEl) {
            bgmEl.defaultMuted = false;
            bgmEl.muted = false;
            bgmEl.volume = 1;
          }
          if (bgmGain && audioCtxRef.current) {
            bgmGain.gain.setValueAtTime(bgmGainValue, audioCtxRef.current.currentTime);
          }
        }
        currentNarrations.forEach((clip) => processNarrationClip(clip));

        if (
          !_isExporting
          && currentBgm
          && audioCtxRef.current
          && gainNodesRef.current.bgm
          && (!isActivePlaying || time < totalDurationRef.current || endFinalizedRef.current)
        ) {
          const finalBgmGainValue = endFinalizedRef.current && time >= totalDurationRef.current
            ? 0
            : resolvePreviewBgmGain(currentBgm, time, totalDurationRef.current);
          gainNodesRef.current.bgm.gain.setValueAtTime(finalBgmGainValue, audioCtxRef.current.currentTime);
        }

        if (isActivePlaying && audioResumeWaitFramesRef.current > 0) {
          audioResumeWaitFramesRef.current -= 1;
        }
        return didUpdateCanvas;
      } catch (e) {
        console.error('Render Error:', e);
        return false;
      }
    },
    // videoTitle も依存に含める。含めないと renderFrame が再生成されず、
    // 停止中のプレビューへタイトル変更がリアルタイム反映されない（キャプションと同じ扱い）
    [captions, captionSettings, videoTitle, watermarkOverlay, ensureAudioNodeForElement, logInfo, platformCapabilities, previewPlatformPolicy],
  );

  const handleSeeked = useCallback(() => {
    requestAnimationFrame(() => renderFrame(
      currentTimeRef.current,
      isPlayingRef.current && !isSeekingRef.current && !isSeekPlaybackPreparingRef.current,
    ));
  }, [currentTimeRef, isPlayingRef, isSeekPlaybackPreparingRef, isSeekingRef, renderFrame]);

  const handleVideoLoadedData = useCallback(() => {
    requestAnimationFrame(() => renderFrame(
      currentTimeRef.current,
      isPlayingRef.current && !isSeekingRef.current && !isSeekPlaybackPreparingRef.current,
    ));
  }, [currentTimeRef, isPlayingRef, isSeekPlaybackPreparingRef, isSeekingRef, renderFrame]);

  const stopAll = useCallback(() => {
    currentExportSessionIdRef.current = null;
    frameDrivenExportEnabledRef.current = false;
    exportRenderedFrameIndexRef.current = null;
    frameDrivenExportSubmittedCountRef.current = 0;
    frameDrivenExportLastRenderedCountRef.current = null;
    frameDrivenExportStallObservedCountRef.current = 0;
    frameDrivenExportStallLastAdvanceAtMsRef.current = 0;
    frameDrivenExportForcedWallClockRef.current = false;
    currentPreviewCacheBuildSessionIdRef.current = null;
    logDebug('SYSTEM', 'stopAll呼び出し', { previousLoopId: loopIdRef.current, isPlayingRef: isPlayingRef.current });

    loopIdRef.current += 1;
    previewPlaybackAttemptRef.current += 1;
    isPlayingRef.current = false;
    audioResumeWaitFramesRef.current = 0;
    activeVideoIdRef.current = null;
    previewCachePlaybackActiveRefValue.current = false;
    setLoading(false);
    setPreviewLoadingLabelValue(undefined);
    safeSetPreviewPlaying(false);

    isSeekingRef.current = false;
    wasPlayingBeforeSeekRef.current = false;
    seekingVideosRef.current.clear();
    pendingSeekRef.current = null;
    exportPlayFailedRef.current = {};
    exportFallbackSeekAtRef.current = {};
    videoDecodeStallSinceRef.current = {};
    videoDecodeStallRecoverAtRef.current = {};
    videoHardResetAtRef.current = {};
    resetBoundaryDiagnosticsState();

    if (pendingSeekTimeoutRef.current) {
      clearTimeout(pendingSeekTimeoutRef.current);
      pendingSeekTimeoutRef.current = null;
    }
    cancelPendingSeekPlaybackPrepare();
    detachGlobalSeekEndListeners();
    cancelPendingPausedSeekWait();

    if (reqIdRef.current) {
      cancelAnimationFrame(reqIdRef.current);
      reqIdRef.current = null;
    }

    silencePreviewBgmOutput(mediaElementsRef, gainNodesRef, audioCtxRef);

    if (previewCacheVideoRefValue.current) {
      try {
        previewCacheVideoRefValue.current.pause();
      } catch {
        /* ignore */
      }
    }

    Object.entries(mediaElementsRef.current).forEach(([id, el]) => {
      if (el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO')) {
        if (id === 'bgm') {
          return;
        }
        try {
          const mediaEl = el as HTMLMediaElement;
          mediaEl.pause();
          resetNativeMediaAudioState(mediaEl);
        } catch {
          /* ignore */
        }
      }
    });

    const ctx = audioCtxRef.current;
    if (ctx) {
      ctx.onstatechange = null;
      Object.values(gainNodesRef.current).forEach((node) => {
        try {
          node.gain.cancelScheduledValues(ctx.currentTime);
        } catch {
          /* ignore */
        }
      });
    }

    const previousMode = activePreviewModeRef.current;
    activePreviewModeRef.current = 'idle';
    pendingPreviewCacheBuildResolverRef.current?.(false);

    // export セッション後（または export 中断後）は gain を preview destination へ戻す。
    // 次の startEngine まで export 経路のまま残ると、停止中のスクラブでも音が masterDest にだけ流れる。
    // configureAudioRouting は後段定義のため、ここは同等ロジックをインラインする。
    if (exportRanSinceLastPreviewRef.current || previousMode === 'export' || previousMode === 'preview-cache-build') {
      const audioCtx = audioCtxRef.current;
      if (audioCtx) {
        audioRoutingModeRef.current = 'preview';
        Object.keys(gainNodesRef.current).forEach((id) => {
          const gain = gainNodesRef.current[id];
          try {
            gain.disconnect();
            gain.connect(audioCtx.destination);
          } catch {
            /* ignore */
          }
        });
      }
    }

    if (previousMode === 'preview-cache-build') {
      stopPreviewCacheExport?.({ silent: true, reason: 'user' });
      return;
    }

    const hasActiveRecorder = !!(recorderRef.current && recorderRef.current.state !== 'inactive');
    if (hasActiveRecorder) {
      recorderRef.current!.stop();
    } else {
      stopWebCodecsExport({ reason: 'user' });
    }
  }, [
    activePreviewModeRef,
    activeVideoIdRef,
    audioCtxRef,
    audioResumeWaitFramesRef,
    audioRoutingModeRef,
    cancelPendingPausedSeekWait,
    cancelPendingSeekPlaybackPrepare,
    detachGlobalSeekEndListeners,
    exportFallbackSeekAtRef,
    exportPlayFailedRef,
    gainNodesRef,
    isPlayingRef,
    isSeekingRef,
    logDebug,
    loopIdRef,
    mediaElementsRef,
    previewCachePlaybackActiveRef,
    previewCacheVideoRef,
    pendingSeekRef,
    pendingSeekTimeoutRef,
    pendingPreviewCacheBuildResolverRef,
    previewPlaybackAttemptRef,
    recorderRef,
    reqIdRef,
    seekingVideosRef,
    setLoading,
    stopWebCodecsExport,
    stopPreviewCacheExport,
    setPreviewLoadingLabel,
    wasPlayingBeforeSeekRef,
  ]);

  const stopPreviewMediaAtTimelineEnd = useCallback(() => {
    silencePreviewBgmOutput(mediaElementsRef, gainNodesRef, audioCtxRef);

    if (previewCacheVideoRefValue.current) {
      try {
        previewCacheVideoRefValue.current.pause();
      } catch {
        /* ignore */
      }
    }

    Object.entries(mediaElementsRef.current).forEach(([id, el]) => {
      if (!el || (el.tagName !== 'VIDEO' && el.tagName !== 'AUDIO')) {
        return;
      }
      if (id === 'bgm') {
        return;
      }

      try {
        const mediaEl = el as HTMLMediaElement;
        mediaEl.pause();
        resetNativeMediaAudioState(mediaEl);
      } catch {
        /* ignore */
      }
    });
  }, [audioCtxRef, gainNodesRef, mediaElementsRef]);

  const finalizePreviewAtTimelineEnd = useCallback((myLoopId: number) => {
    if (myLoopId !== loopIdRef.current) {
      return;
    }

    const totalDuration = totalDurationRef.current;
    const displayTime = toDisplayTime(totalDuration);
    endFinalizedRef.current = true;
    currentTimeRef.current = totalDuration;
    setCurrentTime(totalDuration);
    renderFrame(displayTime, false, false);
    logInfo('RENDER', 'preview.finalFrame.hold', {
      globalTimeMs: Math.round(totalDuration * 1000),
      displayGlobalTimeMs: Math.round(displayTime * 1000),
      totalDurationMs: Math.round(totalDuration * 1000),
      isCompleted: true,
      loopId: myLoopId,
      currentLoopId: loopIdRef.current,
    });
    logInfo('RENDER', 'preview.complete', {
      globalTimeMs: Math.round(totalDuration * 1000),
      displayGlobalTimeMs: Math.round(displayTime * 1000),
      totalDurationMs: Math.round(totalDuration * 1000),
      isCompleted: true,
    });
    logInfo('RENDER', 'download.ready', {
      globalTimeMs: Math.round(totalDuration * 1000),
      totalDurationMs: Math.round(totalDuration * 1000),
      isCompleted: true,
      isDownloadReady: true,
    });
    stopPreviewMediaAtTimelineEnd();

    audioResumeWaitFramesRef.current = 0;
    activeVideoIdRef.current = null;
    activePreviewModeRef.current = 'idle';
    previewCachePlaybackActiveRefValue.current = false;
    previewPlaybackAttemptRef.current += 1;
    loopIdRef.current += 1;
    isPlayingRef.current = false;
    safeSetPreviewPlaying(false);
    pause();

    if (reqIdRef.current) {
      cancelAnimationFrame(reqIdRef.current);
      reqIdRef.current = null;
    }
    logInfo('RENDER', '[DIAG-PREVIEW-END-FREEZE] finalize preview loop', {
      loopId: myLoopId,
      currentLoopId: loopIdRef.current,
      totalDuration,
      isPlaying: isPlayingRef.current,
      reqId: reqIdRef.current,
    });

    setTimeout(() => {
      endFinalizedRef.current = false;
      resetBoundaryDiagnosticsState();
    }, 300);
  }, [
    activePreviewModeRef,
    activeVideoIdRef,
    audioResumeWaitFramesRef,
    currentTimeRef,
    endFinalizedRef,
    isPlayingRef,
    loopIdRef,
    pause,
    previewCachePlaybackActiveRef,
    previewCacheVideoRef,
    previewPlaybackAttemptRef,
    renderFrame,
    reqIdRef,
    resetBoundaryDiagnosticsState,
    setCurrentTime,
    stopPreviewMediaAtTimelineEnd,
    totalDurationRef,
    toDisplayTime,
  ]);

  const configureAudioRouting = useCallback((isExporting: boolean) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const dest = masterDestRef.current;
    audioRoutingModeRef.current = isExporting ? 'export' : 'preview';

    Object.keys(gainNodesRef.current).forEach((id) => {
      const gain = gainNodesRef.current[id];
      try {
        gain.disconnect();

        if (isExporting && dest) {
          gain.connect(dest);
        } else {
          gain.connect(ctx.destination);
        }
      } catch {
        /* ignore */
      }
    });
  }, [audioCtxRef, audioRoutingModeRef, gainNodesRef, masterDestRef]);

  const loop = useCallback(
    (isExportMode: boolean, myLoopId: number) => {
      if (myLoopId !== loopIdRef.current) {
        logDebug('RENDER', 'ループ終了（loopId不一致）', { myLoopId, currentLoopId: loopIdRef.current });
        return;
      }

      if (mediaItemsRef.current.length === 0) {
        logWarn('RENDER', 'ループ終了（メディアなし）', {});
        stopAll();
        return;
      }

      if (!isPlayingRef.current && !isExportMode) {
        logWarn('RENDER', 'ループ終了（再生状態でない）', { isPlayingRef: isPlayingRef.current, isExportMode });
        return;
      }

      if (isExportMode && typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        reqIdRef.current = requestAnimationFrame(() => loop(isExportMode, myLoopId));
        return;
      }

      if (!isExportMode && activePreviewModeRef.current === 'preview-cache-playback') {
        const previewCacheVideo = previewCacheVideoRefValue.current;
        if (!previewCacheVideo) {
          previewCachePlaybackActiveRefValue.current = false;
          activePreviewModeRef.current = 'preview';
          reqIdRef.current = requestAnimationFrame(() => loop(isExportMode, myLoopId));
          return;
        }

        const playbackTime = Math.max(0, Math.min(previewCacheVideo.currentTime, totalDurationRef.current));
        const reachedPreviewEnd =
          totalDurationRef.current > 0
          && (previewCacheVideo.ended || playbackTime >= totalDurationRef.current - PREVIEW_END_THRESHOLD_SEC);

        if (reachedPreviewEnd) {
          finalizePreviewAtTimelineEnd(myLoopId);
          return;
        }

        setCurrentTime(playbackTime);
        currentTimeRef.current = playbackTime;
        renderFrame(playbackTime, true, false);
        reqIdRef.current = requestAnimationFrame(() => loop(isExportMode, myLoopId));
        return;
      }

      const now = getStandardPreviewNow();
      const diagnostics = previewTimelineDiagnosticsRef.current;
      let frameGapMs: number | null = null;
      if (diagnostics.lastRafNowMs !== null) {
        frameGapMs = now - diagnostics.lastRafNowMs;
      }
      diagnostics.lastRafNowMs = now;
      if (isExportMode) {
        // rAF が実際にどの間隔で回っているかを記録する。
        exportFrameProfilerRef.current.noteTick(now);
      }
      if (isExportMode && exportBackpressurePausedRef.current) {
        // requestAnimationFrame 自体は維持して中断・完了要求へ応答できるようにするが、
        // 待機時間はタイムライン・Canvas・描画実績へ加算しない。
        reqIdRef.current = requestAnimationFrame(() => loop(isExportMode, myLoopId));
        return;
      }
      const submittedFrameCount = frameDrivenExportSubmittedCountRef.current;

      // フレーム駆動ウォッチドッグ: VideoEncoder への投入が一定時間進まない場合は
      // フレーム駆動を諦めて壁時計ペーシングへフォールバックする。これにより、
      // 何らかの理由で投入が停滞しても「書き出し準備中」から進まないハングを防ぐ。
      if (
        isExportMode
        && frameDrivenExportEnabledRef.current
        && !frameDrivenExportForcedWallClockRef.current
      ) {
        const stall = evaluateFrameDrivenExportStall({
          enabled: true,
          submittedFrameCount,
          lastObservedSubmittedFrameCount: frameDrivenExportStallObservedCountRef.current,
          lastAdvanceAtMs: frameDrivenExportStallLastAdvanceAtMsRef.current,
          nowMs: now,
          stallTimeoutMs: FRAME_DRIVEN_EXPORT_STALL_TIMEOUT_MS,
        });
        frameDrivenExportStallObservedCountRef.current = submittedFrameCount;
        frameDrivenExportStallLastAdvanceAtMsRef.current = stall.nextLastAdvanceAtMs;
        if (stall.stalled) {
          frameDrivenExportForcedWallClockRef.current = true;
          // 壁時計をフレーム駆動の到達点から連続させ、既に投入済みのフレーム分を巻き戻さない。
          const resumedTimelineSec = submittedFrameCount / FPS;
          startTimeRef.current = now - resumedTimelineSec * 1000;
          exportTimelineSecRef.current = resumedTimelineSec;
          exportLastWallNowMsRef.current = now;
          logWarn('RENDER', 'standard.export.pacing.watchdog', {
            reason: 'frame-driven submission stalled; falling back to wall-clock',
            submittedFrameCount,
            stallTimeoutMs: FRAME_DRIVEN_EXPORT_STALL_TIMEOUT_MS,
          });
        }
      }

      const useFrameDrivenExportTime =
        isExportMode
        && frameDrivenExportEnabledRef.current
        && !frameDrivenExportForcedWallClockRef.current;
      const totalDuration = totalDurationRef.current;
      let elapsed: number;
      if (useFrameDrivenExportTime) {
        elapsed = resolveFrameDrivenExportTimeSec({
          wallClockTimeSec: (now - startTimeRef.current) / 1000,
          submittedFrameCount,
          fps: FPS,
          enabled: true,
        });
      } else if (isExportMode) {
        // 壁時計 dilation: 映像は 1x 連続再生し、タイムラインだけ active speed で縮める。
        // （playbackRate=speed は途中切れ、seek 駆動は静止画化するため不採用）
        if (exportLastWallNowMsRef.current == null) {
          exportLastWallNowMsRef.current = now;
        }
        const wallDeltaSec = Math.max(0, (now - exportLastWallNowMsRef.current) / 1000);
        exportLastWallNowMsRef.current = now;
        const activeForClock = findActiveTimelineItemWithTransitions(
          mediaItemsRef.current,
          exportTimelineSecRef.current,
          totalDuration,
        );
        const activeItemForClock = activeForClock
          ? mediaItemsRef.current[activeForClock.index]
          : null;
        const wallDivisor = resolveExportTimelineWallDivisorForItem(activeItemForClock);
        exportTimelineSecRef.current += wallDeltaToExportTimelineDelta(wallDeltaSec, wallDivisor);
        elapsed = exportTimelineSecRef.current;
      } else {
        elapsed = (now - startTimeRef.current) / 1000;
      }
      const clampedElapsed = Math.min(elapsed, totalDuration);
      const reachedPreviewEnd =
        !isExportMode &&
        totalDuration > 0 &&
        // 60fps で約 2 フレーム分（33ms 弱）の余裕を持たせ、rAF の刻み誤差で終端 1 フレーム手前に残り続けるのを防ぐ。
        clampedElapsed >= totalDuration - PREVIEW_END_THRESHOLD_SEC;

      if (reachedPreviewEnd) {
        finalizePreviewAtTimelineEnd(myLoopId);
        return;
      }

      if (clampedElapsed >= totalDuration) {
        // エクスポートモードでタイムライン終端に達した場合は completeWebCodecsExport を呼び正常完了させる。
        // stopAll() を呼ぶと外部 recorderRef が null のため stopWebCodecsExport({ reason: 'user' }) が
        // 走り、blob 生成後の callback が誤ってキャンセル扱いで抑止されてしまう。
        if (isExportMode) {
          // 表示上の現在時刻を総尺へスナップする。フレーム駆動/壁時計とも最終描画時刻は
          // 最後のフレーム開始時刻（例 4.967s）で止まり、formatTime の floor で「0:04 / 0:05」の
          // ように 1 秒ズレて見えるため、preview 終端（finalizePreviewAtTimelineEnd）と同様に
          // 総尺へ合わせる。エクスポート済みファイルの尺には影響しない（表示のみ）。
          currentTimeRef.current = totalDuration;
          setCurrentTime(totalDuration);
          safeSetPreviewPlaying(false);
          // finalize（mux/encode flush）中も video を再生し続けると ended 残留や decoder 圧迫が
          // 次プレビューを壊す（Issue #209）。complete 前に共有 media を即停止する。
          // stopAll() は呼ばない（user cancel 扱いで complete を潰すため）。
          try {
            silencePreviewBgmOutput(mediaElementsRef, gainNodesRef, audioCtxRef);
            Object.entries(mediaElementsRef.current).forEach(([id, el]) => {
              if (!el || (el.tagName !== 'VIDEO' && el.tagName !== 'AUDIO')) return;
              if (id === 'bgm') return;
              try {
                const mediaEl = el as HTMLMediaElement;
                mediaEl.pause();
                resetNativeMediaAudioState(mediaEl);
              } catch {
                /* ignore */
              }
            });
            configureAudioRouting(false);
          } catch {
            /* ignore */
          }
          if (activePreviewModeRef.current === 'preview-cache-build') {
            completePreviewCacheExport?.();
          } else {
            completeWebCodecsExport();
          }
        } else {
          stopAll();
        }
        return;
      }
      if (
        useFrameDrivenExportTime
        && frameDrivenExportLastRenderedCountRef.current === submittedFrameCount
      ) {
        // 同じフレームのエンコーダー投入待ち中は、重い 1080p Canvas を再描画しない。
        // VideoEncoder への投入が進んだ次の rAF で次時刻を描く。
        reqIdRef.current = requestAnimationFrame(() => loop(isExportMode, myLoopId));
        return;
      }
      const exportDurationAlignment = isExportMode ? resolveExportDuration(totalDuration, FPS) : null;
      const exportFrameIndex = isExportMode && exportDurationAlignment !== null && exportDurationAlignment.frameCount > 0
        ? Math.min(exportDurationAlignment.frameCount - 1, Math.max(0, Math.floor(clampedElapsed * FPS + 1e-9)))
        : null;
      const exportFrameTiming = isExportMode && exportDurationAlignment && exportFrameIndex !== null
        ? getExportFrameTiming(exportDurationAlignment, FPS, exportFrameIndex)
        : null;
      const globalTimeSec = exportFrameTiming ? (exportFrameTiming.timestampUs / 1e6) : clampedElapsed;
      const renderTimeSec = toDisplayTime(globalTimeSec);
      const resolvedSegment = findActiveTimelineItemWithTransitions(mediaItemsRef.current, renderTimeSec, totalDuration);
      const resolvedSegmentIndex = resolvedSegment?.index ?? -1;
      const resolvedLocalTimeMs = resolvedSegment ? Math.round(resolvedSegment.localTime * 1000) : null;
      const segmentChanged = resolvedSegmentIndex !== diagnostics.lastSegmentIndex;
      if (frameGapMs !== null && frameGapMs >= 50) {
        const resolvedMediaItem = resolvedSegmentIndex >= 0
          ? mediaItemsRef.current[resolvedSegmentIndex]
          : null;
        const activeVideoElement = resolvedMediaItem?.type === 'video'
          ? mediaElementsRef.current[resolvedMediaItem.id] as HTMLVideoElement | undefined
          : undefined;
        logWarn('RENDER', 'preview.frame.gap', {
          frameGapMs: Math.round(frameGapMs * 100) / 100,
          globalTimeMs: Math.round(globalTimeSec * 1000),
          segmentIndex: resolvedSegmentIndex,
          localTimeMs: resolvedLocalTimeMs,
          readyState: activeVideoElement?.readyState,
          paused: activeVideoElement?.paused,
          seeking: activeVideoElement?.seeking,
          holdFrame: activeVideoElement
            ? (activeVideoElement.seeking || activeVideoElement.readyState < MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME)
            : false,
          warningThresholdMs: 50,
        });
        if (frameGapMs > 100) {
          const projectState = useProjectStore.getState();
          const hasActiveIo =
            projectState.autoSaveRuntimeStatus === 'running'
            || projectState.isSaving
            || projectState.isLoading;
          logWarn('RENDER', 'preview.frame.gap.cause', {
            frameGapMs: Math.round(frameGapMs * 100) / 100,
            likelyCause: hasActiveIo ? 'io-active' : 'unknown-main-thread-or-render',
            isPreviewPlaying: isPlayingRef.current,
            isAutoSaveRunning: projectState.autoSaveRuntimeStatus === 'running',
            isProjectSaving: projectState.isSaving,
            isProjectLoading: projectState.isLoading,
          });
        }
      }
      const isAndroidLivePreview =
        platformCapabilities.isAndroid && !platformCapabilities.isIosSafari && !isExportMode;

      // Update max frame gap for active boundary
      if (diagnostics.activeBoundary !== null && frameGapMs !== null) {
        diagnostics.activeBoundary.maxFrameGapMs = Math.max(
          diagnostics.activeBoundary.maxFrameGapMs,
          frameGapMs,
        );
      }
      // Check boundary phase samples (100ms, 200ms, 300ms)
      if (
        diagnostics.activeBoundary !== null &&
        !diagnostics.activeBoundary.smoothPlanEmitted &&
        isAndroidLivePreview
      ) {
        const ab = diagnostics.activeBoundary;
        const elapsedSinceBoundary = now - ab.enterRafNowMs;
        const activeSegmentItem =
          resolvedSegmentIndex >= 0 ? mediaItemsRef.current[resolvedSegmentIndex] : null;
        const activeEl =
          activeSegmentItem?.type === 'video'
            ? (mediaElementsRef.current[activeSegmentItem.id] as HTMLVideoElement | undefined)
            : undefined;

        // Capture 100ms snapshot
        if (elapsedSinceBoundary >= 100 && !ab.samplePhasesDone.has('after-100ms')) {
          ab.samplePhasesDone.add('after-100ms');
          const sampleTargetTime = ab.trimStart + (resolvedSegment?.localTime ?? 0);
          ab.currentTimeAt100ms = activeEl?.currentTime ?? null;
          ab.targetTimeAt100ms = sampleTargetTime;
          ab.readyStateAt100ms = activeEl?.readyState ?? null;
          ab.seekingAt100ms = activeEl?.seeking ?? null;
          ab.pausedAt100ms = activeEl?.paused ?? null;
          if (previewLogModeRef.current === 'boundary') {
            logInfo('RENDER', 'preview.boundary.sample', {
              phase: 'after-100ms',
              previousId: ab.previousId,
              activeId: ab.activeId,
              globalTimeMs: Math.round(globalTimeSec * 1000),
              localTimeMs: resolvedSegment ? Math.round(resolvedSegment.localTime * 1000) : null,
              targetTime: sampleTargetTime,
              videoCurrentTime: ab.currentTimeAt100ms,
              driftMs: ab.currentTimeAt100ms !== null
                ? Math.round(Math.abs(ab.currentTimeAt100ms - sampleTargetTime) * 1000)
                : null,
              readyState: ab.readyStateAt100ms,
              paused: ab.pausedAt100ms,
              seeking: ab.seekingAt100ms,
              videoWidth: activeEl?.videoWidth ?? null,
              videoHeight: activeEl?.videoHeight ?? null,
              canDrawVideo: activeEl != null ? canDrawVideo(activeEl) : null,
              holdFrame: ab.holdFrameCount,
              usedVisualBlend: false,
              clockAbsorbMs: Math.round(ab.clockAbsorbMs),
              frameGapMs: frameGapMs ?? 0,
            });
          }
        }
        // Capture 200ms snapshot
        if (elapsedSinceBoundary >= 200 && !ab.samplePhasesDone.has('after-200ms')) {
          ab.samplePhasesDone.add('after-200ms');
          ab.readyStateAt200ms = activeEl?.readyState ?? null;
          ab.seekingAt200ms = activeEl?.seeking ?? null;
          if (previewLogModeRef.current === 'boundary') {
            const sampleTargetTime = ab.trimStart + (resolvedSegment?.localTime ?? 0);
            logInfo('RENDER', 'preview.boundary.sample', {
              phase: 'after-200ms',
              previousId: ab.previousId,
              activeId: ab.activeId,
              globalTimeMs: Math.round(globalTimeSec * 1000),
              localTimeMs: resolvedSegment ? Math.round(resolvedSegment.localTime * 1000) : null,
              targetTime: sampleTargetTime,
              videoCurrentTime: activeEl?.currentTime ?? null,
              driftMs: activeEl !== undefined
                ? Math.round(Math.abs(activeEl.currentTime - sampleTargetTime) * 1000)
                : null,
              readyState: activeEl?.readyState ?? null,
              paused: activeEl?.paused ?? null,
              seeking: activeEl?.seeking ?? null,
              videoWidth: activeEl?.videoWidth ?? null,
              videoHeight: activeEl?.videoHeight ?? null,
              canDrawVideo: activeEl != null ? canDrawVideo(activeEl) : null,
              holdFrame: ab.holdFrameCount,
              usedVisualBlend: false,
              clockAbsorbMs: Math.round(ab.clockAbsorbMs),
              frameGapMs: frameGapMs ?? 0,
            });
          }
        }
        // Capture 300ms snapshot + emit smoothPlan + judgement
        if (elapsedSinceBoundary >= 300 && !ab.samplePhasesDone.has('after-300ms')) {
          ab.samplePhasesDone.add('after-300ms');
          ab.smoothPlanEmitted = true;
          const currentTimeAt300ms = activeEl?.currentTime ?? null;
          const currentTimeAdvancedAt100ms =
            ab.currentTimeAt100ms !== null && ab.currentTimeAtBoundary !== null
              ? Math.round((ab.currentTimeAt100ms - ab.currentTimeAtBoundary) * 1000)
              : null;
          const estimatedStartLatencyMsAt100ms =
            ab.currentTimeAt100ms !== null && ab.targetTimeAt100ms !== null
              ? Math.max(0, Math.round((ab.targetTimeAt100ms - ab.currentTimeAt100ms) * 1000))
              : null;
          const projectState = useProjectStore.getState();

          if (previewLogModeRef.current === 'boundary') {
            const sampleTargetTime = ab.trimStart + (resolvedSegment?.localTime ?? 0);
            logInfo('RENDER', 'preview.boundary.sample', {
              phase: 'after-300ms',
              previousId: ab.previousId,
              activeId: ab.activeId,
              globalTimeMs: Math.round(globalTimeSec * 1000),
              localTimeMs: resolvedSegment ? Math.round(resolvedSegment.localTime * 1000) : null,
              targetTime: sampleTargetTime,
              videoCurrentTime: currentTimeAt300ms,
              driftMs: currentTimeAt300ms !== null
                ? Math.round(Math.abs(currentTimeAt300ms - sampleTargetTime) * 1000)
                : null,
              readyState: activeEl?.readyState ?? null,
              paused: activeEl?.paused ?? null,
              seeking: activeEl?.seeking ?? null,
              videoWidth: activeEl?.videoWidth ?? null,
              videoHeight: activeEl?.videoHeight ?? null,
              canDrawVideo: activeEl != null ? canDrawVideo(activeEl) : null,
              holdFrame: ab.holdFrameCount,
              usedVisualBlend: false,
              clockAbsorbMs: Math.round(ab.clockAbsorbMs),
              frameGapMs: frameGapMs ?? 0,
            });
            logInfo('RENDER', '[DIAG-BOUNDARY-VISUAL-BRIDGE]', {
              previousId: ab.previousId,
              activeId: ab.activeId,
              usedVisualBlend: false,
              visualBlendMs: 0,
              usedPreviousFrameHold: ab.holdFrameCount > 0,
              holdFrameCount: ab.holdFrameCount,
              reason: 'standard-preview-visual-blend-disabled',
            });
          }

          logInfo('RENDER', 'preview.boundary.smoothPlan', {
            segmentIndex: ab.segmentIndex,
            previousId: ab.previousId,
            activeId: ab.activeId,
            boundaryGlobalTimeMs: ab.boundaryGlobalTimeMs,
            // preroll state
            prerollArmed: ab.prerollArmed,
            prerollStartedAtMs: ab.prerollStartedAtMs,
            prerollTargetSec: ab.prerollTargetSec,
            prerollLeadSec: ab.prerollLeadSec,
            activeTrimStartSec: ab.trimStart,
            // boundary state
            activeReadyStateAtBoundary: ab.readyStateAtBoundary,
            activeSeekingAtBoundary: ab.seekingAtBoundary,
            activePausedAtBoundary: ab.pausedAtBoundary,
            activeCurrentTimeAtBoundary: ab.currentTimeAtBoundary,
            activeTargetTimeAtBoundary: ab.targetTimeAtBoundary,
            activeDriftAtBoundaryMs: ab.driftAtBoundaryMs,
            // 100ms state
            currentTimeAdvancedAt100ms,
            estimatedStartLatencyMsAt100ms,
            readyStateAt100ms: ab.readyStateAt100ms,
            seekingAt100ms: ab.seekingAt100ms,
            pausedAt100ms: ab.pausedAt100ms,
            // 200ms state
            readyStateAt200ms: ab.readyStateAt200ms,
            seekingAt200ms: ab.seekingAt200ms,
            // visual blend (not implemented, report as false/0)
            usedVisualBlend: false,
            visualBlendMs: 0,
            usedPreviousFrameHold: ab.holdFrameCount > 0,
            holdFrameCount: ab.holdFrameCount,
            // clock absorb
            clockAbsorbMs: Math.round(ab.clockAbsorbMs),
            // rAF gap
            maxFrameGapMsAroundBoundary: Math.round(ab.maxFrameGapMs),
            // I/O state
            isPreviewPlaying: isPlayingRef.current,
            isAutoSaveRunning:
              ab.isAutoSaveRunningAtBoundary || projectState.autoSaveRuntimeStatus === 'running',
            isProjectSaving: ab.isProjectSavingAtBoundary || projectState.isSaving,
            isProjectLoading: ab.isProjectLoadingAtBoundary || projectState.isLoading,
          });

          logInfo('RENDER', 'preview.nextVideo.startLatency', {
            previousId: ab.previousId,
            activeId: ab.activeId,
            segmentIndex: ab.segmentIndex,
            boundaryGlobalTimeMs: ab.boundaryGlobalTimeMs,
            estimatedStartLatencyMsAt100ms,
            currentTimeAdvancedAt100ms,
            activeCurrentTimeAtBoundary: ab.currentTimeAtBoundary,
            activeTargetTimeAtBoundary: ab.targetTimeAtBoundary,
            currentTimeAt100ms: ab.currentTimeAt100ms,
            targetTimeAt100ms: ab.targetTimeAt100ms,
            activePausedAtBoundary: ab.pausedAtBoundary,
            pausedAt100ms: ab.pausedAt100ms,
            activeReadyStateAtBoundary: ab.readyStateAtBoundary,
            readyStateAt100ms: ab.readyStateAt100ms,
            activeSeekingAtBoundary: ab.seekingAtBoundary,
            seekingAt100ms: ab.seekingAt100ms,
            prerollArmed: ab.prerollArmed,
            prerollTargetSec: ab.prerollTargetSec,
            activeTrimStartSec: ab.trimStart,
            maxFrameGapMsAroundBoundary: Math.round(ab.maxFrameGapMs),
          });

          // Determine judgement result
          const reasons: string[] = [];
          let result: string = 'unknown';
          const isAutoSaveRunning =
            ab.isAutoSaveRunningAtBoundary || projectState.autoSaveRuntimeStatus === 'running';
          const isProjectSaving = ab.isProjectSavingAtBoundary || projectState.isSaving;
          const isProjectLoading = ab.isProjectLoadingAtBoundary || projectState.isLoading;
          if (ab.maxFrameGapMs >= 50) {
            result = 'likely-frame-gap';
            reasons.push(`maxFrameGapMs=${Math.round(ab.maxFrameGapMs)} >= 50`);
          }
          if (
            currentTimeAdvancedAt100ms !== null &&
            currentTimeAdvancedAt100ms < 20 &&
            (
              (ab.readyStateAtBoundary !== null && ab.readyStateAtBoundary < 2) ||
              (ab.readyStateAt100ms !== null && ab.readyStateAt100ms < 2) ||
              ab.seekingAtBoundary === true ||
              ab.seekingAt100ms === true
            )
          ) {
            if (result === 'unknown') result = 'likely-decoder-late';
            reasons.push(
              `currentTimeAdvancedAt100ms=${currentTimeAdvancedAt100ms}<20, readyStateAtBoundary=${ab.readyStateAtBoundary}, readyStateAt100ms=${ab.readyStateAt100ms}, seeking=${ab.seekingAt100ms}`,
            );
          }
          if ((ab.readyStateAt200ms !== null && ab.readyStateAt200ms < 2) || ab.seekingAt200ms === true) {
            if (result === 'unknown') result = 'likely-decoder-late';
            reasons.push(
              `readyStateAt200ms=${ab.readyStateAt200ms}, seekingAt200ms=${ab.seekingAt200ms} (still not ready at 200ms)`,
            );
          }
          if (ab.driftAtBoundaryMs !== null && ab.driftAtBoundaryMs > 100) {
            if (result === 'unknown') result = 'likely-preroll-misaligned';
            reasons.push(
              `driftAtBoundaryMs=${ab.driftAtBoundaryMs}>100 (currentTime=${ab.currentTimeAtBoundary}, trimStart=${ab.trimStart})`,
            );
          }
          if (isAutoSaveRunning || isProjectSaving || isProjectLoading) {
            if (result === 'unknown') result = 'likely-io-interference';
            reasons.push(
              `io: autoSave=${isAutoSaveRunning}, saving=${isProjectSaving}, loading=${isProjectLoading}`,
            );
          }
          if (result === 'unknown' || reasons.length === 0) {
            result = 'minor-platform-limit';
            reasons.push('all metrics within acceptable range');
          }

          logInfo('RENDER', 'preview.boundary.judgement', {
            previousId: ab.previousId,
            activeId: ab.activeId,
            result,
            reasons,
            maxFrameGapMs: Math.round(ab.maxFrameGapMs),
            currentTimeAdvancedAt100ms,
            estimatedStartLatencyMsAt100ms,
            activeDriftAtBoundaryMs: ab.driftAtBoundaryMs,
            readyStateAt200ms: ab.readyStateAt200ms,
            seekingAt200ms: ab.seekingAt200ms,
            visualBlendMs: 0,
            clockAbsorbMs: Math.round(ab.clockAbsorbMs),
            prerollArmed: ab.prerollArmed,
            prerollTargetSec: ab.prerollTargetSec,
            activeTrimStartSec: ab.trimStart,
            isAutoSaveRunning,
            isProjectSaving,
            isProjectLoading,
          });

          diagnostics.activeBoundary = null;
        }
      }
      if (previewLogModeRef.current === 'detailed') {
        const lastTickAt = diagnostics.lastTickLogAtMs ?? 0;
        if (now - lastTickAt >= PREVIEW_DETAILED_TICK_LOG_INTERVAL_MS) {
          logInfo('RENDER', 'preview.timeline.tick', {
            globalTimeMs: Math.round(globalTimeSec * 1000),
            displayGlobalTimeMs: Math.round(renderTimeSec * 1000),
            totalDurationMs: Math.round(totalDuration * 1000),
            segmentIndex: resolvedSegmentIndex,
            localTimeMs: resolvedLocalTimeMs,
          });
          diagnostics.lastTickLogAtMs = now;
        }
      }
      if (segmentChanged) {
        if (diagnostics.lastSegmentIndex >= 0) {
          logInfo('RENDER', 'preview.boundary.exit', {
            globalTimeMs: Math.round(globalTimeSec * 1000),
            displayGlobalTimeMs: Math.round(renderTimeSec * 1000),
            totalDurationMs: Math.round(totalDuration * 1000),
            boundaryIndex: diagnostics.lastSegmentIndex,
          });
        }
        if (resolvedSegmentIndex >= 0) {
          logInfo('RENDER', 'preview.boundary.enter', {
            globalTimeMs: Math.round(globalTimeSec * 1000),
            displayGlobalTimeMs: Math.round(renderTimeSec * 1000),
            totalDurationMs: Math.round(totalDuration * 1000),
            segmentIndex: resolvedSegmentIndex,
            localTimeMs: resolvedLocalTimeMs,
            boundaryIndex: resolvedSegmentIndex,
          });
          if (
            isAndroidLivePreview
            && isPreviewDiagnosticsLogMode(previewLogModeRef.current)
          ) {
            const activeSegmentItem = mediaItemsRef.current[resolvedSegmentIndex];
            const activeVideoElement = activeSegmentItem?.type === 'video'
              ? mediaElementsRef.current[activeSegmentItem.id] as HTMLVideoElement | undefined
              : undefined;
            logInfo('RENDER', 'preview.android.boundary.passive-switch', {
              previousId: diagnostics.lastSegmentIndex >= 0
                ? mediaItemsRef.current[diagnostics.lastSegmentIndex]?.id ?? null
                : null,
              activeId: activeSegmentItem?.id ?? null,
              segmentIndex: resolvedSegmentIndex,
              localTime: resolvedSegment?.localTime ?? null,
              activeReadyState: activeVideoElement?.readyState ?? null,
              activeSeeking: activeVideoElement?.seeking ?? null,
              activePaused: activeVideoElement?.paused ?? null,
              activeCurrentTime: activeVideoElement?.currentTime ?? null,
            });

            // Setup activeBoundary diagnostics for video→video Android boundary
            if (
              isAndroidLivePreview &&
              isPreviewDiagnosticsLogMode(previewLogModeRef.current) &&
              resolvedSegmentIndex >= 0 &&
              diagnostics.lastSegmentIndex >= 0
            ) {
              const enteringItem = mediaItemsRef.current[resolvedSegmentIndex];
              const exitingItem = mediaItemsRef.current[diagnostics.lastSegmentIndex];
              if (enteringItem?.type === 'video' && exitingItem?.type === 'video') {
                const activeEl = mediaElementsRef.current[enteringItem.id] as HTMLVideoElement | undefined;
                const trimStart = enteringItem.trimStart || 0;
                const activeTargetTimeAtBoundary = trimStart + (resolvedSegment?.localTime ?? 0);
                const currentTimeAtBoundary = activeEl?.currentTime ?? null;
                const driftAtBoundaryMs =
                  currentTimeAtBoundary !== null
                    ? Math.round(Math.abs(currentTimeAtBoundary - activeTargetTimeAtBoundary) * 1000)
                    : null;
                const prebufferDiag = standardNextVideoPrebufferDiagRef.current[enteringItem.id];
                const prerollArmed =
                  (prebufferDiag?.armed ?? false)
                  || (driftAtBoundaryMs !== null && driftAtBoundaryMs <= 50);
                const projectState = useProjectStore.getState();
                diagnostics.activeBoundary = {
                  boundaryGlobalTimeMs: Math.round(globalTimeSec * 1000),
                  enterRafNowMs: now,
                  previousId: exitingItem.id,
                  activeId: enteringItem.id,
                  segmentIndex: resolvedSegmentIndex,
                  trimStart,
                  prerollStartedAtMs: prebufferDiag?.startedAtMs ?? null,
                  prerollTargetSec: prebufferDiag?.targetSec ?? trimStart,
                  prerollLeadSec: prebufferDiag?.leadSec ?? null,
                  readyStateAtBoundary: activeEl?.readyState ?? null,
                  seekingAtBoundary: activeEl?.seeking ?? null,
                  pausedAtBoundary: activeEl?.paused ?? null,
                  currentTimeAtBoundary,
                  targetTimeAtBoundary: activeTargetTimeAtBoundary,
                  driftAtBoundaryMs,
                  prerollArmed,
                  maxFrameGapMs: frameGapMs ?? 0,
                  holdFrameCount: 0,
                  clockAbsorbMs: 0,
                  isAutoSaveRunningAtBoundary: projectState.autoSaveRuntimeStatus === 'running',
                  isProjectSavingAtBoundary: projectState.isSaving,
                  isProjectLoadingAtBoundary: projectState.isLoading,
                  samplePhasesDone: new Set(),
                  smoothPlanEmitted: false,
                  currentTimeAt100ms: null,
                  readyStateAt100ms: null,
                  seekingAt100ms: null,
                  pausedAt100ms: null,
                  readyStateAt200ms: null,
                  seekingAt200ms: null,
                  targetTimeAt100ms: null,
                };
                if (previewLogModeRef.current === 'boundary') {
                  logInfo('RENDER', 'preview.boundary.sample', {
                    phase: 'enter',
                    previousId: exitingItem.id,
                    activeId: enteringItem.id,
                    globalTimeMs: Math.round(globalTimeSec * 1000),
                    localTimeMs: resolvedSegment ? Math.round(resolvedSegment.localTime * 1000) : null,
                    targetTime: activeTargetTimeAtBoundary,
                    videoCurrentTime: currentTimeAtBoundary,
                    driftMs: driftAtBoundaryMs,
                    readyState: activeEl?.readyState ?? null,
                    paused: activeEl?.paused ?? null,
                    seeking: activeEl?.seeking ?? null,
                    videoWidth: activeEl?.videoWidth ?? null,
                    videoHeight: activeEl?.videoHeight ?? null,
                    canDrawVideo: activeEl != null
                      ? canDrawVideo(activeEl)
                      : null,
                    holdFrame: false,
                    usedVisualBlend: false,
                    clockAbsorbMs: 0,
                    frameGapMs: frameGapMs ?? 0,
                  });
                }
              }
            }
          }
        }
        diagnostics.lastSegmentIndex = resolvedSegmentIndex;
        diagnostics.beforeBoundarySampled = false;
      }
      if (previewLogModeRef.current === 'detailed' && segmentChanged) {
        logInfo('RENDER', 'preview.timeline.segmentResolved', {
          globalTimeMs: Math.round(globalTimeSec * 1000),
          segmentIndex: resolvedSegmentIndex,
          localTimeMs: resolvedLocalTimeMs,
        });
      }
      setCurrentTime(globalTimeSec);
      currentTimeRef.current = globalTimeSec;

      // Emit 'before-500ms' boundary sample in boundary log mode
      if (
        previewLogModeRef.current === 'boundary' &&
        isAndroidLivePreview &&
        !diagnostics.beforeBoundarySampled &&
        resolvedSegmentIndex >= 0
      ) {
        const currentItem = mediaItemsRef.current[resolvedSegmentIndex];
        const nextItem =
          resolvedSegmentIndex + 1 < mediaItemsRef.current.length
            ? mediaItemsRef.current[resolvedSegmentIndex + 1]
            : null;
        if (currentItem?.type === 'video' && nextItem?.type === 'video' && resolvedSegment) {
          const remainingTimeSec = currentItem.duration - resolvedSegment.localTime;
          if (remainingTimeSec > 0 && remainingTimeSec <= 0.5) {
            diagnostics.beforeBoundarySampled = true;
            const activeEl =
              mediaElementsRef.current[currentItem.id] as HTMLVideoElement | undefined;
            const trimStart = currentItem.trimStart || 0;
            const targetTime = resolveVideoSourceTime({ trimStart, localTime: resolvedSegment.localTime, playbackSpeed: currentItem.playbackSpeed });
            logInfo('RENDER', 'preview.boundary.sample', {
              phase: 'before-500ms',
              previousId: currentItem.id,
              activeId: nextItem.id,
              globalTimeMs: Math.round(globalTimeSec * 1000),
              localTimeMs: Math.round(resolvedSegment.localTime * 1000),
              targetTime,
              videoCurrentTime: activeEl?.currentTime ?? null,
              driftMs: activeEl !== undefined
                ? Math.round(Math.abs(activeEl.currentTime - targetTime) * 1000)
                : null,
              readyState: activeEl?.readyState ?? null,
              paused: activeEl?.paused ?? null,
              seeking: activeEl?.seeking ?? null,
              videoWidth: activeEl?.videoWidth ?? null,
              videoHeight: activeEl?.videoHeight ?? null,
              canDrawVideo: activeEl != null
                ? canDrawVideo(activeEl)
                : null,
              holdFrame: false,
              usedVisualBlend: false,
              clockAbsorbMs: 0,
              frameGapMs: frameGapMs ?? 0,
              remainingTimeMs: Math.round(remainingTimeSec * 1000),
            });
          }
        }
      }

      // 描画時間を実測する（エクスポート時のみ。プレビューには影響させない）。
      const endDrawMeasure = isExportMode
        ? exportFrameProfilerRef.current.begin('draw')
        : null;
      renderFrame(renderTimeSec, true, isExportMode);
      endDrawMeasure?.();
      // 【Issue #215】実際に描画できたフレーム番号を export へ公開する。
      // export のフレーム投入はこの実績に同期させ、rAF が 30fps を割り込んだときに
      // 未描画時刻のフレームまで複製投入して映像だけ早く終わるのを防ぐ。
      if (isExportMode && exportFrameIndex !== null) {
        exportRenderedFrameIndexRef.current = exportFrameIndex;
        // 【#215 再発調査】描いたフレーム番号を記録する（重複・飛びをここで検出する）。
        exportRenderedFrameTrackerRef.current.note(exportFrameIndex);
      }
      if (useFrameDrivenExportTime) {
        frameDrivenExportLastRenderedCountRef.current = submittedFrameCount;
      }
      reqIdRef.current = requestAnimationFrame(() => loop(isExportMode, myLoopId));
    },
    [
      audioCtxRef,
      completePreviewCacheExport,
      completeWebCodecsExport,
      configureAudioRouting,
      currentTimeRef,
      endFinalizedRef,
      finalizePreviewAtTimelineEnd,
      gainNodesRef,
      isPlayingRef,
      logDebug,
      logWarn,
      loopIdRef,
      mediaElementsRef,
      mediaItemsRef,
      pause,
      previewCachePlaybackActiveRef,
      previewCacheVideoRef,
      renderFrame,
      reqIdRef,
      setCurrentTime,
      startTimeRef,
      stopAll,
      toDisplayTime,
      totalDurationRef,
    ],
  );

  const startEngine = useCallback(
    async (fromTime: number, isExportMode: boolean) => {
      previewLogModeRef.current = resolvePreviewLogMode();
      logInfo('RENDER', 'preview.preflight.start', {
        globalTimeMs: Math.round(fromTime * 1000),
        totalDurationMs: Math.round(totalDurationRef.current * 1000),
        isExportMode,
      });
      logInfo('AUDIO', 'エンジン起動開始', { fromTime, isExportMode });

      if (platformCapabilities.isIosSafari) {
        logInfo('AUDIO', 'iOS Safari 判定結果', {
          safariDetected: platformCapabilities.isIosSafari,
          isExportMode,
          route: isExportMode ? 'export' : 'preview',
        });
      }

      const shouldStopBeforeAudioInit = shouldStopBeforePreviewAudioRouteInit(previewPlatformPolicy, {
        isExporting: isExportMode,
      });
      if (shouldStopBeforeAudioInit) {
        stopAll();
      }

      const ctx = getAudioContext();
      const stateBeforeResume = ctx.state as AudioContextState | 'interrupted';
      logDebug('AUDIO', 'AudioContext状態', { state: stateBeforeResume });
      if (stateBeforeResume !== 'running') {
        let attemptState: AudioContextState | 'interrupted' = stateBeforeResume;
        for (let attempt = 1; attempt <= previewPlatformPolicy.audioContextResumeRetryCount; attempt++) {
          try {
            await ctx.resume();
          } catch (err) {
            logWarn('AUDIO', `AudioContext再開に失敗（${attempt}回目）`, {
              state: attemptState,
              error: err instanceof Error ? err.message : String(err),
            });
          }

          attemptState = ctx.state as AudioContextState | 'interrupted';
          if (attemptState === 'running') {
            break;
          }
        }

        logInfo('AUDIO', 'AudioContext再開処理後の状態', {
          before: stateBeforeResume,
          after: ctx.state,
        });
      }

      if (shouldReinitializeAudioRoute(previewPlatformPolicy, isExportMode)) {
        try {
          if ((ctx.state as AudioContextState | 'interrupted') === 'running') {
            await ctx.suspend();
            await ctx.resume();
            logInfo('AUDIO', 'iOS Safari 音声経路を再初期化', { state: ctx.state });
          }
        } catch (err) {
          logWarn('AUDIO', 'iOS Safari 音声経路再初期化に失敗', {
            error: err instanceof Error ? err.message : String(err),
            state: ctx.state,
          });
        }
      }

      if (!shouldStopBeforeAudioInit) {
        stopAll();
      }
      resetBoundaryDiagnosticsState();

      // エクスポート後: MediaResourceLoader remount で共有 <video> を作り直してから再生へ進む。
      // 同一 DOM 上の hard src reset は previewlog2 で ready 直後に再 wedge したため本命にしない。
      // フラグは「remount 後の描画可能フレームが連続したとき」だけ落とす（ここでは落とさない）。
      if (!isExportMode && exportRanSinceLastPreviewRef.current) {
        postExportDrawableStreakRef.current = 0;
        const resetGeneration = loopIdRef.current;
        const shouldContinueReset = () => loopIdRef.current === resetGeneration;
        if (postExportNeedsRemountRef.current && remountSharedPreviewMedia) {
          const remountResult = await remountSharedPreviewMedia();
          if (!shouldContinueReset()) {
            return;
          }
          if (remountResult === 'ready' || remountResult === 'timeout') {
            postExportNeedsRemountRef.current = false;
          }
          logInfo('RENDER', 'preview.postExport.mediaRemount', {
            result: remountResult,
            phase: 'startEngine-preview',
            flagKept: true,
            reason: 'remount shared MediaResourceLoader after export (decoder wedge on same element)',
          });
        } else if (postExportNeedsRemountRef.current) {
          // remount 未配線時のフォールバック（同一要素 hard reset）
          const resetJobs: Promise<'ready' | 'timeout' | 'cancelled'>[] = [];
          for (const item of mediaItemsRef.current) {
            if (item.type !== 'video') continue;
            const el = mediaElementsRef.current[item.id] as HTMLVideoElement | undefined;
            if (!el) continue;
            const target = Number.isFinite(item.trimStart) ? Math.max(0, item.trimStart) : 0;
            resetJobs.push(resetSharedPreviewVideoElement(el, target, shouldContinueReset, POST_EXPORT_VIDEO_RESET_TIMEOUT_MS, 'hard'));
          }
          const results = await Promise.all(resetJobs);
          if (!shouldContinueReset()) {
            return;
          }
          postExportNeedsRemountRef.current = false;
          logInfo('RENDER', 'preview.postExport.videoDecoderReset', {
            resetCount: results.length,
            readyCount: results.filter((r) => r === 'ready').length,
            timeoutCount: results.filter((r) => r === 'timeout').length,
            mode: 'hard-fallback',
            phase: 'startEngine-preview',
            reason: 'remount unavailable; awaited hard decoder reset (flag kept until drawable streak)',
          });
        }
      }

      const myLoopId = loopIdRef.current;
      logDebug('RENDER', 'ループID取得', { myLoopId });
      const exportSessionId = isExportMode ? createPreviewExportSessionId() : null;

      if (isExportMode) {
        frameDrivenExportEnabledRef.current = shouldUseFrameDrivenExportPacing({
          isExportMode,
          fromTimeSec: fromTime,
          mediaItemTypes: mediaItemsRef.current.map((item) => item.type),
        });
        exportRenderedFrameIndexRef.current = null;
        frameDrivenExportSubmittedCountRef.current = 0;
        frameDrivenExportLastRenderedCountRef.current = null;
        frameDrivenExportStallObservedCountRef.current = 0;
        frameDrivenExportStallLastAdvanceAtMsRef.current = 0;
        frameDrivenExportForcedWallClockRef.current = false;
        exportBackpressurePausedRef.current = false;
        exportBackpressurePausedAtMsRef.current = null;
        exportTimelineSecRef.current = fromTime;
        exportLastWallNowMsRef.current = null;
        logInfo('RENDER', 'standard.export.pacing.selected', {
          mode: frameDrivenExportEnabledRef.current ? 'video-frame-driven' : 'wall-clock-dilated',
          fromTime,
          mediaItemCount: mediaItemsRef.current.length,
          hasVideo: mediaItemsRef.current.some((item) => item.type === 'video'),
          hasSpeedAbove1: mediaItemsRef.current.some(
            (item) => item.type === 'video' && resolveExportTimelineWallDivisorForItem(item) > 1,
          ),
        });
        activePreviewModeRef.current = 'export';
        // エクスポートは共有 <video> 要素を消費して decoder を wedge させ得る。
        // 次の通常プレビューで描画可能になるまで post-export guard を維持する（Issue #209）。
        exportRanSinceLastPreviewRef.current = true;
        postExportNeedsRemountRef.current = true;
        postExportDrawableStreakRef.current = 0;
        safeSetPreviewPlaying(false);
        currentExportSessionIdRef.current = exportSessionId;
        setProcessing(true);
        setExportPreparationStep(1);
        clearExport();
      } else {
        activePreviewModeRef.current = 'preview';
        setProcessing(false);
        safeSetPreviewPlaying(true);
        setExportPreparationStep(null);
        isPlayingRef.current = false;
        pause();
      }

      endFinalizedRef.current = false;

      configureAudioRouting(isExportMode);

      Object.values(mediaElementsRef.current).forEach((el) => {
        if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
          const mediaEl = el as HTMLMediaElement;
          if (mediaEl.readyState === 0) {
            try {
              mediaEl.load();
            } catch {
              /* ignore */
            }
          }
        }
      });

      let preparedPreviewAudio: PreparedPreviewAudioNodesResult = {
        activeVideoId: null,
        audibleSourceCount: 0,
        requiresWebAudio: false,
      };
      let shouldBundlePreviewStart = false;
      let previewPlaybackAttempt = previewPlaybackAttemptRef.current;

      if (!isExportMode) {
        if (previewCacheEnabledFlag) {
          const usedExistingCache = await startPreviewCachePlayback(fromTime);
          if (usedExistingCache) {
            loop(false, myLoopId);
            return;
          }

          const builtPreviewCache = await buildPreviewCache(myLoopId);
          if (myLoopId !== loopIdRef.current) {
            return;
          }

          if (builtPreviewCache) {
            const startedPreviewCachePlayback = await startPreviewCachePlayback(fromTime);
            if (startedPreviewCachePlayback) {
              loop(false, myLoopId);
              return;
            }
          }

          activePreviewModeRef.current = 'preview';
          previewCachePlaybackActiveRefValue.current = false;
        }

        const blockingVideos = collectPlaybackBlockingVideos(mediaItemsRef.current, fromTime);
        if (blockingVideos.length > 0) {
          let playbackReady = false;
          setLoading(true);
          try {
            playbackReady = await ensureVideoMetadataReady(blockingVideos, fromTime);
          } finally {
            setLoading(false);
          }

          if (myLoopId !== loopIdRef.current) {
            return;
          }

          if (!playbackReady) {
            setError('動画の読み込みが完了していません。数秒待ってから再生してください。');
            safeSetPreviewPlaying(false);
            pause();
            return;
          }
        }

        previewPlaybackAttemptRef.current += 1;
        previewPlaybackAttempt = previewPlaybackAttemptRef.current;

        preparedPreviewAudio = preparePreviewAudioNodesForTime(fromTime);
        shouldBundlePreviewStart = shouldBundlePreviewStartForWebAudioMix(previewPlatformPolicy, {
          hasActiveVideo: preparedPreviewAudio.activeVideoId !== null,
          audibleSourceCount: preparedPreviewAudio.audibleSourceCount,
          requiresWebAudio: preparedPreviewAudio.requiresWebAudio,
        });

        preparePreviewAudioNodesForUpcomingVideos(fromTime);

        if (previewPlatformPolicy.muteNativeMediaWhenAudioRouted) {
          const allowExtendedFuturePrewarm = preparedPreviewAudio.activeVideoId === null;
          let nearestFutureVideoId: string | null = null;
          let prewarmCursor = 0;
          for (const item of mediaItemsRef.current) {
            const itemStart = prewarmCursor;
            const itemEnd = prewarmCursor + Math.max(0, item.duration);
            prewarmCursor = itemEnd;
            if (item.type !== 'video') continue;
            if (itemStart - fromTime > 0.0005) {
              nearestFutureVideoId = item.id;
              break;
            }
          }

          prewarmCursor = 0;
          for (const item of mediaItemsRef.current) {
            const itemStart = prewarmCursor;
            const itemEnd = prewarmCursor + Math.max(0, item.duration);
            prewarmCursor = itemEnd;
            if (item.type !== 'video') continue;
            if (itemEnd <= fromTime + 0.0005) continue;
            if (shouldBundlePreviewStart && item.id === preparedPreviewAudio.activeVideoId) {
              continue;
            }
            const shouldPrewarmVideo = shouldKeepInactiveVideoPrewarmed(previewPlatformPolicy, {
              hasAudioNode: !!sourceNodesRef.current[item.id],
              isExporting: false,
              isActivePlaying: true,
              timeSinceVideoEndSec: fromTime - itemEnd,
              timeUntilVideoStartSec: itemStart - fromTime,
              isNearestFutureVideo: item.id === nearestFutureVideoId,
              allowExtendedFuturePrewarm,
            });
            if (!shouldPrewarmVideo) {
              continue;
            }
            const el = mediaElementsRef.current[item.id] as HTMLVideoElement | undefined;
            if (el && sourceNodesRef.current[item.id]) {
              const gn = gainNodesRef.current[item.id];
              if (gn && audioCtxRef.current) {
                gn.gain.setValueAtTime(0, audioCtxRef.current.currentTime);
              }
              applyPreviewAudioOutputState(previewPlatformPolicy, el, {
                hasAudioNode: true,
                desiredVolume: 0,
                audibleSourceCount: 0,
                isExporting: false,
              });
              if (Math.abs(el.currentTime - (item.trimStart || 0)) > 0.05 && !el.seeking) {
                el.currentTime = item.trimStart || 0;
              }
              el.pause();
            }
          }
        }

        if (previewPlatformPolicy.muteNativeMediaWhenAudioRouted) {
          const ctxForHandler = audioCtxRef.current;
          if (ctxForHandler) {
            ctxForHandler.onstatechange = () => {
              if (isPlayingRef.current && (ctxForHandler.state as AudioContextState | 'interrupted') !== 'running') {
                ctxForHandler.resume().catch(() => {});
              }
            };
          }
        }

        isPlayingRef.current = true;
        play();
      }

      if (isExportMode) {
        safeSetPreviewPlaying(false);
        setCurrentTime(fromTime);
        currentTimeRef.current = fromTime;
        mediaItemsRef.current.forEach((item) => {
          if (item.type !== 'video') return;
          const videoEl = mediaElementsRef.current[item.id] as HTMLVideoElement | undefined;
          if (!videoEl) return;
          try {
            if (videoEl.readyState === 0 && !videoEl.error) {
              videoEl.load();
            }
            const targetTime = Number.isFinite(item.trimStart) ? Math.max(0, item.trimStart) : 0;
            if (Math.abs(videoEl.currentTime - targetTime) > 0.01) {
              videoEl.currentTime = targetTime;
            }
          } catch {
            /* ignore */
          }
        });

        const audioPreloadPromises: Promise<void>[] = [];

        const prepareAudioTrack = (track: AudioTrack | null, trackId: string): Promise<void> => {
          return new Promise((resolve) => {
            const element = mediaElementsRef.current[trackId] as HTMLAudioElement;
            if (!track || !element) {
              resolve();
              return;
            }

            const targetTime = track.startPoint;

            if (element.readyState < 2) {
              const handleCanPlay = () => {
                element.removeEventListener('canplay', handleCanPlay);
                if (targetTime > 0 && Math.abs(element.currentTime - targetTime) > 0.1) {
                  const handleSeeked = () => {
                    element.removeEventListener('seeked', handleSeeked);
                    logDebug('AUDIO', `${trackId}プリロード完了（シーク後）`, { targetTime, actualTime: element.currentTime });
                    resolve();
                  };
                  element.addEventListener('seeked', handleSeeked, { once: true });
                  element.currentTime = targetTime;
                } else {
                  logDebug('AUDIO', `${trackId}プリロード完了`, { targetTime });
                  resolve();
                }
              };
              element.addEventListener('canplay', handleCanPlay, { once: true });
              element.load();

              setTimeout(() => {
                element.removeEventListener('canplay', handleCanPlay);
                logWarn('AUDIO', `${trackId}プリロードタイムアウト`, { readyState: element.readyState });
                resolve();
              }, 5000);
            } else {
              if (targetTime > 0 && Math.abs(element.currentTime - targetTime) > 0.1) {
                const handleSeeked = () => {
                  element.removeEventListener('seeked', handleSeeked);
                  logDebug('AUDIO', `${trackId}シーク完了`, { targetTime, actualTime: element.currentTime });
                  resolve();
                };
                element.addEventListener('seeked', handleSeeked, { once: true });
                element.currentTime = targetTime;

                setTimeout(() => {
                  element.removeEventListener('seeked', handleSeeked);
                  resolve();
                }, 2000);
              } else {
                resolve();
              }
            }
          });
        };

        const currentBgm = bgmRef.current;
        const currentNarrations = narrationsRef.current;
        if (currentBgm) {
          audioPreloadPromises.push(prepareAudioTrack(currentBgm, 'bgm'));
        }
        currentNarrations.forEach((clip) => {
          const trackId = `narration:${clip.id}`;
          const element = mediaElementsRef.current[trackId] as HTMLAudioElement;
          if (!element) return;
          audioPreloadPromises.push(
            new Promise((resolve) => {
              const targetTime = Number.isFinite(clip.trimStart) ? Math.max(0, clip.trimStart) : 0;
              if (element.readyState < 2) {
                const handleCanPlay = () => {
                  element.removeEventListener('canplay', handleCanPlay);
                  if (Math.abs(element.currentTime - targetTime) > 0.1) {
                    const handleSeeked = () => {
                      element.removeEventListener('seeked', handleSeeked);
                      resolve();
                    };
                    element.addEventListener('seeked', handleSeeked, { once: true });
                    element.currentTime = targetTime;
                  } else {
                    resolve();
                  }
                };
                element.addEventListener('canplay', handleCanPlay, { once: true });
                element.load();
                setTimeout(() => {
                  element.removeEventListener('canplay', handleCanPlay);
                  resolve();
                }, 5000);
              } else if (Math.abs(element.currentTime - targetTime) > 0.1) {
                const handleSeeked = () => {
                  element.removeEventListener('seeked', handleSeeked);
                  resolve();
                };
                element.addEventListener('seeked', handleSeeked, { once: true });
                element.currentTime = targetTime;
                setTimeout(() => {
                  element.removeEventListener('seeked', handleSeeked);
                  resolve();
                }, 2000);
              } else {
                resolve();
              }
            }),
          );
        });

        if (audioPreloadPromises.length > 0) {
          logInfo('AUDIO', 'オーディオプリロード開始', {
            bgm: !!currentBgm,
            narrationCount: currentNarrations.length,
          });
          await Promise.all(audioPreloadPromises);
          logInfo('AUDIO', 'オーディオプリロード完了');
        }

        const firstItem = mediaItemsRef.current[0];
        if (firstItem?.type === 'video') {
          const firstVideo = mediaElementsRef.current[firstItem.id] as HTMLVideoElement | undefined;
          if (firstVideo) {
            const targetTime = firstItem.trimStart || 0;
            const initialWarmupTarget = Math.max(0, targetTime - 0.2);
            // エクスポート等で active video を終端まで再生した直後は、要素が ended
            // （readyState 4・currentTime≒尺末）で残る。この状態から先頭へ currentTime を
            // 巻き戻しても、Chrome では ended 由来の readyState 4 を一瞬保持したまま逆方向シークが
            // 走り、preflight が「準備済み(readyState≥2)」と早期判定→ループ開始後にシークが未完了の
            // まま currentTime を毎フレーム再代入し続け、シークが settle せず readyState が 1 へ落ちて
            // 約500msごとの黒フレーム点滅になる（Issue #209）。
            // ended（または target から大きく先行した位置）で残っている場合は load() で
            // デコーダを一度クリーンにリセットしてから warmup シークを待つ。
            const shouldResetStrandedVideo = shouldResetStrandedPreviewVideo({
              readyState: firstVideo.readyState,
              ended: firstVideo.ended,
              currentTime: firstVideo.currentTime,
              warmupTargetTime: initialWarmupTarget,
            });
            try {
              if (shouldResetStrandedVideo) {
                firstVideo.load();
              }
              if (Math.abs(firstVideo.currentTime - initialWarmupTarget) > 0.01) {
                firstVideo.currentTime = initialWarmupTarget;
              }
            } catch {
              // ignore
            }

            await new Promise<void>((resolve) => {
              let done = false;
              const finish = () => {
                if (done) return;
                done = true;
                clearTimeout(timeoutId);
                firstVideo.removeEventListener('loadeddata', onReady);
                firstVideo.removeEventListener('canplay', onReady);
                firstVideo.removeEventListener('seeked', onReady);
                resolve();
              };
              const onReady = () => {
                const drift = Math.abs(firstVideo.currentTime - targetTime);
                if (firstVideo.readyState >= 2 && !firstVideo.seeking && firstVideo.currentTime >= targetTime && drift <= 0.05) {
                  finish();
                  return;
                }
                if (!firstVideo.seeking && firstVideo.readyState >= 1 && firstVideo.paused) {
                  try {
                    firstVideo.muted = true;
                    firstVideo.defaultMuted = true;
                    void firstVideo.play().catch(() => undefined);
                  } catch {
                    // ignore
                  }
                }
              };
              const timeoutId = setTimeout(finish, 4000);
              firstVideo.addEventListener('loadeddata', onReady);
              firstVideo.addEventListener('canplay', onReady);
              firstVideo.addEventListener('seeked', onReady);
              onReady();
            });
          }
        }

        await new Promise((r) => setTimeout(r, 200));
        renderFrame(0, false, true);
        await new Promise((r) => setTimeout(r, 100));
      } else {
        setCurrentTime(fromTime);
        currentTimeRef.current = fromTime;

        const shouldPrimeActiveVideo = !shouldBundlePreviewStart;
        let activeVideoElForBundledStart: HTMLVideoElement | null = null;
        let activeVideoTargetTime: number | null = null;
        let activeItemIndex = -1;
        let t = 0;
        for (const [index, item] of mediaItemsRef.current.entries()) {
          if (fromTime >= t && fromTime < t + item.duration) {
            activeItemIndex = index;
            if (item.type === 'video') {
              const videoEl = mediaElementsRef.current[item.id] as HTMLVideoElement;
              if (videoEl) {
                const localTime = fromTime - t;
                const targetTime = resolveVideoSourceTime({ trimStart: item.trimStart || 0, localTime, playbackSpeed: item.playbackSpeed });
                videoEl.currentTime = targetTime;
                activeVideoIdRef.current = item.id;
                activeVideoElForBundledStart = videoEl;
                activeVideoTargetTime = targetTime;
              }
            }
            break;
          }
          t += getTimelineAdvanceForItem(mediaItemsRef.current, index);
        }

        const nextVideoItem = findNextVideoItem(mediaItemsRef.current, activeItemIndex);

        if (activeVideoElForBundledStart && activeVideoTargetTime !== null) {
          await waitForPreviewStartVideoReady(
            activeVideoElForBundledStart,
            activeVideoTargetTime,
            () =>
              myLoopId === loopIdRef.current
              && previewPlaybackAttempt === previewPlaybackAttemptRef.current
              && isPlayingRef.current
              && !isSeekingRef.current,
          );
          if (myLoopId !== loopIdRef.current) {
            return;
          }
        }
        const nextVideoElForPreflight = nextVideoItem?.type === 'video'
          ? mediaElementsRef.current[nextVideoItem.id] as HTMLVideoElement | undefined
          : undefined;
        const nextTrimStart = nextVideoItem?.trimStart || 0;
        const nextVideoReadyState = nextVideoElForPreflight?.readyState ?? null;
        const nextVideoDrift = nextVideoElForPreflight
          ? Math.abs(nextVideoElForPreflight.currentTime - nextTrimStart)
          : null;
        const isNextVideoReady = !nextVideoItem || (
          !!nextVideoElForPreflight
          && !!nextVideoElForPreflight.currentSrc
          && nextVideoElForPreflight.readyState >= MIN_VIDEO_READY_STATE_FOR_CURRENT_FRAME
          && !nextVideoElForPreflight.seeking
          && Math.abs(nextVideoElForPreflight.currentTime - nextTrimStart) <= PREVIEW_START_READY_SYNC_TOLERANCE_SEC
          && nextVideoElForPreflight.videoWidth > 0
          && nextVideoElForPreflight.videoHeight > 0
        );

        const activeTrimDrift = activeVideoElForBundledStart && activeVideoTargetTime !== null
          ? Math.abs(activeVideoElForBundledStart.currentTime - activeVideoTargetTime)
          : Infinity;
        const isPreflightReady = !!activeVideoElForBundledStart
          && activeVideoElForBundledStart.readyState >= 3
          && activeTrimDrift <= 0.05
          && isNextVideoReady;
        if (isPreflightReady) logInfo('RENDER', 'preview.preflight.ready', {
          globalTimeMs: Math.round(fromTime * 1000),
          totalDurationMs: Math.round(totalDurationRef.current * 1000),
          hasActiveVideo: !!activeVideoElForBundledStart,
          activeVideoReadyState: activeVideoElForBundledStart?.readyState ?? null,
          hasNextVideo: !!nextVideoItem,
          nextVideoReady: isNextVideoReady,
          nextVideoReadyState,
          nextVideoDrift,
          activeTrimDrift,
          preseekWaitMs: null,
          preseekTimedOutIds: [],
        });

        if (preparedPreviewAudio.requiresWebAudio) {
          primePreviewAudioOnlyTracksAtTime(fromTime);
        }
        if (activeVideoElForBundledStart) {
          const shouldAttemptPlay = () =>
            shouldAttemptDeferredPreviewPlay({
              isCurrentAttempt: previewPlaybackAttempt === previewPlaybackAttemptRef.current,
              isPlaying: isPlayingRef.current,
              isSeeking: isSeekingRef.current,
              mediaSeeking: activeVideoElForBundledStart.seeking,
              readyState: activeVideoElForBundledStart.readyState,
              minReadyState: shouldBundlePreviewStart ? 2 : 1,
            });

          if (shouldPrimeActiveVideo || shouldBundlePreviewStart) {
            requestVideoPlayWithRetry(activeVideoElForBundledStart, shouldAttemptPlay);
          }
        }

        const shouldPrimeAndroidPreviewAudioOnlyTracks =
          platformCapabilities.isAndroid
          && (bgmRef.current !== null || narrationsRef.current.length > 0);
        if (shouldPrimeAndroidPreviewAudioOnlyTracks) {
          // active video の開始要求とは分離し、audio-only track は失敗しても preview 全体を止めない。
          primePreviewAudioOnlyTracksAtTime(fromTime);
        }

        const protectedVideoIds = [
          activeVideoIdRef.current,
          nextVideoItem?.id ?? null,
          activeItemIndex > 0 ? mediaItemsRef.current[activeItemIndex - 1]?.id ?? null : null,
        ].filter((id): id is string => !!id);

        resetInactiveVideos({
          nextVideoId: nextVideoItem?.id ?? null,
          protectedVideoIds,
          isAndroidPreview:
            platformCapabilities.isAndroid
            && !platformCapabilities.isIosSafari
            && isPlayingRef.current
            && !isExportMode,
        });

        // 直前に requestVideoPlayWithRetry で active video の play() を要求済み。
        // ここで paused-preview として描画すると renderFrame 側が active video を pause し、
        // play -> pause -> loop で play 再要求の周期が発生して開始直後の引っかかりになる。
        renderFrame(fromTime, true, isExportMode);

        await new Promise((r) => setTimeout(r, 50));
      }

      if (myLoopId !== loopIdRef.current) {
        return;
      }

      if (shouldRetryAudioOnlyPrimeAtPreviewStart(previewPlatformPolicy, {
        isExporting: isExportMode,
        hasActiveVideo: preparedPreviewAudio.activeVideoId !== null,
        requiresWebAudio: preparedPreviewAudio.requiresWebAudio,
      })) {
        primePreviewAudioOnlyTracksAtTime(fromTime);
      }

      const engineStartNowMs = getStandardPreviewNow();
      startTimeRef.current = engineStartNowMs - fromTime * 1000;
      if (isExportMode) {
        exportTimelineSecRef.current = fromTime;
        exportLastWallNowMsRef.current = engineStartNowMs;
      }
      logInfo('RENDER', 'preview.start', {
        globalTimeMs: Math.round(fromTime * 1000),
        totalDurationMs: Math.round(totalDurationRef.current * 1000),
        isExportMode,
      });

      if (isExportMode && canvasRef.current && masterDestRef.current) {
        startWebCodecsExport(
          canvasRef,
          masterDestRef,
          (url, ext) => {
            if (currentExportSessionIdRef.current !== exportSessionId) {
              try {
                URL.revokeObjectURL(url);
              } catch {
                // ignore
              }
              return;
            }
            setExportUrl(url);
            setExportExt(ext as 'mp4' | 'webm');
            setProcessing(false);
            setLoading(false);
            safeSetPreviewPlaying(false);
            setExportPreparationStep(null);
            currentExportSessionIdRef.current = null;
            pause();
            stopAll();
            // export 完了直後に preview 音声経路へ戻し、共有 MediaResourceLoader を remount する。
            // 同一 <video> の hard reset は ready 後に再 wedge するため本命にしない（Issue #209 / previewlog2）。
            configureAudioRouting(false);
            exportRanSinceLastPreviewRef.current = true;
            postExportNeedsRemountRef.current = true;
            postExportDrawableStreakRef.current = 0;
            const recoverGeneration = loopIdRef.current;
            void (async () => {
              const shouldContinue = () => loopIdRef.current === recoverGeneration;
              if (remountSharedPreviewMedia) {
                const remountResult = await remountSharedPreviewMedia();
                if (!shouldContinue()) return;
                if (remountResult === 'ready' || remountResult === 'timeout') {
                  postExportNeedsRemountRef.current = false;
                }
                logInfo('RENDER', 'preview.postExport.mediaRemount', {
                  result: remountResult,
                  phase: 'export-complete-callback',
                  flagKept: true,
                  reason: 'eager remount after export success; guard until drawable streak',
                });
              } else {
                const jobs: Promise<unknown>[] = [];
                for (const item of mediaItemsRef.current) {
                  if (item.type !== 'video') continue;
                  const el = mediaElementsRef.current[item.id] as HTMLVideoElement | undefined;
                  if (!el) continue;
                  const target = Number.isFinite(item.trimStart) ? Math.max(0, item.trimStart) : 0;
                  jobs.push(resetSharedPreviewVideoElement(el, target, shouldContinue, POST_EXPORT_VIDEO_RESET_TIMEOUT_MS, 'hard'));
                }
                await Promise.all(jobs);
                if (!shouldContinue()) return;
                postExportNeedsRemountRef.current = false;
                logInfo('RENDER', 'preview.postExport.videoDecoderReset', {
                  mode: 'hard-fallback',
                  phase: 'export-complete-callback',
                  flagKept: true,
                  reason: 'remount unavailable; eager hard reset',
                });
              }
              try {
                const t = Math.max(0, Math.min(currentTimeRef.current, totalDurationRef.current));
                renderFrame(t, false, false);
              } catch {
                /* ignore */
              }
            })();
          },
          (message) => {
            if (currentExportSessionIdRef.current !== exportSessionId) {
              return;
            }
            setProcessing(false);
            setLoading(false);
            safeSetPreviewPlaying(false);
            setExportPreparationStep(null);
            currentExportSessionIdRef.current = null;
            pause();
            stopAll();
            configureAudioRouting(false);
            exportRanSinceLastPreviewRef.current = true;
            postExportNeedsRemountRef.current = true;
            postExportDrawableStreakRef.current = 0;
            const recoverGeneration = loopIdRef.current;
            void (async () => {
              const shouldContinue = () => loopIdRef.current === recoverGeneration;
              if (remountSharedPreviewMedia) {
                const remountResult = await remountSharedPreviewMedia();
                if (!shouldContinue()) return;
                if (remountResult === 'ready' || remountResult === 'timeout') {
                  postExportNeedsRemountRef.current = false;
                }
                logInfo('RENDER', 'preview.postExport.mediaRemount', {
                  result: remountResult,
                  phase: 'export-error-callback',
                  flagKept: true,
                  reason: 'eager remount after export failure',
                });
              } else {
                const jobs: Promise<unknown>[] = [];
                for (const item of mediaItemsRef.current) {
                  if (item.type !== 'video') continue;
                  const el = mediaElementsRef.current[item.id] as HTMLVideoElement | undefined;
                  if (!el) continue;
                  const target = Number.isFinite(item.trimStart) ? Math.max(0, item.trimStart) : 0;
                  jobs.push(resetSharedPreviewVideoElement(el, target, shouldContinue, POST_EXPORT_VIDEO_RESET_TIMEOUT_MS, 'hard'));
                }
                await Promise.all(jobs);
                if (!shouldContinue()) return;
                postExportNeedsRemountRef.current = false;
              }
              try {
                const t = Math.max(0, Math.min(currentTimeRef.current, totalDurationRef.current));
                renderFrame(t, false, false);
              } catch {
                /* ignore */
              }
            })();
            setError(message);
          },
          {
            mediaItems: mediaItemsRef.current,
            bgm: bgmRef.current,
            narrations: narrationsRef.current,
            totalDuration: totalDurationRef.current,
            // エンドロール境界。BGM フェードと**ナレーションの打ち切り**の両方に使う。
            // **プレビューと同じ値を渡すこと**。ここが漏れると「プレビューでは
            // 消える/切れるのに書き出しでは鳴り続ける」という食い違いになる。
            clipsDuration: clipsDurationRef?.current ?? totalDurationRef.current,
            endrollBgmFadeOut: getEndrollDuration(endrollOverlayRef?.current) > 0
              && endrollOverlayRef?.current?.bgmFadeOut === true,
            getPlaybackTimeSec: () => currentTimeRef.current,
            // 【Issue #215】実描画済みフレーム番号を返し、映像フレームの投入を描画実績へ同期させる。
            getRenderedVideoFrameIndex: () => exportRenderedFrameIndexRef.current,
            // 【#215 再発調査】完了時の原因切り分け用。実際に描けた枚数と飛んだ枚数を返す。
            getRenderedFrameStats: () => {
              const tracker = exportRenderedFrameTrackerRef.current;
              return {
                distinctRenderedFrames: tracker.getDistinctCount(),
                renderCallCount: tracker.getRenderCallCount(),
                lastRenderedFrameIndex: tracker.getLastIndex(),
                renderSkipCount: tracker.getSkipCount(),
                skippedFrames: tracker.getSkippedFrames(),
              };
            },
            // 1 フレームの内訳（描画 / エンコード / その他）を実測して返す。
            // 「プレビューは滑らかなのに書き出しだけ遅い」原因の切り分けに使う。
            getFrameProfile: () =>
              exportFrameProfilerRef.current.summarize(getStandardPreviewNow()),
            // VideoEncoder への投入時間を計測する（export 側から呼ぶ）。
            beginEncodeMeasure: () => exportFrameProfilerRef.current.begin('encode'),
            // プロジェクトポスター → MP4 cover art / 先頭キーフレーム（動画サムネイルの標準手法）
            coverArtJpegDataUrl: useMediaStore.getState().projectPosterDataUrl,
            onVideoFrameSubmitted: (submittedFrameCount) => {
              if (
                currentExportSessionIdRef.current === exportSessionId
                && frameDrivenExportEnabledRef.current
              ) {
                frameDrivenExportSubmittedCountRef.current = submittedFrameCount;
              }
            },
            onVideoEncoderBackpressureChange: (paused) => {
              if (currentExportSessionIdRef.current !== exportSessionId) return;
              const nowMs = getStandardPreviewNow();

              if (paused) {
                if (exportBackpressurePausedRef.current) return;
                exportBackpressurePausedRef.current = true;
                exportBackpressurePausedAtMsRef.current = nowMs;
                Object.values(mediaElementsRef.current).forEach((element) => {
                  if (element?.tagName !== 'VIDEO') return;
                  try {
                    (element as HTMLVideoElement).pause();
                  } catch {
                    /* ignore */
                  }
                });
                logInfo('RENDER', 'standard.export.timeline.backpressurePaused', {
                  globalTimeMs: Math.round(currentTimeRef.current * 1000),
                });
                return;
              }

              if (!exportBackpressurePausedRef.current) return;
              const pausedAtMs = exportBackpressurePausedAtMsRef.current ?? nowMs;
              const pausedDurationMs = Math.max(0, nowMs - pausedAtMs);
              // 壁時計の原点を待機時間ぶん先へずらすことで、再開後の elapsed を連続させる。
              startTimeRef.current += pausedDurationMs;
              // dilation 用の前回壁時刻も待機区間を捨て、再開直後の timeline ジャンプを防ぐ。
              exportLastWallNowMsRef.current = nowMs;
              exportBackpressurePausedAtMsRef.current = null;
              exportBackpressurePausedRef.current = false;
              logInfo('RENDER', 'standard.export.timeline.backpressureResumed', {
                globalTimeMs: Math.round(currentTimeRef.current * 1000),
                pausedDurationMs: Math.round(pausedDurationMs),
              });
            },
            onPreparationStepChange: setExportPreparationStep,
            onAudioPreRenderComplete: () => {
              // 【Issue #215】実描画実績は loop 開始時点から数え直す。
              exportRenderedFrameIndexRef.current = null;
              exportRenderedFrameTrackerRef.current.reset();
              const loopStartNowMs = getStandardPreviewNow();
              exportFrameProfilerRef.current.reset(loopStartNowMs);
              frameDrivenExportSubmittedCountRef.current = 0;
              frameDrivenExportLastRenderedCountRef.current = null;
              // ウォッチドッグの停滞計測は実際の映像ループ開始時刻から始める。
              frameDrivenExportStallObservedCountRef.current = 0;
              frameDrivenExportStallLastAdvanceAtMsRef.current = loopStartNowMs;
              frameDrivenExportForcedWallClockRef.current = false;
              exportBackpressurePausedRef.current = false;
              exportBackpressurePausedAtMsRef.current = null;
              startTimeRef.current = loopStartNowMs - fromTime * 1000;
              exportTimelineSecRef.current = fromTime;
              exportLastWallNowMsRef.current = loopStartNowMs;
              loop(isExportMode, myLoopId);
            },
          },
        );
      } else {
        loop(isExportMode, myLoopId);
      }
    },
    [
      activeVideoIdRef,
      audioCtxRef,
      bgmRef,
      canvasRef,
      clearExport,
      configureAudioRouting,
      currentTimeRef,
      endFinalizedRef,
      ensureVideoMetadataReady,
      getAudioContext,
      gainNodesRef,
      isPlayingRef,
      isSeekingRef,
      logDebug,
      logInfo,
      logWarn,
      loop,
      loopIdRef,
      masterDestRef,
      mediaElementsRef,
      mediaItemsRef,
      narrationsRef,
      pause,
      platformCapabilities.isIosSafari,
      play,
      preparePreviewAudioNodesForTime,
      preparePreviewAudioNodesForUpcomingVideos,
      previewPlatformPolicy,
      previewPlaybackAttemptRef,
      primePreviewAudioOnlyTracksAtTime,
      remountSharedPreviewMedia,
      renderFrame,
      resetInactiveVideos,
      setCurrentTime,
      setError,
      setExportExt,
      setExportPreparationStep,
      setExportUrl,
      setLoading,
      setProcessing,
      sourceNodesRef,
      startTimeRef,
      startWebCodecsExport,
      stopAll,
      totalDurationRef,
    ],
  );

  return {
    handleMediaElementLoaded,
    handleSeeked,
    handleVideoLoadedData,
    renderFrame,
    stopAll,
    loop,
    startEngine,
  };
}
