import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';

import { usePreviewEngine as useStandardPreviewEngine } from '../flavors/standard/preview/usePreviewEngine';
import { usePreviewEngine as useAppleSafariPreviewEngine } from '../flavors/apple-safari/preview/usePreviewEngine';
import { getPreviewPlatformPolicy as getStandardPolicy } from '../flavors/standard/preview/previewPlatform';
import { getPreviewPlatformPolicy as getAppleSafariPolicy } from '../flavors/apple-safari/preview/previewPlatform';
import type { Caption, CaptionSettings, MediaItem } from '../types';
import * as canvasUtils from '../utils/canvas';
import { DEFAULT_VIDEO_TITLE_SETTINGS } from '../utils/videoTitle';
import type { MediaZoomEndpointPreview } from '../utils/mediaZoom';

const createRef = <T,>(current: T): MutableRefObject<T> => ({ current });
type EngineParams = Parameters<typeof useStandardPreviewEngine>[0];

const makeCaption = (id: string, text: string, startTime = 0): Caption => ({
  id, text, startTime, endTime: 10,
  fadeIn: false, fadeOut: false, fadeInDuration: 0.5, fadeOutDuration: 0.5,
});

function createRenderParams(isAppleSafari: boolean, ids: ReadonlySet<string> | null) {
  const captions = [
    makeCaption('existing', '既存のキャプション'),
    makeCaption('confirmed', '今回確定したキャプション'),
    makeCaption('future', 'まだ表示区間外のキャプション', 7),
  ];
  const settings: CaptionSettings = {
    enabled: true, fontSize: 'medium', fontStyle: 'gothic', textAlign: 'center',
    fontColor: '#FFFFFF', strokeColor: '#000000', strokeWidth: 4,
    position: 'bottom', blur: 0, backgroundEnabled: false,
    backgroundColor: '#000000', backgroundOpacity: 0.5, backgroundRadius: 0,
    bulkFadeIn: false, bulkFadeOut: false, bulkFadeInDuration: 0.5, bulkFadeOutDuration: 0.5,
  };
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const drawImage = vi.fn();
  const context = {
    canvas, drawImage, fillRect: vi.fn(), clearRect: vi.fn(),
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(),
    globalAlpha: 1, filter: 'none', fillStyle: '#000000',
    imageSmoothingEnabled: true, imageSmoothingQuality: 'low',
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, 'getContext').mockReturnValue(context);
  const previewCaptionIdsRef = createRef(ids);
  const capabilities = { isAndroid: !isAppleSafari, isIosSafari: isAppleSafari };
  const getPolicy = isAppleSafari ? getAppleSafariPolicy : getStandardPolicy;
  const params: EngineParams = {
    captions, captionSettings: settings,
    captionsRef: createRef(captions), captionSettingsRef: createRef(settings), previewCaptionIdsRef,
    videoTitle: DEFAULT_VIDEO_TITLE_SETTINGS, videoTitleRef: createRef(DEFAULT_VIDEO_TITLE_SETTINGS),
    mediaItemsRef: createRef([]), bgmRef: createRef(null), narrationsRef: createRef([]),
    totalDurationRef: createRef(10), currentTimeRef: createRef(5), canvasRef: createRef(canvas),
    mediaElementsRef: createRef({}), audioCtxRef: createRef(null),
    sourceNodesRef: createRef({}), gainNodesRef: createRef({}), masterDestRef: createRef(null),
    audioRoutingModeRef: createRef('preview'), reqIdRef: createRef(null), startTimeRef: createRef(0),
    audioResumeWaitFramesRef: createRef(0), recorderRef: createRef(null), loopIdRef: createRef(0),
    isPlayingRef: createRef(false), isSeekingRef: createRef(false), isSeekPlaybackPreparingRef: createRef(false),
    activeVideoIdRef: createRef(null), videoRecoveryAttemptsRef: createRef({}),
    exportPlayFailedRef: createRef({}), exportFallbackSeekAtRef: createRef({}),
    seekingVideosRef: createRef(new Set()), pendingSeekRef: createRef(null),
    wasPlayingBeforeSeekRef: createRef(false), pendingSeekTimeoutRef: createRef(null),
    previewPlaybackAttemptRef: createRef(0), requestPreviewAudioRouteRefreshRef: createRef(() => {}),
    primePreviewAudioOnlyTracksAtTimeRef: createRef(() => {}), endFinalizedRef: createRef(false),
    previewPlatformPolicy: getPolicy({ ...capabilities, audioContextMayInterrupt: isAppleSafari }),
    platformCapabilities: capabilities, setVideoDuration: vi.fn(), setCurrentTime: vi.fn(),
    setProcessing: vi.fn(), setPreviewPlaying: vi.fn(), setLoading: vi.fn(),
    setExportPreparationStep: vi.fn(), setExportUrl: vi.fn(), setExportExt: vi.fn(), clearExport: vi.fn(),
    setError: vi.fn(), play: vi.fn(), pause: vi.fn(), getAudioContext: vi.fn(),
    cancelPendingPausedSeekWait: vi.fn(), cancelPendingSeekPlaybackPrepare: vi.fn(),
    detachGlobalSeekEndListeners: vi.fn(), ensureAudioNodeForElement: vi.fn(() => false),
    detachAudioNode: vi.fn(), preparePreviewAudioNodesForTime: vi.fn(() => ({
      activeVideoId: null, audibleSourceCount: 0, requiresWebAudio: false,
    })),
    preparePreviewAudioNodesForUpcomingVideos: vi.fn(), primePreviewAudioOnlyTracksAtTime: vi.fn(),
    resetInactiveVideos: vi.fn(), startWebCodecsExport: vi.fn(), stopWebCodecsExport: vi.fn(),
    completeWebCodecsExport: vi.fn(), logInfo: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn(),
  };
  const drawnTexts = () => drawImage.mock.calls.map(([source]) => (source as HTMLCanvasElement).dataset.captionText);
  return { params, drawImage, drawnTexts, previewCaptionIdsRef, context };
}

beforeEach(() => {
  // 描画対象を識別するため glyph の画像作成だけ差し替え、engine の選別・時刻判定・描画は本物を使う。
  const createGlyph = (options: canvasUtils.CaptionGlyphOptions) => {
    const glyph = document.createElement('canvas');
    glyph.width = 200;
    glyph.height = 60;
    glyph.dataset.captionText = options.text;
    return glyph;
  };
  vi.spyOn(canvasUtils, 'createCaptionGlyphCanvas').mockImplementation(createGlyph);
  vi.spyOn(canvasUtils, 'getOrCreateCaptionGlyphCanvas').mockImplementation(createGlyph);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each([
  ['standard', useStandardPreviewEngine, false],
  ['apple-safari', useAppleSafariPreviewEngine, true],
] as const)('%s の実 renderFrame: タイミング打ち表示（Issue #237）', (_name, useEngine, isAppleSafari) => {
  it('端点確認は選んだ素材を先頭・末尾の正確な倍率で表示し、フェード・境界・再生・書き出しを分離する', () => {
    const { params, context, drawImage } = createRenderParams(isAppleSafari, new Set());
    const images = [document.createElement('img'), document.createElement('img')];
    for (const image of images) Object.defineProperties(image, {
      naturalWidth: { value: 1280 }, naturalHeight: { value: 720 }, complete: { value: true },
    });
    const base: MediaItem = {
      id: 'zoom-a', type: 'image', file: new File(['x'], 'still.png'), url: 'blob:still',
      scale: 1.4, duration: 5, originalDuration: 0, trimStart: 0, trimEnd: 0,
      positionX: 0, positionY: 0, rotation: 0, blur: 0,
      volume: 1, isMuted: false, fadeIn: true, fadeOut: true, fadeInDuration: 1, fadeOutDuration: 1,
      isLocked: false, isTransformOpen: false,
      zoomDirection: 'in', zoomStartScale: 1.4, zoomEndScale: 1.8,
    };
    const next = { ...base, id: 'zoom-b', scale: 2, zoomStartScale: 2, zoomEndScale: 3 };
    params.mediaItemsRef.current = [base, next];
    params.mediaElementsRef.current = { 'zoom-a': images[0], 'zoom-b': images[1] };
    params.zoomEndpointPreviewRef = createRef<MediaZoomEndpointPreview | null>({ id: 'zoom-a', endpoint: 'end' });
    const before = JSON.stringify(params.mediaItemsRef.current);
    const alphas: number[] = [];
    drawImage.mockImplementation((source) => { if (images.includes(source as HTMLImageElement)) alphas.push(context.globalAlpha); });
    const { result } = renderHook(() => useEngine(params));
    const scaleSpy = vi.mocked(context.scale);

    // カード境界そのものでも「次のカード」へ切り替わらず、終了180%を表示する。
    result.current.renderFrame(5, false, false);
    expect(drawImage).toHaveBeenLastCalledWith(images[0], expect.any(Number), expect.any(Number), 1280, 720);
    expect(scaleSpy).toHaveBeenLastCalledWith(1.8, 1.8);
    expect(alphas[alphas.length - 1]).toBe(1);
    params.zoomEndpointPreviewRef.current = { id: 'zoom-b', endpoint: 'start' };
    result.current.renderFrame(5, false, false);
    expect(drawImage).toHaveBeenLastCalledWith(images[1], expect.any(Number), expect.any(Number), 1280, 720);
    expect(scaleSpy).toHaveBeenLastCalledWith(2, 2);
    expect(alphas[alphas.length - 1]).toBe(1);

    // 操作中に終了倍率を変えると最新値へ追従する。
    params.zoomEndpointPreviewRef.current = { id: 'zoom-a', endpoint: 'end' };
    params.mediaItemsRef.current[0] = { ...base, zoomEndScale: 1.9 };
    result.current.renderFrame(4.999, false, false);
    expect(scaleSpy).toHaveBeenLastCalledWith(1.9, 1.9);
    params.mediaItemsRef.current[0] = base;

    // 再生・書き出し・確認解除は通常の時刻とフェードに戻る。
    for (const [playing, exporting] of [[true, false], [false, true]]) {
      result.current.renderFrame(5.5, playing, exporting);
      expect(scaleSpy).toHaveBeenLastCalledWith(2.1, 2.1);
      expect(alphas[alphas.length - 1]).toBeCloseTo(0.5);
    }
    params.zoomEndpointPreviewRef.current = null;
    result.current.renderFrame(5.5, false, false);
    expect(scaleSpy).toHaveBeenLastCalledWith(2.1, 2.1);
    expect(alphas[alphas.length - 1]).toBeCloseTo(0.5);
    expect(JSON.stringify(params.mediaItemsRef.current)).toBe(before);

    // standard のディゾルブ中でも、別のカードを混ぜず選んだカードだけを表示する。
    if (!isAppleSafari) {
      for (const type of ['dissolve', 'fade-black', 'fade-white'] as const) {
        params.mediaItemsRef.current[0] = { ...base, transitionToNext: { type, duration: 1 } };
        params.totalDurationRef.current = type === 'dissolve' ? 9 : 10;
        params.zoomEndpointPreviewRef.current = { id: 'zoom-a', endpoint: 'end' };
        drawImage.mockClear();
        vi.mocked(context.fillRect).mockClear();
        result.current.renderFrame(4.999, false, false);
        expect(drawImage).toHaveBeenCalledTimes(1);
        expect(context.fillRect).toHaveBeenCalledTimes(1);
        expect(scaleSpy).toHaveBeenLastCalledWith(1.8, 1.8);
        expect(alphas[alphas.length - 1]).toBe(1);
      }
    }
    params.zoomEndpointPreviewRef.current = { id: 'zoom-a', endpoint: 'start' };
    result.current.renderFrame(0, false, false);
    expect(scaleSpy).toHaveBeenLastCalledWith(1.4, 1.4);
    expect(alphas[alphas.length - 1]).toBe(1);
  });
  it('実効ズームの分割境界・固定倍率はプレビューと書き出しで一致する（#249 / #250）', () => {
    const { params, context } = createRenderParams(isAppleSafari, new Set());
    const image = document.createElement('img');
    Object.defineProperties(image, {
      naturalWidth: { value: 1280 }, naturalHeight: { value: 720 }, complete: { value: true },
    });
    const base: MediaItem = {
      id: 'zoom-a', type: 'image', file: new File(['x'], 'still.png'), url: 'blob:still',
      scale: 1.4, duration: 5, originalDuration: 0, trimStart: 0, trimEnd: 0,
      positionX: 0, positionY: 0, rotation: 0, blur: 0,
      volume: 1, isMuted: false, fadeIn: false, fadeOut: false, fadeInDuration: 0.5, fadeOutDuration: 0.5,
      isLocked: false, isTransformOpen: false,
      zoomDirection: 'in', zoomStartScale: 1.4, zoomEndScale: 1.61,
    };
    params.mediaItemsRef.current = [base, { ...base, id: 'zoom-b', zoomStartScale: 1.61, zoomEndScale: 1.82 }];
    params.mediaElementsRef.current = { 'zoom-a': image, 'zoom-b': image };
    const { result } = renderHook(() => useEngine(params));
    const scaleSpy = vi.mocked(context.scale);
    for (const exporting of [false, true]) {
      for (const [time, scale] of [[2.5, 1.505], [5 - 1e-6, 1.61], [5, 1.61], [7.5, 1.715]]) {
        scaleSpy.mockClear();
        result.current.renderFrame(time, exporting, exporting);
        expect(scaleSpy).toHaveBeenLastCalledWith(expect.closeTo(scale, 5), expect.closeTo(scale, 5));
      }
    }
    // 最新refで固定へ変更し、基準の140%を再度掛けない。
    params.mediaItemsRef.current[1] = { ...base, id: 'zoom-b', zoomDirection: 'none', zoomStartScale: 1.82, zoomEndScale: 1.82 };
    for (const exporting of [false, true]) {
      scaleSpy.mockClear();
      result.current.renderFrame(7.5, exporting, exporting);
      expect(scaleSpy).toHaveBeenLastCalledWith(expect.closeTo(1.82), expect.closeTo(1.82));
    }
  });
  it('開始・確定・終了の最新 ref を描画へ反映し、書き出しでは全件を表示する', () => {
    const { params, drawImage, drawnTexts, previewCaptionIdsRef } = createRenderParams(isAppleSafari, new Set());
    const beforeCaptions = JSON.stringify(params.captions);
    const { result } = renderHook(() => useEngine(params));

    result.current.renderFrame(5, false, false);
    expect(drawnTexts()).toEqual([]);

    previewCaptionIdsRef.current = new Set(['confirmed', 'future']);
    drawImage.mockClear();
    result.current.renderFrame(5, false, false);
    expect(drawnTexts()).toEqual(['今回確定したキャプション']);

    previewCaptionIdsRef.current = null;
    drawImage.mockClear();
    result.current.renderFrame(5, false, false);
    expect(drawnTexts()).toEqual(['既存のキャプション', '今回確定したキャプション']);

    previewCaptionIdsRef.current = new Set();
    drawImage.mockClear();
    result.current.renderFrame(5, true, true);
    expect(drawnTexts()).toEqual(['既存のキャプション', '今回確定したキャプション']);
    expect(JSON.stringify(params.captionsRef.current)).toBe(beforeCaptions);
    expect(params.captionsRef.current).toBe(params.captions);
  });

  it('終了未確定の対象は元の終了と終了フェードを超えて描き、他と書き出しは通常区間のまま', () => {
    const { params, drawImage, drawnTexts, previewCaptionIdsRef } = createRenderParams(
      isAppleSafari,
      new Set(['confirmed', 'existing']),
    );
    params.captions[0].endTime = 4;
    params.captions[1].endTime = 3;
    params.captions[2].startTime = 0;
    params.captions[2].endTime = 1;
    params.captionSettings.bulkFadeOut = true;
    params.captionSettings.bulkFadeOutDuration = 1;
    const holdRef = createRef<string | null>('future');
    params.stampHoldOpenCaptionIdRef = holdRef;
    const beforeCaptions = JSON.stringify(params.captions);
    const { result } = renderHook(() => useEngine(params));

    result.current.renderFrame(3.5, false, false);
    expect(drawnTexts()).toEqual(['既存のキャプション']);

    holdRef.current = 'confirmed';
    drawImage.mockClear();
    result.current.renderFrame(3.5, false, false);
    expect(drawnTexts()).toEqual(['既存のキャプション', '今回確定したキャプション']);

    holdRef.current = null;
    drawImage.mockClear();
    result.current.renderFrame(3.5, false, false);
    expect(drawnTexts()).toEqual(['既存のキャプション']);

    holdRef.current = 'confirmed';
    previewCaptionIdsRef.current = null;
    drawImage.mockClear();
    result.current.renderFrame(5, false, false);
    expect(drawnTexts()).toEqual([]);

    previewCaptionIdsRef.current = new Set(['confirmed', 'existing']);
    drawImage.mockClear();
    result.current.renderFrame(3.5, true, true);
    expect(drawnTexts()).toEqual(['既存のキャプション']);
    expect(JSON.stringify(params.captionsRef.current)).toBe(beforeCaptions);
  });

  it('optional ref を渡さない既存の呼び出しも全件を通常表示する', () => {
    const { params, drawnTexts } = createRenderParams(isAppleSafari, new Set());
    delete params.previewCaptionIdsRef;
    const { result } = renderHook(() => useEngine(params));
    result.current.renderFrame(5, false, false);
    expect(drawnTexts()).toEqual(['既存のキャプション', '今回確定したキャプション']);
  });
});
