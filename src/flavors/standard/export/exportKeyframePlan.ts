/**
 * @file exportKeyframePlan.ts (standard flavor)
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 書き出し映像のキーフレーム位置を、クリップ切り替え・フェード・ディゾルブへ合わせる純ロジック。
 *
 * 従来は 1 秒ごと（frameIndex % FPS === 0）に機械的にキーフレームを入れていたため、
 * 1. カット直前にキーフレームが入ると、切り替わった新しい絵が差分フレーム（P）で大量消費し、
 *    realtime のレート制御が続くコマを極端に削る（13-330）
 * 2. 1 秒ごとの定期キーフレームがフェード開始（例: 9.00 秒 = frame 270）やディゾルブ途中に
 *    直撃し、I フレーム直後のレート制御引き締めと全画面の輝度変化が重なって強いブロックノイズが出る
 * という問題があった。
 *
 * 本モジュールでは、
 * - 定期キーフレーム間隔を 2 秒（FPS * 2）へ適正化し、不要な I フレーム連打によるレート乱れを減らす
 * - 真のカット切り替え（ハードカット・フェード黒/白の中央境界）の最初のコマをキーフレームにする
 *   （ディゾルブの開始コマは前クリップがほぼそのまま残るため強制キーフレームにしない）
 * - フェードイン／フェードアウト（クリップ単体・2画面比較ペア）・トランジション区間およびその直前は
 *   定期キーフレームを避けて先送りする（シーク性を守るため最大間隔 FPS * 4 は必ず守る）
 *
 * 書き出しの駆動方式・encode の呼び出し回数・queue / backpressure には一切関与しない。
 * 変えるのは各フレームに渡す `keyFrame` フラグだけ。
 */
import { DEFAULT_FADE_DURATION } from '../../../constants';
import type { MediaItem } from '../../../types';
import { getExportFrameTiming, type ResolvedExportDuration } from '../../../utils/exportTimeline';
import {
  resolveSplitComparePairFadeForIndex,
  resolveSplitCompareRoles,
} from '../../../utils/splitCompare';
import {
  computeTransitionTimelineRanges,
  getTimelineOverlapToNext,
  type TimelineItemLike,
} from '../../../utils/transitionTimeline';

/** キーフレーム計画で参照する最小のアイテム情報（フェード情報は任意で後方互換を保つ） */
export type ExportKeyframePlanItem = TimelineItemLike &
  Partial<Pick<MediaItem, 'fadeIn' | 'fadeOut' | 'fadeInDuration' | 'fadeOutDuration'>>;

/**
 * 定期キーフレームの基準間隔（秒）。
 * 1 秒ごとの I フレーム連打は VBV バッファ圧迫と QP スパイクを誘発するため、
 * 一般的な MP4 / ストリーミング標準の 2 秒（60 コマ @30fps）とする。
 */
export const EXPORT_KEYFRAME_INTERVAL_SECONDS = 2;
/**
 * フェード・ディゾルブ回避による先送りでも超えない最大キーフレーム間隔（秒）。
 * シーク性を保つための安全上限（120 コマ @30fps）。
 */
export const EXPORT_KEYFRAME_MAX_INTERVAL_SECONDS = 4;
/**
 * カットのこのコマ数以内にある定期キーフレームは省く（0.33 秒 @30fps）。
 * カット直前の余計なキーフレームを避け、カットのキーフレームへ譲る。
 */
export const EXPORT_KEYFRAME_CUT_WINDOW_FRAMES = 10;
/**
 * フェード・ディゾルブ開始の直前マージン（コマ数）。
 * フェード突入の直前に定期キーフレームが入ると、直後の QP 回復前にフェードが始まり
 * ブロックノイズが出やすくなるため、このコマ数ぶん手前から回避区間とする。
 */
export const EXPORT_KEYFRAME_AVOID_PRE_MARGIN_FRAMES = 10;
/** これより間隔の詰まったカットにはキーフレームを重ねない（短いクリップの連続でキーフレームだらけにしない） */
export const EXPORT_KEYFRAME_MIN_CUT_GAP_FRAMES = 6;

/** 定期キーフレームを避けるフレーム番号区間（両端含む） */
export interface ExportKeyframeAvoidRange {
  startFrame: number;
  endFrame: number;
}

function findFirstFrameAtOrAfterSec(
  alignment: ResolvedExportDuration,
  fps: number,
  sec: number,
  startFromFrame = 0,
): number {
  let frameIndex = Math.max(0, startFromFrame);
  while (
    frameIndex < alignment.frameCount
    && getExportFrameTiming(alignment, fps, frameIndex).timestampUs / 1e6 < sec
  ) {
    frameIndex += 1;
  }
  return frameIndex;
}

function findLastFrameBeforeSec(
  alignment: ResolvedExportDuration,
  fps: number,
  sec: number,
): number {
  const firstAfter = findFirstFrameAtOrAfterSec(alignment, fps, sec);
  return Math.min(alignment.frameCount - 1, Math.max(0, firstAfter - 1));
}

function mergeAvoidRanges(ranges: ExportKeyframeAvoidRange[]): ExportKeyframeAvoidRange[] {
  if (ranges.length <= 1) return ranges;
  const sorted = [...ranges].sort((a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame);
  const merged: ExportKeyframeAvoidRange[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr.startFrame <= prev.endFrame + 1) {
      prev.endFrame = Math.max(prev.endFrame, curr.endFrame);
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

/**
 * クリップの切り替わり（ハードカット・フェード黒/白境界）で最初に描かれるフレーム番号を返す。
 * ディゾルブの開始フレームは前クリップがほぼそのまま残るため、強制カットには含めない。
 * プレビュー／書き出しの描画と同じく、フレーム i はタイムライン時刻 `timestampUs / 1e6` で描かれ、
 * `time >= range.start` からそのクリップがアクティブになる（findActiveTimelineItemWithTransitions と同じ規約）。
 */
export function computeExportCutFrameIndices(
  items: ReadonlyArray<ExportKeyframePlanItem>,
  alignment: ResolvedExportDuration,
  fps: number,
): number[] {
  if (items.length < 2 || alignment.frameCount <= 0 || !(fps > 0)) {
    return [];
  }
  const roles = resolveSplitCompareRoles(items);
  const ranges = computeTransitionTimelineRanges(items);
  const starts: number[] = [];

  for (let i = 1; i < items.length; i++) {
    // 2画面比較の partner は head と同時開始のため境界ではない
    if (roles[i] === 'partner') continue;
    // ディゾルブは画面が連続的に混ざるため、重なり開始へ強制 I フレームを打たない
    if (getTimelineOverlapToNext(items, i - 1, roles) > 0) continue;
    const start = ranges[i]?.start;
    if (Number.isFinite(start) && start > 0) {
      starts.push(start);
    }
  }

  starts.sort((a, b) => a - b);

  const cutFrames: number[] = [];
  let frameIndex = 0;
  for (const start of starts) {
    frameIndex = findFirstFrameAtOrAfterSec(alignment, fps, start, frameIndex);
    if (frameIndex >= alignment.frameCount) break;
    if (frameIndex > 0 && cutFrames[cutFrames.length - 1] !== frameIndex) {
      cutFrames.push(frameIndex);
    }
  }
  return cutFrames;
}

/**
 * フェードイン／フェードアウト（クリップ単体・2画面比較ペア）・トランジション（ディゾルブ・フェード黒/白）の
 * タイムライン区間を、定期キーフレーム回避用のフレーム範囲（直前マージン込み）として返す。
 */
export function computeExportKeyframeAvoidRanges(
  items: ReadonlyArray<ExportKeyframePlanItem>,
  alignment: ResolvedExportDuration,
  fps: number,
): ExportKeyframeAvoidRange[] {
  if (items.length === 0 || alignment.frameCount <= 0 || !(fps > 0)) {
    return [];
  }

  const roles = resolveSplitCompareRoles(items);
  const ranges = computeTransitionTimelineRanges(items);
  const secIntervals: Array<{ start: number; end: number }> = [];

  const pushInterval = (start: number, end: number) => {
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    const s = Math.max(0, start);
    const e = Math.max(s, end);
    if (e - s > 1e-4) {
      secIntervals.push({ start: s, end: e });
    }
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const range = ranges[i];
    if (!range) continue;

    // 1. クリップ自身または 2 画面ペアのフェードイン／フェードアウト
    if (roles[i] === 'head') {
      const pair = resolveSplitComparePairFadeForIndex(items, i, roles);
      if (pair) {
        const pairStart = range.start;
        const pairEnd = pairStart + pair.fade.duration;
        if (pair.fade.fadeInDuration > 0) {
          pushInterval(pairStart, pairStart + pair.fade.fadeInDuration);
        }
        if (pair.fade.fadeOutDuration > 0) {
          pushInterval(pairEnd - pair.fade.fadeOutDuration, pairEnd);
        }
      }
    } else if (!roles[i]) {
      const duration = Math.max(0, range.end - range.start);
      let fadeInSec = item.fadeIn ? Math.max(0, item.fadeInDuration ?? DEFAULT_FADE_DURATION) : 0;
      let fadeOutSec = item.fadeOut ? Math.max(0, item.fadeOutDuration ?? DEFAULT_FADE_DURATION) : 0;
      if (fadeInSec + fadeOutSec > duration && duration > 0) {
        const ratio = duration / (fadeInSec + fadeOutSec);
        fadeInSec *= ratio;
        fadeOutSec *= ratio;
      }
      if (fadeInSec > 0) {
        pushInterval(range.start, range.start + fadeInSec);
      }
      if (fadeOutSec > 0) {
        pushInterval(range.end - fadeOutSec, range.end);
      }
    }

    // 2. 次クリップとのトランジション区間
    const nextRange = ranges[i + 1];
    const transition = item.transitionToNext;
    if (nextRange && transition) {
      if (transition.type === 'dissolve') {
        const overlap = getTimelineOverlapToNext(items, i, roles);
        if (overlap > 0) {
          pushInterval(nextRange.start, range.end);
        }
      } else if (transition.type === 'fade-black' || transition.type === 'fade-white') {
        // 2画面比較の partner は境界を持たない（ペア直後は head/partner の終端が nextRange.start）
        if (roles[i] !== 'head') {
          const half = Math.max(0.05, (Number.isFinite(transition.duration) ? transition.duration : 1) / 2);
          const boundary = nextRange.start;
          pushInterval(boundary - half, boundary + half);
        }
      }
    }
  }

  const frameRanges: ExportKeyframeAvoidRange[] = [];
  for (const interval of secIntervals) {
    const rawStartFrame = findFirstFrameAtOrAfterSec(alignment, fps, interval.start);
    const endFrame = findLastFrameBeforeSec(alignment, fps, interval.end);
    if (rawStartFrame >= alignment.frameCount || endFrame < rawStartFrame) continue;
    const startFrame = Math.max(1, rawStartFrame - EXPORT_KEYFRAME_AVOID_PRE_MARGIN_FRAMES);
    frameRanges.push({ startFrame, endFrame });
  }

  return mergeAvoidRanges(frameRanges);
}

/**
 * フレーム番号 → キーフレームにするか、を返す判定を作る。
 *
 * 先頭から順に「直前のキーフレームから定期間隔（既定 2 秒）経ったら定期キーフレーム」を数え、
 * - カットのコマでは必ずキーフレームにして数え直す（カット直後に定期分が重ならない）
 * - 定期分の直後 WINDOW コマ以内にカットがあれば、定期分を省いてカットへ譲る
 * - 定期分がフェード・ディゾルブ等の回避区間内なら先送りする
 * - ただしシーク性を守るため、最大間隔（既定 4 秒）に達したら必ずキーフレームを入れる
 *
 * 結果は frameIndex だけで決まる（先頭から順に計算してキャッシュするため、呼び出し順に依存しない）。
 */
export function createExportKeyframeDecider(params: {
  fps: number;
  cutFrameIndices: ReadonlyArray<number>;
  avoidRanges?: ReadonlyArray<ExportKeyframeAvoidRange>;
  /** 定期キーフレーム間隔（秒）。省略時は EXPORT_KEYFRAME_INTERVAL_SECONDS (2秒) */
  intervalSeconds?: number;
  /** 回避時の最大キーフレーム間隔（秒）。省略時は EXPORT_KEYFRAME_MAX_INTERVAL_SECONDS (4秒) */
  maxIntervalSeconds?: number;
}): (frameIndex: number) => boolean {
  const safeFps = Number.isFinite(params.fps) && params.fps > 0 ? params.fps : 30;
  const interval = Math.max(
    1,
    Math.round(safeFps * (params.intervalSeconds ?? EXPORT_KEYFRAME_INTERVAL_SECONDS)),
  );
  const maxInterval = Math.max(
    interval,
    Math.round(safeFps * (params.maxIntervalSeconds ?? EXPORT_KEYFRAME_MAX_INTERVAL_SECONDS)),
  );
  const sortedCuts = [...params.cutFrameIndices].sort((a, b) => a - b);

  // 間隔の詰まったカットは、直前に採用したカットキーフレームから離れているものだけを採用する
  const keyCuts: number[] = [];
  for (const cut of sortedCuts) {
    if (cut <= 0) continue;
    const previous = keyCuts[keyCuts.length - 1];
    if (previous === undefined || cut - previous >= EXPORT_KEYFRAME_MIN_CUT_GAP_FRAMES) {
      keyCuts.push(cut);
    }
  }
  const keyCutSet = new Set(keyCuts);
  const hasKeyCutWithin = (from: number, to: number): boolean =>
    keyCuts.some((cut) => cut >= from && cut <= to);

  const mergedAvoid = mergeAvoidRanges(
    (params.avoidRanges ?? []).filter(
      (r) => Number.isFinite(r.startFrame) && Number.isFinite(r.endFrame) && r.endFrame >= r.startFrame,
    ),
  );
  const isInAvoidRange = (frame: number): boolean =>
    mergedAvoid.some((r) => frame >= r.startFrame && frame <= r.endFrame);

  const decided: boolean[] = [];
  let lastKeyFrame = 0;
  const decideUpTo = (target: number) => {
    for (let i = decided.length; i <= target; i++) {
      let isKey: boolean;
      const elapsed = i - lastKeyFrame;
      if (i === 0 || keyCutSet.has(i)) {
        isKey = true;
      } else if (elapsed >= maxInterval) {
        // 回避による先送りでもシーク性の上限は必ず守る
        isKey = true;
      } else if (elapsed >= interval) {
        // 直後にカットが控えていればカットへ譲り、フェード・ディゾルブ区間なら先送りする
        isKey =
          !hasKeyCutWithin(i + 1, i + EXPORT_KEYFRAME_CUT_WINDOW_FRAMES)
          && !isInAvoidRange(i);
      } else {
        isKey = false;
      }
      if (isKey) lastKeyFrame = i;
      decided.push(isKey);
    }
  };

  return (frameIndex: number): boolean => {
    if (!Number.isInteger(frameIndex) || frameIndex < 0) return false;
    decideUpTo(frameIndex);
    return decided[frameIndex];
  };
}
