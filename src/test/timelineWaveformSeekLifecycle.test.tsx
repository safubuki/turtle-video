import { act, cleanup, createEvent, fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent, MutableRefObject } from 'react';

import TimelineWaveform from '../components/media/TimelineWaveform';
import { getPreviewPlatformPolicy } from '../flavors/standard/preview/previewPlatform';
import { usePreviewSeekController } from '../flavors/standard/preview/usePreviewSeekController';
import type { TimelineWaveformData } from '../hooks/useTimelineWaveform';
import type { MediaItem } from '../types';

const createRef = <T,>(current: T): MutableRefObject<T> => ({ current });
const waveform: TimelineWaveformData = {
  status: 'ready',
  peaks: new Float32Array(64).fill(0.5),
  silences: [],
  resolvedSilenceSource: 'video',
  duration: 10,
};

function renderPlayingWaveform() {
  const video = document.createElement('video');
  let paused = false;
  Object.defineProperties(video, {
    readyState: { configurable: true, value: 4 },
    seeking: { configurable: true, value: false },
    paused: { configurable: true, get: () => paused },
  });
  const pause = vi.spyOn(video, 'pause').mockImplementation(() => { paused = true; });
  const play = vi.spyOn(video, 'play').mockImplementation(() => {
    paused = false;
    return Promise.resolve();
  });
  const item: MediaItem = {
    id: 'video', file: new File([], 'video.mp4'), type: 'video', url: 'blob:video',
    volume: 1, isMuted: false, fadeIn: false, fadeOut: false,
    fadeInDuration: 0, fadeOutDuration: 0, duration: 10, originalDuration: 10,
    trimStart: 0, trimEnd: 10, scale: 1, positionX: 0, positionY: 0,
    isTransformOpen: false, isLocked: false,
  };
  const currentTimeRef = createRef(1);
  const isPlayingRef = createRef(true);
  const isSeekingRef = createRef(false);
  const wasPlayingBeforeSeekRef = createRef(false);
  const isSeekPlaybackPreparingRef = createRef(false);
  const cancelSeekPlaybackPrepareRef = createRef<(() => void) | null>(null);
  const pendingPausedSeekWaitRef = createRef<{ cleanup: () => void } | null>(null);
  const loop = vi.fn();
  const renderFrame = vi.fn();
  const prepareAudio = vi.fn(() => ({
    activeVideoId: item.id, audibleSourceCount: 1, requiresWebAudio: false,
  }));
  const params = {
    mediaItemsRef: createRef([item]),
    mediaElementsRef: createRef<Record<string, HTMLVideoElement | HTMLImageElement | HTMLAudioElement>>({ video }),
    sourceNodesRef: createRef<Record<string, MediaElementAudioSourceNode>>({}),
    gainNodesRef: createRef<Record<string, GainNode>>({}),
    audioCtxRef: createRef<AudioContext | null>(null),
    totalDurationRef: createRef(10), currentTimeRef,
    activeVideoIdRef: createRef<string | null>(item.id),
    isPlayingRef, isSeekingRef, wasPlayingBeforeSeekRef,
    seekingVideosRef: createRef(new Set<string>()),
    startTimeRef: createRef(0), reqIdRef: createRef<number | null>(null),
    loopIdRef: createRef(0),
    playbackTimeoutRef: createRef<ReturnType<typeof setTimeout> | null>(null),
    lastSeekTimeRef: createRef(0), pendingSeekRef: createRef<number | null>(null),
    pendingSeekTimeoutRef: createRef<ReturnType<typeof setTimeout> | null>(null),
    seekSettleGenerationRef: createRef(0), previewPlaybackAttemptRef: createRef(0),
    pendingPausedSeekWaitRef,
    handleSeekEndCallbackRef: createRef<(() => void) | null>(null),
    renderPausedPreviewFrameAtTimeRef: createRef<(time: number) => void>(() => {}),
    cancelSeekPlaybackPrepareRef, isSeekPlaybackPreparingRef,
    endFinalizedRef: createRef(false),
    previewPlatformPolicy: getPreviewPlatformPolicy({
      isAndroid: true, isIosSafari: false, audioContextMayInterrupt: false,
    }),
    setCurrentTime: vi.fn(), attachGlobalSeekEndListeners: vi.fn(),
    detachGlobalSeekEndListeners: vi.fn(),
    cancelPendingSeekPlaybackPrepare: () => {
      cancelSeekPlaybackPrepareRef.current?.();
      cancelSeekPlaybackPrepareRef.current = null;
      isSeekPlaybackPreparingRef.current = false;
    },
    cancelPendingPausedSeekWait: () => {
      pendingPausedSeekWaitRef.current?.cleanup();
      pendingPausedSeekWaitRef.current = null;
    },
    renderFrame, loop, resetInactiveVideos: vi.fn(),
    preparePreviewAudioNodesForTime: prepareAudio,
    primePreviewAudioOnlyTracksAtTime: vi.fn(),
  };
  const { result } = renderHook(() => usePreviewSeekController(params));
  const onSeekStart = vi.fn(() => result.current.handleSeekStart());
  const onSeekChange = vi.fn((time: number) => {
    result.current.handleSeekChange({ target: { value: String(time) } } as ChangeEvent<HTMLInputElement>);
  });
  const onSeekEnd = vi.fn(() => result.current.handleSeekEnd());
  const onSeek = vi.fn((time: number) => {
    onSeekStart();
    onSeekChange(time);
    onSeekEnd();
  });
  const { container } = render(
    <TimelineWaveform
      waveform={waveform} totalDuration={10} currentTime={1} enabled disabled={false}
      onSeek={onSeek} onSeekStart={onSeekStart} onSeekChange={onSeekChange} onSeekEnd={onSeekEnd}
    />,
  );
  const surface = container.querySelector('[role="presentation"]') as HTMLElement;
  return {
    surface, video, pause, play, loop, prepareAudio, currentTimeRef,
    isPlayingRef, isSeekingRef, wasPlayingBeforeSeekRef, isSeekPlaybackPreparingRef,
    onSeek, onSeekStart, onSeekChange, onSeekEnd,
  };
}

function pointer(
  surface: HTMLElement,
  phase: 'down' | 'move' | 'up' | 'cancel',
  clientX: number,
  clientY: number,
  pointerType: 'touch' | 'mouse' = 'touch',
) {
  const makeEvent = {
    down: createEvent.pointerDown, move: createEvent.pointerMove,
    up: createEvent.pointerUp, cancel: createEvent.pointerCancel,
  }[phase];
  const event = makeEvent(surface, { bubbles: true });
  Object.defineProperties(event, {
    pointerType: { value: pointerType }, pointerId: { value: 1 }, isPrimary: { value: true },
    clientX: { value: clientX }, clientY: { value: clientY }, button: { value: 0 },
    buttons: { value: phase === 'up' || phase === 'cancel' ? 0 : 1 },
  });
  fireEvent(surface, event);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 500, bottom: 48,
    width: 500, height: 48, toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('波形と standard シーク制御の連携（Issue #233）', () => {
  it('縦スクロールや判定待ちでは再生中の動画を止めず、位置も変更しない', () => {
    const state = renderPlayingWaveform();
    pointer(state.surface, 'down', 100, 100);
    pointer(state.surface, 'move', 105, 110);
    expect(state.pause).not.toHaveBeenCalled();
    pointer(state.surface, 'move', 105, 140);
    pointer(state.surface, 'up', 105, 140);
    expect(state.currentTimeRef.current).toBe(1);
    expect(state.isPlayingRef.current).toBe(true);
    expect(state.onSeekStart).not.toHaveBeenCalled();
    expect(state.onSeekChange).not.toHaveBeenCalled();
    expect(state.onSeekEnd).not.toHaveBeenCalled();
  });

  it.each(['touch', 'mouse'] as const)(
    '%s の連続横ドラッグは一度のシーク操作として終了し、最後の位置から再開する',
    (pointerType) => {
      const state = renderPlayingWaveform();
      pointer(state.surface, 'down', 100, 20, pointerType);
      for (const x of [150, 250, 300]) {
        act(() => { vi.advanceTimersByTime(20); });
        pointer(state.surface, 'move', x, 22, pointerType);
      }
      // 220ms の再開準備より短い間隔で何度も移動しても、再開意図を上書きしない。
      expect(state.onSeek).not.toHaveBeenCalled();
      expect(state.onSeekStart).toHaveBeenCalledTimes(1);
      expect(state.onSeekEnd).not.toHaveBeenCalled();
      expect(state.currentTimeRef.current).toBe(6);
      expect(state.isSeekingRef.current).toBe(true);
      expect(state.wasPlayingBeforeSeekRef.current).toBe(true);
      expect(state.play).not.toHaveBeenCalled();

      pointer(state.surface, 'up', 350, 22, pointerType);
      expect(state.onSeekEnd).toHaveBeenCalledTimes(1);
      expect(state.currentTimeRef.current).toBe(7);
      expect(state.isSeekingRef.current).toBe(false);
      expect(state.isSeekPlaybackPreparingRef.current).toBe(true);

      act(() => { vi.advanceTimersByTime(219); });
      expect(state.play).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(21); });
      expect(state.isPlayingRef.current).toBe(true);
      expect(state.video.currentTime).toBe(7);
      expect(state.prepareAudio).toHaveBeenCalledWith(7);
      expect(state.play).toHaveBeenCalledTimes(1);
      act(() => { vi.advanceTimersByTime(32); });
      expect(state.loop).toHaveBeenCalledTimes(1);
    },
  );

  it('横ドラッグのキャンセルでもシークを一度終了し、確定した位置から再開する', () => {
    const state = renderPlayingWaveform();
    pointer(state.surface, 'down', 100, 20);
    pointer(state.surface, 'move', 150, 22);
    pointer(state.surface, 'move', 250, 22);
    pointer(state.surface, 'cancel', 250, 22);
    pointer(state.surface, 'up', 300, 22);
    expect(state.onSeekEnd).toHaveBeenCalledTimes(1);
    expect(state.currentTimeRef.current).toBe(5);
    expect(state.isSeekingRef.current).toBe(false);
    act(() => { vi.advanceTimersByTime(240); });
    expect(state.isPlayingRef.current).toBe(true);
    expect(state.prepareAudio).toHaveBeenCalledWith(5);
    expect(state.play).toHaveBeenCalledTimes(1);
  });

  it('短いタップは離すまで再生を妨げず、従来の単発シーク経路から再開する', () => {
    const state = renderPlayingWaveform();
    pointer(state.surface, 'down', 250, 20);
    expect(state.pause).not.toHaveBeenCalled();
    pointer(state.surface, 'up', 250, 20);
    expect(state.onSeek).toHaveBeenCalledWith(5);
    expect(state.onSeekStart).toHaveBeenCalledTimes(1);
    expect(state.onSeekEnd).toHaveBeenCalledTimes(1);
    expect(state.currentTimeRef.current).toBe(5);
    act(() => { vi.advanceTimersByTime(240); });
    expect(state.isPlayingRef.current).toBe(true);
    expect(state.prepareAudio).toHaveBeenCalledWith(5);
    expect(state.play).toHaveBeenCalledTimes(1);
  });
});
