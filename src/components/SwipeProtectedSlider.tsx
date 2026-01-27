import React, { useCallback } from 'react';
import { useSwipeProtectedValue } from '../hooks/useSwipeProtectedValue';

interface SwipeProtectedSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number | string;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * 誤タッチ保護付きスライダー
 * 
 * 縦スクロール時の誤タッチを防止：
 * - 縦方向に15px以上動いたら値をリセット
 * - タッチ時間が100ms未満なら値をリセット
 */
export const SwipeProtectedSlider: React.FC<SwipeProtectedSliderProps> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
  className = '',
}) => {
  const handleRestore = useCallback(
    (restoredValue: number) => {
      onChange(restoredValue);
    },
    [onChange]
  );

  const { onTouchStart, onTouchMove, onTouchEnd } = useSwipeProtectedValue(
    value,
    handleRestore,
    {
      verticalThreshold: 15, // 縦15px以上で縦スクロールと判断
      minTouchDuration: 100, // 100ms未満のタッチは無視
    }
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseFloat(e.target.value));
    },
    [onChange]
  );

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={handleChange}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      disabled={disabled}
      className={className}
    />
  );
};
