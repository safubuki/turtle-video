import { describe, expect, it } from 'vitest';

import {
  getStandardExportVideoBoundaryStallDecision,
  getStandardPreviewStallKickDecision,
  shouldDrawFadeStallSnapshotFrame,
  STANDARD_EXPORT_VIDEO_BOUNDARY_STALL_TIMEOUT_MS,
  STANDARD_PREVIEW_STALL_KICK_AFTER_MS,
  STANDARD_PREVIEW_STALL_KICK_INTERVAL_MS,
  type StandardPreviewStallKickOptions,
} from '../flavors/standard/preview/previewPlatform';

const exportBoundaryBase = {
  isExporting: true,
  activeItemType: 'video' as const,
  previousItemType: 'video' as const,
  clipLocalTime: 0.02,
  videoReadyState: 1,
  videoPaused: false,
  videoSeeking: false,
  videoWidth: 1280,
  videoHeight: 720,
  videoHasError: false,
  videoCurrentTime: 1,
  targetTime: 1.02,
  stalledForMs: 0,
};

function createKickOptions(
  overrides: Partial<StandardPreviewStallKickOptions> = {},
): StandardPreviewStallKickOptions {
  return {
    isExporting: false,
    isActivePlaying: true,
    isUserSeeking: false,
    videoSeeking: true,
    videoReadyState: 1,
    videoHasError: false,
    stalledForMs: STANDARD_PREVIEW_STALL_KICK_AFTER_MS,
    sinceLastKickMs: Number.POSITIVE_INFINITY,
    ...overrides,
  };
}

describe('getStandardPreviewStallKickDecision', () => {
  it('seeking のまま閾値時間を超えたら seek-stuck で kick する', () => {
    const decision = getStandardPreviewStallKickDecision(createKickOptions());
    expect(decision).toEqual({ shouldKick: true, reason: 'seek-stuck' });
  });

  it('seeking ではないが readyState が低いままなら ready-state-stuck で kick する', () => {
    const decision = getStandardPreviewStallKickDecision(createKickOptions({
      videoSeeking: false,
      videoReadyState: 1,
    }));
    expect(decision).toEqual({ shouldKick: true, reason: 'ready-state-stuck' });
  });

  it('readyState 0 (メタデータ未取得) は load() 回復経路に委ねて kick しない', () => {
    const decision = getStandardPreviewStallKickDecision(createKickOptions({
      videoSeeking: false,
      videoReadyState: 0,
    }));
    expect(decision.shouldKick).toBe(false);
  });

  it('閾値時間前は kick しない', () => {
    const decision = getStandardPreviewStallKickDecision(createKickOptions({
      stalledForMs: STANDARD_PREVIEW_STALL_KICK_AFTER_MS - 1,
    }));
    expect(decision.shouldKick).toBe(false);
  });

  it('前回 kick からの最小間隔を守る', () => {
    const decision = getStandardPreviewStallKickDecision(createKickOptions({
      sinceLastKickMs: STANDARD_PREVIEW_STALL_KICK_INTERVAL_MS - 1,
    }));
    expect(decision.shouldKick).toBe(false);

    const allowed = getStandardPreviewStallKickDecision(createKickOptions({
      sinceLastKickMs: STANDARD_PREVIEW_STALL_KICK_INTERVAL_MS,
    }));
    expect(allowed.shouldKick).toBe(true);
  });

  it('export 中・停止中・ユーザーシーク中・エラー時は kick しない', () => {
    expect(getStandardPreviewStallKickDecision(createKickOptions({ isExporting: true })).shouldKick).toBe(false);
    expect(getStandardPreviewStallKickDecision(createKickOptions({ isActivePlaying: false })).shouldKick).toBe(false);
    expect(getStandardPreviewStallKickDecision(createKickOptions({ isUserSeeking: true })).shouldKick).toBe(false);
    expect(getStandardPreviewStallKickDecision(createKickOptions({ videoHasError: true })).shouldKick).toBe(false);
  });

  it('描画可能 (readyState>=2 かつ非 seeking) なら stall とみなさない', () => {
    const decision = getStandardPreviewStallKickDecision(createKickOptions({
      videoSeeking: false,
      videoReadyState: 4,
    }));
    expect(decision.shouldKick).toBe(false);
  });
});

describe('getStandardExportVideoBoundaryStallDecision', () => {
  it('export の video→video 境界で次動画が未デコードなら時計を止める', () => {
    expect(getStandardExportVideoBoundaryStallDecision(exportBoundaryBase)).toEqual({
      shouldPauseTimeline: true,
      timedOut: false,
    });
  });

  it('描画可能かつ同期済みになったら同じ境界位置から再開する', () => {
    expect(getStandardExportVideoBoundaryStallDecision({
      ...exportBoundaryBase,
      videoReadyState: 3,
      videoCurrentTime: 1.02,
    })).toEqual({
      shouldPauseTimeline: false,
      timedOut: false,
    });
    expect(getStandardExportVideoBoundaryStallDecision({
      ...exportBoundaryBase,
      videoReadyState: 3,
      videoCurrentTime: 1.2,
    }).shouldPauseTimeline).toBe(true);
  });

  it('export 開始 video は future data と play 成立まで時計を止める', () => {
    expect(getStandardExportVideoBoundaryStallDecision({
      ...exportBoundaryBase,
      previousItemType: null,
      videoReadyState: 2,
      videoCurrentTime: 1.02,
    }).shouldPauseTimeline).toBe(true);
    expect(getStandardExportVideoBoundaryStallDecision({
      ...exportBoundaryBase,
      previousItemType: null,
      videoReadyState: 3,
      videoPaused: true,
      videoCurrentTime: 1.02,
    }).shouldPauseTimeline).toBe(true);
    expect(getStandardExportVideoBoundaryStallDecision({
      ...exportBoundaryBase,
      previousItemType: null,
      videoReadyState: 3,
      videoCurrentTime: 1.02,
    }).shouldPauseTimeline).toBe(false);
  });

  it('通常 preview・image→video・境界窓の外には波及しない', () => {
    expect(getStandardExportVideoBoundaryStallDecision({
      ...exportBoundaryBase,
      isExporting: false,
    }).shouldPauseTimeline).toBe(false);
    expect(getStandardExportVideoBoundaryStallDecision({
      ...exportBoundaryBase,
      previousItemType: 'image',
    }).shouldPauseTimeline).toBe(false);
    expect(getStandardExportVideoBoundaryStallDecision({
      ...exportBoundaryBase,
      clipLocalTime: 0.51,
    }).shouldPauseTimeline).toBe(false);
  });

  it('素材エラーは待たず、decoder 停滞は timeout 後に従来挙動へ戻す', () => {
    expect(getStandardExportVideoBoundaryStallDecision({
      ...exportBoundaryBase,
      videoHasError: true,
    })).toEqual({ shouldPauseTimeline: false, timedOut: false });
    expect(getStandardExportVideoBoundaryStallDecision({
      ...exportBoundaryBase,
      stalledForMs: STANDARD_EXPORT_VIDEO_BOUNDARY_STALL_TIMEOUT_MS,
    })).toEqual({ shouldPauseTimeline: false, timedOut: true });
  });
});

describe('shouldDrawFadeStallSnapshotFrame', () => {
  const base = {
    isExporting: false,
    isVideoDrawable: false,
    isInFadeRegion: true,
    shouldBlackoutFadeTail: false,
    activeVideoId: 'video-1',
    snapshotVideoId: 'video-1',
    snapshotWidth: 1280,
    snapshotHeight: 720,
  };

  it('fade region 中にデコーダ固着で実フレームが無いときだけスナップショットを描く', () => {
    expect(shouldDrawFadeStallSnapshotFrame(base)).toBe(true);
  });

  it('実フレームが描画可能なら使わない', () => {
    expect(shouldDrawFadeStallSnapshotFrame({ ...base, isVideoDrawable: true })).toBe(false);
  });

  it('fade region 外は holdFrame による canvas 保持に委ねる', () => {
    expect(shouldDrawFadeStallSnapshotFrame({ ...base, isInFadeRegion: false })).toBe(false);
  });

  it('fade 終端の明示的ブラックアウトは仕様通り黒を優先する', () => {
    expect(shouldDrawFadeStallSnapshotFrame({ ...base, shouldBlackoutFadeTail: true })).toBe(false);
  });

  it('export 中は使わない', () => {
    expect(shouldDrawFadeStallSnapshotFrame({ ...base, isExporting: true })).toBe(false);
  });

  it('別動画のスナップショットや空スナップショットは使わない', () => {
    expect(shouldDrawFadeStallSnapshotFrame({ ...base, snapshotVideoId: 'video-2' })).toBe(false);
    expect(shouldDrawFadeStallSnapshotFrame({ ...base, snapshotVideoId: null })).toBe(false);
    expect(shouldDrawFadeStallSnapshotFrame({ ...base, snapshotWidth: 0 })).toBe(false);
    expect(shouldDrawFadeStallSnapshotFrame({ ...base, activeVideoId: null, snapshotVideoId: null })).toBe(false);
  });
});
