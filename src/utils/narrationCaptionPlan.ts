/**
 * AI ナレーションの保持原稿から、個別編集できる通常キャプションカードを作る。
 *
 * 既存の「時分割キャプション」は 1 カード内の複数行を文字数比で表示するため、
 * 行ごとの開始・終了を編集できない。ナレーション連携では通常カードへ展開し、
 * 既存の個別編集・タイミング打ち・保存復元をそのまま利用する。
 */

export interface NarrationCaptionPlanItem {
  text: string;
  startTime: number;
  endTime: number;
}

export interface NarrationSilenceBoundaryCandidate {
  /** タイムライン上の無音区間中央（秒） */
  time: number;
  /** 無音区間の開始（秒） */
  start?: number;
  /** 無音区間の終了（秒） */
  end?: number;
  /** 無音区間の長さ（秒）。同距離の候補では長い方を優先する */
  duration?: number;
}

export interface SnappedNarrationCaptionPlan {
  plan: NarrationCaptionPlanItem[];
  snappedBoundaryCount: number;
  silentGapCount: number;
}

const DEFAULT_MAX_GRAPHEMES = 20;
const DEFAULT_MIN_SEGMENT_DURATION_SEC = 0.6;
const DEFAULT_MAX_SNAP_DISTANCE_SEC = 1.25;
const DEFAULT_MIN_SILENCE_FOR_GAP_SEC = 0.3;
const DEFAULT_CAPTION_EDGE_PADDING_SEC = 0.1;
/** 読点は上限の少し先まで見て、すぐ後ろの読点を取りこぼさない */
const SOFT_OVERFLOW_RATIO = 1.15;
const MIN_BREAK_RATIO = 0.4;
const STRONG_BREAK = /[。！？!?]/u;
const SOFT_BREAK = /[、，,・：:；;\s]/u;
const CAPTION_PUNCTUATION = /[。、，,！？!?]/gu;
const WORD_CHAR = /[\p{Script=Katakana}ーA-Za-z0-9]/u;
const PARTICLE = /[はがをにへとものでてやかも]/u;

const toGraphemes = (value: string): string[] => Array.from(value);

export function normalizeNarrationCaptionText(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

function stripCaptionPunctuation(text: string): string {
  return text.replace(CAPTION_PUNCTUATION, '').replace(/\s+/gu, ' ').trim();
}

function findLastMatchingBreak(
  graphemes: string[],
  pattern: RegExp,
  minInclusiveIndex: number,
  maxExclusive: number
): number {
  const start = Math.min(maxExclusive, graphemes.length) - 1;
  const end = Math.max(0, minInclusiveIndex);
  for (let i = start; i >= end; i--) {
    if (pattern.test(graphemes[i])) return i + 1;
  }
  return -1;
}

function isWordChar(value: string): boolean {
  return WORD_CHAR.test(value);
}

function splitByStrongBreaks(graphemes: string[]): string[] {
  const segments: string[] = [];
  let start = 0;
  for (let i = 0; i < graphemes.length; i++) {
    if (!STRONG_BREAK.test(graphemes[i])) continue;
    const segment = graphemes.slice(start, i + 1).join('').trim();
    if (segment) segments.push(segment);
    start = i + 1;
  }
  const tail = graphemes.slice(start).join('').trim();
  if (tail) segments.push(tail);
  return segments;
}

function avoidSplittingWord(graphemes: string[], breakAt: number, minBreak: number): number {
  if (breakAt <= 0 || breakAt >= graphemes.length) return breakAt;
  if (!isWordChar(graphemes[breakAt - 1]) || !isWordChar(graphemes[breakAt])) return breakAt;

  let runStart = breakAt - 1;
  while (runStart > 0 && isWordChar(graphemes[runStart - 1])) runStart -= 1;
  if (runStart >= minBreak) return runStart;
  return breakAt;
}

function findWrapBreak(graphemes: string[], maxLength: number): number {
  const minBreak = Math.max(1, Math.floor(maxLength * MIN_BREAK_RATIO));
  const minBreakIndex = minBreak - 1;
  const softLimit = Math.max(maxLength, Math.ceil(maxLength * SOFT_OVERFLOW_RATIO));
  const softAt = findLastMatchingBreak(graphemes, SOFT_BREAK, minBreakIndex, softLimit);
  if (softAt > 0) return softAt;

  const limit = Math.min(maxLength, graphemes.length);
  const wordSafeAt = avoidSplittingWord(graphemes, limit, minBreak);
  const particleAt = findLastMatchingBreak(graphemes, PARTICLE, minBreakIndex, wordSafeAt);
  if (particleAt > 0) return particleAt;
  return wordSafeAt;
}

function wrapLongSegment(text: string, maxLength: number): string[] {
  const graphemes = toGraphemes(text);
  if (graphemes.length <= maxLength) return text ? [text] : [];

  const remaining = [...graphemes];
  const segments: string[] = [];

  while (remaining.length > maxLength) {
    const breakAt = findWrapBreak(remaining, maxLength);
    const segment = remaining.splice(0, Math.max(1, breakAt)).join('').trim();
    if (segment) segments.push(segment);
    while (remaining[0] === ' ') remaining.shift();
  }

  const tail = remaining.join('').trim();
  if (tail) segments.push(tail);
  return segments;
}

function mergeSmallTail(segments: string[], maxLength: number): string[] {
  if (segments.length < 2) return segments;
  const tail = segments[segments.length - 1];
  const previous = segments[segments.length - 2];
  const tailLength = toGraphemes(tail).length;
  const combinedLength = toGraphemes(previous + tail).length;
  if (tailLength >= Math.max(4, Math.floor(maxLength * 0.35))) return segments;
  if (combinedLength > maxLength) return segments;
  return [...segments.slice(0, -2), `${previous}${tail}`];
}

/**
 * 句点で文を切り、長い文は読点や単語の切れ目で折り返す。
 * 画面に収まる長さを守り、句読点はキャプション本文へ残さない。
 */
export function splitNarrationCaptionText(
  text: string,
  maxGraphemes: number = DEFAULT_MAX_GRAPHEMES
): string[] {
  const normalized = normalizeNarrationCaptionText(text);
  if (!normalized) return [];

  const safeMax = Math.max(4, Math.floor(maxGraphemes));
  const segments = splitByStrongBreaks(toGraphemes(normalized))
    .flatMap((sentence) => wrapLongSegment(sentence, safeMax))
    .map(stripCaptionPunctuation)
    .filter(Boolean);
  return mergeSmallTail(segments, safeMax);
}

function mergeSegmentsToLimit(segments: string[], limit: number): string[] {
  const merged = [...segments];
  while (merged.length > limit) {
    let mergeAt = 0;
    let smallestPairLength = Number.POSITIVE_INFINITY;
    for (let i = 0; i < merged.length - 1; i++) {
      const pairLength = toGraphemes(merged[i] + merged[i + 1]).length;
      if (pairLength < smallestPairLength) {
        mergeAt = i;
        smallestPairLength = pairLength;
      }
    }
    merged.splice(mergeAt, 2, `${merged[mergeAt]}${merged[mergeAt + 1]}`);
  }
  return merged;
}

const roundMillis = (value: number): number => Math.round(value * 1000) / 1000;

function resolveSilenceRange(candidate: NarrationSilenceBoundaryCandidate): {
  time: number;
  start: number;
  end: number;
  duration: number;
} | null {
  if (!Number.isFinite(candidate.time)) return null;
  const suppliedDuration =
    Number.isFinite(candidate.duration) && (candidate.duration ?? 0) > 0 ? candidate.duration! : 0;
  const start = Number.isFinite(candidate.start)
    ? candidate.start!
    : candidate.time - suppliedDuration / 2;
  const end = Number.isFinite(candidate.end)
    ? candidate.end!
    : candidate.time + suppliedDuration / 2;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return {
    time: candidate.time,
    start,
    end,
    duration: end - start,
  };
}

/**
 * 音源内時刻の無音候補を、トリムを考慮したタイムライン時刻へ写像する。
 */
export function mapNarrationSilencesToTimeline(params: {
  silenceCandidates: NarrationSilenceBoundaryCandidate[];
  timelineStart: number;
  trimStart: number;
  trimEnd: number;
}): NarrationSilenceBoundaryCandidate[] {
  const trimStart = Math.max(0, params.trimStart);
  const trimEnd = Math.max(trimStart, params.trimEnd);
  return params.silenceCandidates
    .map(resolveSilenceRange)
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .map((candidate) => ({
      start: Math.max(trimStart, candidate.start),
      end: Math.min(trimEnd, candidate.end),
    }))
    .filter((candidate) => candidate.end > candidate.start)
    .map((candidate) => {
      const start = roundMillis(params.timelineStart + (candidate.start - trimStart));
      const end = roundMillis(params.timelineStart + (candidate.end - trimStart));
      return {
        time: roundMillis((start + end) / 2),
        start,
        end,
        duration: roundMillis(end - start),
      };
    });
}

export function buildNarrationCaptionPlan(params: {
  text: string;
  startTime: number;
  endTime: number;
  maxGraphemes?: number;
  minSegmentDurationSec?: number;
}): NarrationCaptionPlanItem[] {
  const startTime = Number.isFinite(params.startTime) ? Math.max(0, params.startTime) : 0;
  const endTime = Number.isFinite(params.endTime) ? Math.max(startTime, params.endTime) : startTime;
  const duration = endTime - startTime;
  if (duration <= 0) return [];

  const initialSegments = splitNarrationCaptionText(
    params.text,
    params.maxGraphemes ?? DEFAULT_MAX_GRAPHEMES
  );
  if (initialSegments.length === 0) return [];

  const minSegmentDuration = Math.max(
    0.1,
    params.minSegmentDurationSec ?? DEFAULT_MIN_SEGMENT_DURATION_SEC
  );
  const maxSegmentsForDuration = Math.max(1, Math.floor(duration / minSegmentDuration));
  const segments = mergeSegmentsToLimit(initialSegments, maxSegmentsForDuration);
  const weights = segments.map((segment) => Math.max(1, toGraphemes(segment).length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  let accumulatedWeight = 0;
  return segments.map((text, index) => {
    const segmentStart =
      index === 0 ? startTime : startTime + (duration * accumulatedWeight) / totalWeight;
    accumulatedWeight += weights[index];
    const segmentEnd =
      index === segments.length - 1
        ? endTime
        : startTime + (duration * accumulatedWeight) / totalWeight;
    return {
      text,
      startTime: roundMillis(segmentStart),
      endTime: roundMillis(segmentEnd),
    };
  });
}

/**
 * 文字数比で作ったカード境界を、近傍の無音区間へ安全に吸着させる。
 *
 * 短い無音は中央でカードを切り替え、字幕を消さない。
 * 明確な無音では発話終了後・発話開始前に少し余韻を残し、中央だけ字幕を消す。
 * 最初と最後の時刻は変えず、前後カードの最小表示時間を守れる候補だけを採用する。
 * 適切な候補がなければ、その境界は文字数比の時刻をそのまま維持する。
 */
export function snapNarrationCaptionPlanToSilences(params: {
  plan: NarrationCaptionPlanItem[];
  silenceCandidates: NarrationSilenceBoundaryCandidate[];
  maxSnapDistanceSec?: number;
  minSegmentDurationSec?: number;
  minSilenceForGapSec?: number;
  captionEdgePaddingSec?: number;
}): SnappedNarrationCaptionPlan {
  const { plan } = params;
  if (plan.length < 2) {
    return {
      plan: plan.map((item) => ({ ...item })),
      snappedBoundaryCount: 0,
      silentGapCount: 0,
    };
  }

  const maxSnapDistance = Math.max(0, params.maxSnapDistanceSec ?? DEFAULT_MAX_SNAP_DISTANCE_SEC);
  const minSegmentDuration = Math.max(
    0.1,
    params.minSegmentDurationSec ?? DEFAULT_MIN_SEGMENT_DURATION_SEC
  );
  const minSilenceForGap = Math.max(
    0,
    params.minSilenceForGapSec ?? DEFAULT_MIN_SILENCE_FOR_GAP_SEC
  );
  const captionEdgePadding = Math.max(
    0,
    params.captionEdgePaddingSec ?? DEFAULT_CAPTION_EDGE_PADDING_SEC
  );
  const timelineStart = plan[0].startTime;
  const timelineEnd = plan[plan.length - 1].endTime;
  const candidates = params.silenceCandidates
    .map(resolveSilenceRange)
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .map((candidate) => ({
      time: roundMillis(candidate.time),
      start: roundMillis(candidate.start),
      end: roundMillis(candidate.end),
      duration: roundMillis(candidate.duration),
    }))
    .filter(
      (candidate) =>
        candidate.start > timelineStart &&
        candidate.end < timelineEnd &&
        candidate.end > candidate.start
    )
    .map((candidate) => {
      if (candidate.duration + 1e-6 < minSilenceForGap) {
        return {
          ...candidate,
          previousEnd: candidate.time,
          nextStart: candidate.time,
          hasSilentGap: false,
        };
      }

      const previousEnd = roundMillis(
        Math.min(candidate.end, candidate.start + captionEdgePadding)
      );
      const nextStart = roundMillis(Math.max(candidate.start, candidate.end - captionEdgePadding));
      if (nextStart <= previousEnd) {
        return {
          ...candidate,
          previousEnd: candidate.time,
          nextStart: candidate.time,
          hasSilentGap: false,
        };
      }
      return {
        ...candidate,
        previousEnd,
        nextStart,
        hasSilentGap: true,
      };
    })
    .sort((a, b) => a.time - b.time);

  const boundaries = plan.slice(0, -1).map((item) => item.endTime);
  const resolvedBoundaries: Array<{ previousEnd: number; nextStart: number }> = [];
  let snappedBoundaryCount = 0;
  let silentGapCount = 0;

  boundaries.forEach((originalBoundary, index) => {
    const currentCardStart = index === 0 ? timelineStart : resolvedBoundaries[index - 1].nextStart;
    const remainingCardCount = plan.length - index - 1;
    const earliestEnd = currentCardStart + minSegmentDuration;
    const latestNextStart = timelineEnd - remainingCardCount * minSegmentDuration;

    const bestCandidate = candidates
      .filter(
        (candidate) =>
          candidate.previousEnd >= earliestEnd &&
          candidate.nextStart <= latestNextStart &&
          Math.abs(candidate.time - originalBoundary) <= maxSnapDistance
      )
      .sort((a, b) => {
        const distanceDiff =
          Math.abs(a.time - originalBoundary) - Math.abs(b.time - originalBoundary);
        if (Math.abs(distanceDiff) > 1e-6) return distanceDiff;
        if (Math.abs(b.duration - a.duration) > 1e-6) return b.duration - a.duration;
        return a.time - b.time;
      })[0];

    if (bestCandidate) {
      resolvedBoundaries.push({
        previousEnd: bestCandidate.previousEnd,
        nextStart: bestCandidate.nextStart,
      });
      snappedBoundaryCount += 1;
      if (bestCandidate.hasSilentGap) silentGapCount += 1;
      return;
    }

    const fallbackBoundary = roundMillis(
      Math.min(latestNextStart, Math.max(earliestEnd, originalBoundary))
    );
    resolvedBoundaries.push({
      previousEnd: fallbackBoundary,
      nextStart: fallbackBoundary,
    });
  });

  return {
    plan: plan.map((item, index) => ({
      ...item,
      startTime: index === 0 ? timelineStart : resolvedBoundaries[index - 1].nextStart,
      endTime: index === plan.length - 1 ? timelineEnd : resolvedBoundaries[index].previousEnd,
    })),
    snappedBoundaryCount,
    silentGapCount,
  };
}
