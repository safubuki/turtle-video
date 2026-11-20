/**
 * @file colorMatch.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description AI を使わずに、ある画像の色合いを別の画像へ近づける色転写の計算。
 *
 * 方式: MKL（Monge–Kantorovich Linear）色転写
 *   F. Pitié & A. Kokaram, "The linear Monge-Kantorovitch linear colour mapping for
 *   example-based colour transfer", IET CVMP 2007。
 *
 * 2 枚の画素の RGB 分布を平均と共分散（3×3）で表し、合わせたい側（source）の分布を
 * 基準側（target）の分布へ移す「最も色を動かさない」線形変換（線形最適輸送）を閉形式で求める:
 *
 *   T = Σs^{-1/2} (Σs^{1/2} Σt Σs^{1/2})^{1/2} Σs^{-1/2}
 *   x' = T (x − μs) + μt
 *
 * Reinhard 法（2001。チャンネルごとの平均・標準偏差合わせ）と違い、チャンネル間の相関
 * （例: 青みと明るさが一緒にずれる）まで合わせられ、それでいて分布を壊すほど強くは動かさない。
 * 結果は 3×3 行列＋オフセットなので、毎フレームの適用は GPU の行列 1 回で済み、
 * プレビュー・書き出しで同じ結果になる。
 *
 * 安全策:
 *   - 共分散へ小さな正則化を足し、単色に近い画像でも逆行列が壊れないようにする
 *   - 変換の固有値（色の伸び縮み）を [MIN_GAIN, MAX_GAIN] に制限し、ノイズの増幅を防ぐ
 *   - 合わせたい側がほぼ単色（ばらつき無し）のときは伸縮を推定できないので平均だけ合わせる
 */

export interface RgbStats {
  /** 平均（0〜1） */
  mean: [number, number, number];
  /** 共分散（行優先 3×3） */
  covariance: number[];
  /** 集計に使った画素数 */
  count: number;
}

export interface ColorTransfer {
  /** 行優先 3×3 */
  matrix: number[];
  offset: [number, number, number];
}

/** 色の伸び縮みの下限・上限（固有値）。極端な補正で破綻しないようにする */
export const COLOR_TRANSFER_MIN_GAIN = 0.4;
export const COLOR_TRANSFER_MAX_GAIN = 2.5;
/** 共分散へ足す正則化（0〜1 単位の分散。標準偏差 1% 相当） */
const COVARIANCE_REGULARIZATION = 1e-4;
/** これ未満のばらつき（分散の和）しか無い画像は単色とみなす */
const FLAT_IMAGE_VARIANCE = 2e-5;
/** 半透明の画素（PNG の透過部分）は色の集計に入れない */
const MIN_ALPHA = 128;

/**
 * RGBA（0〜255）の画素列から RGB の平均と共分散を求める。
 * 有効な画素（不透明）が無ければ null。
 */
export function computeRgbStats(data: Uint8ClampedArray | ArrayLike<number>): RgbStats | null {
  let count = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < MIN_ALPHA) continue;
    sr += data[i];
    sg += data[i + 1];
    sb += data[i + 2];
    count++;
  }
  if (count === 0) return null;
  const mr = sr / count / 255;
  const mg = sg / count / 255;
  const mb = sb / count / 255;

  let rr = 0;
  let rg = 0;
  let rb = 0;
  let gg = 0;
  let gb = 0;
  let bb = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < MIN_ALPHA) continue;
    const dr = data[i] / 255 - mr;
    const dg = data[i + 1] / 255 - mg;
    const db = data[i + 2] / 255 - mb;
    rr += dr * dr;
    rg += dr * dg;
    rb += dr * db;
    gg += dg * dg;
    gb += dg * db;
    bb += db * db;
  }
  return {
    mean: [mr, mg, mb],
    covariance: [
      rr / count, rg / count, rb / count,
      rg / count, gg / count, gb / count,
      rb / count, gb / count, bb / count,
    ],
    count,
  };
}

// ---------------------------------------------------------------------------
// 3×3 の線形代数（対称行列のみ扱う）
// ---------------------------------------------------------------------------

export function multiply3(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

function symmetrize3(a: readonly number[]): number[] {
  return [
    a[0], (a[1] + a[3]) / 2, (a[2] + a[6]) / 2,
    (a[1] + a[3]) / 2, a[4], (a[5] + a[7]) / 2,
    (a[2] + a[6]) / 2, (a[5] + a[7]) / 2, a[8],
  ];
}

/**
 * 対称 3×3 行列の固有分解（ヤコビ法）。vectors は列が固有ベクトル（行優先格納）。
 */
export function symmetricEigen3(input: readonly number[]): { values: [number, number, number]; vectors: number[] } {
  const a = symmetrize3(input);
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(a[1]) + Math.abs(a[2]) + Math.abs(a[5]);
    if (off < 1e-15) break;
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        const apq = a[p * 3 + q];
        if (Math.abs(apq) < 1e-18) continue;
        const app = a[p * 3 + p];
        const aqq = a[q * 3 + q];
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        // A' = Jᵀ A J（p, q 行・列の回転）
        for (let k = 0; k < 3; k++) {
          const akp = a[k * 3 + p];
          const akq = a[k * 3 + q];
          a[k * 3 + p] = c * akp - s * akq;
          a[k * 3 + q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p * 3 + k];
          const aqk = a[q * 3 + k];
          a[p * 3 + k] = c * apk - s * aqk;
          a[q * 3 + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k * 3 + p];
          const vkq = v[k * 3 + q];
          v[k * 3 + p] = c * vkp - s * vkq;
          v[k * 3 + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: [a[0], a[4], a[8]], vectors: v };
}

/** 対称行列の固有値へ関数を掛けた行列 V·diag(f(λ))·Vᵀ */
export function mapSymmetric3(a: readonly number[], fn: (value: number) => number): number[] {
  const { values, vectors: v } = symmetricEigen3(a);
  const f = values.map(fn);
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += v[r * 3 + k] * f[k] * v[c * 3 + k];
      out[r * 3 + c] = sum;
    }
  }
  return out;
}

function addDiagonal(a: readonly number[], value: number): number[] {
  const out = [...a];
  out[0] += value;
  out[4] += value;
  out[8] += value;
  return out;
}

function clampGain(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(COLOR_TRANSFER_MAX_GAIN, Math.max(COLOR_TRANSFER_MIN_GAIN, value));
}

/**
 * source の色分布を target の色分布へ移す MKL 変換を求める。
 */
export function computeMklColorTransfer(source: RgbStats, target: RgbStats): ColorTransfer {
  const sourceVariance = source.covariance[0] + source.covariance[4] + source.covariance[8];
  let matrix: number[];
  if (!(sourceVariance >= FLAT_IMAGE_VARIANCE)) {
    // 単色に近い: 伸縮は推定できないので平均だけ合わせる
    matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  } else {
    const a = addDiagonal(source.covariance, COVARIANCE_REGULARIZATION);
    const b = addDiagonal(target.covariance, COVARIANCE_REGULARIZATION);
    const aSqrt = mapSymmetric3(a, (x) => Math.sqrt(Math.max(x, 1e-12)));
    const aInvSqrt = mapSymmetric3(a, (x) => 1 / Math.sqrt(Math.max(x, 1e-12)));
    const middle = mapSymmetric3(
      symmetrize3(multiply3(multiply3(aSqrt, b), aSqrt)),
      (x) => Math.sqrt(Math.max(x, 0)),
    );
    const t = symmetrize3(multiply3(multiply3(aInvSqrt, middle), aInvSqrt));
    matrix = mapSymmetric3(t, clampGain);
  }
  const mu = source.mean;
  const offset: [number, number, number] = [
    target.mean[0] - (matrix[0] * mu[0] + matrix[1] * mu[1] + matrix[2] * mu[2]),
    target.mean[1] - (matrix[3] * mu[0] + matrix[4] * mu[1] + matrix[5] * mu[2]),
    target.mean[2] - (matrix[6] * mu[0] + matrix[7] * mu[1] + matrix[8] * mu[2]),
  ];
  return { matrix, offset };
}

/**
 * 2 つの色分布のおおまかな差（平均の距離＋標準偏差の差。0〜1 単位）。ログ・テスト用。
 */
export function estimateRgbStatsDistance(a: RgbStats, b: RgbStats): number {
  let sum = 0;
  for (let c = 0; c < 3; c++) {
    const dm = a.mean[c] - b.mean[c];
    const ds = Math.sqrt(Math.max(0, a.covariance[c * 4])) - Math.sqrt(Math.max(0, b.covariance[c * 4]));
    sum += dm * dm + ds * ds;
  }
  return Math.sqrt(sum);
}
