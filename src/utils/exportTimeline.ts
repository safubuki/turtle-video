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

const DURATION_EPSILON = 1e-9;

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
  const nominalFrameDurationUs = Math.max(1, Math.round(1e6 / safeFps));

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
