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
  resolveSpeedBadgePresetPosition,
  resolveVideoElementPlaybackRateForContext,
  resolveVideoSafeEndSourceTime,
  resolveVideoSourceTime,
  resolveVideoTimelineDuration,
  shouldDrawSpeedBadge,
  wallDeltaToExportTimelineDelta,
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
