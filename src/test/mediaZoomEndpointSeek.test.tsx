import { act, cleanup, renderHook } from '@testing-library/react';
import type { ChangeEvent, MutableRefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreviewSeekController as useStandardSeek } from '../flavors/standard/preview/usePreviewSeekController';
import { usePreviewSeekController as useAppleSeek } from '../flavors/apple-safari/preview/usePreviewSeekController';
import { getPreviewPlatformPolicy } from '../flavors/standard/preview/previewPlatform';
import type { MediaItem } from '../types';
import type { MediaZoomEndpointPreview } from '../utils/mediaZoom';
import { resolveVideoSafeEndSourceTime } from '../utils/playbackSpeed';

const ref = <T,>(current: T): MutableRefObject<T> => ({ current });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.each([
  ['standard', useStandardSeek, false],
  ['apple-safari', useAppleSeek, true],
] as const)('%s: ズーム端点の動画シーク', (_name, useSeek, isIosSafari) => {
  it('先頭・末尾の取得と待機対象がカードIDに従い、倍速・トリム・境界を考慮して停止を保つ', () => {
    const videos = [document.createElement('video'), document.createElement('video')];
    for (const video of videos) {
      Object.defineProperties(video, { readyState: { value: 4 }, seeking: { value: false }, paused: { value: true } });
      vi.spyOn(video, 'pause').mockImplementation(() => {});
      vi.spyOn(video, 'play').mockResolvedValue();
    }
    const first: MediaItem = {
      id: 'first', file: new File([], 'sample.mp4'), type: 'video', url: 'blob:first',
      duration: 5, originalDuration: 20, trimStart: 2, trimEnd: 12, playbackSpeed: 2,
      volume: 1, isMuted: false, fadeIn: true, fadeOut: true,
      fadeInDuration: 1, fadeOutDuration: 1, scale: 1.4, positionX: 0, positionY: 0,
      isTransformOpen: false, isLocked: false,
      transitionToNext: isIosSafari ? null : { type: 'dissolve', duration: 1 },
    };
    const second = { ...first, id: 'second', trimStart: 6, trimEnd: 16, transitionToNext: null };
    const params: Parameters<typeof useStandardSeek>[0] = {
      mediaItemsRef: ref([first, second]), mediaElementsRef: ref({ first: videos[0], second: videos[1] }),
      zoomEndpointPreviewRef: ref<MediaZoomEndpointPreview | null>(null),
      sourceNodesRef: ref({}), gainNodesRef: ref({}), audioCtxRef: ref(null),
      totalDurationRef: ref(isIosSafari ? 10 : 9), currentTimeRef: ref(2),
      activeVideoIdRef: ref<string | null>(null), isPlayingRef: ref(false), isSeekingRef: ref(false),
      wasPlayingBeforeSeekRef: ref(false), seekingVideosRef: ref(new Set<string>()), startTimeRef: ref(0),
      reqIdRef: ref<number | null>(null), loopIdRef: ref(0),
      playbackTimeoutRef: ref<ReturnType<typeof setTimeout> | null>(null), lastSeekTimeRef: ref(0),
      pendingSeekRef: ref<number | null>(null), pendingSeekTimeoutRef: ref<ReturnType<typeof setTimeout> | null>(null),
      seekSettleGenerationRef: ref(0), previewPlaybackAttemptRef: ref(0),
      pendingPausedSeekWaitRef: ref<{ cleanup: () => void } | null>(null),
      handleSeekEndCallbackRef: ref<(() => void) | null>(null), renderPausedPreviewFrameAtTimeRef: ref(() => {}),
      cancelSeekPlaybackPrepareRef: ref<(() => void) | null>(null), isSeekPlaybackPreparingRef: ref(false),
      endFinalizedRef: ref(false),
      previewPlatformPolicy: getPreviewPlatformPolicy({ isAndroid: !isIosSafari, isIosSafari, audioContextMayInterrupt: false }),
      setCurrentTime: vi.fn(), attachGlobalSeekEndListeners: vi.fn(), detachGlobalSeekEndListeners: vi.fn(),
      cancelPendingSeekPlaybackPrepare: vi.fn(), cancelPendingPausedSeekWait: () => {
        params.pendingPausedSeekWaitRef.current?.cleanup(); params.pendingPausedSeekWaitRef.current = null;
      },
      renderFrame: vi.fn(), loop: vi.fn(), resetInactiveVideos: vi.fn(),
      preparePreviewAudioNodesForTime: vi.fn(() => ({ activeVideoId: null, audibleSourceCount: 0, requiresWebAudio: false })),
      primePreviewAudioOnlyTracksAtTime: vi.fn(),
    };
    const { result } = renderHook(() => useSeek(params));
    const seekEndpoint = (id: string, endpoint: 'start' | 'end', timelineTime: number) => {
      act(() => {
        result.current.handleSeekStart();
        params.zoomEndpointPreviewRef!.current = { id, endpoint };
        params.wasPlayingBeforeSeekRef.current = false;
        result.current.handleSeekChange({ target: { value: String(timelineTime) } } as ChangeEvent<HTMLInputElement>);
        result.current.handleSeekEnd();
      });
    };
    seekEndpoint('first', 'end', 5);
    expect(videos[0].currentTime).toBeCloseTo(resolveVideoSafeEndSourceTime({ trimStart: 2, timelineDuration: 5, playbackSpeed: 2, trimEnd: 12 }));
    expect(videos[1].currentTime).toBe(0);
    expect(params.activeVideoIdRef.current).toBe('first');
    seekEndpoint('second', 'start', isIosSafari ? 5 : 4);
    expect(videos[1].currentTime).toBe(6);
    expect(params.activeVideoIdRef.current).toBe('second');
    seekEndpoint('first', 'start', 0);
    expect(videos[0].currentTime).toBe(2);
    expect(params.currentTimeRef.current).toBe(0);
    expect(params.isPlayingRef.current).toBe(false);
    for (const video of videos) expect(video.play).not.toHaveBeenCalled();
    expect(params.loop).not.toHaveBeenCalled();

    // 通常のシークでは選択を解除してタイムラインから対象を決める。
    params.zoomEndpointPreviewRef!.current = null;
    act(() => result.current.syncVideoToTime(6, { force: true }));
    expect(params.activeVideoIdRef.current).toBe('second');
    expect(videos[1].currentTime).toBe(isIosSafari ? 8 : 10);
  });
});
