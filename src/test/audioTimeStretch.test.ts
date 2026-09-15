/**
 * @file audioTimeStretch.test.ts
 * @description 倍速 / スロー export 用・音程維持タイムストレッチの契約テスト
 */
import { describe, expect, it } from 'vitest';
import {
  alignCapturedSpeedAudioToReference,
  extractAndTimeCompressAudioBuffer,
  findLeadingAudioLagFrames,
  resolveExportCaptureMaxLagSec,
  resolveExportCaptureTailPaddingSec,
  resolveExportClipAudioSchedule,
  resolveExportClipSpeedAudio,
  resolveExportSpeedAudioStrategy,
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

  it('tempo=0.5 では出力長がおよそ2倍', () => {
    const input = new Float32Array(4000);
    for (let i = 0; i < input.length; i++) input[i] = Math.sin(i * 0.05);
    const out = wsolaTimeStretchChannel(input, 0.5);
    expect(out.length).toBeGreaterThan(7000);
    expect(out.length).toBeLessThan(9000);
  });

  it('正弦波を 0.5 倍しても実効振幅を大きく落とさない', () => {
    const input = new Float32Array(16000);
    for (let i = 0; i < input.length; i++) input[i] = Math.sin((2 * Math.PI * 220 * i) / 48000) * 0.5;
    const out = wsolaTimeStretchChannel(input, 0.5, 2048);
    const rms = (samples: Float32Array) => {
      const start = Math.floor(samples.length * 0.2);
      const end = Math.floor(samples.length * 0.8);
      let energy = 0;
      for (let i = start; i < end; i++) energy += samples[i] * samples[i];
      return Math.sqrt(energy / Math.max(1, end - start));
    };
    expect(rms(out)).toBeGreaterThan(rms(input) * 0.7);
    expect(rms(out)).toBeLessThan(rms(input) * 1.4);
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

  it('0.5 倍速で duration が約2倍になる', () => {
    const ctx = createMockAudioContext(48000);
    const buf = makeSineBuffer(ctx, 1.0, 440);
    const stretched = timeStretchAudioBufferPreservePitch(ctx, buf, 0.5);
    expect(stretched.duration).toBeGreaterThan(1.8);
    expect(stretched.duration).toBeLessThan(2.2);
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

  it('オフセット切り出し後に 0.5 倍へ伸長する', () => {
    const ctx = createMockAudioContext(48000);
    const buf = makeSineBuffer(ctx, 2.0, 220);
    const out = extractAndTimeCompressAudioBuffer(ctx, buf, 0.5, 1.0, 0.5);
    // 1 秒ソース → 0.5x → 約 2 秒
    expect(out.duration).toBeGreaterThan(1.7);
    expect(out.duration).toBeLessThan(2.3);
  });
});

describe('resolveExportSpeedAudioStrategy', () => {
  it('等倍は source、非等倍はプレビューと同じキャプチャ', () => {
    expect(resolveExportSpeedAudioStrategy(1)).toBe('source');
    expect(resolveExportSpeedAudioStrategy(0.5)).toBe('pitch-preserved-capture');
    expect(resolveExportSpeedAudioStrategy(0.8)).toBe('pitch-preserved-capture');
    expect(resolveExportSpeedAudioStrategy(2)).toBe('pitch-preserved-capture');
    expect(resolveExportSpeedAudioStrategy(4)).toBe('pitch-preserved-capture');
  });
});

describe('resolveExportCaptureMaxLagSec', () => {
  it('スローほど探索上限が長く、倍速は短い', () => {
    expect(resolveExportCaptureMaxLagSec(0.5)).toBeGreaterThan(0.7);
    expect(resolveExportCaptureMaxLagSec(0.5)).toBeLessThanOrEqual(1.25);
    expect(resolveExportCaptureMaxLagSec(2)).toBeLessThanOrEqual(0.25);
    expect(resolveExportCaptureTailPaddingSec(0.5)).toBeGreaterThan(resolveExportCaptureMaxLagSec(0.5));
  });
});

describe('findLeadingAudioLagFrames', () => {
  const sampleRate = 48000;
  const hop = Math.floor(sampleRate * 0.01);

  const sineFrom = (length: number, startFrame: number): Float32Array => {
    const out = new Float32Array(length);
    for (let i = startFrame; i < length; i++) {
      out[i] = Math.sin((2 * Math.PI * 220 * (i - startFrame)) / sampleRate) * 0.5;
    }
    return out;
  };

  it('先頭無音ぶんの遅延を検出する', () => {
    const delay = Math.round(sampleRate * 0.2);
    const captured = sineFrom(sampleRate, delay);
    const reference = sineFrom(sampleRate, 0);
    const lag = findLeadingAudioLagFrames({
      captured,
      reference,
      capturedHop: hop,
      referenceHop: hop,
      maxLagBins: 40,
    });
    expect(lag).toBeGreaterThan(sampleRate * 0.16);
    expect(lag).toBeLessThan(sampleRate * 0.24);
  });

  it('すでに揃っているときは 0', () => {
    const samples = sineFrom(sampleRate, 0);
    const lag = findLeadingAudioLagFrames({
      captured: samples,
      reference: samples,
      capturedHop: hop,
      referenceHop: hop,
      maxLagBins: 40,
    });
    expect(lag).toBe(0);
  });
});

describe('alignCapturedSpeedAudioToReference', () => {
  it('キャプチャ先頭の遅延を切って参照尺に揃える', () => {
    const ctx = createMockAudioContext(48000);
    const captured = ctx.createBuffer(1, 48000, 48000);
    const reference = ctx.createBuffer(1, 48000, 48000);
    const cap = captured.getChannelData(0);
    const ref = reference.getChannelData(0);
    const delay = 9600; // 0.2s
    for (let i = 0; i < 48000; i++) {
      ref[i] = Math.sin((2 * Math.PI * 220 * i) / 48000) * 0.5;
      cap[i] = i >= delay
        ? Math.sin((2 * Math.PI * 220 * (i - delay)) / 48000) * 0.5
        : 0;
    }
    const aligned = alignCapturedSpeedAudioToReference({
      audioContext: ctx,
      captured,
      reference,
      expectedDurationSec: 0.8,
      maxLagSec: 0.5,
    });
    expect(aligned.duration).toBeCloseTo(0.8, 2);
    const out = aligned.getChannelData(0);
    const startRms = Math.sqrt(out.slice(0, 480).reduce((s, x) => s + x * x, 0) / 480);
    expect(startRms).toBeGreaterThan(0.2);
  });
});

describe('resolveExportClipAudioSchedule', () => {
  it('速度変換済み PCM は offset=0・rate=1 で timeline 尺に載せる', () => {
    expect(resolveExportClipAudioSchedule({
      speed: 0.5,
      usedSpeedAlignedPcm: true,
      audioBufferDuration: 4.02,
      itemDuration: 4,
      trimStart: 1.5,
      playSourceDuration: 2,
    })).toEqual({
      playbackRate: 1,
      offsetSec: 0,
      durationSec: 4.02,
    });
  });

  it('未変換のスローは playbackRate フォールバックでソース区間を再生する', () => {
    expect(resolveExportClipAudioSchedule({
      speed: 0.5,
      usedSpeedAlignedPcm: false,
      audioBufferDuration: 10,
      itemDuration: 4,
      trimStart: 1.5,
      playSourceDuration: 2,
    })).toEqual({
      playbackRate: 0.5,
      offsetSec: 1.5,
      durationSec: 2,
    });
  });
});

describe('resolveExportClipSpeedAudio', () => {
  const makeBuf = (duration: number): AudioBuffer => {
    const ctx = createMockAudioContext(48000);
    return makeSineBuffer(ctx, duration, 440);
  };

  it('スローはキャプチャを先に使い、参照 PCM で先頭遅延を切る', async () => {
    const ctx = createMockAudioContext(48000);
    const decoded = makeBuf(1);
    const reference = makeSineBuffer(ctx, 1, 220);
    const captured = ctx.createBuffer(1, 48000, 48000);
    const cap = captured.getChannelData(0);
    const ref = reference.getChannelData(0);
    const delay = 9600;
    for (let i = 0; i < 48000; i++) {
      cap[i] = i >= delay ? (ref[i - delay] ?? 0) : 0;
    }
    let capturedCalls = 0;
    let stretched = 0;
    const result = await resolveExportClipSpeedAudio({
      strategy: 'pitch-preserved-capture',
      audioContext: ctx,
      alignCapturedToReference: true,
      expectedDurationSec: 0.8,
      maxLagSec: 0.5,
      capture: async () => {
        capturedCalls += 1;
        return captured;
      },
      decode: async () => decoded,
      stretch: (buffer) => {
        stretched += 1;
        expect(buffer).toBe(decoded);
        return reference;
      },
    });
    expect(capturedCalls).toBe(1);
    expect(stretched).toBe(1);
    expect(result.usedSpeedAlignedPcm).toBe(true);
    expect(result.buffer?.duration).toBeCloseTo(0.8, 2);
    const out = result.buffer?.getChannelData(0);
    expect(out).toBeTruthy();
    const startRms = Math.sqrt(out!.slice(0, 480).reduce((s, x) => s + x * x, 0) / 480);
    expect(startRms).toBeGreaterThan(0.2);
  });

  it('キャプチャ失敗時は decode+stretch へ倒す', async () => {
    let stretched = 0;
    const decoded = makeBuf(1);
    const stretchedBuf = makeBuf(2);
    const result = await resolveExportClipSpeedAudio({
      strategy: 'pitch-preserved-capture',
      capture: async () => null,
      decode: async () => decoded,
      stretch: (buffer) => {
        stretched += 1;
        expect(buffer).toBe(decoded);
        return stretchedBuf;
      },
    });
    expect(stretched).toBe(1);
    expect(result.buffer).toBe(stretchedBuf);
    expect(result.usedSpeedAlignedPcm).toBe(true);
  });

  it('倍速はキャプチャ成功時に stretch しない', async () => {
    const capturedBuf = makeBuf(0.5);
    const result = await resolveExportClipSpeedAudio({
      strategy: 'pitch-preserved-capture',
      capture: async () => capturedBuf,
      decode: async () => {
        throw new Error('decode should not run');
      },
      stretch: () => {
        throw new Error('stretch should not run');
      },
    });
    expect(result.buffer).toBe(capturedBuf);
    expect(result.usedSpeedAlignedPcm).toBe(true);
  });
});

describe('capturePitchPreservedSpeedAudio 入口', () => {
  it('等倍ではキャプチャしない', async () => {
    const { capturePitchPreservedSpeedAudio } = await import('../utils/audioPitchPreservedCapture');
    const result = await capturePitchPreservedSpeedAudio({
      file: new File([], 'clip.mp4'),
      url: '',
      trimStart: 0,
      sourceDurationSec: 1,
      speed: 1,
      audioContext: createMockAudioContext() as unknown as AudioContext,
    });
    expect(result).toBeNull();
  });
});
