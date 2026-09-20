/**
 * 表示区間の先頭／末尾に対する線形フェード係数。
 * ウォーターマーク・キャプション・エンドロールで同じ計算を使う。
 */
export function calculateLinearRangeFadeAlpha(params: {
  startTime: number;
  endTime: number;
  timeSec: number;
  fadeIn: boolean;
  fadeOut: boolean;
  fadeInDuration: number;
  fadeOutDuration: number;
}): number {
  const duration = Math.max(0, params.endTime - params.startTime);
  if (duration <= 0) return 1;

  const localTime = params.timeSec - params.startTime;
  let fadeInDur = params.fadeIn && Number.isFinite(params.fadeInDuration)
    ? Math.max(0, params.fadeInDuration)
    : 0;
  let fadeOutDur = params.fadeOut && Number.isFinite(params.fadeOutDuration)
    ? Math.max(0, params.fadeOutDuration)
    : 0;
  if (fadeInDur + fadeOutDur > duration) {
    const ratio = duration / (fadeInDur + fadeOutDur);
    fadeInDur *= ratio;
    fadeOutDur *= ratio;
  }

  let alpha = 1;
  if (fadeInDur > 0 && localTime < fadeInDur) {
    alpha = localTime / fadeInDur;
  }
  if (fadeOutDur > 0 && localTime > duration - fadeOutDur) {
    alpha = Math.min(alpha, (duration - localTime) / fadeOutDur);
  }
  return Math.max(0, Math.min(1, alpha));
}
