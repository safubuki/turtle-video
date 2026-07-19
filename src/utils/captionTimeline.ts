/**
 * @file captionTimeline.ts
 * @author Turtle Village
 * @description キャプションの時間判定と、複数行テキストの時分割（順次表示）計算。
 *
 * 1 つのキャプションカードのテキストが複数行（改行区切り）の場合、
 * カードの表示時間 [startTime, endTime) を行ごとの文字数比で自動配分し、
 * その時刻の行だけを 1 行ずつ順番に表示する（時分割表示）。
 * 「1 枚のカード = 1 つの説明」の意味を保ったまま、長文を分割表示できる。
 *
 * オプション（いずれも Caption の任意フィールド・standard 限定）:
 * - sequentialGapSec: 行と行の間に挟む無表示の間隔（秒）。配分前に間隔ぶんを確保する
 * - sequentialFadeMode: フェードの適用単位。'card'=カード全体（既定）/ 'line'=行ごと
 *
 * 配分は純ロジックのみで、描画はプレビュー/エクスポート共通の renderFrame が行う。
 */
import type { Caption } from '../types';

/** 行間隔があっても各行に最低限確保する表示秒数 */
const MIN_SEQUENTIAL_SEGMENT_SEC = 0.1;
/** 行間隔の上限（秒） */
export const SEQUENTIAL_GAP_MAX_SEC = 5;

type SequentialCaptionInput = Pick<Caption, 'text' | 'startTime' | 'endTime'> & {
  sequentialGapSec?: number;
};

export function isCaptionActiveAtTime(caption: Caption, timeSec: number): boolean {
  return timeSec >= caption.startTime && timeSec < caption.endTime;
}

/** 時分割表示の対象行へ分割する（空行は除去）。1 行以下なら時分割しない */
export function splitSequentialCaptionLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** このキャプションが時分割表示（複数行の順次表示）になるか */
export function isSequentialCaption(caption: Pick<Caption, 'text'>): boolean {
  return splitSequentialCaptionLines(caption.text).length >= 2;
}

export function clampSequentialGapSec(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(SEQUENTIAL_GAP_MAX_SEC, value));
}

export interface SequentialCaptionSegment {
  text: string;
  /** タイムライン絶対秒 */
  startTime: number;
  endTime: number;
}

/**
 * 複数行キャプションの各行の表示区間を文字数比で配分して返す。
 * - 各行の重みは max(1, 文字数)。短い行にも最低限の表示時間を与える
 * - sequentialGapSec 指定時は行間に無表示の間隔を挟む（収まらない場合は間隔を自動縮小）
 * - 丸め誤差で隙間ができないよう、境界は累積比率から算出する
 * - 1 行以下の場合はカード全体を 1 区間として返す
 */
export function resolveSequentialCaptionSegments(
  caption: SequentialCaptionInput,
): SequentialCaptionSegment[] {
  const lines = splitSequentialCaptionLines(caption.text);
  const duration = Math.max(0, caption.endTime - caption.startTime);
  if (lines.length <= 1) {
    return [{
      text: lines[0] ?? caption.text.trim(),
      startTime: caption.startTime,
      endTime: caption.endTime,
    }];
  }

  // 行間隔: 全行に最低表示時間を確保できる範囲まで自動で縮める
  const requestedGap = clampSequentialGapSec(caption.sequentialGapSec ?? 0);
  const maxGap = (duration - lines.length * MIN_SEQUENTIAL_SEGMENT_SEC) / (lines.length - 1);
  const gap = Math.max(0, Math.min(requestedGap, maxGap));
  const usable = duration - gap * (lines.length - 1);

  const weights = lines.map((line) => Math.max(1, [...line].length));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  const segments: SequentialCaptionSegment[] = [];
  let accumulated = 0;
  for (let i = 0; i < lines.length; i++) {
    const start = caption.startTime + (usable * accumulated) / totalWeight + gap * i;
    accumulated += weights[i];
    const end = i === lines.length - 1
      ? caption.endTime
      : caption.startTime + (usable * accumulated) / totalWeight + gap * i;
    segments.push({ text: lines[i], startTime: start, endTime: end });
  }
  return segments;
}

export interface CaptionDisplaySegment {
  text: string;
  /** フェード計算の基準になる区間（'line' モード用）。タイムライン絶対秒 */
  startTime: number;
  endTime: number;
  /** 時分割キャプションの一部かどうか（行ごとフェードの適用判定に使う） */
  isSequential: boolean;
}

/**
 * 指定時刻に描画すべき表示区間を返す。
 * - 単一行キャプション: カード全体を 1 区間として返す
 * - 時分割キャプション: その時刻の行区間を返す。行間ギャップ中は null（何も表示しない）
 * - カード範囲外の時刻は最初/最後の行へクランプする（終端フレームの安全側）
 */
export function resolveCaptionDisplaySegment(
  caption: SequentialCaptionInput,
  timeSec: number,
): CaptionDisplaySegment | null {
  const segments = resolveSequentialCaptionSegments(caption);
  if (segments.length === 1) {
    return { ...segments[0], isSequential: false };
  }
  if (timeSec < segments[0].startTime) {
    return { ...segments[0], isSequential: true };
  }
  for (const segment of segments) {
    if (timeSec < segment.startTime) {
      // 前の区間と次の区間の間（行間ギャップ）→ 非表示
      return null;
    }
    if (timeSec < segment.endTime) {
      return { ...segment, isSequential: true };
    }
  }
  return { ...segments[segments.length - 1], isSequential: true };
}

/**
 * 指定時刻に表示すべきテキスト（時分割の 1 行）を返す。ギャップ中は null。
 */
export function resolveCaptionDisplayText(
  caption: SequentialCaptionInput,
  timeSec: number,
): string | null {
  return resolveCaptionDisplaySegment(caption, timeSec)?.text ?? null;
}
