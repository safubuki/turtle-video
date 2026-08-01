/**
 * @file captionSubtitle.ts
 * @description キャプションから汎用字幕ファイル（SRT / WebVTT）を生成する純ロジック（Issue #114）。
 *
 * - 時分割キャプションは行ごとの表示区間を個別キューに展開する
 * - スタイル（色・字体・位置）は規格上捨てる（時刻とテキストのみ）
 * - 動画タイトルは通常キャプションとは別管理のため、既定では字幕に含めない
 *   （キャプション動画レイヤー側でのみ描画する）
 */
import type { Caption, CaptionSubtitleFormat } from '../types';
import {
  resolveSequentialCaptionSegments,
  type SequentialCaptionSegment,
} from './captionTimeline';

export interface SubtitleCue {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}

const MIN_CUE_DURATION_SEC = 0.04;

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

/**
 * SRT / VTT 共通の時刻フォーマット。
 * SRT: HH:MM:SS,mmm
 * VTT: HH:MM:SS.mmm
 */
export function formatSubtitleTimestamp(
  timeSec: number,
  style: 'srt' | 'vtt',
): string {
  const totalMs = Math.max(0, Math.round(clampNonNegative(timeSec) * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(ms).padStart(3, '0');
  const sep = style === 'srt' ? ',' : '.';
  return `${hh}:${mm}:${ss}${sep}${mmm}`;
}

/** 字幕本文の改行を正規化し、空キューを作らない */
export function normalizeSubtitleCueText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

/**
 * キャプション配列から字幕キューを構築する。
 * 時分割は `resolveSequentialCaptionSegments` と同じ配分で展開する。
 * 開始 >= 終了、またはテキスト空の区間は捨てる。
 * 開始時刻順に並べ、index は 1 始まり。
 */
export function buildSubtitleCuesFromCaptions(captions: Caption[]): SubtitleCue[] {
  const segments: SequentialCaptionSegment[] = [];
  for (const caption of captions) {
    const parts = resolveSequentialCaptionSegments(caption);
    for (const part of parts) {
      const text = normalizeSubtitleCueText(part.text);
      if (!text) continue;
      const startTime = clampNonNegative(part.startTime);
      let endTime = clampNonNegative(part.endTime);
      if (endTime <= startTime) {
        endTime = startTime + MIN_CUE_DURATION_SEC;
      }
      segments.push({ text, startTime, endTime });
    }
  }

  segments.sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime - b.startTime;
    return a.endTime - b.endTime;
  });

  return segments.map((segment, i) => ({
    index: i + 1,
    startTime: segment.startTime,
    endTime: segment.endTime,
    text: segment.text,
  }));
}

export function serializeSubtitleCuesAsSrt(cues: SubtitleCue[]): string {
  if (cues.length === 0) return '';
  const blocks = cues.map((cue) => {
    const start = formatSubtitleTimestamp(cue.startTime, 'srt');
    const end = formatSubtitleTimestamp(cue.endTime, 'srt');
    return `${cue.index}\n${start} --> ${end}\n${cue.text}`;
  });
  return `${blocks.join('\n\n')}\n`;
}

export function serializeSubtitleCuesAsVtt(cues: SubtitleCue[]): string {
  const header = 'WEBVTT\n';
  if (cues.length === 0) return `${header}\n`;
  const blocks = cues.map((cue) => {
    const start = formatSubtitleTimestamp(cue.startTime, 'vtt');
    const end = formatSubtitleTimestamp(cue.endTime, 'vtt');
    return `${cue.index}\n${start} --> ${end}\n${cue.text}`;
  });
  return `${header}\n${blocks.join('\n\n')}\n`;
}

export function buildSubtitleFileContent(
  captions: Caption[],
  format: CaptionSubtitleFormat,
): string {
  const cues = buildSubtitleCuesFromCaptions(captions);
  return format === 'srt'
    ? serializeSubtitleCuesAsSrt(cues)
    : serializeSubtitleCuesAsVtt(cues);
}

export function subtitleMimeType(format: CaptionSubtitleFormat): string {
  return format === 'srt' ? 'application/x-subrip' : 'text/vtt';
}
