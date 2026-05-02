import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';

import * as playbackClock from '../flavors/standard/preview/playbackClock';
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

function createMockMediaElement(tagName: 'VIDEO' | 'AUDIO') {
  const listeners = new Map<string, Set<EventListener>>();

  const element = {
    tagName,
    readyState: tagName === 'VIDEO' ? 1 : 4,
    seeking: tagName === 'VIDEO',
    paused: true,
    currentTime: 0,
    duration: 12,
    ended: false,
    error: null,
    videoWidth: tagName === 'VIDEO' ? 1280 : 0,
    videoHeight: tagName === 'VIDEO' ? 720 : 0,
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

function createMockVideoElement() {
  return createMockMediaElement('VIDEO');
}

function createMockAudioElement() {
  return createMockMediaElement('AUDIO');
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
    mediaItems?: MediaItem[];
    mediaElements?: MediaElementsRef;
    gainNodes?: Record<string, GainNode>;
    audioContext?: AudioContext | null;
    primePreviewAudioOnlyTracksAtTime?: ReturnType<typeof vi.fn<(playbackTime: number) => void>>;
    canvas?: HTMLCanvasElement | null;
    currentTime?: number;
    totalDuration?: number;
    startTime?: number;
    reqId?: number | null;
    loopId?: number;
    isPlaying?: boolean;
  }) {
    const mediaItems = options?.mediaItems ?? [createVideoItem()];
    const mediaItem = mediaItems[0];
    const videoElement = createMockVideoElement();
    const mediaElements = options?.mediaElements ?? ({
      [mediaItem.id]: videoElement as unknown as HTMLVideoElement,
    } as MediaElementsRef);
    const requestAnimationFrameSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation(() => 1);

    const previewPlatformPolicy = standardPreviewRuntime.getPreviewPlatformPolicy(
      getStandardPreviewPlatformCapabilities(createCapabilities()),
    );

    const setCurrentTime = vi.fn();
    const play = vi.fn();
    const pause = vi.fn();
    const resetInactiveVideos = vi.fn();
    const clearExport = vi.fn();
    const primePreviewAudioOnlyTracksAtTimeSpy =
      options?.primePreviewAudioOnlyTracksAtTime ?? vi.fn<(playbackTime: number) => void>();
    const totalDurationRef = createRef(
      options?.totalDuration ?? mediaItems.reduce((sum, item) => sum + item.duration, 0),
    );
    const currentTimeRef = createRef(options?.currentTime ?? 0);
    const reqIdRef = createRef<number | null>(options?.reqId ?? null);
    const startTimeRef = createRef(options?.startTime ?? 0);
    const loopIdRef = createRef(options?.loopId ?? 0);
    const isPlayingRef = createRef(options?.isPlaying ?? false);

    const hook = renderHook(() =>
      usePreviewEngine({
        captions: [] as Caption[],
        captionSettings: {} as CaptionSettings,
        mediaItemsRef: createRef(mediaItems),
        bgmRef: createRef<AudioTrack | null>(options?.bgm ?? null),
        narrationsRef: createRef<NarrationClip[]>(options?.narrations ?? []),
        captionsRef: createRef<Caption[]>([]),
        captionSettingsRef: createRef({} as CaptionSettings),
        totalDurationRef,
        currentTimeRef,
        canvasRef: createRef<HTMLCanvasElement | null>(options?.canvas ?? null),
        mediaElementsRef: createRef(mediaElements),
        audioCtxRef: createRef(options?.audioContext ?? ({
          state: 'running',
          currentTime: 0,
          destination: {},
          onstatechange: null,
          resume: vi.fn().mockResolvedValue(undefined),
          suspend: vi.fn().mockResolvedValue(undefined),
        } as unknown as AudioContext)),
        sourceNodesRef: createRef({}),
        gainNodesRef: createRef(options?.gainNodes ?? {}),
        masterDestRef: createRef(null),
        audioRoutingModeRef: createRef<'preview' | 'export'>('preview'),
        reqIdRef,
        startTimeRef,
        audioResumeWaitFramesRef: createRef(0),
        recorderRef: createRef<MediaRecorder | null>(null),
        loopIdRef,
        isPlayingRef,
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
        clearExport,
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
        primePreviewAudioOnlyTracksAtTime: primePreviewAudioOnlyTracksAtTimeSpy,
        resetInactiveVideos,
        startWebCodecsExport: vi.fn(),
        stopWebCodecsExport: vi.fn(),
        completeWebCodecsExport: vi.fn(),
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
      pause,
      clearExport,
      currentTimeRef,
      reqIdRef,
      loopIdRef,
      totalDurationRef,
      resetInactiveVideos,
      primePreviewAudioOnlyTracksAtTime: primePreviewAudioOnlyTracksAtTimeSpy,
      hook,
    };
  }

  function setupRenderFrameHarness(options?: {
    bgm?: AudioTrack | null;
    narrations?: NarrationClip[];
    mediaItems?: MediaItem[];
    mediaElements?: MediaElementsRef;
    gainNodes?: Record<string, GainNode>;
    audioContext?: AudioContext | null;
    currentTime?: number;
    totalDuration?: number;
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
        bgmRef: createRef<AudioTrack | null>(options?.bgm ?? null),
        narrationsRef: createRef<NarrationClip[]>(options?.narrations ?? []),
        captionsRef: createRef<Caption[]>([]),
        captionSettingsRef: createRef({} as CaptionSettings),
        totalDurationRef: createRef(
          options?.totalDuration ?? mediaItems.reduce((sum, item) => sum + item.duration, 0),
        ),
        currentTimeRef: createRef(options?.currentTime ?? 0),
        canvasRef: createRef({
          getContext: vi.fn(() => canvasContext),
        } as unknown as HTMLCanvasElement),
        mediaElementsRef: createRef(mediaElements),
        audioCtxRef: createRef(options?.audioContext ?? null),
        sourceNodesRef: createRef({}),
        gainNodesRef: createRef(options?.gainNodes ?? {}),
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
        completeWebCodecsExport: vi.fn(),
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

  it('preview 再生開始では exportUrl を clear しない', async () => {
    const { clearExport, hook } = setupPreviewEngineHarness();

    void hook.result.current.startEngine(1, false);
    await Promise.resolve();

    expect(clearExport).not.toHaveBeenCalled();
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

  it('preview loop は totalDuration 手前で終端停止し BGM と narration も同時停止する', () => {
    const mediaItem = createVideoItem({ id: 'video-1', duration: 6, trimStart: 0, trimEnd: 6 });
    const canvasContext = createMockCanvasContext();
    const bgmElement = createMockAudioElement();
    bgmElement.paused = false;
    const narrationElement = createMockAudioElement();
    narrationElement.paused = false;
    const videoElement = createMockVideoElement();
    videoElement.readyState = 2;
    videoElement.seeking = false;
    videoElement.paused = false;
    const canvas = {
      getContext: vi.fn(() => canvasContext),
    } as unknown as HTMLCanvasElement;

    const cancelAnimationFrameSpy = vi
      .spyOn(globalThis, 'cancelAnimationFrame')
      .mockImplementation(() => {});
    vi.spyOn(playbackClock, 'getStandardPreviewNow').mockReturnValue(5980);

    const bgmGain = {
      gain: {
        value: 1,
        setTargetAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
    } as unknown as GainNode;

    const { hook, pause, currentTimeRef, reqIdRef, loopIdRef, setCurrentTime, requestAnimationFrameSpy } =
      setupPreviewEngineHarness({
        mediaItems: [mediaItem],
        bgm: {
          file: new File([''], 'bgm.mp3', { type: 'audio/mpeg' }),
          url: 'blob:bgm',
          volume: 1,
          delay: 0,
          startPoint: 0,
          duration: 6,
          fadeIn: false,
          fadeOut: true,
          fadeInDuration: 1,
          fadeOutDuration: 1,
          isAi: false,
        },
        mediaElements: {
          [mediaItem.id]: videoElement as unknown as HTMLVideoElement,
          bgm: bgmElement as unknown as HTMLAudioElement,
          'narration:test': narrationElement as unknown as HTMLAudioElement,
        } as MediaElementsRef,
        gainNodes: { bgm: bgmGain },
        audioContext: {
          state: 'running',
          currentTime: 12,
          destination: {},
          onstatechange: null,
          resume: vi.fn().mockResolvedValue(undefined),
          suspend: vi.fn().mockResolvedValue(undefined),
        } as unknown as AudioContext,
        canvas,
        currentTime: 5.95,
        totalDuration: 6,
        startTime: 0,
        reqId: 91,
        loopId: 1,
        isPlaying: true,
      });

    hook.result.current.loop(false, 1);

    expect(setCurrentTime).toHaveBeenCalledWith(6);
    expect(currentTimeRef.current).toBe(6);
    expect(canvas.getContext).toHaveBeenCalledWith('2d');
    expect(videoElement.currentTime).toBeCloseTo(5.999, 3);
    expect(videoElement.pause).toHaveBeenCalled();
    expect(bgmElement.pause).toHaveBeenCalled();
    expect(narrationElement.pause).toHaveBeenCalled();
    expect(videoElement.volume).toBe(1);
    expect(bgmElement.volume).toBe(0);
    expect(narrationElement.volume).toBe(1);
    expect(bgmGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 12);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(91);
    expect(reqIdRef.current).toBeNull();
    expect(loopIdRef.current).toBe(2);
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
  });

  it('preview loop は終端閾値より手前では次の requestAnimationFrame を継続する', () => {
    const mediaItem = createVideoItem({ id: 'video-1', duration: 6, trimStart: 0, trimEnd: 6 });
    const bgmElement = createMockAudioElement();
    bgmElement.paused = false;
    const narrationElement = createMockAudioElement();
    narrationElement.paused = false;
    const videoElement = createMockVideoElement();
    videoElement.readyState = 2;
    videoElement.seeking = false;
    videoElement.paused = false;

    const cancelAnimationFrameSpy = vi
      .spyOn(globalThis, 'cancelAnimationFrame')
      .mockImplementation(() => {});
    vi.spyOn(playbackClock, 'getStandardPreviewNow').mockReturnValue(5960);

    const { hook, pause, currentTimeRef, reqIdRef, loopIdRef, setCurrentTime, requestAnimationFrameSpy } =
      setupPreviewEngineHarness({
        mediaItems: [mediaItem],
        mediaElements: {
          [mediaItem.id]: videoElement as unknown as HTMLVideoElement,
          bgm: bgmElement as unknown as HTMLAudioElement,
          'narration:test': narrationElement as unknown as HTMLAudioElement,
        } as MediaElementsRef,
        currentTime: 5.95,
        totalDuration: 6,
        startTime: 0,
        reqId: 91,
        loopId: 1,
        isPlaying: true,
      });

    hook.result.current.loop(false, 1);

    expect(setCurrentTime).toHaveBeenCalledWith(5.96);
    expect(currentTimeRef.current).toBe(5.96);
    expect(videoElement.pause).not.toHaveBeenCalled();
    expect(bgmElement.pause).not.toHaveBeenCalled();
    expect(narrationElement.pause).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    expect(cancelAnimationFrameSpy).not.toHaveBeenCalled();
    expect(reqIdRef.current).toBe(1);
    expect(loopIdRef.current).toBe(1);
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
  });

  it('renderFrame は standard preview 中の BGM fadeIn / fadeOut volume を毎フレーム反映する', () => {
    const mediaItem = createVideoItem({ id: 'video-1', duration: 10, trimStart: 0, trimEnd: 10 });
    const videoElement = createMockVideoElement();
    videoElement.readyState = 2;
    videoElement.seeking = false;
    const bgmElement = createMockAudioElement();
    const bgmGain = {
      gain: {
        value: 1,
        setTargetAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
    } as unknown as GainNode;
    const audioContext = {
      state: 'running',
      currentTime: 7,
      destination: {},
      onstatechange: null,
      resume: vi.fn().mockResolvedValue(undefined),
      suspend: vi.fn().mockResolvedValue(undefined),
    } as unknown as AudioContext;
    const bgm: AudioTrack = {
      file: new File([''], 'bgm.mp3', { type: 'audio/mpeg' }),
      url: 'blob:bgm',
      volume: 0.8,
      delay: 1,
      startPoint: 0,
      duration: 10,
      fadeIn: true,
      fadeOut: true,
      fadeInDuration: 2,
      fadeOutDuration: 2,
      isAi: false,
    };

    const { hook } = setupRenderFrameHarness({
      bgm,
      mediaItems: [mediaItem],
      mediaElements: {
        [mediaItem.id]: videoElement as unknown as HTMLVideoElement,
        bgm: bgmElement as unknown as HTMLAudioElement,
      } as MediaElementsRef,
      gainNodes: { bgm: bgmGain },
      audioContext,
      totalDuration: 10,
    });

    hook.result.current.renderFrame(2, true, false);
    expect(bgmElement.volume).toBeLessThanOrEqual(1);
    expect(bgmGain.gain.setValueAtTime).toHaveBeenLastCalledWith(0.4, 7);

    hook.result.current.renderFrame(9, true, false);
    expect(bgmElement.volume).toBeLessThanOrEqual(1);
    expect(bgmGain.gain.setValueAtTime).toHaveBeenLastCalledWith(0.4, 7);

    hook.result.current.renderFrame(10, true, false);
    expect(bgmElement.volume).toBeLessThanOrEqual(1);
    expect(bgmGain.gain.setValueAtTime).toHaveBeenLastCalledWith(0.4, 7);
  });

  it('renderFrame は BGM 100%超を WebAudio gain で維持しつつ native volume は 1 に抑える', () => {
    const mediaItem = createVideoItem({ id: 'video-1', duration: 10, trimStart: 0, trimEnd: 10 });
    const videoElement = createMockVideoElement();
    videoElement.readyState = 2;
    videoElement.seeking = false;
    const bgmElement = createMockAudioElement();
    const bgmGain = {
      gain: {
        value: 1,
        setTargetAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
    } as unknown as GainNode;
    const audioContext = {
      state: 'running',
      currentTime: 7,
      destination: {},
      onstatechange: null,
      resume: vi.fn().mockResolvedValue(undefined),
      suspend: vi.fn().mockResolvedValue(undefined),
    } as unknown as AudioContext;
    const bgm: AudioTrack = {
      file: new File([''], 'bgm.mp3', { type: 'audio/mpeg' }),
      url: 'blob:bgm',
      volume: 2.5,
      delay: 0,
      startPoint: 0,
      duration: 10,
      fadeIn: false,
      fadeOut: false,
      fadeInDuration: 0,
      fadeOutDuration: 0,
      isAi: false,
    };

    const { hook } = setupRenderFrameHarness({
      bgm,
      mediaItems: [mediaItem],
      mediaElements: {
        [mediaItem.id]: videoElement as unknown as HTMLVideoElement,
        bgm: bgmElement as unknown as HTMLAudioElement,
      } as MediaElementsRef,
      gainNodes: { bgm: bgmGain },
      audioContext,
      totalDuration: 10,
    });

    hook.result.current.renderFrame(5, true, false);

    expect(bgmElement.volume).toBeLessThanOrEqual(1);
    expect(bgmGain.gain.setValueAtTime).toHaveBeenLastCalledWith(2.5, 7);
  });

  it('renderFrame は narration 100%超を WebAudio gain で維持しつつ native volume は 1 に抑える', () => {
    const mediaItem = createVideoItem({ id: 'video-1', duration: 10, trimStart: 0, trimEnd: 10 });
    const videoElement = createMockVideoElement();
    videoElement.readyState = 2;
    videoElement.seeking = false;
    const narrationElement = createMockAudioElement();
    const narrationGain = {
      gain: {
        value: 1,
        setTargetAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
    } as unknown as GainNode;
    const audioContext = {
      state: 'running',
      currentTime: 7,
      destination: {},
      onstatechange: null,
      resume: vi.fn().mockResolvedValue(undefined),
      suspend: vi.fn().mockResolvedValue(undefined),
    } as unknown as AudioContext;
    const narration: NarrationClip = {
      id: 'nar-1',
      sourceType: 'file',
      file: new File([''], 'narration.mp3', { type: 'audio/mpeg' }),
      url: 'blob:narration',
      startTime: 0,
      volume: 2.5,
      isMuted: false,
      trimStart: 0,
      trimEnd: 10,
      duration: 10,
      isAiEditable: false,
    };

    const { hook } = setupRenderFrameHarness({
      narrations: [narration],
      mediaItems: [mediaItem],
      mediaElements: {
        [mediaItem.id]: videoElement as unknown as HTMLVideoElement,
        'narration:nar-1': narrationElement as unknown as HTMLAudioElement,
      } as MediaElementsRef,
      gainNodes: { 'narration:nar-1': narrationGain },
      audioContext,
      totalDuration: 10,
    });

    hook.result.current.renderFrame(5, true, false);

    expect(narrationElement.volume).toBe(1);
    expect(narrationGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(2.5, 7, 0.1);
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
    const didUpdateCanvas = hook.result.current.renderFrame(timelineTime, true, false);

    expect(videoElement.currentTime).toBeCloseTo(1.36);
    expect(canvasContext.fillRect).not.toHaveBeenCalled();
    expect(canvasContext.drawImage).not.toHaveBeenCalled();
    expect(didUpdateCanvas).toBe(false);
  });

  it('Android preview は video -> trimmed video の先頭で hard seek せず描画 hold を優先する', () => {
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
    const didUpdateCanvas = hook.result.current.renderFrame(timelineTime, true, false);

    expect(trimmedVideoElement.currentTime).toBeCloseTo(1.7);
    expect(canvasContext.fillRect).not.toHaveBeenCalled();
    expect(canvasContext.drawImage).not.toHaveBeenCalled();
    expect(didUpdateCanvas).toBe(false);
  });

  it('Android preview は clip 境界前でも次の video を preseek しない', () => {
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

    expect(videoElement.currentTime).toBeCloseTo(0.2);
  });

  it('Android preview の next video preseek は trimStart=0 では発火しない', () => {
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

    expect(videoElement.currentTime).toBeCloseTo(0.4);
  });

  it('Android preview の next video preseek は image gap を挟むケースでも無効のままにする', () => {
    const currentVideo = createVideoItem({
      id: 'video-1',
      duration: 1,
      trimStart: 0,
      trimEnd: 1,
    });
    const imageGap = createImageItem({
      id: 'image-gap',
      duration: 1,
    });
    const nextVideo = createVideoItem({
      id: 'video-2',
      duration: 2,
      trimStart: 1.4,
      trimEnd: 3.4,
    });
    const farVideo = createVideoItem({
      id: 'video-3',
      duration: 2,
      trimStart: 0.8,
      trimEnd: 2.8,
    });
    const currentVideoElement = createMockVideoElement();
    currentVideoElement.readyState = 2;
    currentVideoElement.seeking = false;
    currentVideoElement.paused = false;
    const nextVideoElement = createMockVideoElement();
    nextVideoElement.readyState = 2;
    nextVideoElement.seeking = false;
    nextVideoElement.paused = true;
    nextVideoElement.currentTime = 0.1;
    const farVideoElement = createMockVideoElement();
    farVideoElement.readyState = 2;
    farVideoElement.seeking = false;
    farVideoElement.paused = true;
    farVideoElement.currentTime = 0.2;

    const { hook } = setupRenderFrameHarness({
      mediaItems: [currentVideo, imageGap, nextVideo, farVideo],
      mediaElements: {
        [currentVideo.id]: currentVideoElement as unknown as HTMLVideoElement,
        [nextVideo.id]: nextVideoElement as unknown as HTMLVideoElement,
        [farVideo.id]: farVideoElement as unknown as HTMLVideoElement,
      } as MediaElementsRef,
    });

    hook.result.current.renderFrame(0.5, true, false);

    expect(nextVideoElement.currentTime).toBeCloseTo(0.1);
    expect(farVideoElement.currentTime).toBeCloseTo(0.2);
  });

  it('Android preview の next trimmed video preseek は clip 開始直後でも発火しない', () => {
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

    hook.result.current.renderFrame(0.19, true, false);

    expect(videoElement.currentTime).toBeCloseTo(0.2);
  });

  it('Android preview の next trimmed video preseek は無効化され currentTime を連続変更しない', () => {
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
    videoElement.paused = true;
    let assignedCurrentTime = 0.2;
    let seekAssignCount = 0;
    Object.defineProperty(videoElement, 'currentTime', {
      configurable: true,
      get: () => assignedCurrentTime,
      set: (value: number) => {
        assignedCurrentTime = value;
        seekAssignCount += 1;
      },
    });

    const { hook } = setupRenderFrameHarness({
      mediaItems: [imageItem, videoItem],
      mediaElements: {
        [videoItem.id]: videoElement as unknown as HTMLVideoElement,
      } as MediaElementsRef,
    });

    hook.result.current.renderFrame(0.75, true, false);
    hook.result.current.renderFrame(0.76, true, false);

    expect(assignedCurrentTime).toBeCloseTo(0.2);
    expect(seekAssignCount).toBe(0);
  });

  it('Android preview の next trimmed video preseek 無効化後も metadata 未取得や seeking 中に currentTime を動かさない', () => {
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

    expect(notReadyVideo.load).toHaveBeenCalledTimes(0);
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

  it('Android preview startEngine は inactive reset に直近の次 video だけを渡す', async () => {
    const currentVideo = createVideoItem({
      id: 'video-1',
      duration: 1,
      trimStart: 0,
      trimEnd: 1,
    });
    const imageGap = createImageItem({
      id: 'image-gap',
      duration: 1,
    });
    const nextVideo = createVideoItem({
      id: 'video-2',
      duration: 2,
      trimStart: 1.25,
      trimEnd: 3.25,
    });
    const farVideo = createVideoItem({
      id: 'video-3',
      duration: 2,
      trimStart: 0.5,
      trimEnd: 2.5,
    });
    const activeVideoElement = createMockVideoElement();
    activeVideoElement.readyState = 2;
    activeVideoElement.seeking = false;
    activeVideoElement.currentTime = 0.5;
    const nextVideoElement = createMockVideoElement();
    nextVideoElement.readyState = 2;
    nextVideoElement.seeking = false;
    const farVideoElement = createMockVideoElement();
    farVideoElement.readyState = 2;
    farVideoElement.seeking = false;

    const { hook, resetInactiveVideos } = setupPreviewEngineHarness({
      mediaItems: [currentVideo, imageGap, nextVideo, farVideo],
      mediaElements: {
        [currentVideo.id]: activeVideoElement as unknown as HTMLVideoElement,
        [nextVideo.id]: nextVideoElement as unknown as HTMLVideoElement,
        [farVideo.id]: farVideoElement as unknown as HTMLVideoElement,
      } as MediaElementsRef,
    });

    const startPromise = hook.result.current.startEngine(0.5, false);
    await vi.runAllTimersAsync();
    await startPromise;

    expect(resetInactiveVideos).toHaveBeenCalledWith({
      nextVideoId: nextVideo.id,
      protectedVideoIds: [currentVideo.id, nextVideo.id],
      isAndroidPreview: true,
    });
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

    const insideTimelineTime = 1.25;
    insideHarness.hook.result.current.renderFrame(insideTimelineTime, true, false);

    expect(insideWindowVideo.currentTime).toBeCloseTo(1.6);

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

  it('export モードでタイムライン終端に達したとき completeWebCodecsExport を呼び stopWebCodecsExport を呼ばない', () => {
    // タイムライン終端で stopAll() → stopWebCodecsExport({ reason: 'user' }) が誤呼び出しされ
    // blob 生成後の callback が抑止される問題の回帰テスト。
    const mediaItem = createVideoItem({ id: 'video-1', duration: 6, trimStart: 0, trimEnd: 6 });
    const videoElement = createMockVideoElement();
    videoElement.readyState = 2;
    videoElement.seeking = false;

    // now=6000ms, startTime=0ms → clampedElapsed = 6 = totalDuration → 終端判定
    vi.spyOn(playbackClock, 'getStandardPreviewNow').mockReturnValue(6000);

    const completeWebCodecsExport = vi.fn();
    const stopWebCodecsExport = vi.fn();

    renderHook(() =>
      usePreviewEngine({
        captions: [] as Caption[],
        captionSettings: {} as CaptionSettings,
        mediaItemsRef: createRef([mediaItem]),
        bgmRef: createRef<AudioTrack | null>(null),
        narrationsRef: createRef<NarrationClip[]>([]),
        captionsRef: createRef<Caption[]>([]),
        captionSettingsRef: createRef({} as CaptionSettings),
        totalDurationRef: createRef(6),
        currentTimeRef: createRef(0),
        canvasRef: createRef({
          getContext: vi.fn(() => createMockCanvasContext()),
        } as unknown as HTMLCanvasElement),
        mediaElementsRef: createRef({ [mediaItem.id]: videoElement as unknown as HTMLVideoElement } as MediaElementsRef),
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
        previewPlatformPolicy: standardPreviewRuntime.getPreviewPlatformPolicy(
          getStandardPreviewPlatformCapabilities(createCapabilities()),
        ),
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
          activeVideoId: mediaItem.id,
          audibleSourceCount: 1,
          requiresWebAudio: false,
        })),
        preparePreviewAudioNodesForUpcomingVideos: vi.fn(),
        primePreviewAudioOnlyTracksAtTime: vi.fn(),
        resetInactiveVideos: vi.fn(),
        startWebCodecsExport: vi.fn(),
        stopWebCodecsExport,
        completeWebCodecsExport,
        logInfo: vi.fn(),
        logWarn: vi.fn(),
        logDebug: vi.fn(),
      }),
    ).result.current.loop(true, 1);

    expect(completeWebCodecsExport).toHaveBeenCalledTimes(1);
    expect(stopWebCodecsExport).not.toHaveBeenCalled();
  });

});
