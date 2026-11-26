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
/** 読点などのよい区切りのためなら、上限をこの割合まで超えてよい */
const SOFT_OVERFLOW_RATIO = 1.15;
const STRONG_BREAK = /[。！？!?]/u;
const CAPTION_PUNCTUATION = /[。、，,！？!?]/gu;
/** 表示文字数に数えない（キャプション本文から消える）文字 */
const INVISIBLE_IN_CAPTION = /[。、，,！？!?\s]/u;

// ---- 区切り位置の評価（AI を使わない決定的なルール） ----
// 1. ブラウザ標準の Intl.Segmenter（ICU の日本語辞書）で単語に分ける。
// 2. 単語を「文節」（自立語＋後ろに付く助詞・助動詞）へまとめ、区切ってよいのは文節の境目だけにする。
// 3. 境目ごとに読みやすさのコストを付け（読点の後が最良、「の」の後や単語の途中は悪い）、
//    1 文全体でコスト最小・長さが均等になる分け方を動的計画法で選ぶ。
const HIRAGANA = /\p{Script=Hiragana}/u;
const OPEN_BRACKET = /[「『（(【〔［[〈《“‘]/u;
const CLOSE_BRACKET = /[」』）)】〕］\]〉》”’]/u;
/** 行頭に来てはいけない文字（この直前では区切らない） */
const NO_LINE_START = /[ー～々ゝゞぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ」』）)】〕］\]〉》”’、。，,．.！？!?：:；;・％%]/u;
const SOFT_PUNCTUATION = /[、，,：:；;]/u;
const DIGIT = /[0-9０-９]/u;
/** 文節の後ろに付き、そこで区切ると自然な語（語の後で区切る） */
const CLAUSE_ENDING_PARTICLES = new Set([
  // 「し」は「アップ｜し｜ます」の動詞と区別できないので含めない
  'から', 'ので', 'のに', 'けど', 'けれど', 'けれども', 'ながら', 'ば', 'たら', 'なら', 'ても', 'でも', 'つつ',
]);
const CASE_PARTICLES = new Set([
  'は', 'が', 'を', 'に', 'へ', 'と', 'も', 'や', 'で', 'て', 'まで', 'より', 'など', 'だけ', 'しか', 'には', 'では',
  'とは', 'にも', 'とも', 'へは', 'への', 'との', 'での', 'からは', 'までに', 'ばかり', 'ほど', 'くらい', 'ぐらい', 'こそ', 'さえ',
]);

/** 前の語に付く助動詞・終助詞（この直前では区切らない） */
const ATTACHING_AUXILIARIES = new Set([
  'だ', 'です', 'でした', 'でしょう', 'ます', 'ました', 'ません', 'ませ', 'まし', 'た', 'ない', 'なかった', 'な', 'ね', 'よ', 'か', 'わ', 'ぞ',
  'れる', 'られる', 'せる', 'させる', 'たい', 'らしい', 'そう', 'よう',
]);

const BREAK_COST = {
  punctuation: 0,
  space: 1,
  clauseParticle: 1,
  caseParticle: 2,
  afterQuote: 2,
  contentBoundary: 4,
  noParticle: 5,
  wordBoundary: 9,
  insideWord: 16,
  insideQuotePenalty: 3,
  forbidden: 1000,
} as const;

const toGraphemes = (value: string): string[] => Array.from(value);

export function normalizeNarrationCaptionText(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

function stripCaptionPunctuation(text: string): string {
  return text.replace(CAPTION_PUNCTUATION, '').replace(/\s+/gu, ' ').trim();
}

function splitByStrongBreaks(graphemes: string[]): string[] {
  const segments: string[] = [];
  let start = 0;
  let bracketDepth = 0;
  for (let i = 0; i < graphemes.length; i++) {
    if (OPEN_BRACKET.test(graphemes[i])) bracketDepth += 1;
    if (CLOSE_BRACKET.test(graphemes[i])) bracketDepth = Math.max(0, bracketDepth - 1);
    // カギ括弧の中の句点（「行きます。」と言った）は文の終わりではない
    if (!STRONG_BREAK.test(graphemes[i]) || bracketDepth > 0) continue;
    // 句点の直後にある閉じ括弧・連続する句点は同じ文へ含める
    let end = i + 1;
    while (end < graphemes.length && (CLOSE_BRACKET.test(graphemes[end]) || STRONG_BREAK.test(graphemes[end]))) {
      end += 1;
    }
    const segment = graphemes.slice(start, end).join('').trim();
    if (segment) segments.push(segment);
    start = end;
    i = end - 1;
  }
  const tail = graphemes.slice(start).join('').trim();
  if (tail) segments.push(tail);
  return segments;
}

interface CaptionWord {
  /** 単語の先頭（コードポイント単位の位置） */
  start: number;
  /** 単語の終わり（排他） */
  end: number;
  text: string;
}

type WordSegmenter = (text: string) => Array<{ index: number; segment: string }>;

let cachedSegmenter: WordSegmenter | null | undefined;

/** ICU の日本語辞書による単語分割（使えない環境では null） */
function getJapaneseWordSegmenter(): WordSegmenter | null {
  if (cachedSegmenter !== undefined) return cachedSegmenter;
  try {
    const SegmenterCtor = (Intl as unknown as {
      Segmenter?: new (locale: string, options: { granularity: 'word' }) => {
        segment: (input: string) => Iterable<{ index: number; segment: string }>;
      };
    }).Segmenter;
    if (typeof SegmenterCtor !== 'function') {
      cachedSegmenter = null;
      return null;
    }
    const segmenter = new SegmenterCtor('ja', { granularity: 'word' });
    cachedSegmenter = (text: string) => Array.from(segmenter.segment(text));
  } catch {
    cachedSegmenter = null;
  }
  return cachedSegmenter;
}

/** テスト用: 単語分割の実装を差し替える（null で Intl.Segmenter が無い環境を再現） */
export function __setNarrationCaptionWordSegmenterForTest(segmenter: WordSegmenter | null | undefined): void {
  cachedSegmenter = segmenter;
}

const scriptClassOf = (char: string): string => {
  if (HIRAGANA.test(char)) return 'hiragana';
  if (/[\p{Script=Katakana}ー]/u.test(char)) return 'katakana';
  if (/\p{Script=Han}|[々〆]/u.test(char)) return 'kanji';
  if (/[A-Za-z0-9０-９Ａ-Ｚａ-ｚ]/u.test(char)) return 'alnum';
  return `other:${char}`;
};

function splitIntoWords(graphemes: string[]): CaptionWord[] {
  const text = graphemes.join('');
  const segmenter = getJapaneseWordSegmenter();
  if (segmenter) {
    // Intl.Segmenter の index は UTF-16 単位。コードポイント位置へ換算する。
    const codeUnitToPoint = new Map<number, number>();
    let unit = 0;
    graphemes.forEach((char, point) => {
      codeUnitToPoint.set(unit, point);
      unit += char.length;
    });
    codeUnitToPoint.set(unit, graphemes.length);
    const segments = segmenter(text);
    const words: CaptionWord[] = [];
    for (const segment of segments) {
      const start = codeUnitToPoint.get(segment.index);
      const end = codeUnitToPoint.get(segment.index + segment.segment.length);
      if (start === undefined || end === undefined || end <= start) continue;
      words.push({ start, end, text: segment.segment });
    }
    if (words.length > 0 && words[words.length - 1].end === graphemes.length) return words;
  }

  // フォールバック: 文字種（ひらがな・カタカナ・漢字・英数字）の連続を 1 語とみなす
  const words: CaptionWord[] = [];
  let start = 0;
  for (let i = 1; i <= graphemes.length; i++) {
    if (i < graphemes.length && scriptClassOf(graphemes[i]) === scriptClassOf(graphemes[i - 1])
      && !scriptClassOf(graphemes[i]).startsWith('other:')) {
      continue;
    }
    words.push({ start, end: i, text: graphemes.slice(start, i).join('') });
    start = i;
  }
  return words;
}

/** ひらがなだけの語の末尾が助詞なら、その助詞（なければ null） */
function trailingParticleOf(word: string): { particle: string; isClause: boolean } | null {
  if (!word || !Array.from(word).every((char) => HIRAGANA.test(char))) return null;
  if (CLAUSE_ENDING_PARTICLES.has(word)) return { particle: word, isClause: true };
  if (CASE_PARTICLES.has(word)) return { particle: word, isClause: false };
  if (word === 'の') return { particle: word, isClause: false };
  return null;
}

/**
 * 各位置（graphemes[p] の直前）で区切ったときのコストを返す。index 0 と末尾は使わない。
 */
function computeBreakCosts(graphemes: string[]): number[] {
  const costs = new Array<number>(graphemes.length + 1).fill(BREAK_COST.insideWord);
  const words = splitIntoWords(graphemes);

  // 単語の境目に、文節・助詞の種類に応じたコストを付ける
  for (let w = 0; w < words.length - 1; w++) {
    const prev = words[w];
    const next = words[w + 1];
    const position = prev.end;
    const prevLast = graphemes[prev.end - 1];
    const nextFirst = graphemes[next.start];
    const prevIsAllHiragana = Array.from(prev.text).every((char) => HIRAGANA.test(char));
    const nextStartsHiragana = HIRAGANA.test(nextFirst);
    const particle = trailingParticleOf(prev.text);

    // 次の語が助詞・助動詞なら前の語に付く（「だけ｜の」「省け｜て」「動画｜です」では区切らない）
    const nextAttachesToPrevious = trailingParticleOf(next.text) !== null
      || ATTACHING_AUXILIARIES.has(next.text);

    let cost: number = BREAK_COST.wordBoundary;
    if (nextAttachesToPrevious && !SOFT_PUNCTUATION.test(prevLast) && !/\s/u.test(prevLast)) {
      cost = BREAK_COST.insideWord;
    } else if (SOFT_PUNCTUATION.test(prevLast)) {
      cost = BREAK_COST.punctuation;
    } else if (/\s/u.test(prevLast)) {
      cost = BREAK_COST.space;
    } else if (CLOSE_BRACKET.test(prevLast) && !nextStartsHiragana) {
      cost = BREAK_COST.afterQuote;
    } else if (particle && particle.particle === 'の') {
      // 「東京の｜大学」は意味が切れやすいので、他に候補がなければ使う
      cost = nextStartsHiragana ? BREAK_COST.wordBoundary : BREAK_COST.noParticle;
    } else if (particle && (particle.particle === 'て' || particle.particle === 'で')) {
      // 「〜して｜確認する」は区切れるが、「〜して｜いる」「〜して｜きました」は 1 つの述語
      cost = nextStartsHiragana ? BREAK_COST.wordBoundary : BREAK_COST.caseParticle;
    } else if (particle) {
      cost = particle.isClause ? BREAK_COST.clauseParticle : BREAK_COST.caseParticle;
    } else if (!nextStartsHiragana && HIRAGANA.test(prevLast)) {
      // ひらがなで終わる語（送り仮名・ひらがなの自立語）の後に漢字・カタカナの語が来る：文節の境目らしい。
      // ただし「押し｜続ける」のような複合語の可能性があるので助詞の後より悪くする
      cost = prevIsAllHiragana ? BREAK_COST.contentBoundary : BREAK_COST.contentBoundary + 1;
    }
    costs[position] = Math.min(costs[position], cost);
  }

  // 禁則と括弧内・数字の扱い
  let quoteDepth = 0;
  for (let p = 1; p < graphemes.length; p++) {
    const prevChar = graphemes[p - 1];
    if (OPEN_BRACKET.test(prevChar)) quoteDepth += 1;
    if (CLOSE_BRACKET.test(prevChar)) quoteDepth = Math.max(0, quoteDepth - 1);
    const nextChar = graphemes[p];
    if (NO_LINE_START.test(nextChar) || OPEN_BRACKET.test(prevChar) || /\s/u.test(nextChar)) {
      costs[p] = BREAK_COST.forbidden;
      continue;
    }
    if (DIGIT.test(prevChar) && (DIGIT.test(nextChar) || /[.．,，]/u.test(nextChar))) {
      costs[p] = BREAK_COST.forbidden;
      continue;
    }
    if (DIGIT.test(prevChar)) {
      // 「10｜年」「3｜つ」のような数字と単位の間は単語の途中と同じ扱い
      costs[p] = Math.max(costs[p], BREAK_COST.insideWord);
    }
    if (quoteDepth > 0) costs[p] += BREAK_COST.insideQuotePenalty;
  }
  return costs;
}

/**
 * 1 文を、画面に収まり、意味の切れ目で区切られ、長さがなるべく均等な複数行へ分ける。
 * 区切り位置のコスト＋長さのはみ出し・短すぎ・偏りのペナルティが最小になる分け方を、
 * 行数を何通りか試して動的計画法で選ぶ。
 */
function wrapLongSegment(text: string, maxLength: number): string[] {
  const graphemes = toGraphemes(text);
  const visiblePrefix = [0];
  for (const char of graphemes) {
    visiblePrefix.push(visiblePrefix[visiblePrefix.length - 1] + (INVISIBLE_IN_CAPTION.test(char) ? 0 : 1));
  }
  const n = graphemes.length;
  const totalVisible = visiblePrefix[n];
  if (totalVisible <= maxLength) return text ? [text] : [];

  const breakCosts = computeBreakCosts(graphemes);
  const hardMax = Math.max(maxLength, Math.ceil(maxLength * SOFT_OVERFLOW_RATIO));
  const minComfortable = Math.max(3, Math.round(maxLength * 0.3));
  const minLines = Math.ceil(totalVisible / maxLength);

  let best: { cost: number; breaks: number[] } | null = null;
  for (let lines = minLines; lines <= minLines + 2; lines++) {
    const target = totalVisible / lines;
    const segmentCost = (from: number, to: number): number => {
      const length = visiblePrefix[to] - visiblePrefix[from];
      if (length <= 0 || length > hardMax) return Number.POSITIVE_INFINITY;
      let cost = (length - target) ** 2 * 0.03;
      if (length > maxLength) cost += (length - maxLength) * 2;
      if (length < minComfortable) cost += (minComfortable - length) * 3;
      return cost;
    };
    // dp[j][p]: 先頭から p までを j 行で分けたときの最小コスト
    const dp: number[][] = Array.from({ length: lines + 1 }, () => new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY));
    const from: number[][] = Array.from({ length: lines + 1 }, () => new Array<number>(n + 1).fill(-1));
    dp[0][0] = 0;
    for (let j = 1; j <= lines; j++) {
      for (let p = 1; p <= n; p++) {
        if (j < lines && p === n) continue;
        const endCost = p === n ? 0 : breakCosts[p];
        if (!Number.isFinite(endCost)) continue;
        for (let a = j - 1; a < p; a++) {
          const prevCost = dp[j - 1][a];
          if (!Number.isFinite(prevCost)) continue;
          const cost = prevCost + segmentCost(a, p) + endCost;
          if (cost < dp[j][p]) {
            dp[j][p] = cost;
            from[j][p] = a;
          }
        }
      }
    }
    const total = dp[lines][n] + (lines - minLines) * 4;
    if (!Number.isFinite(total) || (best && total >= best.cost)) continue;
    const breaks: number[] = [];
    let position = n;
    for (let j = lines; j > 0; j--) {
      breaks.unshift(position);
      position = from[j][position];
    }
    best = { cost: total, breaks };
  }

  if (!best) {
    // 収まる分け方が無い（極端に長い英単語など）。上限ごとに機械的に切る
    const segments: string[] = [];
    for (let i = 0; i < n; i += maxLength) segments.push(graphemes.slice(i, i + maxLength).join('').trim());
    return segments.filter(Boolean);
  }

  const segments: string[] = [];
  let start = 0;
  for (const end of best.breaks) {
    const segment = graphemes.slice(start, end).join('').trim();
    if (segment) segments.push(segment);
    start = end;
  }
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
