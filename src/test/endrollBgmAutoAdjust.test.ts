/**
 * @file endrollBgmAutoAdjust.test.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description エンドロールと BGM 自動調整（動画尺への末尾合わせ）の組み合わせを固定する。
 *
 * BGM はエンドロール区間も流し続ける仕様なので、末尾合わせの基準は
 * **totalDuration（クリップ + エンドロール）**でなければならない。
 * clipsDuration を基準にすると、エンドロールに入った瞬間 BGM が切れる。
 */
import { describe, expect, it } from 'vitest';
import {
  resolveBgmClipsEffectivePlayback,
  resolvePipelineClipEffectivePlayback,
} from '../stores/audioStore';

const bgmClip = (overrides: Partial<{
  id: string; startTime: number; trimStart: number; trimEnd: number; duration: number;
}> = {}) => ({
  id: 'bgmclip_1',
  startTime: 0,
  trimStart: 0,
  trimEnd: 10,
  duration: 10,
  ...overrides,
});

describe('エンドロールと BGM 自動調整', () => {
  const clipsDuration = 12;
  const endrollDuration = 5;
  const totalDuration = clipsDuration + endrollDuration; // 17

  it('自動調整 ON: BGM の末尾がエンドロール込みの尺（17秒）へ伸びる', () => {
    // 音源 30 秒 → 17 秒まで引き伸ばせる
    const map = resolveBgmClipsEffectivePlayback(
      [bgmClip({ trimEnd: 10, duration: 30 })],
      totalDuration,
      { autoAdjust: true },
    );
    const effective = map.get('bgmclip_1')!;

    expect(effective.effectiveTimelineEnd).toBeCloseTo(totalDuration, 6);
    expect(effective.isTailFitToTimeline).toBe(true);
    // 設定は 10 秒だが、末尾合わせで 17 秒まで延長される
    expect(effective.isExtendedByTimeline).toBe(true);
    expect(effective.configuredTimelineEnd).toBeCloseTo(10, 6);
  });

  it('音源が足りなければ音源長まで（エンドロール終端には届かない）', () => {
    // 音源 10 秒しかない → 10 秒で終わる。無音のまま残る区間ができる
    const map = resolveBgmClipsEffectivePlayback(
      [bgmClip({ trimEnd: 10, duration: 10 })],
      totalDuration,
      { autoAdjust: true },
    );
    const effective = map.get('bgmclip_1')!;

    expect(effective.effectiveTimelineEnd).toBeCloseTo(10, 6);
    expect(effective.effectiveTimelineEnd).toBeLessThan(totalDuration);
  });

  it('自動調整 OFF: 設定した区間のまま（エンドロールでは鳴らない）', () => {
    const map = resolveBgmClipsEffectivePlayback(
      [bgmClip({ trimEnd: 10, duration: 30 })],
      totalDuration,
      { autoAdjust: false },
    );
    const effective = map.get('bgmclip_1')!;

    expect(effective.effectiveTimelineEnd).toBeCloseTo(10, 6);
    expect(effective.isExtendedByTimeline).toBe(false);
  });

  it('エンドロール無効時（12秒）は従来どおり本編末尾へ合う', () => {
    const map = resolveBgmClipsEffectivePlayback(
      [bgmClip({ trimEnd: 10, duration: 30 })],
      clipsDuration,
      { autoAdjust: true },
    );
    const effective = map.get('bgmclip_1')!;

    expect(effective.effectiveTimelineEnd).toBeCloseTo(clipsDuration, 6);
  });

  it('複数 BGM では末尾のクリップだけがエンドロール終端へ合う', () => {
    const map = resolveBgmClipsEffectivePlayback(
      [
        bgmClip({ id: 'bgmclip_1', startTime: 0, trimEnd: 6, duration: 30 }),
        bgmClip({ id: 'bgmclip_2', startTime: 6, trimEnd: 4, duration: 30 }),
      ],
      totalDuration,
      { autoAdjust: true },
    );

    const first = map.get('bgmclip_1')!;
    const last = map.get('bgmclip_2')!;

    // 中間クリップは設定どおり
    expect(first.isTailFitToTimeline).toBe(false);
    expect(first.effectiveTimelineEnd).toBeCloseTo(6, 6);
    // 末尾クリップだけがエンドロール込みの終端へ
    expect(last.isTailFitToTimeline).toBe(true);
    expect(last.effectiveTimelineEnd).toBeCloseTo(totalDuration, 6);
  });
});

/**
 * ナレーションとエンドロールの関係。
 *
 * **仕様: エンドロール区間ではナレーションを鳴らさない**（BGM は流し続ける）。
 *
 * 配置計算 `resolvePipelineClipEffectivePlayback` は totalDuration（エンドロール込み）
 * 基準なので、放っておくとナレーションはエンドロールへ跨がる。
 * プレビューは描画ループで、書き出しは `endrollNarrationCutoff` で打ち切る。
 * **両方に入れないと「プレビューでは切れるのに書き出しでは鳴る」食い違いになる**。
 */
describe('ナレーションとエンドロール', () => {
  const clipsDuration = 12;
  const totalDuration = 17;

  const narrationClip = (overrides = {}) => ({
    id: 'narration_1',
    startTime: 10,
    trimStart: 0,
    trimEnd: 5,
    duration: 5,
    ...overrides,
  });

  it('配置計算はエンドロール区間へ跨がることを許容する（尺は totalDuration 基準）', () => {
    const clip = narrationClip();
    const effective = resolvePipelineClipEffectivePlayback(
      clip,
      [clip],
      totalDuration,
      new Map(),
      true,
    );

    // 10秒開始 + 5秒 = 15秒。本編(12秒)を越えても無効化されない
    expect(effective.isDisabled).toBe(false);
    expect(effective.effectiveTimelineEnd).toBeGreaterThan(clipsDuration);
    expect(effective.effectiveTimelineEnd).toBeCloseTo(15, 6);
  });

  it('本編尺を基準にすると本編末尾で切られる（プレビュー抑止と同じ結果になる基準）', () => {
    const clip = narrationClip();
    const effective = resolvePipelineClipEffectivePlayback(
      clip,
      [clip],
      clipsDuration,
      new Map(),
      true,
    );

    expect(effective.effectiveTimelineEnd).toBeCloseTo(clipsDuration, 6);
  });

  /**
   * 書き出し側の打ち切り（endrollNarrationCutoff）と同じ計算を再現し、
   * プレビューの抑止と同じ結果になることを固定する。
   */
  describe('書き出し側の打ち切りがプレビューと一致する', () => {
    /** exportEngine の endrollNarrationCutoff + playDuration クランプ相当 */
    const scheduleWithCutoff = (
      clipStart: number,
      playDuration: number,
      cutoff: number | null,
    ): { scheduled: boolean; duration: number } => {
      if (cutoff !== null) {
        if (clipStart >= cutoff) return { scheduled: false, duration: 0 };
        const clamped = Math.min(playDuration, cutoff - clipStart);
        if (clamped <= 0) return { scheduled: false, duration: 0 };
        return { scheduled: true, duration: clamped };
      }
      return { scheduled: true, duration: playDuration };
    };

    it('エンドロールへ跨がるナレーションは本編末尾で切られる', () => {
      // 10秒開始・5秒 → 本編12秒までの 2 秒だけ鳴る
      const result = scheduleWithCutoff(10, 5, clipsDuration);
      expect(result.scheduled).toBe(true);
      expect(result.duration).toBeCloseTo(2, 6);
    });

    it('エンドロール開始後に始まるナレーションは一切鳴らない', () => {
      const result = scheduleWithCutoff(13, 3, clipsDuration);
      expect(result.scheduled).toBe(false);
    });

    it('本編内で完結するナレーションは影響を受けない', () => {
      const result = scheduleWithCutoff(2, 5, clipsDuration);
      expect(result.scheduled).toBe(true);
      expect(result.duration).toBeCloseTo(5, 6);
    });

    it('エンドロール無効（cutoff なし）なら従来どおり', () => {
      const result = scheduleWithCutoff(10, 5, null);
      expect(result.scheduled).toBe(true);
      expect(result.duration).toBeCloseTo(5, 6);
    });
  });
});

