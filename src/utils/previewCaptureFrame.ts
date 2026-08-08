/**
 * @file previewCaptureFrame.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description プレビューの「画像キャプチャ」で、シークバーの現在位置と保存画像を
 * ズレなく一致させるための純ロジック。
 *
 * ## 背景（1 フレームズレの原因）
 *
 * プレビューの通常再生は video 要素を native 再生させたまま毎 rAF で `drawImage` する。
 * canvas に載るフレームは「その瞬間デコーダが持っていたフレーム」であって、
 * タイムライン時刻から逆算した厳密なフレームではない。
 *
 * さらに終端では次の 2 つが重なる:
 *
 * 1. `finalizePreviewAtTimelineEnd` がシークバー表示（`currentTime`）を**総尺そのもの**へ
 *    スナップする（例: 9.54 秒）。
 * 2. 一方で描画に渡す時刻は `totalDuration - ε` にクランプされる（`toDisplayTime`）。
 *    しかも終端判定は `totalDuration - PREVIEW_END_THRESHOLD_SEC`（30ms）で先に発火するため、
 *    video のデコード位置は最終フレームより手前で止まっていることがある。
 *
 * 結果として「シークバーは終端なのに、保存された画像は 1 フレーム前」になる。
 *
 * ここではキャプチャ時に **描画すべき時刻**と**その時刻に対応する video のソース時刻**を
 * 明示的に解決し、呼び出し側が強制シーク → デコード完了待ち → 再描画してから
 * canvas を読み取れるようにする。
 */
import type { MediaItem } from '../types';
import {
  findActiveTimelineItemWithTransitions,
} from './transitionTimeline';
import {
  resolveVideoSafeEndSourceTime,
  resolveVideoSourceTime,
} from './playbackSpeed';

/**
 * プレビューエンジンが描画時刻に使う終端クランプ量。
 * standard フレーバーの `DISPLAY_TIME_CLAMP_EPSILON_SEC` と揃える。
 */
export const CAPTURE_DISPLAY_CLAMP_EPSILON_SEC = 0.001;

export interface CaptureFrameTarget {
  /** 再描画に使うタイムライン時刻（終端は総尺 - ε へクランプ済み） */
  renderTime: number;
  /** 対象クリップの id（動画でなければ null） */
  videoId: string | null;
  /** その時刻に対応する元動画上のソース時刻（動画でなければ null） */
  videoSourceTime: number | null;
  /** タイムライン終端でのキャプチャか（診断・ログ用） */
  isTimelineEnd: boolean;
}

/**
 * キャプチャで保存すべき「プレビューの現在位置」を解決する。
 *
 * シークバーが総尺そのものを指している（終端スナップ後）場合でも、
 * 描画可能な最大時刻（総尺 - ε）へ丸めて返す。これによりキャプチャ時の再描画が
 * プレビューの最終フレームと同じ時刻を描く。
 */
export function resolveCaptureRenderTime(
  currentTime: number,
  totalDuration: number,
  epsilonSec: number = CAPTURE_DISPLAY_CLAMP_EPSILON_SEC,
): number {
  if (!Number.isFinite(currentTime)) return 0;
  if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
    return Math.max(0, currentTime);
  }
  const maxRenderable = Math.max(0, totalDuration - epsilonSec);
  return Math.max(0, Math.min(currentTime, maxRenderable));
}

/**
 * キャプチャ対象のフレーム（描画時刻 + 動画のソース時刻）を解決する。
 *
 * 終端では最後のクリップの「安全な終端ソース時刻」を使い、
 * デコーダが最終フレームを確実に保持できる位置へ合わせる。
 *
 * @param mediaItems - タイムライン上のクリップ
 * @param currentTime - プレビューの現在位置（シークバー基準・終端スナップ済みの値も可）
 * @param totalDuration - タイムライン総尺
 */
export function resolveCaptureFrameTarget(
  mediaItems: MediaItem[],
  currentTime: number,
  totalDuration: number,
): CaptureFrameTarget {
  const renderTime = resolveCaptureRenderTime(currentTime, totalDuration);
  const isTimelineEnd =
    totalDuration > 0 && currentTime >= totalDuration - CAPTURE_DISPLAY_CLAMP_EPSILON_SEC;

  if (mediaItems.length === 0) {
    return { renderTime, videoId: null, videoSourceTime: null, isTimelineEnd };
  }

  const active = findActiveTimelineItemWithTransitions(mediaItems, renderTime, totalDuration);

  // 終端など active が解決できない場合は最後のクリップへフォールバックする
  // （プレビューの renderFrame と同じ END_FALLBACK の考え方）。
  const index = active ? active.index : mediaItems.length - 1;
  const item = mediaItems[index];
  if (!item || item.type !== 'video') {
    return { renderTime, videoId: null, videoSourceTime: null, isTimelineEnd };
  }

  // 終端（または active 解決不可のフォールバック）は安全な終端ソース時刻を使う。
  // 途中位置は localTime からソース時刻を逆算する。
  const useEndSourceTime = !active || isTimelineEnd;
  const videoSourceTime = useEndSourceTime
    ? resolveVideoSafeEndSourceTime({
        trimStart: item.trimStart,
        trimEnd: item.trimEnd,
        timelineDuration: item.duration,
        playbackSpeed: item.playbackSpeed,
      })
    : resolveVideoSourceTime({
        trimStart: item.trimStart,
        localTime: active.localTime,
        playbackSpeed: item.playbackSpeed,
      });

  return {
    renderTime,
    videoId: item.id,
    videoSourceTime,
    isTimelineEnd,
  };
}
