import { useRef, useCallback, TouchEvent } from 'react';

interface SwipeProtectedHandlers {
  onTouchStart: (e: TouchEvent<HTMLInputElement>) => void;
  onTouchMove: (e: TouchEvent<HTMLInputElement>) => void;
  onTouchEnd: (e: TouchEvent<HTMLInputElement>) => void;
}

/**
 * 誤タッチを検出して値を元に戻すフック
 * 
 * 以下の場合に「誤タッチ」と判断して値をリセット：
 * 1. 縦方向に閾値以上移動した（縦スクロールの意図）
 * 2. タッチ時間が短すぎる（通りすがりのタッチ）
 * 
 * 意図的な操作と判断する条件：
 * - 縦移動が少ない AND タッチ時間が一定以上
 */
export function useSwipeProtectedValue(
  currentValue: number,
  onRestore: (value: number) => void,
  options: {
    verticalThreshold?: number; // 縦移動の閾値（px）
    minTouchDuration?: number;  // 最小タッチ時間（ms）
  } = {}
): SwipeProtectedHandlers {
  const { verticalThreshold = 15, minTouchDuration = 100 } = options;

  const startYRef = useRef<number>(0);
  const startValueRef = useRef<number>(0);
  const touchStartTimeRef = useRef<number>(0);
  const isScrollingRef = useRef<boolean>(false);

  const onTouchStart = useCallback(
    (e: TouchEvent<HTMLInputElement>) => {
      startYRef.current = e.touches[0].clientY;
      startValueRef.current = currentValue;
      touchStartTimeRef.current = Date.now();
      isScrollingRef.current = false;
    },
    [currentValue]
  );

  const onTouchMove = useCallback(
    (e: TouchEvent<HTMLInputElement>) => {
      if (isScrollingRef.current) return;

      const deltaY = Math.abs(e.touches[0].clientY - startYRef.current);
      if (deltaY > verticalThreshold) {
        // 縦移動が閾値を超えた = スクロールの意図
        isScrollingRef.current = true;
        // 元の値に戻す
        onRestore(startValueRef.current);
      }
    },
    [verticalThreshold, onRestore]
  );

  const onTouchEnd = useCallback(
    (_e: TouchEvent<HTMLInputElement>) => {
      const touchDuration = Date.now() - touchStartTimeRef.current;

      if (isScrollingRef.current) {
        // スクロール中だった場合は元の値を確定
        onRestore(startValueRef.current);
      } else if (touchDuration < minTouchDuration) {
        // タッチ時間が短すぎる = 通りすがりのタッチ
        onRestore(startValueRef.current);
      }
      // それ以外は意図的な操作なので値を維持

      isScrollingRef.current = false;
    },
    [minTouchDuration, onRestore]
  );

  return { onTouchStart, onTouchMove, onTouchEnd };
}
