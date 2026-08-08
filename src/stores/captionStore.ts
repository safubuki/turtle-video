/**
 * @file captionStore.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 字幕（キャプション）のデータとスタイル設定を管理するZustandストア。
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  Caption,
  CaptionSettings,
  CaptionPosition,
  CaptionSize,
  CaptionFontStyle,
  VideoTitleSettings,
} from '../types';
import {
  CAPTION_BACKGROUND_DEFAULT,
  clampCaptionBackgroundOpacity,
  clampCaptionBackgroundRadius,
  clampCaptionStrokeWidth,
  clampCustomFontSize,
} from '../utils/captionStyle';
import {
  DEFAULT_VIDEO_TITLE_SETTINGS,
  clampVideoTitleBackgroundOpacity,
  clampVideoTitleBackgroundRadius,
  clampVideoTitleBlur,
  clampVideoTitleStrokeWidth,
  normalizeVideoTitleRange,
  normalizeVideoTitleSettings,
} from '../utils/videoTitle';
import { useLogStore } from './logStore';

interface CaptionState {
  // キャプション一覧
  captions: Caption[];

  // スタイル設定
  settings: CaptionSettings;

  /**
   * 動画タイトル設定（Issue #211）。
   * captions とは別管理で、一覧・時分割・まとめて入力・一括シフトの対象外。
   */
  title: VideoTitleSettings;

  // ロック状態
  isLocked: boolean;

  // === キャプション操作 ===
  addCaption: (text: string, startTime: number, endTime: number) => void;
  /** 一括追加（歌詞・長文字幕向け）。各要素に一括フェード等の既定値を適用して末尾へ追加する */
  addCaptions: (items: { text: string; startTime: number; endTime: number }[]) => void;
  /**
   * まとめて編集の反映（全置き換え）。id 付き要素は既存キャプションの
   * 個別スタイル・フェードを維持したままテキスト/時間だけ更新し、
   * id なし要素は新規作成、指定されなかった既存キャプションは削除する。
   */
  replaceCaptions: (items: { id?: string; text: string; startTime: number; endTime: number }[]) => void;
  /**
   * キャプションを一括で時間シフトする（映像の差し込み/削除後の調整用）。
   * 一覧の fromIndex 番目のカード以降（そのカードを含む）を deltaSec ずらす（既定は全部）。
   * 開始が 0 未満にならないようクランプし、表示時間（長さ）は維持する。
   */
  shiftCaptions: (deltaSec: number, fromIndex?: number) => void;
  updateCaption: (id: string, updates: Partial<Omit<Caption, 'id'>>) => void;
  removeCaption: (id: string) => void;
  moveCaption: (id: string, direction: 'up' | 'down') => void;
  clearAllCaptions: () => void;

  // === スタイル設定 ===
  setEnabled: (enabled: boolean) => void;
  setFontSize: (size: CaptionSize) => void;
  setFontStyle: (style: CaptionFontStyle) => void;
  setFontColor: (color: string) => void;
  setStrokeColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setPosition: (position: CaptionPosition) => void;
  setBlur: (blur: number) => void;
  setBackgroundEnabled: (enabled: boolean) => void;
  setBackgroundColor: (color: string) => void;
  setBackgroundOpacity: (opacity: number) => void;
  setBackgroundRadius: (radius: number) => void;
  /** 一括カスタムサイズ（px @1080p 基準）。null でプリセットへ戻す */
  setFontSizeCustom: (value: number | null) => void;
  /** 一括カスタム位置（% XY）。null でプリセットへ戻す */
  setPositionCustom: (value: { x: number; y: number } | null) => void;

  // === 一括フェード設定 ===
  setBulkFadeIn: (enabled: boolean) => void;
  setBulkFadeOut: (enabled: boolean) => void;
  setBulkFadeInDuration: (duration: number) => void;
  setBulkFadeOutDuration: (duration: number) => void;

  // === 動画タイトル設定（キャプションとは別管理） ===
  /** 任意のフィールドだけ部分更新する。時間・数値は setter 側でクランプする */
  updateTitle: (updates: Partial<VideoTitleSettings>) => void;
  /** 表示開始・終了時間をまとめて設定する（逆転しないよう正規化する） */
  setTitleRange: (startTime: number, endTime: number, totalDuration?: number) => void;
  /** タイトル設定を既定値へ戻す */
  resetTitle: () => void;

  // === ロック ===
  toggleLock: () => void;

  // === リセット ===
  resetCaptions: () => void;

  // === 復元 ===
  restoreFromSave: (
    captions: Caption[],
    settings: CaptionSettings,
    isLocked: boolean,
    /** 旧データ（タイトル未対応バージョン）では undefined。既定値で補完する */
    title?: Partial<VideoTitleSettings> | null
  ) => void;
}

// 初期設定
const initialSettings: CaptionSettings = {
  enabled: true,
  fontSize: 'medium',
  fontStyle: 'gothic',
  fontColor: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 4,
  position: 'bottom',
  blur: 0, // ぼかし強度（0=なし）
  // 背景の帯（タイトル帯と同じ既定・既定は OFF）
  backgroundEnabled: CAPTION_BACKGROUND_DEFAULT.backgroundEnabled,
  backgroundColor: CAPTION_BACKGROUND_DEFAULT.backgroundColor,
  backgroundOpacity: CAPTION_BACKGROUND_DEFAULT.backgroundOpacity,
  backgroundRadius: CAPTION_BACKGROUND_DEFAULT.backgroundRadius,
  // 一括フェード設定
  bulkFadeIn: false,
  bulkFadeOut: false,
  bulkFadeInDuration: 0.5,
  bulkFadeOutDuration: 0.5,
  // 一括カスタム値（standard フレーバー限定機能）
  fontSizeCustom: null,
  positionCustom: null,
};

// ID生成
const generateId = () => `caption_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const useCaptionStore = create<CaptionState>()(
  devtools(
    (set) => ({
      // Initial state
      captions: [],
      settings: { ...initialSettings },
      title: { ...DEFAULT_VIDEO_TITLE_SETTINGS },
      isLocked: false,

      // === キャプション操作 ===
      addCaption: (text, startTime, endTime) => {
        useLogStore.getState().info('MEDIA', 'キャプションを追加', { text: text.substring(0, 20), startTime, endTime });
        return set(
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
            ],
          }),
          false,
          'addCaption'
        );
      },

      addCaptions: (items) => {
        if (items.length === 0) return;
        useLogStore.getState().info('MEDIA', 'キャプションを一括追加', { count: items.length });
        return set(
          (state) => ({
            captions: [
              ...state.captions,
              ...items.map((item) => ({
                id: generateId(),
                text: item.text,
                startTime: item.startTime,
                endTime: item.endTime,
                fadeIn: state.settings.bulkFadeIn,
                fadeOut: state.settings.bulkFadeOut,
                fadeInDuration: state.settings.bulkFadeInDuration,
                fadeOutDuration: state.settings.bulkFadeOutDuration,
              })),
            ],
          }),
          false,
          'addCaptions'
        );
      },

      replaceCaptions: (items) => {
        useLogStore.getState().info('MEDIA', 'キャプションをまとめて反映', { count: items.length });
        return set(
          (state) => {
            const byId = new Map(state.captions.map((c) => [c.id, c]));
            return {
              captions: items.map((item) => {
                const existing = item.id ? byId.get(item.id) : undefined;
                if (existing) {
                  // 個別スタイル・フェード設定を維持したままテキスト/時間だけ更新
                  return {
                    ...existing,
                    text: item.text,
                    startTime: item.startTime,
                    endTime: item.endTime,
                  };
                }
                return {
                  id: generateId(),
                  text: item.text,
                  startTime: item.startTime,
                  endTime: item.endTime,
                  fadeIn: state.settings.bulkFadeIn,
                  fadeOut: state.settings.bulkFadeOut,
                  fadeInDuration: state.settings.bulkFadeInDuration,
                  fadeOutDuration: state.settings.bulkFadeOutDuration,
                };
              }),
            };
          },
          false,
          'replaceCaptions'
        );
      },

      shiftCaptions: (deltaSec, fromIndex = 0) => {
        if (!Number.isFinite(deltaSec) || deltaSec === 0) return;
        useLogStore.getState().info('MEDIA', 'キャプションを一括シフト', { deltaSec, fromIndex });
        return set(
          (state) => ({
            captions: state.captions.map((c, index) => {
              if (index < fromIndex) return c;
              const duration = Math.max(0, c.endTime - c.startTime);
              const newStart = Math.max(0, Math.round((c.startTime + deltaSec) * 10) / 10);
              return { ...c, startTime: newStart, endTime: newStart + duration };
            }),
          }),
          false,
          'shiftCaptions'
        );
      },

      updateCaption: (id, updates) =>
        set(
          (state) => ({
            captions: state.captions
              .map((c) => (c.id === id ? { ...c, ...updates } : c)),
          }),
          false,
          'updateCaption'
        ),

      removeCaption: (id) => {
        useLogStore.getState().info('MEDIA', 'キャプションを削除', { id });
        return set(
          (state) => ({
            captions: state.captions.filter((c) => c.id !== id),
          }),
          false,
          'removeCaption'
        );
      },

      moveCaption: (id, direction) =>
        set(
          (state) => {
            const idx = state.captions.findIndex((c) => c.id === id);
            if (idx < 0) return state;
            const newIdx = direction === 'up' ? idx - 1 : idx + 1;
            if (newIdx < 0 || newIdx >= state.captions.length) return state;
            const newCaptions = [...state.captions];
            [newCaptions[idx], newCaptions[newIdx]] = [newCaptions[newIdx], newCaptions[idx]];
            return { captions: newCaptions };
          },
          false,
          'moveCaption'
        ),

      clearAllCaptions: () => {
        useLogStore.getState().info('MEDIA', '全キャプションをクリア');
        return set({ captions: [] }, false, 'clearAllCaptions');
      },

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
            settings: { ...state.settings, strokeWidth: clampCaptionStrokeWidth(strokeWidth) },
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

      setBlur: (blur) =>
        set(
          (state) => ({
            settings: { ...state.settings, blur },
          }),
          false,
          'setBlur'
        ),

      setBackgroundEnabled: (backgroundEnabled) =>
        set(
          (state) => ({
            settings: { ...state.settings, backgroundEnabled },
          }),
          false,
          'setBackgroundEnabled'
        ),

      setBackgroundColor: (backgroundColor) =>
        set(
          (state) => ({
            settings: {
              ...state.settings,
              backgroundColor: backgroundColor || CAPTION_BACKGROUND_DEFAULT.backgroundColor,
            },
          }),
          false,
          'setBackgroundColor'
        ),

      setBackgroundOpacity: (backgroundOpacity) =>
        set(
          (state) => ({
            settings: {
              ...state.settings,
              backgroundOpacity: clampCaptionBackgroundOpacity(backgroundOpacity),
            },
          }),
          false,
          'setBackgroundOpacity'
        ),

      setBackgroundRadius: (backgroundRadius) =>
        set(
          (state) => ({
            settings: {
              ...state.settings,
              backgroundRadius: clampCaptionBackgroundRadius(backgroundRadius),
            },
          }),
          false,
          'setBackgroundRadius'
        ),

      setFontSizeCustom: (fontSizeCustom) =>
        set(
          (state) => ({
            settings: { ...state.settings, fontSizeCustom },
          }),
          false,
          'setFontSizeCustom'
        ),

      setPositionCustom: (positionCustom) =>
        set(
          (state) => ({
            settings: { ...state.settings, positionCustom },
          }),
          false,
          'setPositionCustom'
        ),

      // === 一括フェード設定 ===
      // 要望対応: 一括設定は「個別設定がOFFのもの」に対してのみ適用し、
      // 既存の個別設定（ONになっているもの）や、決定済みの時間を勝手に変更しない。

      setBulkFadeIn: (bulkFadeIn) =>
        set(
          (state) => ({
            settings: { ...state.settings, bulkFadeIn },
          }),
          false,
          'setBulkFadeIn'
        ),

      setBulkFadeOut: (bulkFadeOut) =>
        set(
          (state) => ({
            settings: { ...state.settings, bulkFadeOut },
          }),
          false,
          'setBulkFadeOut'
        ),

      // 時間変更は settings のみ更新し、既存キャプションには連動させない
      setBulkFadeInDuration: (bulkFadeInDuration) =>
        set(
          (state) => ({
            settings: { ...state.settings, bulkFadeInDuration },
          }),
          false,
          'setBulkFadeInDuration'
        ),

      setBulkFadeOutDuration: (bulkFadeOutDuration) =>
        set(
          (state) => ({
            settings: { ...state.settings, bulkFadeOutDuration },
          }),
          false,
          'setBulkFadeOutDuration'
        ),

      // === 動画タイトル設定（キャプションとは別管理） ===
      // 数値・時間は必ずクランプ／正規化を通し、保存・描画へ不正値が漏れないようにする。
      updateTitle: (updates) =>
        set(
          (state) => {
            const merged = { ...state.title, ...updates };
            // 開始・終了のどちらかが指定された場合だけ範囲を再正規化する
            const range =
              updates.startTime !== undefined || updates.endTime !== undefined
                ? normalizeVideoTitleRange(merged.startTime, merged.endTime)
                : { startTime: merged.startTime, endTime: merged.endTime };
            return {
              title: {
                ...merged,
                startTime: range.startTime,
                endTime: range.endTime,
                // fontSize はプリセット（キャプションと同じ体系）。
                // カスタム値のみクランプする
                fontSizeCustom:
                  merged.fontSizeCustom != null
                    ? clampCustomFontSize(merged.fontSizeCustom)
                    : null,
                strokeWidth: clampVideoTitleStrokeWidth(merged.strokeWidth),
                backgroundOpacity: clampVideoTitleBackgroundOpacity(merged.backgroundOpacity),
                backgroundRadius: clampVideoTitleBackgroundRadius(merged.backgroundRadius),
                blur: clampVideoTitleBlur(merged.blur),
              },
            };
          },
          false,
          'updateTitle'
        ),

      setTitleRange: (startTime, endTime, totalDuration) =>
        set(
          (state) => ({
            title: {
              ...state.title,
              ...normalizeVideoTitleRange(startTime, endTime, totalDuration),
            },
          }),
          false,
          'setTitleRange'
        ),

      resetTitle: () => {
        useLogStore.getState().info('MEDIA', '動画タイトル設定をリセット');
        return set({ title: { ...DEFAULT_VIDEO_TITLE_SETTINGS } }, false, 'resetTitle');
      },

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
            title: { ...DEFAULT_VIDEO_TITLE_SETTINGS },
            isLocked: false,
          },
          false,
          'resetCaptions'
        ),

      // === 復元 ===
      restoreFromSave: (newCaptions, newSettings, newIsLocked, newTitle) =>
        set(
          {
            captions: newCaptions,
            // 旧バージョンの保存データに無い新フィールドは初期値で補完する
            settings: {
              ...initialSettings,
              ...newSettings,
              strokeWidth: clampCaptionStrokeWidth(newSettings.strokeWidth ?? initialSettings.strokeWidth),
              backgroundEnabled:
                newSettings.backgroundEnabled ?? initialSettings.backgroundEnabled,
              backgroundColor:
                newSettings.backgroundColor || initialSettings.backgroundColor,
              backgroundOpacity: clampCaptionBackgroundOpacity(
                newSettings.backgroundOpacity ?? initialSettings.backgroundOpacity,
              ),
              backgroundRadius: clampCaptionBackgroundRadius(
                newSettings.backgroundRadius ?? initialSettings.backgroundRadius,
              ),
            },
            // タイトル未対応バージョンの保存データは undefined → 既定値で補完
            title: normalizeVideoTitleSettings(newTitle),
            isLocked: newIsLocked,
          },
          false,
          'restoreFromSave'
        ),
    }),
    { name: 'CaptionStore' }
  )
);
