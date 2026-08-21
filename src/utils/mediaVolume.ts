/**
 * @file mediaVolume.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 動画クリップの実効再生音量（個別音量 × 音量揃えゲイン、ミュート、0〜250%）。
 *
 * preview / export / 波形はすべてこの関数を通す。個別スライダー値を直接 gain に載せない。
 */

export const MEDIA_VOLUME_MIN = 0;
export const MEDIA_VOLUME_MAX = 2.5;

export interface MediaVolumeSource {
  volume?: number;
  isMuted?: boolean;
  audioNormalizeGain?: number;
}

export function clampMediaVolume(volume: unknown): number {
  const n = typeof volume === 'number' ? volume : Number(volume);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MEDIA_VOLUME_MAX, Math.max(MEDIA_VOLUME_MIN, n));
}

export function normalizeMediaNormalizeGain(gain: unknown): number {
  const n = typeof gain === 'number' ? gain : Number(gain);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

/**
 * プレビュー・書き出しに渡す実効音量。
 * ミュート時は 0。音量揃えゲイン未設定は 1。上限 250%。
 */
export function resolveMediaPlaybackVolume(item: MediaVolumeSource | null | undefined): number {
  if (!item || item.isMuted) return 0;
  const volume = clampMediaVolume(item.volume ?? 1);
  const gain = normalizeMediaNormalizeGain(item.audioNormalizeGain);
  return clampMediaVolume(volume * gain);
}
