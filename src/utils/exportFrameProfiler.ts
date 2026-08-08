/**
 * @file exportFrameProfiler.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description エクスポート 1 フレームぶんの処理時間を区間ごとに計測する純ロジック。
 *
 * 【なぜ必要か】
 * 「プレビューは滑らかなのにエクスポートだけ 20fps へ落ちる」原因が未特定のまま
 * 対症療法を 3 回試して失敗した（壁時計減速 / フレーム駆動化 / 描画直後シンク）。
 * 既存ログは `likelyCause: 'unknown-main-thread-or-render'` としか出せず、
 * rAF 1 回の中で**どこに時間が消えているか**が分からないことがボトルネックだった。
 *
 * ここでは 1 フレームを次の区間へ分けて実測し、集計する:
 *   - draw   : Canvas への描画（renderFrame）
 *   - encode : VideoFrame 生成 + VideoEncoder.encode
 *   - other  : それ以外（rAF 間の待ち、GC、他タスク）
 *
 * これにより「描画が重い」のか「エンコードが詰まっている」のか
 * 「そもそも rAF が呼ばれていない」のかを数字で切り分けられる。
 * 計測は加算とカウントだけなので、計測自体のコストは無視できる。
 */

/** 1 フレーム内の計測区間 */
export type ExportFramePhase = 'draw' | 'encode';

export interface ExportPhaseStats {
  /** 呼ばれた回数 */
  count: number;
  /** 合計時間（ms） */
  totalMs: number;
  /** 最大時間（ms） */
  maxMs: number;
}

export interface ExportFrameProfileSummary {
  draw: ExportPhaseStats;
  encode: ExportPhaseStats;
  /** rAF 間隔の統計（フレームがどれだけの間隔で回ったか） */
  tickGap: ExportPhaseStats;
  /** 計測全体の実時間（ms） */
  elapsedMs: number;
  /** draw が実時間に占める割合（0〜1） */
  drawRatio: number;
  /** encode が実時間に占める割合（0〜1） */
  encodeRatio: number;
  /**
   * draw でも encode でもない時間の割合（0〜1）。
   * ここが大きい場合、ボトルネックは描画・エンコードではなく
   * 「rAF が呼ばれていない」＝ブラウザ側の事情（他タスク・GC・スロットリング）。
   */
  otherRatio: number;
  /** 実測の平均フレームレート（tickGap から算出） */
  effectiveFps: number;
  /** 人が読める要約 */
  summary: string;
}

export interface ExportFrameProfiler {
  /** 区間の開始を記録する。戻り値を呼ぶと終了として集計される。 */
  begin(phase: ExportFramePhase): () => void;
  /** rAF が 1 回回ったことを記録する（間隔の統計に使う） */
  noteTick(nowMs: number): void;
  /** 集計結果を返す */
  summarize(nowMs: number): ExportFrameProfileSummary;
  reset(nowMs: number): void;
}

function emptyStats(): ExportPhaseStats {
  return { count: 0, totalMs: 0, maxMs: 0 };
}

function addSample(stats: ExportPhaseStats, ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  stats.count += 1;
  stats.totalMs += ms;
  if (ms > stats.maxMs) stats.maxMs = ms;
}

/**
 * プロファイラを作る。
 *
 * @param now - 現在時刻（ms）を返す関数。テストから差し替えられるようにする。
 */
export function createExportFrameProfiler(
  now: () => number = () => performance.now(),
): ExportFrameProfiler {
  const draw = emptyStats();
  const encode = emptyStats();
  const tickGap = emptyStats();
  let startedAtMs = now();
  let lastTickMs: number | null = null;

  return {
    begin(phase: ExportFramePhase): () => void {
      const startMs = now();
      const target = phase === 'draw' ? draw : encode;
      return () => addSample(target, now() - startMs);
    },
    noteTick(nowMs: number): void {
      if (lastTickMs !== null) {
        addSample(tickGap, nowMs - lastTickMs);
      }
      lastTickMs = nowMs;
    },
    summarize(nowMs: number): ExportFrameProfileSummary {
      const elapsedMs = Math.max(0, nowMs - startedAtMs);
      const drawRatio = elapsedMs > 0 ? draw.totalMs / elapsedMs : 0;
      const encodeRatio = elapsedMs > 0 ? encode.totalMs / elapsedMs : 0;
      const otherRatio = Math.max(0, 1 - drawRatio - encodeRatio);
      const avgGapMs = tickGap.count > 0 ? tickGap.totalMs / tickGap.count : 0;
      const effectiveFps = avgGapMs > 0 ? 1000 / avgGapMs : 0;

      const summary =
        `実効 ${effectiveFps.toFixed(1)}fps`
        + ` / 描画 ${(drawRatio * 100).toFixed(1)}%(平均${safeAvg(draw).toFixed(1)}ms 最大${draw.maxMs.toFixed(1)}ms)`
        + ` / エンコード ${(encodeRatio * 100).toFixed(1)}%(平均${safeAvg(encode).toFixed(1)}ms 最大${encode.maxMs.toFixed(1)}ms)`
        + ` / その他 ${(otherRatio * 100).toFixed(1)}%`
        + ` / rAF間隔 平均${avgGapMs.toFixed(1)}ms 最大${tickGap.maxMs.toFixed(1)}ms`;

      return {
        draw: { ...draw },
        encode: { ...encode },
        tickGap: { ...tickGap },
        elapsedMs,
        drawRatio,
        encodeRatio,
        otherRatio,
        effectiveFps,
        summary,
      };
    },
    reset(nowMs: number): void {
      draw.count = 0; draw.totalMs = 0; draw.maxMs = 0;
      encode.count = 0; encode.totalMs = 0; encode.maxMs = 0;
      tickGap.count = 0; tickGap.totalMs = 0; tickGap.maxMs = 0;
      startedAtMs = nowMs;
      lastTickMs = null;
    },
  };
}

function safeAvg(stats: ExportPhaseStats): number {
  return stats.count > 0 ? stats.totalMs / stats.count : 0;
}

/**
 * 計測結果からボトルネックを判定する。
 *
 * @param summary - 集計結果
 * @param targetFps - 目標 fps
 */
export type ExportBottleneck =
  /** 目標 fps を維持できている */
  | 'healthy'
  /** Canvas 描画が支配的 */
  | 'draw-bound'
  /** VideoEncoder への投入が支配的 */
  | 'encode-bound'
  /** 描画もエンコードも軽いのに rAF が回っていない（ブラウザ側の事情） */
  | 'raf-starved';

export function classifyExportBottleneck(
  summary: ExportFrameProfileSummary,
  targetFps: number,
): ExportBottleneck {
  const safeTarget = Number.isFinite(targetFps) && targetFps > 0 ? targetFps : 30;
  // 目標の 9 割以上出ていれば健全とみなす
  if (summary.effectiveFps >= safeTarget * 0.9) return 'healthy';

  if (summary.drawRatio >= 0.5) return 'draw-bound';
  if (summary.encodeRatio >= 0.5) return 'encode-bound';
  return 'raf-starved';
}
