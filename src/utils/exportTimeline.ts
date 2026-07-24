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
