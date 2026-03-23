export interface ExportTimelineAlignment {
  rawDurationSec: number;
  rawDurationUs: number;
  frameCount: number;
  alignedDurationSec: number;
  alignedDurationUs: number;
}

export interface ExportFrameTiming {
  timestampUs: number;
  durationUs: number;
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
      rawDurationUs: 0,
      frameCount: 0,
      alignedDurationSec: 0,
      alignedDurationUs: 0,
    };
  }

  const rawDurationUs = Math.max(0, Math.round(safeDurationSec * 1e6));
  const rawFrameCount = safeDurationSec * safeFps;
  const frameCount = Math.max(1, Math.ceil(rawFrameCount - DURATION_EPSILON));
  const alignedDurationSec = frameCount / safeFps;

  return {
    rawDurationSec: safeDurationSec,
    rawDurationUs,
    frameCount,
    alignedDurationSec,
    alignedDurationUs: Math.max(0, Math.round(alignedDurationSec * 1e6)),
  };
}

export function getExportFrameTiming(
  alignment: ExportTimelineAlignment,
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

  const nominalFrameDurationUs = 1e6 / safeFps;
  const timestampUs = Math.max(0, Math.round(frameIndex * nominalFrameDurationUs));
  const isLastFrame = frameIndex === alignment.frameCount - 1;
  const nextBoundaryUs = isLastFrame
    ? alignment.rawDurationUs
    : Math.max(timestampUs, Math.round((frameIndex + 1) * nominalFrameDurationUs));

  return {
    timestampUs,
    durationUs: Math.max(1, nextBoundaryUs - timestampUs),
  };
}
