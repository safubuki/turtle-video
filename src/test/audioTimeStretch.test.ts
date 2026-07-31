/**
 * @file audioTimeStretch.test.ts
 * @description 倍速 export 用・音程維持タイムストレッチの契約テスト
 */
import { describe, expect, it } from 'vitest';
import {
  extractAndTimeCompressAudioBuffer,
  timeStretchAudioBufferPreservePitch,
  wsolaTimeStretchChannel,
} from '../utils/audioTimeStretch';

/** jsdom に OfflineAudioContext が無いので最小モックで createBuffer だけ用意する */
function createMockAudioContext(sampleRate = 48000): BaseAudioContext {
  return {
    sampleRate,
    createBuffer(numberOfChannels: number, length: number, sr: number) {
      const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
      return {
        numberOfChannels,
        length,
        sampleRate: sr,
        duration: length / sr,
        getChannelData: (c: number) => channels[c],
        copyToChannel: (source: Float32Array, c: number) => {
          channels[c].set(source.subarray(0, length));
        },
      } as AudioBuffer;
    },
  } as BaseAudioContext;
}

function makeSineBuffer(
  ctx: BaseAudioContext,
  durationSec: number,
  freqHz: number,
): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * durationSec);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.sin((2 * Math.PI * freqHz * i) / ctx.sampleRate) * 0.5;
  }
  return buf;
}

describe('wsolaTimeStretchChannel', () => {
  it('tempo=1 では長さがほぼ同じ（コピー）', () => {
    const input = new Float32Array(4000);
    for (let i = 0; i < input.length; i++) input[i] = Math.sin(i * 0.05);
    const out = wsolaTimeStretchChannel(input, 1);
    expect(out.length).toBe(input.length);
  });

  it('tempo=2 では出力長がおよそ半分', () => {
    const input = new Float32Array(8000);
    for (let i = 0; i < input.length; i++) input[i] = Math.sin(i * 0.05);
    const out = wsolaTimeStretchChannel(input, 2);
    expect(out.length).toBeGreaterThan(3000);
    expect(out.length).toBeLessThan(5000);
  });
});

describe('timeStretchAudioBufferPreservePitch', () => {
  it('2 倍速で duration が約半分になる', () => {
    const ctx = createMockAudioContext(48000);
    const buf = makeSineBuffer(ctx, 1.0, 440);
    const stretched = timeStretchAudioBufferPreservePitch(ctx, buf, 2);
    expect(stretched.duration).toBeGreaterThan(0.4);
    expect(stretched.duration).toBeLessThan(0.65);
  });
});

describe('extractAndTimeCompressAudioBuffer', () => {
  it('オフセット切り出し後に 2 倍へ圧縮する', () => {
    const ctx = createMockAudioContext(48000);
    const buf = makeSineBuffer(ctx, 2.0, 220);
    const out = extractAndTimeCompressAudioBuffer(ctx, buf, 0.5, 1.0, 2);
    // 1 秒ソース → 2x → 約 0.5 秒
    expect(out.duration).toBeGreaterThan(0.35);
    expect(out.duration).toBeLessThan(0.7);
  });

  it('speed=1 では切り出し長のみ', () => {
    const ctx = createMockAudioContext(48000);
    const buf = makeSineBuffer(ctx, 1.0, 330);
    const out = extractAndTimeCompressAudioBuffer(ctx, buf, 0, 0.5, 1);
    expect(out.duration).toBeCloseTo(0.5, 1);
  });
});
