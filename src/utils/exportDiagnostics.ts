/**
 * @file exportDiagnostics.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description エクスポートで「映像だけが早く終わる／後半が止まる」現象を切り分けるための
 * 計測ロジック（Issue #215 の再発調査）。
 *
 * ここは純ロジックだけを置く（描画・エンコーダー・DOM に依存しない）。
 *
 * 【何を測るのか】
 * 症状は「総尺は合っているのに映像の後半が動かない」。この形になる経路は複数ある:
 *
 *   A. 描画が間に合わず、同じ Canvas を複数フレームとして投入した（＝重複投入）
 *   B. 描画は足りていたが、エンコーダーの詰まりで投入を落とした（＝backpressure）
 *   C. そもそも render loop が終端まで描かずに完了要求が出た（＝末尾補完で尺だけ埋めた）
 *
 * 完了時の総フレーム数はどれも一致するため、既存ログでは区別できない。
 * そこで「**実際に描かれた相異なるタイムライン時刻の数**」を投入数と別に数える。
 *
 *   duplicateSubmissions = submitted - distinctRendered
 *
 * A なら duplicateSubmissions が大きく、C なら末尾補完（tailFilled）が大きくなる。
 * B は backpressureDropped で分かる。これで原因が数字で確定する。
 */

export interface ExportFrameFlowSnapshot {
  /** VideoEncoder へ投入したフレーム総数 */
  submittedFrames: number;
  /** render loop が実際に描いた「相異なる」タイムラインフレーム番号の数 */
  distinctRenderedFrames: number;
  /**
   * render loop が実際に描画を実行した回数。
   * 番号が連番でも 1 回の rAF で複数フレームぶん進めば描画回数はそのぶん少ない。
   * 未提供（旧経路）なら distinctRenderedFrames を使う。
   */
  renderCallCount?: number;
  /** 完了要求後に尺を揃えるため末尾で複製したフレーム数 */
  tailFilledFrames: number;
  /** エンコーダー飽和で投入を見送った回数 */
  backpressureDroppedFrames: number;
  /** 尺から期待される総フレーム数（未確定なら null） */
  expectedVideoFrames: number | null;
  /** render loop が最後に描いたフレーム番号（未描画なら null） */
  lastRenderedFrameIndex: number | null;
  /** 書き出しに要した実時間（秒） */
  elapsedWallClockSec: number;
  /** 書き出し対象の尺（秒） */
  totalDurationSec: number;
  fps: number;
}

/** 診断の判定結果。原因の当たりを付けるためのラベル。 */
export type ExportFrameFlowVerdict =
  /** 描画・投入とも期待どおり（症状なし） */
  | 'healthy'
  /** 描画が間に合わず同じ画を複製投入した（映像が止まって見える主因） */
  | 'duplicate-submission'
  /** render loop が終端まで描かず、末尾補完で尺だけ埋めた */
  | 'tail-filled'
  /** エンコーダーの詰まりでフレームを落とした */
  | 'encoder-backpressure'
  /** 投入数が期待に届かなかった（映像尺そのものが短い） */
  | 'short-video-track';

export interface ExportFrameFlowDiagnosis {
  verdict: ExportFrameFlowVerdict;
  /** submitted - distinctRendered。0 より大きいほど「同じ画の使い回し」が多い */
  duplicateSubmissions: number;
  /** 実際に描けた平均 fps（distinctRendered / 実時間） */
  effectiveRenderFps: number;
  /** 描画できた割合（distinctRendered / expectedVideoFrames）。期待値が無ければ null */
  renderCoverageRatio: number | null;
  /** 映像が「止まって見える」秒数の推定（重複投入 ÷ fps） */
  estimatedFrozenSec: number;
  /** 人が読める要約（そのままログへ出す） */
  summary: string;
}

/** 重複投入をこの割合以上含むと「映像が止まって見える」と判断する閾値 */
const DUPLICATE_RATIO_THRESHOLD = 0.05;
/** 末尾補完をこのフレーム数以上行ったら異常とみなす（丸め誤差ぶんは許容する） */
const TAIL_FILL_THRESHOLD_FRAMES = 2;

/**
 * 書き出し完了時のフレーム収支から、映像が止まる症状の原因を判定する。
 *
 * @param snapshot - 完了時点で集めたカウンタ
 * @returns 判定結果と、ログへそのまま出せる要約
 */
export function diagnoseExportFrameFlow(
  snapshot: ExportFrameFlowSnapshot,
): ExportFrameFlowDiagnosis {
  const submitted = safeCount(snapshot.submittedFrames);
  const distinctNumbers = safeCount(snapshot.distinctRenderedFrames);
  // 実際に描画が走った回数を優先する。番号の連続性だけでは
  // 「1 回の描画で複数フレームぶん時刻が進んだ」ケースを見逃す。
  const distinct =
    snapshot.renderCallCount === undefined
      ? distinctNumbers
      : Math.min(distinctNumbers, safeCount(snapshot.renderCallCount));
  const tailFilled = safeCount(snapshot.tailFilledFrames);
  const dropped = safeCount(snapshot.backpressureDroppedFrames);
  const elapsed = Number.isFinite(snapshot.elapsedWallClockSec)
    ? Math.max(0, snapshot.elapsedWallClockSec)
    : 0;
  const fps = Number.isFinite(snapshot.fps) && snapshot.fps > 0 ? snapshot.fps : 30;
  const expected =
    snapshot.expectedVideoFrames !== null && Number.isFinite(snapshot.expectedVideoFrames)
      ? Math.max(0, Math.floor(snapshot.expectedVideoFrames))
      : null;

  // 末尾補完は「描いていないフレーム」なので、重複の内訳として二重計上しない。
  const duplicateSubmissions = Math.max(0, submitted - distinct);
  const duplicateRatio = submitted > 0 ? duplicateSubmissions / submitted : 0;
  const effectiveRenderFps = elapsed > 0 ? distinct / elapsed : 0;
  const renderCoverageRatio = expected !== null && expected > 0 ? distinct / expected : null;
  const estimatedFrozenSec = duplicateSubmissions / fps;

  const verdict = resolveVerdict({
    submitted,
    expected,
    duplicateRatio,
    tailFilled,
    dropped,
  });

  const summary = buildSummary({
    verdict,
    duplicateSubmissions,
    estimatedFrozenSec,
    effectiveRenderFps,
    renderCoverageRatio,
    tailFilled,
    dropped,
    fps,
  });

  return {
    verdict,
    duplicateSubmissions,
    effectiveRenderFps,
    renderCoverageRatio,
    estimatedFrozenSec,
    summary,
  };
}

function resolveVerdict(input: {
  submitted: number;
  expected: number | null;
  duplicateRatio: number;
  tailFilled: number;
  dropped: number;
}): ExportFrameFlowVerdict {
  const { submitted, expected, duplicateRatio, tailFilled, dropped } = input;

  // 映像トラックそのものが短い（尺が足りない）のが最も重い異常。
  if (expected !== null && submitted < expected) {
    return 'short-video-track';
  }
  // 次に重いのは「描かずに末尾で埋めた」。後半が完全に静止する。
  if (tailFilled >= TAIL_FILL_THRESHOLD_FRAMES) {
    return 'tail-filled';
  }
  // 重複投入は「間欠的に止まって見える」症状に対応する。
  if (duplicateRatio >= DUPLICATE_RATIO_THRESHOLD) {
    return 'duplicate-submission';
  }
  if (dropped > 0) {
    return 'encoder-backpressure';
  }
  return 'healthy';
}

function buildSummary(input: {
  verdict: ExportFrameFlowVerdict;
  duplicateSubmissions: number;
  estimatedFrozenSec: number;
  effectiveRenderFps: number;
  renderCoverageRatio: number | null;
  tailFilled: number;
  dropped: number;
  fps: number;
}): string {
  const {
    verdict,
    duplicateSubmissions,
    estimatedFrozenSec,
    effectiveRenderFps,
    renderCoverageRatio,
    tailFilled,
    dropped,
    fps,
  } = input;

  const coverageText =
    renderCoverageRatio === null ? '不明' : `${Math.round(renderCoverageRatio * 100)}%`;
  const commonText =
    `描画実効 ${effectiveRenderFps.toFixed(1)}fps（目標 ${fps}fps）`
    + ` / 描画到達率 ${coverageText}`
    + ` / 重複投入 ${duplicateSubmissions}枚（約${estimatedFrozenSec.toFixed(1)}秒ぶん）`
    + ` / 末尾補完 ${tailFilled}枚 / 投入落ち ${dropped}枚`;

  switch (verdict) {
    case 'short-video-track':
      return `映像トラックが期待フレーム数に届いていない。${commonText}`;
    case 'tail-filled':
      return `終端まで描画できず末尾を複製で埋めた（後半が静止する）。${commonText}`;
    case 'duplicate-submission':
      return `描画が追いつかず同じ画を複製投入した（映像が止まって見える）。${commonText}`;
    case 'encoder-backpressure':
      return `エンコーダーの詰まりで投入を見送った。${commonText}`;
    case 'healthy':
    default:
      return `フレーム収支は正常。${commonText}`;
  }
}

function safeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * render loop が「実際に描いた相異なるフレーム番号」を数えるカウンタ。
 *
 * 単純な件数ではなく相異なる番号を数えるのは、同じ時刻を 2 回描いても
 * 映像としては 1 枚ぶんにしかならないため。Set を持つとフレーム数ぶん
 * メモリを食うので、フレーム番号が単調増加する性質を使って
 * 「直前より大きい番号が来たときだけ数える」方式にする。
 */
export interface RenderedFrameTracker {
  /** 描画したフレーム番号を記録する（重複・巻き戻りは数えない） */
  note(frameIndex: number): void;
  /** 相異なるフレーム番号の数 */
  getDistinctCount(): number;
  /** 最後に記録したフレーム番号（未記録なら null） */
  getLastIndex(): number | null;
  /** 記録した番号のうち、連続していなかった箇所の数（＝描画が飛んだ回数） */
  getSkipCount(): number;
  /** 飛んだフレームの総数（＝描かれなかったフレーム数） */
  getSkippedFrames(): number;
  /**
   * `note` が呼ばれた回数（＝実際の描画回数）。
   *
   * 【重要】`distinctCount` と混同しないこと。壁時計ペーシングでは
   * 1 回の rAF で複数フレームぶん時刻が進むため、番号は連番のまま増えても
   * **実際の描画は 1 回**ということが起こる。この場合 skipCount は 0 のままで
   * 「正常」に見えてしまう（実際に一度この誤診を出した）。
   * `renderCallCount < distinctCount` なら、その差が「描かれていないフレーム」。
   */
  getRenderCallCount(): number;
  reset(): void;
}

export function createRenderedFrameTracker(): RenderedFrameTracker {
  let distinctCount = 0;
  let lastIndex: number | null = null;
  let skipCount = 0;
  let skippedFrames = 0;
  let renderCallCount = 0;

  return {
    note(frameIndex: number): void {
      if (!Number.isFinite(frameIndex)) return;
      const index = Math.floor(frameIndex);
      if (index < 0) return;

      // 実際に描画が走った回数は、番号の連続性とは独立に数える。
      renderCallCount += 1;

      // 同じ番号の再描画・巻き戻りは「新しいフレーム」ではない
      if (lastIndex !== null && index <= lastIndex) return;

      if (lastIndex !== null && index > lastIndex + 1) {
        // 連番でない = その間のフレームは一度も描かれていない
        skipCount += 1;
        skippedFrames += index - lastIndex - 1;
      }
      distinctCount += 1;
      lastIndex = index;
    },
    getDistinctCount: () => distinctCount,
    getLastIndex: () => lastIndex,
    getSkipCount: () => skipCount,
    getSkippedFrames: () => skippedFrames,
    getRenderCallCount: () => renderCallCount,
    reset(): void {
      distinctCount = 0;
      lastIndex = null;
      skipCount = 0;
      skippedFrames = 0;
      renderCallCount = 0;
    },
  };
}
