/**
 * @file previewUiTime.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description プレビュー再生中の UI 時刻更新を間引く純ロジック。
 *
 * 再生ループは rAF（多くは約 60Hz）で currentTimeRef を進める。
 * 同じ頻度で Zustand の currentTime を更新すると、シークバー・波形・
 * キャプション一覧まで毎フレーム再描画され、わずかなカクつきになる。
 *
 * 再生時計・video.currentTime・Canvas 描画は間引かない。
 */

export const PREVIEW_UI_TIME_PUBLISH_INTERVAL_MS = 50;
export const PREVIEW_UI_TIME_JUMP_SEC = 0.2;

export function shouldPublishPreviewUiTime(input: {
  nowMs: number;
  lastPublishAtMs: number | null;
  timeSec: number;
  lastPublishedTimeSec: number | null;
  force?: boolean;
  intervalMs?: number;
  jumpSec?: number;
}): boolean {
  if (input.force) return true;
  if (input.lastPublishAtMs == null || input.lastPublishedTimeSec == null) return true;
  if (!Number.isFinite(input.nowMs) || !Number.isFinite(input.timeSec)) return true;

  const jumpSec = input.jumpSec ?? PREVIEW_UI_TIME_JUMP_SEC;
  if (Math.abs(input.timeSec - input.lastPublishedTimeSec) >= jumpSec) {
    return true;
  }

  const intervalMs = input.intervalMs ?? PREVIEW_UI_TIME_PUBLISH_INTERVAL_MS;
  return input.nowMs - input.lastPublishAtMs >= intervalMs;
}
