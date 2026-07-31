/**
 * @file audioTimeStretch.ts
 * @description 音程をできるだけ保ったまま時間圧縮する（倍速 export 用）。
 * HTMLMediaElement の preservesPitch=true（プレビュー既定）に聴感を近づける。
 * AudioBufferSourceNode.playbackRate だけだとピッチも上がり「高音で聞き取りづらい」になる。
 */

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
  const window = hannWindow(frameSize);
  const searchRadius = Math.max(0, Math.floor(synthesisHop / 2));

  // 最初のフレーム
  for (let i = 0; i < frameSize && i < input.length && i < outputLength; i++) {
    output[i] += input[i] * window[i];
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
      }
    }

    outputPos += synthesisHop;
    inputCenter += analysisHop;
  }

  // 窓加算の正規化（簡易：ピークが暴れないよう軽くクリップ）
  let peak = 0;
  for (let i = 0; i < output.length; i++) {
    const a = Math.abs(output[i]);
    if (a > peak) peak = a;
  }
  if (peak > 1) {
    const inv = 1 / peak;
    for (let i = 0; i < output.length; i++) {
      output[i] *= inv;
    }
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

  const frameSize = Math.min(
    2048,
    Math.max(512, Math.floor(buffer.sampleRate * 0.03)), // ~30ms
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
 * speed 倍に時間圧縮したバッファを返す（音程維持）。
 * speed<=1 のときは切り出しのみ（または速度 1 扱い）。
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
  if (tempo <= 1.001) {
    return sliced;
  }
  return timeStretchAudioBufferPreservePitch(audioContext, sliced, tempo);
}
