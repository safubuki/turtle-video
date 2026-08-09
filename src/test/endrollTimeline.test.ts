/**
 * @file endrollTimeline.test.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description エンドロールによるタイムライン延長の不変条件テスト。
 *
 * **本機能で最も重要なテスト**。
 * エンドロールが無効なら totalDuration は従来（clipsDuration）と完全に一致しなければならない。
 * ここが崩れると、エンドロールを一切使っていない既存プロジェクトの尺・シーク・BGM・
 * キャプションが全て狂う。
 */
import { describe, expect, it } from 'vitest';
import { calculateTotalDuration } from '../utils/media';
import { getEndrollDuration, normalizeEndrollOverlay } from '../utils/endrollOverlay';
import type { MediaItem } from '../types';

const videoItem = (id: string, duration: number): MediaItem => ({
  id,
  type: 'video',
  file: new File([''], `${id}.mp4`, { type: 'video/mp4' }),
  url: `blob:${id}`,
  duration,
  trimStart: 0,
  trimEnd: duration,
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
} as MediaItem);

/** 画面と同じ計算（TurtleVideo の totalDuration 導出をロジックとして再現） */
const resolveTotalDuration = (items: MediaItem[], endroll: unknown) =>
  calculateTotalDuration(items) + getEndrollDuration(normalizeEndrollOverlay(endroll as never));

describe('endroll timeline extension', () => {
  const clips = [videoItem('a', 7), videoItem('b', 5)]; // clipsDuration = 12

  it('leaves the timeline untouched when the endroll is disabled (regression guard)', () => {
    const clipsDuration = calculateTotalDuration(clips);
    expect(clipsDuration).toBe(12);

    // 無効
    expect(resolveTotalDuration(clips, { enabled: false, url: 'blob:logo', durationSec: 5 }))
      .toBe(clipsDuration);
    // 未設定（旧プロジェクト）
    expect(resolveTotalDuration(clips, undefined)).toBe(clipsDuration);
    // 有効だが画像が無い
    expect(resolveTotalDuration(clips, { enabled: true, url: null, durationSec: 5 }))
      .toBe(clipsDuration);
  });

  it('extends the timeline by the endroll duration (12s + 5s = 17s)', () => {
    const total = resolveTotalDuration(clips, {
      enabled: true, url: 'blob:logo', durationSec: 5,
    });
    expect(total).toBe(17);
  });

  it('keeps clipsDuration independent of the endroll', () => {
    // エンドロールをどう設定してもクリップ側の尺は変わらない
    const clipsDuration = calculateTotalDuration(clips);
    for (const durationSec of [0.5, 5, 30]) {
      expect(calculateTotalDuration(clips)).toBe(clipsDuration);
      expect(resolveTotalDuration(clips, { enabled: true, url: 'blob:logo', durationSec }))
        .toBe(clipsDuration + durationSec);
    }
  });

  it('handles an empty timeline (no clips) without producing a negative or NaN duration', () => {
    expect(resolveTotalDuration([], undefined)).toBe(0);
    const endrollOnly = resolveTotalDuration([], {
      enabled: true, url: 'blob:logo', durationSec: 5,
    });
    expect(Number.isFinite(endrollOnly)).toBe(true);
    expect(endrollOnly).toBeGreaterThanOrEqual(0);
  });

  it('clamps an out-of-range endroll duration before extending', () => {
    expect(resolveTotalDuration(clips, { enabled: true, url: 'blob:logo', durationSec: 999 }))
      .toBe(12 + 30);
    expect(resolveTotalDuration(clips, { enabled: true, url: 'blob:logo', durationSec: -5 }))
      .toBe(12 + 0.5);
  });

  /**
   * ディゾルブ（重ねる）とエンドロールの合算。
   * 5秒 + 5秒 で 1 秒ディゾルブ → 本編 9 秒。さらに 5 秒のエンドロールで合計 14 秒。
   */
  describe('ディゾルブ + エンドロール', () => {
    const dissolveClips = [
      { ...videoItem('a', 5), transitionToNext: { type: 'dissolve', duration: 1 } } as MediaItem,
      videoItem('b', 5),
    ];

    it('ディゾルブぶんクリップ尺が縮む（5+5 で 1 秒重ねて 9 秒）', () => {
      expect(calculateTotalDuration(dissolveClips)).toBe(9);
    });

    it('エンドロール 5 秒を足すと合計 14 秒になる', () => {
      const total = resolveTotalDuration(dissolveClips, {
        enabled: true, url: 'blob:logo', durationSec: 5,
      });
      expect(total).toBe(14);
    });

    it('エンドロール無効ならディゾルブぶんだけ縮んだ 9 秒のまま', () => {
      expect(resolveTotalDuration(dissolveClips, undefined)).toBe(9);
    });
  });
});
