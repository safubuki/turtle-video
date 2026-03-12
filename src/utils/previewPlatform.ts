/**
 * @file previewPlatform.ts
 * @description プレビュー再生に関わるブラウザ差分ポリシーを集約する utility。
 * `TurtleVideo.tsx` 側では個別の iOS 判定を持たず、このポリシーを参照して
 * 同期しきい値、caption blur fallback、AudioContext 復帰方針を決める。
 */

import type { PlatformCapabilities } from './platform';

export interface PreviewPlatformPolicy {
  previewSyncThresholdSec: number;
  exportSyncThresholdSec: number;
  exportFallbackSyncThresholdSec: number;
  needsCaptionBlurFallback: boolean;
  muteNativeMediaWhenAudioRouted: boolean;
  reinitializeAudioRouteOnPlay: boolean;
  resumeAudioContextOnVisibilityReturn: boolean;
  visibilityRecoveryDebounceMs: number;
  audioContextResumeRetryCount: number;
}

export type PreviewAudioOutputMode = 'native' | 'webaudio';

/**
 * プラットフォーム capability から、プレビュー制御用の方針を組み立てる。
 */
export function getPreviewPlatformPolicy(
  capabilities: Pick<PlatformCapabilities, 'isIosSafari' | 'audioContextMayInterrupt'>,
): PreviewPlatformPolicy {
  return {
    previewSyncThresholdSec: capabilities.isIosSafari ? 1.0 : 0.5,
    exportSyncThresholdSec: capabilities.isIosSafari ? 1.2 : 0.5,
    exportFallbackSyncThresholdSec: 0.35,
    needsCaptionBlurFallback: capabilities.isIosSafari,
    muteNativeMediaWhenAudioRouted: capabilities.isIosSafari,
    reinitializeAudioRouteOnPlay: capabilities.isIosSafari,
    resumeAudioContextOnVisibilityReturn: true,
    visibilityRecoveryDebounceMs: 120,
    // 既存実装は全ブラウザで最大2回まで resume を試みていたため、その挙動を維持する。
    audioContextResumeRetryCount: 2,
  };
}

/**
 * 通常プレビュー/エクスポート/フォールバックの状況から、動画同期しきい値を返す。
 */
export function getPreviewVideoSyncThreshold(
  policy: PreviewPlatformPolicy,
  options: { isExporting: boolean; hasExportPlayFailure: boolean },
): number {
  if (options.isExporting) {
    return options.hasExportPlayFailure
      ? policy.exportFallbackSyncThresholdSec
      : policy.exportSyncThresholdSec;
  }

  return policy.previewSyncThresholdSec;
}

/**
 * iOS Safari 向けの caption blur fallback 描画が必要かを返す。
 */
export function shouldUseCaptionBlurFallback(
  policy: PreviewPlatformPolicy,
  blurStrength: number,
): boolean {
  return policy.needsCaptionBlurFallback && blurStrength > 0;
}

/**
 * WebAudio 経路が確立した要素について、ネイティブ音声出力をミュートすべきかを返す。
 */
export function shouldMuteNativeMediaElement(
  policy: PreviewPlatformPolicy,
  hasAudioNode: boolean,
): boolean {
  return policy.muteNativeMediaWhenAudioRouted && hasAudioNode;
}

/**
 * iOS Safari preview では単一音源時のみ native 出力へ逃がし、複数同時再生時は WebAudio mix を使う。
 */
export function getPreviewAudioOutputMode(
  policy: PreviewPlatformPolicy,
  options: {
    hasAudioNode: boolean;
    isExporting: boolean;
    audibleSourceCount: number;
    desiredVolume: number;
  },
): PreviewAudioOutputMode {
  if (!policy.muteNativeMediaWhenAudioRouted) {
    return 'webaudio';
  }

  // MediaElementAudioSourceNode を一度生成した要素は native 出力へ戻せないため、
  // ノード生成済みなら常に WebAudio 側で扱う。
  if (options.hasAudioNode) {
    return 'webaudio';
  }

  // iOS Safari の native volume 経路は単一音源の再生確保には有効だが、
  // 音量変更・フェード・一時ミュートのような細かな制御は不安定になりやすい。
  if (Math.abs(options.desiredVolume - 1) > 0.001) {
    return 'webaudio';
  }

  if (!options.isExporting && options.audibleSourceCount <= 1) {
    return 'native';
  }

  return 'webaudio';
}

/**
 * 可視復帰時に AudioContext の resume を試みるべきかを返す。
 */
export function shouldResumeAudioContextOnVisibilityReturn(
  policy: PreviewPlatformPolicy,
  state: AudioContextState | 'interrupted',
): boolean {
  return policy.resumeAudioContextOnVisibilityReturn && state !== 'running';
}

/**
 * 再生開始時に AudioContext の経路再初期化が必要かを返す。
 */
export function shouldReinitializeAudioRoute(
  policy: PreviewPlatformPolicy,
  isExportMode: boolean,
): boolean {
  return policy.reinitializeAudioRouteOnPlay && !isExportMode;
}
