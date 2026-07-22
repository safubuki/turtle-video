/**
 * @file captionBulkInput.ts
 * @author Turtle Village
 * @description 長文キャプション一括入力（歌詞・字幕向け）の割付計算と時間記法の解析・整形。
 * 1 行 = 1 キャプション。行頭の `[開始-終了]` ブラケット記法で行ごとの時間指定が可能
 * （例: `[00:03.0-00:07.5] 明日はいい日になるさ`）。本文中の記号には影響されない。
 * 純ロジックのみ（standard フレーバー限定 UI から使用）。
 */

export type BulkCaptionAllocationMode = 'even' | 'fixed';
export type BulkCaptionSplitMode = 'line' | 'hybrid' | 'block';

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
/** キャプション間の間隔プリセット（秒）。これ以外は「カスタム」で自由入力。既定は 0.2 秒 */
export const BULK_CAPTION_GAP_PRESETS_SEC = [0, 0.2] as const;
export const BULK_CAPTION_DEFAULT_GAP_SEC = 0.2;
export const BULK_CAPTION_GAP_MAX_SEC = 10;

/** 割付時に保証する最小表示秒数 */
const MIN_CAPTION_DURATION_SEC = 0.5;

// 時間記法: [MM:SS-MM:SS] / [MM:SS.s~MM:SS.s] / [63.5-70] など。
// 行頭（推奨・プリフィル形式）または行末に置ける。中身が時間ペアとして
// 解釈できる場合のみ時間指定として扱い、本文中の記号には反応しない。
const TIME_PREFIX_PATTERN = /^\[\s*([0-9:.]+)\s*[-~]\s*([0-9:.]+)\s*\]\s*(.*)$/;
const TIME_SUFFIX_PATTERN = /^(.*?)\s*\[\s*([0-9:.]+)\s*[-~]\s*([0-9:.]+)\s*\]$/;

/**
 * 時分割キャプション（複数行の順次表示）の行区切りマーカー。
 * まとめて入力/編集は「1 行 = 1 キャプション」のため、カード内改行は
 * ⏎ に変換して 1 行に畳み、反映時に改行へ戻す（ロスレス往復）。
 */
export const SEQUENTIAL_LINE_MARKER = '⏎';
/** 混在モードで「直前カードの次の表示行」を表す、スマホでも入力しやすい接頭辞 */
export const HYBRID_CONTINUATION_PREFIX = '+ ';

export interface SequentialLineInsertion {
  text: string;
  /** 挿入した `+ ` の直後。UIはここへキャレットを戻す。 */
  cursor: number;
}

/**
 * カーソル位置で本文を分け、後半を混在モードの時分割行へ移す。
 * 選択範囲がある場合も文章を失わないよう、選択開始位置を分割点として全文を保持する。
 */
export function insertSequentialLineAtCursor(
  input: string,
  cursorPosition: number,
): SequentialLineInsertion {
  const requestedCursor = Number.isFinite(cursorPosition)
    ? Math.trunc(cursorPosition)
    : input.length;
  const cursor = Math.max(0, Math.min(input.length, requestedCursor));
  const prefix = `\n${HYBRID_CONTINUATION_PREFIX}`;
  return {
    text: `${input.slice(0, cursor)}${prefix}${input.slice(cursor)}`,
    cursor: cursor + prefix.length,
  };
}

/** カード内改行を ⏎ マーカーへ畳む（まとめて編集のプリフィル用） */
export function encodeSequentialLinesForBulkText(text: string): string {
  return text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0).join(SEQUENTIAL_LINE_MARKER);
}

/** ⏎ マーカーをカード内改行へ戻す（まとめて入力の反映用） */
export function decodeSequentialLinesFromBulkText(text: string): string {
  if (!text.includes(SEQUENTIAL_LINE_MARKER)) return text;
  return text
    .split(SEQUENTIAL_LINE_MARKER)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

function splitSequentialMarkerLines(line: string): string[] {
  return line
    .split(SEQUENTIAL_LINE_MARKER)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** 入力モードごとの見た目を、カード単位の表示行配列へ変換する。 */
function collectBulkCaptionGroups(input: string, mode: BulkCaptionSplitMode): string[][] {
  const groups: string[][] = [];

  if (mode === 'block') {
    let current: string[] = [];
    const flush = () => {
      if (current.length > 0) groups.push(current);
      current = [];
    };
    for (const raw of input.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) {
        flush();
        continue;
      }
      current.push(...splitSequentialMarkerLines(line));
    }
    flush();
    return groups;
  }

  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (mode === 'hybrid') {
      const continuationMatch = line.match(/^\+\s+(.+)$/);
      if (continuationMatch && groups.length > 0) {
        groups[groups.length - 1].push(...splitSequentialMarkerLines(continuationMatch[1]));
        continue;
      }
    }

    groups.push(splitSequentialMarkerLines(line));
  }
  return groups.filter((group) => group.length > 0);
}

function renderBulkCaptionGroups(groups: string[][], mode: BulkCaptionSplitMode): string {
  if (mode === 'line') return groups.flat().join('\n');
  if (mode === 'block') return groups.map((group) => group.join('\n')).join('\n\n');

  return groups
    .map((group) => group
      .map((line, index) => (index === 0 ? line : `${HYBRID_CONTINUATION_PREFIX}${line}`))
      .join('\n'))
    .join('\n');
}

/**
 * UI上の入力を、既存パーサーが扱う「1カード=1行、内部改行=⏎」形式へ正規化する。
 * 保存形式は従来どおり Caption.text 内の実改行であり、この記法自体は保存しない。
 */
export function normalizeBulkCaptionText(input: string, mode: BulkCaptionSplitMode): string {
  return collectBulkCaptionGroups(input, mode)
    .map((group) => group.join(SEQUENTIAL_LINE_MARKER))
    .join('\n');
}

/**
 * 表示モードを考慮して一括入力を解析する単一入口。
 * hybridでは、時間記法の有無に関係なく `+ ` のない物理行は必ず新しいカードになる。
 */
export function parseBulkCaptionText(
  input: string,
  mode: BulkCaptionSplitMode,
): BulkCaptionLine[] {
  return parseBulkCaptionInput(normalizeBulkCaptionText(input, mode));
}

/**
 * 入力欄のモードを切り替える際、カード構造を保ちながら表示記法を変換する。
 * line へ切り替えた場合だけ、時分割の各表示行を独立カードへ展開する。
 */
export function convertBulkCaptionTextMode(
  input: string,
  from: BulkCaptionSplitMode,
  to: BulkCaptionSplitMode,
): string {
  if (from === to) return input;
  return renderBulkCaptionGroups(collectBulkCaptionGroups(input, from), to);
}

/**
 * 「空行で区切る」モード用の前処理。
 * 空行で区切られたブロックを 1 行（= 1 カード）へ畳み、ブロック内の改行は
 * ⏎ マーカーに変換する（複数行ブロック = 時分割カード）。
 * 先頭/末尾の時間記法はブロックの 1 行目/最終行に付いたまま解釈される。
 */
export function collapseBlankLineBlocks(input: string): string {
  return normalizeBulkCaptionText(input, 'block');
}

/** カードの表示行数（時分割の行数。単一行なら 1）を返す。時間配分の加重に使う */
export function countSequentialLines(text: string): number {
  return Math.max(1, text.split('\n').filter((line) => line.trim().length > 0).length);
}

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
      const text = decodeSequentialLinesFromBulkText(prefixMatch[3].trim());
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
      const text = decodeSequentialLinesFromBulkText(suffixMatch[1].trim());
      if (start !== null && end !== null && end > start && text) {
        lines.push({ text, explicitStart: start, explicitEnd: end });
        continue;
      }
    }
    lines.push({ text: decodeSequentialLinesFromBulkText(line) });
  }
  return lines;
}

/**
 * 有効な時間記法だけを入力欄から除去する。文章・空行・混在モードの `+ ` は維持する。
 * 時刻として解釈できない角括弧や、開始 >= 終了の記法は本文として残す。
 */
export function stripBulkCaptionTimeNotations(input: string): string {
  return input.split(/\r?\n/).map((raw) => {
    const line = raw.trim();
    if (!line) return raw;

    const prefixMatch = line.match(TIME_PREFIX_PATTERN);
    if (prefixMatch) {
      const start = parseTimeNotation(prefixMatch[1]);
      const end = parseTimeNotation(prefixMatch[2]);
      const text = prefixMatch[3].trim();
      if (start !== null && end !== null && end > start && text) return text;
    }

    const suffixMatch = line.match(TIME_SUFFIX_PATTERN);
    if (suffixMatch) {
      const start = parseTimeNotation(suffixMatch[2]);
      const end = parseTimeNotation(suffixMatch[3]);
      const text = suffixMatch[1].trim();
      if (start !== null && end !== null && end > start && text) return text;
    }

    return raw;
  }).join('\n');
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
  splitMode: BulkCaptionSplitMode = 'line',
): string {
  // 既存呼び出しとの互換性: line の既定出力は従来どおり 1カード=1物理行とする。
  if (splitMode === 'line') {
    return captions
      .map((caption) => `[${formatTimeNotation(caption.startTime)}-${formatTimeNotation(caption.endTime)}] ${encodeSequentialLinesForBulkText(caption.text)}`)
      .join('\n');
  }
  const groups = captions.map((caption) => {
    const lines = caption.text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) return [];
    return [
      `[${formatTimeNotation(caption.startTime)}-${formatTimeNotation(caption.endTime)}] ${lines[0]}`,
      ...lines.slice(1),
    ];
  }).filter((group) => group.length > 0);
  return renderBulkCaptionGroups(groups, splitMode);
}

/**
 * 一括キャプションの割付を計算する。
 * - 時間記法付き行はその時間をそのまま使用し、後続の自動割付はその終了+間隔から続ける。
 * - 時分割カード（text に改行を含む）は表示行数で加重する
 *   （「1行あたりの表示時間」は画面に出る 1 行を基準にする）。
 * - even: 全行が時間なしで残り時間が足りる場合のみ、startTime〜動画末尾を行数加重で分配
 *         （カード間に gapSec の間隔を空ける）。
 * - fixed（または even 不成立時）: 直前の終了 + gapSec から fixedDurationSec × 行数 で連続配置。
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

  // 時分割カード（複数行）は行数ぶんの時間を与える（「1行あたりの表示時間」を表示行基準にする）
  const weights = lines.map((line) => countSequentialLines(line.text));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  const hasExplicit = lines.some((line) => line.explicitStart !== undefined);
  const remaining = totalDuration - startTime;
  const evenNeeded = totalWeight * MIN_CAPTION_DURATION_SEC + gap * (lines.length - 1);
  const useEven = mode === 'even' && !hasExplicit && totalDuration > 0 && remaining >= evenNeeded;

  if (useEven) {
    const usable = remaining - gap * (lines.length - 1);
    let accumulated = 0;
    return lines.map((line, index) => {
      const start = startTime + (usable * accumulated) / totalWeight + gap * index;
      accumulated += weights[index];
      const end = index === lines.length - 1
        ? totalDuration
        : startTime + (usable * accumulated) / totalWeight + gap * index;
      return { text: line.text, startTime: round1(start), endTime: round1(end) };
    });
  }

  // 逐次配置（fixed / even フォールバック / 時間記法混在）
  const plans: BulkCaptionPlan[] = [];
  let cursor = startTime;
  for (const [index, line] of lines.entries()) {
    if (line.explicitStart !== undefined && line.explicitEnd !== undefined) {
      plans.push({
        text: line.text,
        startTime: round1(line.explicitStart),
        endTime: round1(line.explicitEnd),
      });
      cursor = line.explicitEnd + gap;
      continue;
    }

    let end = cursor + fixedDuration * weights[index];
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

/**
 * まとめて編集の反映時に、各プラン行へ引き継ぐ既存キャプション id を決める。
 * 単純な行番号マッチングだと行削除で以降の個別スタイルが 1 つ隣へずれるため、
 * 「未編集の行（テキストと 0.1 秒精度の時間が一致）」を順序保持のアンカーとして
 * 先に対応付け、アンカー間に残った行だけを位置順で対応付ける。
 * - 行削除: 削除行のキャプションはどのプランにも対応せず破棄される（ずれない）
 * - 文言/時間の変更: 前後のアンカーに挟まれた同位置の行として id を維持する
 * - 行追加: 対応する既存が無いので id なし（新規作成）になる
 */
export function assignBulkCaptionIds(
  plans: BulkCaptionPlan[],
  captions: { id: string; text: string; startTime: number; endTime: number }[],
): (BulkCaptionPlan & { id?: string })[] {
  const isUnmodifiedPair = (
    plan: BulkCaptionPlan,
    caption: { text: string; startTime: number; endTime: number },
  ): boolean =>
    plan.text === caption.text
    && plan.startTime === round1(caption.startTime)
    && plan.endTime === round1(caption.endTime);

  // 1. 未編集行を順序を保ったまま貪欲にアンカーとして対応付ける
  const anchorCaptionIndexByPlan = new Array<number>(plans.length).fill(-1);
  let searchFrom = 0;
  plans.forEach((plan, planIndex) => {
    for (let i = searchFrom; i < captions.length; i++) {
      if (isUnmodifiedPair(plan, captions[i])) {
        anchorCaptionIndexByPlan[planIndex] = i;
        searchFrom = i + 1;
        break;
      }
    }
  });

  // 2. アンカー間の未対応行を「テキスト一致優先 → 残りは位置順」で対応付ける
  //    （テキスト一致を先に取ることで、行挿入時に新規行が既存 id を吸わない）
  const result: (BulkCaptionPlan & { id?: string })[] = new Array(plans.length);
  let planFrom = 0;
  let captionFrom = 0;
  const fillGap = (planEnd: number, captionEnd: number) => {
    const gapPlanCount = planEnd - planFrom;
    if (gapPlanCount <= 0) return;
    const gapCaptions = captions.slice(captionFrom, Math.max(captionFrom, captionEnd));
    const captionTaken = new Array<boolean>(gapCaptions.length).fill(false);
    const assignedCaption = new Array<number>(gapPlanCount).fill(-1);

    // pass 1: テキストのみ一致（時間だけ編集された行）を順序を保って対応付ける
    let textSearchFrom = 0;
    for (let p = 0; p < gapPlanCount; p++) {
      for (let c = textSearchFrom; c < gapCaptions.length; c++) {
        if (!captionTaken[c] && gapCaptions[c].text === plans[planFrom + p].text) {
          assignedCaption[p] = c;
          captionTaken[c] = true;
          textSearchFrom = c + 1;
          break;
        }
      }
    }

    // pass 2: 残りを位置順で対応付ける（全行編集時のフォールバック）
    let zipFrom = 0;
    for (let p = 0; p < gapPlanCount; p++) {
      if (assignedCaption[p] >= 0) continue;
      while (zipFrom < gapCaptions.length && captionTaken[zipFrom]) zipFrom++;
      if (zipFrom < gapCaptions.length) {
        assignedCaption[p] = zipFrom;
        captionTaken[zipFrom] = true;
      }
    }

    for (let p = 0; p < gapPlanCount; p++) {
      const caption = assignedCaption[p] >= 0 ? gapCaptions[assignedCaption[p]] : undefined;
      result[planFrom + p] = caption ? { id: caption.id, ...plans[planFrom + p] } : { ...plans[planFrom + p] };
    }
  };
  plans.forEach((plan, planIndex) => {
    const captionIndex = anchorCaptionIndexByPlan[planIndex];
    if (captionIndex < 0) return;
    fillGap(planIndex, captionIndex);
    result[planIndex] = { id: captions[captionIndex].id, ...plan };
    planFrom = planIndex + 1;
    captionFrom = captionIndex + 1;
  });
  fillGap(plans.length, captions.length);
  return result;
}

export function clampDuration(value: number): number {
  if (!Number.isFinite(value)) return BULK_CAPTION_FIXED_DURATION_SEC;
  return Math.max(BULK_CAPTION_DURATION_MIN_SEC, Math.min(BULK_CAPTION_DURATION_MAX_SEC, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
