/**
 * @file captionBulkInput.ts
 * @author Turtle Village
 * @description 長文キャプション一括入力（歌詞・字幕向け）の割付計算と時間記法の解析・整形。
 * 1 行 = 1 キャプション。行頭の `[開始-終了]` ブラケット記法で行ごとの時間指定が可能
 * （例: `[00:03.0-00:07.5] 明日はいい日になるさ`）。本文中の記号には影響されない。
 * 純ロジックのみ（standard フレーバー限定 UI から使用）。
 */

export type BulkCaptionAllocationMode = 'even' | 'fixed';

export interface BulkCaptionLine {
  text: string;
  /** 行頭の時間記法で明示された開始秒（無指定は自動割付） */
  explicitStart?: number;
  /** 行頭の時間記法で明示された終了秒 */
  explicitEnd?: number;
}

export interface BulkCaptionPlan {
  text: string;
  startTime: number;
  endTime: number;
}

/** 1 行あたりの既定表示秒数（固定モード） */
export const BULK_CAPTION_FIXED_DURATION_SEC = 3;
/** 表示秒数の可変範囲 */
export const BULK_CAPTION_DURATION_MIN_SEC = 0.5;
export const BULK_CAPTION_DURATION_MAX_SEC = 30;
/** キャプション間の間隔の選択肢（秒）。既定は 0.3 秒 */
export const BULK_CAPTION_GAP_OPTIONS_SEC = [0, 0.3, 0.5] as const;
export const BULK_CAPTION_DEFAULT_GAP_SEC = 0.3;

/** 割付時に保証する最小表示秒数 */
const MIN_CAPTION_DURATION_SEC = 0.5;

// 時間記法: [MM:SS-MM:SS] / [MM:SS.s~MM:SS.s] / [63.5-70] など。
// 行頭（推奨・プリフィル形式）または行末に置ける。中身が時間ペアとして
// 解釈できる場合のみ時間指定として扱い、本文中の記号には反応しない。
const TIME_PREFIX_PATTERN = /^\[\s*([0-9:.]+)\s*[-~]\s*([0-9:.]+)\s*\]\s*(.*)$/;
const TIME_SUFFIX_PATTERN = /^(.*?)\s*\[\s*([0-9:.]+)\s*[-~]\s*([0-9:.]+)\s*\]$/;

/** "MM:SS" / "MM:SS.s" / "HH:MM:SS" / "秒数" を秒へ変換する。解釈できなければ null */
export function parseTimeNotation(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length > 3) return null;
  let seconds = 0;
  for (const part of parts) {
    if (part === '' || !/^[0-9]+(\.[0-9]+)?$/.test(part)) return null;
    seconds = seconds * 60 + Number(part);
  }
  return Number.isFinite(seconds) ? seconds : null;
}

/** 秒を "MM:SS.s" 形式へ整形する（時間記法の出力用） */
export function formatTimeNotation(seconds: number): string {
  const safe = Math.max(0, seconds);
  const totalTenths = Math.round(safe * 10);
  const minutes = Math.floor(totalTenths / 600);
  const secs = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

/**
 * 複数行テキストを行分割し、行頭の時間記法をパースする。
 * 前後空白を除去し、空行は無視する。時間記法が不正な場合は行全体を本文として扱う。
 */
export function parseBulkCaptionInput(input: string): BulkCaptionLine[] {
  const lines: BulkCaptionLine[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const prefixMatch = line.match(TIME_PREFIX_PATTERN);
    if (prefixMatch) {
      const start = parseTimeNotation(prefixMatch[1]);
      const end = parseTimeNotation(prefixMatch[2]);
      const text = prefixMatch[3].trim();
      if (start !== null && end !== null && end > start && text) {
        lines.push({ text, explicitStart: start, explicitEnd: end });
        continue;
      }
    }
    // 行末形式（テキスト [開始-終了]）も許容する
    const suffixMatch = line.match(TIME_SUFFIX_PATTERN);
    if (suffixMatch) {
      const start = parseTimeNotation(suffixMatch[2]);
      const end = parseTimeNotation(suffixMatch[3]);
      const text = suffixMatch[1].trim();
      if (start !== null && end !== null && end > start && text) {
        lines.push({ text, explicitStart: start, explicitEnd: end });
        continue;
      }
    }
    lines.push({ text: line });
  }
  return lines;
}

/** 後方互換: 単純な行分割（時間記法は本文扱い） */
export function splitCaptionLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** 既存キャプションを時間記法付きテキストへ整形する（まとめて編集のプリフィル用） */
export function formatCaptionsAsBulkText(
  captions: { text: string; startTime: number; endTime: number }[],
): string {
  return captions
    .map((c) => `[${formatTimeNotation(c.startTime)}-${formatTimeNotation(c.endTime)}] ${c.text}`)
    .join('\n');
}

/**
 * 一括キャプションの割付を計算する。
 * - 時間記法付き行はその時間をそのまま使用し、後続の自動割付はその終了+間隔から続ける。
 * - even: 全行が時間なしで残り時間が足りる場合のみ、startTime〜動画末尾を等分
 *         （行間に gapSec の間隔を空ける）。
 * - fixed（または even 不成立時）: 直前の終了 + gapSec から fixedDurationSec 秒で連続配置。
 *   totalDuration が正の場合は末尾でクリップし、収まらない行は打ち切る。
 */
export function planBulkCaptions(
  linesInput: (string | BulkCaptionLine)[],
  mode: BulkCaptionAllocationMode,
  options: {
    startTime: number;
    totalDuration: number;
    fixedDurationSec?: number;
    gapSec?: number;
  },
): BulkCaptionPlan[] {
  const lines: BulkCaptionLine[] = linesInput.map((line) =>
    typeof line === 'string' ? { text: line } : line,
  );
  if (lines.length === 0) return [];

  const totalDuration = Math.max(0, options.totalDuration);
  const startTime = Math.max(0, totalDuration > 0 ? Math.min(options.startTime, totalDuration) : options.startTime);
  const fixedDuration = clampDuration(options.fixedDurationSec ?? BULK_CAPTION_FIXED_DURATION_SEC);
  const gap = Math.max(0, options.gapSec ?? 0);

  const hasExplicit = lines.some((line) => line.explicitStart !== undefined);
  const remaining = totalDuration - startTime;
  const evenNeeded = lines.length * MIN_CAPTION_DURATION_SEC + gap * (lines.length - 1);
  const useEven = mode === 'even' && !hasExplicit && totalDuration > 0 && remaining >= evenNeeded;

  if (useEven) {
    const slot = (remaining - gap * (lines.length - 1)) / lines.length;
    return lines.map((line, index) => {
      const start = startTime + (slot + gap) * index;
      const end = index === lines.length - 1 ? totalDuration : start + slot;
      return { text: line.text, startTime: round1(start), endTime: round1(end) };
    });
  }

  // 逐次配置（fixed / even フォールバック / 時間記法混在）
  const plans: BulkCaptionPlan[] = [];
  let cursor = startTime;
  for (const line of lines) {
    if (line.explicitStart !== undefined && line.explicitEnd !== undefined) {
      plans.push({
        text: line.text,
        startTime: round1(line.explicitStart),
        endTime: round1(line.explicitEnd),
      });
      cursor = line.explicitEnd + gap;
      continue;
    }

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
    plans.push({ text: line.text, startTime: round1(cursor), endTime: round1(end) });
    cursor = end + gap;
  }
  return plans;
}

export function clampDuration(value: number): number {
  if (!Number.isFinite(value)) return BULK_CAPTION_FIXED_DURATION_SEC;
  return Math.max(BULK_CAPTION_DURATION_MIN_SEC, Math.min(BULK_CAPTION_DURATION_MAX_SEC, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
