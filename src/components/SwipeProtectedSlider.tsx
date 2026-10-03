/**
 * @file SwipeProtectedSlider.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description スワイプ操作による誤動作を防止するためのカスタムスライダーコンポーネント。垂直方向のスクロールと水平方向のシーク操作を区別する。
 */
import React from 'react';
import { useSwipeProtectedValue } from '../hooks/useSwipeProtectedValue';

interface SwipeProtectedSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number | string;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * 誤タッチ保護付きスライダー
 * 
 * スライダー操作（横移動）と縦スクロールを区別：
 * - 縦移動 > 横移動 → 縦スクロールと判断 → 値変更を通知しない
 * - 横移動 > 縦移動 → スライダー操作 → 値変更を確定
 */
export const SwipeProtectedSlider: React.FC<SwipeProtectedSliderProps> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
  className = '',
  ariaLabel,
}) => {
  const handlers = useSwipeProtectedValue(
    value,
    onChange,
    {
      minMovement: 15,        // 15px以上動いたら方向を判定
      minTouchDuration: 200,  // 200ms未満の移動なしタッチは無視
      disabled,
    }
  );

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      {...handlers}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
      style={{ touchAction: 'pan-y pinch-zoom' }}
    />
  );
};
