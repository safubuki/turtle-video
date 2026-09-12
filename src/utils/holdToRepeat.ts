/**
 * @file holdToRepeat.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description −/+ ステッパーの長押し加速カーブ（純関数）。
 *
 * 単発タップは click に任せ、長押し開始から INITIAL_DELAY 後に繰り返しを始める。
 * 間隔は smoothstep で START → MIN へ徐々に縮め、急加速しない。
 */

/** 長押し開始から繰り返しが始まるまでの待ち（ms） */
export const HOLD_REPEAT_INITIAL_DELAY_MS = 400;

/** 繰り返し開始直後の間隔（ms） */
export const HOLD_REPEAT_START_INTERVAL_MS = 180;

/** 最速時の間隔（ms） */
export const HOLD_REPEAT_MIN_INTERVAL_MS = 48;

/** START から MIN へ近づける時間（ms） */
export const HOLD_REPEAT_ACCEL_DURATION_MS = 2200;

/** 長押し開始前の指/ポインタ移動でスクロールとみなす距離（px） */
export const HOLD_REPEAT_MOVE_CANCEL_PX = 12;

const intervalRange = HOLD_REPEAT_START_INTERVAL_MS - HOLD_REPEAT_MIN_INTERVAL_MS;

/** 0〜1 の smoothstep。端の傾きが 0 なので、開始も上限到達も急に跳ねない */
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/**
 * 繰り返し開始からの経過時間に対する次の間隔。
 * 非有限値や負値は開始間隔へ戻す。
 */
export const resolveHoldRepeatInterval = (elapsedSinceRepeatStartMs: number): number => {
  if (!Number.isFinite(elapsedSinceRepeatStartMs) || elapsedSinceRepeatStartMs <= 0) {
    return HOLD_REPEAT_START_INTERVAL_MS;
  }
  const t = Math.min(1, elapsedSinceRepeatStartMs / HOLD_REPEAT_ACCEL_DURATION_MS);
  return Math.round(HOLD_REPEAT_START_INTERVAL_MS - intervalRange * smoothstep(t));
};
