import { useCallback, type MutableRefObject } from 'react';

import type { MediaElementsRef, MediaItem } from '../../../types';
import { getSplitComparePairForIndex } from '../../../utils/splitCompare';
import {
  shouldAvoidPauseInactiveVideoInPreview,
  type PreviewPlatformPolicy,
} from './previewPlatform';

interface UseInactiveVideoManagerParams {
  mediaItemsRef: MutableRefObject<MediaItem[]>;
  mediaElementsRef: MutableRefObject<MediaElementsRef>;
  sourceNodesRef: MutableRefObject<Record<string, MediaElementAudioSourceNode>>;
  activeVideoIdRef: MutableRefObject<string | null>;
  previewPlatformPolicy: PreviewPlatformPolicy;
}

interface UseInactiveVideoManagerResult {
  resetInactiveVideos: (options?: ResetInactiveVideosOptions) => void;
}

export interface ResetInactiveVideosOptions {
  nextVideoId?: string | null;
  isAndroidPreview?: boolean;
  protectedVideoIds?: string[];
}

export function useInactiveVideoManager({
  mediaItemsRef,
  mediaElementsRef,
  sourceNodesRef,
  activeVideoIdRef,
  previewPlatformPolicy,
}: UseInactiveVideoManagerParams): UseInactiveVideoManagerResult {
  const resetInactiveVideos = useCallback((options?: ResetInactiveVideosOptions) => {
    // 並べて比較のペアの相手は active と同時に流れる peer。先頭へ巻き戻さない。
    const items = mediaItemsRef.current;
    const activeIndex = items.findIndex((item) => item.id === activeVideoIdRef.current);
    const activePair = activeIndex >= 0 ? getSplitComparePairForIndex(items, activeIndex) : null;
    const comparePeerId = activePair
      ? items[activeIndex === activePair.headIndex ? activePair.partnerIndex : activePair.headIndex]?.id ?? null
      : null;
    for (const item of items) {
      if (item.id === comparePeerId) continue;
      if (item.type === 'video' && item.id !== activeVideoIdRef.current) {
        const videoEl = mediaElementsRef.current[item.id] as HTMLVideoElement | undefined;
        if (!videoEl) {
          continue;
        }

        const hasAudioNode = !!sourceNodesRef.current[item.id];
        const avoidPauseForInactive = shouldAvoidPauseInactiveVideoInPreview(previewPlatformPolicy, {
          hasAudioNode,
          isExporting: false,
          isActivePlaying: true,
        });

        const isNextVideo = item.id === options?.nextVideoId;
        const isProtected = !!options?.protectedVideoIds?.includes(item.id);
        const shouldPreserveAndroidPreviewVideo = options?.isAndroidPreview && (isNextVideo || isProtected);

        if (!avoidPauseForInactive && !shouldPreserveAndroidPreviewVideo && !videoEl.paused) {
          videoEl.pause();
        }

        if (shouldPreserveAndroidPreviewVideo) {
          continue;
        }

        const startTime = item.trimStart || 0;
        if ((!avoidPauseForInactive || videoEl.paused) && Math.abs(videoEl.currentTime - startTime) > 0.1) {
          videoEl.currentTime = startTime;
        }
      }
    }
  }, [activeVideoIdRef, mediaElementsRef, mediaItemsRef, previewPlatformPolicy, sourceNodesRef]);

  return {
    resetInactiveVideos,
  };
}
