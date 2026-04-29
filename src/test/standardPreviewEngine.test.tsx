import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';

import { usePreviewEngine } from '../flavors/standard/preview/usePreviewEngine';
import {
  getStandardPreviewPlatformCapabilities,
  standardPreviewRuntime,
} from '../flavors/standard/standardPreviewRuntime';
import type {
  AudioTrack,
  Caption,
  CaptionSettings,
  MediaElementsRef,
  MediaItem,
  NarrationClip,
} from '../types';
import type { PlatformCapabilities } from '../utils/platform';

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

function createRef<T>(value: T): MutableRefObject<T> {
  return { current: value };
}

function createVideoItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: overrides.id ?? 'video-1',
    file: overrides.file ?? new File([''], 'clip.mp4', { type: 'video/mp4' }),
    type: 'video',
    url: overrides.url ?? 'blob:video-1',
    volume: overrides.volume ?? 1,
    isMuted: overrides.isMuted ?? false,
    fadeIn: overrides.fadeIn ?? false,
    fadeOut: overrides.fadeOut ?? false,
    fadeInDuration: overrides.fadeInDuration ?? 1,
    fadeOutDuration: overrides.fadeOutDuration ?? 1,
    duration: overrides.duration ?? 6,
    originalDuration: overrides.originalDuration ?? 6,
    trimStart: overrides.trimStart ?? 1,
    trimEnd: overrides.trimEnd ?? 7,
    scale: overrides.scale ?? 1,
    positionX: overrides.positionX ?? 0,
    positionY: overrides.positionY ?? 0,
    isTransformOpen: overrides.isTransformOpen ?? false,
    isLocked: overrides.isLocked ?? false,
    ...overrides,
  };
}

function createMockVideoElement() {
  const listeners = new Map<string, Set<EventListener>>();

  const element = {
    tagName: 'VIDEO',
    readyState: 1,
    seeking: true,
    paused: true,
    currentTime: 0,
    duration: 12,
    ended: false,
    error: null,
    defaultMuted: false,
    muted: false,
    volume: 1,
    play: vi.fn().mockImplementation(() => {
      element.paused = false;
      return Promise.resolve();
    }),
    pause: vi.fn().mockImplementation(() => {
      element.paused = true;
    }),
    load: vi.fn(),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)?.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener);
    }),
    dispatch(type: string) {
      const event = new Event(type);
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
  };

  return element;
}

describe('standard preview engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('paused seek 後は active video 準備完了を待ってから再生を始める', async () => {
    const mediaItem = createVideoItem();
    const videoElement = createMockVideoElement();
    const requestAnimationFrameSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation(() => 1);

    const previewPlatformPolicy = standardPreviewRuntime.getPreviewPlatformPolicy(
      getStandardPreviewPlatformCapabilities(createCapabilities()),
    );

    const setCurrentTime = vi.fn();
    const play = vi.fn();
    const pause = vi.fn();

    const { result } = renderHook(() =>
      usePreviewEngine({
        captions: [] as Caption[],
        captionSettings: {} as CaptionSettings,
        mediaItemsRef: createRef([mediaItem]),
        bgmRef: createRef<AudioTrack | null>(null),
        narrationsRef: createRef<NarrationClip[]>([]),
        captionsRef: createRef<Caption[]>([]),
        captionSettingsRef: createRef({} as CaptionSettings),
        totalDurationRef: createRef(mediaItem.duration),
        currentTimeRef: createRef(0),
        canvasRef: createRef<HTMLCanvasElement | null>(null),
        mediaElementsRef: createRef({
          [mediaItem.id]: videoElement as unknown as HTMLVideoElement,
        } as MediaElementsRef),
        audioCtxRef: createRef({
          state: 'running',
          currentTime: 0,
          destination: {},
          onstatechange: null,
          resume: vi.fn().mockResolvedValue(undefined),
          suspend: vi.fn().mockResolvedValue(undefined),
        } as unknown as AudioContext),
        sourceNodesRef: createRef({}),
        gainNodesRef: createRef({}),
        masterDestRef: createRef(null),
        audioRoutingModeRef: createRef<'preview' | 'export'>('preview'),
        reqIdRef: createRef<number | null>(null),
        startTimeRef: createRef(0),
        audioResumeWaitFramesRef: createRef(0),
        recorderRef: createRef<MediaRecorder | null>(null),
        loopIdRef: createRef(0),
        isPlayingRef: createRef(false),
        isSeekingRef: createRef(false),
        isSeekPlaybackPreparingRef: createRef(false),
        activeVideoIdRef: createRef<string | null>(null),
        videoRecoveryAttemptsRef: createRef({}),
        exportPlayFailedRef: createRef({}),
        exportFallbackSeekAtRef: createRef({}),
        seekingVideosRef: createRef(new Set<string>()),
        pendingSeekRef: createRef<number | null>(null),
        wasPlayingBeforeSeekRef: createRef(false),
        pendingSeekTimeoutRef: createRef<ReturnType<typeof setTimeout> | null>(null),
        previewPlaybackAttemptRef: createRef(0),
        requestPreviewAudioRouteRefreshRef: createRef(() => {}),
        primePreviewAudioOnlyTracksAtTimeRef: createRef(() => {}),
        endFinalizedRef: createRef(false),
        previewPlatformPolicy,
        platformCapabilities: { isAndroid: true, isIosSafari: false },
        setVideoDuration: vi.fn(),
        setCurrentTime,
        setProcessing: vi.fn(),
        setLoading: vi.fn(),
        setExportPreparationStep: vi.fn(),
        setExportUrl: vi.fn(),
        setExportExt: vi.fn(),
        clearExport: vi.fn(),
        setError: vi.fn(),
        play,
        pause,
        getAudioContext: () =>
          ({
            state: 'running',
            currentTime: 0,
            destination: {},
            onstatechange: null,
            resume: vi.fn().mockResolvedValue(undefined),
            suspend: vi.fn().mockResolvedValue(undefined),
          }) as unknown as AudioContext,
        cancelPendingPausedSeekWait: vi.fn(),
        cancelPendingSeekPlaybackPrepare: vi.fn(),
        detachGlobalSeekEndListeners: vi.fn(),
        ensureAudioNodeForElement: vi.fn(() => false),
        detachAudioNode: vi.fn(),
        preparePreviewAudioNodesForTime: vi.fn(() => ({
          activeVideoId: mediaItem.id,
          audibleSourceCount: 1,
          requiresWebAudio: false,
        })),
        preparePreviewAudioNodesForUpcomingVideos: vi.fn(),
        primePreviewAudioOnlyTracksAtTime: vi.fn(),
        resetInactiveVideos: vi.fn(),
        startWebCodecsExport: vi.fn(),
        stopWebCodecsExport: vi.fn(),
        logInfo: vi.fn(),
        logWarn: vi.fn(),
        logDebug: vi.fn(),
      }),
    );

    const startPromise = result.current.startEngine(2, false);
    await Promise.resolve();

    expect(videoElement.play).not.toHaveBeenCalled();
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();

    videoElement.seeking = false;
    videoElement.readyState = 2;
    videoElement.dispatch('seeked');

    await vi.advanceTimersByTimeAsync(60);
    await startPromise;

    expect(videoElement.play).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    expect(setCurrentTime).toHaveBeenCalledWith(2);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
