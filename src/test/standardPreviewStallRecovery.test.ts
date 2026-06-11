import { describe, expect, it } from 'vitest';

import {
  getStandardPreviewStallKickDecision,
  shouldDrawFadeStallSnapshotFrame,
  STANDARD_PREVIEW_STALL_KICK_AFTER_MS,
  STANDARD_PREVIEW_STALL_KICK_INTERVAL_MS,
  type StandardPreviewStallKickOptions,
} from '../flavors/standard/preview/previewPlatform';

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
