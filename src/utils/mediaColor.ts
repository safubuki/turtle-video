/**
 * @file mediaColor.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 動画・画像クリップの色合い（明るさ・コントラスト・彩度・色温度・色かぶり、
 * 前の素材に合わせる自動補正）の正規化と色変換式。
 *
 * 色変換は WebGL シェーダ（mediaColorRenderer.ts）と、ここにある CPU 版
 * `applyMediaColorGradeToRgb()` で同じ式・同じ順序にする。CPU 版は自動合わせの基準色
 * （前の素材の「見えている色」）の計算とテストに使う。
 *
 * 順序（sRGB 0〜1）:
 *   1. 自動補正: m = clamp(M·c + o) を strength で元の色と混ぜる
 *   2. 色温度・色かぶり: チャンネルごとのゲイン（明るさが変わらないよう輝度で正規化）
 *   3. 明るさ: 中間調のガンマ（黒・白の端は動かさない）
 *   4. コントラスト: 50% を軸に倍率
 *   5. 彩度: 輝度との混合
 */
import type { MediaColorAdjust, MediaColorMatch, MediaColorPresetId, MediaItem } from '../types';

export const MEDIA_COLOR_ADJUST_MIN = -100;
export const MEDIA_COLOR_ADJUST_MAX = 100;
export const MEDIA_COLOR_MATCH_STRENGTH_DEFAULT = 100;
export const MEDIA_COLOR_PRESET_STRENGTH_MIN = 0;
export const MEDIA_COLOR_PRESET_STRENGTH_MAX = 150;
export const MEDIA_COLOR_PRESET_STRENGTH_DEFAULT = 100;

export interface MediaColorPresetDefinition {
  id: MediaColorPresetId;
  label: string;
  description: string;
  /** ボタン左端の小さな色見本（CSS カラー） */
  swatch: string;
  /** 強さ 100% 時の基準スライダー値 */
  adjust: MediaColorAdjust;
}

/**
 * 全体の色合い一括設定で選べる雰囲気プリセット。
 * 押すと下の 5 本スライダーへ基準値（×強さ%）が入り、そのまま手動で微調整できる。
 */
export const MEDIA_COLOR_PRESETS: readonly MediaColorPresetDefinition[] = Object.freeze([
  {
    id: 'cool',
    label: 'クール',
    description: '青みがかった爽やか・冷たい雰囲気',
    swatch: '#38bdf8',
    adjust: { brightness: 0, contrast: 10, saturation: -10, temperature: -65, tint: 5 },
  },
  {
    id: 'cinema',
    label: 'シネマ',
    description: '緑がかった映画風の落ち着いた雰囲気',
    swatch: '#34d399',
    adjust: { brightness: -8, contrast: 22, saturation: -20, temperature: -30, tint: -65 },
  },
  {
    id: 'warm',
    label: 'ウォーム',
    description: '暖かみのある夕暮れ・やわらかな光景',
    swatch: '#fb923c',
    adjust: { brightness: 6, contrast: 8, saturation: 10, temperature: 65, tint: 12 },
  },
  {
    id: 'bright',
    label: '明るい',
    description: '軽やかでパッと明るいトーン',
    swatch: '#fde68a',
    adjust: { brightness: 32, contrast: -6, saturation: 12, temperature: 10, tint: 0 },
  },
  {
    id: 'dark',
    label: 'ダーク',
    description: '重厚で引き締まった暗めのトーン',
    swatch: '#64748b',
    adjust: { brightness: -32, contrast: 24, saturation: -18, temperature: -15, tint: 0 },
  },
  {
    id: 'vivid',
    label: 'くっきり',
    description: 'メリハリと鮮やかさを強調',
    swatch: '#f472b6',
    adjust: { brightness: 4, contrast: 28, saturation: 35, temperature: 0, tint: 0 },
  },
  {
    id: 'retro',
    label: 'レトロ',
    description: '少し色あせた懐かしさのある色味',
    swatch: '#d6b27c',
    adjust: { brightness: 6, contrast: -14, saturation: -30, temperature: 45, tint: -18 },
  },
  {
    id: 'mono',
    label: 'モノクロ',
    description: '陰影が際立つ白黒表現',
    swatch: '#e5e7eb',
    adjust: { brightness: 0, contrast: 22, saturation: -100, temperature: 0, tint: 0 },
  },
  {
    id: 'turtle',
    label: 'タートル',
    description: 'タートルビデオ独自の、深く緑がかった印象的な映像美（タートルグリーン）',
    swatch: '#10b981',
    adjust: { brightness: -14, contrast: 52, saturation: 72, temperature: -72, tint: -96 },
  },
]);

export function findMediaColorPreset(
  presetId: MediaColorPresetId | null | undefined,
): MediaColorPresetDefinition | null {
  if (!presetId) return null;
  return MEDIA_COLOR_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

/** プリセットの強さ（0〜150% の整数）。不正値は 100 */
export function normalizeMediaColorPresetStrength(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return MEDIA_COLOR_PRESET_STRENGTH_DEFAULT;
  return Math.round(clamp(value, MEDIA_COLOR_PRESET_STRENGTH_MIN, MEDIA_COLOR_PRESET_STRENGTH_MAX));
}

/** 基準のスライダー値を強さ（0〜150%）でスケーリングして正規化する */
export function scaleMediaColorAdjust(
  base: MediaColorAdjust,
  strengthPercent: number,
): MediaColorAdjust | undefined {
  const ratio = normalizeMediaColorPresetStrength(strengthPercent) / 100;
  return normalizeMediaColorAdjust({
    brightness: base.brightness * ratio,
    contrast: base.contrast * ratio,
    saturation: base.saturation * ratio,
    temperature: base.temperature * ratio,
    tint: base.tint * ratio,
  });
}

/** 有効フラグが ON のときだけ正規化済みの全体色合いを返す（OFF または全項目 0 なら undefined） */
export function resolveEffectiveGlobalColorAdjust(
  enabled: boolean,
  adjust: Partial<MediaColorAdjust> | null | undefined,
): MediaColorAdjust | undefined {
  if (!enabled) return undefined;
  return normalizeMediaColorAdjust(adjust);
}

export const MEDIA_COLOR_ADJUST_KEYS = [
  'brightness',
  'contrast',
  'saturation',
  'temperature',
  'tint',
] as const satisfies ReadonlyArray<keyof MediaColorAdjust>;

export type MediaColorAdjustKey = typeof MEDIA_COLOR_ADJUST_KEYS[number];

export const NEUTRAL_MEDIA_COLOR_ADJUST: Readonly<MediaColorAdjust> = Object.freeze({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
});

/** Rec.709 輝度係数（sRGB 値へそのまま掛ける簡易輝度） */
export const LUMA_WEIGHTS: readonly [number, number, number] = [0.2126, 0.7152, 0.0722];

/** 色温度 ±100 で R/B に掛けるゲインの振れ幅 */
const TEMPERATURE_GAIN_RANGE = 0.15;
/** 色かぶり ±100 で G に掛けるゲインの振れ幅 */
const TINT_GAIN_RANGE = 0.12;

const IDENTITY_MATRIX: readonly number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function normalizeAdjustValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.round(clamp(value, MEDIA_COLOR_ADJUST_MIN, MEDIA_COLOR_ADJUST_MAX));
}

/**
 * 保存データや UI から来た手動調整を安全な範囲（-100〜100 の整数）へそろえる。
 * すべて 0（変更なし）なら undefined を返し、保存・比較で「未設定」と同じに扱う。
 */
export function normalizeMediaColorAdjust(
  adjust: Partial<MediaColorAdjust> | null | undefined,
): MediaColorAdjust | undefined {
  if (!adjust || typeof adjust !== 'object') return undefined;
  const normalized: MediaColorAdjust = {
    brightness: normalizeAdjustValue(adjust.brightness),
    contrast: normalizeAdjustValue(adjust.contrast),
    saturation: normalizeAdjustValue(adjust.saturation),
    temperature: normalizeAdjustValue(adjust.temperature),
    tint: normalizeAdjustValue(adjust.tint),
  };
  return MEDIA_COLOR_ADJUST_KEYS.every((key) => normalized[key] === 0) ? undefined : normalized;
}

/** 未設定なら全項目 0 の値を返す（UI 表示用） */
export function resolveMediaColorAdjust(
  adjust: Partial<MediaColorAdjust> | null | undefined,
): MediaColorAdjust {
  return normalizeMediaColorAdjust(adjust) ?? { ...NEUTRAL_MEDIA_COLOR_ADJUST };
}

function isFiniteArray(value: unknown, length: number): value is number[] {
  return Array.isArray(value)
    && value.length === length
    && value.every((v) => typeof v === 'number' && Number.isFinite(v));
}

/** 自動補正の効き具合（0〜100 の整数）。不正値は 100 */
export function normalizeMediaColorMatchStrength(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return MEDIA_COLOR_MATCH_STRENGTH_DEFAULT;
  return Math.round(clamp(value, 0, 100));
}

/** 行列 1 要素の許容範囲。MKL 側でも固有値を制限しているが、壊れた保存データの保険 */
const MATCH_MATRIX_LIMIT = 8;
const MATCH_OFFSET_LIMIT = 2;

/**
 * 保存データの自動補正を検証する。形が壊れていれば null（補正なし）。
 */
export function normalizeMediaColorMatch(match: unknown): MediaColorMatch | null {
  if (!match || typeof match !== 'object') return null;
  const candidate = match as Partial<MediaColorMatch>;
  if (!isFiniteArray(candidate.matrix, 9) || !isFiniteArray(candidate.offset, 3)) return null;
  return {
    matrix: candidate.matrix.map((v) => Number(clamp(v, -MATCH_MATRIX_LIMIT, MATCH_MATRIX_LIMIT).toFixed(6))),
    offset: candidate.offset.map((v) => Number(clamp(v, -MATCH_OFFSET_LIMIT, MATCH_OFFSET_LIMIT).toFixed(6))),
    strength: normalizeMediaColorMatchStrength(candidate.strength),
  };
}

/** 1 段分の手動・全体色変換パラメータ（シェーダ・CPU 版共通） */
export interface ResolvedMediaColorAdjustParams {
  /** 色温度・色かぶりのチャンネルゲイン */
  gain: [number, number, number];
  /** 明るさのガンマ指数（1 で変更なし） */
  gamma: number;
  /** コントラスト倍率（1 で変更なし） */
  contrast: number;
  /** 彩度倍率（1 で変更なし） */
  saturation: number;
}

/** シェーダへ渡す、正規化済みの色変換パラメータ */
export interface ResolvedMediaColorGrade extends ResolvedMediaColorAdjustParams {
  /** 自動補正の行列（行優先 3×3）。補正なしは単位行列 */
  matchMatrix: number[];
  matchOffset: [number, number, number];
  /** 0〜1 */
  matchStrength: number;
  /**
   * 全体の色合い（個別設定の上に重ね掛けする 2 段目）。
   * 未適用なら null（個別未設定で全体だけ有効なときは 1 段目へそのまま入れる）。
   */
  overlay: ResolvedMediaColorAdjustParams | null;
}

function resolveAdjustParams(adjust: MediaColorAdjust): ResolvedMediaColorAdjustParams {
  const temperature = adjust.temperature / 100;
  const tint = adjust.tint / 100;
  const rawGain: [number, number, number] = [
    1 + TEMPERATURE_GAIN_RANGE * temperature,
    1 - TINT_GAIN_RANGE * tint,
    1 - TEMPERATURE_GAIN_RANGE * temperature,
  ];
  const gainLuma = rawGain[0] * LUMA_WEIGHTS[0] + rawGain[1] * LUMA_WEIGHTS[1] + rawGain[2] * LUMA_WEIGHTS[2];
  const gain = rawGain.map((g) => g / gainLuma) as [number, number, number];

  return {
    gain,
    // +100 で中間調 50% → 約 71%、-100 で約 25%
    gamma: Math.pow(2, -adjust.brightness / 100),
    contrast: Math.pow(2, adjust.contrast / 100),
    saturation: 1 + adjust.saturation / 100,
  };
}

/**
 * クリップの色設定と全体の色合い（重ね掛け）をシェーダ用パラメータへ変換する。
 * どちらも何も変えない設定なら null（描画側は null のとき素材をそのまま描き、余計な GPU 処理をしない）。
 */
export function resolveMediaColorGrade(
  item: Pick<MediaItem, 'colorAdjust' | 'colorMatch'> | null | undefined,
  globalAdjust?: Partial<MediaColorAdjust> | null,
): ResolvedMediaColorGrade | null {
  const itemAdjust = item ? normalizeMediaColorAdjust(item.colorAdjust) : undefined;
  const match = item ? normalizeMediaColorMatch(item.colorMatch) : null;
  const matchStrength = match ? match.strength / 100 : 0;
  const normalizedGlobal = normalizeMediaColorAdjust(globalAdjust);

  const hasItemGrade = Boolean(itemAdjust || matchStrength > 0);
  if (!hasItemGrade && !normalizedGlobal) return null;

  // 個別が未設定で全体だけ有効なときは、1 段目だけで完結させて余計な 2 段目計算を省く
  if (!hasItemGrade && normalizedGlobal) {
    return {
      matchMatrix: [...IDENTITY_MATRIX],
      matchOffset: [0, 0, 0],
      matchStrength: 0,
      ...resolveAdjustParams(normalizedGlobal),
      overlay: null,
    };
  }

  return {
    matchMatrix: matchStrength > 0 && match ? [...match.matrix] : [...IDENTITY_MATRIX],
    matchOffset: matchStrength > 0 && match
      ? [match.offset[0], match.offset[1], match.offset[2]]
      : [0, 0, 0],
    matchStrength,
    ...resolveAdjustParams(itemAdjust ?? NEUTRAL_MEDIA_COLOR_ADJUST),
    overlay: normalizedGlobal ? resolveAdjustParams(normalizedGlobal) : null,
  };
}

function applyAdjustParamsToRgb(
  r: number,
  g: number,
  b: number,
  params: ResolvedMediaColorAdjustParams,
  out: [number, number, number],
): [number, number, number] {
  let cr = clamp01(r * params.gain[0]);
  let cg = clamp01(g * params.gain[1]);
  let cb = clamp01(b * params.gain[2]);

  if (params.gamma !== 1) {
    cr = Math.pow(cr, params.gamma);
    cg = Math.pow(cg, params.gamma);
    cb = Math.pow(cb, params.gamma);
  }

  cr = (cr - 0.5) * params.contrast + 0.5;
  cg = (cg - 0.5) * params.contrast + 0.5;
  cb = (cb - 0.5) * params.contrast + 0.5;

  const luma = cr * LUMA_WEIGHTS[0] + cg * LUMA_WEIGHTS[1] + cb * LUMA_WEIGHTS[2];
  out[0] = clamp01(luma + (cr - luma) * params.saturation);
  out[1] = clamp01(luma + (cg - luma) * params.saturation);
  out[2] = clamp01(luma + (cb - luma) * params.saturation);
  return out;
}

/**
 * シェーダと同じ式で 1 画素（sRGB 0〜1）を変換する。out を渡すと割り当てを避けられる。
 */
export function applyMediaColorGradeToRgb(
  r: number,
  g: number,
  b: number,
  grade: ResolvedMediaColorGrade,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  let cr = r;
  let cg = g;
  let cb = b;

  if (grade.matchStrength > 0) {
    const m = grade.matchMatrix;
    const o = grade.matchOffset;
    const mr = clamp01(m[0] * cr + m[1] * cg + m[2] * cb + o[0]);
    const mg = clamp01(m[3] * cr + m[4] * cg + m[5] * cb + o[1]);
    const mb = clamp01(m[6] * cr + m[7] * cg + m[8] * cb + o[2]);
    const s = grade.matchStrength;
    cr += (mr - cr) * s;
    cg += (mg - cg) * s;
    cb += (mb - cb) * s;
  }

  applyAdjustParamsToRgb(cr, cg, cb, grade, out);
  if (grade.overlay) {
    applyAdjustParamsToRgb(out[0], out[1], out[2], grade.overlay, out);
  }
  return out;
}

/**
 * RGBA（0〜255）の画素列へ色変換をその場で掛ける。自動合わせの基準色の計算に使う。
 */
export function applyMediaColorGradeToRgba(
  data: Uint8ClampedArray,
  grade: ResolvedMediaColorGrade | null,
): void {
  if (!grade) return;
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    applyMediaColorGradeToRgb(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, grade, out);
    data[i] = Math.round(out[0] * 255);
    data[i + 1] = Math.round(out[1] * 255);
    data[i + 2] = Math.round(out[2] * 255);
  }
}

/** 手動調整だけのキー文字列（未設定は空文字） */
export function buildMediaColorAdjustKey(
  adjust: Partial<MediaColorAdjust> | null | undefined,
): string {
  const normalized = normalizeMediaColorAdjust(adjust);
  return normalized ? MEDIA_COLOR_ADJUST_KEYS.map((key) => normalized[key]).join('/') : '';
}

/** 全体の色合い設定の変更検知用キー（プレビュー再描画・自動保存・ポスター用）。OFF または未設定は空文字 */
export function buildGlobalMediaColorKey(
  enabled: boolean,
  adjust: Partial<MediaColorAdjust> | null | undefined,
  includeDisabledState: boolean = false,
): string {
  const adjustKey = buildMediaColorAdjustKey(adjust);
  if (includeDisabledState) {
    return enabled || adjustKey ? `${enabled ? '1' : '0'}:${adjustKey}` : '';
  }
  return enabled && adjustKey ? adjustKey : '';
}

/** 色設定の変更検知用キー（自動保存・キャッシュ・停止中の再描画）。未設定は空文字 */
export function buildMediaColorKey(
  item: Pick<MediaItem, 'colorAdjust' | 'colorMatch'>,
): string {
  const adjustKey = buildMediaColorAdjustKey(item.colorAdjust);
  const match = normalizeMediaColorMatch(item.colorMatch);
  const matchKey = match ? `${match.strength}@${match.matrix.join(',')};${match.offset.join(',')}` : '';
  return adjustKey || matchKey ? `${adjustKey}|${matchKey}` : '';
}

/** 色合いを何か変えているか（UI の「調整中」表示・リセット可否） */
export function hasMediaColorSettings(
  item: Pick<MediaItem, 'colorAdjust' | 'colorMatch'>,
): boolean {
  return Boolean(normalizeMediaColorAdjust(item.colorAdjust) || normalizeMediaColorMatch(item.colorMatch));
}
