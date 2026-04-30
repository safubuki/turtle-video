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

const TEST_PREVIEW_START_SETTLE_MS = 60;

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

function createImageItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: overrides.id ?? 'image-1',
    file: overrides.file ?? new File([''], 'frame.png', { type: 'image/png' }),
    type: 'image',
    url: overrides.url ?? 'blob:image-1',
    volume: overrides.volume ?? 1,
    isMuted: overrides.isMuted ?? false,
    fadeIn: overrides.fadeIn ?? false,
    fadeOut: overrides.fadeOut ?? false,
    fadeInDuration: overrides.fadeInDuration ?? 1,
    fadeOutDuration: overrides.fadeOutDuration ?? 1,
    duration: overrides.duration ?? 1,
    originalDuration: overrides.originalDuration ?? (overrides.duration ?? 1),
    trimStart: overrides.trimStart ?? 0,
    trimEnd: overrides.trimEnd ?? (overrides.duration ?? 1),
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
    videoWidth: 1280,
    videoHeight: 720,
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

function createMockCanvasContext() {
  return {
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    globalAlpha: 1,
    fillStyle: '#000000',
  } as unknown as CanvasRenderingContext2D;
}

describe('standard preview engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setupPreviewEngineHarness(options?: {
    bgm?: AudioTrack | null;
    narrations?: NarrationClip[];
    primePreviewAudioOnlyTracksAtTime?: ReturnType<typeof vi.fn>;
  }) {
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
    const primePreviewAudioOnlyTracksAtTimeSpy =
      options?.primePreviewAudioOnlyTracksAtTime ?? vi.fn();
    const primePreviewAudioOnlyTracksAtTime =
      primePreviewAudioOnlyTracksAtTimeSpy as unknown as (playbackTime: number) => void;

    const hook = renderHook(() =>
      usePreviewEngine({
        captions: [] as Caption[],
        captionSettings: {} as CaptionSettings,
        mediaItemsRef: createRef([mediaItem]),
        bgmRef: createRef<AudioTrack | null>(options?.bgm ?? null),
        narrationsRef: createRef<NarrationClip[]>(options?.narrations ?? []),
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
        primePreviewAudioOnlyTracksAtTime,
        resetInactiveVideos: vi.fn(),
        startWebCodecsExport: vi.fn(),
        stopWebCodecsExport: vi.fn(),
        logInfo: vi.fn(),
        logWarn: vi.fn(),
        logDebug: vi.fn(),
      }),
    );

    return {
      mediaItem,
      videoElement,
      requestAnimationFrameSpy,
      setCurrentTime,
      play,
      primePreviewAudioOnlyTracksAtTime: primePreviewAudioOnlyTracksAtTimeSpy,
      hook,
    };
  }

  function setupRenderFrameHarness(options?: {
    mediaItems?: MediaItem[];
    mediaElements?: MediaElementsRef;
  }) {
    const mediaItems = options?.mediaItems ?? [createVideoItem()];
    const mediaElements = options?.mediaElements ?? {};
    const canvasContext = createMockCanvasContext();
    const previewPlatformPolicy = standardPreviewRuntime.getPreviewPlatformPolicy(
      getStandardPreviewPlatformCapabilities(createCapabilities()),
    );

    const hook = renderHook(() =>
      usePreviewEngine({
        captions: [] as Caption[],
        captionSettings: {} as CaptionSettings,
        mediaItemsRef: createRef(mediaItems),
        bgmRef: createRef<AudioTrack | null>(null),
        narrationsRef: createRef<NarrationClip[]>([]),
        captionsRef: createRef<Caption[]>([]),
        captionSettingsRef: createRef({} as CaptionSettings),
        totalDurationRef: createRef(mediaItems.reduce((sum, item) => sum + item.duration, 0)),
        currentTimeRef: createRef(0),
        canvasRef: createRef({
          getContext: vi.fn(() => canvasContext),
        } as unknown as HTMLCanvasElement),
        mediaElementsRef: createRef(mediaElements),
        audioCtxRef: createRef(null),
        sourceNodesRef: createRef({}),
        gainNodesRef: createRef({}),
        masterDestRef: createRef(null),
        audioRoutingModeRef: createRef<'preview' | 'export'>('preview'),
        reqIdRef: createRef<number | null>(null),
        startTimeRef: createRef(0),
        audioResumeWaitFramesRef: createRef(0),
        recorderRef: createRef<MediaRecorder | null>(null),
        loopIdRef: createRef(1),
        isPlayingRef: createRef(true),
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
        setCurrentTime: vi.fn(),
        setProcessing: vi.fn(),
        setLoading: vi.fn(),
        setExportPreparationStep: vi.fn(),
        setExportUrl: vi.fn(),
        setExportExt: vi.fn(),
        clearExport: vi.fn(),
        setError: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        getAudioContext: vi.fn(),
        cancelPendingPausedSeekWait: vi.fn(),
        cancelPendingSeekPlaybackPrepare: vi.fn(),
        detachGlobalSeekEndListeners: vi.fn(),
        ensureAudioNodeForElement: vi.fn(() => false),
        detachAudioNode: vi.fn(),
        preparePreviewAudioNodesForTime: vi.fn(() => ({
          activeVideoId: null,
          audibleSourceCount: 0,
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

    return { canvasContext, hook };
  }

  it('paused seek 後は active video 準備完了を待ってから再生を始める', async () => {
    const { videoElement, requestAnimationFrameSpy, setCurrentTime, play, hook } =
      setupPreviewEngineHarness();

    const startPromise = hook.result.current.startEngine(2, false);
    await Promise.resolve();

    expect(videoElement.play).not.toHaveBeenCalled();
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();

    videoElement.seeking = false;
    videoElement.readyState = 2;
    videoElement.dispatch('seeked');

    await vi.advanceTimersByTimeAsync(TEST_PREVIEW_START_SETTLE_MS);
    await startPromise;

    expect(videoElement.play).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    expect(setCurrentTime).toHaveBeenCalledWith(2);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('stop 後の先頭再生でも active video 準備完了を待ってから再生を始める', async () => {
    const { mediaItem, videoElement, requestAnimationFrameSpy, setCurrentTime, play, hook } =
      setupPreviewEngineHarness();

    const startPromise = hook.result.current.startEngine(0, false);
    await Promise.resolve();

    expect(videoElement.currentTime).toBe(mediaItem.trimStart);
    expect(videoElement.play).not.toHaveBeenCalled();
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();

    videoElement.seeking = false;
    videoElement.readyState = 2;
    videoElement.dispatch('seeked');

    await vi.advanceTimersByTimeAsync(TEST_PREVIEW_START_SETTLE_MS);
    await startPromise;

    expect(videoElement.play).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    expect(setCurrentTime).toHaveBeenCalledWith(0);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('Android preview startEngine は BGM があっても active video 開始後に audio-only prime を試す', async () => {
    const bgm: AudioTrack = {
      file: new File([''], 'bgm.mp3', { type: 'audio/mpeg' }),
      url: 'blob:bgm',
      volume: 1,
      delay: 0,
      startPoint: 0,
      duration: 10,
      fadeIn: false,
      fadeOut: false,
      fadeInDuration: 1,
      fadeOutDuration: 1,
      isAi: false,
    };
    const { videoElement, requestAnimationFrameSpy, primePreviewAudioOnlyTracksAtTime, hook } =
      setupPreviewEngineHarness({ bgm });

    const startPromise = hook.result.current.startEngine(0, false);
    await Promise.resolve();

    videoElement.seeking = false;
    videoElement.readyState = 2;
    videoElement.dispatch('seeked');

    await vi.advanceTimersByTimeAsync(TEST_PREVIEW_START_SETTLE_MS);
    await startPromise;

    expect(videoElement.play).toHaveBeenCalledTimes(1);
    expect(primePreviewAudioOnlyTracksAtTime).toHaveBeenCalledWith(0);
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
  });

  it('Android preview は trimStart あり video の先頭だけ currentTime を厳しめに合わせて描画を hold する', () => {
    const imageItem = createImageItem({ id: 'image-gap', duration: 1 });
    const videoItem = createVideoItem({
      id: 'video-2',
      duration: 2,
      trimStart: 1.2,
      trimEnd: 3.2,
    });
    const videoElement = createMockVideoElement();
    videoElement.readyState = 1;
    videoElement.seeking = false;
    videoElement.paused = false;
    videoElement.currentTime = 1.36;

    const { canvasContext, hook } = setupRenderFrameHarness({
      mediaItems: [imageItem, videoItem],
      mediaElements: {
        [videoItem.id]: videoElement as unknown as HTMLVideoElement,
      } as MediaElementsRef,
    });

    const timelineTime = 1.1;
    const expectedTime = videoItem.trimStart + (timelineTime - imageItem.duration);
    const didUpdateCanvas = hook.result.current.renderFrame(timelineTime, true, false);

    expect(videoElement.currentTime).toBeCloseTo(expectedTime);
    expect(canvasContext.fillRect).not.toHaveBeenCalled();
    expect(canvasContext.drawImage).not.toHaveBeenCalled();
    expect(didUpdateCanvas).toBe(false);
  });

  it('Android preview は video -> trimmed video の先頭でも currentTime を合わせて描画を hold する', () => {
    const leadVideo = createVideoItem({
      id: 'video-1',
      duration: 1,
      trimStart: 0,
      trimEnd: 1,
    });
    const trimmedVideo = createVideoItem({
      id: 'video-2',
      duration: 2,
      trimStart: 1.2,
      trimEnd: 3.2,
    });
    const leadVideoElement = createMockVideoElement();
    leadVideoElement.readyState = 2;
    leadVideoElement.seeking = false;
    leadVideoElement.paused = false;
    const trimmedVideoElement = createMockVideoElement();
    trimmedVideoElement.readyState = 1;
    trimmedVideoElement.seeking = false;
    trimmedVideoElement.paused = false;
    trimmedVideoElement.currentTime = 1.7;

    const { canvasContext, hook } = setupRenderFrameHarness({
      mediaItems: [leadVideo, trimmedVideo],
      mediaElements: {
        [leadVideo.id]: leadVideoElement as unknown as HTMLVideoElement,
        [trimmedVideo.id]: trimmedVideoElement as unknown as HTMLVideoElement,
      } as MediaElementsRef,
    });

    const timelineTime = 1.2;
    const expectedTime = trimmedVideo.trimStart + (timelineTime - leadVideo.duration);
    const didUpdateCanvas = hook.result.current.renderFrame(timelineTime, true, false);

    expect(trimmedVideoElement.currentTime).toBeCloseTo(expectedTime);
    expect(canvasContext.fillRect).not.toHaveBeenCalled();
    expect(canvasContext.drawImage).not.toHaveBeenCalled();
    expect(didUpdateCanvas).toBe(false);
  });

  it('Android preview は clip 終端 0.6 秒だけ次の video を trimStart に preseek する', () => {
    const imageItem = createImageItem({ id: 'image-gap', duration: 1 });
    const videoItem = createVideoItem({
      id: 'video-2',
      duration: 2,
      trimStart: 1.2,
      trimEnd: 3.2,
    });
    const videoElement = createMockVideoElement();
    videoElement.readyState = 1;
    videoElement.seeking = false;
    videoElement.paused = true;
    videoElement.currentTime = 0.2;

    const { hook } = setupRenderFrameHarness({
      mediaItems: [imageItem, videoItem],
      mediaElements: {
        [videoItem.id]: videoElement as unknown as HTMLVideoElement,
      } as MediaElementsRef,
    });

    hook.result.current.renderFrame(0.75, true, false);

    expect(videoElement.currentTime).toBeCloseTo(videoItem.trimStart);
  });

  it('Android preview の next video preseek は video -> video かつ trimStart=0 でも残り 0.6 秒で発火する', () => {
    const currentVideo = createVideoItem({
      id: 'video-1',
      duration: 1,
      trimStart: 0,
      trimEnd: 1,
    });
    const videoItem = createVideoItem({
      id: 'video-2',
      duration: 2,
      trimStart: 0,
      trimEnd: 2,
    });
    const currentVideoElement = createMockVideoElement();
    currentVideoElement.readyState = 2;
    currentVideoElement.seeking = false;
    currentVideoElement.paused = false;
    const videoElement = createMockVideoElement();
    videoElement.readyState = 2;
    videoElement.seeking = false;
    videoElement.paused = false;
    videoElement.currentTime = 0.4;

    const { hook } = setupRenderFrameHarness({
      mediaItems: [currentVideo, videoItem],
      mediaElements: {
        [currentVideo.id]: currentVideoElement as unknown as HTMLVideoElement,
        [videoItem.id]: videoElement as unknown as HTMLVideoElement,
      } as MediaElementsRef,
    });

    hook.result.current.renderFrame(0.4, true, false);

    expect(videoElement.currentTime).toBeCloseTo(0);
  });

  it('Android preview の next trimmed video preseek は clip 終端 0.6 秒の外では発火しない', () => {
    const imageItem = createImageItem({ id: 'image-gap', duration: 1 });
    const videoItem = createVideoItem({
      id: 'video-2',
      duration: 2,
      trimStart: 1.2,
      trimEnd: 3.2,
    });
    const videoElement = createMockVideoElement();
    videoElement.readyState = 2;
    videoElement.seeking = false;
    videoElement.paused = false;
    videoElement.currentTime = 0.2;

    const { hook } = setupRenderFrameHarness({
      mediaItems: [imageItem, videoItem],
      mediaElements: {
        [videoItem.id]: videoElement as unknown as HTMLVideoElement,
      } as MediaElementsRef,
    });

    hook.result.current.renderFrame(0.39, true, false);

    expect(videoElement.currentTime).toBeCloseTo(0.2);
  });

  it('Android preview の next trimmed video preseek は metadata 未取得や seeking 中には currentTime を動かさない', () => {
    const imageItem = createImageItem({ id: 'image-gap', duration: 1 });
    const videoItem = createVideoItem({
      id: 'video-2',
      duration: 2,
      trimStart: 1.2,
      trimEnd: 3.2,
    });

    const notReadyVideo = createMockVideoElement();
    notReadyVideo.readyState = 0;
    notReadyVideo.seeking = false;
    notReadyVideo.paused = true;
    notReadyVideo.currentTime = 0.2;

    const notReadyHarness = setupRenderFrameHarness({
      mediaItems: [imageItem, videoItem],
      mediaElements: {
        [videoItem.id]: notReadyVideo as unknown as HTMLVideoElement,
      } as MediaElementsRef,
    });

    notReadyHarness.hook.result.current.renderFrame(0.75, true, false);

    expect(notReadyVideo.load).toHaveBeenCalledTimes(1);
    expect(notReadyVideo.currentTime).toBeCloseTo(0.2);

    const seekingVideo = createMockVideoElement();
    seekingVideo.readyState = 1;
    seekingVideo.seeking = true;
    seekingVideo.paused = true;
    seekingVideo.currentTime = 0.4;

    const seekingHarness = setupRenderFrameHarness({
      mediaItems: [imageItem, videoItem],
      mediaElements: {
        [videoItem.id]: seekingVideo as unknown as HTMLVideoElement,
      } as MediaElementsRef,
    });

    seekingHarness.hook.result.current.renderFrame(0.75, true, false);

    expect(seekingVideo.currentTime).toBeCloseTo(0.4);
  });

  it('Android preview は image -> trimStart あり video がまだ描画不能なら直前フレーム保持を優先する', () => {
    const imageItem = createImageItem({ id: 'image-gap', duration: 1 });
    const videoItem = createVideoItem({
      id: 'video-2',
      duration: 2,
      trimStart: 1.2,
      trimEnd: 3.2,
    });
    const videoElement = createMockVideoElement();
    videoElement.readyState = 1;
    videoElement.seeking = true;
    videoElement.paused = false;
    videoElement.currentTime = 1.3;

    const { canvasContext, hook } = setupRenderFrameHarness({
      mediaItems: [imageItem, videoItem],
      mediaElements: {
        [videoItem.id]: videoElement as unknown as HTMLVideoElement,
      } as MediaElementsRef,
    });

    const didUpdateCanvas = hook.result.current.renderFrame(1.1, true, false);

    expect(videoElement.currentTime).toBeCloseTo(1.3);
    expect(canvasContext.fillRect).not.toHaveBeenCalled();
    expect(canvasContext.drawImage).not.toHaveBeenCalled();
    expect(didUpdateCanvas).toBe(false);
  });

  it('Android preview の trimStart あり video 安定化は先頭 0.25 秒だけに限定する', () => {
    const imageItem = createImageItem({ id: 'image-gap', duration: 1 });
    const videoItem = createVideoItem({
      id: 'video-2',
      duration: 2,
      trimStart: 1.2,
      trimEnd: 3.2,
    });

    const insideWindowVideo = createMockVideoElement();
    insideWindowVideo.readyState = 1;
    insideWindowVideo.seeking = false;
    insideWindowVideo.paused = false;
    insideWindowVideo.currentTime = 1.6;

    const insideHarness = setupRenderFrameHarness({
      mediaItems: [imageItem, videoItem],
      mediaElements: {
        [videoItem.id]: insideWindowVideo as unknown as HTMLVideoElement,
      } as MediaElementsRef,
    });

    const insideTimelineTime = 1.19;
    const insideExpectedTime = videoItem.trimStart + (insideTimelineTime - imageItem.duration);
    insideHarness.hook.result.current.renderFrame(insideTimelineTime, true, false);

    expect(insideWindowVideo.currentTime).toBeCloseTo(insideExpectedTime);

    const outsideWindowVideo = createMockVideoElement();
    outsideWindowVideo.readyState = 1;
    outsideWindowVideo.seeking = false;
    outsideWindowVideo.paused = false;
    outsideWindowVideo.currentTime = 1.6;

    const outsideHarness = setupRenderFrameHarness({
      mediaItems: [imageItem, videoItem],
      mediaElements: {
        [videoItem.id]: outsideWindowVideo as unknown as HTMLVideoElement,
      } as MediaElementsRef,
    });

    outsideHarness.hook.result.current.renderFrame(1.26, true, false);

    expect(outsideWindowVideo.currentTime).toBeCloseTo(1.6);
  });

});
