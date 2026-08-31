/**
 * @file useHoldToRepeat.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description −/+ ボタンの長押しで値を徐々に加速して増減するフック。
 *
 * 単発の tap / click / キーボード操作は従来どおり onClick に任せる。
 * 長押しは INITIAL_DELAY 後から繰り返し、離す・キャンセル・スクロール判定で停止する。
 * pointer capture は使わず window へ up/move を付け、スクロールジェスチャを奪わない。
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  HOLD_REPEAT_INITIAL_DELAY_MS,
  HOLD_REPEAT_MOVE_CANCEL_PX,
  resolveHoldRepeatInterval,
} from '../utils/holdToRepeat';

export interface HoldToRepeatHandlers {
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * @param applyStep 現在値から 1 ステップ進めた値を返す。同じ値なら上限/下限到達として停止する
 * @param currentValue 長押し開始時点の確定値
 * @param disabled true のあいだは開始しない。途中で true になったら停止する
 */
export function useHoldToRepeat(
  applyStep: (current: number) => number,
  currentValue: number,
  disabled = false
): HoldToRepeatHandlers {
  const applyStepRef = useRef(applyStep);
  applyStepRef.current = applyStep;
  const currentValueRef = useRef(currentValue);
  currentValueRef.current = currentValue;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const delayTimerRef = useRef<number | null>(null);
  const repeatTimerRef = useRef<number | null>(null);
  const holdingRef = useRef(false);
  const repeatingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const sessionValueRef = useRef(currentValue);
  const repeatStartedAtRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (delayTimerRef.current !== null) {
      window.clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
    if (repeatTimerRef.current !== null) {
      window.clearTimeout(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
  }, []);

  const removeWindowListenersRef = useRef<() => void>(() => {});

  const stopHold = useCallback(() => {
    clearTimers();
    removeWindowListenersRef.current();
    holdingRef.current = false;
    repeatingRef.current = false;
    pointerIdRef.current = null;
  }, [clearTimers]);

  const applyOneStep = useCallback((): boolean => {
    const next = applyStepRef.current(sessionValueRef.current);
    if (next === sessionValueRef.current) {
      stopHold();
      return false;
    }
    sessionValueRef.current = next;
    return true;
  }, [stopHold]);

  const scheduleRepeatTick = useCallback(() => {
    const elapsed = performance.now() - repeatStartedAtRef.current;
    const interval = resolveHoldRepeatInterval(elapsed);
    repeatTimerRef.current = window.setTimeout(() => {
      if (!holdingRef.current || disabledRef.current) return;
      if (!applyOneStep()) return;
      scheduleRepeatTick();
    }, interval);
  }, [applyOneStep]);

  const startRepeating = useCallback(() => {
    if (!holdingRef.current || disabledRef.current) return;
    repeatingRef.current = true;
    suppressClickRef.current = true;
    if (!applyOneStep()) return;
    repeatStartedAtRef.current = performance.now();
    scheduleRepeatTick();
  }, [applyOneStep, scheduleRepeatTick]);

  const onWindowPointerMove = useCallback(
    (event: PointerEvent) => {
      if (event.pointerId !== pointerIdRef.current) return;
      if (repeatingRef.current) return;
      const dx = event.clientX - startXRef.current;
      const dy = event.clientY - startYRef.current;
      if (dx * dx + dy * dy >= HOLD_REPEAT_MOVE_CANCEL_PX * HOLD_REPEAT_MOVE_CANCEL_PX) {
        suppressClickRef.current = true;
        stopHold();
      }
    },
    [stopHold]
  );

  const onWindowPointerUp = useCallback(
    (event: PointerEvent) => {
      if (event.pointerId !== pointerIdRef.current) return;
      stopHold();
    },
    [stopHold]
  );

  const onWindowBlurOrHidden = useCallback(() => {
    if (!holdingRef.current) return;
    suppressClickRef.current = true;
    stopHold();
  }, [stopHold]);

  const addWindowListeners = useCallback(() => {
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);
    window.addEventListener('blur', onWindowBlurOrHidden);
    document.addEventListener('visibilitychange', onWindowBlurOrHidden);
    removeWindowListenersRef.current = () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
      window.removeEventListener('blur', onWindowBlurOrHidden);
      document.removeEventListener('visibilitychange', onWindowBlurOrHidden);
      removeWindowListenersRef.current = () => {};
    };
  }, [onWindowBlurOrHidden, onWindowPointerMove, onWindowPointerUp]);

  useEffect(() => {
    if (disabled) stopHold();
  }, [disabled, stopHold]);

  useEffect(() => () => stopHold(), [stopHold]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabledRef.current) return;
      if (event.button !== 0) return;
      stopHold();
      holdingRef.current = true;
      repeatingRef.current = false;
      suppressClickRef.current = false;
      pointerIdRef.current = event.pointerId;
      startXRef.current = event.clientX;
      startYRef.current = event.clientY;
      sessionValueRef.current = currentValueRef.current;
      addWindowListeners();
      delayTimerRef.current = window.setTimeout(startRepeating, HOLD_REPEAT_INITIAL_DELAY_MS);
    },
    [addWindowListeners, startRepeating, stopHold]
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerId !== pointerIdRef.current) return;
      stopHold();
    },
    [stopHold]
  );

  const onClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (suppressClickRef.current) {
        event.preventDefault();
        suppressClickRef.current = false;
        return;
      }
      if (disabledRef.current) return;
      applyStepRef.current(currentValueRef.current);
    },
    []
  );

  const onContextMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  }, []);

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onClick,
    onContextMenu,
  };
}
