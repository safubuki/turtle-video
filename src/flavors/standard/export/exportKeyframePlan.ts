/**
 * @file exportKeyframePlan.ts (standard flavor)
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 書き出し映像のキーフレーム位置を、クリップの切り替え（カット）へ合わせる純ロジック。
 *
 * 従来は 1 秒ごと（frameIndex % FPS === 0）に機械的にキーフレームを入れていた。
 * カットがその 1 コマ後に来ると、
 * - 直前のキーフレームで予算を使い、
 * - 切り替わった新しい絵を差分フレーム（P）として大量のデータで符号化し、
 * - realtime のレート制御が帳尻を合わせるため直後のコマを極端に削る
 * ことになり、圧縮しやすい CG から高精細な実写へ切り替えた直後に 0.5〜0.8 秒のブロックノイズが出た。
 *
 * ここではカットの最初のコマをキーフレームにし、その前後の近すぎる定期キーフレームは省く
 * （カットのキーフレームが代わりを務める）。キーフレーム間隔の最大は FPS + 窓幅に収まる。
 * 書き出しの駆動方式・encode の呼び出し回数・queue / backpressure には一切関与しない。
 * 変えるのは各フレームに渡す `keyFrame` フラグだけ。
 */
import { getExportFrameTiming, type ResolvedExportDuration } from '../../../utils/exportTimeline';
import { computeTransitionTimelineRanges, type TimelineItemLike } from '../../../utils/transitionTimeline';

/**
 * カットのこのコマ数以内にある定期キーフレームは省く（0.33 秒 @30fps）。
 * キーフレーム間隔の最大は FPS + この値になる。
 */
export const EXPORT_KEYFRAME_CUT_WINDOW_FRAMES = 10;
/** これより間隔の詰まったカットにはキーフレームを重ねない（短いクリップの連続でキーフレームだらけにしない） */
export const EXPORT_KEYFRAME_MIN_CUT_GAP_FRAMES = 6;

/**
 * 各クリップが表示され始める最初のフレーム番号（先頭クリップを除く）を返す。
 * プレビュー／書き出しの描画と同じく、フレーム i はタイムライン時刻 `timestampUs / 1e6` で描かれ、
 * `time >= range.start` からそのクリップがアクティブになる（findActiveTimelineItemWithTransitions と同じ規約）。
 */
export function computeExportCutFrameIndices(
  items: ReadonlyArray<TimelineItemLike>,
  alignment: ResolvedExportDuration,
  fps: number,
): number[] {
  if (items.length < 2 || alignment.frameCount <= 0 || !(fps > 0)) {
    return [];
  }
  const ranges = computeTransitionTimelineRanges(items);
  const starts = ranges
    .slice(1)
    .map((range) => range.start)
    .filter((start) => Number.isFinite(start) && start > 0)
    .sort((a, b) => a - b);

  const cutFrames: number[] = [];
  let frameIndex = 0;
  for (const start of starts) {
    while (
      frameIndex < alignment.frameCount
      && getExportFrameTiming(alignment, fps, frameIndex).timestampUs / 1e6 < start
    ) {
      frameIndex += 1;
    }
    if (frameIndex >= alignment.frameCount) break;
    if (frameIndex > 0 && cutFrames[cutFrames.length - 1] !== frameIndex) {
      cutFrames.push(frameIndex);
    }
  }
  return cutFrames;
}

/**
 * フレーム番号 → キーフレームにするか、を返す判定を作る。
 *
 * 先頭から順に「直前のキーフレームから FPS コマ経ったら定期キーフレーム」を数え、
 * カットのコマでは必ずキーフレームにして数え直す（カット直後に定期分が重ならない）。
 * 定期分の直後 WINDOW コマ以内にカットがあれば、定期分を省いてカットへ譲る
 * （切り替えの 1 コマ前に予算を使わない）。どの配置でも間隔は FPS + WINDOW コマ以内。
 *
 * 結果は frameIndex だけで決まる（先頭から順に計算してキャッシュするため、呼び出し順に依存しない）。
 */
export function createExportKeyframeDecider(params: {
  fps: number;
  cutFrameIndices: ReadonlyArray<number>;
}): (frameIndex: number) => boolean {
  const interval = Math.max(1, Math.round(params.fps));
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

  const decided: boolean[] = [];
  let lastKeyFrame = 0;
  const decideUpTo = (target: number) => {
    for (let i = decided.length; i <= target; i++) {
      let isKey: boolean;
      if (i === 0 || keyCutSet.has(i)) {
        isKey = true;
      } else if (i - lastKeyFrame >= interval) {
        // 直後にカットが控えていれば、そのカットのキーフレームへ譲る
        isKey = !hasKeyCutWithin(i + 1, i + EXPORT_KEYFRAME_CUT_WINDOW_FRAMES);
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
