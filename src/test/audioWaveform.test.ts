/**
 * audioWaveform.ts の純ロジックテスト。
 * 波形ピーク集約 / 無音区間検出 / モノラルミックスの不変条件を固定する。
 */
import { describe, it, expect } from 'vitest';
import {
  computeWaveformPeaks,
  detectSilenceSplitPoints,
  mixToMono,
  type MonoPcm,
} from '../utils/audioWaveform';

/** 指定区間だけ振幅 amp のサイン波、それ以外は無音の PCM を作る */
function buildPcm(
  sampleRate: number,
  segments: Array<{ from: number; to: number; amp: number }>,
  totalSec: number,
): MonoPcm {
  const total = Math.round(totalSec * sampleRate);
  const samples = new Float32Array(total);
  for (const seg of segments) {
    const start = Math.round(seg.from * sampleRate);
    const end = Math.round(seg.to * sampleRate);
    for (let i = start; i < end && i < total; i++) {
      // 440Hz サイン波（位相は問わない）
      samples[i] = seg.amp * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }
  }
  return { samples, sampleRate };
}

describe('computeWaveformPeaks', () => {
  it('returns exactly bucketCount entries', () => {
    const pcm = buildPcm(8000, [{ from: 0, to: 1, amp: 0.5 }], 1);
    expect(computeWaveformPeaks(pcm, 100)).toHaveLength(100);
    expect(computeWaveformPeaks(pcm, 1)).toHaveLength(1);
  });

  it('captures the peak absolute amplitude per bucket', () => {
    // 前半 amp=0.2、後半 amp=0.8 → 前半バケットは ~0.2、後半バケットは ~0.8
    const pcm = buildPcm(8000, [
      { from: 0, to: 0.5, amp: 0.2 },
      { from: 0.5, to: 1, amp: 0.8 },
    ], 1);
    const peaks = computeWaveformPeaks(pcm, 2);
    expect(peaks[0]).toBeGreaterThan(0.15);
    expect(peaks[0]).toBeLessThan(0.25);
    expect(peaks[1]).toBeGreaterThan(0.7);
    expect(peaks[1]).toBeLessThanOrEqual(0.8 + 1e-6);
  });

  it('handles empty pcm without throwing', () => {
    const peaks = computeWaveformPeaks({ samples: new Float32Array(0), sampleRate: 8000 }, 10);
    expect(peaks).toHaveLength(10);
    expect(Array.from(peaks).every((v) => v === 0)).toBe(true);
  });

  it('clamps bucketCount to at least 1', () => {
    const pcm = buildPcm(8000, [{ from: 0, to: 1, amp: 0.5 }], 1);
    expect(computeWaveformPeaks(pcm, 0)).toHaveLength(1);
    expect(computeWaveformPeaks(pcm, -5)).toHaveLength(1);
  });
});

describe('detectSilenceSplitPoints', () => {
  it('detects a clear silence gap between two speech segments', () => {
    // 0.0-0.8 音, 0.8-1.2 無音, 1.2-2.0 音 → 区切りは ~1.0 秒付近
    const pcm = buildPcm(16000, [
      { from: 0, to: 0.8, amp: 0.6 },
      { from: 1.2, to: 2.0, amp: 0.6 },
    ], 2);
    const points = detectSilenceSplitPoints(pcm);
    expect(points.length).toBeGreaterThanOrEqual(1);
    const gap = points.find((p) => p.time > 0.85 && p.time < 1.15);
    expect(gap).toBeDefined();
    expect(gap!.duration).toBeGreaterThan(0.2);
  });

  it('returns points sorted by time ascending', () => {
    const pcm = buildPcm(16000, [
      { from: 0, to: 0.5, amp: 0.6 },
      { from: 0.9, to: 1.4, amp: 0.6 },
      { from: 1.8, to: 2.3, amp: 0.6 },
    ], 2.8);
    const points = detectSilenceSplitPoints(pcm);
    const times = points.map((p) => p.time);
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  it('ignores gaps within the edge margin', () => {
    // 冒頭 0.3 秒の無音 + 末尾 0.3 秒の無音のみ → edgeMargin 内なので候補ゼロ
    const pcm = buildPcm(16000, [{ from: 0.3, to: 1.7, amp: 0.6 }], 2);
    const points = detectSilenceSplitPoints(pcm, { edgeMarginSec: 0.5 });
    // 中央には無音がないので、端の谷は除外され候補は空
    expect(points.every((p) => p.time > 0.5 && p.time < 1.5)).toBe(true);
  });

  it('does not treat a short dip below minSilenceSec as a split', () => {
    // 0.02 秒だけのごく短い無音は最小継続に満たない
    const pcm = buildPcm(16000, [
      { from: 0, to: 0.9, amp: 0.6 },
      { from: 0.92, to: 2.0, amp: 0.6 },
    ], 2);
    const points = detectSilenceSplitPoints(pcm, { minSilenceSec: 0.12 });
    expect(points.find((p) => p.time > 0.85 && p.time < 0.95)).toBeUndefined();
  });

  it('returns empty for a fully silent buffer', () => {
    const pcm: MonoPcm = { samples: new Float32Array(16000 * 2), sampleRate: 16000 };
    expect(detectSilenceSplitPoints(pcm)).toEqual([]);
  });

  it('returns empty for an empty buffer', () => {
    expect(detectSilenceSplitPoints({ samples: new Float32Array(0), sampleRate: 16000 })).toEqual([]);
  });

  it('caps the number of candidates and keeps the longest gaps', () => {
    // 多数の短い区切りと 1 つの長い区切りを混ぜ、maxCandidates=2 で長い間が残ることを確認
    const segments: Array<{ from: number; to: number; amp: number }> = [];
    let t = 0;
    for (let i = 0; i < 8; i++) {
      segments.push({ from: t, to: t + 0.4, amp: 0.6 });
      t += 0.4 + 0.15; // 0.15 秒の間
    }
    // 最後に長い無音（0.6 秒）を挟む
    segments.push({ from: t + 0.6, to: t + 1.2, amp: 0.6 });
    const totalSec = t + 1.4;
    const pcm = buildPcm(16000, segments, totalSec);

    const points = detectSilenceSplitPoints(pcm, { maxCandidates: 2 });
    expect(points.length).toBeLessThanOrEqual(2);
    // 最長の間（~0.6秒）が残っていること
    const longest = Math.max(...points.map((p) => p.duration));
    expect(longest).toBeGreaterThan(0.4);
  });
});

describe('mixToMono', () => {
  it('passes through a single channel unchanged', () => {
    const ch = new Float32Array([0.1, 0.2, 0.3]);
    const mono = mixToMono([ch], 8000);
    expect(mono.samples).toBe(ch);
    expect(mono.sampleRate).toBe(8000);
  });

  it('averages multiple channels', () => {
    const l = new Float32Array([1, 0, -1]);
    const r = new Float32Array([0, 0, 1]);
    const mono = mixToMono([l, r], 8000);
    expect(Array.from(mono.samples as Float32Array)).toEqual([0.5, 0, 0]);
  });

  it('returns empty pcm for no channels', () => {
    const mono = mixToMono([], 8000);
    expect(mono.samples).toHaveLength(0);
    expect(mono.sampleRate).toBe(8000);
  });
});
