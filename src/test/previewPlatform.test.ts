import { describe, expect, it } from 'vitest';
import {
  getPreviewPlatformPolicy,
  getPreviewVideoSyncThreshold,
  shouldMuteNativeMediaElement,
  shouldReinitializeAudioRoute,
  shouldResumeAudioContextOnVisibilityReturn,
  shouldUseCaptionBlurFallback,
} from '../utils/previewPlatform';

describe('getPreviewPlatformPolicy', () => {
  it('iOS Safari ではプレビュー/エクスポート向け緩和値を返す', () => {
    const policy = getPreviewPlatformPolicy({
      isIosSafari: true,
      audioContextMayInterrupt: true,
    });

    expect(policy.previewSyncThresholdSec).toBe(1.0);
    expect(policy.exportSyncThresholdSec).toBe(1.2);
    expect(policy.needsCaptionBlurFallback).toBe(true);
    expect(policy.muteNativeMediaWhenAudioRouted).toBe(true);
    expect(policy.reinitializeAudioRouteOnPlay).toBe(true);
    expect(policy.audioContextResumeRetryCount).toBe(2);
  });

  it('非 iOS Safari では既定値を返す', () => {
    const policy = getPreviewPlatformPolicy({
      isIosSafari: false,
      audioContextMayInterrupt: false,
    });

    expect(policy.previewSyncThresholdSec).toBe(0.5);
    expect(policy.exportSyncThresholdSec).toBe(0.5);
    expect(policy.needsCaptionBlurFallback).toBe(false);
    expect(policy.muteNativeMediaWhenAudioRouted).toBe(false);
    expect(policy.reinitializeAudioRouteOnPlay).toBe(false);
    expect(policy.audioContextResumeRetryCount).toBe(2);
  });
});

describe('preview platform helpers', () => {
  const iosPolicy = getPreviewPlatformPolicy({
    isIosSafari: true,
    audioContextMayInterrupt: true,
  });

  it('フォールバック再生失敗時は専用の同期しきい値を返す', () => {
    expect(
      getPreviewVideoSyncThreshold(iosPolicy, {
        isExporting: true,
        hasExportPlayFailure: true,
      }),
    ).toBe(0.35);
  });

  it('caption blur fallback が必要かを返す', () => {
    expect(shouldUseCaptionBlurFallback(iosPolicy, 2)).toBe(true);
    expect(shouldUseCaptionBlurFallback(iosPolicy, 0)).toBe(false);
  });

  it('AudioNode 接続済みのときだけネイティブ音声をミュートする', () => {
    expect(shouldMuteNativeMediaElement(iosPolicy, true)).toBe(true);
    expect(shouldMuteNativeMediaElement(iosPolicy, false)).toBe(false);
  });

  it('可視復帰時の AudioContext resume 判定と再初期化判定を返す', () => {
    expect(shouldResumeAudioContextOnVisibilityReturn(iosPolicy, 'interrupted')).toBe(true);
    expect(shouldResumeAudioContextOnVisibilityReturn(iosPolicy, 'running')).toBe(false);
    expect(shouldReinitializeAudioRoute(iosPolicy, false)).toBe(true);
    expect(shouldReinitializeAudioRoute(iosPolicy, true)).toBe(false);
  });
});
