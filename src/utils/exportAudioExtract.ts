/**
 * export 前の動画音声デコードで、トリム後の必要区間だけを対象にする判定。
 * 元ファイル全体を decode / リアルタイム抽出すると、長い素材を短く切ったときに準備が伸びる。
 */
import { getVideoSourceClipDuration } from './playbackSpeed';

export type ExportClipAudioExtractRange = {
  startSec: number;
  durationSec: number;
  originalDurationSec: number;
};

export function resolveExportClipAudioExtractRange(item: {
  originalDuration?: number;
  trimStart?: number;
  trimEnd?: number;
  duration?: number;
}): ExportClipAudioExtractRange {
  const originalDurationSec = Number.isFinite(item.originalDuration)
    ? Math.max(0, item.originalDuration as number)
    : 0;
  const startSec = Number.isFinite(item.trimStart) ? Math.max(0, item.trimStart as number) : 0;
  const sourceClip = getVideoSourceClipDuration(item);
  const durationSec = sourceClip > 0
    ? sourceClip
    : (Number.isFinite(item.duration) ? Math.max(0, item.duration as number) : originalDurationSec);
  return {
    startSec,
    durationSec,
    originalDurationSec: originalDurationSec > 0 ? originalDurationSec : durationSec,
  };
}

/**
 * 未使用の元尺が十分長いとき、全ファイル decode よりトリム区間の抽出を優先する。
 * 例: 40秒素材を7秒に切った場合は true。ほぼ全尺を使う場合は false。
 */
export function shouldPreferRangeAudioExtract(params: {
  originalDurationSec: number;
  neededDurationSec: number;
}): boolean {
  const original = params.originalDurationSec;
  const needed = params.neededDurationSec;
  if (!(original > 0) || !(needed > 0)) return false;
  return original - needed >= 3 && original >= needed * 1.25;
}

/**
 * OfflineAudio に載せるときのバッファ先頭オフセット。
 * 区間抽出済みバッファに元の trimStart を足すと、必要な音声を取りこぼす。
 */
export function resolveExportAudioBufferOffsetSec(params: {
  trimStart: number;
  usedRangeExtract?: boolean;
}): number {
  const trimStart = Number.isFinite(params.trimStart) ? Math.max(0, params.trimStart) : 0;
  if (params.usedRangeExtract) return 0;
  return trimStart;
}
