import { describe, expect, it } from 'vitest';

import type { MediaItem } from '../types';
import type { PlatformCapabilities } from '../utils/platform';
import { findActiveTimelineItem } from '../utils/playbackTimeline';
import {
  resolveWebCodecsAudioCaptureStrategy,
  shouldUseOfflineAudioPreRender,
} from '../hooks/export-strategies/exportStrategyResolver';
import {
  appleSafariPreviewRuntime,
  getAppleSafariPreviewPlatformCapabilities,
} from '../flavors/apple-safari/appleSafariPreviewRuntime';
import {
  getFutureVideoAudioProbeTimes,
  getPreviewAudioRoutingPlan,
  getVisibilityRecoveryPlan,
  shouldBundlePreviewStartForWebAudioMix,
  shouldRecoverAudioOnlyAfterVideoBoundary,
  shouldReinitializeAudioRoute,
  shouldResumeAudioContextOnVisibilityReturn,
} from '../flavors/apple-safari/preview/previewPlatform';
import {
  getAppleSafariExportPlatformCapabilities,
  resolveAppleSafariExportStrategyOrder,
} from '../flavors/apple-safari/appleSafariExportRuntime';

function createCapabilities(
  overrides: Partial<PlatformCapabilities> = {},
): PlatformCapabilities {
  return {
    userAgent: 'test-agent',
    platform: 'test-platform',
    maxTouchPoints: 0,
    isAndroid: true,
    isIOS: false,
    isSafari: false,
    isIosSafari: false,
    supportsShowSaveFilePicker: false,
    supportsShowOpenFilePicker: false,
    supportsTrackProcessor: true,
    supportsMp4MediaRecorder: true,
    audioContextMayInterrupt: false,
    supportedMediaRecorderProfile: { mimeType: 'video/mp4', extension: 'mp4' },
    trackProcessorCtor: undefined,
    ...overrides,
  };
}

function createTimelineItem(overrides: Partial<MediaItem> = {}): MediaItem {
  const type = overrides.type ?? 'video';
  const duration = overrides.duration ?? (type === 'image' ? 1 : 2);
  const fileType = type === 'image' ? 'image/png' : 'video/mp4';

  return {
    id: overrides.id ?? `${type}-item`,
    file: overrides.file ?? new File([''], type === 'image' ? 'frame.png' : 'clip.mp4', { type: fileType }),
    type,
    url: overrides.url ?? `blob:${overrides.id ?? type}`,
    volume: overrides.volume ?? 1,
    isMuted: overrides.isMuted ?? false,
    fadeIn: overrides.fadeIn ?? false,
    fadeOut: overrides.fadeOut ?? false,
    fadeInDuration: overrides.fadeInDuration ?? 1,
    fadeOutDuration: overrides.fadeOutDuration ?? 1,
    duration,
    originalDuration: overrides.originalDuration ?? duration,
    trimStart: overrides.trimStart ?? 0,
    trimEnd: overrides.trimEnd ?? duration,
    scale: overrides.scale ?? 1,
    positionX: overrides.positionX ?? 0,
    positionY: overrides.positionY ?? 0,
    isTransformOpen: overrides.isTransformOpen ?? false,
    isLocked: overrides.isLocked ?? false,
    ...overrides,
  };
}

describe('apple-safari flavor regression', () => {
  it('apple-safari preview は video→image→video と BGM を future probe と single mix で保護する', () => {
    const previewCapabilities = getAppleSafariPreviewPlatformCapabilities(
      createCapabilities({
        isAndroid: true,
        isIOS: false,
        isSafari: false,
        isIosSafari: false,
        audioContextMayInterrupt: false,
      }),
    );
    const previewPolicy = appleSafariPreviewRuntime.getPreviewPlatformPolicy(previewCapabilities);
    const items = [
      createTimelineItem({ id: 'video-1', type: 'video', duration: 2 }),
      createTimelineItem({ id: 'image-gap', type: 'image', duration: 1 }),
      createTimelineItem({ id: 'video-2', type: 'video', duration: 2 }),
    ];
    const totalDuration = items.reduce((sum, item) => sum + item.duration, 0);

    expect(previewCapabilities.isIosSafari).toBe(true);

    const imageGap = findActiveTimelineItem(items, 2.25, totalDuration);
    expect(imageGap).toMatchObject({ id: 'image-gap', index: 1 });
    expect(imageGap?.localTime).toBeCloseTo(0.25);

    const secondVideo = findActiveTimelineItem(items, 3.25, totalDuration);
    expect(secondVideo).toMatchObject({ id: 'video-2', index: 2 });
    expect(secondVideo?.localTime).toBeCloseTo(0.25);

    expect(getFutureVideoAudioProbeTimes(items, 2.25)).toEqual([3.05]);

    expect(
      getPreviewAudioRoutingPlan(previewPolicy, {
        isExporting: false,
        candidates: [
          {
            id: 'video-2',
            hasAudioNode: false,
            desiredVolume: 1,
            sourceType: 'video',
          },
          {
            id: 'bgm',
            hasAudioNode: false,
            desiredVolume: 1,
            sourceType: 'audio',
          },
        ],
      }),
    ).toEqual([
      {
        id: 'video-2',
        hasAudioNode: false,
        desiredVolume: 1,
        audibleSourceCount: 2,
        outputMode: 'webaudio',
      },
      {
        id: 'bgm',
        hasAudioNode: false,
        desiredVolume: 1,
        audibleSourceCount: 2,
        outputMode: 'webaudio',
      },
    ]);

    expect(
      shouldBundlePreviewStartForWebAudioMix(previewPolicy, {
        hasActiveVideo: true,
        audibleSourceCount: 2,
        requiresWebAudio: true,
      }),
    ).toBe(true);

    expect(
      shouldRecoverAudioOnlyAfterVideoBoundary(previewPolicy, {
        hasAudioNode: true,
        isExporting: false,
        isActivePlaying: true,
        timeSinceVideoEndSec: 0.04,
      }),
    ).toBe(true);
  });

  it('apple-safari preview は visibility hide/show 復帰時に seek と audio resume 方針を維持する', () => {
    const previewCapabilities = getAppleSafariPreviewPlatformCapabilities(createCapabilities());
    const previewPolicy = appleSafariPreviewRuntime.getPreviewPlatformPolicy(previewCapabilities);
    const items = [
      createTimelineItem({ id: 'video-1', type: 'video', duration: 2 }),
      createTimelineItem({ id: 'image-gap', type: 'image', duration: 1 }),
      createTimelineItem({ id: 'video-2', type: 'video', duration: 2 }),
    ];
    const totalDuration = items.reduce((sum, item) => sum + item.duration, 0);

    const restoredSeekTarget = findActiveTimelineItem(items, 3.4, totalDuration);
    expect(restoredSeekTarget).toMatchObject({ id: 'video-2', index: 2 });
    expect(restoredSeekTarget?.localTime).toBeCloseTo(0.4);

    expect(
      getVisibilityRecoveryPlan({
        resumedFromHidden: true,
        needsResyncFromLifecycle: false,
        isPlaying: true,
        isProcessing: false,
      }),
    ).toEqual({
      shouldKeepRunning: true,
      shouldResyncMedia: true,
      shouldDelayAudioResume: true,
    });

    expect(shouldResumeAudioContextOnVisibilityReturn(previewPolicy, 'interrupted')).toBe(true);
    expect(shouldReinitializeAudioRoute(previewPolicy, false)).toBe(true);
  });

  it('apple-safari export は MediaRecorder 優先と pre-render fallback で音声保持経路を固定する', () => {
    const exportCapabilities = getAppleSafariExportPlatformCapabilities(createCapabilities());

    expect(resolveAppleSafariExportStrategyOrder({
      isIosSafari: exportCapabilities.isIosSafari,
      supportedMediaRecorderProfile: exportCapabilities.supportedMediaRecorderProfile,
    })).toEqual(['ios-safari-mediarecorder', 'webcodecs-mp4']);

    expect(
      shouldUseOfflineAudioPreRender({
        hasAudioSources: true,
        isIosSafari: exportCapabilities.isIosSafari,
      }),
    ).toBe(true);

    expect(
      resolveWebCodecsAudioCaptureStrategy({
        offlineAudioDone: false,
        isIosSafari: exportCapabilities.isIosSafari,
        hasLiveAudioTrack: true,
        canUseTrackProcessor: true,
      }),
    ).toBe('script-processor');

    expect(
      resolveWebCodecsAudioCaptureStrategy({
        offlineAudioDone: true,
        isIosSafari: exportCapabilities.isIosSafari,
        hasLiveAudioTrack: true,
        canUseTrackProcessor: true,
      }),
    ).toBe('pre-rendered');
  });
});