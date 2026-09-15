/**
 * @file audioTimeStretch.ts
 * @description 音程をできるだけ保ったまま時間伸縮する（倍速・スロー export 用）。
 * HTMLMediaElement の preservesPitch=true（プレビュー既定）に聴感を近づける。
 * AudioBufferSourceNode.playbackRate だけだとピッチも変わり「高音／低音で聞き取りづらい」になる。
 *
 * 非等倍の第一経路はプレビューと同じ preservesPitch キャプチャ。WSOLA は
 * キャプチャ失敗時の予備。スローではキャプチャ先頭の処理遅延を、デコード伸長した
 * 参照 PCM とのエンベロープ相関で切る（切らないと口パクが遅れる）。
 */
import { normalizeVideoPlaybackSpeed } from './playbackSpeed';

function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  if (size <= 1) {
    if (size === 1) w[0] = 1;
    return w;
  }
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

/**
 * 単一チャンネルを WSOLA でテンポ変更する。
 * @param tempo 1 より大きいほど速い（出力が短い）。1 未満はスロー。
 */
export function wsolaTimeStretchChannel(
  input: Float32Array,
  tempo: number,
  frameSize = 1024,
): Float32Array {
  if (!input.length) return new Float32Array(0);
  if (!Number.isFinite(tempo) || tempo <= 0) {
    return new Float32Array(input);
  }
  if (Math.abs(tempo - 1) < 1e-4) {
    return new Float32Array(input);
  }

  const synthesisHop = Math.max(1, Math.floor(frameSize / 2));
  const analysisHop = Math.max(1, Math.round(synthesisHop * tempo));
  const outputLength = Math.max(1, Math.floor(input.length / tempo));
  const output = new Float32Array(outputLength);
  const weight = new Float32Array(outputLength);
  const window = hannWindow(frameSize);
  const searchRadius = Math.max(0, Math.floor(synthesisHop / 2));

  // 最初のフレーム
  for (let i = 0; i < frameSize && i < input.length && i < outputLength; i++) {
    output[i] += input[i] * window[i];
    weight[i] += window[i];
  }

  let outputPos = synthesisHop;
  let inputCenter = analysisHop;

  while (outputPos + frameSize < outputLength) {
    const idealInput = Math.round(inputCenter);
    let bestOffset = 0;
    let bestCorr = -Infinity;

    // 直前の出力オーバーラップとの相関で位置を微調整（ピッチ感の破綻を抑える）
    const searchStart = Math.max(0, idealInput - searchRadius);
    const searchEnd = Math.min(
      Math.max(0, input.length - frameSize),
      idealInput + searchRadius,
    );

    if (searchEnd >= searchStart && outputPos >= synthesisHop) {
      for (let candidate = searchStart; candidate <= searchEnd; candidate++) {
        let corr = 0;
        const overlap = synthesisHop;
        for (let i = 0; i < overlap; i++) {
          const outIdx = outputPos - synthesisHop + i;
          const inIdx = candidate + i;
          if (outIdx >= 0 && outIdx < outputLength && inIdx < input.length) {
            corr += output[outIdx] * input[inIdx];
          }
        }
        if (corr > bestCorr) {
          bestCorr = corr;
          bestOffset = candidate - idealInput;
        }
      }
    }

    const frameStart = Math.max(0, Math.min(input.length - frameSize, idealInput + bestOffset));
    for (let i = 0; i < frameSize; i++) {
      const o = outputPos + i;
      if (o >= outputLength) break;
      const s = frameStart + i;
      if (s >= 0 && s < input.length) {
        output[o] += input[s] * window[i];
        weight[o] += window[i];
      }
    }

    outputPos += synthesisHop;
    inputCenter += analysisHop;
  }

  // 窓加算は COLA がずれるとピークが跳ね、単純な peak 正規化だと
  // 全体が沈んで「薄い／デジタルエコー」に聞こえる。重みで割って振幅を保つ。
  for (let i = 0; i < output.length; i++) {
    const w = weight[i] ?? 0;
    if (w > 1e-6) output[i] /= w;
  }

  return output;
}

/**
 * AudioBuffer を tempo 倍速（tempo>1 で短い）に時間圧縮。ピッチは WSOLA で概ね維持。
 * @returns 新しい AudioBuffer（元は変更しない）
 */
export function timeStretchAudioBufferPreservePitch(
  audioContext: BaseAudioContext,
  buffer: AudioBuffer,
  tempo: number,
): AudioBuffer {
  if (!Number.isFinite(tempo) || tempo <= 0 || Math.abs(tempo - 1) < 1e-4) {
    // コピーを返して呼び出し側が安全に差し替えられるようにする
    const copy = audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate,
    );
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      copy.copyToChannel(buffer.getChannelData(c), c);
    }
    return copy;
  }

  // スローは窓を少し長くして粒状のデジタルエコーを抑える。倍速は従来の ~30ms。
  const frameSec = tempo < 1 ? 0.05 : 0.03;
  const frameSize = Math.min(
    4096,
    Math.max(512, Math.floor(buffer.sampleRate * frameSec)),
  );
  const channels: Float32Array[] = [];
  let outLen = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const stretched = wsolaTimeStretchChannel(
      buffer.getChannelData(c),
      tempo,
      frameSize,
    );
    channels.push(stretched);
    outLen = Math.max(outLen, stretched.length);
  }

  const result = audioContext.createBuffer(
    buffer.numberOfChannels,
    Math.max(1, outLen),
    buffer.sampleRate,
  );
  for (let c = 0; c < channels.length; c++) {
    const dest = result.getChannelData(c);
    const src = channels[c];
    dest.set(src.subarray(0, Math.min(src.length, dest.length)));
  }
  return result;
}

/**
 * 元バッファの [offsetSec, offsetSec+sourceDurationSec) を切り出し、
 * speed 倍に時間伸縮したバッファを返す（音程維持）。
 * speed>1 は圧縮、speed<1 は伸長、speed≈1 は切り出しのみ。
 */
export function extractAndTimeCompressAudioBuffer(
  audioContext: BaseAudioContext,
  buffer: AudioBuffer,
  offsetSec: number,
  sourceDurationSec: number,
  speed: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const start = Math.max(0, Math.floor((Number.isFinite(offsetSec) ? offsetSec : 0) * sr));
  const maxLen = buffer.length - start;
  const wantLen = Math.max(
    1,
    Math.floor((Number.isFinite(sourceDurationSec) && sourceDurationSec > 0
      ? sourceDurationSec
      : buffer.duration) * sr),
  );
  const sliceLen = Math.max(1, Math.min(maxLen, wantLen));

  const sliced = audioContext.createBuffer(
    buffer.numberOfChannels,
    sliceLen,
    sr,
  );
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dest = sliced.getChannelData(c);
    for (let i = 0; i < sliceLen; i++) {
      dest[i] = src[start + i] ?? 0;
    }
  }

  const tempo = Number.isFinite(speed) && speed > 0 ? speed : 1;
  if (Math.abs(tempo - 1) < 1e-3) {
    return sliced;
  }
  return timeStretchAudioBufferPreservePitch(audioContext, sliced, tempo);
}

/** export クリップ音声をタイムライン尺へ載せる方式 */
export type ExportSpeedAudioStrategy =
  | 'source'
  | 'offline-stretch'
  | 'pitch-preserved-capture';

const ALIGN_HOP_SEC = 0.01;
const ALIGN_MIN_SCORE = 0.25;
const ALIGN_MIN_IMPROVEMENT = 0.08;

/**
 * 等倍はソース直載せ。非等倍はプレビューと同じ preservesPitch キャプチャ。
 * WSOLA（offline-stretch）はキャプチャ失敗時の予備経路。
 */
export function resolveExportSpeedAudioStrategy(speed: unknown): ExportSpeedAudioStrategy {
  const s = normalizeVideoPlaybackSpeed(speed);
  if (Math.abs(s - 1) <= 0.001) return 'source';
  return 'pitch-preserved-capture';
}

/** preservesPitch 遅延の探索上限（壁時計秒）。低速ほどソース先読みが出力側で伸びる。 */
export function resolveExportCaptureMaxLagSec(speed: unknown): number {
  const s = normalizeVideoPlaybackSpeed(speed);
  if (s >= 1) return 0.2;
  return Math.min(1.25, Math.max(0.2, 0.45 / s));
}

/** 遅延を切ったあともクリップ末尾が残るよう、キャプチャを延長する秒数。 */
export function resolveExportCaptureTailPaddingSec(speed: unknown): number {
  return resolveExportCaptureMaxLagSec(speed) + 0.1;
}

function mixAudioBufferToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const channels = buffer.numberOfChannels;
  const out = new Float32Array(length);
  if (channels <= 0 || length <= 0) return out;
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      out[i] += data[i] ?? 0;
    }
  }
  if (channels > 1) {
    const inv = 1 / channels;
    for (let i = 0; i < length; i++) out[i] *= inv;
  }
  return out;
}

function rmsEnvelope(samples: Float32Array, hop: number): Float32Array {
  const hopSize = Math.max(1, Math.floor(hop));
  const n = Math.floor(samples.length / hopSize);
  const env = new Float32Array(Math.max(0, n));
  for (let i = 0; i < n; i++) {
    let energy = 0;
    const start = i * hopSize;
    for (let j = 0; j < hopSize; j++) {
      const x = samples[start + j] ?? 0;
      energy += x * x;
    }
    env[i] = Math.sqrt(energy / hopSize);
  }
  return env;
}

function envelopeNcc(captured: Float32Array, reference: Float32Array, lagBin: number): number {
  const n = Math.min(reference.length, captured.length - lagBin);
  if (n < 8) return -1;
  let dot = 0;
  let capEnergy = 0;
  let refEnergy = 0;
  for (let i = 0; i < n; i++) {
    const a = captured[lagBin + i] ?? 0;
    const b = reference[i] ?? 0;
    dot += a * b;
    capEnergy += a * a;
    refEnergy += b * b;
  }
  const denom = Math.sqrt(capEnergy * refEnergy);
  if (!(denom > 1e-12)) return -1;
  return dot / denom;
}

/**
 * captured が reference より先頭で遅れているフレーム数。
 * 遅延なし（lag=0 が最良）や相関が弱いときは 0。
 */
export function findLeadingAudioLagFrames(params: {
  captured: Float32Array;
  reference: Float32Array;
  capturedHop: number;
  referenceHop: number;
  maxLagBins: number;
}): number {
  const capturedHop = Math.max(1, Math.floor(params.capturedHop));
  const referenceHop = Math.max(1, Math.floor(params.referenceHop));
  const capEnv = rmsEnvelope(params.captured, capturedHop);
  const refEnv = rmsEnvelope(params.reference, referenceHop);
  const maxLagBins = Math.max(0, Math.floor(params.maxLagBins));
  if (capEnv.length < 8 || refEnv.length < 8 || maxLagBins < 1) return 0;

  const scoreAtZero = envelopeNcc(capEnv, refEnv, 0);
  let bestLag = 0;
  let bestScore = scoreAtZero;
  for (let lagBin = 1; lagBin <= maxLagBins; lagBin++) {
    if (lagBin >= capEnv.length - 8) break;
    const score = envelopeNcc(capEnv, refEnv, lagBin);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lagBin;
    }
  }

  if (bestLag <= 0) return 0;
  if (bestScore < ALIGN_MIN_SCORE) return 0;
  if (bestScore < scoreAtZero + ALIGN_MIN_IMPROVEMENT) return 0;
  return bestLag * capturedHop;
}

function sliceAudioBuffer(
  audioContext: BaseAudioContext,
  buffer: AudioBuffer,
  startFrame: number,
  length: number,
): AudioBuffer {
  const start = Math.max(0, Math.floor(startFrame));
  const outLen = Math.max(1, Math.floor(length));
  const out = audioContext.createBuffer(buffer.numberOfChannels, outLen, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dest = out.getChannelData(c);
    for (let i = 0; i < outLen; i++) {
      dest[i] = src[start + i] ?? 0;
    }
  }
  return out;
}

/**
 * キャプチャ PCM の先頭遅延を、サンプル正確な参照（decode+WSOLA）との
 * 振幅エンベロープ相関で切る。品質はキャプチャのまま、口パクだけ合わせる。
 */
export function alignCapturedSpeedAudioToReference(params: {
  audioContext: BaseAudioContext;
  captured: AudioBuffer;
  reference: AudioBuffer;
  expectedDurationSec: number;
  maxLagSec: number;
}): AudioBuffer {
  const { audioContext, captured, reference } = params;
  const expectedDurationSec = Number.isFinite(params.expectedDurationSec)
    ? Math.max(0, params.expectedDurationSec)
    : captured.duration;
  const maxLagSec = Number.isFinite(params.maxLagSec) ? Math.max(0, params.maxLagSec) : 0;
  const outLen = Math.max(1, Math.round(expectedDurationSec * captured.sampleRate));
  if (maxLagSec < ALIGN_HOP_SEC || captured.length < 32 || reference.length < 32) {
    return sliceAudioBuffer(audioContext, captured, 0, Math.min(outLen, captured.length));
  }

  const capturedHop = Math.max(1, Math.floor(captured.sampleRate * ALIGN_HOP_SEC));
  const referenceHop = Math.max(1, Math.floor(reference.sampleRate * ALIGN_HOP_SEC));
  const maxLagBins = Math.max(1, Math.floor(maxLagSec / ALIGN_HOP_SEC));
  const lagFrames = findLeadingAudioLagFrames({
    captured: mixAudioBufferToMono(captured),
    reference: mixAudioBufferToMono(reference),
    capturedHop,
    referenceHop,
    maxLagBins,
  });
  const start = Math.min(Math.max(0, lagFrames), Math.max(0, captured.length - 1));
  return sliceAudioBuffer(audioContext, captured, start, outLen);
}

export function resolveExportClipAudioSchedule(params: {
  speed: unknown;
  usedSpeedAlignedPcm: boolean;
  audioBufferDuration: number;
  itemDuration: number;
  trimStart: number;
  playSourceDuration: number;
}): { playbackRate: number; offsetSec: number; durationSec: number } {
  const speed = normalizeVideoPlaybackSpeed(params.speed);
  const bufferDuration = Number.isFinite(params.audioBufferDuration)
    ? Math.max(0, params.audioBufferDuration)
    : 0;
  const itemDuration = Number.isFinite(params.itemDuration)
    ? Math.max(0, params.itemDuration)
    : 0;
  const trimStart = Number.isFinite(params.trimStart) ? Math.max(0, params.trimStart) : 0;
  const playSourceDuration = Number.isFinite(params.playSourceDuration)
    ? Math.max(0, params.playSourceDuration)
    : 0;

  if (params.usedSpeedAlignedPcm) {
    return {
      playbackRate: 1,
      offsetSec: 0,
      durationSec: Math.min(bufferDuration, itemDuration + 0.05),
    };
  }
  if (Math.abs(speed - 1) > 0.001 && playSourceDuration > 0) {
    return {
      playbackRate: speed,
      offsetSec: trimStart,
      durationSec: playSourceDuration,
    };
  }
  return {
    playbackRate: 1,
    offsetSec: trimStart,
    durationSec: playSourceDuration > 0 ? playSourceDuration : itemDuration,
  };
}

/**
 * クリップ音声バッファの取得順。
 * 非等倍はキャプチャを先に使い、必要なら参照 PCM で先頭遅延を切る。
 * キャプチャ失敗時は decode + WSOLA。
 */
export async function resolveExportClipSpeedAudio(params: {
  strategy: ExportSpeedAudioStrategy;
  capture: () => Promise<AudioBuffer | null>;
  decode: () => Promise<AudioBuffer | null>;
  stretch: (buffer: AudioBuffer) => AudioBuffer;
  audioContext?: BaseAudioContext;
  alignCapturedToReference?: boolean;
  expectedDurationSec?: number;
  maxLagSec?: number;
}): Promise<{ buffer: AudioBuffer | null; usedSpeedAlignedPcm: boolean }> {
  const {
    strategy,
    capture,
    decode,
    stretch,
    audioContext,
    alignCapturedToReference,
    expectedDurationSec,
    maxLagSec,
  } = params;

  if (strategy === 'pitch-preserved-capture') {
    const captured = await capture();
    if (captured) {
      if (alignCapturedToReference && audioContext) {
        const decoded = await decode();
        if (decoded) {
          const reference = stretch(decoded);
          return {
            buffer: alignCapturedSpeedAudioToReference({
              audioContext,
              captured,
              reference,
              expectedDurationSec: expectedDurationSec ?? captured.duration,
              maxLagSec: maxLagSec ?? 0.5,
            }),
            usedSpeedAlignedPcm: true,
          };
        }
      }
      return { buffer: captured, usedSpeedAlignedPcm: true };
    }
  }

  const decoded = await decode();
  if (!decoded) {
    if (strategy === 'offline-stretch') {
      const captured = await capture();
      if (captured) return { buffer: captured, usedSpeedAlignedPcm: true };
    }
    return { buffer: null, usedSpeedAlignedPcm: false };
  }

  if (strategy === 'source') {
    return { buffer: decoded, usedSpeedAlignedPcm: false };
  }

  return { buffer: stretch(decoded), usedSpeedAlignedPcm: true };
}
