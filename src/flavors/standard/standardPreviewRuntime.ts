import type { PreviewRuntime } from '../../components/turtle-video/previewRuntime';
import { useInactiveVideoManager } from '../../components/turtle-video/useInactiveVideoManager';
import { usePreviewAudioSession } from '../../components/turtle-video/usePreviewAudioSession';
import { usePreviewEngine } from '../../components/turtle-video/usePreviewEngine';
import { usePreviewSeekController } from '../../components/turtle-video/usePreviewSeekController';
import { usePreviewVisibilityLifecycle } from '../../components/turtle-video/usePreviewVisibilityLifecycle';
import { getPlatformCapabilities, type PlatformCapabilities } from '../../utils/platform';
import { getPreviewPlatformPolicy } from '../../utils/previewPlatform';

export function getStandardPreviewPlatformCapabilities(
  baseCapabilities: PlatformCapabilities = getPlatformCapabilities(),
): PlatformCapabilities {
  return {
    ...baseCapabilities,
    isIosSafari: false,
    audioContextMayInterrupt: false,
  };
}

export const standardPreviewRuntime: PreviewRuntime = {
  getPlatformCapabilities: getStandardPreviewPlatformCapabilities,
  getPreviewPlatformPolicy,
  useInactiveVideoManager,
  usePreviewAudioSession,
  usePreviewEngine,
  usePreviewSeekController,
  usePreviewVisibilityLifecycle,
};