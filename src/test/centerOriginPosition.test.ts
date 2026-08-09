/**
 * @file centerOriginPosition.test.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 位置調整の共通座標系（中央原点・上が＋）変換のテスト。
 *
 * 保存形式は変えず UI だけを変換する方式なので、
 * **往復（保存値 → 表示値 → 保存値）で元に戻る**ことが最重要。
 * ここが崩れると、スライダーを触るたびに素材がじわじわ動く。
 */
import { describe, expect, it } from 'vitest';
import {
  CENTER_ORIGIN_MAX,
  CENTER_ORIGIN_MIN,
  clampCenterOrigin,
  fromCenterPixels,
  fromTopLeftPercent,
  roundCenterOrigin,
  toCenterPixels,
  toTopLeftPercent,
} from '../utils/centerOriginPosition';

describe('clampCenterOrigin', () => {
  it('clamps to -100..100 and treats invalid input as center', () => {
    expect(clampCenterOrigin(0)).toBe(0);
    expect(clampCenterOrigin(150)).toBe(CENTER_ORIGIN_MAX);
    expect(clampCenterOrigin(-150)).toBe(CENTER_ORIGIN_MIN);
    expect(clampCenterOrigin(NaN)).toBe(0);
  });
});

/** ロゴ・キャプションの保存形式（左上原点 0〜100%） */
describe('左上原点 % との変換', () => {
  it('maps the top-left 50% to the center 0', () => {
    expect(fromTopLeftPercent(50, 'x')).toBe(0);
    expect(fromTopLeftPercent(50, 'y')).toBe(0);
  });

  it('X: 右が ＋（左上 100% = 右端 = +100）', () => {
    expect(fromTopLeftPercent(100, 'x')).toBe(100);
    expect(fromTopLeftPercent(0, 'x')).toBe(-100);
    expect(fromTopLeftPercent(75, 'x')).toBe(50);
  });

  it('Y: 上が ＋（左上 0% = 画面最上部 = +100）', () => {
    // ここが本対応の肝。内部は「下が＋」だが UI では上が＋にする
    expect(fromTopLeftPercent(0, 'y')).toBe(100);
    expect(fromTopLeftPercent(100, 'y')).toBe(-100);
    expect(fromTopLeftPercent(25, 'y')).toBe(50);
  });

  it('round-trips without drift', () => {
    for (const stored of [0, 12.5, 25, 50, 75, 87.5, 100]) {
      for (const axis of ['x', 'y'] as const) {
        expect(toTopLeftPercent(fromTopLeftPercent(stored, axis), axis)).toBeCloseTo(stored, 6);
      }
    }
  });

  it('round-trips from the display side too', () => {
    for (const shown of [-100, -50, -12.5, 0, 12.5, 50, 100]) {
      for (const axis of ['x', 'y'] as const) {
        expect(fromTopLeftPercent(toTopLeftPercent(shown, axis), axis)).toBeCloseTo(shown, 6);
      }
    }
  });
});

/** 動画・画像の保存形式（中央原点 px・下が＋） */
describe('中央原点 px との変換', () => {
  const span = 1920;

  it('keeps the center at 0', () => {
    expect(fromCenterPixels(0, span, 'x')).toBe(0);
    expect(fromCenterPixels(0, span, 'y')).toBe(0);
  });

  it('X: 右が ＋（px の符号そのまま）', () => {
    expect(fromCenterPixels(960, span, 'x')).toBe(50);
    expect(fromCenterPixels(-960, span, 'x')).toBe(-50);
  });

  it('Y: 上が ＋（px は下が＋なので符号が反転する）', () => {
    // px で +140（下方向）は、UI 上は −（下）になる
    expect(fromCenterPixels(960, span, 'y')).toBe(-50);
    expect(fromCenterPixels(-960, span, 'y')).toBe(50);
  });

  it('round-trips without drift', () => {
    for (const stored of [-1920, -960, -140, 0, 140, 960, 1920]) {
      for (const axis of ['x', 'y'] as const) {
        expect(toCenterPixels(fromCenterPixels(stored, span, axis), span, axis))
          .toBeCloseTo(stored, 6);
      }
    }
  });

  it('treats a zero or invalid span as center (no divide-by-zero)', () => {
    expect(fromCenterPixels(100, 0, 'x')).toBe(0);
    expect(toCenterPixels(50, 0, 'x')).toBe(0);
    expect(fromCenterPixels(100, NaN, 'x')).toBe(0);
  });
});

describe('三者の座標系が揃っていること', () => {
  const span = 1080;

  it('「中央」はどの素材でも 0,0 として表示される', () => {
    // ロゴ・キャプションの既定（左上 50%,50%）
    expect(fromTopLeftPercent(50, 'x')).toBe(0);
    expect(fromTopLeftPercent(50, 'y')).toBe(0);
    // 動画・画像の既定（px 0,0）
    expect(fromCenterPixels(0, span, 'x')).toBe(0);
    expect(fromCenterPixels(0, span, 'y')).toBe(0);
  });

  it('「上へ動かす」はどの素材でも Y が ＋方向', () => {
    // ロゴ/字幕: 左上% を小さくする＝上へ → 表示は ＋
    expect(fromTopLeftPercent(20, 'y')).toBeGreaterThan(fromTopLeftPercent(80, 'y'));
    // 動画・画像: px を小さくする（負＝上）→ 表示は ＋
    expect(fromCenterPixels(-200, span, 'y')).toBeGreaterThan(fromCenterPixels(200, span, 'y'));
  });

  it('「右へ動かす」はどの素材でも X が ＋方向', () => {
    expect(fromTopLeftPercent(80, 'x')).toBeGreaterThan(fromTopLeftPercent(20, 'x'));
    expect(fromCenterPixels(200, span, 'x')).toBeGreaterThan(fromCenterPixels(-200, span, 'x'));
  });
});

describe('roundCenterOrigin', () => {
  it('rounds to one decimal and stays clamped', () => {
    expect(roundCenterOrigin(12.34)).toBe(12.3);
    expect(roundCenterOrigin(-0.04)).toBe(0);
    expect(roundCenterOrigin(999)).toBe(100);
  });
});

/**
 * 保存済みプロジェクトの見た目が変わらないこと（本対応の最重要不変条件）。
 *
 * 保存形式は一切変えず UI だけ変換する方式なので、
 * 「保存値 → 表示 → （触らずに）保存」で元の値へ戻る必要がある。
 * ここが崩れると、設定画面を開いただけで素材の位置がずれる。
 */
describe('既存プロジェクトの位置が変わらない', () => {
  it('ロゴ・字幕の代表的な保存値が往復で不変', () => {
    // 既定（中央）、四隅寄せのプリセット相当、端
    for (const stored of [50, 9, 91, 15, 85, 0, 100]) {
      for (const axis of ['x', 'y'] as const) {
        const shown = fromTopLeftPercent(stored, axis);
        expect(toTopLeftPercent(shown, axis)).toBeCloseTo(stored, 6);
      }
    }
  });

  it('動画・画像の代表的な保存値が往復で不変', () => {
    for (const span of [1920, 1080, 720]) {
      for (const stored of [0, 140, -140, 220, span, -span]) {
        for (const axis of ['x', 'y'] as const) {
          const shown = fromCenterPixels(stored, span, axis);
          expect(toCenterPixels(shown, span, axis)).toBeCloseTo(stored, 6);
        }
      }
    }
  });
});

