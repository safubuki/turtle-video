/**
 * @file canvasStore.ts
 * @author Turtle Village
 * @description エクスポート対象のキャンバスサイズ（元動画の解像度に動的対応、ただし 1920×1080 上限・横向き固定）を管理するストア。
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
  MAX_CANVAS_WIDTH,
  MAX_CANVAS_HEIGHT,
} from '../constants';

interface CanvasState {
  width: number;
  height: number;
  setCanvasSize: (width: number, height: number) => void;
  resetCanvasSize: () => void;
  applyFromSource: (sourceWidth: number, sourceHeight: number) => void;
}

/**
 * ソース動画のサイズからエクスポート対象キャンバスサイズを算出する。
 *
 * - 元動画のアスペクト比を可能な限り維持する。
 * - 横向き固定（縦長ソースの場合はデフォルトの 16:9 に戻す）。
 * - 1920×1080 を上限とする。
 */
export function computeCanvasSizeFromSource(
  sourceWidth: number,
  sourceHeight: number,
): { width: number; height: number } {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)
    || sourceWidth <= 0 || sourceHeight <= 0) {
    return { width: DEFAULT_CANVAS_WIDTH, height: DEFAULT_CANVAS_HEIGHT };
  }
  // 縦長ソースは横向き固定の方針に従いデフォルト 16:9 を返す
  if (sourceHeight > sourceWidth) {
    return { width: DEFAULT_CANVAS_WIDTH, height: DEFAULT_CANVAS_HEIGHT };
  }
  if (sourceWidth <= MAX_CANVAS_WIDTH && sourceHeight <= MAX_CANVAS_HEIGHT) {
    // H.264 はサイズを 2 の倍数にする必要があるため丸める
    return {
      width: roundToEven(sourceWidth),
      height: roundToEven(sourceHeight),
    };
  }
  const scale = Math.min(MAX_CANVAS_WIDTH / sourceWidth, MAX_CANVAS_HEIGHT / sourceHeight);
  return {
    width: roundToEven(sourceWidth * scale),
    height: roundToEven(sourceHeight * scale),
  };
}

function roundToEven(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export const useCanvasStore = create<CanvasState>()(
  devtools((set) => ({
    width: DEFAULT_CANVAS_WIDTH,
    height: DEFAULT_CANVAS_HEIGHT,
    setCanvasSize: (width, height) => set({
      width: roundToEven(width),
      height: roundToEven(height),
    }),
    resetCanvasSize: () => set({
      width: DEFAULT_CANVAS_WIDTH,
      height: DEFAULT_CANVAS_HEIGHT,
    }),
    applyFromSource: (sourceWidth, sourceHeight) => {
      const size = computeCanvasSizeFromSource(sourceWidth, sourceHeight);
      set(size);
    },
  })),
);
