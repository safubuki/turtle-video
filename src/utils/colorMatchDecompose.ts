/**
 * @file colorMatchDecompose.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 自動で合わせた色補正（MKL の 3×3 行列＋オフセット）を、手動調整のスライダー
 * （明るさ・コントラスト・彩度・色温度・色かぶり）の値と、スライダーで表しきれない残り
 * （細かな色ずれの補正＝小さな 3×3 行列）に分ける。
 *
 * 目的: 自動で合わせた結果をスライダーの位置として見せ、そこから手で詰められるようにする。
 *
 * 手順（合わせる側の画素 c と、MKL で求めた目標の色 d = T(c) を使う）:
 *   1. スライダー 5 項目を整数のまま座標降下で探し、手動の式 P(c) を d に最も近づける（二乗誤差）
 *   2. 残り R を「P(R(c)) ≈ d」となる線形写像として最小二乗で求める
 *      （P の逆変換で e = P⁻¹(d) を作り、c → e の 3×4 回帰）
 *   3. R を足しても誤差がほとんど減らないなら R は付けない（スライダーだけで表せた）
 *
 * 描画は従来どおり「R（colorMatch）→ P（colorAdjust）」の順なので、保存形式は変わらない。
 */
import type { MediaColorAdjust } from '../types';
import type { ColorTransfer } from './colorMatch';
import {
  applyMediaColorGradeToRgb,
  MEDIA_COLOR_ADJUST_KEYS,
  MEDIA_COLOR_ADJUST_MAX,
  MEDIA_COLOR_ADJUST_MIN,
  normalizeMediaColorAdjust,
  resolveMediaColorGrade,
  type ResolvedMediaColorGrade,
} from './mediaColor';

/** 当てはめに使う画素数の上限（UI を止めない程度の計算量にする） */
const MAX_FIT_PIXELS = 1500;
/** 座標降下の刻み（大きい刻みから細かくする） */
const SEARCH_STEPS = [32, 16, 8, 4, 2, 1];
const MAX_PASSES_PER_STEP = 24;
/**
 * 残りの補正を付けたときの改善がこれ未満（RMS・0〜1 単位。約 1/255）なら付けない。
 * スライダーだけで十分なときに、見えない補正を増やさない。
 */
export const RESIDUAL_MIN_IMPROVEMENT = 1 / 255;
/** 最小二乗の正則化（単色に近い素材で解が暴れないように） */
const RIDGE = 1e-4;

export interface DecomposedColorMatch {
  /** スライダーへ入れる値（すべて 0 なら undefined） */
  adjust: MediaColorAdjust | undefined;
  /** スライダーで表しきれない残り。不要なら null */
  residual: ColorTransfer | null;
  /** 当てはめ後の誤差（RMS・0〜1 単位）。ログ・テスト用 */
  errorWithAdjustOnly: number;
  errorWithResidual: number;
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

/** 不透明な画素を最大 MAX_FIT_PIXELS 個、均等に間引いて 0〜1 の RGB 列にする */
export function collectFitSamples(data: Uint8ClampedArray | ArrayLike<number>): Float64Array {
  const opaque: number[] = [];
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] >= 128) opaque.push(i);
  }
  const count = Math.min(MAX_FIT_PIXELS, opaque.length);
  const samples = new Float64Array(count * 3);
  for (let k = 0; k < count; k++) {
    const i = opaque[Math.floor((k * opaque.length) / count)];
    samples[k * 3] = data[i] / 255;
    samples[k * 3 + 1] = data[i + 1] / 255;
    samples[k * 3 + 2] = data[i + 2] / 255;
  }
  return samples;
}

type WritableNumbers = { [index: number]: number };

function applyTransfer(transfer: ColorTransfer, r: number, g: number, b: number, out: WritableNumbers, offset: number): void {
  const m = transfer.matrix;
  const o = transfer.offset;
  out[offset] = clamp01(m[0] * r + m[1] * g + m[2] * b + o[0]);
  out[offset + 1] = clamp01(m[3] * r + m[4] * g + m[5] * b + o[1]);
  out[offset + 2] = clamp01(m[6] * r + m[7] * g + m[8] * b + o[2]);
}

function adjustFromVector(vector: readonly number[]): MediaColorAdjust {
  return {
    brightness: vector[0],
    contrast: vector[1],
    saturation: vector[2],
    temperature: vector[3],
    tint: vector[4],
  };
}

function gradeForAdjust(adjust: MediaColorAdjust): ResolvedMediaColorGrade | null {
  return resolveMediaColorGrade({ colorAdjust: adjust });
}

/** 画素列へ（任意の残り R →）手動の式 P を掛けたときの、目標との RMS 誤差 */
function measureError(
  samples: Float64Array,
  desired: Float64Array,
  grade: ResolvedMediaColorGrade | null,
  residual: ColorTransfer | null = null,
): number {
  const count = samples.length / 3;
  if (count === 0) return 0;
  const tmp = [0, 0, 0];
  const out: [number, number, number] = [0, 0, 0];
  let sum = 0;
  for (let k = 0; k < count; k++) {
    let r = samples[k * 3];
    let g = samples[k * 3 + 1];
    let b = samples[k * 3 + 2];
    if (residual) {
      applyTransfer(residual, r, g, b, tmp, 0);
      r = tmp[0];
      g = tmp[1];
      b = tmp[2];
    }
    if (grade) {
      applyMediaColorGradeToRgb(r, g, b, grade, out);
    } else {
      out[0] = r;
      out[1] = g;
      out[2] = b;
    }
    const dr = out[0] - desired[k * 3];
    const dg = out[1] - desired[k * 3 + 1];
    const db = out[2] - desired[k * 3 + 2];
    sum += dr * dr + dg * dg + db * db;
  }
  return Math.sqrt(sum / (count * 3));
}

/**
 * 手動の式 P の 5 項目（-100〜100 の整数）を、P(c) が目標 d に最も近づくよう座標降下で探す。
 */
export function fitColorAdjust(samples: Float64Array, desired: Float64Array): MediaColorAdjust {
  let current = [0, 0, 0, 0, 0];
  let best = measureError(samples, desired, null);
  for (const step of SEARCH_STEPS) {
    for (let pass = 0; pass < MAX_PASSES_PER_STEP; pass++) {
      let improved = false;
      for (let key = 0; key < MEDIA_COLOR_ADJUST_KEYS.length; key++) {
        for (const direction of [1, -1]) {
          const value = Math.max(
            MEDIA_COLOR_ADJUST_MIN,
            Math.min(MEDIA_COLOR_ADJUST_MAX, current[key] + direction * step),
          );
          if (value === current[key]) continue;
          const candidate = [...current];
          candidate[key] = value;
          const error = measureError(samples, desired, gradeForAdjust(adjustFromVector(candidate)));
          if (error < best - 1e-9) {
            best = error;
            current = candidate;
            improved = true;
            break;
          }
        }
      }
      if (!improved) break;
    }
  }
  return adjustFromVector(current);
}

/** 手動の式 P の逆（clamp で失われた分は戻らない）。P(x) = out となる x を返す */
function invertGrade(grade: ResolvedMediaColorGrade, r: number, g: number, b: number, out: number[], offset: number): void {
  let cr = r;
  let cg = g;
  let cb = b;
  // 彩度: 輝度は変わらないので、輝度との差を割り戻す
  if (grade.saturation > 1e-3) {
    const luma = cr * 0.2126 + cg * 0.7152 + cb * 0.0722;
    cr = luma + (cr - luma) / grade.saturation;
    cg = luma + (cg - luma) / grade.saturation;
    cb = luma + (cb - luma) / grade.saturation;
  }
  // コントラスト
  cr = (cr - 0.5) / grade.contrast + 0.5;
  cg = (cg - 0.5) / grade.contrast + 0.5;
  cb = (cb - 0.5) / grade.contrast + 0.5;
  // 明るさ（ガンマ）
  const inverseGamma = 1 / grade.gamma;
  cr = Math.pow(clamp01(cr), inverseGamma);
  cg = Math.pow(clamp01(cg), inverseGamma);
  cb = Math.pow(clamp01(cb), inverseGamma);
  // 色温度・色かぶりのゲイン
  out[offset] = clamp01(cr / grade.gain[0]);
  out[offset + 1] = clamp01(cg / grade.gain[1]);
  out[offset + 2] = clamp01(cb / grade.gain[2]);
}

/** 4×4 の連立一次方程式（部分ピボット付きガウス消去）。解けなければ null */
function solve4(a: number[][], rhs: number[]): number[] | null {
  const m = a.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < 4; col++) {
    let pivot = col;
    for (let row = col + 1; row < 4; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < 4; row++) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      for (let k = col; k < 5; k++) m[row][k] -= factor * m[col][k];
    }
  }
  return m.map((row, i) => row[4] / m[i][i]);
}

/** c → e の 3×4 線形回帰（リッジ付き最小二乗）。e は P⁻¹(d) */
function fitResidual(samples: Float64Array, desired: Float64Array, grade: ResolvedMediaColorGrade | null): ColorTransfer | null {
  const count = samples.length / 3;
  if (count < 4) return null;
  const xtx = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
  const xte = [0, 1, 2].map(() => [0, 0, 0, 0]);
  const e = [0, 0, 0];
  for (let k = 0; k < count; k++) {
    const x = [samples[k * 3], samples[k * 3 + 1], samples[k * 3 + 2], 1];
    if (grade) {
      invertGrade(grade, desired[k * 3], desired[k * 3 + 1], desired[k * 3 + 2], e, 0);
    } else {
      e[0] = desired[k * 3];
      e[1] = desired[k * 3 + 1];
      e[2] = desired[k * 3 + 2];
    }
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) xtx[i][j] += x[i] * x[j];
      for (let c = 0; c < 3; c++) xte[c][i] += x[i] * e[c];
    }
  }
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) xtx[i][j] /= count;
    for (let c = 0; c < 3; c++) xte[c][i] /= count;
    // 定数項（オフセット）は縮めない
    if (i < 3) xtx[i][i] += RIDGE;
  }
  const rows = xte.map((rhs) => solve4(xtx, rhs));
  if (rows.some((row) => !row || row.some((v) => !Number.isFinite(v)))) return null;
  const [r, g, b] = rows as number[][];
  // リッジで単位行列から縮んだ分は、誤差の比較で弾かれるので補正しない
  return {
    matrix: [r[0], r[1], r[2], g[0], g[1], g[2], b[0], b[1], b[2]],
    offset: [r[3], g[3], b[3]],
  };
}

/**
 * 自動で合わせた色補正を、スライダーの値と残りの補正に分ける。
 * @param targetPixels 合わせる側（押したカード）のつなぎ目のコマ（RGBA 0〜255）
 * @param transfer MKL で求めた補正（targetPixels を相手の色へ移す）
 */
export function decomposeColorTransfer(
  targetPixels: Uint8ClampedArray | ArrayLike<number>,
  transfer: ColorTransfer,
): DecomposedColorMatch {
  const samples = collectFitSamples(targetPixels);
  const desired = new Float64Array(samples.length);
  for (let k = 0; k < samples.length / 3; k++) {
    applyTransfer(transfer, samples[k * 3], samples[k * 3 + 1], samples[k * 3 + 2], desired, k * 3);
  }

  const fitted = fitColorAdjust(samples, desired);
  const adjust = normalizeMediaColorAdjust(fitted);
  const grade = adjust ? gradeForAdjust(adjust) : null;
  const errorWithAdjustOnly = measureError(samples, desired, grade);

  const residual = fitResidual(samples, desired, grade);
  const errorWithResidual = residual ? measureError(samples, desired, grade, residual) : errorWithAdjustOnly;
  const useResidual = residual !== null && errorWithAdjustOnly - errorWithResidual >= RESIDUAL_MIN_IMPROVEMENT;

  return {
    adjust,
    residual: useResidual ? residual : null,
    errorWithAdjustOnly,
    errorWithResidual: useResidual ? errorWithResidual : errorWithAdjustOnly,
  };
}
