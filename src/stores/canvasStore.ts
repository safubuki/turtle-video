/**
 * @file canvasStore.ts
 * @author Turtle Village
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

/**
 * 出力品質モード。
 * - auto: 先頭動画のソース解像度に合わせる（従来挙動・上限 1920×1080）
 * - fhd:  常に 1920×1080 で書き出す
 * - hd:   常に 1280×720 で書き出す
 */
export type ExportQuality = 'auto' | 'fhd' | 'hd';

/**
 * 出力の向き（アスペクト比）。
 * - landscape: 16:9 横（従来・既定）
 * - portrait:  9:16 縦（ショート動画向け）
 * 向きはプロジェクトごとに保持し、保存/読込で復元する。
 */
export type AspectRatio = 'landscape' | 'portrait';

/** 各向きの目標アスペクト比（幅/高さ）。 */
export function getTargetAspect(aspectRatio: AspectRatio): number {
  return aspectRatio === 'portrait' ? 9 / 16 : 16 / 9;
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
 * ソースサイズと最大サイズから、指定した向きのキャンバスサイズを算出する。
 *
 * - 出力アスペクト比は向きで固定する（landscape=16:9 / portrait=9:16）。先頭動画の比率に引きずられない。
 * - 解像度は可変。ソースを縮小せず内包できる最小の枠を採り、品質を保つ。
 *   - 目標比より「短辺が余る」ソースは長辺基準で枠を広げる（黒帯が入り、拡大機能で押し出せる）。
 * - 最大枠を超える場合のみ目標比を保ったまま縮小する。
 * - 目標の向きに合わないソース（landscape 枠に縦長ソース等）・無効値は既定枠へフォールバックする。
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
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/** 固定解像度モードのサイズ定義（向き別）。 */
const FIXED_EXPORT_SIZES: Record<
  AspectRatio,
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
 * auto はソース基準（従来挙動・上限は向きに応じた枠）、fhd/hd は向き別固定サイズ。
 * aspectRatio 既定は landscape のため、従来呼び出し（3引数まで）は挙動不変。
 */
export function resolveExportCanvasSize(
  quality: ExportQuality,
  sourceWidth: number | null,
  sourceHeight: number | null,
  aspectRatio: AspectRatio = 'landscape',
): { width: number; height: number } {
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
