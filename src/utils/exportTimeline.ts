export interface ExportTimelineAlignment {
  rawDurationSec: number;
  frameCount: number;
  alignedDurationSec: number;
  alignedDurationUs: number;
}

const DURATION_EPSILON = 1e-9;

export function alignExportDurationToFrameGrid(
  totalDurationSec: number,
  fps: number,
): ExportTimelineAlignment {
  const safeDurationSec = Number.isFinite(totalDurationSec) && totalDurationSec > 0 ? totalDurationSec : 0;
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 0;

  if (safeDurationSec <= 0 || safeFps <= 0) {
    return {
      rawDurationSec: safeDurationSec,
      frameCount: 0,
      alignedDurationSec: 0,
      alignedDurationUs: 0,
    };
  }

  const rawFrameCount = safeDurationSec * safeFps;
  const frameCount = Math.max(1, Math.ceil(rawFrameCount - DURATION_EPSILON));
  const alignedDurationSec = frameCount / safeFps;

  return {
    rawDurationSec: safeDurationSec,
    frameCount,
    alignedDurationSec,
    alignedDurationUs: Math.max(0, Math.round(alignedDurationSec * 1e6)),
  };
}
