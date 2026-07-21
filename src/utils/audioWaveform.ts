/**
 * @file audioWaveform.ts
 * @author Turtle Village
 * @description ナレーション音声の「静的な音量波形」表示と「無音区間（文の区切り）自動検出」の純ロジック。
 *
 * ここは再生・デコード・DOM に依存しない純関数だけを置く（テスト容易性のため）。
 * デコード済み PCM（Float32Array のモノラル channel data と sampleRate）を入力に取り、
 * - 描画用のピーク配列（バケット単位の振幅）
 * - 分割候補となる無音区間の中心時刻（秒）
 * を返す。呼び出し側（useNarrationWaveform）が AudioBuffer からモノラル PCM を作ってここへ渡す。
 */

/** 波形描画に必要な最小限の PCM 情報（AudioBuffer 非依存でテスト可能にするための型） */
export interface MonoPcm {
  /** モノラルにミックスダウン済みのサンプル列（-1.0〜1.0 目安） */
  samples: Float32Array | number[];
  /** サンプリングレート（Hz） */
  sampleRate: number;
}

/**
 * 波形描画用に、サンプル列を `bucketCount` 個のバケットへ集約し、各バケットの
 * 最大絶対振幅（0〜1 目安）を返す。全体の最大値で正規化はしない（静的表示なので
 * 元音量の相対差をそのまま見せる）。
 *
 * @param pcm - モノラル PCM
 * @param bucketCount - 出力する棒の本数（描画幅に応じて呼び出し側が決める。1 以上）
 * @returns 長さ `bucketCount` の Float32Array（各要素は該当区間のピーク絶対値）
 */
export function computeWaveformPeaks(pcm: MonoPcm, bucketCount: number): Float32Array {
  const count = Math.max(1, Math.floor(bucketCount));
  const peaks = new Float32Array(count);
  const { samples } = pcm;
  const total = samples.length;
  if (total === 0) return peaks;

  const samplesPerBucket = total / count;
  for (let b = 0; b < count; b++) {
    const start = Math.floor(b * samplesPerBucket);
    const end = Math.min(total, Math.floor((b + 1) * samplesPerBucket));
    let peak = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i]);
      if (v > peak) peak = v;
    }
    peaks[b] = peak;
  }
  return peaks;
}

export interface SilenceDetectionOptions {
  /**
   * RMS を測る窓幅（秒）。文の区切りの「間」は概ね 0.15〜0.5 秒程度なので既定 0.05 秒。
   * 小さすぎると 1 サンプルの谷を拾い、大きすぎると区切りが潰れる。
   */
  windowSec?: number;
  /**
   * 無音とみなす RMS のしきい値。`'auto'` のときは全体の平均 RMS からの相対値で決める。
   * 数値を渡すと固定しきい値（0〜1）になる。
   */
  threshold?: number | 'auto';
  /**
   * `threshold: 'auto'` のとき、平均 RMS に掛ける係数。これを下回る窓を無音候補とする。
   * 小さいほど「はっきり静かな箇所」だけを拾う。既定 0.35。
   */
  autoRatio?: number;
  /**
   * 候補として採用する無音区間の最小継続時間（秒）。これ未満の一瞬の谷は無視する。既定 0.12 秒。
   */
  minSilenceSec?: number;
  /**
   * 検出候補の最大数（多すぎると UI が破綻するため上限を設ける）。既定 24。
   * 上限を超える場合は「区間が長い（＝はっきりした間）」順に残す。
   */
  maxCandidates?: number;
  /**
   * 音声の端（先頭・末尾）からこの秒数以内にある谷は候補にしない。既定 0.15 秒。
   * 端の無音はトリム分割点として意味が薄いため。
   */
  edgeMarginSec?: number;
}

export interface SilenceSplitPoint {
  /** 分割候補の時刻（無音区間の中心・秒） */
  time: number;
  /** 無音区間の開始時刻（秒） */
  start: number;
  /** 無音区間の終了時刻（秒） */
  end: number;
  /** 無音区間の長さ（秒）。長いほど「はっきりした間」 */
  duration: number;
}

/**
 * RMS が周囲より明らかに落ち込む区間（＝文の区切りの「間」）を検出し、
 * 分割候補時刻の配列を返す。時刻昇順。
 *
 * アルゴリズム:
 * 1. `windowSec` 単位の非重複窓ごとに RMS を計算する。
 * 2. しきい値（auto: 平均 RMS × autoRatio、または固定値）未満の連続窓を無音区間とみなす。
 * 3. 継続が `minSilenceSec` 以上で、かつ端マージン内でない区間を候補化する。
 * 4. 候補が多すぎる場合は無音区間が長い順に `maxCandidates` 個へ絞り、時刻昇順で返す。
 *
 * @param pcm - モノラル PCM
 * @param options - 検出パラメータ
 * @returns 分割候補（時刻昇順）
 */
export function detectSilenceSplitPoints(
  pcm: MonoPcm,
  options: SilenceDetectionOptions = {},
): SilenceSplitPoint[] {
  const {
    windowSec = 0.05,
    threshold = 'auto',
    autoRatio = 0.35,
    minSilenceSec = 0.12,
    maxCandidates = 24,
    edgeMarginSec = 0.15,
  } = options;

  const { samples, sampleRate } = pcm;
  const total = samples.length;
  if (total === 0 || sampleRate <= 0) return [];

  const windowSamples = Math.max(1, Math.round(windowSec * sampleRate));
  const windowCount = Math.floor(total / windowSamples);
  if (windowCount < 3) return [];

  // 各窓の RMS を計算
  const rms = new Float32Array(windowCount);
  let sumRms = 0;
  for (let w = 0; w < windowCount; w++) {
    const start = w * windowSamples;
    const end = start + windowSamples;
    let sumSq = 0;
    for (let i = start; i < end; i++) {
      const v = samples[i];
      sumSq += v * v;
    }
    const value = Math.sqrt(sumSq / windowSamples);
    rms[w] = value;
    sumRms += value;
  }

  const meanRms = sumRms / windowCount;
  const silenceThreshold =
    threshold === 'auto' ? meanRms * autoRatio : Math.max(0, threshold);

  // meanRms が 0（完全無音ファイル）なら分割の意味がない
  if (!(meanRms > 0)) return [];

  const totalDurationSec = total / sampleRate;
  const windowDurationSec = windowSamples / sampleRate;

  // しきい値未満の連続窓を無音ランとしてまとめる
  const runs: SilenceSplitPoint[] = [];
  let runStartWindow = -1;
  const flushRun = (endWindowExclusive: number) => {
    if (runStartWindow < 0) return;
    const startSec = runStartWindow * windowDurationSec;
    const endSec = endWindowExclusive * windowDurationSec;
    const duration = endSec - startSec;
    const centerSec = (startSec + endSec) / 2;
    const withinEdge =
      centerSec < edgeMarginSec || centerSec > totalDurationSec - edgeMarginSec;
    if (duration >= minSilenceSec && !withinEdge) {
      runs.push({ time: centerSec, start: startSec, end: endSec, duration });
    }
    runStartWindow = -1;
  };

  for (let w = 0; w < windowCount; w++) {
    if (rms[w] < silenceThreshold) {
      if (runStartWindow < 0) runStartWindow = w;
    } else {
      flushRun(w);
    }
  }
  flushRun(windowCount);

  if (runs.length <= maxCandidates) {
    return runs.sort((a, b) => a.time - b.time);
  }

  // 多すぎる場合は「はっきりした間（長い無音）」を優先して残し、時刻昇順で返す
  return runs
    .slice()
    .sort((a, b) => b.duration - a.duration)
    .slice(0, maxCandidates)
    .sort((a, b) => a.time - b.time);
}

/**
 * AudioBuffer 相当（複数チャンネル）をモノラル PCM へミックスダウンする。
 * 描画・検出はモノラルで十分なため、全チャンネルの平均を取る。
 *
 * @param channels - 各チャンネルのサンプル列
 * @param sampleRate - サンプリングレート
 * @returns モノラル PCM
 */
export function mixToMono(
  channels: Array<Float32Array | number[]>,
  sampleRate: number,
): MonoPcm {
  if (channels.length === 0) {
    return { samples: new Float32Array(0), sampleRate };
  }
  if (channels.length === 1) {
    return { samples: channels[0], sampleRate };
  }
  const length = channels[0].length;
  const mono = new Float32Array(length);
  const chCount = channels.length;
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let c = 0; c < chCount; c++) {
      sum += channels[c][i] ?? 0;
    }
    mono[i] = sum / chCount;
  }
  return { samples: mono, sampleRate };
}
