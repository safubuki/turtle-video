/**
 * @file audioFadeCurve.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 音声クリップ（BGM クリップ等）のフェードインをプレビューと書き出しで揃えるカーブ。
 *
 * プレビューは毎フレーム目標音量（直線フェード）を計算し、GainNode へ
 * `setTargetAtTime(目標, now, PREVIEW_AUDIO_CLIP_GAIN_SMOOTHING_SEC)` で渡す。
 * そのため実際の音量は直線から一次遅れで追従し、立ち上がりの最初が大きく抑えられる
 * （1 秒フェードの 0.1 秒時点で直線 16% に対し約 6%）。
 * 書き出しが直線のままだと「冒頭から鳴り出す」ように聞こえるため、同じ一次遅れの形を使う。
 */

/** プレビューの音声クリップ GainNode の追従時定数（秒）。書き出しのフェードインもこれに合わせる */
export const PREVIEW_AUDIO_CLIP_GAIN_SMOOTHING_SEC = 0.1;

/** カーブのサンプル間隔（秒） */
const FADE_IN_CURVE_STEP_SEC = 0.005;
/** カーブの最大点数（長いフェードでも配列を大きくしすぎない） */
const FADE_IN_CURVE_MAX_POINTS = 4001;

/**
 * 直線フェードを時定数 tau の一次遅れで追従したときの形（0 から始まる）。
 * 入力 r(t)=t に対する一次遅れ系の応答 y(t) = t - tau(1 - e^{-t/tau})。
 */
function smoothedRampShape(t: number, tau: number): number {
  if (tau <= 0) return t;
  return t - tau * (1 - Math.exp(-t / tau));
}

/**
 * 0 から `volume` まで `durationSec` で上がるフェードインのカーブを返す。
 * プレビューの一次遅れ追従と同じ形を使い、終端でちょうど `volume` に届くよう正規化する
 * （書き出しではフェード区間の後に別のエンベロープ点を置くため、区間内で収束させる）。
 * 不正値のときは null（呼び出し側で直線フェードへ戻す）。
 */
export function buildSmoothedFadeInCurve(
  volume: number,
  durationSec: number,
  smoothingSec: number = PREVIEW_AUDIO_CLIP_GAIN_SMOOTHING_SEC,
): Float32Array | null {
  if (!Number.isFinite(volume) || volume <= 0) return null;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
  const tau = Number.isFinite(smoothingSec) ? Math.max(0, smoothingSec) : 0;
  const end = smoothedRampShape(durationSec, tau);
  if (!(end > 0)) return null;

  const points = Math.max(
    2,
    Math.min(FADE_IN_CURVE_MAX_POINTS, Math.ceil(durationSec / FADE_IN_CURVE_STEP_SEC) + 1),
  );
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const t = (durationSec * i) / (points - 1);
    curve[i] = volume * Math.max(0, Math.min(1, smoothedRampShape(t, tau) / end));
  }
  curve[0] = 0;
  curve[points - 1] = volume;
  return curve;
}
