/**
 * @file captionBulkInput.ts
 * @author Turtle Village
 * @description 長文キャプション一括入力（歌詞・字幕向け）の割付計算。
 * 1 行 = 1 キャプションとして、均等割り / 固定秒のいずれかで初期タイミングを決める。
 * 純ロジックのみ（standard フレーバー限定 UI から使用）。
 */

export type BulkCaptionAllocationMode = 'even' | 'fixed';

export interface BulkCaptionPlan {
  text: string;
  startTime: number;
  endTime: number;
}

/** 1 行あたりの既定表示秒数（固定モード） */
export const BULK_CAPTION_FIXED_DURATION_SEC = 3;

/** 割付時に保証する最小表示秒数 */
const MIN_CAPTION_DURATION_SEC = 0.5;

/** 複数行テキストを行分割する。前後空白を除去し、空行は無視する */
export function splitCaptionLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * 一括キャプションの割付を計算する。
 * - even: startTime から動画末尾（totalDuration）までを行数で等分。
 *         残り時間が足りない場合は fixed へフォールバック。
 * - fixed: startTime から 1 行 fixedDurationSec 秒で連続配置。
 *          totalDuration が正の場合は末尾をクリップし、収まらない行は
 *          最小表示時間を保てる範囲で詰める（それも無理なら末尾で打ち切り）。
 */
export function planBulkCaptions(
  lines: string[],
  mode: BulkCaptionAllocationMode,
  options: {
    startTime: number;
    totalDuration: number;
    fixedDurationSec?: number;
  },
): BulkCaptionPlan[] {
  if (lines.length === 0) return [];

  const totalDuration = Math.max(0, options.totalDuration);
  const startTime = Math.max(0, Math.min(options.startTime, totalDuration > 0 ? totalDuration : options.startTime));
  const fixedDuration = Math.max(MIN_CAPTION_DURATION_SEC, options.fixedDurationSec ?? BULK_CAPTION_FIXED_DURATION_SEC);

  const remaining = totalDuration - startTime;
  const useEven = mode === 'even'
    && totalDuration > 0
    && remaining >= lines.length * MIN_CAPTION_DURATION_SEC;

  if (useEven) {
    const slot = remaining / lines.length;
    return lines.map((text, index) => ({
      text,
      startTime: round1(startTime + slot * index),
      endTime: round1(index === lines.length - 1 ? totalDuration : startTime + slot * (index + 1)),
    }));
  }

  // fixed（または even のフォールバック）
  const plans: BulkCaptionPlan[] = [];
  let cursor = startTime;
  for (const text of lines) {
    let end = cursor + fixedDuration;
    if (totalDuration > 0) {
      if (cursor >= totalDuration - MIN_CAPTION_DURATION_SEC / 2) {
        // 末尾に収まらない行は打ち切り（残り行は追加しない）
        break;
      }
      end = Math.min(end, totalDuration);
      if (end - cursor < MIN_CAPTION_DURATION_SEC) {
        end = Math.min(cursor + MIN_CAPTION_DURATION_SEC, totalDuration);
        if (end - cursor < 0.2) break;
      }
    }
    plans.push({ text, startTime: round1(cursor), endTime: round1(end) });
    cursor = end;
  }
  return plans;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
