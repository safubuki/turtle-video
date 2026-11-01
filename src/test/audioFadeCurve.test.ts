/**
 * @file audioFadeCurve.test.ts
 * @description 書き出しの BGM フェードインをプレビューの GainNode 追従と同じ形にするカーブの契約テスト
 */
import { describe, expect, it } from 'vitest';
import {
  buildSmoothedFadeInCurve,
  PREVIEW_AUDIO_CLIP_GAIN_SMOOTHING_SEC,
} from '../utils/audioFadeCurve';

/** カーブ上の時刻 t（秒）の値を線形補間で読む（setValueCurveAtTime と同じ読み方） */
function sampleCurve(curve: Float32Array, durationSec: number, t: number): number {
  const pos = (t / durationSec) * (curve.length - 1);
  const i = Math.floor(pos);
  if (i >= curve.length - 1) return curve[curve.length - 1];
  return curve[i] + (curve[i + 1] - curve[i]) * (pos - i);
}

describe('buildSmoothedFadeInCurve', () => {
  it('0 から始まり、フェード終端でちょうど設定音量に届く', () => {
    const curve = buildSmoothedFadeInCurve(1.6, 1)!;
    expect(curve[0]).toBe(0);
    expect(curve[curve.length - 1]).toBeCloseTo(1.6, 6);
  });

  it('単調に増える', () => {
    const curve = buildSmoothedFadeInCurve(1, 2)!;
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    }
  });

  it('立ち上がりは直線より大きく抑えられる（1 秒フェードの 0.1 秒で直線 16% に対し 7% 未満）', () => {
    const curve = buildSmoothedFadeInCurve(1, 1)!;
    expect(sampleCurve(curve, 1, 0.05)).toBeLessThan(0.05 * 0.3);
    expect(sampleCurve(curve, 1, 0.1)).toBeLessThan(0.07);
    expect(sampleCurve(curve, 1, 0.5)).toBeGreaterThan(0.4);
  });

  it('プレビューの一次遅れ追従（時定数 0.1 秒）と立ち上がりの形が近い', () => {
    const tau = PREVIEW_AUDIO_CLIP_GAIN_SMOOTHING_SEC;
    const curve = buildSmoothedFadeInCurve(1, 1)!;
    for (const t of [0.1, 0.2, 0.3]) {
      const preview = t - tau * (1 - Math.exp(-t / tau));
      expect(sampleCurve(curve, 1, t)).toBeGreaterThan(preview);
      expect(sampleCurve(curve, 1, t)).toBeLessThan(preview * 1.15);
    }
  });

  it('時定数 0 なら直線になる', () => {
    const curve = buildSmoothedFadeInCurve(1, 1, 0)!;
    expect(sampleCurve(curve, 1, 0.25)).toBeCloseTo(0.25, 3);
    expect(sampleCurve(curve, 1, 0.5)).toBeCloseTo(0.5, 3);
  });

  it('長いフェードでも点数に上限がある', () => {
    const curve = buildSmoothedFadeInCurve(1, 60)!;
    expect(curve.length).toBeLessThanOrEqual(4001);
    expect(curve[curve.length - 1]).toBe(1);
  });

  it('不正値は null（呼び出し側で直線フェードへ戻す）', () => {
    expect(buildSmoothedFadeInCurve(0, 1)).toBeNull();
    expect(buildSmoothedFadeInCurve(1, 0)).toBeNull();
    expect(buildSmoothedFadeInCurve(Number.NaN, 1)).toBeNull();
    expect(buildSmoothedFadeInCurve(1, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
