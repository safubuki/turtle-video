/**
 * @file videoAudioLoudness.test.ts
 * @description 動画カード間の音量揃え純ロジック
 */
import { describe, expect, it } from 'vitest';
import {
  computeEqualizeGains,
  computeRms,
  computeRmsForTimeRange,
  formatNormalizeAdjustment,
  MIN_MEASURABLE_RMS,
} from '../utils/videoAudioLoudness';
import { resolveMediaPlaybackVolume } from '../utils/mediaVolume';

describe('computeRms', () => {
  it('無音は 0、一定振幅はその絶対値', () => {
    expect(computeRms([0, 0, 0, 0])).toBe(0);
    expect(computeRms([0.5, 0.5, -0.5, -0.5])).toBeCloseTo(0.5);
  });

  it('時間範囲の RMS は指定区間だけを測る', () => {
    const samples = [0.1, 0.1, 1, 1];
    expect(computeRmsForTimeRange(samples, 2, 0, 1)).toBeCloseTo(0.1);
    expect(computeRmsForTimeRange(samples, 2, 1, 2)).toBeCloseTo(1);
  });
});

describe('computeEqualizeGains', () => {
  it('計測可能な参加クリップが 2 本未満ならすべて 1', () => {
    expect(computeEqualizeGains([
      { id: 'a', rms: 0.2, participating: true },
    ])).toEqual({ a: 1 });
    expect(computeEqualizeGains([
      { id: 'a', rms: 0.2, participating: true },
      { id: 'b', rms: MIN_MEASURABLE_RMS / 2, participating: true },
    ])).toEqual({ a: 1, b: 1 });
  });

  it('小さい音は上げ、大きい音は下げる', () => {
    const gains = computeEqualizeGains([
      { id: 'quiet', rms: 0.05, participating: true },
      { id: 'loud', rms: 0.2, participating: true },
    ]);
    expect(gains.quiet).toBeGreaterThan(1);
    expect(gains.loud).toBeLessThan(1);
    expect(0.05 * gains.quiet).toBeCloseTo(0.2 * gains.loud, 5);
  });

  it('対象外のクリップは 1 のまま', () => {
    const gains = computeEqualizeGains([
      { id: 'quiet', rms: 0.05, participating: true },
      { id: 'loud', rms: 0.2, participating: true },
      { id: 'skip', rms: 0.01, participating: false },
    ]);
    expect(gains.skip).toBe(1);
    expect(gains.quiet).toBeGreaterThan(1);
  });

  it('小さい動画が多いと平均合わせは大きい音を下げ、最大合わせは下げない', () => {
    const samples = [
      { id: 'quiet1', rms: 0.05, participating: true },
      { id: 'quiet2', rms: 0.05, participating: true },
      { id: 'loud', rms: 0.2, participating: true },
    ];
    const meanGains = computeEqualizeGains(samples, 'mean');
    expect(meanGains.loud).toBeLessThan(1);
    expect(meanGains.quiet1).toBeGreaterThan(1);

    const loudestGains = computeEqualizeGains(samples, 'loudest');
    expect(loudestGains.loud).toBe(1);
    expect(loudestGains.quiet1).toBeGreaterThan(meanGains.quiet1);
    expect(0.05 * loudestGains.quiet1).toBeCloseTo(0.2, 5);
  });
});

describe('formatNormalizeAdjustment', () => {
  it('ほぼ等倍は変更なし、上げ下げを dB で示す', () => {
    expect(formatNormalizeAdjustment(1)).toBe('変更なし');
    expect(formatNormalizeAdjustment(2)).toBe('+6.0 dB');
    expect(formatNormalizeAdjustment(0.5)).toBe('-6.0 dB');
  });
});

describe('resolveMediaPlaybackVolume', () => {
  it('ミュートは 0、音量揃えゲインを乗算して 250% でクランプ', () => {
    expect(resolveMediaPlaybackVolume({ volume: 1, isMuted: true, audioNormalizeGain: 2 })).toBe(0);
    expect(resolveMediaPlaybackVolume({ volume: 1, audioNormalizeGain: 1.5 })).toBeCloseTo(1.5);
    expect(resolveMediaPlaybackVolume({ volume: 2, audioNormalizeGain: 2 })).toBe(2.5);
    expect(resolveMediaPlaybackVolume({ volume: 0.8 })).toBeCloseTo(0.8);
  });
});
