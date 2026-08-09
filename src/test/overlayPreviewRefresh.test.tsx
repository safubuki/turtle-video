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
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TurtleVideo from '../components/TurtleVideo';
import type { ExportRuntime } from '../components/turtle-video/exportRuntime';
import type { PreviewRuntime } from '../components/turtle-video/previewRuntime';
import type { SaveRuntime } from '../components/turtle-video/saveRuntime';
import type { PlatformCapabilities } from '../utils/platform';
import { getPreviewPlatformPolicy } from '../utils/previewPlatform';
import {
  useAudioStore,
  useCaptionStore,
  useLogStore,
  useMediaStore,
  useOverlayStore,
  useUIStore,
} from '../stores';
import { DEFAULT_WATERMARK_OVERLAY } from '../utils/watermarkOverlay';
import { DEFAULT_ENDROLL_OVERLAY } from '../utils/endrollOverlay';
import type { MediaItem } from '../types';

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
  return {
    getPlatformCapabilities: vi.fn(() => capabilities),
    getPreviewPlatformPolicy,
    shouldUsePreviewCache: vi.fn(() => false),
    createPreviewCacheKey: vi.fn(() => 'preview-cache-key-test'),
    useInactiveVideoManager: vi.fn(() => ({ resetInactiveVideos: vi.fn() })),
    usePreviewAudioSession: vi.fn(() => ({
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
    })),
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

function renderApp() {
  const capabilities = createCapabilities();
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
      appFlavor="standard"
      previewRuntime={createPreviewRuntime(capabilities)}
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
