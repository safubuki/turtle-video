/**
 * @file videoTitleLivePreview.test.tsx
 * @description タイトル変更がプレビューへリアルタイム反映されることの回帰テスト。
 *
 * 【不具合】タイトルを `videoTitleRef` だけで受け取っていたため、
 * `renderFrame` の useCallback 依存に含まれず、停止中のプレビューでは
 * タイトルを編集しても再描画が起きなかった（キャプションは値としても受け取るため反映されていた）。
 *
 * **実エンジン（standard / apple-safari 双方）の renderFrame** を対象に、
 * videoTitle の変更で識別子が変わることを固定する。これが崩れると
 * TurtleVideo 側の再描画 effect が発火せず、無言でリアルタイム反映が失われる。
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';
import { usePreviewEngine as useStandardPreviewEngine } from '../flavors/standard/preview/usePreviewEngine';
import { usePreviewEngine as useAppleSafariPreviewEngine } from '../flavors/apple-safari/preview/usePreviewEngine';
import type { VideoTitleSettings } from '../types';
import { DEFAULT_VIDEO_TITLE_SETTINGS } from '../utils/videoTitle';
import type { PlatformCapabilities } from '../utils/platform';

const createRef = <T,>(value: T): MutableRefObject<T> => ({ current: value });

const platformCapabilities = {
  isAndroid: false,
  isIosSafari: false,
  isIos: false,
  isSafari: false,
  isMobile: false,
  supportsWebCodecs: true,
  supportsShowSaveFilePicker: false,
  supportsShowOpenFilePicker: false,
} as unknown as PlatformCapabilities;

/**
 * 実エンジンを最小構成で起動し、renderFrame の識別子だけを見る。
 * 描画はしないので Canvas は null のままでよい。
 *
 * **重要**: videoTitle 以外の依存はすべて再レンダー間で同一参照にする。
 * ここで毎回新しいオブジェクト（`[]` や `{}`）を作ると renderFrame が常に
 * 作り直され、videoTitle を依存から外しても検知できないテストになる。
 */
function createStableEngineParams() {
  const stable = {
    captions: [],
    captionSettings: {} as never,
    mediaItemsRef: createRef([]),
    bgmRef: createRef(null),
    narrationsRef: createRef([]),
    captionsRef: createRef([]),
    captionSettingsRef: createRef({} as never),
    videoTitleRef: createRef(DEFAULT_VIDEO_TITLE_SETTINGS as VideoTitleSettings),
    totalDurationRef: createRef(10),
    currentTimeRef: createRef(0),
    canvasRef: createRef(null),
    mediaElementsRef: createRef({}),
    audioCtxRef: createRef(null),
    sourceNodesRef: createRef({}),
    gainNodesRef: createRef({}),
    masterDestRef: createRef(null),
    audioRoutingModeRef: createRef('preview' as const),
    reqIdRef: createRef<number | null>(null),
    startTimeRef: createRef(0),
    audioResumeWaitFramesRef: createRef(0),
    isPlayingRef: createRef(false),
    isSeekingRef: createRef(false),
    isSeekPlaybackPreparingRef: createRef(false),
    endFinalizedRef: createRef(false),
    loopIdRef: createRef(0),
    platformCapabilities,
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
    logDebug: vi.fn(),
  };
  return (videoTitle: VideoTitleSettings) => {
    stable.videoTitleRef.current = videoTitle;
    return { ...stable, videoTitle };
  };
}

describe.each([
  ['standard', useStandardPreviewEngine],
  ['apple-safari', useAppleSafariPreviewEngine],
] as const)('%s エンジン: タイトル変更のリアルタイム反映', (_name, useEngine) => {
  it('videoTitle が変わると renderFrame が作り直される', () => {
    const buildParams = createStableEngineParams();
    const { result, rerender } = renderHook(
      (props: { videoTitle: VideoTitleSettings }) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        useEngine(buildParams(props.videoTitle) as any),
      { initialProps: { videoTitle: DEFAULT_VIDEO_TITLE_SETTINGS } },
    );

    const first = result.current.renderFrame;

    // 文字を入力した（= ストアが新しいオブジェクトを返す）
    rerender({ videoTitle: { ...DEFAULT_VIDEO_TITLE_SETTINGS, text: 'タイトル' } });
    expect(result.current.renderFrame).not.toBe(first);

    // 続けて見た目を変えた場合も再生成される
    const second = result.current.renderFrame;
    rerender({
      videoTitle: { ...DEFAULT_VIDEO_TITLE_SETTINGS, text: 'タイトル', position: 'top' },
    });
    expect(result.current.renderFrame).not.toBe(second);
  });

  it('videoTitle が同一参照なら renderFrame は再生成されない（無駄な再描画をしない）', () => {
    const buildParams = createStableEngineParams();
    const stableTitle = { ...DEFAULT_VIDEO_TITLE_SETTINGS };
    const { result, rerender } = renderHook(
      (props: { videoTitle: VideoTitleSettings }) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        useEngine(buildParams(props.videoTitle) as any),
      { initialProps: { videoTitle: stableTitle } },
    );

    const first = result.current.renderFrame;
    rerender({ videoTitle: stableTitle });
    // このアサーションが「他の依存が毎回作り直されていない」ことも同時に保証する
    expect(result.current.renderFrame).toBe(first);
  });
});
