/**
 * ユーティリティ関数 - タートルビデオ
 */

// フォーマット関連
export {
  formatTime,
  formatTimeDetailed,
  formatTimeCentiseconds,
  quantizeTimeToCentiseconds,
  formatPercent,
  formatFileSize,
  safeParseFloat,
} from './format';

export {
  TIME_STEPPER_STEP_SEC,
  TIME_SLIDER_STEP_SEC,
  resolveTimeSliderMax,
  snapTimeToLimitEnd,
  resolveEndTimeInput,
  stepEndTime,
  formatTimeStepperInput,
} from './timeStepperInput';

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
  isSupportedLogoImageFile,
  resolveLogoImageMimeType,
  snapshotLogoImageFile,
  createMediaItem,
  areAllExistingVideosMuted,
  resolveSavedBulkMuted,
  applyBulkMuteToAddedMediaItems,
  applyBulkVolumeToAddedMediaItems,
  areAllExistingAudioClipsMuted,
  applyBulkMuteToAddedAudioClips,
  applyBulkVolumeToAddedAudioClips,
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
  buildAutoProjectPosterContentKey,
  resolveAutoProjectPosterCaptureTime,
  isCanvasEffectivelyBlank,
  isRgbaBufferEffectivelyBlank,
  BLANK_FRAME_LUMINANCE_THRESHOLD,
  PREVIEW_START_CLEAR_ZONE_SEC,
  createPosterDataUrlFromCanvas,
  createPosterPreviewDataUrlFromCanvas,
  validateScale,
  normalizeImageDuration,
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
  MIN_VIDEO_PLAYBACK_SPEED,
  MAX_VIDEO_PLAYBACK_SPEED,
  VIDEO_PLAYBACK_SPEED_STEP,
  DEFAULT_VIDEO_PLAYBACK_SPEED,
  DEFAULT_SPEED_BADGE_POSITION,
  DEFAULT_SPEED_BADGE_LABEL_STYLE,
  SPEED_BADGE_CORNER_INSET_PERCENT,
  normalizeVideoPlaybackSpeed,
  formatPlaybackSpeedValue,
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

export {
  MEDIA_VOLUME_MIN,
  MEDIA_VOLUME_MAX,
  clampMediaVolume,
  normalizeMediaNormalizeGain,
  resolveMediaPlaybackVolume,
} from './mediaVolume';

export {
  MIN_MEASURABLE_RMS,
  MAX_NORMALIZE_GAIN,
  MIN_NORMALIZE_GAIN,
  computeRms,
  computeRmsForTimeRange,
  clampNormalizeGain,
  gainToDb,
  formatNormalizeAdjustment,
  computeEqualizeGains,
  normalizeVideoAudioNormalizeMode,
  DEFAULT_VIDEO_AUDIO_NORMALIZE_MODE,
} from './videoAudioLoudness';
export type { LoudnessSample, VideoAudioNormalizeMode } from './videoAudioLoudness';

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
