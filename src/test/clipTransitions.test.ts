/**
 * clipTransitions（クリップ間トランジション純ロジック）のテスト
 */

import { describe, expect, it } from 'vitest';
import {
  CLIP_TRANSITION_DURATION_OPTIONS,
  getIncomingTransitionOverlay,
  getOutgoingTransitionOverlay,
} from '../utils/clipTransitions';

describe('getOutgoingTransitionOverlay', () => {
  it('dissolve returns no color overlay (handled by the overlap timeline instead)', () => {
    const tr = { type: 'dissolve' as const, duration: 1 };
    expect(getOutgoingTransitionOverlay(tr, 0.5)).toBeNull();
    expect(getOutgoingTransitionOverlay(tr, 0)).toBeNull();
  });

  it('fade dips into color over the last d/2 seconds', () => {
    const black = { type: 'fade-black' as const, duration: 2 };
    expect(getOutgoingTransitionOverlay(black, 1.5)).toBeNull(); // half=1 の範囲外
    const mid = getOutgoingTransitionOverlay(black, 0.5);
    expect(mid).toMatchObject({ color: '#000000' });
    expect((mid as { alpha: number }).alpha).toBeCloseTo(0.5);

    const white = getOutgoingTransitionOverlay({ type: 'fade-white', duration: 2 }, 0);
    expect(white).toMatchObject({ color: '#ffffff', alpha: 1 });
  });
});

describe('getIncomingTransitionOverlay', () => {
  it('dissolve has no incoming overlay (handled on the outgoing side)', () => {
    expect(getIncomingTransitionOverlay({ type: 'dissolve', duration: 1 }, 0)).toBeNull();
  });

  it('fade clears from color over the first d/2 seconds', () => {
    const tr = { type: 'fade-black' as const, duration: 2 };
    expect(getIncomingTransitionOverlay(tr, 0)).toMatchObject({ color: '#000000', alpha: 1 });
    const mid = getIncomingTransitionOverlay(tr, 0.5);
    expect(mid?.alpha).toBeCloseTo(0.5);
    expect(getIncomingTransitionOverlay(tr, 1)).toBeNull();
    expect(getIncomingTransitionOverlay(tr, -0.1)).toBeNull();
  });

  it('exposes the expected duration options', () => {
    expect([...CLIP_TRANSITION_DURATION_OPTIONS]).toEqual([0.5, 1, 2]);
  });
});
