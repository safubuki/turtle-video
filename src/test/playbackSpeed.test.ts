/**
 * @file playbackSpeed.test.ts
 * @description 動画カード倍速の純ロジック契約テスト
 */
import { describe, expect, it } from 'vitest';
import {
  computeTimelineDurationFromSource,
  formatSpeedBadgeLabel,
  getVideoSourceClipDuration,
  normalizeSpeedBadgeLabelStyle,
  normalizeVideoPlaybackSpeed,
  resolveExportTimelineWallDivisorForItem,
  resolveSpeedAwareVideoSyncThresholdSec,
  resolveSpeedBadgeFadeAlpha,
  resolveSpeedBadgePresetPosition,
  resolveVideoCatchUpPlaybackRate,
  resolveVideoCatchUpState,
  resolveVideoElementPlaybackRateForContext,
  resolveVideoSafeEndSourceTime,
  resolveVideoSourceTime,
  resolveVideoTimelineDuration,
  shouldDrawSpeedBadge,
  wallDeltaToExportTimelineDelta,
  applyVideoElementCatchUpPlaybackRate,
  DEFAULT_SPEED_BADGE_POSITION,
  SPEED_BADGE_CORNER_INSET_PERCENT,
} from '../utils/playbackSpeed';
import { computeVideoTrimFromPreviewPosition } from '../utils/media';

describe('normalizeVideoPlaybackSpeed', () => {
  it('0.5〜8.0 を 0.1 刻みで通し、0.5 未満と不正値は丸める', () => {
    expect(normalizeVideoPlaybackSpeed(1)).toBe(1);
    expect(normalizeVideoPlaybackSpeed(2)).toBe(2);
    expect(normalizeVideoPlaybackSpeed(4)).toBe(4);
    expect(normalizeVideoPlaybackSpeed(8)).toBe(8);
    expect(normalizeVideoPlaybackSpeed('4')).toBe(4);
    expect(normalizeVideoPlaybackSpeed(3)).toBe(3);
    expect(normalizeVideoPlaybackSpeed(1.54)).toBe(1.5);
    expect(normalizeVideoPlaybackSpeed(0.5)).toBe(0.5);
    expect(normalizeVideoPlaybackSpeed(0.1)).toBe(0.5);
    expect(normalizeVideoPlaybackSpeed(undefined)).toBe(1);
    expect(normalizeVideoPlaybackSpeed(0)).toBe(1);
    expect(normalizeVideoPlaybackSpeed(12)).toBe(8);
  });
});

describe('timeline / source 時刻契約', () => {
  it('source 16s を 4x にすると timeline 4s', () => {
    expect(computeTimelineDurationFromSource(16, 4)).toBe(4);
    expect(getVideoSourceClipDuration({ trimStart: 2, trimEnd: 18 })).toBe(16);
    expect(resolveVideoTimelineDuration({
      type: 'video',
      trimStart: 2,
      trimEnd: 18,
      playbackSpeed: 4,
    })).toBe(4);
  });

  it('localTime を speed 倍して sourceTime を返す', () => {
    expect(resolveVideoSourceTime({
      trimStart: 10,
      localTime: 1.5,
      playbackSpeed: 2,
    })).toBe(13);
  });

  it('safe end は trimEnd 直前', () => {
    expect(resolveVideoSafeEndSourceTime({
      trimStart: 0,
      trimEnd: 10,
      timelineDuration: 5,
      playbackSpeed: 2,
    })).toBeCloseTo(9.999, 5);
  });
});

describe('プレビュー位置からのトリム', () => {
  it('倍速時はタイムライン相対位置をソースへ換算する', () => {
    // ソース 0–10s、2x → タイムライン 5s。真ん中 2.5s はソース 5s
    const next = computeVideoTrimFromPreviewPosition({
      sourceTrimStart: 0,
      sourceTrimEnd: 10,
      originalDuration: 10,
      previewPosition: 2.5,
      type: 'end',
      playbackSpeed: 2,
    });
    expect(next).not.toBeNull();
    expect(next!.end).toBeCloseTo(5, 5);
    expect(next!.start).toBe(0);
  });
});

describe('速度バッジ', () => {
  it('showSpeedBadge かつ等倍以外のとき描画対象（スロー含む）', () => {
    expect(shouldDrawSpeedBadge({
      type: 'video',
      playbackSpeed: 2,
      showSpeedBadge: true,
    })).toBe(true);
    expect(shouldDrawSpeedBadge({
      type: 'video',
      playbackSpeed: 0.5,
      showSpeedBadge: true,
    })).toBe(true);
    expect(shouldDrawSpeedBadge({
      type: 'video',
      playbackSpeed: 1,
      showSpeedBadge: true,
    })).toBe(false);
    expect(shouldDrawSpeedBadge({
      type: 'video',
      playbackSpeed: 4,
      showSpeedBadge: false,
    })).toBe(false);
    expect(shouldDrawSpeedBadge({
      type: 'image',
      playbackSpeed: 4,
      showSpeedBadge: true,
    })).toBe(false);
  });

  it('四隅プリセットが既定座標を返す', () => {
    const inset = SPEED_BADGE_CORNER_INSET_PERCENT;
    expect(DEFAULT_SPEED_BADGE_POSITION).toEqual({ x: 100 - inset, y: inset });
    expect(resolveSpeedBadgePresetPosition('top-right')).toEqual({ x: 91, y: 9 });
    expect(resolveSpeedBadgePresetPosition('top-left')).toEqual({ x: 9, y: 9 });
    expect(resolveSpeedBadgePresetPosition('bottom-left')).toEqual({ x: 9, y: 91 });
    expect(resolveSpeedBadgePresetPosition('bottom-right')).toEqual({ x: 91, y: 91 });
  });

  it('バッジ文言は既定が日本語、en で 2x。0.1 単位も表示する', () => {
    expect(normalizeSpeedBadgeLabelStyle(undefined)).toBe('ja');
    expect(formatSpeedBadgeLabel(2, 'ja')).toBe('\u00BB 2倍速');
    expect(formatSpeedBadgeLabel(4, undefined)).toBe('\u00BB 4倍速');
    expect(formatSpeedBadgeLabel(1.5, 'ja')).toBe('\u00BB 1.5倍速');
    expect(formatSpeedBadgeLabel(0.5, 'en')).toBe('\u00BB 0.5x');
    expect(formatSpeedBadgeLabel(2, 'en')).toBe('\u00BB 2x');
  });

  it('対象動画のフェード設定と同じアルファ値を返す', () => {
    const item = {
      duration: 10,
      fadeIn: true,
      fadeOut: true,
      fadeInDuration: 2,
      fadeOutDuration: 2,
    };
    expect(resolveSpeedBadgeFadeAlpha(item, 0)).toBe(0);
    expect(resolveSpeedBadgeFadeAlpha(item, 1)).toBeCloseTo(0.5);
    expect(resolveSpeedBadgeFadeAlpha(item, 5)).toBe(1);
    expect(resolveSpeedBadgeFadeAlpha(item, 9)).toBeCloseTo(0.5);
    expect(resolveSpeedBadgeFadeAlpha(item, 10)).toBe(0);
  });

  it('フェード合計がクリップ尺を超える場合は映像と同じ比率で按分する', () => {
    const item = {
      duration: 2,
      fadeIn: true,
      fadeOut: true,
      fadeInDuration: 2,
      fadeOutDuration: 2,
    };
    expect(resolveSpeedBadgeFadeAlpha(item, 0.5)).toBeCloseTo(0.5);
    expect(resolveSpeedBadgeFadeAlpha(item, 1)).toBe(1);
    expect(resolveSpeedBadgeFadeAlpha(item, 1.5)).toBeCloseTo(0.5);
  });

  it('倍速時の export 同期しきい値は速度に応じて緩める', () => {
    expect(resolveSpeedAwareVideoSyncThresholdSec(0.5, 1)).toBe(0.5);
    expect(resolveSpeedAwareVideoSyncThresholdSec(0.5, 2)).toBeGreaterThan(0.5);
    expect(resolveSpeedAwareVideoSyncThresholdSec(0.5, 4)).toBeGreaterThan(
      resolveSpeedAwareVideoSyncThresholdSec(0.5, 2),
    );
  });

  it('export の倍速は 1x 連続再生 + 壁時計 dilation（seek 駆動にしない）', () => {
    expect(resolveVideoElementPlaybackRateForContext(true, 4)).toBe(1);
    expect(resolveVideoElementPlaybackRateForContext(true, 8)).toBe(1);
    expect(resolveVideoElementPlaybackRateForContext(true, 1.5)).toBe(1);
    expect(resolveVideoElementPlaybackRateForContext(false, 4)).toBe(4);
    expect(resolveExportTimelineWallDivisorForItem({
      type: 'video',
      playbackSpeed: 4,
    })).toBe(4);
    expect(resolveExportTimelineWallDivisorForItem({ type: 'image' })).toBe(1);
    // 壁 4 秒・4x → タイムライン 1 秒
    expect(wallDeltaToExportTimelineDelta(4, 4)).toBe(1);
    // 等倍は 1:1
    expect(wallDeltaToExportTimelineDelta(2.5, 1)).toBe(2.5);
  });

  it('export のスローは native playbackRate で、壁時計はタイムラインと 1:1', () => {
    expect(resolveVideoElementPlaybackRateForContext(true, 0.5)).toBe(0.5);
    expect(resolveVideoElementPlaybackRateForContext(false, 0.5)).toBe(0.5);
    expect(resolveExportTimelineWallDivisorForItem({
      type: 'video',
      playbackSpeed: 0.5,
    })).toBe(1);
  });
});

describe('resolveVideoCatchUpPlaybackRate（プレビューで映像をタイムライン時計へ寄せる）', () => {
  const base = { isExporting: false, canCatchUp: true };

  it('0.5x で映像が 0.1 秒（ソース）遅れている＝タイムライン 0.2 秒遅れなら固定 +6% で速める', () => {
    const rate = resolveVideoCatchUpPlaybackRate({
      ...base, playbackSpeed: 0.5, videoCurrentTime: 4.9, targetSourceTime: 5.0,
    });
    expect(rate).toBeCloseTo(0.53, 4);
  });

  it('映像が進んでいるときは固定 -6% で遅くする', () => {
    const rate = resolveVideoCatchUpPlaybackRate({
      ...base, playbackSpeed: 1, videoCurrentTime: 5.2, targetSourceTime: 5.0,
    });
    expect(rate).toBeCloseTo(0.94, 4);
  });

  it('クリップ境界の開始遅れ程度（0.12 秒未満）は補正しない（rate を切り替えると音が乱れる・13-286）', () => {
    expect(resolveVideoCatchUpPlaybackRate({
      ...base, playbackSpeed: 1, videoCurrentTime: 4.9, targetSourceTime: 5.0,
    })).toBe(1);
    expect(resolveVideoCatchUpPlaybackRate({
      ...base, playbackSpeed: 1, videoCurrentTime: 4.97, targetSourceTime: 5.0,
    })).toBe(1);
    // 0.5x のソース 0.05s はタイムライン 0.1s
    expect(resolveVideoCatchUpPlaybackRate({
      ...base, playbackSpeed: 0.5, videoCurrentTime: 4.95, targetSourceTime: 5.0,
    })).toBe(0.5);
  });

  it('補正は同じ速度のまま 0.03 秒以内まで続け、そこで設定速度へ戻す（境目で往復しない）', () => {
    // 補正中なら 0.08 秒遅れでも同じ +6% を保つ
    expect(resolveVideoCatchUpState({
      ...base, playbackSpeed: 1, videoCurrentTime: 4.92, targetSourceTime: 5.0, wasCatchingUp: true,
    })).toEqual({ rate: 1.06, isCatchingUp: true });
    // 補正していなければ 0.08 秒は補正しない
    expect(resolveVideoCatchUpState({
      ...base, playbackSpeed: 1, videoCurrentTime: 4.92, targetSourceTime: 5.0, wasCatchingUp: false,
    })).toEqual({ rate: 1, isCatchingUp: false });
    // 0.03 秒未満まで寄ったら終了
    expect(resolveVideoCatchUpState({
      ...base, playbackSpeed: 1, videoCurrentTime: 4.98, targetSourceTime: 5.0, wasCatchingUp: true,
    })).toEqual({ rate: 1, isCatchingUp: false });
  });

  it('ずれが 0.3 秒から縮んでいく間、rate は「開始」と「終了」の 2 回しか変わらない', () => {
    let wasCatchingUp = false;
    let previousRate = 1;
    let changes = 0;
    for (let lag = 0.3; lag >= 0; lag -= 0.005) {
      const state = resolveVideoCatchUpState({
        ...base, playbackSpeed: 1, videoCurrentTime: 5 - lag, targetSourceTime: 5.0, wasCatchingUp,
      });
      if (state.rate !== previousRate) changes++;
      previousRate = state.rate;
      wasCatchingUp = state.isCatchingUp;
    }
    expect(changes).toBe(2);
  });

  it('大きなずれ（1 秒超）は既存の seek / recovery に任せて設定速度のまま', () => {
    expect(resolveVideoCatchUpPlaybackRate({
      ...base, playbackSpeed: 1, videoCurrentTime: 3.5, targetSourceTime: 5.0,
    })).toBe(1);
  });

  it('export では補正しない（倍速 rate=1 / 等倍・スローの native rate を維持）', () => {
    expect(resolveVideoCatchUpPlaybackRate({
      isExporting: true, canCatchUp: true, playbackSpeed: 4, videoCurrentTime: 4.8, targetSourceTime: 5.0,
    })).toBe(1);
    expect(resolveVideoCatchUpPlaybackRate({
      isExporting: true, canCatchUp: true, playbackSpeed: 0.5, videoCurrentTime: 4.8, targetSourceTime: 5.0,
    })).toBe(0.5);
    expect(resolveVideoCatchUpPlaybackRate({
      isExporting: true, canCatchUp: true, playbackSpeed: 1, videoCurrentTime: 4.8, targetSourceTime: 5.0,
    })).toBe(1);
  });

  it('2x を超える倍速・補正不可（シーク中/停止中など）は設定速度のまま', () => {
    expect(resolveVideoCatchUpPlaybackRate({
      ...base, playbackSpeed: 4, videoCurrentTime: 4.5, targetSourceTime: 5.0,
    })).toBe(4);
    expect(resolveVideoCatchUpPlaybackRate({
      isExporting: false, canCatchUp: false, playbackSpeed: 1, videoCurrentTime: 4.8, targetSourceTime: 5.0,
    })).toBe(1);
  });

  it('非有限値は設定速度へフォールバックする', () => {
    expect(resolveVideoCatchUpPlaybackRate({
      ...base, playbackSpeed: 1, videoCurrentTime: Number.NaN, targetSourceTime: 5.0,
    })).toBe(1);
  });
});

describe('applyVideoElementCatchUpPlaybackRate', () => {
  it('補正後の rate を 0.1 刻みへ丸めずに設定する', () => {
    const video = { playbackRate: 1 } as HTMLVideoElement;
    applyVideoElementCatchUpPlaybackRate(video, 0.55);
    expect(video.playbackRate).toBeCloseTo(0.55, 4);
  });

  it('不正値では変更しない', () => {
    const video = { playbackRate: 1 } as HTMLVideoElement;
    applyVideoElementCatchUpPlaybackRate(video, Number.NaN);
    applyVideoElementCatchUpPlaybackRate(video, 0);
    expect(video.playbackRate).toBe(1);
  });
});
