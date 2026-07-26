export interface ExportTimelineAlignment {
  rawDurationSec: number;
  rawDurationUs: number;
  frameCount: number;
  alignedDurationSec: number;
  alignedDurationUs: number;
}

export interface ResolvedExportDuration extends ExportTimelineAlignment {
  exportDurationSec: number;
  exportDurationUs: number;
  nominalFrameDurationUs: number;
}

export interface ExportFrameTiming {
  timestampUs: number;
  durationUs: number;
}

export interface NonIosExportTimelineTimeInput {
  elapsedSec: number;
  lastRenderedPlaybackTimeSec: number;
  fps: number;
}

export interface ExportCanvasFrameBurstInput {
  pendingFrameCount: number;
  /**
   * 1 回のポーリングで取り込める最大フレーム数。
   * 省略時は従来どおり 1 とし、明示的に catch-up を許可した経路だけ複数枚を返す。
   */
  maxFramesPerPoll?: number;
}

export interface FrameDrivenExportTimeInput {
  wallClockTimeSec: number;
  submittedFrameCount: number;
  fps: number;
  enabled: boolean;
}

export interface FrameDrivenExportPacingDecisionInput {
  isExportMode: boolean;
  fromTimeSec: number;
  mediaItemTypes: readonly string[];
}

export interface ExportResolutionValidationInput {
  /** VideoEncoder / muxer に設定した書き出し幅 */
  expectedWidth: number;
  expectedHeight: number;
  /** 完成 MP4 の tkhd から読み取れた実解像度（読み取れない場合は null） */
  actualWidth: number | null;
  actualHeight: number | null;
}

export type ExportResolutionValidationVerdict =
  /** 実解像度が設定と一致（正常） */
  | 'match'
  /** 実解像度が設定と明確に食い違う（書き出しを失敗にする） */
  | 'mismatch'
  /** 実解像度を読み取れなかった（パーサー側の限界。書き出しは継続し警告に留める） */
  | 'unverified';

/**
 * 完成 MP4 の実解像度と設定値を突き合わせて判定する純ロジック。
 *
 * エンコーダー / muxer には常に expected の width / height を設定済みのため、
 * 「実ファイルの解像度が確実に食い違っている」場合だけ 'mismatch'（失敗）とし、
 * パーサーが解像度を読み取れなかった場合は 'unverified'（継続）として、
 * 検証不能を理由に完成した書き出しを破棄しない。
 */
export function resolveExportResolutionVerdict(
  input: ExportResolutionValidationInput,
): ExportResolutionValidationVerdict {
  const { expectedWidth, expectedHeight, actualWidth, actualHeight } = input;
  if (actualWidth === null || actualHeight === null) {
    return 'unverified';
  }
  if (actualWidth !== expectedWidth || actualHeight !== expectedHeight) {
    return 'mismatch';
  }
  return 'match';
}

const DURATION_EPSILON = 1e-9;

function sanitizePlaybackTimeSec(timeSec: number): number | null {
  if (!Number.isFinite(timeSec)) return null;
  // export の初期化や停止境界で未初期化値を拾っても安全側へ倒せるよう、
  // フレーム供給用の時刻は 0 以上に正規化して扱う。
  return Math.max(0, timeSec);
}

function isResolvedExportDuration(
  alignment: ExportTimelineAlignment | ResolvedExportDuration,
): alignment is ResolvedExportDuration {
  return 'exportDurationUs' in alignment && 'nominalFrameDurationUs' in alignment;
}

export function resolveExportDuration(
  totalDurationSec: number,
  fps: number,
): ResolvedExportDuration {
  const safeDurationSec = Number.isFinite(totalDurationSec) && totalDurationSec > 0 ? totalDurationSec : 0;
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 0;

  if (safeDurationSec <= 0 || safeFps <= 0) {
    return {
      exportDurationSec: safeDurationSec,
      exportDurationUs: 0,
      rawDurationSec: safeDurationSec,
      rawDurationUs: 0,
      frameCount: 0,
      alignedDurationSec: 0,
      alignedDurationUs: 0,
      nominalFrameDurationUs: 0,
    };
  }

  const exportDurationUs = Math.max(0, Math.round(safeDurationSec * 1e6));
  const rawFrameCount = safeDurationSec * safeFps;
  const frameCount = Math.max(1, Math.ceil(rawFrameCount - DURATION_EPSILON));
  const alignedDurationSec = frameCount / safeFps;
  const alignedDurationUs = Math.max(0, Math.round(alignedDurationSec * 1e6));
  const nominalFrameDurationUs = Math.max(1, Math.round(alignedDurationUs / frameCount));

  return {
    exportDurationSec: safeDurationSec,
    exportDurationUs,
    rawDurationSec: safeDurationSec,
    rawDurationUs: exportDurationUs,
    frameCount,
    alignedDurationSec,
    alignedDurationUs,
    nominalFrameDurationUs,
  };
}

export function alignExportDurationToFrameGrid(
  totalDurationSec: number,
  fps: number,
): ExportTimelineAlignment {
  const resolved = resolveExportDuration(totalDurationSec, fps);

  return {
    rawDurationSec: resolved.rawDurationSec,
    rawDurationUs: resolved.rawDurationUs,
    frameCount: resolved.frameCount,
    alignedDurationSec: resolved.alignedDurationSec,
    alignedDurationUs: resolved.alignedDurationUs,
  };
}

export function getExportFrameTiming(
  alignment: ExportTimelineAlignment | ResolvedExportDuration,
  fps: number,
  frameIndex: number,
): ExportFrameTiming {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 0;
  if (alignment.frameCount <= 0 || safeFps <= 0 || frameIndex < 0 || frameIndex >= alignment.frameCount) {
    return {
      timestampUs: 0,
      durationUs: 0,
    };
  }

  const nominalFrameDurationUs = isResolvedExportDuration(alignment) && alignment.nominalFrameDurationUs > 0
    ? alignment.nominalFrameDurationUs
    : Math.max(1, Math.round(1e6 / safeFps));
  const exportDurationUs = isResolvedExportDuration(alignment)
    ? alignment.exportDurationUs
    : alignment.rawDurationUs;
  const timestampUs = Math.max(0, Math.round(frameIndex * nominalFrameDurationUs));
  const isLastFrame = frameIndex === alignment.frameCount - 1;
  const nextBoundaryUs = isLastFrame
    ? exportDurationUs
    : Math.max(timestampUs, Math.round((frameIndex + 1) * nominalFrameDurationUs));

  return {
    timestampUs,
    durationUs: Math.max(1, nextBoundaryUs - timestampUs),
  };
}

export function resolveExportPlaybackTimeSec(
  currentPlaybackTimeSec: number,
  lastRenderedPlaybackTimeSec: number,
  preferRenderedPlaybackTime: boolean,
): number {
  const preferred = preferRenderedPlaybackTime
    ? lastRenderedPlaybackTimeSec
    : currentPlaybackTimeSec;
  const sanitizedPreferred = sanitizePlaybackTimeSec(preferred);
  if (sanitizedPreferred !== null) {
    return sanitizedPreferred;
  }

  const fallback = preferRenderedPlaybackTime
    ? currentPlaybackTimeSec
    : lastRenderedPlaybackTimeSec;
  const sanitizedFallback = sanitizePlaybackTimeSec(fallback);
  if (sanitizedFallback !== null) {
    return sanitizedFallback;
  }

  return 0;
}

export function resolveNonIosExportTimelineTimeSec(
  input: NonIosExportTimelineTimeInput,
): number {
  const safeElapsedSec = sanitizePlaybackTimeSec(input.elapsedSec) ?? 0;
  const safeFps = Number.isFinite(input.fps) && input.fps > 0 ? input.fps : 30;
  const frameDurationSec = 1 / safeFps;
  const snappedElapsedSec = Math.floor(safeElapsedSec / frameDurationSec) * frameDurationSec;
  const safeLastRenderedSec = sanitizePlaybackTimeSec(input.lastRenderedPlaybackTimeSec);

  if (safeLastRenderedSec === null) {
    return snappedElapsedSec;
  }

  const maxAdvancedElapsedSec = safeLastRenderedSec + frameDurationSec;
  return Math.max(
    safeLastRenderedSec,
    Math.min(snappedElapsedSec, maxAdvancedElapsedSec),
  );
}

export function resolveExportCanvasFrameBurstCount(
  input: ExportCanvasFrameBurstInput,
): number {
  if (!Number.isFinite(input.pendingFrameCount)) {
    return 0;
  }

  const safePendingFrameCount = Math.max(0, Math.floor(input.pendingFrameCount));
  if (safePendingFrameCount <= 0) {
    return 0;
  }

  const safeMaxFramesPerPoll = Number.isFinite(input.maxFramesPerPoll)
    ? Math.max(0, Math.floor(input.maxFramesPerPoll as number))
    : 1;

  return Math.min(safePendingFrameCount, safeMaxFramesPerPoll);
}

/**
 * 静止画のみの standard export では、壁時計ではなく VideoEncoder へ正常投入した
 * フレーム数から次に描画する時刻を決める。
 * 動画を含む経路や通常 preview は enabled=false で従来の壁時計を維持する。
 */
export function resolveFrameDrivenExportTimeSec(
  input: FrameDrivenExportTimeInput,
): number {
  const safeWallClockTimeSec = sanitizePlaybackTimeSec(input.wallClockTimeSec) ?? 0;
  if (!input.enabled) return safeWallClockTimeSec;

  const safeFps = Number.isFinite(input.fps) && input.fps > 0 ? input.fps : 30;
  const safeSubmittedFrameCount = Number.isFinite(input.submittedFrameCount)
    ? Math.max(0, Math.floor(input.submittedFrameCount))
    : 0;
  return safeSubmittedFrameCount / safeFps;
}

/**
 * フレーム駆動エクスポートが「投入フレーム数の増加待ち」で長時間停滞したかを判定する
 * ウォッチドッグの純ロジック。
 *
 * フレーム駆動では VideoEncoder への投入が進まないとタイムラインも進まない。
 * 何らかの理由で投入が停滞すると `submitted` が増えず、書き出しが 0 秒付近で
 * 永久にハングする（「書き出し準備中」から進まない）。これを避けるため、
 * 最後に投入数が増えてから `stallTimeoutMs` を超えて停滞したら true を返し、
 * 呼び出し側は壁時計ペーシングへフォールバックして確実に前進させる。
 */
export interface FrameDrivenExportStallInput {
  /** フレーム駆動が有効か（無効なら停滞判定はしない） */
  enabled: boolean;
  /** 現在の投入フレーム数 */
  submittedFrameCount: number;
  /** 前回観測した投入フレーム数 */
  lastObservedSubmittedFrameCount: number;
  /** 前回投入数が変化した時刻（ms, 単調増加時計） */
  lastAdvanceAtMs: number;
  /** 現在時刻（ms, 単調増加時計） */
  nowMs: number;
  /** 停滞とみなすまでの許容時間（ms） */
  stallTimeoutMs: number;
}

export interface FrameDrivenExportStallDecision {
  /** 投入数が前回から進んだか */
  advanced: boolean;
  /** 停滞タイムアウトを超えたか（true なら壁時計へフォールバックすべき） */
  stalled: boolean;
  /** 更新後に保持すべき「最後に進んだ時刻」 */
  nextLastAdvanceAtMs: number;
}

export function evaluateFrameDrivenExportStall(
  input: FrameDrivenExportStallInput,
): FrameDrivenExportStallDecision {
  const {
    enabled,
    submittedFrameCount,
    lastObservedSubmittedFrameCount,
    lastAdvanceAtMs,
    nowMs,
    stallTimeoutMs,
  } = input;

  if (!enabled) {
    return { advanced: false, stalled: false, nextLastAdvanceAtMs: nowMs };
  }

  const advanced = submittedFrameCount !== lastObservedSubmittedFrameCount;
  if (advanced) {
    return { advanced: true, stalled: false, nextLastAdvanceAtMs: nowMs };
  }

  const safeTimeout = Number.isFinite(stallTimeoutMs) && stallTimeoutMs > 0
    ? stallTimeoutMs
    : Number.POSITIVE_INFINITY;
  const elapsedSinceAdvanceMs = nowMs - lastAdvanceAtMs;
  const stalled = elapsedSinceAdvanceMs >= safeTimeout;

  return { advanced: false, stalled, nextLastAdvanceAtMs: lastAdvanceAtMs };
}

/**
 * HTMLVideoElement の実デコードを必要としない静止画タイムラインだけを、
 * VideoEncoder のフレーム投入駆動へ切り替える。動画を含む場合は既存の壁時計再生を守る。
 *
 * 【動画へ広げてはいけない理由（2026-07-27 実機で再確認）】
 * フレーム駆動はタイムラインを実時間から切り離す（`elapsed = submitted / fps`）。
 * ところが `<video>` 要素は実時間で再生され続けるため、rAF が 30fps を割り込むと
 * タイムラインだけが実時間の 0.7 倍などに遅れ、`video.currentTime` が
 * `targetTime` を常に追い越す。すると export の同期補正（needsCorrection）が
 * 毎フレーム**シークで巻き戻し**、シークのたびに再バッファで投入が止まり、
 * さらにタイムラインが遅れる、という悪循環になる。
 * 実際に動画を含む書き出しへ適用したところ、コンテナのフレーム時刻は
 * 完全な CFR（1190 枚・全て 1/30 秒間隔・単調増加）のまま、**中身が数秒単位で
 * 進んだり戻ったりする**出力になった。
 * 静止画にはこの実時間クロックが無いため同じ問題は起きない。
 *
 * 動画側の「映像が早送りになる」問題は、ここではなく描画・投入側で解決すること。
 */
export function shouldUseFrameDrivenExportPacing(
  input: FrameDrivenExportPacingDecisionInput,
): boolean {
  return input.isExportMode
    && Number.isFinite(input.fromTimeSec)
    && input.fromTimeSec >= 0
    && input.fromTimeSec <= 1e-9
    && input.mediaItemTypes.length > 0
    && input.mediaItemTypes.every((type) => type === 'image');
}

export interface ExportVideoFrameBudgetInput {
  /** 尺から確定した総フレーム数（未確定なら null） */
  expectedVideoFrames: number | null;
  /**
   * 終端まで詰め切る要求（completionRequested / 明示 forceToEnd）。
   * true なら残りをすべて投入して映像尺を総尺へ揃える。
   */
  forceToEnd: boolean;
  /** render loop が最後に「実際に描画した」タイムライン時刻（未描画なら null） */
  renderedPlaybackTimeSec: number | null;
  /** render loop が最後に描画したフレーム番号（未描画なら null） */
  renderedFrameIndex: number | null;
  fps: number;
}

/**
 * Canvas 直接キャプチャ経路で「次に何フレームまで投入してよいか」を決める純ロジック。
 *
 * 【Issue #215】映像だけが予定より早く終了して黒画面になる不具合の対策。
 *
 * 従来はタイムライン時刻（壁時計由来の currentTime）だけから
 * `floor(t * fps) + 1` を上限にしていた。しかし export の描画は rAF 上で走るため、
 * 1080p や初回書き出し（デコード未ウォーム / JIT 未最適化）では rAF が 30fps を割り込む。
 * 壁時計は減速しないので「時刻は 17s まで進んだ = 510 フレーム投入してよい」と判断され、
 * 実際には描かれていない時刻の分まで**同じ Canvas を複製して**投入してしまう。
 * 結果として映像トラックだけが総フレーム数へ早く到達し、以降は映像が無い（黒画面）まま
 * オフラインで用意済みの音声だけが総尺まで流れる。
 *
 * そこで投入上限を「render loop が実際に描画したフレーム番号 + 1」に固定する。
 * 描画が遅れれば投入も遅れるため、映像時刻と出力フレームが 1:1 で対応し、
 * 映像の早期終了と黒画面が発生しない。終端は forceToEnd の末尾補完で総尺へ揃える。
 */
export function resolveExportVideoFrameBudget(
  input: ExportVideoFrameBudgetInput,
): number | null {
  const { expectedVideoFrames, forceToEnd, renderedFrameIndex, renderedPlaybackTimeSec } = input;
  if (expectedVideoFrames === null || !Number.isFinite(expectedVideoFrames)) {
    return null;
  }
  const safeExpected = Math.max(1, Math.floor(expectedVideoFrames));
  if (forceToEnd) {
    return safeExpected;
  }

  const safeFps = Number.isFinite(input.fps) && input.fps > 0 ? input.fps : 30;

  // 実際に描画済みのフレーム番号を最優先で使う（描画と投入を 1:1 に保つ）。
  if (renderedFrameIndex !== null && Number.isFinite(renderedFrameIndex) && renderedFrameIndex >= 0) {
    return Math.min(safeExpected, Math.floor(renderedFrameIndex) + 1);
  }

  // フレーム番号が未提供の場合のみ、描画済み時刻から換算する。
  const sanitizedRenderedTime = renderedPlaybackTimeSec === null
    ? null
    : sanitizePlaybackTimeSec(renderedPlaybackTimeSec);
  if (sanitizedRenderedTime !== null) {
    return Math.min(safeExpected, Math.max(1, Math.floor(sanitizedRenderedTime * safeFps) + 1));
  }

  // render loop がまだ 1 フレームも描いていない間は先頭フレームだけを許可する。
  return 1;
}

/**
 * canvas.captureStream() で得た MediaStream の全トラックを停止する純ヘルパー。
 *
 * エクスポートは共有プレビュー Canvas から captureStream でフレームを吸い出すため、
 * この停止漏れが起きると、停止したはずのキャプチャトラックが Canvas に紐づいたまま残り、
 * 以降の通常プレビューでカクつき・黒フレーム・静止画化を招く。成功／中断／失敗／unmount の
 * いずれの終了経路でも呼べるよう、null 安全かつ冪等（各 track.stop は個別に例外を握り潰す）にする。
 */
export function stopCanvasCaptureStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  });
}
