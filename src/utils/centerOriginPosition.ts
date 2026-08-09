/**
 * @file centerOriginPosition.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 位置調整 UI の座標系を「画面中央が原点・上が＋・右が＋」に統一するための変換。
 *
 * 【なぜ変換層なのか】
 * 保存形式（内部表現）は素材ごとに歴史的な事情でバラバラのまま維持する:
 *   - 動画・画像 : px オフセット。中央原点・**下が＋**
 *   - ロゴ/字幕  : 0〜100 %。**左上原点**・下が＋
 * これらを保存形式ごと作り変えると旧プロジェクトの見た目が崩れるリスクがあるため、
 * **表示と入力のときだけ**この共通座標系へ変換する。保存値は 1 ビットも変えない。
 *
 * 【共通座標系（ユーザーに見せる値）】
 *   - 単位: %（-100 〜 +100）
 *   - 原点: 画面中央 (0, 0)
 *   - X: 右が ＋ / 左が −
 *   - Y: **上が ＋ / 下が −**（数学のグラフと同じ向き。内部表現とは符号が逆）
 */

/** 共通座標系の下限・上限（%） */
export const CENTER_ORIGIN_MIN = -100;
export const CENTER_ORIGIN_MAX = 100;

export function clampCenterOrigin(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(CENTER_ORIGIN_MIN, Math.min(CENTER_ORIGIN_MAX, value));
  // 符号反転で生じる -0 を 0 に正規化する（表示が「-0」になるのを防ぐ）
  return clamped === 0 ? 0 : clamped;
}

/**
 * 左上原点 0〜100% → 中央原点 -100〜+100%。
 * 50% が中央 0 になり、Y は符号を反転して「上が＋」にする。
 */
export function fromTopLeftPercent(value: number, axis: 'x' | 'y'): number {
  const numeric = Number.isFinite(value) ? value : 50;
  // 0..100 の 50 を 0 とし、±50 幅を ±100 へ引き伸ばす
  const centered = (numeric - 50) * 2;
  return clampCenterOrigin(axis === 'y' ? -centered : centered);
}

/**
 * 中央原点 -100〜+100% → 左上原点 0〜100%。`fromTopLeftPercent` の逆変換。
 */
export function toTopLeftPercent(value: number, axis: 'x' | 'y'): number {
  const centered = clampCenterOrigin(value);
  const signed = axis === 'y' ? -centered : centered;
  const result = signed / 2 + 50;
  return Math.max(0, Math.min(100, result));
}

/**
 * px オフセット（中央原点・下が＋）→ 中央原点 %（上が＋）。
 *
 * `span` は対応する Canvas の辺の長さ。px の可動域は ±span なので、
 * span いっぱいで ±100% になるよう正規化する。
 */
export function fromCenterPixels(value: number, span: number, axis: 'x' | 'y'): number {
  if (!Number.isFinite(value) || !Number.isFinite(span) || span <= 0) return 0;
  const ratio = (value / span) * 100;
  return clampCenterOrigin(axis === 'y' ? -ratio : ratio);
}

/**
 * 中央原点 %（上が＋）→ px オフセット（中央原点・下が＋）。`fromCenterPixels` の逆変換。
 */
export function toCenterPixels(value: number, span: number, axis: 'x' | 'y'): number {
  if (!Number.isFinite(span) || span <= 0) return 0;
  const centered = clampCenterOrigin(value);
  const signed = axis === 'y' ? -centered : centered;
  // px は 1 未満の精度に意味がないので整数へ丸める。
  // 丸めないと (-89.6/100)*200 のような演算で -179.20000000000002 が保存され、
  // 生値を表示する場所（ミニプレビュー等）に汚い小数が出る。
  const px = (signed / 100) * span;
  const rounded = Math.round(px);
  return rounded === 0 ? 0 : rounded;
}

/** スライダー表示用に小数第 1 位までへ丸める（往復で値が汚れないように） */
export function roundCenterOrigin(value: number): number {
  const rounded = Math.round(clampCenterOrigin(value) * 10) / 10;
  // 丸めで生じる -0 も 0 に正規化する（入力欄に「-0」と出さない）
  return rounded === 0 ? 0 : rounded;
}
