import { useState, type ChangeEvent, type MutableRefObject } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FloatingPreview from '../components/common/FloatingPreview';
import { usePreviewSeekController as useStandardSeekController } from '../flavors/standard/preview/usePreviewSeekController';
import { usePreviewSeekController as useAppleSeekController } from '../flavors/apple-safari/preview/usePreviewSeekController';
import { getPreviewPlatformPolicy } from '../flavors/standard/preview/previewPlatform';
import type { MediaItem } from '../types';

const ref = <T,>(current: T): MutableRefObject<T> => ({ current });
const controllers = [
  ['standard', useStandardSeekController],
  ['apple-safari', useAppleSeekController],
] as const;

function renderMini(
  useController: typeof useStandardSeekController,
  initiallyPlaying = true,
  manualResumeOnly = false,
) {
  const video = document.createElement('video');
  let paused = !initiallyPlaying;
  let seeking = false;
  Object.defineProperties(video, {
    readyState: { configurable: true, value: 4 },
    seeking: { configurable: true, get: () => seeking },
    paused: { configurable: true, get: () => paused },
  });
  vi.spyOn(video, 'pause').mockImplementation(() => { paused = true; });
  const play = vi.spyOn(video, 'play').mockImplementation(() => {
    paused = false;
    return Promise.resolve();
  });
  const item: MediaItem = {
    id: 'video', file: new File([], 'sample.mp4'), type: 'video', url: 'blob:video',
    duration: 100, originalDuration: 100, trimStart: 0, trimEnd: 100,
    volume: 1, isMuted: false, fadeIn: false, fadeOut: false,
    fadeInDuration: 0, fadeOutDuration: 0, scale: 1, positionX: 0, positionY: 0,
    isTransformOpen: false, isLocked: false,
  };
  const currentTimeRef = ref(25);
  const isPlayingRef = ref(initiallyPlaying);
  const wasPlayingBeforeSeekRef = ref(false);
  const isSeekingRef = ref(false);
  const isSeekPlaybackPreparingRef = ref(false);
  const cancelSeekPlaybackPrepareRef = ref<(() => void) | null>(null);
  const pendingPausedSeekWaitRef = ref<{ cleanup: () => void } | null>(null);
  const cancelPrepare = () => {
    cancelSeekPlaybackPrepareRef.current?.();
    cancelSeekPlaybackPrepareRef.current = null;
    isSeekPlaybackPreparingRef.current = false;
  };
  const loop = vi.fn();
  const prepareAudio = vi.fn(() => ({
    activeVideoId: item.id, audibleSourceCount: 1, requiresWebAudio: false,
  }));
  const params: Parameters<typeof useStandardSeekController>[0] = {
    mediaItemsRef: ref([item]),
    mediaElementsRef: ref({ video }),
    sourceNodesRef: ref({}), gainNodesRef: ref({}), audioCtxRef: ref(null),
    totalDurationRef: ref(100), currentTimeRef, isPlayingRef, isSeekingRef,
    wasPlayingBeforeSeekRef, isSeekPlaybackPreparingRef, cancelSeekPlaybackPrepareRef,
    activeVideoIdRef: ref<string | null>(item.id), seekingVideosRef: ref(new Set<string>()),
    startTimeRef: ref(0), reqIdRef: ref<number | null>(null), loopIdRef: ref(0),
    playbackTimeoutRef: ref<ReturnType<typeof setTimeout> | null>(null),
    lastSeekTimeRef: ref(0), pendingSeekRef: ref<number | null>(null),
    pendingSeekTimeoutRef: ref<ReturnType<typeof setTimeout> | null>(null),
    seekSettleGenerationRef: ref(0), previewPlaybackAttemptRef: ref(0),
    pendingPausedSeekWaitRef, handleSeekEndCallbackRef: ref<(() => void) | null>(null),
    renderPausedPreviewFrameAtTimeRef: ref<(time: number) => void>(() => {}),
    endFinalizedRef: ref(false),
    previewPlatformPolicy: getPreviewPlatformPolicy({
      isAndroid: !manualResumeOnly, isIosSafari: manualResumeOnly, audioContextMayInterrupt: false,
    }),
    setCurrentTime: vi.fn(), attachGlobalSeekEndListeners: vi.fn(),
    detachGlobalSeekEndListeners: vi.fn(), cancelPendingSeekPlaybackPrepare: cancelPrepare,
    cancelPendingPausedSeekWait: () => {
      pendingPausedSeekWaitRef.current?.cleanup();
      pendingPausedSeekWaitRef.current = null;
    },
    renderFrame: vi.fn(), loop, resetInactiveVideos: vi.fn(),
    preparePreviewAudioNodesForTime: prepareAudio, primePreviewAudioOnlyTracksAtTime: vi.fn(),
  };
  function Harness() {
    const [currentTime, setCurrentTime] = useState(25);
    const [playing, setPlaying] = useState(initiallyPlaying);
    const controller = useController({ ...params, setCurrentTime });
    const pause = () => {
      cancelPrepare();
      isPlayingRef.current = false;
      wasPlayingBeforeSeekRef.current = false;
      isSeekingRef.current = false;
      video.pause();
      setPlaying(false);
    };
    return <FloatingPreview
      canvasHostRef={ref<HTMLDivElement | null>(null)}
      currentTime={currentTime} totalDuration={100} isPlaying={playing}
      isLoading={false} bottomOffset={0} focusOnMount={false}
      onSeekBy={(delta) => {
        // TurtleVideo の相対シークと同じく、公開されたUI時刻ではなく最新refを使う。
        const target = Math.max(0, Math.min(100, currentTimeRef.current + delta));
        controller.handleSeekStart();
        if (manualResumeOnly) {
          wasPlayingBeforeSeekRef.current = false;
          setPlaying(false);
        }
        controller.handleSeekChange({ target: { value: String(target) } } as ChangeEvent<HTMLInputElement>);
        controller.handleSeekEnd();
      }}
      onTogglePlay={pause} onStop={pause} onClose={pause}
      onSeekChange={controller.handleSeekChange}
      onSeekStart={controller.handleSeekStart} onSeekEnd={controller.handleSeekEnd}
    />;
  }
  render(<Harness />);
  return {
    video, play, loop, prepareAudio, currentTimeRef, isPlayingRef, isSeekPlaybackPreparingRef,
    setSeeking: (value: boolean) => { seeking = value; },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each(controllers)('%s ミニプレビューの連続5秒シーク', (_flavor, useController) => {
  it.each([
    ['戻る連打', [-5, -5, -5], 10],
    ['進む連打', [5, 5, 5], 40],
    ['戻ると進むの交互操作', [5, -5, 5, -5, -5], 20],
  ] as const)('%sで各移動を累積し、最後の位置から一度だけ再開する', (_label, deltas, expected) => {
    const state = renderMini(useController);
    for (const delta of deltas) {
      fireEvent.click(screen.getByRole('button', { name: delta < 0 ? '5秒戻る' : '5秒進む' }));
      act(() => { vi.advanceTimersByTime(20); });
    }
    expect(state.currentTimeRef.current).toBe(expected);
    expect(screen.getByRole('slider', { name: 'ミニプレビュー位置' })).toHaveValue(String(expected));
    expect(state.isSeekPlaybackPreparingRef.current).toBe(true);
    expect(state.play).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(240); });
    expect(state.isPlayingRef.current).toBe(true);
    expect(state.video.paused).toBe(false);
    expect(state.video.currentTime).toBe(expected);
    expect(state.prepareAudio).toHaveBeenCalledWith(expected);
    expect(state.play).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(state.loop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('一時停止中の連打は位置だけを変えて再生を開始しない', () => {
    const state = renderMini(useController, false);
    for (let index = 0; index < 3; index++) {
      fireEvent.click(screen.getByRole('button', { name: '5秒戻る' }));
      act(() => { vi.advanceTimersByTime(20); });
    }
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(state.currentTimeRef.current).toBe(10);
    expect(state.isPlayingRef.current).toBe(false);
    expect(state.isSeekPlaybackPreparingRef.current).toBe(false);
    expect(state.play).not.toHaveBeenCalled();
    expect(state.loop).not.toHaveBeenCalled();
  });

  it('準備中に明示一時停止した後は古い待機や次の5秒操作で再開しない', () => {
    const state = renderMini(useController);
    fireEvent.click(screen.getByRole('button', { name: '5秒戻る' }));
    act(() => { vi.advanceTimersByTime(20); });
    fireEvent.click(screen.getByRole('button', { name: 'ミニプレビューを一時停止' }));
    fireEvent.click(screen.getByRole('button', { name: '5秒進む' }));
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(state.currentTimeRef.current).toBe(25);
    expect(state.isPlayingRef.current).toBe(false);
    expect(state.video.paused).toBe(true);
    expect(state.play).not.toHaveBeenCalled();
    expect(state.loop).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'ミニプレビューを再生' })).toBeVisible();
  });

  it('遅いデコーダでも最後のシーク完了を待ち、古い準備からは再開しない', () => {
    const state = renderMini(useController);
    state.setSeeking(true);
    fireEvent.click(screen.getByRole('button', { name: '5秒戻る' }));
    act(() => { vi.advanceTimersByTime(240); });
    expect(state.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '5秒進む' }));
    act(() => { vi.advanceTimersByTime(240); });
    expect(state.play).not.toHaveBeenCalled();
    state.setSeeking(false);
    fireEvent(state.video, new Event('seeked'));
    act(() => { vi.advanceTimersByTime(32); });
    expect(state.isPlayingRef.current).toBe(true);
    expect(state.video.currentTime).toBe(25);
    expect(state.play).toHaveBeenCalledTimes(1);
    expect(state.loop).toHaveBeenCalledTimes(1);
  });

  it('iOS Safari の明示的な自動再開禁止を維持する', () => {
    const state = renderMini(useController, true, true);
    for (let index = 0; index < 3; index++) {
      fireEvent.click(screen.getByRole('button', { name: '5秒戻る' }));
      act(() => { vi.advanceTimersByTime(20); });
    }
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(state.currentTimeRef.current).toBe(10);
    expect(state.isPlayingRef.current).toBe(false);
    expect(state.play).not.toHaveBeenCalled();
    expect(state.loop).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'ミニプレビューを再生' })).toBeVisible();
  });
});
