/**
 * @file overlayStore.ts
 * @description カードとは独立したウォーターマーク画像オーバーレイの状態管理（Issue #210）。
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { WatermarkOverlay } from '../types';
import { revokeObjectUrl } from '../utils/media';
import {
  DEFAULT_WATERMARK_OVERLAY,
  normalizeWatermarkOverlay,
  normalizeWatermarkRange,
} from '../utils/watermarkOverlay';

interface OverlayState {
  watermark: WatermarkOverlay;
  setWatermarkImage: (file: File, totalDuration?: number) => void;
  updateWatermark: (updates: Partial<WatermarkOverlay>) => void;
  setWatermarkRange: (startTime: number, endTime: number, totalDuration?: number) => void;
  removeWatermarkImage: () => void;
  restoreFromSave: (watermark?: Partial<WatermarkOverlay> | null) => void;
  resetWatermark: () => void;
}

function releaseCurrentUrl(): void {
  revokeObjectUrl(useOverlayStore.getState().watermark.url);
}

export const useOverlayStore = create<OverlayState>()(
  devtools(
    (set) => ({
      watermark: { ...DEFAULT_WATERMARK_OVERLAY },

      setWatermarkImage: (file, totalDuration) => {
        releaseCurrentUrl();
        const url = URL.createObjectURL(file);
        set(
          (state) => ({
            watermark: normalizeWatermarkOverlay({
              ...state.watermark,
              file,
              url,
              enabled: true,
              endTime: Number.isFinite(totalDuration) && (totalDuration as number) > 0
                ? totalDuration
                : state.watermark.endTime,
            }),
          }),
          false,
          'setWatermarkImage',
        );
      },

      updateWatermark: (updates) =>
        set(
          (state) => ({
            watermark: normalizeWatermarkOverlay({
              ...state.watermark,
              ...updates,
              file: state.watermark.file,
              url: state.watermark.url,
            }),
          }),
          false,
          'updateWatermark',
        ),

      setWatermarkRange: (startTime, endTime, totalDuration) =>
        set(
          (state) => ({
            watermark: {
              ...state.watermark,
              ...normalizeWatermarkRange(startTime, endTime, totalDuration),
            },
          }),
          false,
          'setWatermarkRange',
        ),

      removeWatermarkImage: () => {
        releaseCurrentUrl();
        set(
          (state) => ({
            watermark: {
              ...state.watermark,
              file: null,
              url: null,
            },
          }),
          false,
          'removeWatermarkImage',
        );
      },

      restoreFromSave: (watermark) => {
        releaseCurrentUrl();
        set(
          { watermark: normalizeWatermarkOverlay(watermark) },
          false,
          'restoreWatermarkFromSave',
        );
      },

      resetWatermark: () => {
        releaseCurrentUrl();
        set(
          { watermark: { ...DEFAULT_WATERMARK_OVERLAY } },
          false,
          'resetWatermark',
        );
      },
    }),
    { name: 'OverlayStore' },
  ),
);

