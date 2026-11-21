/**
 * @file mediaColor.test.ts
 * @description 色合い（手動調整・自動補正）の正規化と、シェーダと同じ式の CPU 版色変換。
 * 前の素材に色を合わせる MKL 色転写（colorMatch.ts）が、色のずれを実際に戻せることも確かめる。
 */
import { describe, expect, it } from 'vitest';
import {
  MEDIA_COLOR_PRESETS,
  applyMediaColorGradeToRgb,
  applyMediaColorGradeToRgba,
  buildGlobalMediaColorKey,
  buildMediaColorKey,
  findMediaColorPreset,
  hasMediaColorSettings,
  LUMA_WEIGHTS,
  normalizeMediaColorAdjust,
  normalizeMediaColorMatch,
  resolveEffectiveGlobalColorAdjust,
  resolveMediaColorGrade,
  scaleMediaColorAdjust,
} from '../utils/mediaColor';
import {
  COLOR_TRANSFER_MAX_GAIN,
  COLOR_TRANSFER_MIN_GAIN,
  computeMklColorTransfer,
  computeRgbStats,
  estimateRgbStatsDistance,
  mapSymmetric3,
  multiply3,
  symmetricEigen3,
} from '../utils/colorMatch';
import {
  computeColorMatchFromPixels,
  resolveColorMatchEdges,
  resolveColorSampleSize,
  resolveColorSampleSourceTime,
} from '../utils/mediaColorSampler';
import { prepareColorGradedSource, resolveColorWorkSize } from '../utils/mediaColorRenderer';

const luma = (rgb: readonly number[]) => rgb[0] * LUMA_WEIGHTS[0] + rgb[1] * LUMA_WEIGHTS[1] + rgb[2] * LUMA_WEIGHTS[2];

/** 再現性のある疑似乱数（線形合同法） */
function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** 自然画像らしく、明るさと色みに相関がある画素列（RGBA 0〜255） */
function createScenePixels(count: number, seed = 1): Uint8ClampedArray {
  const random = createRandom(seed);
  const data = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    const base = 0.15 + random() * 0.7;
    const hue = random();
    data[i * 4] = Math.round(255 * Math.min(1, base * (0.8 + 0.4 * hue)));
    data[i * 4 + 1] = Math.round(255 * Math.min(1, base * (0.9 + 0.2 * random())));
    data[i * 4 + 2] = Math.round(255 * Math.min(1, base * (1.2 - 0.4 * hue)));
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** 生成 AI の動画などで起きる「同じ絵なのに少し暗く・青い」ずれを再現する */
function applyCast(data: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    out[i] = Math.round(255 * Math.min(1, Math.max(0, r * 0.85 + 0.01)));
    out[i + 1] = Math.round(255 * Math.min(1, Math.max(0, g * 0.9 + 0.02 + 0.03 * b)));
    out[i + 2] = Math.round(255 * Math.min(1, Math.max(0, b * 1.05 + 0.06)));
    out[i + 3] = 255;
  }
  return out;
}

describe('mediaColor: 手動調整の正規化', () => {
  it('未設定・全項目 0 は undefined（保存しない）、範囲外は -100〜100 の整数へそろえる', () => {
    expect(normalizeMediaColorAdjust(undefined)).toBeUndefined();
    expect(normalizeMediaColorAdjust({ brightness: 0, contrast: 0 })).toBeUndefined();
    expect(normalizeMediaColorAdjust({ brightness: 150, contrast: -300, saturation: 12.6, temperature: Number.NaN }))
      .toEqual({ brightness: 100, contrast: -100, saturation: 13, temperature: 0, tint: 0 });
  });

  it('壊れた自動補正は null、範囲外の効き具合は 0〜100 へ', () => {
    expect(normalizeMediaColorMatch(null)).toBeNull();
    expect(normalizeMediaColorMatch({ matrix: [1, 0, 0], offset: [0, 0, 0], strength: 100 })).toBeNull();
    expect(normalizeMediaColorMatch({ matrix: [1, 0, 0, 0, 1, 0, 0, 0, Number.NaN], offset: [0, 0, 0], strength: 100 })).toBeNull();
    expect(normalizeMediaColorMatch({ matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [0, 0, 0], strength: 250 })?.strength).toBe(100);
    expect(normalizeMediaColorMatch({ matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [0, 0, 0] })?.strength).toBe(100);
  });

  it('何も変えない設定では色変換をしない（null）', () => {
    expect(resolveMediaColorGrade({})).toBeNull();
    expect(resolveMediaColorGrade({ colorAdjust: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 } })).toBeNull();
    expect(resolveMediaColorGrade({
      colorMatch: { matrix: [2, 0, 0, 0, 2, 0, 0, 0, 2], offset: [0, 0, 0], strength: 0 },
    })).toBeNull();
    expect(hasMediaColorSettings({})).toBe(false);
    expect(buildMediaColorKey({})).toBe('');
  });

  it('変更検知キーは手動・自動どちらの変更でも変わる', () => {
    const match = { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [0.1, 0, 0], strength: 100 };
    const keys = new Set([
      buildMediaColorKey({}),
      buildMediaColorKey({ colorAdjust: { brightness: 10, contrast: 0, saturation: 0, temperature: 0, tint: 0 } }),
      buildMediaColorKey({ colorAdjust: { brightness: 11, contrast: 0, saturation: 0, temperature: 0, tint: 0 } }),
      buildMediaColorKey({ colorMatch: match }),
      buildMediaColorKey({ colorMatch: { ...match, strength: 50 } }),
    ]);
    expect(keys.size).toBe(5);
  });
});

describe('mediaColor: 色変換（シェーダと同じ式）', () => {
  const grade = (adjust: Partial<Record<'brightness' | 'contrast' | 'saturation' | 'temperature' | 'tint', number>>) =>
    resolveMediaColorGrade({ colorAdjust: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, ...adjust } })!;

  it('明るさは中間調を上げ下げし、黒と白は動かさない', () => {
    const brighter = grade({ brightness: 50 });
    const darker = grade({ brightness: -50 });
    expect(applyMediaColorGradeToRgb(0.5, 0.5, 0.5, brighter)[0]).toBeGreaterThan(0.6);
    expect(applyMediaColorGradeToRgb(0.5, 0.5, 0.5, darker)[0]).toBeLessThan(0.4);
    expect(applyMediaColorGradeToRgb(0, 0, 0, brighter)).toEqual([0, 0, 0]);
    expect(applyMediaColorGradeToRgb(1, 1, 1, darker)).toEqual([1, 1, 1]);
  });

  it('コントラストは 50% を軸に広げ・狭める', () => {
    const up = grade({ contrast: 100 });
    expect(applyMediaColorGradeToRgb(0.5, 0.5, 0.5, up)[0]).toBeCloseTo(0.5, 6);
    expect(applyMediaColorGradeToRgb(0.6, 0.6, 0.6, up)[0]).toBeCloseTo(0.7, 6);
    const down = grade({ contrast: -100 });
    expect(applyMediaColorGradeToRgb(0.2, 0.2, 0.2, down)[0]).toBeCloseTo(0.35, 6);
  });

  it('彩度 -100 は白黒（輝度は保つ）、+ はあざやかに', () => {
    const gray = applyMediaColorGradeToRgb(0.8, 0.4, 0.2, grade({ saturation: -100 }));
    expect(gray[0]).toBeCloseTo(gray[1], 6);
    expect(gray[1]).toBeCloseTo(gray[2], 6);
    expect(gray[0]).toBeCloseTo(luma([0.8, 0.4, 0.2]), 6);
    const vivid = applyMediaColorGradeToRgb(0.6, 0.5, 0.4, grade({ saturation: 50 }));
    expect(vivid[0] - vivid[2]).toBeGreaterThan(0.2);
  });

  it('色温度・色かぶりは色みだけ変え、灰色の明るさはほぼ変えない', () => {
    const warm = applyMediaColorGradeToRgb(0.5, 0.5, 0.5, grade({ temperature: 60 }));
    expect(warm[0]).toBeGreaterThan(warm[2]);
    expect(luma(warm)).toBeCloseTo(0.5, 2);
    const cool = applyMediaColorGradeToRgb(0.5, 0.5, 0.5, grade({ temperature: -60 }));
    expect(cool[2]).toBeGreaterThan(cool[0]);
    const magenta = applyMediaColorGradeToRgb(0.5, 0.5, 0.5, grade({ tint: 60 }));
    expect(magenta[1]).toBeLessThan(magenta[0]);
    expect(luma(magenta)).toBeCloseTo(0.5, 2);
  });

  it('自動補正は効き具合で元の色と混ぜる', () => {
    const match = { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [0.2, 0, 0], strength: 100 };
    const full = resolveMediaColorGrade({ colorMatch: match })!;
    const half = resolveMediaColorGrade({ colorMatch: { ...match, strength: 50 } })!;
    expect(applyMediaColorGradeToRgb(0.4, 0.4, 0.4, full)[0]).toBeCloseTo(0.6, 6);
    expect(applyMediaColorGradeToRgb(0.4, 0.4, 0.4, half)[0]).toBeCloseTo(0.5, 6);
  });

  it('RGBA 画素列へその場で掛ける（透明度は変えない）', () => {
    const data = new Uint8ClampedArray([128, 128, 128, 77]);
    applyMediaColorGradeToRgba(data, grade({ brightness: 50 }));
    expect(data[0]).toBeGreaterThan(150);
    expect(data[3]).toBe(77);
    const untouched = new Uint8ClampedArray([10, 20, 30, 255]);
    applyMediaColorGradeToRgba(untouched, null);
    expect([...untouched]).toEqual([10, 20, 30, 255]);
  });
});

describe('colorMatch: MKL 色転写', () => {
  it('対称行列の固有分解は元の行列を復元する', () => {
    const a = [0.04, 0.01, -0.005, 0.01, 0.03, 0.002, -0.005, 0.002, 0.02];
    const { values, vectors } = symmetricEigen3(a);
    const rebuilt = mapSymmetric3(a, (x) => x);
    rebuilt.forEach((v, i) => expect(v).toBeCloseTo(a[i], 10));
    // 平方根の 2 乗は元に戻る
    const sqrt = mapSymmetric3(a, Math.sqrt);
    multiply3(sqrt, sqrt).forEach((v, i) => expect(v).toBeCloseTo(a[i], 10));
    expect(values.every((v) => v > 0)).toBe(true);
    expect(vectors).toHaveLength(9);
  });

  it('変換後の分布は基準側の平均・共分散に一致する', () => {
    const reference = computeRgbStats(createScenePixels(4000, 3))!;
    const source = computeRgbStats(applyCast(createScenePixels(4000, 3)))!;
    const { matrix, offset } = computeMklColorTransfer(source, reference);
    // 平均: T μs + o = μt
    for (let c = 0; c < 3; c++) {
      const mapped = matrix[c * 3] * source.mean[0] + matrix[c * 3 + 1] * source.mean[1] + matrix[c * 3 + 2] * source.mean[2] + offset[c];
      expect(mapped).toBeCloseTo(reference.mean[c], 8);
    }
    // 共分散: T Σs Tᵀ ≈ Σt（正則化の分だけ僅かにずれる）
    const transposed = [matrix[0], matrix[3], matrix[6], matrix[1], matrix[4], matrix[7], matrix[2], matrix[5], matrix[8]];
    const mappedCov = multiply3(multiply3(matrix, source.covariance), transposed);
    mappedCov.forEach((v, i) => expect(Math.abs(v - reference.covariance[i])).toBeLessThan(2e-4));
  });

  it('同じ分布なら何もしない（単位行列・オフセット 0）', () => {
    const stats = computeRgbStats(createScenePixels(2000, 9))!;
    const { matrix, offset } = computeMklColorTransfer(stats, stats);
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => expect(matrix[i]).toBeCloseTo(v, 6));
    offset.forEach((v) => expect(v).toBeCloseTo(0, 6));
  });

  it('単色の素材は伸縮を推定せず平均だけ合わせる', () => {
    const flat = new Uint8ClampedArray(400 * 4);
    for (let i = 0; i < flat.length; i += 4) flat.set([100, 100, 100, 255], i);
    const { matrix, offset } = computeMklColorTransfer(computeRgbStats(flat)!, computeRgbStats(createScenePixels(400))!);
    expect(matrix).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(offset.every(Number.isFinite)).toBe(true);
  });

  it('極端な差でも色の伸び縮みは制限内に収める（ノイズを増幅しすぎない）', () => {
    const narrow = new Uint8ClampedArray(1000 * 4);
    const random = createRandom(5);
    for (let i = 0; i < narrow.length; i += 4) {
      const v = 120 + Math.round(random() * 6);
      narrow.set([v, v, v, 255], i);
    }
    const { matrix } = computeMklColorTransfer(computeRgbStats(narrow)!, computeRgbStats(createScenePixels(1000))!);
    const { values } = symmetricEigen3(matrix);
    values.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(COLOR_TRANSFER_MIN_GAIN - 1e-9);
      expect(v).toBeLessThanOrEqual(COLOR_TRANSFER_MAX_GAIN + 1e-9);
    });
  });

  it('透明な画素は集計しない。不透明な画素が無ければ null', () => {
    expect(computeRgbStats(new Uint8ClampedArray([255, 0, 0, 0]))).toBeNull();
    const stats = computeRgbStats(new Uint8ClampedArray([255, 0, 0, 0, 0, 0, 255, 255]))!;
    expect(stats.count).toBe(1);
    expect(stats.mean).toEqual([0, 0, 1]);
  });
});

describe('前の素材に色を合わせる（画素からの計算）', () => {
  it('色のずれた次の素材を、前の素材の色合いへ戻す', () => {
    const reference = createScenePixels(6000, 11);
    const target = applyCast(reference);
    const result = computeColorMatchFromPixels(reference, target)!;
    // 暗く・青くずれた素材なので、スライダーは「明るく・暖かく」へ動く
    expect(result.adjust!.brightness).toBeGreaterThan(0);
    expect(result.adjust!.temperature).toBeGreaterThan(0);

    // 描画と同じく「残りの補正 → スライダー」の順に掛ける
    const corrected = new Uint8ClampedArray(target);
    applyMediaColorGradeToRgba(corrected, resolveMediaColorGrade({ colorMatch: result.match, colorAdjust: result.adjust }));
    const referenceStats = computeRgbStats(reference)!;
    const before = estimateRgbStatsDistance(referenceStats, computeRgbStats(target)!);
    const after = estimateRgbStatsDistance(referenceStats, computeRgbStats(corrected)!);
    expect(before).toBeCloseTo(result.distanceBefore, 10);
    expect(before).toBeGreaterThan(0.04);
    // 差は 1/10 以下になる（8bit への丸め分だけ残る）
    expect(after).toBeLessThan(before / 10);

    // 画素ごとにも元の色へ近づく（同じ絵から作った続きの動画を想定）
    let errorBefore = 0;
    let errorAfter = 0;
    for (let i = 0; i < reference.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        errorBefore += Math.abs(target[i + c] - reference[i + c]);
        errorAfter += Math.abs(corrected[i + c] - reference[i + c]);
      }
    }
    expect(errorAfter).toBeLessThan(errorBefore / 3);
  });

  it('明るさ・色温度だけのずれは、スライダーの値だけで表し、残りの補正を付けない', () => {
    const reference = createScenePixels(6000, 21);
    // 「暗く・青く」ずれた素材を、手動調整の式そのもので作る
    const target = new Uint8ClampedArray(reference);
    applyMediaColorGradeToRgba(target, resolveMediaColorGrade({
      colorAdjust: { brightness: -20, contrast: 0, saturation: 0, temperature: -30, tint: 0 },
    }));
    const result = computeColorMatchFromPixels(reference, target)!;
    expect(result.match).toBeNull();
    // 逆向き（明るく・暖かく）の値がスライダーに入る（式が非線形なのでおおよそ）
    expect(result.adjust!.brightness).toBeGreaterThanOrEqual(12);
    expect(result.adjust!.brightness).toBeLessThanOrEqual(28);
    expect(result.adjust!.temperature).toBeGreaterThanOrEqual(20);
    expect(result.adjust!.temperature).toBeLessThanOrEqual(40);
    expect(Math.abs(result.adjust!.tint)).toBeLessThanOrEqual(8);
  });

  it('スライダーで表しきれない色同士のずれ（暗い所だけ青い）は、残りの補正として付ける', () => {
    const reference = createScenePixels(6000, 31);
    const target = new Uint8ClampedArray(reference);
    for (let i = 0; i < target.length; i += 4) {
      const luma = (reference[i] + reference[i + 1] + reference[i + 2]) / 3 / 255;
      // 暗い所ほど青を足す（明るい所はそのまま）
      target[i + 2] = Math.min(255, reference[i + 2] + Math.round(70 * (1 - luma)));
    }
    const result = computeColorMatchFromPixels(reference, target)!;
    expect(result.match).not.toBeNull();
    const corrected = new Uint8ClampedArray(target);
    applyMediaColorGradeToRgba(corrected, resolveMediaColorGrade({ colorMatch: result.match, colorAdjust: result.adjust }));
    const onlyAdjust = new Uint8ClampedArray(target);
    applyMediaColorGradeToRgba(onlyAdjust, resolveMediaColorGrade({ colorAdjust: result.adjust }));
    const meanError = (pixels: Uint8ClampedArray) => {
      let sum = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        for (let c = 0; c < 3; c++) sum += Math.abs(pixels[i + c] - reference[i + c]);
      }
      return sum / (pixels.length / 4 * 3);
    };
    expect(meanError(corrected)).toBeLessThan(meanError(onlyAdjust));
    expect(meanError(corrected)).toBeLessThan(meanError(target) / 3);
  });

  it('不透明な画素が無い素材には合わせない', () => {
    expect(computeColorMatchFromPixels(new Uint8ClampedArray([0, 0, 0, 0]), createScenePixels(10))).toBeNull();
  });

  it('前に合わせるなら「前の最後」と「自分の最初」、次に合わせるなら「次の最初」と「自分の最後」を比べる', () => {
    expect(resolveColorMatchEdges('previous')).toEqual({ referenceEdge: 'end', targetEdge: 'start' });
    expect(resolveColorMatchEdges('next')).toEqual({ referenceEdge: 'start', targetEdge: 'end' });
  });

  it('読み取る時刻は前の素材の最後のコマ・この素材の最初のコマ（トリム範囲内）', () => {
    const video = { type: 'video' as const, url: 'blob:v', trimStart: 2, trimEnd: 6, originalDuration: 10 };
    expect(resolveColorSampleSourceTime(video, 'end')).toBeCloseTo(6 - 1 / 30, 6);
    expect(resolveColorSampleSourceTime(video, 'start')).toBeCloseTo(2 + 1 / 60, 6);
    // trimEnd 未確定（0）の旧データは素材の長さを使う
    expect(resolveColorSampleSourceTime({ ...video, trimStart: 0, trimEnd: 0 }, 'end')).toBeCloseTo(10 - 1 / 30, 6);
    expect(resolveColorSampleSize(1920, 1080)).toEqual({ width: 192, height: 108 });
    expect(resolveColorSampleSize(100, 50)).toEqual({ width: 100, height: 50 });
  });
});

describe('mediaColorRenderer', () => {
  it('色を変えない設定・WebGL の無い環境では素材をそのまま返す（描画は止めない）', () => {
    const source = document.createElement('canvas');
    expect(prepareColorGradedSource(source, 100, 50, null)).toBe(source);
    const grade = resolveMediaColorGrade({ colorAdjust: { brightness: 20, contrast: 0, saturation: 0, temperature: 0, tint: 0 } });
    // jsdom には WebGL が無い
    expect(prepareColorGradedSource(source, 100, 50, grade)).toBe(source);
  });

  it('作業キャンバスは素材の解像度のまま、長辺 3840 までに抑える', () => {
    expect(resolveColorWorkSize(1920, 1080)).toEqual({ width: 1920, height: 1080 });
    expect(resolveColorWorkSize(7680, 4320)).toEqual({ width: 3840, height: 2160 });
  });
});

describe('全体の色合い（重ね掛け・雰囲気プリセット）', () => {
  it('個別未設定で全体だけ有効なときは 1 段目で完結し、両方あるときは個別→全体の 2 段重ね掛けになる', () => {
    const globalWarm = { brightness: 0, contrast: 0, saturation: 0, temperature: 65, tint: 0 };
    const onlyGlobal = resolveMediaColorGrade({}, globalWarm);
    expect(onlyGlobal).not.toBeNull();
    expect(onlyGlobal!.overlay).toBeNull();

    // 個別で白黒（彩度 -100）にした上から全体ウォームを重ねると、白黒に暖かみが乗る（R > B）
    const monoItem = { colorAdjust: { brightness: 0, contrast: 0, saturation: -100, temperature: 0, tint: 0 } };
    const stacked = resolveMediaColorGrade(monoItem, globalWarm)!;
    expect(stacked.overlay).not.toBeNull();
    const [r, , b] = applyMediaColorGradeToRgb(0.2, 0.5, 0.8, stacked);
    expect(r).toBeGreaterThan(b);

    // 段階的に別々で掛けた結果と 2 段重ね掛けの結果が一致する
    const step1 = applyMediaColorGradeToRgb(0.3, 0.5, 0.7, resolveMediaColorGrade(monoItem)!);
    const step2 = applyMediaColorGradeToRgb(step1[0], step1[1], step1[2], resolveMediaColorGrade({}, globalWarm)!);
    const combined = applyMediaColorGradeToRgb(0.3, 0.5, 0.7, stacked);
    expect(combined[0]).toBeCloseTo(step2[0], 6);
    expect(combined[1]).toBeCloseTo(step2[1], 6);
    expect(combined[2]).toBeCloseTo(step2[2], 6);
  });

  it('雰囲気プリセットは 9 種（タートル含む）すべて有効で、強さ 0〜150% でクランプ付きスケーリングできる', () => {
    expect(MEDIA_COLOR_PRESETS).toHaveLength(9);
    const cinema = findMediaColorPreset('cinema')!;
    expect(cinema.adjust.tint).toBeLessThan(0);

    const turtle = findMediaColorPreset('turtle')!;
    expect(turtle.label).toBe('タートル');
    expect(turtle.adjust.tint).toBeLessThan(-80);
    expect(turtle.adjust.temperature).toBeLessThan(-50);
    expect(turtle.adjust.contrast).toBeGreaterThan(30);
    expect(turtle.adjust.saturation).toBeGreaterThan(50);

    expect(scaleMediaColorAdjust(cinema.adjust, 0)).toBeUndefined();
    const half = scaleMediaColorAdjust(cinema.adjust, 50)!;
    expect(Math.abs(half.tint)).toBeLessThan(Math.abs(cinema.adjust.tint));
    const strong = scaleMediaColorAdjust(cinema.adjust, 150)!;
    expect(strong.tint).toBeGreaterThanOrEqual(-100);
    expect(strong.tint).toBeLessThan(cinema.adjust.tint);

    const monoStrong = scaleMediaColorAdjust(findMediaColorPreset('mono')!.adjust, 150)!;
    expect(monoStrong.saturation).toBe(-100);
  });

  it('全体色合いの有効解決と変更検知キーは ON/OFF と値変化を正しく区別する', () => {
    const cool = findMediaColorPreset('cool')!.adjust;
    expect(resolveEffectiveGlobalColorAdjust(false, cool)).toBeUndefined();
    expect(resolveEffectiveGlobalColorAdjust(true, cool)).toEqual(cool);
    expect(buildGlobalMediaColorKey(false, cool)).toBe('');
    expect(buildGlobalMediaColorKey(true, cool)).not.toBe('');
    expect(buildGlobalMediaColorKey(false, cool, true)).toContain('0:');
    expect(buildGlobalMediaColorKey(true, cool, true)).toContain('1:');
  });
});
