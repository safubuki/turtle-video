/**
 * ==================== 凍結（FROZEN / LEGACY） ====================
 * このファイルはランタイムでは使用されていない。standard / apple-safari の
 * フレーバー分離時に src/flavors/<flavor>/ 配下へフォーク済みで、現在は
 * PreviewRuntime の契約型（typeof 参照）とテストからのみ参照される。
 * 動作を変更したい場合はここではなく、対象フレーバーの
 * src/flavors/standard/... または src/flavors/apple-safari/... を編集すること。
 * ================================================================
 */
import { useCallback, type MutableRefObject } from 'react';

import type { MediaElementsRef, MediaItem } from '../../types';
import {
  shouldAvoidPauseInactiveVideoInPreview,
  type PreviewPlatformPolicy,
} from '../../utils/previewPlatform';

interface UseInactiveVideoManagerParams {
  mediaItemsRef: MutableRefObject<MediaItem[]>;
  mediaElementsRef: MutableRefObject<MediaElementsRef>;
  sourceNodesRef: MutableRefObject<Record<string, MediaElementAudioSourceNode>>;
  activeVideoIdRef: MutableRefObject<string | null>;
  previewPlatformPolicy: PreviewPlatformPolicy;
}

interface UseInactiveVideoManagerResult {
  resetInactiveVideos: () => void;
}

export function useInactiveVideoManager({
  mediaItemsRef,
  mediaElementsRef,
  sourceNodesRef,
  activeVideoIdRef,
  previewPlatformPolicy,
}: UseInactiveVideoManagerParams): UseInactiveVideoManagerResult {
  const resetInactiveVideos = useCallback(() => {
    for (const item of mediaItemsRef.current) {
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

        if (!avoidPauseForInactive && !videoEl.paused) {
          videoEl.pause();
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