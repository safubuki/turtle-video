/**
 * @file transitionTimeline.ts
 * @author Turtle Village
 * @description ディゾルブ（重ねる）トランジションを考慮したタイムライン計算の単一ソース。
 *
 * ディゾルブ（type: 'dissolve'）は前のクリップが流れ続けたまま、次のクリップが
 * オーバーラップして早く始まる。そのぶん**総再生時間は短くなる**。
 * フェード(黒/白) はオーバーラップしない（タイムライン長は不変）。
 *
 * standard フレーバー（Android/PC）のプレビュー/シーク/エクスポートと、
 * mediaStore の totalDuration がこのモジュールを参照する。
 * トランジション未使用時（overlap=0）の計算結果は従来の逐次加算と完全一致する。
 */
import type { MediaItem } from '../types';

const EPSILON = 0.001;
/** オーバーラップがクリップを食い潰さないよう残す最低秒数 */
const MIN_CLIP_REMAINDER_SEC = 0.15;

function normalizeDuration(duration: number): number {
  if (!Number.isFinite(duration)) return 0;
  return Math.max(0, duration);
}

/**
 * このクリップ→次のクリップのオーバーラップ秒数を返す（ディゾルブのみ >0）。
 * 双方のクリップ長を超えないよう安全にクランプする。
 */
export function getClipOverlapToNext(item: MediaItem, next: MediaItem | undefined): number {
  if (!next) return 0;
  const transition = item.transitionToNext;
  if (!transition || transition.type !== 'dissolve') return 0;
  const requested = Math.max(0, transition.duration);
  const itemDuration = normalizeDuration(item.duration);
  const nextDuration = normalizeDuration(next.duration);
  return Math.max(
    0,
    Math.min(
      requested,
      Math.max(0, itemDuration - MIN_CLIP_REMAINDER_SEC),
      Math.max(0, nextDuration - MIN_CLIP_REMAINDER_SEC),
    ),
  );
}

/** タイムライン上でクリップ i から次のクリップ開始までの前進量（duration - overlap） */
export function getTimelineAdvanceForItem(items: MediaItem[], index: number): number {
  const item = items[index];
  if (!item) return 0;
  const duration = normalizeDuration(item.duration);
  return duration - getClipOverlapToNext(item, items[index + 1]);
}

export interface TransitionTimelineRange {
  id: string;
  index: number;
  start: number;
  end: number;
}

/** 各クリップのタイムライン区間（オーバーラップ考慮）を配列順で返す */
export function computeTransitionTimelineRanges(items: MediaItem[]): TransitionTimelineRange[] {
  const ranges: TransitionTimelineRange[] = [];
  let cursor = 0;
  items.forEach((item, index) => {
    const start = cursor;
    const end = start + normalizeDuration(item.duration);
    ranges.push({ id: item.id, index, start, end });
    cursor = start + getTimelineAdvanceForItem(items, index);
  });
  return ranges;
}

/** 総再生時間（オーバーラップぶん短くなる）。トランジション未使用時は従来の合計と一致 */
export function calculateTotalDurationWithTransitions(items: MediaItem[]): number {
  const ranges = computeTransitionTimelineRanges(items);
  return ranges.length > 0 ? ranges[ranges.length - 1].end : 0;
}

export interface ActiveTimelineItemWithTransitions {
  id: string;
  index: number;
  localTime: number;
}

/**
 * 指定時刻のアクティブクリップを返す（オーバーラップ窓では**後のクリップ**を優先）。
 * duration 未確定（=0）の先頭動画・終端フォールバックの扱いは
 * playbackTimeline.findActiveTimelineItem と同じ規約に揃える。
 */
export function findActiveTimelineItemWithTransitions(
  items: MediaItem[],
  time: number,
  totalDuration: number,
  precomputedRanges?: TransitionTimelineRange[],
): ActiveTimelineItemWithTransitions | null {
  const ranges = precomputedRanges ?? computeTransitionTimelineRanges(items);
  let match: ActiveTimelineItemWithTransitions | null = null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const range = ranges[i];
    const itemDuration = normalizeDuration(item.duration);

    if (itemDuration <= 0) {
      // metadata 未確定（duration=0）の動画はここで確定させる（先勝ち）。
      // 後勝ちのオーバーラップ規約より優先し、後続クリップに上書きさせない
      // （playbackTimeline.findActiveTimelineItem と同じ規約）。
      if (item.type === 'video' && Math.abs(time - range.start) < EPSILON) {
        return match ?? { id: item.id, index: i, localTime: 0 };
      }
      continue;
    }

    if (time >= range.start && time < range.end) {
      // 後勝ち: オーバーラップ窓では次のクリップをアクティブにする
      match = { id: item.id, index: i, localTime: time - range.start };
    }
  }

  if (match) return match;

  if (items.length > 0 && time >= totalDuration) {
    const lastIndex = items.length - 1;
    const lastItem = items[lastIndex];
    const lastDuration = normalizeDuration(lastItem.duration);
    return {
      id: lastItem.id,
      index: lastIndex,
      localTime: lastDuration > 0 ? Math.max(0, lastDuration - EPSILON) : 0,
    };
  }

  return null;
}
