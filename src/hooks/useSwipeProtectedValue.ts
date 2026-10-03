/**
 * @file useSwipeProtectedValue.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description スワイプ（スクロール）とスライダー操作（値変更）を区別し、誤操作を防ぐためのロジックを提供するカスタムフック。
 */
import { useRef, useCallback, useEffect, type ChangeEvent, type PointerEvent, type TouchEvent } from 'react';
import { resolveSwipeDirection, SWIPE_DIRECTION_THRESHOLD_PX, type SwipeDirection } from '../utils/swipeGesture';

interface SwipeProtectedHandlers {
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onPointerDown: (e: PointerEvent<HTMLInputElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onTouchStart: (e: TouchEvent<HTMLInputElement>) => void;
  onTouchMove: (e: TouchEvent<HTMLInputElement>) => void;
  onTouchEnd: (e: TouchEvent<HTMLInputElement>) => void;
  onTouchCancel: (e: TouchEvent<HTMLInputElement>) => void;
}

interface TouchSession {
  startX: number;
  startY: number;
  startedAt: number;
  direction: SwipeDirection;
  pendingValue: number | null;
  touchIdentifier: number | null;
  cancelled: boolean;
}

/**
 * タッチ開始から方向が決まるまでは、ネイティブ range の値変更を保留する。
 * 縦スクロールは値変更を一度も通知せず、横操作または許可されたタップだけ確定する。
 * マウス・キーボード操作は従来どおり即時に通知する。
 */
export function useSwipeProtectedValue(
  currentValue: number,
  onValueChange: (value: number) => void,
  options: {
    minMovement?: number;      // 判定開始の最小移動量（px）
    minTouchDuration?: number; // 最小タッチ時間（ms）
    disabled?: boolean;
    /** 意図したタッチ操作を確定する直前に一度だけ開始を通知する。 */
    onInteractionStart?: () => void;
  } = {}
): SwipeProtectedHandlers {
  const {
    minMovement = SWIPE_DIRECTION_THRESHOLD_PX,
    minTouchDuration = 80,
    disabled = false,
    onInteractionStart,
  } = options;
  const sessionRef = useRef<TouchSession | null>(null);
  const clearSession = useCallback(() => {
    sessionRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('blur', clearSession);
    return () => window.removeEventListener('blur', clearSession);
  }, [clearSession]);

  useEffect(() => {
    if (disabled) clearSession();
  }, [clearSession, disabled]);

  const beginTouch = useCallback((clientX: number, clientY: number) => {
    sessionRef.current = {
      startX: clientX,
      startY: clientY,
      startedAt: Date.now(),
      direction: 'pending',
      pendingValue: null,
      touchIdentifier: null,
      cancelled: false,
    };
  }, []);

  const cancelSession = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.cancelled = true;
    session.pendingValue = null;
  }, []);

  const onPointerDown = useCallback((e: PointerEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.pointerType !== 'touch') {
      sessionRef.current = null;
      return;
    }
    if (e.isPrimary === false) {
      if (!sessionRef.current) beginTouch(e.clientX, e.clientY);
      cancelSession();
      return;
    }
    // range の最初の change が touchstart より先に届く場合にも保留する。
    beginTouch(e.clientX, e.clientY);
  }, [beginTouch, cancelSession, disabled]);

  const onChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const nextValue = parseFloat(e.target.value);
    const session = sessionRef.current;
    if (!session || (!session.cancelled && session.direction === 'horizontal')) {
      onValueChange(nextValue);
      return;
    }
    if (!session.cancelled && session.direction === 'pending') {
      session.pendingValue = nextValue;
    }
    // 保留中・縦スクロール中のネイティブつまみも確定値に留める。
    e.currentTarget.value = String(currentValue);
  }, [currentValue, disabled, onValueChange]);

  const onTouchStart = useCallback(
    (e: TouchEvent<HTMLInputElement>) => {
      if (disabled) return;
      if (e.touches.length !== 1) {
        const firstTouch = e.touches[0];
        if (!sessionRef.current && firstTouch) {
          beginTouch(firstTouch.clientX, firstTouch.clientY);
        }
        cancelSession();
        return;
      }
      const touch = e.touches[0];
      if (!sessionRef.current) {
        beginTouch(touch.clientX, touch.clientY);
      }
      // pointerdown から届いた保留値と開始座標は上書きしない。
      sessionRef.current!.touchIdentifier = touch.identifier;
    },
    [beginTouch, cancelSession, disabled]
  );

  const onTouchMove = useCallback(
    (e: TouchEvent<HTMLInputElement>) => {
      if (disabled) return;
      const session = sessionRef.current;
      if (!session) return;
      if (e.touches.length !== 1) {
        cancelSession();
        return;
      }
      if (session.cancelled || session.direction !== 'pending') return;
      const touch = e.touches[0];
      if (session.touchIdentifier !== null && touch.identifier !== session.touchIdentifier) {
        cancelSession();
        return;
      }
      session.direction = resolveSwipeDirection(
        touch.clientX - session.startX,
        touch.clientY - session.startY,
        minMovement,
      );
      if (session.direction === 'horizontal') {
        onInteractionStart?.();
        if (session.pendingValue !== null) {
          const pendingValue = session.pendingValue;
          session.pendingValue = null;
          onValueChange(pendingValue);
        }
      } else if (session.direction === 'vertical') {
        session.pendingValue = null;
      }
    },
    [cancelSession, disabled, minMovement, onInteractionStart, onValueChange]
  );

  const onTouchEnd = useCallback(
    (e: TouchEvent<HTMLInputElement>) => {
      if (disabled) return;
      const session = sessionRef.current;
      if (!session) return;
      if (e.touches.length > 0) {
        cancelSession();
        return;
      }
      sessionRef.current = null;
      if (session.cancelled || session.direction !== 'pending' || session.pendingValue === null) return;
      const touch = e.changedTouches[0];
      const finalDirection = touch
        ? resolveSwipeDirection(touch.clientX - session.startX, touch.clientY - session.startY, minMovement)
        : 'pending';
      if (finalDirection === 'vertical') return;
      if (finalDirection === 'horizontal' || Date.now() - session.startedAt >= minTouchDuration) {
        onInteractionStart?.();
        onValueChange(session.pendingValue);
      }
    },
    [cancelSession, disabled, minMovement, minTouchDuration, onInteractionStart, onValueChange]
  );

  const onTouchCancel = useCallback((e: TouchEvent<HTMLInputElement>) => {
    if (e.touches.length > 0) {
      cancelSession();
    } else {
      sessionRef.current = null;
    }
  }, [cancelSession]);

  const onPointerCancel = useCallback((_e: PointerEvent<HTMLInputElement>) => {
    // ブラウザが縦スクロールを引き継いでも touchend までは値変更を拒否する。
    cancelSession();
  }, [cancelSession]);

  return {
    onChange,
    onPointerDown,
    onPointerCancel,
    onBlur: clearSession,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  };
}
