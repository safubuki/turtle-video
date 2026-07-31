/**
 * ユーティリティ関数 - タートルビデオ
 */

// フォーマット関連
export {
  formatTime,
  formatTimeDetailed,
  formatPercent,
  formatFileSize,
  safeParseFloat,
} from './format';

// オーディオ関連
export {
  pcmToWav,
  base64ToArrayBuffer,
  getOrCreateAudioContext,
  calculateTrackTime,
  calculateFadeVolume,
} from './audio';

// メディア関連
export {
  generateId,
  getMediaType,
  createMediaItem,
  calculateTotalDuration,
  getActiveMediaItem,
  swapArrayItems,
  validateTrim,
  MIN_VIDEO_TRIM_DURATION_SEC,
  computeVideoTrimFromPreviewPosition,
  canSetVideoTrimFromPreviewPosition,
  computeVideoTimelineDurationFromTrim,
  AUTO_THUMBNAIL_OFFSET_SEC,
  AUTO_THUMBNAIL_RETRY_OFFSETS_SEC,
  computeAutoThumbnailSourceTime,
  isThumbnailSourceTimeInRange,
  resolveThumbnailAfterTrimChange,
  computeThumbnailSourceTimeFromPreviewPosition,
  canSetVideoThumbnailFromPreviewPosition,
  buildThumbnailSeekCandidates,
  resolveMediaThumbnailSourceTime,
  computeAutoProjectPosterTimelineTime,
  createPosterDataUrlFromCanvas,
  createPosterPreviewDataUrlFromCanvas,
  validateScale,
  validatePosition,
  revokeObjectUrl,
} from './media';

// Canvas関連
export {
  clearCanvas,
  getMediaDimensions,
  calculateFitScale,
  calculateFadeAlpha,
  drawMediaCentered,
  isMediaReady,
  safeSetVideoTime,
  captureCanvasAsImage,
  normalizeRotation,
  getNextRotation,
  resolveRotatedFitDimensions,
  normalizeMediaBlur,
  prepareUniformMediaBlurSource,
  resolveMediaBlurPixels,
  resolveMediaBlurFilter,
  resolveUniformMediaBlurSize,
  MAX_MEDIA_BLUR,
} from './canvas';

// 再生タイムライン判定
export {
  findActiveTimelineItem,
  collectPlaybackBlockingVideos,
} from './playbackTimeline';

// 動画倍速
export {
  VIDEO_PLAYBACK_SPEEDS,
  DEFAULT_VIDEO_PLAYBACK_SPEED,
  DEFAULT_SPEED_BADGE_POSITION,
  DEFAULT_SPEED_BADGE_LABEL_STYLE,
  normalizeVideoPlaybackSpeed,
  normalizeSpeedBadgeLabelStyle,
  formatSpeedBadgeLabel,
  resolveSpeedAwareVideoSyncThresholdSec,
  resolveExportTimelineWallDivisorForItem,
  wallDeltaToExportTimelineDelta,
  resolveVideoElementPlaybackRateForContext,
  getVideoSourceClipDuration,
  computeTimelineDurationFromSource,
  resolveVideoTimelineDuration,
  resolveVideoSourceTime,
  resolveVideoSafeEndSourceTime,
  normalizeSpeedBadgePosition,
  resolveSpeedBadgePresetPosition,
  shouldDrawSpeedBadge,
  drawSpeedBadgeFrame,
  applyVideoElementPlaybackRate,
} from './playbackSpeed';
export type { SpeedBadgePositionPreset } from './playbackSpeed';

// 倍速 export 用・音程維持タイムストレッチ
export {
  extractAndTimeCompressAudioBuffer,
  timeStretchAudioBufferPreservePitch,
  wsolaTimeStretchChannel,
} from './audioTimeStretch';

// プラットフォーム判定
export {
  detectBrowserPlatform,
  getAudioUploadAccept,
  openFilesWithPicker,
  supportsShowSaveFilePicker,
  supportsShowOpenFilePicker,
  getTrackProcessorConstructor,
  getSupportedMediaRecorderProfile,
  getPlatformCapabilities,
} from './platform';

// プレビュー制御ポリシー
export {
  getPreviewAudioOutputMode,
  getPreviewPlatformPolicy,
  getPreviewVideoSyncThreshold,
  shouldUseCaptionBlurFallback,
  shouldMuteNativeMediaElement,
  shouldResumeAudioContextOnVisibilityReturn,
  shouldReinitializeAudioRoute,
} from './previewPlatform';

// 保存経路
export {
  resolveClientFileSaveStrategy,
  saveBlobWithClientFileStrategy,
  saveObjectUrlWithClientFileStrategy,
} from './fileSave';

export {
  resolveIosSafariSingleMixedAudio,
} from './iosSafariAudio';
