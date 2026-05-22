import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';

import { usePreviewEngine } from '../flavors/apple-safari/preview/usePreviewEngine';
import {
  appleSafariPreviewRuntime,
  getAppleSafariPreviewPlatformCapabilities,
} from '../flavors/apple-safari/appleSafariPreviewRuntime';
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
    maxTouchPoints: 1,
    isAndroid: false,
    isIOS: true,
    isSafari: true,
    isIosSafari: true,
    supportsShowSaveFilePicker: false,
    supportsShowOpenFilePicker: false,
    supportsTrackProcessor: false,
    supportsMp4MediaRecorder: true,
    audioContextMayInterrupt: true,
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
    url: overrides.url ?? `blob:${overrides.id ?? 'video-1'}`,
    volume: overrides.volume ?? 1,
    isMuted: overrides.isMuted ?? false,
    fadeIn: overrides.fadeIn ?? false,
    fadeOut: overrides.fadeOut ?? false,
    fadeInDuration: overrides.fadeInDuration ?? 1,
    fadeOutDuration: overrides.fadeOutDuration ?? 1,
    duration: overrides.duration ?? 2,
    originalDuration: overrides.originalDuration ?? (overrides.duration ?? 2),
    trimStart: overrides.trimStart ?? 0,
    trimEnd: overrides.trimEnd ?? (overrides.duration ?? 2),
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
    url: overrides.url ?? `blob:${overrides.id ?? 'image-1'}`,
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
    tagName: 'VIDEO' as const,
    readyState: 0,
    seeking: false,
    paused: true,
    currentTime: 0,
    duration: 2,
    ended: false,
    error: null,
    videoWidth: 1280,
    videoHeight: 720,
    defaultMuted: false,
    muted: false,
    preload: 'metadata',
    playsInline: true,
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
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
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
    canvas: { width: 1280, height: 720 },
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    globalAlpha: 1,
    fillStyle: '#000000',
  } as unknown as CanvasRenderingContext2D;
}

describe('apple-safari preview engine boundary kick', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setupRenderFrameHarness(options: {
    mediaItems: MediaItem[];
    mediaElements: MediaElementsRef;
    activeVideoIdRef?: MutableRefObject<string | null>;
    isPlayingRef?: MutableRefObject<boolean>;
    isSeekingRef?: MutableRefObject<boolean>;
  }) {
    const canvasContext = createMockCanvasContext();
    const logInfo = vi.fn();
    const logWarn = vi.fn();
    const platformCapabilities = getAppleSafariPreviewPlatformCapabilities(createCapabilities());
    const previewPlatformPolicy = appleSafariPreviewRuntime.getPreviewPlatformPolicy(
      platformCapabilities,
    );
    const totalDuration = options.mediaItems.reduce((sum, item) => sum + item.duration, 0);
    const activeVideoIdRef = options.activeVideoIdRef ?? createRef<string | null>(null);
    const isPlayingRef = options.isPlayingRef ?? createRef(true);
    const isSeekingRef = options.isSeekingRef ?? createRef(false);

    const hook = renderHook(() =>
      usePreviewEngine({
        captions: [] as Caption[],
        captionSettings: { enabled: false } as unknown as CaptionSettings,
        mediaItemsRef: createRef(options.mediaItems),
        bgmRef: createRef<AudioTrack | null>(null),
        narrationsRef: createRef<NarrationClip[]>([]),
        captionsRef: createRef<Caption[]>([]),
        captionSettingsRef: createRef({ enabled: false } as unknown as CaptionSettings),
        totalDurationRef: createRef(totalDuration),
        currentTimeRef: createRef(0),
        canvasRef: createRef({
          getContext: vi.fn(() => canvasContext),
        } as unknown as HTMLCanvasElement),
        mediaElementsRef: createRef(options.mediaElements),
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
        isPlayingRef,
        isSeekingRef,
        isSeekPlaybackPreparingRef: createRef(false),
        activeVideoIdRef,
        videoRecoveryAttemptsRef: createRef({}),
        exportPlayFailedRef: createRef({}),
        exportFallbackSeekAtRef: createRef({}),
        seekingVideosRef: createRef(new Set<string>()),
        pendingSeekRef: createRef<number | null>(null),
        wasPlayingBeforeSeekRef: createRef(false),
        pendingSeekTimeoutRef: createRef<ReturnType<typeof setTimeout> | null>(null),
        previewPlaybackAttemptRef: createRef(1),
        requestPreviewAudioRouteRefreshRef: createRef(() => { }),
        primePreviewAudioOnlyTracksAtTimeRef: createRef(() => { }),
        endFinalizedRef: createRef(false),
        previewPlatformPolicy,
        platformCapabilities,
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
        logInfo,
        logWarn,
        logDebug: vi.fn(),
      }),
    );

    return { canvasContext, hook, logInfo, logWarn, activeVideoIdRef };
  }

  it('動画→動画境界で 2 本目の active video に対し 1 度だけ境界キックを掛ける', () => {
    const video1 = createVideoItem({ id: 'v1', duration: 2 });
    const video2 = createVideoItem({ id: 'v2', duration: 2 });
    const video1El = createMockVideoElement();
    const video2El = createMockVideoElement();
    // v1 は active 再生中の状態。v2 は paused / メタデータ未到達のまま放置されたケースを模す。
    video1El.readyState = 4;
    video1El.paused = false;
    video2El.readyState = 1;
    video2El.paused = true;
    video2El.currentTime = 0;

    const activeVideoIdRef = createRef<string | null>('v1');

    const { hook, logInfo } = setupRenderFrameHarness({
      mediaItems: [video1, video2],
      mediaElements: {
        [video1.id]: video1El as unknown as HTMLVideoElement,
        [video2.id]: video2El as unknown as HTMLVideoElement,
      } as MediaElementsRef,
      activeVideoIdRef,
    });

    // v2 区間 (時刻=2.05s) を描画。activeVideoIdRef が v1→v2 へ切替わるフレーム。
    hook.result.current.renderFrame(2.05, true, false);

    expect(activeVideoIdRef.current).toBe('v2');
    expect(video2El.listenerCount('loadedmetadata')).toBe(1);
    expect(video2El.listenerCount('loadeddata')).toBe(1);
    expect(video2El.listenerCount('canplay')).toBe(1);
    expect(video2El.listenerCount('seeked')).toBe(1);
    expect(
      logInfo.mock.calls.some(([, message]) => message === 'iOS Safari preview video 境界キック'),
    ).toBe(true);

    // 続けて同じフレームを再描画しても境界キックは再発火しない (1回限り)。
    const before = video2El.listenerCount('canplay');
    hook.result.current.renderFrame(2.06, true, false);
    expect(video2El.listenerCount('canplay')).toBe(before);
  });

  it('動画→画像→動画境界でも 3 本目の active video へ境界キックを掛ける', () => {
    const video1 = createVideoItem({ id: 'v1', duration: 2 });
    const imageGap = createImageItem({ id: 'img', duration: 1 });
    const video2 = createVideoItem({ id: 'v2', duration: 2 });
    const video1El = createMockVideoElement();
    const video2El = createMockVideoElement();
    video1El.readyState = 4;
    video2El.readyState = 1;
    video2El.paused = true;

    // image 区間中は activeVideoIdRef が null になっている前提から開始する。
    const activeVideoIdRef = createRef<string | null>(null);

    const { hook, logInfo } = setupRenderFrameHarness({
      mediaItems: [video1, imageGap, video2],
      mediaElements: {
        [video1.id]: video1El as unknown as HTMLVideoElement,
        [video2.id]: video2El as unknown as HTMLVideoElement,
      } as MediaElementsRef,
      activeVideoIdRef,
    });

    // v2 区間 (時刻=3.05s) を描画。null → v2 への切替で境界キックが掛かる。
    hook.result.current.renderFrame(3.05, true, false);

    expect(activeVideoIdRef.current).toBe('v2');
    expect(video2El.listenerCount('canplay')).toBe(1);
    expect(video2El.listenerCount('seeked')).toBe(1);
    expect(
      logInfo.mock.calls.some(([, message]) => message === 'iOS Safari preview video 境界キック'),
    ).toBe(true);
  });

  it('境界キックの canplay リスナー発火で 2 本目の動画を play() する', () => {
    const video1 = createVideoItem({ id: 'v1', duration: 2 });
    const video2 = createVideoItem({ id: 'v2', duration: 2 });
    const video1El = createMockVideoElement();
    const video2El = createMockVideoElement();
    video1El.readyState = 4;
    // v2 はメタデータすら無い状態 (readyState=0) で境界に到達する想定。
    video2El.readyState = 0;
    video2El.paused = true;

    const activeVideoIdRef = createRef<string | null>('v1');

    const { hook } = setupRenderFrameHarness({
      mediaItems: [video1, video2],
      mediaElements: {
        [video1.id]: video1El as unknown as HTMLVideoElement,
        [video2.id]: video2El as unknown as HTMLVideoElement,
      } as MediaElementsRef,
      activeVideoIdRef,
    });

    hook.result.current.renderFrame(2.05, true, false);

    // readyState=0 のため synchronous play() は走らない (load 戦略に委ねる)。
    expect(video2El.play).not.toHaveBeenCalled();

    // 後で canplay が届くと、境界キックで仕掛けた1回限りのリスナーが play() を呼ぶ。
    video2El.readyState = 4;
    video2El.dispatch('canplay');

    expect(video2El.play).toHaveBeenCalled();
  });

  it('エクスポート中は境界キックを掛けない', () => {
    const video1 = createVideoItem({ id: 'v1', duration: 2 });
    const video2 = createVideoItem({ id: 'v2', duration: 2 });
    const video1El = createMockVideoElement();
    const video2El = createMockVideoElement();
    video1El.readyState = 4;
    video2El.readyState = 1;

    const activeVideoIdRef = createRef<string | null>('v1');

    const { hook, logInfo } = setupRenderFrameHarness({
      mediaItems: [video1, video2],
      mediaElements: {
        [video1.id]: video1El as unknown as HTMLVideoElement,
        [video2.id]: video2El as unknown as HTMLVideoElement,
      } as MediaElementsRef,
      activeVideoIdRef,
    });

    // isExporting=true で renderFrame を呼ぶ。
    hook.result.current.renderFrame(2.05, true, true);

    expect(video2El.listenerCount('canplay')).toBe(0);
    expect(video2El.listenerCount('seeked')).toBe(0);
    expect(
      logInfo.mock.calls.some(([, message]) => message === 'iOS Safari preview video 境界キック'),
    ).toBe(false);
  });

  it('ユーザーシーク中は境界キックを掛けない', () => {
    const video1 = createVideoItem({ id: 'v1', duration: 2 });
    const video2 = createVideoItem({ id: 'v2', duration: 2 });
    const video1El = createMockVideoElement();
    const video2El = createMockVideoElement();
    video1El.readyState = 4;
    video2El.readyState = 1;

    const activeVideoIdRef = createRef<string | null>('v1');
    const isSeekingRef = createRef(true);

    const { hook, logInfo } = setupRenderFrameHarness({
      mediaItems: [video1, video2],
      mediaElements: {
        [video1.id]: video1El as unknown as HTMLVideoElement,
        [video2.id]: video2El as unknown as HTMLVideoElement,
      } as MediaElementsRef,
      activeVideoIdRef,
      isSeekingRef,
    });

    hook.result.current.renderFrame(2.05, true, false);

    expect(video2El.listenerCount('canplay')).toBe(0);
    expect(
      logInfo.mock.calls.some(([, message]) => message === 'iOS Safari preview video 境界キック'),
    ).toBe(false);
  });

  it('prewarm 済みで既に再生中の動画には境界キックを掛けない (currentTime も触らない)', () => {
    const video1 = createVideoItem({ id: 'v1', duration: 2 });
    const video2 = createVideoItem({ id: 'v2', duration: 2 });
    const video1El = createMockVideoElement();
    const video2El = createMockVideoElement();
    video1El.readyState = 4;
    video1El.paused = false;
    // v2 は無音 prewarm で既に paused=false / readyState=4 / currentTime が trimStart より先へ進んだ状態。
    // BGM 経路で active 化前に silent-play されたケースを模す。
    video2El.readyState = 4;
    video2El.paused = false;
    video2El.currentTime = 0.35;

    const activeVideoIdRef = createRef<string | null>('v1');

    const { hook, logInfo } = setupRenderFrameHarness({
      mediaItems: [video1, video2],
      mediaElements: {
        [video1.id]: video1El as unknown as HTMLVideoElement,
        [video2.id]: video2El as unknown as HTMLVideoElement,
      } as MediaElementsRef,
      activeVideoIdRef,
    });

    hook.result.current.renderFrame(2.05, true, false);

    // 既に再生中なので追加の play() は呼ばない、currentTime も上書きしない、
    // リスナーも仕掛けない。currentTime の上書きは iOS Safari で seeking=true のまま
    // 戻らず、音だけ鳴って映像が固まる退行を引き起こすため避ける。
    expect(video2El.play).not.toHaveBeenCalled();
    expect(video2El.currentTime).toBeCloseTo(0.35);
    expect(video2El.listenerCount('canplay')).toBe(0);
    expect(video2El.listenerCount('seeked')).toBe(0);
    expect(
      logInfo.mock.calls.some(([, message]) => message === 'iOS Safari preview video 境界キック'),
    ).toBe(false);
  });
});
