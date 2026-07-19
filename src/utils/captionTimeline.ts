/**
 * @file captionTimeline.ts
 * @author Turtle Village
 * @description キャプションの時間判定と、複数行テキストの時分割（順次表示）計算。
 *
 * 1 つのキャプションカードのテキストが複数行（改行区切り）の場合、
 * カードの表示時間 [startTime, endTime) を行ごとの文字数比で自動配分し、
 * その時刻の行だけを 1 行ずつ順番に表示する（時分割表示）。
 * 「1 枚のカード = 1 つの説明」の意味を保ったまま、長文を分割表示できる。
 * 配分は純ロジックのみで、描画はプレビュー/エクスポート共通の renderFrame が行う。
 */
import type { Caption } from '../types';

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

export interface SequentialCaptionSegment {
  text: string;
  /** タイムライン絶対秒 */
  startTime: number;
  endTime: number;
}

/**
 * 複数行キャプションの各行の表示区間を文字数比で配分して返す。
 * - 各行の重みは max(1, 文字数)。短い行にも最低限の表示時間を与える
 * - 丸め誤差で隙間ができないよう、境界は累積比率から算出する
 * - 1 行以下の場合はカード全体を 1 区間として返す
 */
export function resolveSequentialCaptionSegments(
  caption: Pick<Caption, 'text' | 'startTime' | 'endTime'>,
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

  const weights = lines.map((line) => Math.max(1, [...line].length));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  const segments: SequentialCaptionSegment[] = [];
  let accumulated = 0;
  for (let i = 0; i < lines.length; i++) {
    const start = caption.startTime + (duration * accumulated) / totalWeight;
    accumulated += weights[i];
    const end = i === lines.length - 1
      ? caption.endTime
      : caption.startTime + (duration * accumulated) / totalWeight;
    segments.push({ text: lines[i], startTime: start, endTime: end });
  }
  return segments;
}

/**
 * 指定時刻に表示すべきテキスト（時分割の 1 行）を返す。
 * 範囲外の時刻はクランプして最初/最後の行を返す（終端フレームの安全側）。
 */
export function resolveCaptionDisplayText(
  caption: Pick<Caption, 'text' | 'startTime' | 'endTime'>,
  timeSec: number,
): string {
  const segments = resolveSequentialCaptionSegments(caption);
  if (segments.length === 1) return segments[0].text;
  for (const segment of segments) {
    if (timeSec < segment.endTime) return segment.text;
  }
  return segments[segments.length - 1].text;
}
