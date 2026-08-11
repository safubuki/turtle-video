import { FPS } from '../constants';
import type { MediaItem } from '../types';

export const MAX_EXPORT_FRAME_RATE = 30;

const COMMON_FRAME_RATES = [
  24_000 / 1_001,
  24,
  25,
  30_000 / 1_001,
  30,
] as const;

/**
 * コンテナから取得した代表 FPS を WebCodecs に渡せる範囲へ正規化する。
 * 23.976 / 29.97 は整数へ丸めず、長尺での周期的なフレームずれを防ぐ。
 */
export function normalizeSourceFrameRate(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return null;
  if (value >= MAX_EXPORT_FRAME_RATE) return MAX_EXPORT_FRAME_RATE;

  const nearestCommon = COMMON_FRAME_RATES.reduce((nearest, candidate) => (
    Math.abs(candidate - value) < Math.abs(nearest - value) ? candidate : nearest
  ));
  if (Math.abs(nearestCommon - value) <= 0.02) return nearestCommon;

  return Math.round(value * 1_000) / 1_000;
}

/**
 * standard の CFR 出力 FPS を決める。
 * 複数動画では最も高い実効 FPS（元 FPS × 再生速度）へ合わせ、上限は 30fps。
 * 検出不能または静止画のみのプロジェクトは従来互換の 30fps を維持する。
 */
export function resolveCompositeExportFrameRate(mediaItems: MediaItem[]): number {
  let selectedFrameRate: number | null = null;

  for (const item of mediaItems) {
    if (item.type !== 'video') continue;
    const sourceFrameRate = normalizeSourceFrameRate(item.sourceFrameRate);
    if (sourceFrameRate === null) continue;
    const playbackSpeed = typeof item.playbackSpeed === 'number' && Number.isFinite(item.playbackSpeed)
      ? Math.max(1, item.playbackSpeed)
      : 1;
    const effectiveFrameRate = Math.min(MAX_EXPORT_FRAME_RATE, sourceFrameRate * playbackSpeed);
    selectedFrameRate = selectedFrameRate === null
      ? effectiveFrameRate
      : Math.max(selectedFrameRate, effectiveFrameRate);
  }

  return selectedFrameRate ?? FPS;
}
