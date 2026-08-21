/**
 * @file videoAudioLoudness.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 動画カード間の音量揃え（ノーマライズ）の純ロジック。
 *
 * デコード済みモノラル PCM の RMS を、平均または最大音量へ揃えるゲインを求める。
 * AudioBuffer / DOM には依存せずテスト可能にする。
 */

/** 音量揃えの目標。mean=幾何平均、loudest=一番大きい音 */
export type VideoAudioNormalizeMode = 'mean' | 'loudest';

export const DEFAULT_VIDEO_AUDIO_NORMALIZE_MODE: VideoAudioNormalizeMode = 'mean';

export function normalizeVideoAudioNormalizeMode(value: unknown): VideoAudioNormalizeMode {
  return value === 'loudest' ? 'loudest' : DEFAULT_VIDEO_AUDIO_NORMALIZE_MODE;
}

/** 無音とみなして揃え対象外にする RMS 下限 */
export const MIN_MEASURABLE_RMS = 0.001;

/** 揃えゲインの上限（約 +12 dB） */
export const MAX_NORMALIZE_GAIN = 4;

/** 揃えゲインの下限（約 −12 dB）。平均合わせでの下げすぎ防止 */
export const MIN_NORMALIZE_GAIN = 0.25;

/** 表示上「変更なし」とみなす dB 差 */
export const NORMALIZE_DB_EPSILON = 0.15;

export interface LoudnessSample {
  id: string;
  rms: number;
  participating?: boolean;
}

/**
 * サンプル列の RMS。start/end はサンプルインデックス。
 */
export function computeRms(
  samples: ArrayLike<number>,
  start = 0,
  end = samples.length,
): number {
  const from = Math.max(0, Math.floor(start));
  const to = Math.min(samples.length, Math.floor(end));
  const n = to - from;
  if (n <= 0) return 0;
  let sum = 0;
  for (let i = from; i < to; i++) {
    const v = samples[i];
    sum += v * v;
  }
  return Math.sqrt(sum / n);
}

/**
 * 秒範囲をサンプル範囲へ写像して RMS を測る。
 * 範囲が空・不正なら全体の RMS。
 */
export function computeRmsForTimeRange(
  samples: ArrayLike<number>,
  sampleRate: number,
  startSec?: number,
  endSec?: number,
): number {
  if (!(sampleRate > 0) || samples.length === 0) return 0;
  const duration = samples.length / sampleRate;
  const start = Number.isFinite(startSec) ? Math.max(0, startSec as number) : 0;
  let end = Number.isFinite(endSec) ? (endSec as number) : duration;
  if (!(end > start)) end = duration;
  return computeRms(samples, start * sampleRate, end * sampleRate);
}

export function clampNormalizeGain(gain: number): number {
  if (!Number.isFinite(gain) || gain <= 0) return 1;
  return Math.min(MAX_NORMALIZE_GAIN, Math.max(MIN_NORMALIZE_GAIN, gain));
}

export function gainToDb(gain: number): number {
  if (!(gain > 0) || !Number.isFinite(gain)) return 0;
  return 20 * Math.log10(gain);
}

/**
 * 揃えゲインの表示。ほぼ等倍は「変更なし」。
 */
export function formatNormalizeAdjustment(gain: number): string {
  const db = gainToDb(gain);
  if (!Number.isFinite(db) || Math.abs(db) < NORMALIZE_DB_EPSILON) return '変更なし';
  const rounded = Math.round(db * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)} dB`;
}

/**
 * 参加クリップの RMS を指定モードの目標へ揃えるゲインを返す。
 * - mean: 幾何平均（小さい音は上げ、大きい音は下げる）
 * - loudest: 一番大きい音（小さい音だけ上げ、大きい音はそのまま）
 * - 計測可能な参加クリップが 2 本未満ならすべて 1（比較できない）
 * - 無音クリップはゲイン 1 のまま対象外
 * - 非参加はゲイン 1
 */
export function computeEqualizeGains(
  samples: readonly LoudnessSample[],
  mode: VideoAudioNormalizeMode = DEFAULT_VIDEO_AUDIO_NORMALIZE_MODE,
): Record<string, number> {
  const gains: Record<string, number> = {};
  const participating = samples.filter((sample) => sample.participating !== false);
  const measured = participating.filter((sample) => sample.rms >= MIN_MEASURABLE_RMS);

  for (const sample of samples) {
    gains[sample.id] = 1;
  }

  if (measured.length < 2) {
    return gains;
  }

  const resolvedMode = normalizeVideoAudioNormalizeMode(mode);
  let target = 0;
  if (resolvedMode === 'loudest') {
    target = measured.reduce((max, sample) => Math.max(max, sample.rms), 0);
  } else {
    const logSum = measured.reduce((sum, sample) => sum + Math.log(sample.rms), 0);
    target = Math.exp(logSum / measured.length);
  }
  if (!(target > 0) || !Number.isFinite(target)) {
    return gains;
  }

  for (const sample of participating) {
    if (sample.rms < MIN_MEASURABLE_RMS) {
      gains[sample.id] = 1;
      continue;
    }
    gains[sample.id] = clampNormalizeGain(target / sample.rms);
  }
  return gains;
}
