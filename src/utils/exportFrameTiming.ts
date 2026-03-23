export interface DeterministicExportFrameTimeInput {
  baseTimeSec: number;
  renderedFrameCount: number;
  fps: number;
}

/**
 * 非 iOS export の時間進行を壁時計ではなくフレーム数ベースで決める。
 * これにより rAF の揺れがそのままタイムラインの揺れにならず、
 * CFR 30fps のエンコード時刻と描画時刻を一致させやすくする。
 */
export function getDeterministicExportFrameTimeSec(
  input: DeterministicExportFrameTimeInput,
): number {
  const safeBaseTimeSec = Number.isFinite(input.baseTimeSec) ? Math.max(0, input.baseTimeSec) : 0;
  const safeRenderedFrameCount = Number.isFinite(input.renderedFrameCount)
    ? Math.max(0, Math.floor(input.renderedFrameCount))
    : 0;
  const safeFps = Number.isFinite(input.fps) && input.fps > 0 ? input.fps : 30;

  return safeBaseTimeSec + safeRenderedFrameCount / safeFps;
}
