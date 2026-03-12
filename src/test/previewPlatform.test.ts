import { describe, expect, it } from 'vitest';
import {
  getPreviewAudioOutputMode,
  getPreviewPlatformPolicy,
  getPreviewVideoSyncThreshold,
  shouldHoldVideoFrameAtClipEnd,
  shouldMuteNativeMediaElement,
  shouldReinitializeAudioRoute,
  shouldResumeAudioContextOnVisibilityReturn,
  shouldUseCaptionBlurFallback,
} from '../utils/previewPlatform';

describe('getPreviewPlatformPolicy', () => {
  it('iOS Safari では preview/export 向けの緩和値を返す', () => {
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

  it('export の再生失敗時は fallback しきい値を返す', () => {
    expect(
      getPreviewVideoSyncThreshold(iosPolicy, {
        isExporting: true,
        hasExportPlayFailure: true,
      }),
    ).toBe(0.35);
  });

  it('caption blur fallback の要否を返す', () => {
    expect(shouldUseCaptionBlurFallback(iosPolicy, 2)).toBe(true);
    expect(shouldUseCaptionBlurFallback(iosPolicy, 0)).toBe(false);
  });

  it('AudioNode があるときだけ native mute 判定を返す', () => {
    expect(shouldMuteNativeMediaElement(iosPolicy, true)).toBe(true);
    expect(shouldMuteNativeMediaElement(iosPolicy, false)).toBe(false);
  });

  it('iOS Safari preview は未接続の単一音源だけ native 出力にする', () => {
    expect(
      getPreviewAudioOutputMode(iosPolicy, {
        hasAudioNode: false,
        isExporting: false,
        audibleSourceCount: 1,
        desiredVolume: 1,
      }),
    ).toBe('native');
    expect(
      getPreviewAudioOutputMode(iosPolicy, {
        hasAudioNode: false,
        isExporting: false,
        audibleSourceCount: 2,
        desiredVolume: 1,
      }),
    ).toBe('webaudio');
    expect(
      getPreviewAudioOutputMode(iosPolicy, {
        hasAudioNode: false,
        isExporting: false,
        audibleSourceCount: 1,
        desiredVolume: 0.5,
      }),
    ).toBe('webaudio');
    expect(
      getPreviewAudioOutputMode(iosPolicy, {
        hasAudioNode: false,
        isExporting: true,
        audibleSourceCount: 1,
        desiredVolume: 1,
      }),
    ).toBe('webaudio');
    expect(
      getPreviewAudioOutputMode(iosPolicy, {
        hasAudioNode: true,
        isExporting: false,
        audibleSourceCount: 1,
        desiredVolume: 1,
      }),
    ).toBe('webaudio');
  });

  it('可視復帰時の AudioContext resume 判定と再初期化判定を返す', () => {
    expect(shouldResumeAudioContextOnVisibilityReturn(iosPolicy, 'interrupted')).toBe(true);
    expect(shouldResumeAudioContextOnVisibilityReturn(iosPolicy, 'running')).toBe(false);
    expect(shouldReinitializeAudioRoute(iosPolicy, false)).toBe(true);
    expect(shouldReinitializeAudioRoute(iosPolicy, true)).toBe(false);
  });

  it('動画クリップ終端では非最終クリップでも最終フレーム保持を優先する', () => {
    expect(
      shouldHoldVideoFrameAtClipEnd({
        clipLocalTime: 1.96,
        clipDuration: 2,
        trimStart: 3,
        videoCurrentTime: 4.97,
        videoEnded: true,
      }),
    ).toBe(true);
  });

  it('クリップ終端前なら ended していない動画を通常再生のまま扱う', () => {
    expect(
      shouldHoldVideoFrameAtClipEnd({
        clipLocalTime: 1.2,
        clipDuration: 2,
        trimStart: 3,
        videoCurrentTime: 4.2,
        videoEnded: false,
      }),
    ).toBe(false);
  });
});
