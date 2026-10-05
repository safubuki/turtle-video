/** Issue #238: 1秒シーク後の動画再開と、タイミング打ち・通常プレビューの表示を検証する。 */
import { useState, type ChangeEvent, type ComponentProps, type MutableRefObject } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CaptionSection from '../components/sections/CaptionSection';
import PreviewSection from '../components/sections/PreviewSection';
import { PlatformCapabilitiesProvider } from '../app/PlatformCapabilitiesContext';
import { getPlatformCapabilities } from '../utils/platform';
import { usePreviewSeekController } from '../flavors/standard/preview/usePreviewSeekController';
import { getPreviewPlatformPolicy } from '../flavors/standard/preview/previewPlatform';
import { useCaptionStore } from '../stores/captionStore';
import { useUIStore } from '../stores/uiStore';
import { DEFAULT_VIDEO_TITLE_SETTINGS } from '../utils/videoTitle';
import type { MediaItem } from '../types';

vi.mock('../components/common/CaptionMiniPreview', () => ({
  default: () => null,
  PORTRAIT_MINI_PREVIEW_MAX_WIDTH_CLASS: 'max-w-[clamp(12rem,24dvh,18rem)]',
}));

const ref = <T,>(current: T): MutableRefObject<T> => ({ current });
const noop = () => {};

function renderStampPreview(isAndroid: boolean, initiallyPlaying = true, initialTime = 25) {
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
  const currentTimeRef = ref(initialTime);
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
  const capabilities = {
    ...getPlatformCapabilities(), isAndroid, isIOS: false, isSafari: false, isIosSafari: false,
  };
  const params: Parameters<typeof usePreviewSeekController>[0] = {
    mediaItemsRef: ref([item]), mediaElementsRef: ref({ video }),
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
    renderPausedPreviewFrameAtTimeRef: ref<(time: number) => void>(noop),
    endFinalizedRef: ref(false), previewPlatformPolicy: getPreviewPlatformPolicy(capabilities),
    setCurrentTime: noop, attachGlobalSeekEndListeners: noop, detachGlobalSeekEndListeners: noop,
    cancelPendingSeekPlaybackPrepare: cancelPrepare,
    cancelPendingPausedSeekWait: () => {
      pendingPausedSeekWaitRef.current?.cleanup();
      pendingPausedSeekWaitRef.current = null;
    },
    renderFrame: vi.fn(), loop, resetInactiveVideos: noop,
    preparePreviewAudioNodesForTime: prepareAudio, primePreviewAudioOnlyTracksAtTime: noop,
  };
  const captionProps: ComponentProps<typeof CaptionSection> = {
    captions: [
      { id: 'c1', text: '1つ目', startTime: 0, endTime: 2, fadeIn: false, fadeOut: false, fadeInDuration: 0.5, fadeOutDuration: 0.5 },
      { id: 'c2', text: '2つ目', startTime: 3, endTime: 5, fadeIn: false, fadeOut: false, fadeInDuration: 0.5, fadeOutDuration: 0.5 },
    ],
    settings: useCaptionStore.getState().settings, videoTitle: { ...DEFAULT_VIDEO_TITLE_SETTINGS },
    isLocked: false, totalDuration: 100, currentTime: initialTime, defaultOpen: true,
    onToggleLock: noop, onAddCaption: noop, onUpdateCaption: noop, onRemoveCaption: noop,
    onMoveCaption: noop, onClearAllCaptions: noop, onSetEnabled: noop, onSetFontSize: noop,
    onSetFontStyle: noop, onSetTextAlign: noop, onSetFontColor: noop, onSetStrokeColor: noop,
    onSetStrokeWidth: noop, onSetPosition: noop, onSetBlur: noop, onSetBackgroundEnabled: noop,
    onSetBackgroundColor: noop, onSetBackgroundOpacity: noop, onSetBackgroundRadius: noop,
    onSetFontSizeCustom: noop, onSetPositionCustom: noop, onSetBulkFadeIn: noop, onSetBulkFadeOut: noop,
    onSetBulkFadeInDuration: noop, onSetBulkFadeOutDuration: noop, onOpenHelp: noop,
    formatTime: (seconds) => `${seconds.toFixed(1)}s`, onApplyCaptions: noop, onShiftCaptions: noop,
    isPlaying: initiallyPlaying, onTogglePlay: noop, onSeekBy: noop, onSeekToSilenceBoundary: noop,
    hasPrevSilenceBoundary: false, hasNextSilenceBoundary: false, onUpdateCaptionLive: noop,
    onUpdateVideoTitle: noop, onSetVideoTitleRange: noop, onResetVideoTitle: noop,
  };
  useUIStore.setState({ isPlaying: initiallyPlaying });
  function Harness() {
    const [currentTime, setCurrentTime] = useState(initialTime);
    const playing = useUIStore((state) => state.isPlaying);
    const controller = usePreviewSeekController({ ...params, setCurrentTime });
    // 本体と同じく、表示用の間引かれた時刻ではなく最新refを基準にする。
    const seekTo = (time: number) => {
      const target = Math.max(0, Math.min(100, time));
      controller.handleSeekStart();
      controller.handleSeekChange({ target: { value: String(target) } } as ChangeEvent<HTMLInputElement>);
      controller.handleSeekEnd();
    };
    const pause = () => {
      cancelPrepare();
      isPlayingRef.current = false;
      wasPlayingBeforeSeekRef.current = false;
      isSeekingRef.current = false;
      video.pause();
      useUIStore.getState().pause();
    };
    return (
      <PlatformCapabilitiesProvider capabilities={capabilities}>
        <CaptionSection {...captionProps} currentTime={currentTime} isPlaying={playing}
          onSeekBy={(delta) => seekTo(currentTimeRef.current + delta)} onTogglePlay={pause} />
        <PreviewSection
          appFlavor="standard" supportsShowSaveFilePicker={false} mediaItems={[item]}
          bgm={null} narrations={[]} canvasRef={ref<HTMLCanvasElement | null>(null)}
          currentTime={currentTime} totalDuration={100} isPlaying={playing}
          isProcessing={false} isLoading={false} exportPreparationStep={null} exportUrl={null} exportExt={null}
          supportsTimelineWaveform={false}
          timelineWaveform={{ status: 'idle', peaks: null, silences: [], resolvedSilenceSource: 'all', duration: 0 }}
          onSeekChange={controller.handleSeekChange} onSeekStart={controller.handleSeekStart}
          onSeekEnd={controller.handleSeekEnd} onSeekToTime={seekTo} onTogglePlay={pause} onStop={pause}
          onExport={noop} onDownload={noop} onClearAll={noop} onCapture={noop}
          onExportFinalizeTimeout={noop} onOpenHelp={noop} formatTime={captionProps.formatTime}
          projectPosterMode="auto" projectPosterTimelineTime={0.2} projectPosterDataUrl={null}
          projectPosterAspectRatio="landscape" onSetProjectPosterFromCurrent={noop} onResetProjectPosterToAuto={noop}
          exportOutputOptions={{ contentMode: 'composite', captionLayerFormat: 'black-matte-mp4', includeSubtitles: false, subtitleFormats: [] }}
          onExportOutputOptionsChange={noop} supportsCaptionLayerExport={false}
        />
      </PlatformCapabilitiesProvider>
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: /② タイミング打ち/ }));
  return {
    video, play, loop, prepareAudio, currentTimeRef, isPlayingRef,
    isSeekPlaybackPreparingRef, transport: within(screen.getByTestId('caption-stamp-transport')),
    setSeeking: (value: boolean) => { seeking = value; },
  };
}

function expectPlaybackButtons(state: ReturnType<typeof renderStampPreview>, playing: boolean) {
  expect(state.transport.getByTitle(playing ? '一時停止' : '再生')).toBeVisible();
  expect(screen.getByRole('button', { name: playing ? 'プレビューを一時停止' : 'プレビューを再生' })).toBeVisible();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  useUIStore.getState().resetUI();
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
  useUIStore.getState().resetUI();
});

describe.each([['PC', false], ['Android', true]] as const)('%s タイミング打ちの1秒シーク', (_platform, isAndroid) => {
  it.each([
    ['戻る', [-1], 24], ['進む', [1], 26],
    ['戻る連打', [-1, -1, -1], 22], ['進む連打', [1, 1, 1], 28],
    ['交互の連打', [1, -1, 1, -1, -1], 24],
  ] as const)('再生中の%s後に動画を再開し、両方の一時停止表示を保つ', (_label, deltas, expected) => {
    const state = renderStampPreview(isAndroid);
    for (const delta of deltas) {
      fireEvent.click(state.transport.getByTitle(delta < 0 ? '1秒戻る' : '1秒進む'));
      act(() => { vi.advanceTimersByTime(20); });
      expectPlaybackButtons(state, true);
    }
    expect(state.currentTimeRef.current).toBe(expected);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(state.isPlayingRef.current).toBe(true);
    expect(state.video.paused).toBe(false);
    expect(state.video.currentTime).toBe(expected);
    expect(state.play).toHaveBeenCalledTimes(1);
    expect(state.prepareAudio).toHaveBeenCalledWith(expected);
    expect(state.loop).toHaveBeenCalledTimes(1);
    expectPlaybackButtons(state, true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['戻る', [-1, -1], 25, 23], ['進む', [1, 1], 25, 27],
    ['先頭', [-1, -1], 0.5, 0], ['末尾', [1, 1], 99.5, 100],
  ] as const)('一時停止中の%sは位置だけを変え、両方の再生表示を保つ', (_label, deltas, start, expected) => {
    const state = renderStampPreview(isAndroid, false, start);
    for (const delta of deltas) fireEvent.click(state.transport.getByTitle(delta < 0 ? '1秒戻る' : '1秒進む'));
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(state.currentTimeRef.current).toBe(expected);
    expect(state.isPlayingRef.current).toBe(false);
    expect(state.video.paused).toBe(true);
    expect(state.play).not.toHaveBeenCalled();
    expect(state.loop).not.toHaveBeenCalled();
    expectPlaybackButtons(state, false);
  });

  it('再開準備中に一時停止すると、古いseekedや次の1秒操作でも再開しない', () => {
    const state = renderStampPreview(isAndroid);
    fireEvent.click(state.transport.getByTitle('1秒戻る'));
    act(() => { vi.advanceTimersByTime(20); });
    fireEvent.click(state.transport.getByTitle('一時停止'));
    fireEvent(state.video, new Event('seeked'));
    fireEvent.click(state.transport.getByTitle('1秒進む'));
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(state.video.paused).toBe(true);
    expect(state.isPlayingRef.current).toBe(false);
    expect(state.play).not.toHaveBeenCalled();
    expect(state.loop).not.toHaveBeenCalled();
    expectPlaybackButtons(state, false);
  });

  it('遅いシークでも最新のseekedを待ち、最後の位置から再開する', () => {
    const state = renderStampPreview(isAndroid);
    state.setSeeking(true);
    fireEvent.click(state.transport.getByTitle('1秒戻る'));
    act(() => { vi.advanceTimersByTime(240); });
    fireEvent.click(state.transport.getByTitle('1秒進む'));
    act(() => { vi.advanceTimersByTime(240); });
    expect(state.play).not.toHaveBeenCalled();
    expectPlaybackButtons(state, true);
    state.setSeeking(false);
    fireEvent(state.video, new Event('seeked'));
    act(() => { vi.advanceTimersByTime(32); });
    expect(state.isPlayingRef.current).toBe(true);
    expect(state.video.paused).toBe(false);
    expect(state.video.currentTime).toBe(25);
    expect(state.play).toHaveBeenCalledTimes(1);
    expectPlaybackButtons(state, true);
  });
});
