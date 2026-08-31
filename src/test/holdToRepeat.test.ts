import { describe, expect, it } from 'vitest';
import {
  HOLD_REPEAT_MIN_INTERVAL_MS,
  HOLD_REPEAT_START_INTERVAL_MS,
  resolveHoldRepeatInterval,
} from '../utils/holdToRepeat';

describe('resolveHoldRepeatInterval', () => {
  it('繰り返し開始直後は開始間隔を返す', () => {
    expect(resolveHoldRepeatInterval(0)).toBe(HOLD_REPEAT_START_INTERVAL_MS);
    expect(resolveHoldRepeatInterval(-10)).toBe(HOLD_REPEAT_START_INTERVAL_MS);
  });

  it('非有限値は開始間隔へ戻す', () => {
    expect(resolveHoldRepeatInterval(Number.NaN)).toBe(HOLD_REPEAT_START_INTERVAL_MS);
    expect(resolveHoldRepeatInterval(Number.POSITIVE_INFINITY)).toBe(HOLD_REPEAT_START_INTERVAL_MS);
  });

  it('時間が進むにつれて間隔が短くなり、急には下限へ落ちない', () => {
    const early = resolveHoldRepeatInterval(400);
    const mid = resolveHoldRepeatInterval(1100);
    const late = resolveHoldRepeatInterval(2200);
    const later = resolveHoldRepeatInterval(8000);

    expect(early).toBeLessThan(HOLD_REPEAT_START_INTERVAL_MS);
    expect(mid).toBeLessThan(early);
    expect(late).toBe(HOLD_REPEAT_MIN_INTERVAL_MS);
    expect(later).toBe(HOLD_REPEAT_MIN_INTERVAL_MS);
    expect(early - mid).toBeLessThan(HOLD_REPEAT_START_INTERVAL_MS - HOLD_REPEAT_MIN_INTERVAL_MS);
  });
});
