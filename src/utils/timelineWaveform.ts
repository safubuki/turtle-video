/**
 * @file timelineWaveform.ts
 * @author Turtle Village
 * @description プレビューのシークバー直下に出す「プロジェクト全体の音量波形」と
 * 「タイムライン座標の無音区間」を求める純ロジック（Issue #217）。
 *
 * ここは再生・デコード・DOM に依存しない純関数だけを置く（テスト容易性のため）。
 * 呼び出し側（useTimelineWaveform）が各音声クリップをデコードしてモノラル PCM にし、
 * 「タイムライン上のどこに、音源のどこからどこまでを、どの音量で置くか」を
 * TimelinePlacement として渡す。本モジュールはそれを 1 本のタイムライン波形へ合成する。
 *
 * 無音判定は既存のナレーション時分割と同じ detectSilenceSplitPoints を再利用し、
 * 機能ごとに判定が食い違わないようにする（Issue #217 の要件）。
 * 合成後 PCM をそのまま detectSilenceSplitPoints へ渡すため、しきい値・最小継続時間の
 * 既定値も時分割と共通になる。
 */
import {
  computeWaveformPeaks,
  detectSilenceSplitPoints,
  type MonoPcm,
  type SilenceDetectionOptions,
} from './audioWaveform';

/** 波形合成に使う内部サンプリングレート（Hz）。
 * 表示と無音検出にしか使わないので低めで十分（長尺でもメモリを食わない）。
 * 8kHz なら 10 分の動画でも 480,000 サンプル ≒ 1.9MB（Float32）で収まる。 */
export const TIMELINE_WAVEFORM_SAMPLE_RATE = 8000;

/** 波形の対象音源。UI の「無音検出の対象」選択とも対応する。 */
export type WaveformSourceKind = 'narration' | 'bgm' | 'video';

/** 無音検出の対象選択（Issue #217）。'all' は合成後の全体音声。 */
export type SilenceSourceTarget = WaveformSourceKind | 'all';

/**
 * 1 つの音声クリップをタイムライン上へ配置するための情報。
 * 値は「有効な再生区間」（EffectiveAudioClipPlayback 相当）を渡す前提で、
 * 本モジュールは受け取った範囲をそのまま貼り付ける（尺クランプの解釈はしない）。
 */
export interface TimelinePlacement {
  /** クリップ識別子（デバッグ・キャッシュ用） */
  id: string;
  /** 音源の種類（無音検出の対象フィルタに使う） */
  kind: WaveformSourceKind;
  /** デコード済みモノラル PCM（音源全体） */
  pcm: MonoPcm;
  /** タイムライン上の開始時刻（秒） */
  timelineStart: number;
  /** 音源内の再生開始位置（秒） */
  sourceStart: number;
  /** 音源内の再生終了位置（秒）。sourceStart 以下なら無視される */
  sourceEnd: number;
  /** 音量倍率（0〜1 目安）。ミュートは 0 を渡す */
  volume: number;
  /** フェードイン時間（秒）。0 以下ならフェードなし */
  fadeInSec?: number;
  /** フェードアウト時間（秒）。0 以下ならフェードなし */
  fadeOutSec?: number;
}

export interface TimelineSilenceRegion {
  /** 無音区間の開始時刻（タイムライン秒） */
  silenceStart: number;
  /** 無音区間の終了時刻（タイムライン秒） */
  silenceEnd: number;
  /** 無音区間の長さ（秒） */
  duration: number;
  /** 無音区間の中心時刻（秒）。既存の分割候補と同じ意味 */
  center: number;
}

export interface TimelineWaveformResult {
  /** 描画用ピーク（バケット単位の最大絶対振幅）。長さは bucketCount */
  peaks: Float32Array;
  /** 無音区間（タイムライン座標・時刻昇順） */
  silences: TimelineSilenceRegion[];
  /** 無音検出に実際に使われた対象 */
  silenceSource: SilenceSourceTarget;
  /** 波形の基準にしたタイムライン長（秒） */
  duration: number;
}

/**
 * 配置情報からタイムライン全長のモノラル PCM を合成する。
 *
 * 各クリップの [sourceStart, sourceEnd) を timelineStart 起点へ線形リサンプリングしながら
 * 加算合成し、volume とフェードを掛ける。重なりは単純加算（実際のミキサーと同じ規約）。
 *
 * @param placements - 配置するクリップ（空なら無音バッファ）
 * @param totalDuration - タイムライン全長（秒）
 * @param sampleRate - 合成に使うサンプリングレート（Hz）
 * @returns 合成済みモノラル PCM（長さ = totalDuration × sampleRate）
 */
export function composeTimelinePcm(
  placements: TimelinePlacement[],
  totalDuration: number,
  sampleRate: number = TIMELINE_WAVEFORM_SAMPLE_RATE,
): MonoPcm {
  const safeRate = sampleRate > 0 ? Math.floor(sampleRate) : TIMELINE_WAVEFORM_SAMPLE_RATE;
  const safeDuration = Number.isFinite(totalDuration) ? Math.max(0, totalDuration) : 0;
  const totalSamples = Math.max(0, Math.round(safeDuration * safeRate));
  const mixed = new Float32Array(totalSamples);
  if (totalSamples === 0) return { samples: mixed, sampleRate: safeRate };

  for (const placement of placements) {
    const { pcm, volume } = placement;
    if (!(volume > 0)) continue;

    const srcSamples = pcm.samples;
    const srcRate = pcm.sampleRate;
    if (srcSamples.length === 0 || !(srcRate > 0)) continue;

    const srcDuration = srcSamples.length / srcRate;
    const sourceStart = clamp(placement.sourceStart, 0, srcDuration);
    const sourceEnd = clamp(placement.sourceEnd, sourceStart, srcDuration);
    const playable = sourceEnd - sourceStart;
    if (!(playable > 0)) continue;

    const timelineStart = Math.max(0, placement.timelineStart);
    const writeStart = Math.round(timelineStart * safeRate);
    if (writeStart >= totalSamples) continue;
    const writeEnd = Math.min(totalSamples, writeStart + Math.round(playable * safeRate));
    if (writeEnd <= writeStart) continue;

    const fadeIn = Math.max(0, placement.fadeInSec ?? 0);
    const fadeOut = Math.max(0, placement.fadeOutSec ?? 0);

    for (let i = writeStart; i < writeEnd; i++) {
      // タイムライン位置 → クリップ内の経過秒 → 音源内の絶対秒
      const elapsed = (i - writeStart) / safeRate;
      const srcIndex = Math.floor((sourceStart + elapsed) * srcRate);
      if (srcIndex < 0 || srcIndex >= srcSamples.length) continue;

      let gain = volume;
      if (fadeIn > 0 && elapsed < fadeIn) {
        gain *= elapsed / fadeIn;
      }
      const remaining = playable - elapsed;
      if (fadeOut > 0 && remaining < fadeOut) {
        gain *= Math.max(0, remaining / fadeOut);
      }

      mixed[i] += srcSamples[srcIndex] * gain;
    }
  }

  return { samples: mixed, sampleRate: safeRate };
}

/**
 * 無音検出対象のフォールバック順（Issue #217）。
 *
 * ナレーションがあればそれを最優先（キャプション編集に使いやすい）。
 * ナレーションが無い動画だけのプロジェクトでは動画音声の「間」を拾う。
 * どちらも無ければ BGM、最後に合成後の全体音声。
 *
 * BGM が常時鳴っていると全体波形ではナレーションの「間」が埋もれるため、
 * 「全体音声」は最後の手段に置く。
 */
export const SILENCE_SOURCE_PRIORITY: readonly SilenceSourceTarget[] = [
  'narration',
  'video',
  'bgm',
  'all',
];

/**
 * 指定対象に配置が無い場合に、実際に使う対象を優先順で決める。
 *
 * @param placements - タイムライン上の全音声配置
 * @param preferred - 希望する対象
 * @returns 実際に使える対象（該当が無ければ 'all'）
 */
export function resolveSilenceSource(
  placements: TimelinePlacement[],
  preferred: SilenceSourceTarget,
): SilenceSourceTarget {
  const hasKind = (kind: SilenceSourceTarget): boolean =>
    kind === 'all' ? placements.length > 0 : placements.some((p) => p.kind === kind);

  if (hasKind(preferred)) return preferred;

  // 希望対象が空なら、優先順の並びで最初に見つかったものを使う。
  const startIndex = SILENCE_SOURCE_PRIORITY.indexOf(preferred);
  const chain =
    startIndex >= 0
      ? SILENCE_SOURCE_PRIORITY.slice(startIndex + 1)
      : SILENCE_SOURCE_PRIORITY;
  for (const kind of chain) {
    if (hasKind(kind)) return kind;
  }
  return 'all';
}

/**
 * タイムライン全体の波形ピークと、指定対象の無音区間を求める。
 *
 * 波形（peaks）は常に全配置の合成（＝最終的に再生される音声）から作る。
 * 無音検出だけは `silenceSource` に一致する配置へ絞り、
 * 対象が空なら SILENCE_SOURCE_PRIORITY の順にフォールバックする。
 *
 * @param placements - タイムライン上の全音声配置
 * @param totalDuration - タイムライン全長（秒）
 * @param options - バケット数・無音検出対象・無音検出パラメータ
 * @returns 描画用ピークと無音区間
 */
export function buildTimelineWaveform(
  placements: TimelinePlacement[],
  totalDuration: number,
  options: {
    bucketCount: number;
    silenceSource?: SilenceSourceTarget;
    sampleRate?: number;
    silenceOptions?: SilenceDetectionOptions;
  },
): TimelineWaveformResult {
  const {
    bucketCount,
    silenceSource = 'narration',
    sampleRate = TIMELINE_WAVEFORM_SAMPLE_RATE,
    silenceOptions,
  } = options;

  const safeDuration = Number.isFinite(totalDuration) ? Math.max(0, totalDuration) : 0;
  const mixedPcm = composeTimelinePcm(placements, safeDuration, sampleRate);
  const peaks = computeWaveformPeaks(mixedPcm, bucketCount);

  const resolvedSource = resolveSilenceSource(placements, silenceSource);
  const silencePcm =
    resolvedSource === 'all'
      ? mixedPcm
      : composeTimelinePcm(
          placements.filter((p) => p.kind === resolvedSource),
          safeDuration,
          sampleRate,
        );

  const silences = detectTimelineSilences(silencePcm, silenceOptions);

  return { peaks, silences, silenceSource: resolvedSource, duration: safeDuration };
}

/**
 * 合成済みタイムライン PCM から無音区間を求める。
 * 既存のナレーション時分割と同じ detectSilenceSplitPoints を使い、判定ルールを共有する。
 *
 * 分割候補は「中心時刻」しか持たないため、ここで silenceStart / silenceEnd を持つ
 * タイムライン座標の区間表現へ変換する。
 *
 * @param pcm - 無音検出対象の合成済み PCM
 * @param options - 無音検出パラメータ（既定値は時分割と共通）
 * @returns 無音区間（時刻昇順）
 */
export function detectTimelineSilences(
  pcm: MonoPcm,
  options?: SilenceDetectionOptions,
): TimelineSilenceRegion[] {
  return detectSilenceSplitPoints(pcm, options).map((point) => ({
    silenceStart: point.start,
    silenceEnd: point.end,
    duration: point.duration,
    center: point.time,
  }));
}

/**
 * 移動先の候補となる時刻の一覧を、時刻昇順・重複なしで返す。
 *
 * 無音区間の開始・終了に加えて、**動画の先頭（0 秒）と末尾**を含める。
 * 先頭は「1 つ目のキャプションをここから始める」ためによく使う位置で、
 * 無音区間として検出されるとは限らないため明示的に候補へ入れる。
 *
 * @param silences - 無音区間
 * @param totalDuration - タイムライン全長（秒）。0 以下なら端は加えない
 * @param epsilon - 同一時刻とみなす許容誤差（秒）
 * @returns 移動候補の時刻（昇順・重複排除済み）
 */
export function collectSeekBoundaries(
  silences: TimelineSilenceRegion[],
  totalDuration: number,
  epsilon: number = 0.05,
): number[] {
  const safeTotal = Number.isFinite(totalDuration) ? Math.max(0, totalDuration) : 0;
  const raw: number[] = [];

  // 動画の先頭・末尾。無音区間が無くても最低限ここへは移動できるようにする。
  if (safeTotal > 0) {
    raw.push(0, safeTotal);
  }
  for (const region of silences) {
    raw.push(region.silenceStart, region.silenceEnd);
  }

  const sorted = raw
    .filter((t) => Number.isFinite(t) && t >= 0 && (safeTotal <= 0 || t <= safeTotal))
    .sort((a, b) => a - b);

  // 近すぎる境界はまとめる（無音区間が端に接しているときの二重候補を避ける）
  const result: number[] = [];
  for (const t of sorted) {
    if (result.length === 0 || t - result[result.length - 1] > epsilon) {
      result.push(t);
    }
  }
  return result;
}

/**
 * 現在位置から見て、指定方向にある最も近い移動候補の時刻を返す。
 * 「無音区間：前へ / 次へ」ボタンの移動先計算に使う。
 *
 * 候補には無音区間の開始・終了に加えて動画の先頭・末尾が含まれる
 * （collectSeekBoundaries を参照）。
 * 同一時刻での足踏みを避けるため、`epsilon` 秒以内の境界は「現在位置と同じ」とみなして飛ばす。
 *
 * @param silences - 無音区間（時刻昇順である必要はない）
 * @param currentTime - 現在の再生位置（秒）
 * @param direction - 'next' なら後ろ方向、'prev' なら前方向
 * @param totalDuration - タイムライン全長（秒）。先頭・末尾を候補へ含めるために使う
 * @param epsilon - 同一とみなす許容誤差（秒）
 * @returns 移動先の時刻（秒）。該当が無ければ null
 */
export function findAdjacentSilenceBoundary(
  silences: TimelineSilenceRegion[],
  currentTime: number,
  direction: 'next' | 'prev',
  totalDuration: number = 0,
  epsilon: number = 0.05,
): number | null {
  const boundaries = collectSeekBoundaries(silences, totalDuration, epsilon);
  if (boundaries.length === 0) return null;

  if (direction === 'next') {
    for (const t of boundaries) {
      if (t > currentTime + epsilon) return t;
    }
    return null;
  }

  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (boundaries[i] < currentTime - epsilon) return boundaries[i];
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
