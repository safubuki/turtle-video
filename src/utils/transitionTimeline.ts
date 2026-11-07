/**
 * @file transitionTimeline.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description ディゾルブ（重ねる）トランジションを考慮したタイムライン計算の単一ソース。
 *
 * ディゾルブ（type: 'dissolve'）は前のクリップが流れ続けたまま、次のクリップが
 * オーバーラップして早く始まる。そのぶん**総再生時間は短くなる**。
 * フェード(黒/白) はオーバーラップしない（タイムライン長は不変）。
 *
 * standard フレーバー（Android/PC）のプレビュー/シーク/エクスポートと、
 * mediaStore の totalDuration がこのモジュールを参照する。
 * トランジション未使用時（overlap=0）の計算結果は従来の逐次加算と完全一致する。
 *
 * 並べて比較（splitCompareToNext）のペアは同じ時刻に始まり、長いほうの終わりで次へ進む
 * （utils/splitCompare.ts）。ペアの前後の境界のディゾルブはカット扱い（重なり 0）。
 */
import type { MediaItem } from '../types';
import { resolveSplitCompareRoles, type SplitCompareRole } from './splitCompare';

/** タイムライン計算に必要な最小のカード情報（保存データからも計算できるようにする） */
export type TimelineItemLike = Pick<MediaItem, 'id' | 'type' | 'duration' | 'transitionToNext'>
  & Partial<Pick<MediaItem, 'splitCompareToNext'>>;

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
export function getClipOverlapToNext(
  item: TimelineItemLike,
  next: TimelineItemLike | undefined,
): number {
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

/**
 * 並び順の文脈を考慮した「クリップ index → 次のクリップ」の重なり秒数。
 * 並べて比較のペアに関わる境界（ペア内・ペアの前・ペアの後）は 0 を返す。
 * それ以外は getClipOverlapToNext と同じ。
 */
export function getTimelineOverlapToNext(
  items: ReadonlyArray<TimelineItemLike>,
  index: number,
  precomputedRoles?: SplitCompareRole[],
): number {
  const item = items[index];
  const next = items[index + 1];
  if (!item || !next) return 0;
  const roles = precomputedRoles ?? resolveSplitCompareRoles(items);
  if (roles[index] || roles[index + 1]) return 0;
  return getClipOverlapToNext(item, next);
}

/**
 * タイムライン上でクリップ i の開始から次のクリップ開始までの前進量。
 * 通常は duration - overlap。並べて比較の head は 0（partner が同時に始まる）、
 * partner は「ペアの長いほうの終わり − 開始」。
 * 最後のクリップは自身の終わり（ペアならペアの終わり）までの長さを返す。
 */
export function getTimelineAdvanceForItem(items: ReadonlyArray<TimelineItemLike>, index: number): number {
  const item = items[index];
  if (!item) return 0;
  const roles = resolveSplitCompareRoles(items);
  if (roles[index] === 'head') return 0;
  const duration = normalizeDuration(item.duration);
  if (roles[index] === 'partner') {
    const head = items[index - 1];
    return Math.max(duration, normalizeDuration(head?.duration ?? 0));
  }
  return duration - getTimelineOverlapToNext(items, index, roles);
}

export interface TransitionTimelineRange {
  id: string;
  index: number;
  start: number;
  end: number;
}

/**
 * 各クリップのタイムライン区間（オーバーラップ・並べて比較を考慮）を配列順で返す。
 * 並べて比較の partner は head と同じ start を持つ。
 */
export function computeTransitionTimelineRanges(
  items: ReadonlyArray<TimelineItemLike>,
): TransitionTimelineRange[] {
  const ranges: TransitionTimelineRange[] = [];
  const roles = resolveSplitCompareRoles(items);
  let cursor = 0;
  items.forEach((item, index) => {
    const duration = normalizeDuration(item.duration);
    if (roles[index] === 'partner' && ranges[index - 1]) {
      const headRange = ranges[index - 1];
      const start = headRange.start;
      const end = start + duration;
      ranges.push({ id: item.id, index, start, end });
      // ペアの長いほうの終わりで次へ進む（ペアの後のディゾルブはカット扱い）
      cursor = Math.max(headRange.end, end);
      return;
    }
    const start = cursor;
    const end = start + duration;
    ranges.push({ id: item.id, index, start, end });
    cursor = roles[index] === 'head'
      ? start
      : start + duration - getTimelineOverlapToNext(items, index, roles);
  });
  return ranges;
}

/** 総再生時間（オーバーラップぶん短くなる）。トランジション未使用時は従来の合計と一致 */
export function calculateTotalDurationWithTransitions(items: ReadonlyArray<TimelineItemLike>): number {
  const ranges = computeTransitionTimelineRanges(items);
  let total = 0;
  for (const range of ranges) {
    // 並べて比較で head のほうが長い場合、最後の区間より head の終わりが後になる
    total = Math.max(total, range.end);
  }
  return ranges.length > 0 ? total : 0;
}

/**
 * 指定時刻を区間内に含むクリップを返す（オーバーラップ窓では**後のクリップ**を優先）。
 * findActiveTimelineItemWithTransitions と違い、終端フォールバックと duration=0 の確定は行わない。
 * シーク処理が描画側（renderFrame）と同じクリップを「現在の動画」として扱うために使う。
 */
export function findTimelineItemInRangeWithTransitions(
  items: ReadonlyArray<TimelineItemLike>,
  time: number,
  precomputedRanges?: TransitionTimelineRange[],
): { index: number; start: number; localTime: number } | null {
  const ranges = precomputedRanges ?? computeTransitionTimelineRanges(items);
  let match: { index: number; start: number; localTime: number } | null = null;
  for (let i = 0; i < items.length; i++) {
    const range = ranges[i];
    if (range.end > range.start && time >= range.start && time < range.end) {
      match = { index: i, start: range.start, localTime: time - range.start };
    }
  }
  return match;
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
  items: ReadonlyArray<TimelineItemLike>,
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
