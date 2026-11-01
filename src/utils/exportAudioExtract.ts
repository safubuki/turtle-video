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

/** 先頭無音の推定に使う観測数（約 85ms × 12 ≒ 1 秒ぶん） */
export const CAPTURE_PREROLL_OBSERVATION_LIMIT = 12;
/** これを超える推定値は誤観測として使わない（秒） */
const CAPTURE_PREROLL_MAX_SEC = 5;
/** 再生位置が抽出開始より後ろから始まったときに先頭へ足す無音の上限（秒） */
const CAPTURE_PREROLL_MAX_PAD_SEC = 0.5;

export type CapturePrerollObservation = {
  /** その時点までに録音したサンプルの秒数（先頭の無音を含む） */
  capturedSec: number;
  /** 同じ時点の video.currentTime */
  mediaTimeSec: number;
};

/**
 * `<video>` のリアルタイム抽出で、録音バッファの先頭に入った「再生開始前の無音」の秒数を推定する。
 *
 * ScriptProcessor は接続した時点から（読み込み・シーク・play() の完了前から）録音するため、
 * バッファ先頭には再生が始まるまでの無音が入る。区間抽出はオフセット 0 で載せるので、
 * そのままだと動画の音がその分（数百 ms〜1 秒程度）遅れる。
 * 各観測の「録音秒数 −（再生位置 − 抽出開始位置）」の中央値を返す。
 * 音の大きさでは判定しない（素材が無音で始まる場合に削りすぎるため。13-237）。
 * 観測が無い・推定が不正なときは null（呼び出し側は補正しない）。
 */
export function estimateCapturePrerollSec(
  observations: readonly CapturePrerollObservation[],
  startSec: number,
): number | null {
  const base = Number.isFinite(startSec) ? Math.max(0, startSec) : 0;
  const lags = observations
    .filter((o) => Number.isFinite(o.capturedSec) && Number.isFinite(o.mediaTimeSec))
    .map((o) => o.capturedSec - (o.mediaTimeSec - base))
    .sort((a, b) => a - b);
  if (lags.length === 0) return null;
  const mid = Math.floor(lags.length / 2);
  const median = lags.length % 2 === 1 ? lags[mid] : (lags[mid - 1] + lags[mid]) / 2;
  if (!Number.isFinite(median) || Math.abs(median) > CAPTURE_PREROLL_MAX_SEC) return null;
  return median;
}

/**
 * 推定した先頭無音から、録音バッファの先頭で捨てる／足すサンプル数を決める。
 * 正: 再生開始前の無音を捨てる。負: 再生位置が抽出開始より後ろから始まったぶん無音を足す。
 */
export function resolveCapturePrerollAlignment(
  prerollSec: number | null,
  sampleRate: number,
  totalFrames: number,
): { dropFrames: number; padFrames: number } {
  if (prerollSec === null || !Number.isFinite(prerollSec) || !(sampleRate > 0)) {
    return { dropFrames: 0, padFrames: 0 };
  }
  const frames = Math.max(0, Math.floor(totalFrames));
  if (prerollSec >= 0) {
    return { dropFrames: Math.min(frames, Math.round(prerollSec * sampleRate)), padFrames: 0 };
  }
  const padSec = Math.min(CAPTURE_PREROLL_MAX_PAD_SEC, -prerollSec);
  return { dropFrames: 0, padFrames: Math.round(padSec * sampleRate) };
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
