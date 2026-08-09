/**
 * @file endrollOverlay.test.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description エンドロールの純ロジック（正規化・尺・背景色・フェード・BGMフェード）のテスト。
 * 最重要は「無効時に尺 0 を返す」こと。ここが崩れると既存プロジェクトの尺が変わる。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENDROLL_OVERLAY,
  ENDROLL_DURATION_MAX_SEC,
  ENDROLL_DURATION_MIN_SEC,
  calculateEndrollFadeAlpha,
  getEndrollDuration,
  isEndrollActive,
  isEndrollTime,
  normalizeEndrollBackgroundMode,
  normalizeEndrollOverlay,
  resolveBgmEndrollFadeGain,
  resolveEndrollBackgroundColor,
} from '../utils/endrollOverlay';

const activeEndroll = (overrides = {}) => normalizeEndrollOverlay({
  enabled: true,
  url: 'blob:logo',
  durationSec: 5,
  ...overrides,
});

describe('normalizeEndrollOverlay', () => {
  it('defaults to disabled / 5s / black for missing data (old projects)', () => {
    const normalized = normalizeEndrollOverlay(undefined);
    expect(normalized.enabled).toBe(false);
    expect(normalized.durationSec).toBe(5);
    expect(normalized.backgroundMode).toBe('black');
    expect(normalized.file).toBeNull();
    expect(normalized.url).toBeNull();
  });

  it('keeps the defaults object in sync with normalization', () => {
    expect(normalizeEndrollOverlay(undefined)).toEqual(DEFAULT_ENDROLL_OVERLAY);
  });

  it('clamps duration into the supported range', () => {
    expect(normalizeEndrollOverlay({ durationSec: 0 }).durationSec).toBe(ENDROLL_DURATION_MIN_SEC);
    expect(normalizeEndrollOverlay({ durationSec: 999 }).durationSec).toBe(ENDROLL_DURATION_MAX_SEC);
    expect(normalizeEndrollOverlay({ durationSec: 12 }).durationSec).toBe(12);
    expect(normalizeEndrollOverlay({ durationSec: NaN }).durationSec).toBe(5);
  });

  it('falls back to black for an unknown background mode', () => {
    expect(normalizeEndrollBackgroundMode('white')).toBe('white');
    expect(normalizeEndrollBackgroundMode('custom')).toBe('custom');
    expect(normalizeEndrollBackgroundMode('rainbow')).toBe('black');
    expect(normalizeEndrollBackgroundMode(undefined)).toBe('black');
  });

  it('rejects malformed custom colors', () => {
    expect(normalizeEndrollOverlay({ backgroundColor: '#1A2B3C' }).backgroundColor).toBe('#1a2b3c');
    expect(normalizeEndrollOverlay({ backgroundColor: 'red' }).backgroundColor).toBe('#000000');
    expect(normalizeEndrollOverlay({ backgroundColor: '#fff' }).backgroundColor).toBe('#000000');
  });

  it('clamps the shared logo style fields like the watermark does', () => {
    const normalized = normalizeEndrollOverlay({
      positionX: 999, positionY: -50, size: 99, opacity: 5, rotation: 999, maskSize: 0, feather: 999,
    });
    expect(normalized.positionX).toBe(100);
    expect(normalized.positionY).toBe(0);
    expect(normalized.size).toBe(3);
    expect(normalized.opacity).toBe(1);
    expect(normalized.rotation).toBe(180);
    expect(normalized.maskSize).toBe(5);
    expect(normalized.feather).toBe(40);
  });
});

/**
 * 尺計算は本機能の心臓部。0 を返す条件が崩れると、
 * エンドロールを使っていない既存プロジェクトの totalDuration まで変わってしまう。
 */
describe('getEndrollDuration (timeline extension)', () => {
  it('returns 0 when disabled so the timeline never grows', () => {
    expect(getEndrollDuration(normalizeEndrollOverlay({ enabled: false, url: 'blob:logo' }))).toBe(0);
    expect(isEndrollActive(normalizeEndrollOverlay({ enabled: false, url: 'blob:logo' }))).toBe(false);
  });

  it('returns 0 when there is no image even if enabled', () => {
    expect(getEndrollDuration(normalizeEndrollOverlay({ enabled: true, url: null }))).toBe(0);
  });

  it('returns 0 for null / undefined', () => {
    expect(getEndrollDuration(null)).toBe(0);
    expect(getEndrollDuration(undefined)).toBe(0);
  });

  it('returns the configured duration when enabled with an image', () => {
    expect(getEndrollDuration(activeEndroll({ durationSec: 5 }))).toBe(5);
    expect(isEndrollActive(activeEndroll())).toBe(true);
  });
});

describe('isEndrollTime', () => {
  const endroll = activeEndroll({ durationSec: 5 });

  it('treats [clipsDuration, clipsDuration + duration) as the endroll window', () => {
    expect(isEndrollTime(endroll, 12, 11.9)).toBe(false);
    expect(isEndrollTime(endroll, 12, 12)).toBe(true);
    expect(isEndrollTime(endroll, 12, 16.9)).toBe(true);
    // 終端は含まない（17秒ちょうどは動画の終わり）
    expect(isEndrollTime(endroll, 12, 17)).toBe(false);
  });

  it('is never true when the endroll is inactive', () => {
    const off = normalizeEndrollOverlay({ enabled: false });
    expect(isEndrollTime(off, 12, 13)).toBe(false);
  });
});

describe('resolveEndrollBackgroundColor', () => {
  it('maps the mode to a concrete color, defaulting to black', () => {
    expect(resolveEndrollBackgroundColor(activeEndroll({ backgroundMode: 'black' }))).toBe('#000000');
    expect(resolveEndrollBackgroundColor(activeEndroll({ backgroundMode: 'white' }))).toBe('#ffffff');
    expect(resolveEndrollBackgroundColor(
      activeEndroll({ backgroundMode: 'custom', backgroundColor: '#123456' }),
    )).toBe('#123456');
  });
});

describe('calculateEndrollFadeAlpha', () => {
  it('stays fully opaque when no fade is configured', () => {
    const e = activeEndroll();
    for (const t of [0, 1, 2.5, 5]) {
      expect(calculateEndrollFadeAlpha(e, 5, t)).toBe(1);
    }
  });

  it('fades in from the start of the endroll window', () => {
    const e = activeEndroll({ fadeIn: true, fadeInDuration: 1 });
    expect(calculateEndrollFadeAlpha(e, 5, 0)).toBe(0);
    expect(calculateEndrollFadeAlpha(e, 5, 0.5)).toBeCloseTo(0.5);
    expect(calculateEndrollFadeAlpha(e, 5, 1)).toBe(1);
    expect(calculateEndrollFadeAlpha(e, 5, 3)).toBe(1);
  });

  it('fades out towards the end of the endroll window', () => {
    const e = activeEndroll({ fadeOut: true, fadeOutDuration: 2 });
    expect(calculateEndrollFadeAlpha(e, 5, 3)).toBe(1);
    expect(calculateEndrollFadeAlpha(e, 5, 4)).toBeCloseTo(0.5);
    expect(calculateEndrollFadeAlpha(e, 5, 5)).toBe(0);
  });

  it('scales both fades proportionally when they exceed the window', () => {
    // 0.6秒の区間に 2+2 秒のフェードを設定しても 0〜1 に収まり続ける
    const e = activeEndroll({
      durationSec: 0.6, fadeIn: true, fadeOut: true, fadeInDuration: 2, fadeOutDuration: 2,
    });
    for (let t = 0; t <= 0.6; t += 0.1) {
      const a = calculateEndrollFadeAlpha(e, 0.6, t);
      expect(Number.isFinite(a)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });
});

/**
 * BGM のエンドロールフェードは既存の末尾フェードとは独立したオプション。
 * clipsDuration から totalDuration にかけて線形に 0 へ落ちる。
 */
describe('resolveBgmEndrollFadeGain', () => {
  it('is a no-op (1.0) when the option is off', () => {
    const endroll = activeEndroll({ bgmFadeOut: false });
    expect(resolveBgmEndrollFadeGain({ endroll, clipsDuration: 12, timeSec: 14 })).toBe(1);
  });

  it('is a no-op when the endroll itself is inactive', () => {
    const endroll = normalizeEndrollOverlay({ enabled: false, bgmFadeOut: true });
    expect(resolveBgmEndrollFadeGain({ endroll, clipsDuration: 12, timeSec: 14 })).toBe(1);
  });

  it('keeps full gain during the clip region', () => {
    const endroll = activeEndroll({ bgmFadeOut: true });
    expect(resolveBgmEndrollFadeGain({ endroll, clipsDuration: 12, timeSec: 0 })).toBe(1);
    expect(resolveBgmEndrollFadeGain({ endroll, clipsDuration: 12, timeSec: 12 })).toBe(1);
  });

  it('ramps linearly to zero across the endroll (12s clips + 5s endroll)', () => {
    const endroll = activeEndroll({ bgmFadeOut: true, durationSec: 5 });
    expect(resolveBgmEndrollFadeGain({ endroll, clipsDuration: 12, timeSec: 13.5 })).toBeCloseTo(0.7);
    expect(resolveBgmEndrollFadeGain({ endroll, clipsDuration: 12, timeSec: 14.5 })).toBeCloseTo(0.5);
    expect(resolveBgmEndrollFadeGain({ endroll, clipsDuration: 12, timeSec: 17 })).toBe(0);
    // 終端を越えても 0 のまま（負にならない）
    expect(resolveBgmEndrollFadeGain({ endroll, clipsDuration: 12, timeSec: 99 })).toBe(0);
  });

  it('never leaves the 0..1 range across a full sweep', () => {
    const endroll = activeEndroll({ bgmFadeOut: true, durationSec: 5 });
    for (let t = 0; t <= 20; t += 0.25) {
      const gain = resolveBgmEndrollFadeGain({ endroll, clipsDuration: 12, timeSec: t });
      expect(Number.isFinite(gain)).toBe(true);
      expect(gain).toBeGreaterThanOrEqual(0);
      expect(gain).toBeLessThanOrEqual(1);
    }
  });
});

/**
 * 書き出し側の BGM フェードは、プレビューと**同じ区間・同じカーブ**でなければならない。
 * 実装当初、書き出しへ clipsDuration / endrollBgmFadeOut を渡し忘れており
 * 「プレビューでは消えるのに書き出したファイルでは消えない」状態だった。
 * ここでは両者が同じ入力から同じ減衰を導くことを固定する。
 */
describe('プレビューと書き出しの BGM フェードが一致する', () => {
  const endroll = normalizeEndrollOverlay({
    enabled: true, url: 'blob:logo', durationSec: 5, bgmFadeOut: true,
  });
  const clipsDuration = 12;
  const totalDuration = clipsDuration + 5;

  /** 書き出し側のエンベロープ（linearRampToValueAtTime）を数式で再現 */
  const exportGainAt = (timeSec: number) => {
    if (timeSec <= clipsDuration) return 1;
    if (timeSec >= totalDuration) return 0;
    const span = totalDuration - clipsDuration;
    return 1 - (timeSec - clipsDuration) / span;
  };

  it('同じ時刻で同じゲインになる', () => {
    for (let t = 0; t <= totalDuration; t += 0.5) {
      const preview = resolveBgmEndrollFadeGain({ endroll, clipsDuration, timeSec: t });
      expect(preview).toBeCloseTo(exportGainAt(t), 6);
    }
  });

  it('オプション OFF なら双方とも減衰しない', () => {
    const off = normalizeEndrollOverlay({
      enabled: true, url: 'blob:logo', durationSec: 5, bgmFadeOut: false,
    });
    for (const t of [0, 12, 14, 17]) {
      expect(resolveBgmEndrollFadeGain({ endroll: off, clipsDuration, timeSec: t })).toBe(1);
    }
  });

  it('エンドロールを削除（画像なし）したら減衰しない', () => {
    const removed = normalizeEndrollOverlay({
      enabled: true, url: null, durationSec: 5, bgmFadeOut: true,
    });
    for (const t of [0, 12, 14, 17]) {
      expect(resolveBgmEndrollFadeGain({ endroll: removed, clipsDuration, timeSec: t })).toBe(1);
    }
  });
});
