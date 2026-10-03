/**
 * @file titleOpeningFrame.ts
 * @description タイトル設定のミニビューが使う「先頭付近で映像があるフレーム」の時刻解決。
 *
 * プレビューの再生位置とは独立させる。先頭の強制黒クリア帯は外し、
 * そこが黒なら少し後ろの候補へ進む。全部黒なら先頭候補を使う。
 */
import type { MediaItem } from '../types';
import { resolveAutoProjectPosterCaptureTime } from './media';
import { resolveVideoSourceTime } from './playbackSpeed';
import {
  computeTransitionTimelineRanges,
  findActiveTimelineItemWithTransitions,
} from './transitionTimeline';

/** 先頭候補が黒だったときに、そこから足す秒数。先頭そのものを先に試す */
export const TITLE_OPENING_FRAME_FALLBACK_OFFSETS_SEC = [0, 0.1, 0.2, 0.5, 1] as const;

/**
 * タイトルミニビューが順に試すタイムライン時刻。
 * 最初は自動ポスターと同じ「先頭の黒クリア帯の外」。その後ろは映像探し用。
 */
export function resolveTitleMiniPreviewFrameTimes(totalDuration: number): number[] {
  const duration = Number.isFinite(totalDuration) ? Math.max(0, totalDuration) : 0;
  if (duration <= 0) return [];

  const first = resolveAutoProjectPosterCaptureTime(duration);
  const upper = Math.max(0, duration - 0.001);
  const times: number[] = [];
  for (const offset of TITLE_OPENING_FRAME_FALLBACK_OFFSETS_SEC) {
    const time = Math.min(first + offset, upper);
    const rounded = Math.round(time * 1000) / 1000;
    if (!times.includes(rounded)) times.push(rounded);
  }
  return times;
}

/** 指定時刻を覆うクリップと、その元メディア時刻 */
export function resolveTitleMiniPreviewCaptureTarget(
  items: readonly MediaItem[],
  totalDuration: number,
  timelineTime: number,
): { clipId: string; type: MediaItem['type']; sourceTime: number } | null {
  if (items.length === 0) return null;
  const duration = Number.isFinite(totalDuration) ? Math.max(0, totalDuration) : 0;
  const list = items as MediaItem[];
  const ranges = computeTransitionTimelineRanges(list);
  const active = findActiveTimelineItemWithTransitions(list, timelineTime, duration, ranges);
  const item = (active ? list.find((candidate) => candidate.id === active.id) : null) ?? list[0];
  if (!item) return null;
  const sourceTime = item.type === 'image'
    ? 0
    : resolveVideoSourceTime({
      trimStart: item.trimStart,
      localTime: active?.localTime ?? 0,
      playbackSpeed: item.playbackSpeed,
    });
  return { clipId: item.id, type: item.type, sourceTime };
}

/**
 * 候補のうち、最初に映像がある時刻を選ぶ。
 * すべて黒なら先頭候補を返し、再生位置のフレームへは落とさない。
 */
export function selectTitleOpeningFrameTime(
  times: readonly number[],
  isBlankAt: (time: number) => boolean,
): number | null {
  if (times.length === 0) return null;
  for (const time of times) {
    if (!isBlankAt(time)) return time;
  }
  return times[0];
}
