import { normalizeSourceFrameRate } from '../../../utils/exportFrameRate';
import { normalizeVideoPlaybackSpeed } from '../../../utils/playbackSpeed';

export const STANDARD_EXPORT_VIDEO_PRESENTATION_WAIT_TIMEOUT_MS = 2000;

export interface ExportVideoPresentationSnapshot {
  callbackSerial: number;
  mediaTimeSec: number;
  presentedFrames: number | null;
}

export interface ExportVideoPresentationDecisionOptions {
  exportFrameRate: number;
  sourceFrameRate: number | null | undefined;
  playbackSpeed: unknown;
  clipLocalTime: number;
  clipDuration: number;
  targetSourceTime: number;
  snapshot: ExportVideoPresentationSnapshot | null;
  lastPublishedSnapshot: ExportVideoPresentationSnapshot | null;
  stalledForMs: number;
  timeoutMs?: number;
}

export interface ExportVideoPresentationDecision {
  enabled: boolean;
  shouldWait: boolean;
  timedOut: boolean;
  shouldResync: boolean;
  reason:
    | 'not-applicable'
    | 'waiting-first-presented-frame'
    | 'waiting-next-presented-frame'
    | 'presented-frame-behind'
    | 'presented-frame-ahead'
    | 'ready'
    | 'timeout';
}

export function shouldUseStandardExportVideoPresentationGate(options: {
  exportFrameRate: number;
  sourceFrameRate: number | null | undefined;
  playbackSpeed: unknown;
}): boolean {
  const sourceFrameRate = normalizeSourceFrameRate(options.sourceFrameRate);
  const exportFrameRate = Number.isFinite(options.exportFrameRate) && options.exportFrameRate > 0
    ? options.exportFrameRate
    : 0;
  const speed = normalizeVideoPlaybackSpeed(options.playbackSpeed);
  const effectiveSourceFrameRate = sourceFrameRate === null
    ? 0
    : sourceFrameRate * speed;
  return exportFrameRate > 0
    && effectiveSourceFrameRate > 0
    && Math.abs(effectiveSourceFrameRate - exportFrameRate) <= 0.05;
}

/**
 * 元動画と出力の実効 FPS が一致するクリップでは、各 CFR slot に別々の元フレームが
 * 対応する。`currentTime` はデコード画像より先行できるため、実際に提示されたフレームを
 * requestVideoFrameCallback で確認できた場合だけ slot を公開する。
 *
 * 異なる FPS の合成では同一元フレームの意図的な複製が必要なので、この厳密ゲートは
 * 適用しない。また clip 末尾 1 slot はコンテナ尺の端数により最終絵の保持が正常なため除外する。
 */
export function getStandardExportVideoPresentationDecision(
  options: ExportVideoPresentationDecisionOptions,
): ExportVideoPresentationDecision {
  const sourceFrameRate = normalizeSourceFrameRate(options.sourceFrameRate);
  const exportFrameRate = Number.isFinite(options.exportFrameRate) && options.exportFrameRate > 0
    ? options.exportFrameRate
    : 0;
  const ratesMatch = shouldUseStandardExportVideoPresentationGate(options);
  const isClipTail = exportFrameRate > 0
    && options.clipDuration - options.clipLocalTime <= 1 / exportFrameRate + 1e-6;

  if (!ratesMatch || isClipTail) {
    return {
      enabled: false,
      shouldWait: false,
      timedOut: false,
      shouldResync: false,
      reason: 'not-applicable',
    };
  }

  const timeoutMs = options.timeoutMs ?? STANDARD_EXPORT_VIDEO_PRESENTATION_WAIT_TIMEOUT_MS;
  if (options.stalledForMs >= timeoutMs) {
    return {
      enabled: true,
      shouldWait: false,
      timedOut: true,
      shouldResync: false,
      reason: 'timeout',
    };
  }

  const snapshot = options.snapshot;
  if (!snapshot) {
    return {
      enabled: true,
      shouldWait: true,
      timedOut: false,
      shouldResync: false,
      reason: 'waiting-first-presented-frame',
    };
  }

  if (
    options.lastPublishedSnapshot
    && snapshot.callbackSerial <= options.lastPublishedSnapshot.callbackSerial
  ) {
    return {
      enabled: true,
      shouldWait: true,
      timedOut: false,
      shouldResync: false,
      reason: 'waiting-next-presented-frame',
    };
  }

  // rVFC の mediaTime は Canvas に渡る実画像の PTS。currentTime では検出できない
  // 「再生時計だけ進み、画像が一つ前」の状態を 1/2 frame より少し広い窓で判定する。
  const sourceFrameDurationSec = 1 / (sourceFrameRate as number);
  const behindToleranceSec = sourceFrameDurationSec * 0.6;
  const aheadToleranceSec = sourceFrameDurationSec * 0.6;
  if (snapshot.mediaTimeSec < options.targetSourceTime - behindToleranceSec) {
    return {
      enabled: true,
      shouldWait: true,
      timedOut: false,
      shouldResync: false,
      reason: 'presented-frame-behind',
    };
  }
  if (snapshot.mediaTimeSec > options.targetSourceTime + aheadToleranceSec) {
    return {
      enabled: true,
      shouldWait: true,
      timedOut: false,
      shouldResync: true,
      reason: 'presented-frame-ahead',
    };
  }

  return {
    enabled: true,
    shouldWait: false,
    timedOut: false,
    shouldResync: false,
    reason: 'ready',
  };
}

type VideoFrameCallbackMetadataLike = Pick<
  VideoFrameCallbackMetadata,
  'mediaTime' | 'presentedFrames'
>;

type ObservableVideoElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadataLike) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

interface ObservedVideoState {
  element: ObservableVideoElement;
  handle: number | null;
  active: boolean;
  snapshot: ExportVideoPresentationSnapshot | null;
}

export interface ExportVideoPresentationMonitor {
  observe: (videoId: string, element: HTMLVideoElement) => boolean;
  isObserved: (videoId: string) => boolean;
  getSnapshot: (videoId: string) => ExportVideoPresentationSnapshot | null;
  stop: () => void;
}

/** standard export 1 セッション分の rVFC 監視。通常 preview には接続しない。 */
export function createExportVideoPresentationMonitor(): ExportVideoPresentationMonitor {
  const states = new Map<string, ObservedVideoState>();

  const cancelState = (state: ObservedVideoState) => {
    state.active = false;
    if (state.handle === null || typeof state.element.cancelVideoFrameCallback !== 'function') return;
    try {
      state.element.cancelVideoFrameCallback(state.handle);
    } catch {
      // 要素破棄済みでも export cleanup は継続する。
    }
    state.handle = null;
  };

  const observe = (videoId: string, element: HTMLVideoElement): boolean => {
    const observable = element as ObservableVideoElement;
    if (typeof observable.requestVideoFrameCallback !== 'function') return false;

    const previous = states.get(videoId);
    if (previous) cancelState(previous);
    const state: ObservedVideoState = {
      element: observable,
      handle: null,
      active: true,
      snapshot: null,
    };
    states.set(videoId, state);

    const requestNext = () => {
      if (!state.active || typeof observable.requestVideoFrameCallback !== 'function') return;
      try {
        state.handle = observable.requestVideoFrameCallback((_now, metadata) => {
          if (!state.active) return;
          const previousSerial = state.snapshot?.callbackSerial ?? 0;
          state.snapshot = {
            callbackSerial: previousSerial + 1,
            mediaTimeSec: Number.isFinite(metadata.mediaTime) ? Math.max(0, metadata.mediaTime) : 0,
            presentedFrames: Number.isFinite(metadata.presentedFrames)
              ? Math.max(0, Math.floor(metadata.presentedFrames))
              : null,
          };
          requestNext();
        });
      } catch {
        state.active = false;
        state.handle = null;
      }
    };
    requestNext();
    return state.active;
  };

  return {
    observe,
    isObserved: (videoId) => states.get(videoId)?.active === true,
    getSnapshot: (videoId) => states.get(videoId)?.snapshot ?? null,
    stop: () => {
      states.forEach(cancelState);
      states.clear();
    },
  };
}
