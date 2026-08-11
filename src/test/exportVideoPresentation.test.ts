import { describe, expect, it, vi } from 'vitest';

import {
  createExportVideoPresentationMonitor,
  getStandardExportVideoPresentationDecision,
  type ExportVideoPresentationDecisionOptions,
} from '../flavors/standard/preview/exportVideoPresentation';

const base: ExportVideoPresentationDecisionOptions = {
  exportFrameRate: 24,
  sourceFrameRate: 24,
  playbackSpeed: 1,
  clipLocalTime: 1,
  clipDuration: 10,
  targetSourceTime: 1,
  snapshot: {
    callbackSerial: 25,
    mediaTimeSec: 1,
    presentedFrames: 25,
  },
  lastPublishedSnapshot: {
    callbackSerial: 24,
    mediaTimeSec: 23 / 24,
    presentedFrames: 24,
  },
  stalledForMs: 0,
};

describe('getStandardExportVideoPresentationDecision', () => {
  it('元動画と出力の実効FPSが一致する場合だけ実提示フレームを待つ', () => {
    expect(getStandardExportVideoPresentationDecision(base)).toMatchObject({
      enabled: true,
      shouldWait: false,
      reason: 'ready',
    });
    expect(getStandardExportVideoPresentationDecision({
      ...base,
      exportFrameRate: 30,
    })).toMatchObject({
      enabled: false,
      shouldWait: false,
      reason: 'not-applicable',
    });
  });

  it('最初の提示通知と次の提示フレームが来るまではCFR slotを公開しない', () => {
    expect(getStandardExportVideoPresentationDecision({
      ...base,
      snapshot: null,
      lastPublishedSnapshot: null,
    })).toMatchObject({
      shouldWait: true,
      reason: 'waiting-first-presented-frame',
    });
    expect(getStandardExportVideoPresentationDecision({
      ...base,
      snapshot: base.lastPublishedSnapshot,
    })).toMatchObject({
      shouldWait: true,
      reason: 'waiting-next-presented-frame',
    });
  });

  it('currentTimeが進んでも実画像が遅れている状態をmediaTimeで検出する', () => {
    expect(getStandardExportVideoPresentationDecision({
      ...base,
      snapshot: {
        callbackSerial: 25,
        mediaTimeSec: 22 / 24,
        presentedFrames: 25,
      },
    })).toMatchObject({
      shouldWait: true,
      shouldResync: false,
      reason: 'presented-frame-behind',
    });
  });

  it('実画像が対象slotを飛び越した場合は単発再同期を要求する', () => {
    expect(getStandardExportVideoPresentationDecision({
      ...base,
      snapshot: {
        callbackSerial: 26,
        mediaTimeSec: 26 / 24,
        presentedFrames: 26,
      },
    })).toMatchObject({
      shouldWait: true,
      shouldResync: true,
      reason: 'presented-frame-ahead',
    });
  });

  it('コンテナ尺端数によるclip末尾の最終絵保持は妨げない', () => {
    expect(getStandardExportVideoPresentationDecision({
      ...base,
      clipLocalTime: 10,
      clipDuration: 10.005,
      targetSourceTime: 10,
    })).toMatchObject({
      enabled: false,
      shouldWait: false,
      reason: 'not-applicable',
    });
  });

  it('提示通知が壊れた環境ではtimeout後に現行経路へ戻す', () => {
    expect(getStandardExportVideoPresentationDecision({
      ...base,
      snapshot: null,
      stalledForMs: 2000,
    })).toMatchObject({
      enabled: true,
      shouldWait: false,
      timedOut: true,
      reason: 'timeout',
    });
  });
});

describe('createExportVideoPresentationMonitor', () => {
  it('rVFCの実提示mediaTimeを更新し、stopで予約を解除する', () => {
    type TestVideoFrameCallback = (
      now: number,
      metadata: { mediaTime: number; presentedFrames: number },
    ) => void;
    const callbackRef: { current: TestVideoFrameCallback | null } = { current: null };
    const requestVideoFrameCallback = vi.fn((next: TestVideoFrameCallback) => {
      callbackRef.current = next;
      return requestVideoFrameCallback.mock.calls.length;
    });
    const cancelVideoFrameCallback = vi.fn();
    const video = {
      requestVideoFrameCallback,
      cancelVideoFrameCallback,
    } as unknown as HTMLVideoElement;
    const monitor = createExportVideoPresentationMonitor();

    expect(monitor.observe('video-1', video)).toBe(true);
    expect(monitor.isObserved('video-1')).toBe(true);
    expect(monitor.getSnapshot('video-1')).toBeNull();

    callbackRef.current?.(10, { mediaTime: 1 / 24, presentedFrames: 2 });
    expect(monitor.getSnapshot('video-1')).toEqual({
      callbackSerial: 1,
      mediaTimeSec: 1 / 24,
      presentedFrames: 2,
    });
    expect(requestVideoFrameCallback).toHaveBeenCalledTimes(2);

    monitor.stop();
    expect(monitor.isObserved('video-1')).toBe(false);
    expect(cancelVideoFrameCallback).toHaveBeenCalledTimes(1);
  });

  it('rVFC未対応要素は監視せず現行動作へフォールバックする', () => {
    const monitor = createExportVideoPresentationMonitor();
    expect(monitor.observe('video-1', {} as HTMLVideoElement)).toBe(false);
    expect(monitor.isObserved('video-1')).toBe(false);
  });
});
