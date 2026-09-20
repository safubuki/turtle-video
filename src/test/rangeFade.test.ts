import { describe, expect, it } from 'vitest';
import { calculateLinearRangeFadeAlpha } from '../utils/rangeFade';

describe('calculateLinearRangeFadeAlpha', () => {
  it('フェード無効時は 1', () => {
    expect(calculateLinearRangeFadeAlpha({
      startTime: 0,
      endTime: 10,
      timeSec: 9,
      fadeIn: false,
      fadeOut: false,
      fadeInDuration: 1,
      fadeOutDuration: 1,
    })).toBe(1);
  });

  it('末尾で線形にフェードアウトする', () => {
    expect(calculateLinearRangeFadeAlpha({
      startTime: 0,
      endTime: 10,
      timeSec: 9.5,
      fadeIn: false,
      fadeOut: true,
      fadeInDuration: 1,
      fadeOutDuration: 1,
    })).toBeCloseTo(0.5, 5);
  });
});
