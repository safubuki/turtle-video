/**
 * @file exportAdaptiveQuantizer.ts (standard flavor)
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description WebCodecs `bitrateMode: 'quantizer'` 使用時の適応 QP（量子化パラメータ）制御。
 *
 * Windows Media Foundation のハードウェア H.264 エンコーダは、CBR/VBR モードで
 * キーフレームやフェード開始の大きなフレームを符号化した直後に QP を最大値 51 へ急騰させ、
 * 1 コマに 1 ずつしか下げないため、フェードやカット切り替え直後に強いブロックノイズが出る。
 *
 * `bitrateMode: 'quantizer'` を使うとハードウェアの高速性を保ったまま QP をアプリ側から
 * 安定制御できる。一方、固定 QP のままだと 1080p の激しいノイズ映像等でファイルサイズが
 * 100 Mbps 超まで膨らみ得るため、直近の出力チャンクサイズを見て緩やかに QP を調整し、
 *
 * - 通常映像・フェード・ディゾルブ・カット直後は QP 22〜26 の高画質を維持し、
 * - 異常な高ビットレートが続くときだけ QP を上げて上限（既定 34）で頭打ちにする
 *
 * ことで、「ブロックノイズが出ない」と「ファイルサイズが暴走しない」を両立する。
 */

/** H.264 仕様の QP 範囲（0=最高画質〜51=最低画質） */
const H264_QP_MIN_VALID = 0;
const H264_QP_MAX_VALID = 51;

/** 既定の基準 QP（720p 実写で約 5〜6 Mbps、1080p で約 8〜9 Mbps の高画質） */
export const EXPORT_QUANTIZER_BASE_QP = 24;
/** 画質側の下限 QP（これ以下はサイズ増の割に視覚差が小さい） */
export const EXPORT_QUANTIZER_MIN_QP = 22;
/** 圧縮側の上限 QP（34 以下に抑えることでブロックノイズの爆発を構造的に防ぐ） */
export const EXPORT_QUANTIZER_MAX_QP = 34;
/** キーフレーム単体の控えめな QP オフセット（I フレームの過度な肥大化を抑える） */
export const EXPORT_QUANTIZER_KEYFRAME_OFFSET = 2;

/** キーフレーム 1 発のサイズがこの倍率を超えてもウィンドウ平均を過度に押し上げない */
const KEYFRAME_CONTRIBUTION_CAP_MULTIPLIER = 2.5;
/** 極端な超過（1080p 高周波ノイズ等）を早期検知する倍率しきい値 */
const FAST_GUARD_RATIO = 2.5;
/** 通常の上昇しきい値（目標ビットレートの 125% 超が続くとき） */
const RAISE_QP_RATIO = 1.25;
/** 通常の回復しきい値（目標ビットレートの 80% 未満が続くとき） */
const LOWER_QP_RATIO = 0.8;
/** 通常調整を行う最短間隔（フレーム数） */
const NORMAL_ADJUST_INTERVAL_FRAMES = 3;
/** 早期暴走ガードが働き始める最小観測チャンク数 */
const MIN_CHUNKS_FOR_FAST_GUARD = 4;
/** 通常の上昇判定を始める最小観測チャンク数 */
const MIN_CHUNKS_FOR_RAISE = 8;
/** 下限側への回復判定を始める最小観測チャンク数 */
const MIN_CHUNKS_FOR_LOWER = 15;

export interface ExportAdaptiveQuantizerParams {
  /** 目標ビットレート（bps）。例: 720p=10_000_000、1080p=12_000_000 */
  targetBitrate: number;
  /** フレームレート（fps）。例: 30 */
  fps: number;
  /** 初期 QP（既定 24） */
  baseQp?: number;
  /** 下限 QP（既定 22） */
  minQp?: number;
  /** 上限 QP（既定 34） */
  maxQp?: number;
  /** キーフレーム時の加算 QP（既定 +2、maxQp でクランプ） */
  keyframeQpOffset?: number;
}

export interface ExportAdaptiveQuantizerStats {
  minIssuedQp: number | null;
  maxIssuedQp: number | null;
  lastIssuedQp: number | null;
  currentBaseQp: number;
  observedChunks: number;
  adjustCount: number;
}

export interface ExportAdaptiveQuantizer {
  /** 次に encode() するフレームへ渡す H.264 quantizer 整数値（0..51）を返す */
  getQuantizerForFrame: (isKeyFrame: boolean) => number;
  /** VideoEncoder の output コールバックで得たチャンクサイズをフィードバックする */
  onEncodedChunk: (byteLength: number, isKeyFrame: boolean) => void;
  /** 診断ログ用の統計スナップショットを返す */
  getStats: () => ExportAdaptiveQuantizerStats;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampFloat(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * `bitrateMode: 'quantizer'` 向けの適応 QP コントローラを生成する。
 */
export function createExportAdaptiveQuantizer(
  params: ExportAdaptiveQuantizerParams
): ExportAdaptiveQuantizer {
  const minQp = clampInt(
    params.minQp ?? EXPORT_QUANTIZER_MIN_QP,
    H264_QP_MIN_VALID,
    H264_QP_MAX_VALID
  );
  const maxQp = clampInt(
    Math.max(minQp, params.maxQp ?? EXPORT_QUANTIZER_MAX_QP),
    minQp,
    H264_QP_MAX_VALID
  );
  const baseQp = clampInt(params.baseQp ?? EXPORT_QUANTIZER_BASE_QP, minQp, maxQp);
  const keyframeQpOffset = clampInt(
    params.keyframeQpOffset ?? EXPORT_QUANTIZER_KEYFRAME_OFFSET,
    0,
    12
  );

  const validRate =
    Number.isFinite(params.targetBitrate) &&
    params.targetBitrate > 0 &&
    Number.isFinite(params.fps) &&
    params.fps > 0;
  const safeFps = validRate ? params.fps : 30;
  const targetBytesPerFrame = validRate ? params.targetBitrate / 8 / safeFps : 0;
  const windowSize = Math.max(MIN_CHUNKS_FOR_LOWER, Math.round(safeFps));

  const recentBytes: number[] = [];
  let recentBytesSum = 0;
  let smoothedQp = baseQp;
  let framesSinceAdjust = 0;
  let observedChunks = 0;
  let adjustCount = 0;
  let minIssuedQp: number | null = null;
  let maxIssuedQp: number | null = null;
  let lastIssuedQp: number | null = null;

  const onEncodedChunk = (byteLength: number, isKeyFrame: boolean): void => {
    if (!validRate || !Number.isFinite(byteLength) || byteLength < 0) {
      return;
    }

    observedChunks += 1;
    // I フレーム単発のサイズで直後の P フレーム QP が跳ね上がらないよう寄与をキャップする。
    const effectiveBytes = isKeyFrame
      ? Math.min(byteLength, targetBytesPerFrame * KEYFRAME_CONTRIBUTION_CAP_MULTIPLIER)
      : byteLength;

    recentBytes.push(effectiveBytes);
    recentBytesSum += effectiveBytes;
    if (recentBytes.length > windowSize) {
      const removed = recentBytes.shift() ?? 0;
      recentBytesSum -= removed;
    }

    framesSinceAdjust += 1;
    const avgBytes = recentBytesSum / recentBytes.length;
    const ratio = avgBytes / targetBytesPerFrame;

    // 極端な超高複雑度映像（1080p の激しいグレイン等）は早期に QP を上げて暴走を抑える。
    if (recentBytes.length >= MIN_CHUNKS_FOR_FAST_GUARD && ratio > FAST_GUARD_RATIO) {
      const next = clampFloat(smoothedQp + 1.0, minQp, maxQp);
      if (next !== smoothedQp) {
        smoothedQp = next;
        adjustCount += 1;
      }
      framesSinceAdjust = 0;
      return;
    }

    if (framesSinceAdjust < NORMAL_ADJUST_INTERVAL_FRAMES) {
      return;
    }

    let next = smoothedQp;
    if (recentBytes.length >= MIN_CHUNKS_FOR_RAISE && ratio > RAISE_QP_RATIO) {
      next = clampFloat(smoothedQp + 0.5, minQp, maxQp);
    } else if (recentBytes.length >= MIN_CHUNKS_FOR_LOWER && ratio < LOWER_QP_RATIO) {
      next = clampFloat(smoothedQp - 0.5, minQp, maxQp);
    }

    if (next !== smoothedQp) {
      smoothedQp = next;
      adjustCount += 1;
    }
    framesSinceAdjust = 0;
  };

  const getQuantizerForFrame = (isKeyFrame: boolean): number => {
    const raw = Math.round(smoothedQp) + (isKeyFrame ? keyframeQpOffset : 0);
    const qp = clampInt(raw, minQp, maxQp);
    lastIssuedQp = qp;
    minIssuedQp = minIssuedQp === null ? qp : Math.min(minIssuedQp, qp);
    maxIssuedQp = maxIssuedQp === null ? qp : Math.max(maxIssuedQp, qp);
    return qp;
  };

  const getStats = (): ExportAdaptiveQuantizerStats => ({
    minIssuedQp,
    maxIssuedQp,
    lastIssuedQp,
    currentBaseQp: Number(smoothedQp.toFixed(2)),
    observedChunks,
    adjustCount,
  });

  return {
    getQuantizerForFrame,
    onEncodedChunk,
    getStats,
  };
}
