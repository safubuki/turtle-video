/**
 * @file PreviewSeekSlider.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 通常と追従プレビューで方向判定とシークライフサイクルを共有する入力。
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { useSwipeProtectedValue } from '../../hooks/useSwipeProtectedValue';

interface PreviewSeekSliderProps {
  currentTime: number;
  totalDuration: number;
  disabled: boolean;
  onSeekChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
  ariaLabel: string;
  className?: string;
  style?: React.CSSProperties;
  finishOnUnmount?: boolean;
}

/** 通常／追従プレビューで同じ方向判定とstart/change/end契約を使用する。 */
const PreviewSeekSlider: React.FC<PreviewSeekSliderProps> = ({
  currentTime,
  totalDuration,
  disabled,
  onSeekChange,
  onSeekStart,
  onSeekEnd,
  ariaLabel,
  className,
  style,
  finishOnUnmount = false,
}) => {
  const touchSeekStartedRef = useRef(false);
  const seekStartedRef = useRef(false);
  const onSeekEndRef = useRef(onSeekEnd);
  onSeekEndRef.current = onSeekEnd;
  const start = useCallback(() => {
    seekStartedRef.current = true;
    onSeekStart();
  }, [onSeekStart]);
  const startTouch = useCallback(() => {
    touchSeekStartedRef.current = true;
    start();
  }, [start]);
  const applyValue = useCallback(
    (value: number) => {
      onSeekChange({ target: { value: String(value) } } as React.ChangeEvent<HTMLInputElement>);
    },
    [onSeekChange]
  );
  const swipe = useSwipeProtectedValue(currentTime, applyValue, {
    minMovement: 15,
    minTouchDuration: 0,
    disabled,
    onInteractionStart: startTouch,
  });
  const end = () => {
    seekStartedRef.current = false;
    onSeekEnd();
  };
  useEffect(
    () => () => {
      if (finishOnUnmount && seekStartedRef.current) {
        seekStartedRef.current = false;
        onSeekEndRef.current();
      }
    },
    [finishOnUnmount]
  );

  return (
    <input
      type="range"
      min="0"
      max={totalDuration || 0.1}
      step="0.01"
      value={currentTime}
      onChange={swipe.onChange}
      onPointerDown={(event) => {
        swipe.onPointerDown(event);
        if (event.pointerType === 'touch') {
          if (event.isPrimary !== false) touchSeekStartedRef.current = false;
        } else start();
      }}
      onTouchStart={swipe.onTouchStart}
      onTouchMove={swipe.onTouchMove}
      onPointerUp={(event) => {
        if (event.pointerType !== 'touch' || touchSeekStartedRef.current) end();
      }}
      onPointerCancel={(event) => {
        swipe.onPointerCancel(event);
        if (event.pointerType !== 'touch' || touchSeekStartedRef.current) end();
      }}
      onTouchEnd={(event) => {
        swipe.onTouchEnd(event);
        end();
        touchSeekStartedRef.current = false;
      }}
      onTouchCancel={(event) => {
        swipe.onTouchCancel(event);
        end();
        touchSeekStartedRef.current = false;
      }}
      onBlur={() => {
        swipe.onBlur();
        end();
        touchSeekStartedRef.current = false;
      }}
      className={className}
      style={{ ...style, touchAction: 'pan-y pinch-zoom' }}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  );
};

export default React.memo(PreviewSeekSlider);
