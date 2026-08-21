/**
 * @file overlayStore.ts
 * @description カードとは独立したウォーターマーク画像オーバーレイの状態管理（Issue #210）。
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { EndrollOverlay, WatermarkOverlay } from '../types';
import { revokeObjectUrl } from '../utils/media';
import { DEFAULT_ENDROLL_OVERLAY, normalizeEndrollOverlay } from '../utils/endrollOverlay';
import {
  DEFAULT_WATERMARK_OVERLAY,
  normalizeWatermarkOverlay,
  normalizeWatermarkRange,
} from '../utils/watermarkOverlay';

interface OverlayState {
  watermark: WatermarkOverlay;
  /** クリップ後に続くエンドロール。ウォーターマークとは画像も設定も独立して保持する */
  endroll: EndrollOverlay;
  setWatermarkImage: (file: File, totalDuration?: number, fileData?: ArrayBuffer) => void;
  updateWatermark: (updates: Partial<WatermarkOverlay>) => void;
  setWatermarkRange: (startTime: number, endTime: number, totalDuration?: number) => void;
  removeWatermarkImage: () => void;
  setEndrollImage: (file: File, fileData?: ArrayBuffer) => void;
  updateEndroll: (updates: Partial<EndrollOverlay>) => void;
  removeEndrollImage: () => void;
  restoreFromSave: (
    watermark?: Partial<WatermarkOverlay> | null,
    endroll?: Partial<EndrollOverlay> | null,
  ) => void;
  resetWatermark: () => void;
}

function releaseCurrentUrl(): void {
  revokeObjectUrl(useOverlayStore.getState().watermark.url);
}

function releaseCurrentEndrollUrl(): void {
  revokeObjectUrl(useOverlayStore.getState().endroll.url);
}

export const useOverlayStore = create<OverlayState>()(
  devtools(
    (set) => ({
      watermark: { ...DEFAULT_WATERMARK_OVERLAY },
      endroll: { ...DEFAULT_ENDROLL_OVERLAY },

      setWatermarkImage: (file, totalDuration, fileData) => {
        releaseCurrentUrl();
        const url = URL.createObjectURL(file);
        set(
          (state) => ({
            watermark: normalizeWatermarkOverlay({
              ...state.watermark,
              file,
              url,
              fileData,
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
              fileData: state.watermark.fileData,
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
              fileData: undefined,
            },
          }),
          false,
          'removeWatermarkImage',
        );
      },

      setEndrollImage: (file, fileData) => {
        releaseCurrentEndrollUrl();
        const url = URL.createObjectURL(file);
        set(
          (state) => ({
            endroll: normalizeEndrollOverlay({
              ...state.endroll,
              file,
              url,
              fileData,
              // 画像を選んだ時点で有効化する（ここで初めてタイムラインが伸びる）
              enabled: true,
            }),
          }),
          false,
          'setEndrollImage',
        );
      },

      updateEndroll: (updates) =>
        set(
          (state) => ({
            endroll: normalizeEndrollOverlay({
              ...state.endroll,
              ...updates,
              file: state.endroll.file,
              url: state.endroll.url,
              fileData: state.endroll.fileData,
            }),
          }),
          false,
          'updateEndroll',
        ),

      removeEndrollImage: () => {
        releaseCurrentEndrollUrl();
        set(
          (state) => ({
            endroll: {
              ...state.endroll,
              file: null,
              url: null,
              fileData: undefined,
              // 画像が無ければ尺は伸びない。設定値は残して選び直しに備える
              enabled: false,
            },
          }),
          false,
          'removeEndrollImage',
        );
      },

      restoreFromSave: (watermark, endroll) => {
        releaseCurrentUrl();
        releaseCurrentEndrollUrl();
        set(
          {
            watermark: normalizeWatermarkOverlay(watermark),
            endroll: normalizeEndrollOverlay(endroll),
          },
          false,
          'restoreWatermarkFromSave',
        );
      },

      resetWatermark: () => {
        releaseCurrentUrl();
        releaseCurrentEndrollUrl();
        set(
          {
            watermark: { ...DEFAULT_WATERMARK_OVERLAY },
            endroll: { ...DEFAULT_ENDROLL_OVERLAY },
          },
          false,
          'resetWatermark',
        );
      },
    }),
    { name: 'OverlayStore' },
  ),
);

