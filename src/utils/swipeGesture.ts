/**
 * @file swipeGesture.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 波形とスライダーで共通の、横操作と縦スクロールの方向判定。
 */

export type SwipeDirection = 'pending' | 'horizontal' | 'vertical';

export const SWIPE_DIRECTION_THRESHOLD_PX = 15;

/** 指先の小さな揺れは保留し、閾値を超えたら移動量の大きい方向を採用する。 */
export function resolveSwipeDirection(
  deltaX: number,
  deltaY: number,
  minMovement = SWIPE_DIRECTION_THRESHOLD_PX,
): SwipeDirection {
  const x = Math.abs(deltaX);
  const y = Math.abs(deltaY);
  if (Math.max(x, y) <= minMovement) return 'pending';
  return y > x ? 'vertical' : 'horizontal';
}
