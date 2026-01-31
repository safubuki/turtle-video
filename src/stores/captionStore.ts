/**
 * キャプションストア - Zustand
 * 字幕の管理（CRUD操作、スタイル設定）
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Caption, CaptionSettings, CaptionPosition, CaptionSize, CaptionFontStyle } from '../types';

interface CaptionState {
  // キャプション一覧
  captions: Caption[];

  // スタイル設定
  settings: CaptionSettings;

  // ロック状態
  isLocked: boolean;

  // === キャプション操作 ===
  addCaption: (text: string, startTime: number, endTime: number) => void;
  updateCaption: (id: string, updates: Partial<Omit<Caption, 'id'>>) => void;
  removeCaption: (id: string) => void;
  clearAllCaptions: () => void;

  // === スタイル設定 ===
  setEnabled: (enabled: boolean) => void;
  setFontSize: (size: CaptionSize) => void;
  setFontStyle: (style: CaptionFontStyle) => void;
  setFontColor: (color: string) => void;
  setStrokeColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setPosition: (position: CaptionPosition) => void;

  // === 一括フェード設定 ===
  setBulkFadeIn: (enabled: boolean) => void;
  setBulkFadeOut: (enabled: boolean) => void;
  setBulkFadeInDuration: (duration: number) => void;
  setBulkFadeOutDuration: (duration: number) => void;

  // === ロック ===
  toggleLock: () => void;

  // === リセット ===
  resetCaptions: () => void;
}

// 初期設定
const initialSettings: CaptionSettings = {
  enabled: true,
  fontSize: 'medium',
  fontStyle: 'gothic',
  fontColor: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 2,
  position: 'bottom',
  // 一括フェード設定
  bulkFadeIn: false,
  bulkFadeOut: false,
  bulkFadeInDuration: 1.0,
  bulkFadeOutDuration: 1.0,
};

// ID生成
const generateId = () => `caption_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const useCaptionStore = create<CaptionState>()(
  devtools(
    (set) => ({
      // Initial state
      captions: [],
      settings: { ...initialSettings },
      isLocked: false,

      // === キャプション操作 ===
      addCaption: (text, startTime, endTime) =>
        set(
          (state) => ({
            captions: [
              ...state.captions,
              {
                id: generateId(),
                text,
                startTime,
                endTime,
                fadeIn: state.settings.bulkFadeIn,
                fadeOut: state.settings.bulkFadeOut,
                fadeInDuration: state.settings.bulkFadeInDuration,
                fadeOutDuration: state.settings.bulkFadeOutDuration,
              },
            ].sort((a, b) => a.startTime - b.startTime), // 開始時間でソート
          }),
          false,
          'addCaption'
        ),

      updateCaption: (id, updates) =>
        set(
          (state) => ({
            captions: state.captions
              .map((c) => (c.id === id ? { ...c, ...updates } : c))
              .sort((a, b) => a.startTime - b.startTime),
          }),
          false,
          'updateCaption'
        ),

      removeCaption: (id) =>
        set(
          (state) => ({
            captions: state.captions.filter((c) => c.id !== id),
          }),
          false,
          'removeCaption'
        ),

      clearAllCaptions: () =>
        set({ captions: [] }, false, 'clearAllCaptions'),

      // === スタイル設定 ===
      setEnabled: (enabled) =>
        set(
          (state) => ({
            settings: { ...state.settings, enabled },
          }),
          false,
          'setEnabled'
        ),

      setFontSize: (fontSize) =>
        set(
          (state) => ({
            settings: { ...state.settings, fontSize },
          }),
          false,
          'setFontSize'
        ),

      setFontStyle: (fontStyle) =>
        set(
          (state) => ({
            settings: { ...state.settings, fontStyle },
          }),
          false,
          'setFontStyle'
        ),

      setFontColor: (fontColor) =>
        set(
          (state) => ({
            settings: { ...state.settings, fontColor },
          }),
          false,
          'setFontColor'
        ),

      setStrokeColor: (strokeColor) =>
        set(
          (state) => ({
            settings: { ...state.settings, strokeColor },
          }),
          false,
          'setStrokeColor'
        ),

      setStrokeWidth: (strokeWidth) =>
        set(
          (state) => ({
            settings: { ...state.settings, strokeWidth },
          }),
          false,
          'setStrokeWidth'
        ),

      setPosition: (position) =>
        set(
          (state) => ({
            settings: { ...state.settings, position },
          }),
          false,
          'setPosition'
        ),

      // === 一括フェード設定 ===
      setBulkFadeIn: (bulkFadeIn) =>
        set(
          (state) => ({
            settings: { ...state.settings, bulkFadeIn },
            captions: state.captions.map((c) => ({ ...c, fadeIn: bulkFadeIn })),
          }),
          false,
          'setBulkFadeIn'
        ),

      setBulkFadeOut: (bulkFadeOut) =>
        set(
          (state) => ({
            settings: { ...state.settings, bulkFadeOut },
            captions: state.captions.map((c) => ({ ...c, fadeOut: bulkFadeOut })),
          }),
          false,
          'setBulkFadeOut'
        ),

      setBulkFadeInDuration: (bulkFadeInDuration) =>
        set(
          (state) => ({
            settings: { ...state.settings, bulkFadeInDuration },
            captions: state.captions.map((c) => ({ ...c, fadeInDuration: bulkFadeInDuration })),
          }),
          false,
          'setBulkFadeInDuration'
        ),

      setBulkFadeOutDuration: (bulkFadeOutDuration) =>
        set(
          (state) => ({
            settings: { ...state.settings, bulkFadeOutDuration },
            captions: state.captions.map((c) => ({ ...c, fadeOutDuration: bulkFadeOutDuration })),
          }),
          false,
          'setBulkFadeOutDuration'
        ),

      // === ロック ===
      toggleLock: () =>
        set(
          (state) => ({ isLocked: !state.isLocked }),
          false,
          'toggleLock'
        ),

      // === リセット ===
      resetCaptions: () =>
        set(
          {
            captions: [],
            settings: { ...initialSettings },
            isLocked: false,
          },
          false,
          'resetCaptions'
        ),
    }),
    { name: 'CaptionStore' }
  )
);
