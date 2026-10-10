/**
 * @file overlayPreviewRefresh.test.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description ウォーターマーク／エンドロールのパラメータ変更が停止中のプレビューへ
 * 即時反映されることを固定する。
 *
 * 【背景】これらは canvas へ焼き込まれるため、値を変えても再描画が走らないと
 * 見た目が変わらず「シークバーを一度触るまで反映されない」状態になる。
 * TurtleVideo の再描画 effect の依存配列から漏らすと再発するため、
 * 挙動としてここで固定する。
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TurtleVideo from '../components/TurtleVideo';
import type { ExportRuntime } from '../components/turtle-video/exportRuntime';
import type { PreviewRuntime } from '../components/turtle-video/previewRuntime';
import type { SaveRuntime } from '../components/turtle-video/saveRuntime';
import type { PlatformCapabilities } from '../utils/platform';
import { getPreviewPlatformPolicy } from '../utils/previewPlatform';
import {
  useAudioStore,
  useCanvasStore,
  useCaptionStore,
  useLogStore,
  useMediaStore,
  useOverlayStore,
  useUIStore,
} from '../stores';
import { DEFAULT_WATERMARK_OVERLAY } from '../utils/watermarkOverlay';
import { DEFAULT_ENDROLL_OVERLAY } from '../utils/endrollOverlay';
import type { MediaItem } from '../types';
import { usePreviewEngine } from '../flavors/standard/preview/usePreviewEngine';
import { usePreviewSeekController } from '../flavors/standard/preview/usePreviewSeekController';
import { usePreviewEngine as useAppleSafariPreviewEngine } from '../flavors/apple-safari/preview/usePreviewEngine';
import { usePreviewSeekController as useAppleSafariPreviewSeekController } from '../flavors/apple-safari/preview/usePreviewSeekController';
import * as titleOpeningFrameUtils from '../utils/titleOpeningFrame';

/** 全レンダーで共有する renderFrame。呼び出し回数の増加＝再描画が走った証拠 */
const renderFrameSpy = vi.fn(() => true);

function createCapabilities(): PlatformCapabilities {
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
    supportsMp4MediaRecorder: false,
    audioContextMayInterrupt: false,
    supportedMediaRecorderProfile: null,
    trackProcessorCtor: undefined,
  } as unknown as PlatformCapabilities;
}

function createPreviewRuntime(capabilities: PlatformCapabilities): PreviewRuntime {
  const audioSession = {
    detachAudioNode: vi.fn(),
    ensureAudioNodeForElement: vi.fn(() => true),
    preparePreviewAudioNodesForTime: vi.fn(() => ({
      activeVideoId: null,
      audibleSourceCount: 0,
      requiresWebAudio: false,
    })),
    preparePreviewAudioNodesForUpcomingVideos: vi.fn(),
    primePreviewAudioOnlyTracksAtTime: vi.fn(),
    handleMediaRefAssign: vi.fn(),
  };
  return {
    getPlatformCapabilities: vi.fn(() => capabilities),
    getPreviewPlatformPolicy,
    shouldUsePreviewCache: vi.fn(() => false),
    createPreviewCacheKey: vi.fn(() => 'preview-cache-key-test'),
    useInactiveVideoManager: vi.fn(() => ({ resetInactiveVideos: vi.fn() })),
    usePreviewAudioSession: vi.fn(() => audioSession),
    usePreviewEngine: vi.fn(() => ({
      handleMediaElementLoaded: vi.fn(),
      handleSeeked: vi.fn(),
      handleVideoLoadedData: vi.fn(),
      renderFrame: renderFrameSpy,
      stopAll: vi.fn(),
      loop: vi.fn(),
      startEngine: vi.fn(() => Promise.resolve()),
    })),
    usePreviewSeekController: vi.fn(() => ({
      handleSeekStart: vi.fn(),
      handleSeekChange: vi.fn(),
      handleSeekEnd: vi.fn(),
    })),
    usePreviewVisibilityLifecycle: vi.fn(),
  } as unknown as PreviewRuntime;
}

function renderApp(previewRuntime?: PreviewRuntime) {
  const capabilities = previewRuntime?.getPlatformCapabilities() ?? createCapabilities();
  const exportRuntime: ExportRuntime = {
    useExport: vi.fn(() => ({
      isProcessing: false,
      progress: 0,
      exportUrl: null,
      exportExt: 'mp4' as const,
      recorderRef: { current: null },
      startExport: vi.fn(),
      stopExport: vi.fn(),
      clearExport: vi.fn(),
      setExportUrl: vi.fn(),
      setExportExt: vi.fn(),
    })) as unknown as ExportRuntime['useExport'],
  };
  const saveRuntime: SaveRuntime = {
    configureProjectStore: vi.fn(),
    getPlatformCapabilities: vi.fn(() => capabilities),
    getPersistenceHealth: vi.fn(() => Promise.resolve(null)),
    saveBlobWithClientFileStrategy: vi.fn(() =>
      Promise.resolve({ strategy: 'anchor-download' as const })),
  };

  return render(
    <TurtleVideo
      appFlavor={capabilities.isIosSafari ? 'apple-safari' : 'standard'}
      previewRuntime={previewRuntime ?? createPreviewRuntime(capabilities)}
      exportRuntime={exportRuntime}
      saveRuntime={saveRuntime}
    />,
  );
}

/** 直近の呼び出し数を基準に「再描画が追加で走ったか」を待つ */
async function expectRedraw(baseline: number) {
  await waitFor(() => {
    expect(renderFrameSpy.mock.calls.length).toBeGreaterThan(baseline);
  });
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  renderFrameSpy.mockClear();
  useOverlayStore.setState({
    watermark: { ...DEFAULT_WATERMARK_OVERLAY },
    endroll: { ...DEFAULT_ENDROLL_OVERLAY },
  });
});

afterEach(() => {
  cleanup();
  useMediaStore.getState().clearAllMedia();
  useAudioStore.getState().clearAllAudio();
  useCaptionStore.getState().resetCaptions();
  useUIStore.getState().resetUI();
  useLogStore.getState().clearLogs();
  useOverlayStore.setState({
    watermark: { ...DEFAULT_WATERMARK_OVERLAY },
    endroll: { ...DEFAULT_ENDROLL_OVERLAY },
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each([
  ['standard', usePreviewEngine, usePreviewSeekController, false],
  ['apple-safari', useAppleSafariPreviewEngine, useAppleSafariPreviewSeekController, true],
] as const)('%s: サイズ調整後も静止画の位置を調整できる', (_flavor, useEngine, useSeek, isIosSafari) => {
  it.each([
    ['start', false],
    ['start', true],
    ['end', true],
  ] as const)('%s確認・ズーム%s: 横縦の変更を描画し、確認位置と倍率を保持する', async (endpoint, animated) => {
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      disconnect() {}
    });
    const image = document.createElement('img');
    Object.defineProperties(image, {
      naturalWidth: { value: 1280 }, naturalHeight: { value: 720 }, complete: { value: true },
    });
    const contexts = new Map<HTMLCanvasElement, CanvasRenderingContext2D>();
    const baseContext = document.createElement('canvas').getContext('2d')!;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      if (!contexts.has(this)) {
        contexts.set(this, {
          ...baseContext, canvas: this, translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(),
          strokeRect: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
        } as unknown as CanvasRenderingContext2D);
      }
      return contexts.get(this)!;
    });
    const capture = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,existing');
    const source: MediaItem = {
      id: 'image-position', type: 'image', file: new File(['x'], 'image.png'), url: 'blob:image-position',
      duration: 5, originalDuration: 5, trimStart: 0, trimEnd: 5, scale: 1,
      ...(animated ? { zoomDirection: 'in' as const, zoomStartScale: 1, zoomEndScale: 2.5 } : {}),
      positionX: 0, positionY: 0, volume: 1, isMuted: false, fadeIn: false, fadeOut: false,
      fadeInDuration: 1, fadeOutDuration: 1, isLocked: false, isTransformOpen: true,
    };
    useMediaStore.setState({
      mediaItems: [source], totalDuration: 5, isClipsLocked: false,
      projectPosterMode: 'manual', projectPosterDataUrl: 'data:image/jpeg;base64,existing',
    });
    useUIStore.setState({ currentTime: 2 });
    const capabilities = { ...createCapabilities(), isAndroid: !isIosSafari, isIosSafari };
    const runtime = createPreviewRuntime(capabilities);
    let getMainCanvas = (): HTMLCanvasElement | null => null;
    runtime.usePreviewEngine = (params) => {
      params.mediaElementsRef.current[source.id] = image;
      getMainCanvas = () => params.canvasRef.current;
      return useEngine(params);
    };
    runtime.usePreviewSeekController = useSeek;
    renderApp(runtime);
    fireEvent.change(screen.getByRole('slider', { name: '拡大率' }), { target: { value: '210.1' } });
    if (endpoint === 'end') {
      fireEvent.click(screen.getByRole('button', { name: 'フェード・ズームイン/アウト' }));
      fireEvent.click(screen.getByRole('button', { name: '終了（末尾）を確認' }));
    }
    const canvas = getMainCanvas()!;
    const context = contexts.get(canvas)!;
    const translate = vi.mocked(context.translate);
    const scale = vi.mocked(context.scale);
    const drawImage = vi.mocked(context.drawImage);
    const expectedScale = (endpoint === 'end' ? 2.5 : 2.101) * Math.min(canvas.width / 1280, canvas.height / 720);
    await waitFor(() => expect(scale).toHaveBeenLastCalledWith(expect.closeTo(expectedScale), expect.closeTo(expectedScale)));
    // 端点選択直後の描画と要素準備タイマーを終えてから、位置変更だけを検証する。
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
    const previewTime = useUIStore.getState().currentTime;
    capture.mockClear();
    for (const [label, value, change] of [
      ['横位置', -6, () => fireEvent.change(screen.getByRole('slider', { name: '横位置' }), { target: { value: '-6' } })],
      ['縦位置', -36, () => {
        const input = screen.getByRole('spinbutton', { name: '縦位置（数値）' });
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '-36' } });
        fireEvent.blur(input);
      }],
      ['横位置', -5, () => fireEvent.click(screen.getByRole('button', { name: '横位置を1増やす' }))],
    ] as const) {
      const baseline = drawImage.mock.calls.length;
      change();
      expect(screen.getByRole('spinbutton', { name: `${label}（数値）` })).toHaveValue(value);
      const item = useMediaStore.getState().mediaItems[0];
      const dimensions = useCanvasStore.getState();
      await waitFor(() => expect(drawImage.mock.calls.length).toBeGreaterThan(baseline));
      expect(drawImage).toHaveBeenLastCalledWith(image, expect.any(Number), expect.any(Number), 1280, 720);
      expect(translate).toHaveBeenLastCalledWith(
        expect.closeTo(canvas.width / 2 + item.positionX * canvas.width / dimensions.width),
        expect.closeTo(canvas.height / 2 + item.positionY * canvas.height / dimensions.height),
      );
      expect(scale).toHaveBeenLastCalledWith(expect.closeTo(expectedScale), expect.closeTo(expectedScale));
      expect(useUIStore.getState().currentTime).toBe(previewTime);
      expect(item.zoomStartScale).toBe(2.101);
      expect(item.zoomEndScale).toBe(animated ? 2.5 : 2.101);
      expect(useUIStore.getState().isPlaying).toBe(false);
      expect(capture).not.toHaveBeenCalled();
    }
  });
});

describe('ズーム端点確認中は背景撮影が動画の表示位置を変えない', () => {
  it.each([
    ['auto', 1.025],
    ['manual', 1.4],
  ] as const)('ポスター%s: トリム後の終了倍率を保ち、確認解除後に撮影を再開する', async (posterMode, startScale) => {
    const video = document.createElement('video');
    let readyState = 1;
    Object.defineProperties(video, {
      readyState: { get: () => readyState }, seeking: { value: false }, paused: { value: true },
      videoWidth: { value: 1280 }, videoHeight: { value: 720 },
    });
    const scale = vi.fn();
    const drawnSourceTimes: number[] = [];
    const baseContext = document.createElement('canvas').getContext('2d')!;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      return {
        ...baseContext, canvas: this, scale,
        drawImage: (source: CanvasImageSource) => { if (source === video) drawnSourceTimes.push(video.currentTime); },
        getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
      } as unknown as CanvasRenderingContext2D;
    });
    const capture = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,updated');
    const titleCaptureTarget = vi.spyOn(titleOpeningFrameUtils, 'resolveTitleMiniPreviewCaptureTarget');
    const source: MediaItem = {
      id: 'trim-zoom', type: 'video', file: new File(['x'], 'trim.mp4'), url: 'blob:trim',
      duration: 15.04, originalDuration: 15.04, trimStart: 0, trimEnd: 15.04,
      scale: startScale, zoomStartScale: startScale, zoomEndScale: 1.2, zoomDirection: startScale < 1.2 ? 'in' : 'out',
      positionX: 0, positionY: 0, volume: 1, isMuted: false,
      fadeIn: false, fadeOut: false, fadeInDuration: 1, fadeOutDuration: 1,
      isLocked: false, isTransformOpen: false,
    };
    useMediaStore.setState({
      mediaItems: [source], totalDuration: source.duration, isClipsLocked: false,
      projectPosterMode: posterMode, projectPosterDataUrl: 'data:image/jpeg;base64,existing',
    });
    const runtime = createPreviewRuntime(createCapabilities());
    runtime.usePreviewEngine = (params) => {
      params.mediaElementsRef.current[source.id] = video;
      return usePreviewEngine(params);
    };
    runtime.usePreviewSeekController = usePreviewSeekController;
    renderApp(runtime);
    act(() => {
      useMediaStore.getState().updateVideoTrim(source.id, 'start', 2.5);
      useMediaStore.getState().updateVideoTrim(source.id, 'end', 9.1);
    });
    // 背景撮影が先頭へシークしてデコードを待っている途中で端点確認を始める。
    await waitFor(() => {
      expect(video.currentTime).toBeGreaterThan(2.5);
      expect(video.currentTime).toBeLessThan(3);
    });
    readyState = 4;
    fireEvent.click(screen.getByRole('button', { name: 'フェード・ズームイン/アウト' }));
    fireEvent.change(screen.getByRole('slider', { name: 'ズーム終了倍率' }), { target: { value: '126.2' } });
    titleCaptureTarget.mockClear();
    await waitFor(() => expect(scale).toHaveBeenLastCalledWith(1.262, 1.262));
    expect(video.currentTime).toBeCloseTo(9.099);
    expect(useMediaStore.getState().mediaItems[0].duration).toBeCloseTo(6.6);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1000)); });
    expect(video.currentTime).toBeCloseTo(9.099);
    expect(drawnSourceTimes[drawnSourceTimes.length - 1]).toBeCloseTo(9.099);
    expect(scale).toHaveBeenLastCalledWith(1.262, 1.262);
    expect(useUIStore.getState().currentTime).toBeCloseTo(6.599);
    expect(capture).not.toHaveBeenCalled();
    expect(titleCaptureTarget).not.toHaveBeenCalled();

    // 同じ端点の再調整と先頭確認も背景撮影へ譲らない。
    fireEvent.change(screen.getByRole('slider', { name: 'ズーム終了倍率' }), { target: { value: '131.2' } });
    expect(scale).toHaveBeenLastCalledWith(expect.closeTo(1.312), expect.closeTo(1.312));
    fireEvent.click(screen.getByRole('button', { name: '開始（先頭）を確認' }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); });
    expect(video.currentTime).toBe(2.5);
    expect(scale).toHaveBeenLastCalledWith(startScale, startScale);
    expect(capture).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByRole('slider', { name: 'プレビュー位置' }), { pointerType: 'mouse' });
    fireEvent.pointerUp(screen.getByRole('slider', { name: 'プレビュー位置' }), { pointerType: 'mouse' });
    if (posterMode === 'auto') {
      await waitFor(() => expect(capture).toHaveBeenCalled());
      expect(useMediaStore.getState().projectPosterDataUrl).toBe('data:image/jpeg;base64,updated');
    } else {
      await waitFor(() => expect(titleCaptureTarget).toHaveBeenCalled());
      expect(useMediaStore.getState().projectPosterDataUrl).toBe('data:image/jpeg;base64,existing');
    }
  });
});

describe('ロゴ設定の変更は停止中のプレビューへ即時反映される', () => {
  it('ウォーターマークの位置・倍率・透過度の変更で再描画する', async () => {
    renderApp();
    await waitFor(() => expect(renderFrameSpy).toHaveBeenCalled());

    for (const updates of [
      { positionX: 20 },
      { size: 1.8 },
      { opacity: 0.4 },
      { rotation: 45 },
      { mask: 'circle' as const },
      { feather: 12 },
    ]) {
      const baseline = renderFrameSpy.mock.calls.length;
      act(() => {
        useOverlayStore.getState().updateWatermark(updates);
      });
      await expectRedraw(baseline);
    }
  });

  it('エンドロールの長さ・背景色・ロゴ調整の変更で再描画する', async () => {
    renderApp();
    await waitFor(() => expect(renderFrameSpy).toHaveBeenCalled());

    for (const updates of [
      { durationSec: 8 },
      { backgroundMode: 'white' as const },
      { backgroundColor: '#123456' },
      { positionY: 30 },
      { size: 0.6 },
      { fadeIn: true },
    ]) {
      const baseline = renderFrameSpy.mock.calls.length;
      act(() => {
        useOverlayStore.getState().updateEndroll(updates);
      });
      await expectRedraw(baseline);
    }
  });

  it('表示/非表示の切替でも再描画する', async () => {
    renderApp();
    await waitFor(() => expect(renderFrameSpy).toHaveBeenCalled());

    const baselineWatermark = renderFrameSpy.mock.calls.length;
    act(() => {
      useOverlayStore.getState().updateWatermark({ enabled: false });
    });
    await expectRedraw(baselineWatermark);

    const baselineEndroll = renderFrameSpy.mock.calls.length;
    act(() => {
      useOverlayStore.getState().updateEndroll({ enabled: true });
    });
    await expectRedraw(baselineEndroll);
  });
});

/**
 * 自動サムネイルのキャプチャがプレビューへ漏れないこと。
 *
 * 自動サムネは「先頭付近を描いて撮り、元の位置へ描き戻す」方式。
 * 描いた後に await を挟むとブラウザがその中間フレームを描画してしまい、
 * 拡大縮小などの調整中に別の時刻の映像が一瞬見える（チラつき）。
 *
 * ここでは「**最後に描かれたのが必ず表示中の位置**」であることを固定する。
 * これが保たれていれば、撮影用フレームは画面に出ない。
 */
describe('自動サムネイルのキャプチャはプレビューへ漏れない', () => {
  const clipsDuration = 4;

  /** 自動サムネの撮影時刻（先頭付近 0.2 秒）か */
  const isPosterCaptureTime = (time: unknown) =>
    typeof time === 'number' && time > 0 && time < 1;

  /**
   * 撮影用フレームを描いたあと、**同じ同期ブロック内で表示位置へ描き戻しているか**。
   *
   * renderFrame(撮影時刻) の直後が renderFrame(別の時刻) になっていれば、
   * ブラウザが描画する前に上書きされるので画面には出ない。
   * 撮影時刻が「呼び出し列の末尾」または「撮影時刻が連続」で終わっていると、
   * その時点でブラウザに描かれてチラつく。
   */
  const everLeftCaptureFrameVisible = () => {
    const times = renderFrameSpy.mock.calls.map(
      (call) => (call as unknown as [number?])[0],
    );
    return times.some((time, index) => {
      if (!isPosterCaptureTime(time)) return false;
      const next = times[index + 1];
      // 直後に別時刻へ描き戻していなければ、その撮影フレームが見えてしまう
      return next === undefined || isPosterCaptureTime(next);
    });
  };

  it('エンドロール位置のまま調整しても撮影用フレームを見せない', async () => {
    useMediaStore.setState({
      mediaItems: [
        {
          id: 'clip-1',
          type: 'image',
          file: new File(['x'], 'a.png', { type: 'image/png' }),
          url: 'blob:a',
          duration: clipsDuration,
          trimStart: 0,
          trimEnd: clipsDuration,
          volume: 1,
          isMuted: false,
          fadeIn: false,
          fadeOut: false,
          fadeInDuration: 1,
          fadeOutDuration: 1,
          scale: 1,
          positionX: 50,
          positionY: 50,
          rotation: 0,
          blur: 0,
        } as unknown as MediaItem,
      ],
      totalDuration: clipsDuration,
    } as never);
    useOverlayStore.setState({
      watermark: { ...DEFAULT_WATERMARK_OVERLAY },
      endroll: {
        ...DEFAULT_ENDROLL_OVERLAY,
        enabled: true,
        url: 'blob:endroll-logo',
        durationSec: 5,
      },
    });

    renderApp();
    await waitFor(() => expect(renderFrameSpy).toHaveBeenCalled());

    // プレビューをエンドロール区間へ移す（4秒クリップ + 5秒エンドロール → 6秒はエンドロール内）
    act(() => {
      useUIStore.getState().setCurrentTime(6);
    });
    await waitFor(() => expect(useUIStore.getState().currentTime).toBe(6));

    renderFrameSpy.mockClear();

    // ここでカードのサイズを変える（自動サムネの contentKey が変わる操作）
    act(() => {
      const target = useMediaStore.getState().mediaItems[0];
      useMediaStore.getState().updateScale(target.id, 1.6);
    });

    // 自動サムネのキャプチャ遅延を十分に過ぎるまで待つ
    await new Promise((resolve) => setTimeout(resolve, 600));

    // 撮影用に先頭付近を描くこと自体はあってよい。重要なのは、その直後に
    // 必ず表示中の位置へ描き戻していること（＝画面には出ない）。
    expect(everLeftCaptureFrameVisible()).toBe(false);
  });

  it('本編位置で拡大率を変えても撮影用フレームを見せない', async () => {
    useMediaStore.setState({
      mediaItems: [
        {
          id: 'clip-1',
          type: 'image',
          file: new File(['x'], 'a.png', { type: 'image/png' }),
          url: 'blob:a',
          duration: clipsDuration,
          trimStart: 0,
          trimEnd: clipsDuration,
          volume: 1,
          isMuted: false,
          fadeIn: false,
          fadeOut: false,
          fadeInDuration: 1,
          fadeOutDuration: 1,
          scale: 1,
          positionX: 50,
          positionY: 50,
          rotation: 0,
          blur: 0,
        } as unknown as MediaItem,
      ],
      totalDuration: clipsDuration,
    } as never);

    renderApp();
    await waitFor(() => expect(renderFrameSpy).toHaveBeenCalled());

    // 本編の途中（先頭付近ではない位置）を表示中にする
    act(() => {
      useUIStore.getState().setCurrentTime(3);
    });
    await waitFor(() => expect(useUIStore.getState().currentTime).toBe(3));

    renderFrameSpy.mockClear();

    act(() => {
      const target = useMediaStore.getState().mediaItems[0];
      useMediaStore.getState().updateScale(target.id, 2.5);
    });

    await new Promise((resolve) => setTimeout(resolve, 600));

    // 先頭(0.2秒付近)を描いたまま次の描画へ進むとチラつく
    expect(everLeftCaptureFrameVisible()).toBe(false);
  });
});
