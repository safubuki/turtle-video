/**
 * @file canvasStore.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description プレビュー / エクスポートのキャンバスサイズを管理するストア。
 *
 * プレビューは描画負荷を抑えるため上限 1280×720 とする。
 * 書き出し時のみ、ソース動画の解像度に応じて 1920×1080 まで動的に拡大する。
 * 出力アスペクト比は常に 16:9 に固定し（先頭動画の比率に引きずられない）、
 * 16:9 でない横長ソースは黒帯付きで内包する。縦長ソースは既定サイズへフォールバックする。
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
  MAX_CANVAS_WIDTH,
  MAX_CANVAS_HEIGHT,
  MAX_PREVIEW_CANVAS_WIDTH,
  MAX_PREVIEW_CANVAS_HEIGHT,
} from '../constants';
import { normalizeRotation, resolveRotatedFitDimensions } from '../utils/canvas';
import { normalizeMediaZoomScale } from '../utils/mediaZoom';

/**
 * 出力品質モード。
 * - auto: 先頭動画（または素材に合わせる時は基準素材）のソース解像度に合わせる（上限 1920×1080 相当）
 * - fhd:  高画質上限で書き出す（16:9=1920×1080 / 9:16=1080×1920 / 1:1=1080×1080）
 * - hd:   標準画質上限で書き出す（16:9=1280×720 / 9:16=720×1280 / 1:1=720×720）
 */
export type ExportQuality = 'auto' | 'fhd' | 'hd';

/**
 * 出力の向き（アスペクト比モード）。
 * - landscape: 16:9 横（従来・既定）
 * - portrait:  9:16 縦（ショート動画向け）
 * - auto:      素材に合わせる（正方形・オリジナル比率対応）
 * 向きはプロジェクトごとに保持し、保存/読込で復元する。
 */
export type AspectRatio = 'landscape' | 'portrait' | 'auto';

/** 「素材に合わせる」モードのアスペクト比（幅/高さ）の安全範囲（縦 9:16 〜 横 21:9） */
export const AUTO_ASPECT_MIN = 9 / 16;
export const AUTO_ASPECT_MAX = 21 / 9;

/** 正方形（1:1）とみなす許容誤差（幅/高さが 0.95〜1.05 なら正方形扱い） */
export const SQUARE_ASPECT_TOLERANCE = 0.05;

/** 「画面いっぱいに合わせる（切り抜き）」ボタンを出す最小倍率差（既存の黒帯除去 102.5% より大きい場合） */
const COVER_FILL_MIN_SCALE_DIFF = 1.03;

/** 保存値・入力値を安全な AspectRatio へ正規化する（旧データや未知値は landscape） */
export function normalizeAspectRatio(value: unknown): AspectRatio {
  if (value === 'portrait' || value === 'auto') return value;
  return 'landscape';
}

/** 各向きの目標アスペクト比（幅/高さ）。auto のフォールバック時は 16:9 */
export function getTargetAspect(aspectRatio: AspectRatio): number {
  return aspectRatio === 'portrait' ? 9 / 16 : 16 / 9;
}

/**
 * 出力モードに応じた素材の初期フィット方式を返す（プレビュー・書き出し・ミニプレビュー・サムネイル共通）。
 * - portrait（9:16 固定）: 従来どおり cover（横素材を縦いっぱいに埋める）
 * - landscape（16:9 固定）/ auto（素材に合わせる）: contain（勝手に切り抜かず全体表示）
 */
export function resolveMediaFitMode(aspectRatio: AspectRatio): 'contain' | 'cover' {
  return aspectRatio === 'portrait' ? 'cover' : 'contain';
}

/**
 * 複数素材からキャンバス計算の基準となるソース解像度（回転後）を選定する。
 *
 * - `auto`（素材に合わせる）:
 *   動画・画像の両方を対象とし、90°/270°回転済みの素材は回転後の寸法で判定する。
 *   正方形（1:1 ±5%）より長方形を優先し、長方形が複数あるときは先頭（1 番目）の長方形を採用する。
 *   すべて正方形なら先頭の正方形を採用する。有効な寸法が無ければ null。
 * - `landscape` / `portrait`:
 *   従来どおり、先頭の動画クリップの寸法を返す（画像のみなら null で既定枠）。
 */
export function resolveCanvasReferenceDimensions(
  items: ReadonlyArray<{
    type: 'video' | 'image';
    sourceWidth?: number;
    sourceHeight?: number;
    rotation?: number;
  }>,
  aspectRatio: AspectRatio,
): { width: number; height: number } | null {
  if (aspectRatio !== 'auto') {
    const firstVideo = items.find((item) => item.type === 'video');
    if (
      firstVideo
      && Number.isFinite(firstVideo.sourceWidth)
      && Number.isFinite(firstVideo.sourceHeight)
      && (firstVideo.sourceWidth as number) > 0
      && (firstVideo.sourceHeight as number) > 0
    ) {
      return { width: firstVideo.sourceWidth as number, height: firstVideo.sourceHeight as number };
    }
    return null;
  }

  let firstSquare: { width: number; height: number } | null = null;
  for (const item of items) {
    if (
      !Number.isFinite(item.sourceWidth)
      || !Number.isFinite(item.sourceHeight)
      || (item.sourceWidth as number) <= 0
      || (item.sourceHeight as number) <= 0
    ) {
      continue;
    }
    const rotationDeg = normalizeRotation(item.rotation);
    const rotated = resolveRotatedFitDimensions(
      item.sourceWidth as number,
      item.sourceHeight as number,
      rotationDeg,
    );
    const aspect = rotated.width / rotated.height;
    const isSquare = Math.abs(aspect - 1) <= SQUARE_ASPECT_TOLERANCE;
    if (!isSquare) {
      return { width: rotated.width, height: rotated.height };
    }
    if (!firstSquare) {
      firstSquare = { width: rotated.width, height: rotated.height };
    }
  }
  return firstSquare;
}

/**
 * 異比率クリップで黒帯を消して画面いっぱいに広げる（切り抜き）ための拡大倍率を求める。
 * 既に枠を埋めるモード（cover）または比率差がごくわずか（3% 以下）のときは null を返す。
 */
export function computeMediaCoverFillScale(input: {
  canvasWidth: number;
  canvasHeight: number;
  elementWidth: number;
  elementHeight: number;
  baseMode: 'contain' | 'cover';
}): number | null {
  const { canvasWidth, canvasHeight, elementWidth, elementHeight, baseMode } = input;
  if (baseMode === 'cover') return null;
  if (
    !Number.isFinite(canvasWidth) || !Number.isFinite(canvasHeight)
    || !Number.isFinite(elementWidth) || !Number.isFinite(elementHeight)
    || canvasWidth <= 0 || canvasHeight <= 0 || elementWidth <= 0 || elementHeight <= 0
  ) {
    return null;
  }
  const containScale = Math.min(canvasWidth / elementWidth, canvasHeight / elementHeight);
  const coverScale = Math.max(canvasWidth / elementWidth, canvasHeight / elementHeight);
  if (containScale <= 0) return null;
  const fillScale = coverScale / containScale;
  if (fillScale <= COVER_FILL_MIN_SCALE_DIFF) return null;
  return normalizeMediaZoomScale(fillScale);
}

const KNOWN_ASPECT_LABELS: ReadonlyArray<{ ratio: number; label: string }> = [
  { ratio: 16 / 9, label: '16:9' },
  { ratio: 9 / 16, label: '9:16' },
  { ratio: 1, label: '1:1' },
  { ratio: 4 / 3, label: '4:3' },
  { ratio: 3 / 4, label: '3:4' },
  { ratio: 4 / 5, label: '4:5' },
  { ratio: 5 / 4, label: '5:4' },
  { ratio: 3 / 2, label: '3:2' },
  { ratio: 2 / 3, label: '2:3' },
  { ratio: 21 / 9, label: '21:9' },
];

/** 出力サイズと代表的な比率ラベルを整形する（例: "1080×1080 (1:1)" / 特殊比は "1420×1080"） */
export function formatCanvasSizeBadge(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '';
  }
  const w = Math.round(width);
  const h = Math.round(height);
  const aspect = w / h;
  const matched = KNOWN_ASPECT_LABELS.find((entry) => Math.abs(aspect - entry.ratio) <= 0.025);
  return matched ? `${w}×${h} (${matched.label})` : `${w}×${h}`;
}

/**
 * メディア（画像/動画）を Canvas に描く際の基準スケールを求める純ロジック。
 *
 * - `mode='contain'`: 全体が収まる（枠内に内包、はみ出しなし・黒帯あり）。従来の横向きと同じ。
 * - `mode='cover'`:   枠を埋める（短辺を合わせ、長辺方向がはみ出してカットされる）。
 *
 * 縦(9:16)モードでは横素材を「縦フレームを埋める（cover・左右カット）」で初期配置し、
 * 横(16:9)モードは従来どおり contain を使う（既存挙動を変えない）。
 * ユーザーの scale(拡大)・positionX/Y(XY) はこの基準スケールに乗るだけなので不変。
 */
export function resolveMediaBaseScale(input: {
  canvasWidth: number;
  canvasHeight: number;
  elementWidth: number;
  elementHeight: number;
  mode: 'contain' | 'cover';
}): number {
  const { canvasWidth, canvasHeight, elementWidth, elementHeight, mode } = input;
  if (!Number.isFinite(elementWidth) || !Number.isFinite(elementHeight)
    || elementWidth <= 0 || elementHeight <= 0) {
    return 1;
  }
  const scaleX = canvasWidth / elementWidth;
  const scaleY = canvasHeight / elementHeight;
  return mode === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
}

export const EXPORT_QUALITY_STORAGE_KEY = 'turtle-video-export-quality';

export function readStoredExportQuality(): ExportQuality {
  try {
    const value = localStorage.getItem(EXPORT_QUALITY_STORAGE_KEY);
    if (value === 'fhd' || value === 'hd') return value;
  } catch {
    // localStorage が使えない環境では既定値
  }
  return 'auto';
}

function persistExportQuality(quality: ExportQuality): void {
  try {
    if (quality === 'auto') {
      localStorage.removeItem(EXPORT_QUALITY_STORAGE_KEY);
    } else {
      localStorage.setItem(EXPORT_QUALITY_STORAGE_KEY, quality);
    }
  } catch {
    // localStorage が使えない環境では何もしない
  }
}

interface CanvasState {
  /** 現在キャンバス要素が取るサイズ（プレビュー時は preview*、エクスポート時は export*）。 */
  width: number;
  height: number;
  /** プレビュー専用のサイズ（軽量描画用、上限 1280×720）。 */
  previewWidth: number;
  previewHeight: number;
  /** 書き出し時のキャンバスサイズ（最大 1920×1080）。 */
  exportWidth: number;
  exportHeight: number;
  /** 現在エクスポートモードか。プレビューサイズへの自動戻しに使う。 */
  isExportMode: boolean;
  /** 出力品質モード（localStorage に永続化） */
  exportQuality: ExportQuality;
  /** 出力の向き（プロジェクトごとに保持。既定は landscape=16:9）。 */
  aspectRatio: AspectRatio;
  /** 直近に適用したソース動画の解像度（品質モード変更時の再計算用） */
  lastSourceWidth: number | null;
  lastSourceHeight: number | null;
  /** ソース動画の解像度を入力し、プレビュー/エクスポート両方のサイズを更新する。 */
  applyFromSource: (sourceWidth: number, sourceHeight: number) => void;
  /** 出力品質モードを変更し、エクスポートサイズを再計算する。 */
  setExportQuality: (quality: ExportQuality) => void;
  /** 出力の向きを変更し、プレビュー/エクスポートサイズを再計算する。 */
  setAspectRatio: (aspectRatio: AspectRatio) => void;
  /** ストアを既定状態へ戻す。 */
  resetCanvasSize: () => void;
  /** 書き出し開始時に呼び出し、キャンバスを高解像度モードへ切り替える。 */
  beginExportMode: () => void;
  /** 書き出し終了時に呼び出し、プレビューサイズへ戻す。 */
  endExportMode: () => void;
}

/**
 * 指定した向き（landscape=16:9 / portrait=9:16）の最大枠を、
 * 呼び出し側が渡す landscape 基準の max{Width,Height} から導出する。
 * 例: (1920, 1080) → landscape は 1920×1080、portrait は 1080×1920。
 */
function resolveOrientedMaxFrame(
  maxWidth: number,
  maxHeight: number,
  aspectRatio: AspectRatio,
): { maxW: number; maxH: number } {
  const longSide = Math.max(maxWidth, maxHeight);
  const shortSide = Math.min(maxWidth, maxHeight);
  return aspectRatio === 'portrait'
    ? { maxW: shortSide, maxH: longSide }
    : { maxW: longSide, maxH: shortSide };
}

/**
 * 「素材に合わせる（auto）」モードで、目標比率を保ちながら
 * 「長辺 <= longLimit かつ 短辺 <= shortLimit」の最大枠を返す（H.264 偶数丸め）。
 * 例 (1920, 1080): 16:9→1920×1080 / 9:16→1080×1920 / 1:1→1080×1080 / 4:3→1440×1080 / 21:9→1920×822
 */
function resolveAutoMaxFrame(
  maxWidth: number,
  maxHeight: number,
  targetAspect: number,
): { width: number; height: number } {
  const longLimit = Math.max(maxWidth, maxHeight);
  const shortLimit = Math.min(maxWidth, maxHeight);
  if (targetAspect >= 1) {
    // 横長・正方形: 高さは shortLimit まで、幅は longLimit まで
    if (shortLimit * targetAspect <= longLimit) {
      return {
        width: roundToEven(shortLimit * targetAspect),
        height: roundToEven(shortLimit),
      };
    }
    return {
      width: roundToEven(longLimit),
      height: roundToEven(longLimit / targetAspect),
    };
  }
  // 縦長: 幅は shortLimit まで、高さは longLimit まで
  if (shortLimit / targetAspect <= longLimit) {
    return {
      width: roundToEven(shortLimit),
      height: roundToEven(shortLimit / targetAspect),
    };
  }
  return {
    width: roundToEven(longLimit * targetAspect),
    height: roundToEven(longLimit),
  };
}

/**
 * ソースサイズと最大サイズから、指定した向きのキャンバスサイズを算出する。
 *
 * - landscape / portrait: 出力アスペクト比を固定する（16:9 / 9:16）。先頭動画の比率に引きずられない。
 * - auto（素材に合わせる）: ソース比率（9:16〜21:9 にクランプ）を採用し、長辺<=longLimit・短辺<=shortLimit に収める。
 * - 解像度は可変。ソースを縮小せず内包できる最小の枠を採り、品質を保つ。
 * - 最大枠を超える場合のみ目標比を保ったまま縮小する。
 * - H.264 の都合により幅・高さは偶数に丸める。
 * - aspectRatio 既定は landscape のため、従来呼び出し（4引数まで）は挙動不変。
 */
export function computeCanvasSizeFromSource(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number = MAX_CANVAS_WIDTH,
  maxHeight: number = MAX_CANVAS_HEIGHT,
  aspectRatio: AspectRatio = 'landscape',
): { width: number; height: number } {
  if (aspectRatio === 'auto') {
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)
      || sourceWidth <= 0 || sourceHeight <= 0) {
      const { maxW, maxH } = resolveOrientedMaxFrame(maxWidth, maxHeight, 'landscape');
      return fallbackFrame(maxW, maxH, getTargetAspect('landscape'));
    }
    const sourceAspect = sourceWidth / sourceHeight;
    const targetAspect = Math.min(AUTO_ASPECT_MAX, Math.max(AUTO_ASPECT_MIN, sourceAspect));
    const maxFrame = resolveAutoMaxFrame(maxWidth, maxHeight, targetAspect);

    let width: number;
    let height: number;
    if (sourceAspect >= targetAspect) {
      width = sourceWidth;
      height = width / targetAspect;
    } else {
      height = sourceHeight;
      width = height * targetAspect;
    }

    const scale = Math.min(1, maxFrame.width / width, maxFrame.height / height);
    return {
      width: roundToEven(width * scale),
      height: roundToEven(height * scale),
    };
  }

  const { maxW, maxH } = resolveOrientedMaxFrame(maxWidth, maxHeight, aspectRatio);
  const targetAspect = getTargetAspect(aspectRatio); // 幅/高さ

  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)
    || sourceWidth <= 0 || sourceHeight <= 0) {
    return fallbackFrame(maxW, maxH, targetAspect);
  }
  // 目標が横向きなのに縦長ソース、目標が縦向きなのに横長ソースは既定枠へフォールバック。
  if (aspectRatio === 'landscape' && sourceHeight > sourceWidth) {
    return fallbackFrame(maxW, maxH, targetAspect);
  }
  if (aspectRatio === 'portrait' && sourceWidth > sourceHeight) {
    return fallbackFrame(maxW, maxH, targetAspect);
  }

  const sourceAspect = sourceWidth / sourceHeight;

  // ソースを縮小せずに内包できる目標比の枠を求める（元解像度を維持し、黒帯で目標比へ整える）。
  let width: number;
  let height: number;
  if (sourceAspect >= targetAspect) {
    // 目標比と同じか横長のソース → 幅が基準（上下が黒帯）。
    width = sourceWidth;
    height = width / targetAspect;
  } else {
    // 目標比より縦長のソース → 高さが基準（左右が黒帯）。
    height = sourceHeight;
    width = height * targetAspect;
  }

  // 最大枠を超える場合のみ、目標比を保ったまま縮小する。
  const scale = Math.min(1, maxW / width, maxH / height);
  return {
    width: roundToEven(width * scale),
    height: roundToEven(height * scale),
  };
}

/** 指定した目標比の既定枠を最大枠に収める（黒帯素材のフォールバック）。 */
function fallbackFrame(maxW: number, maxH: number, targetAspect: number): { width: number; height: number } {
  const widthByHeight = roundToEven(maxH * targetAspect);
  if (widthByHeight <= maxW) {
    return { width: widthByHeight, height: roundToEven(maxH) };
  }
  return {
    width: roundToEven(maxW),
    height: roundToEven(maxW / targetAspect),
  };
}

function roundToEven(value: number): number {
  const rounded = Math.round(value);
  return Math.max(2, rounded % 2 === 0 ? rounded : rounded + 1);
}

/** 固定解像度モードのサイズ定義（横/縦の固定向き用）。 */
const FIXED_EXPORT_SIZES: Record<
  Exclude<AspectRatio, 'auto'>,
  Record<Exclude<ExportQuality, 'auto'>, { width: number; height: number }>
> = {
  landscape: {
    fhd: { width: 1920, height: 1080 },
    hd: { width: 1280, height: 720 },
  },
  portrait: {
    fhd: { width: 1080, height: 1920 },
    hd: { width: 720, height: 1280 },
  },
};

/**
 * 出力品質モードとソース解像度・向きからエクスポートサイズを解決する。
 * auto はソース基準（上限は向きに応じた枠）、fhd/hd は品質上限サイズ（auto 向きでは素材比率を保って上限枠へ）。
 * aspectRatio 既定は landscape のため、従来呼び出し（3引数まで）は挙動不変。
 */
export function resolveExportCanvasSize(
  quality: ExportQuality,
  sourceWidth: number | null,
  sourceHeight: number | null,
  aspectRatio: AspectRatio = 'landscape',
): { width: number; height: number } {
  if (aspectRatio === 'auto') {
    const hasSource = sourceWidth != null && sourceHeight != null
      && Number.isFinite(sourceWidth) && Number.isFinite(sourceHeight)
      && sourceWidth > 0 && sourceHeight > 0;
    const targetAspect = hasSource
      ? Math.min(AUTO_ASPECT_MAX, Math.max(AUTO_ASPECT_MIN, (sourceWidth as number) / (sourceHeight as number)))
      : getTargetAspect('landscape');

    if (quality === 'fhd') {
      return resolveAutoMaxFrame(MAX_CANVAS_WIDTH, MAX_CANVAS_HEIGHT, targetAspect);
    }
    if (quality === 'hd') {
      return resolveAutoMaxFrame(MAX_PREVIEW_CANVAS_WIDTH, MAX_PREVIEW_CANVAS_HEIGHT, targetAspect);
    }
    if (hasSource) {
      return computeCanvasSizeFromSource(sourceWidth as number, sourceHeight as number, MAX_CANVAS_WIDTH, MAX_CANVAS_HEIGHT, 'auto');
    }
    return { width: MAX_CANVAS_WIDTH, height: MAX_CANVAS_HEIGHT };
  }

  if (quality !== 'auto') {
    return { ...FIXED_EXPORT_SIZES[aspectRatio][quality] };
  }
  if (sourceWidth != null && sourceHeight != null) {
    return computeCanvasSizeFromSource(sourceWidth, sourceHeight, MAX_CANVAS_WIDTH, MAX_CANVAS_HEIGHT, aspectRatio);
  }
  const { maxW, maxH } = resolveOrientedMaxFrame(MAX_CANVAS_WIDTH, MAX_CANVAS_HEIGHT, aspectRatio);
  return { width: maxW, height: maxH };
}

/**
 * Canvas を書き出し解像度へ切り替え、エンコーダーへ渡す実寸を返す。
 *
 * Canvas の width / height を変更すると描画バッファが再作成されるため、
 * 変更前のプレビュー寸法を muxer / VideoEncoder に保持しないよう、
 * リサイズと実寸取得を必ず同じ処理で行う。
 */
export function applyExportCanvasSize(
  canvas: Pick<HTMLCanvasElement, 'width' | 'height'>,
  targetWidth: number,
  targetHeight: number,
): { width: number; height: number } {
  if (canvas.width !== targetWidth) {
    canvas.width = targetWidth;
  }
  if (canvas.height !== targetHeight) {
    canvas.height = targetHeight;
  }

  return {
    width: canvas.width,
    height: canvas.height,
  };
}

export const useCanvasStore = create<CanvasState>()(
  devtools((set, get) => ({
    width: DEFAULT_CANVAS_WIDTH,
    height: DEFAULT_CANVAS_HEIGHT,
    previewWidth: DEFAULT_CANVAS_WIDTH,
    previewHeight: DEFAULT_CANVAS_HEIGHT,
    exportWidth: MAX_CANVAS_WIDTH,
    exportHeight: MAX_CANVAS_HEIGHT,
    isExportMode: false,
    exportQuality: readStoredExportQuality(),
    aspectRatio: 'landscape',
    lastSourceWidth: null,
    lastSourceHeight: null,
    applyFromSource: (sourceWidth, sourceHeight) => {
      const { exportQuality, aspectRatio, isExportMode } = get();
      const previewSize = computeCanvasSizeFromSource(
        sourceWidth,
        sourceHeight,
        MAX_PREVIEW_CANVAS_WIDTH,
        MAX_PREVIEW_CANVAS_HEIGHT,
        aspectRatio,
      );
      const exportSize = resolveExportCanvasSize(exportQuality, sourceWidth, sourceHeight, aspectRatio);
      set({
        lastSourceWidth: sourceWidth,
        lastSourceHeight: sourceHeight,
        previewWidth: previewSize.width,
        previewHeight: previewSize.height,
        exportWidth: exportSize.width,
        exportHeight: exportSize.height,
        width: isExportMode ? exportSize.width : previewSize.width,
        height: isExportMode ? exportSize.height : previewSize.height,
      });
    },
    setExportQuality: (quality) => {
      persistExportQuality(quality);
      const { lastSourceWidth, lastSourceHeight, isExportMode, width, height, aspectRatio } = get();
      const exportSize = resolveExportCanvasSize(quality, lastSourceWidth, lastSourceHeight, aspectRatio);
      set({
        exportQuality: quality,
        exportWidth: exportSize.width,
        exportHeight: exportSize.height,
        width: isExportMode ? exportSize.width : width,
        height: isExportMode ? exportSize.height : height,
      });
    },
    setAspectRatio: (aspectRatio) => {
      const { exportQuality, lastSourceWidth, lastSourceHeight, isExportMode } = get();
      // ソース既知ならソース基準で、未知なら向きの既定枠へ再計算する。
      const previewSize = lastSourceWidth != null && lastSourceHeight != null
        ? computeCanvasSizeFromSource(
            lastSourceWidth,
            lastSourceHeight,
            MAX_PREVIEW_CANVAS_WIDTH,
            MAX_PREVIEW_CANVAS_HEIGHT,
            aspectRatio,
          )
        : computeCanvasSizeFromSource(0, 0, MAX_PREVIEW_CANVAS_WIDTH, MAX_PREVIEW_CANVAS_HEIGHT, aspectRatio);
      const exportSize = resolveExportCanvasSize(exportQuality, lastSourceWidth, lastSourceHeight, aspectRatio);
      set({
        aspectRatio,
        previewWidth: previewSize.width,
        previewHeight: previewSize.height,
        exportWidth: exportSize.width,
        exportHeight: exportSize.height,
        width: isExportMode ? exportSize.width : previewSize.width,
        height: isExportMode ? exportSize.height : previewSize.height,
      });
    },
    resetCanvasSize: () => set((state) => {
      const previewSize = computeCanvasSizeFromSource(
        0, 0, MAX_PREVIEW_CANVAS_WIDTH, MAX_PREVIEW_CANVAS_HEIGHT, state.aspectRatio,
      );
      const exportSize = resolveExportCanvasSize(state.exportQuality, null, null, state.aspectRatio);
      return {
        width: previewSize.width,
        height: previewSize.height,
        previewWidth: previewSize.width,
        previewHeight: previewSize.height,
        exportWidth: exportSize.width,
        exportHeight: exportSize.height,
        lastSourceWidth: null,
        lastSourceHeight: null,
        isExportMode: false,
      };
    }),
    beginExportMode: () => {
      const { exportWidth, exportHeight } = get();
      set({
        isExportMode: true,
        width: exportWidth,
        height: exportHeight,
      });
    },
    endExportMode: () => {
      const { previewWidth, previewHeight } = get();
      set({
        isExportMode: false,
        width: previewWidth,
        height: previewHeight,
      });
    },
  })),
);
