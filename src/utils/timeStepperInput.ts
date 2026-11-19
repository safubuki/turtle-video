/**
 * @file timeStepperInput.ts
 * @description 時刻スライダー（キャプション・トリムなど）の 0.1 秒ステッパーと終端吸着。
 */
import { quantizeTimeToCentiseconds } from './format';

/** −/+ の増減（秒） */
export const TIME_STEPPER_STEP_SEC = 0.1;
/** 終了スライダーの刻み。プレビューの 1/100 秒に合わせ右端の実尺へ届ける */
export const TIME_SLIDER_STEP_SEC = 0.01;

export function resolveTimeSliderMax(limitSec: number, fallback = 0): number {
  if (!Number.isFinite(limitSec) || limitSec <= 0) return fallback;
  const quantized = quantizeTimeToCentiseconds(limitSec);
  return quantized > 0 ? quantized : fallback;
}

function quantizeTimeStep(timeSec: number, step: number): number {
  if (!Number.isFinite(timeSec)) return 0;
  const safeStep = step > 0 && Number.isFinite(step) ? step : TIME_STEPPER_STEP_SEC;
  const quantized = Math.round(timeSec / safeStep) * safeStep;
  const decimals = Math.max(0, Math.round(-Math.log10(safeStep)));
  const factor = 10 ** decimals;
  return Math.round(quantized * factor) / factor;
}

/**
 * 0.1 秒格子へ丸めつつ、上限の端数だけはプレビューと同じ 1/100 秒で残す。
 */
export function snapTimeToLimitEnd(
  timeSec: number,
  limitSec: number,
  step: number = TIME_STEPPER_STEP_SEC,
): number {
  if (!Number.isFinite(timeSec)) return 0;
  const hasLimit = Number.isFinite(limitSec) && limitSec > 0;
  const displayEnd = hasLimit ? quantizeTimeToCentiseconds(limitSec) : NaN;
  const clamped = hasLimit ? Math.min(Math.max(0, timeSec), displayEnd) : Math.max(0, timeSec);
  if (!hasLimit) return quantizeTimeStep(clamped, step);

  if (clamped >= displayEnd - 1e-6) return displayEnd;

  const lastGrid = quantizeTimeStep(Math.floor((displayEnd + 1e-9) / step) * step, step);
  if (displayEnd > lastGrid + 1e-6 && clamped > lastGrid + 1e-6) {
    return displayEnd;
  }

  const quantized = quantizeTimeStep(clamped, step);
  if (quantized >= displayEnd) return displayEnd;
  return quantized;
}

export function resolveEndTimeInput(
  rawSec: number,
  options: { startTime: number; limitSec: number; step?: number },
): number | null {
  if (!Number.isFinite(rawSec)) return null;
  const next = snapTimeToLimitEnd(
    rawSec,
    options.limitSec,
    options.step ?? TIME_STEPPER_STEP_SEC,
  );
  if (!(next > options.startTime)) return null;
  return next;
}

function resolveEndLastGridSec(limitSec: number, step: number = TIME_STEPPER_STEP_SEC): number {
  const displayEnd = quantizeTimeToCentiseconds(limitSec);
  return quantizeTimeStep(Math.floor((displayEnd + 1e-9) / step) * step, step);
}

/** 終了の −/+。実尺端数（15.04）からのマイナスは 15.0 へ戻す。 */
export function stepEndTime(
  fromSec: number,
  direction: 1 | -1,
  options: { startTime: number; limitSec: number; step?: number },
): number | null {
  const step = options.step ?? TIME_STEPPER_STEP_SEC;
  const displayEnd = Number.isFinite(options.limitSec) && options.limitSec > 0
    ? quantizeTimeToCentiseconds(options.limitSec)
    : NaN;
  if (direction < 0 && Number.isFinite(displayEnd) && Number.isFinite(fromSec)) {
    const lastGrid = resolveEndLastGridSec(options.limitSec, step);
    if (displayEnd > lastGrid + 1e-6 && fromSec >= displayEnd - 1e-6) {
      return resolveEndTimeInput(lastGrid, options);
    }
  }
  return resolveEndTimeInput(fromSec + direction * step, options);
}

/** 0 は "0"、15 は "15.0"、端数の実尺は "15.04" */
export function formatTimeStepperInput(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-9) return '0';
  const roundedCs = Math.round(value * 100) / 100;
  const tenths = Math.round(roundedCs * 10) / 10;
  if (Math.abs(roundedCs - tenths) < 1e-6) return tenths.toFixed(1);
  return roundedCs.toFixed(2);
}

/**
 * 開始の −/+。終了（stepEndTime）と同じく 0.1 秒格子へ吸着する。
 * 分割などで 13.38 のような 1/100 秒の開始になっていても、−/+ では 13.3 / 13.5 へ揃える。
 */
export function stepStartTime(
  fromSec: number,
  direction: 1 | -1,
  step: number = TIME_STEPPER_STEP_SEC,
): number {
  if (!Number.isFinite(fromSec)) return 0;
  return Math.max(0, quantizeTimeStep(fromSec + direction * step, step));
}

/**
 * カード見出しの時刻（m:ss.t）。0.1 秒で表せない値だけ 1/100 秒（m:ss.cc）にする。
 * トリミング欄・開始/終了の数値（1/100 秒）と食い違って見えないようにするため。
 */
export function formatClipCompactClock(seconds: number): string {
  const cs = Math.round(Math.max(0, Number.isFinite(seconds) ? seconds : 0) * 100);
  const minutes = Math.floor(cs / 6000);
  const secs = Math.floor((cs % 6000) / 100);
  const frac = cs % 100;
  const fracLabel = frac % 10 === 0 ? String(frac / 10) : frac.toString().padStart(2, '0');
  return `${minutes}:${secs.toString().padStart(2, '0')}.${fracLabel}`;
}

/** カード見出しの長さ（例: 5秒 / 13.4秒 / 1.66秒）。0.1 秒で表せない値だけ 1/100 秒 */
export function formatClipDurationLabel(seconds: number): string {
  const cs = Math.round(Math.max(0, Number.isFinite(seconds) ? seconds : 0) * 100);
  if (cs % 100 === 0) return `${cs / 100}秒`;
  if (cs % 10 === 0) return `${(cs / 100).toFixed(1)}秒`;
  return `${(cs / 100).toFixed(2)}秒`;
}
