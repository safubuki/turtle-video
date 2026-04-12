import { describe, expect, it } from 'vitest';

import { useInactiveVideoManager as sharedUseInactiveVideoManager } from '../components/turtle-video/useInactiveVideoManager';
import { usePreviewAudioSession as sharedUsePreviewAudioSession } from '../components/turtle-video/usePreviewAudioSession';
import { usePreviewEngine as sharedUsePreviewEngine } from '../components/turtle-video/usePreviewEngine';
import { usePreviewSeekController as sharedUsePreviewSeekController } from '../components/turtle-video/usePreviewSeekController';
import { usePreviewVisibilityLifecycle as sharedUsePreviewVisibilityLifecycle } from '../components/turtle-video/usePreviewVisibilityLifecycle';
import type { PlatformCapabilities } from '../utils/platform';
import { getPreviewPlatformPolicy as sharedGetPreviewPlatformPolicy } from '../utils/previewPlatform';
import {
  appleSafariPreviewRuntime,
  getAppleSafariPreviewPlatformCapabilities,
} from '../flavors/apple-safari/appleSafariPreviewRuntime';
import {
  getStandardPreviewPlatformCapabilities,
  standardPreviewRuntime,
} from '../flavors/standard/standardPreviewRuntime';

const createCapabilities = (
  overrides: Partial<PlatformCapabilities> = {},
): PlatformCapabilities => ({
  userAgent: 'test-agent',
  platform: 'test-platform',
  maxTouchPoints: 0,
  isAndroid: true,
  isIOS: true,
  isSafari: true,
  isIosSafari: true,
  supportsShowSaveFilePicker: false,
  supportsShowOpenFilePicker: false,
  supportsTrackProcessor: true,
  supportsMp4MediaRecorder: true,
  audioContextMayInterrupt: true,
  supportedMediaRecorderProfile: { mimeType: 'video/mp4', extension: 'mp4' },
  trackProcessorCtor: undefined,
  ...overrides,
});

describe('preview runtime isolation', () => {
  it('active runtimes use flavor-owned preview hook modules', () => {
    expect(standardPreviewRuntime.useInactiveVideoManager).not.toBe(sharedUseInactiveVideoManager);
    expect(standardPreviewRuntime.usePreviewAudioSession).not.toBe(sharedUsePreviewAudioSession);
    expect(standardPreviewRuntime.usePreviewEngine).not.toBe(sharedUsePreviewEngine);
    expect(standardPreviewRuntime.usePreviewSeekController).not.toBe(sharedUsePreviewSeekController);
    expect(standardPreviewRuntime.usePreviewVisibilityLifecycle).not.toBe(sharedUsePreviewVisibilityLifecycle);

    expect(appleSafariPreviewRuntime.useInactiveVideoManager).not.toBe(sharedUseInactiveVideoManager);
    expect(appleSafariPreviewRuntime.usePreviewAudioSession).not.toBe(sharedUsePreviewAudioSession);
    expect(appleSafariPreviewRuntime.usePreviewEngine).not.toBe(sharedUsePreviewEngine);
    expect(appleSafariPreviewRuntime.usePreviewSeekController).not.toBe(sharedUsePreviewSeekController);
    expect(appleSafariPreviewRuntime.usePreviewVisibilityLifecycle).not.toBe(sharedUsePreviewVisibilityLifecycle);

    expect(standardPreviewRuntime.useInactiveVideoManager).not.toBe(appleSafariPreviewRuntime.useInactiveVideoManager);
    expect(standardPreviewRuntime.usePreviewAudioSession).not.toBe(appleSafariPreviewRuntime.usePreviewAudioSession);
    expect(standardPreviewRuntime.usePreviewEngine).not.toBe(appleSafariPreviewRuntime.usePreviewEngine);
    expect(standardPreviewRuntime.usePreviewSeekController).not.toBe(appleSafariPreviewRuntime.usePreviewSeekController);
    expect(standardPreviewRuntime.usePreviewVisibilityLifecycle).not.toBe(appleSafariPreviewRuntime.usePreviewVisibilityLifecycle);
  });

  it('active runtimes use flavor-owned preview policy factories', () => {
    expect(standardPreviewRuntime.getPreviewPlatformPolicy).not.toBe(sharedGetPreviewPlatformPolicy);
    expect(appleSafariPreviewRuntime.getPreviewPlatformPolicy).not.toBe(sharedGetPreviewPlatformPolicy);
    expect(standardPreviewRuntime.getPreviewPlatformPolicy).not.toBe(appleSafariPreviewRuntime.getPreviewPlatformPolicy);

    const baseCapabilities = createCapabilities({
      isAndroid: true,
      isIOS: true,
      isSafari: true,
      isIosSafari: true,
      audioContextMayInterrupt: true,
    });

    const standardPolicy = standardPreviewRuntime.getPreviewPlatformPolicy(
      getStandardPreviewPlatformCapabilities(baseCapabilities),
    );
    const appleSafariPolicy = appleSafariPreviewRuntime.getPreviewPlatformPolicy(
      getAppleSafariPreviewPlatformCapabilities(baseCapabilities),
    );

    expect(standardPolicy.muteNativeMediaWhenAudioRouted).toBe(false);
    expect(standardPolicy.needsCaptionBlurFallback).toBe(false);
    expect(appleSafariPolicy.muteNativeMediaWhenAudioRouted).toBe(true);
    expect(appleSafariPolicy.needsCaptionBlurFallback).toBe(true);
  });
});