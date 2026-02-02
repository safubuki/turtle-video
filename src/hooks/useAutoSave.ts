/**
 * @file useAutoSave.ts
 * @author Turtle Village
 * @description 自動保存機能を提供するカスタムフック。設定に応じた間隔で自動保存を実行する。
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMediaStore } from '../stores/mediaStore';
import { useAudioStore } from '../stores/audioStore';
import { useCaptionStore } from '../stores/captionStore';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { useLogStore } from '../stores/logStore';

/** 自動保存間隔の設定キー */
export const AUTO_SAVE_INTERVAL_KEY = 'turtle-video-auto-save-interval';

/** 自動保存間隔オプション（分） */
export type AutoSaveIntervalOption = 0 | 1 | 2 | 5;

/** デフォルトの自動保存間隔（分） */
export const DEFAULT_AUTO_SAVE_INTERVAL: AutoSaveIntervalOption = 2;

/**
 * localStorageから自動保存間隔を取得
 */
export function getAutoSaveInterval(): AutoSaveIntervalOption {
  try {
    const stored = localStorage.getItem(AUTO_SAVE_INTERVAL_KEY);
    if (stored !== null) {
      const value = parseInt(stored, 10);
      if (value === 0 || value === 1 || value === 2 || value === 5) {
        return value as AutoSaveIntervalOption;
      }
    }
  } catch {
    // localStorageエラーは無視
  }
  return DEFAULT_AUTO_SAVE_INTERVAL;
}

/**
 * 自動保存間隔をlocalStorageに保存
 */
export function setAutoSaveInterval(interval: AutoSaveIntervalOption): void {
  try {
    localStorage.setItem(AUTO_SAVE_INTERVAL_KEY, String(interval));
  } catch {
    // localStorageエラーは無視
  }
}

/**
 * 自動保存機能を提供するカスタムフック
 */
export function useAutoSave() {
  const intervalRef = useRef<number | null>(null);
  const lastSaveHashRef = useRef<string>('');
  const [autoSaveMinutes, setAutoSaveMinutes] = useState<AutoSaveIntervalOption>(getAutoSaveInterval);
  
  // ストアからデータを取得
  const mediaItems = useMediaStore((s) => s.mediaItems);
  const isClipsLocked = useMediaStore((s) => s.isLocked);
  const bgm = useAudioStore((s) => s.bgm);
  const isBgmLocked = useAudioStore((s) => s.isBgmLocked);
  const narration = useAudioStore((s) => s.narration);
  const isNarrationLocked = useAudioStore((s) => s.isNarrationLocked);
  const captions = useCaptionStore((s) => s.captions);
  const captionSettings = useCaptionStore((s) => s.captionSettings);
  const isCaptionsLocked = useCaptionStore((s) => s.isLocked);
  
  // エクスポート中かどうか
  const isProcessing = useUIStore((s) => s.isProcessing);
  
  const saveProjectAuto = useProjectStore((s) => s.saveProjectAuto);
  
  /**
   * 現在の状態のハッシュを計算（簡易的な変更検知用）
   */
  const computeHash = useCallback(() => {
    const parts = [
      mediaItems.length,
      mediaItems.map((m) => `${m.id}:${m.volume}:${m.isMuted}:${m.duration}:${m.trimStart}:${m.trimEnd}`).join(','),
      bgm ? `${bgm.volume}:${bgm.delay}:${bgm.fadeIn}:${bgm.fadeOut}` : 'none',
      narration ? `${narration.volume}:${narration.delay}:${narration.fadeIn}:${narration.fadeOut}` : 'none',
      captions.length,
      captions.map((c) => `${c.id}:${c.text}:${c.startTime}:${c.endTime}`).join(','),
      JSON.stringify(captionSettings),
    ];
    return parts.join('|');
  }, [mediaItems, bgm, narration, captions, captionSettings]);
  
  /**
   * 自動保存を実行
   */
  const performAutoSave = useCallback(async () => {
    // エクスポート中は保存をスキップ（動画品質を保護）
    if (isProcessing) {
      return;
    }
    
    const currentHash = computeHash();
    
    // 変更がない場合はスキップ
    if (currentHash === lastSaveHashRef.current) {
      return;
    }
    
    // データがない場合はスキップ
    if (mediaItems.length === 0 && !bgm && !narration && captions.length === 0) {
      return;
    }
    
    await saveProjectAuto(
      mediaItems,
      isClipsLocked,
      bgm,
      isBgmLocked,
      narration,
      isNarrationLocked,
      captions,
      captionSettings,
      isCaptionsLocked
    );
    
    // 自動保存成功ログ（デバッグレベルで記録）
    useLogStore.getState().debug('SYSTEM', '自動保存を実行', {
      mediaCount: mediaItems.length,
      captionCount: captions.length,
    });
    
    lastSaveHashRef.current = currentHash;
  }, [
    computeHash,
    mediaItems,
    isClipsLocked,
    bgm,
    isBgmLocked,
    narration,
    isNarrationLocked,
    captions,
    captionSettings,
    isCaptionsLocked,
    isProcessing,
    saveProjectAuto,
  ]);
  
  // 自動保存タイマーの設定
  useEffect(() => {
    // 初回起動時は少し遅延してから保存情報を更新
    const initTimeout = setTimeout(() => {
      useProjectStore.getState().refreshSaveInfo();
    }, 1000);
    
    // オフの場合はタイマーを設定しない
    if (autoSaveMinutes === 0) {
      return () => {
        clearTimeout(initTimeout);
      };
    }
    
    // 自動保存タイマー開始
    const intervalMs = autoSaveMinutes * 60 * 1000;
    intervalRef.current = window.setInterval(() => {
      performAutoSave();
    }, intervalMs);
    
    return () => {
      clearTimeout(initTimeout);
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [performAutoSave, autoSaveMinutes]);
  
  /**
   * 自動保存間隔を更新
   */
  const updateAutoSaveInterval = useCallback((interval: AutoSaveIntervalOption) => {
    setAutoSaveInterval(interval);
    setAutoSaveMinutes(interval);
  }, []);
  
  return {
    performAutoSave,
    autoSaveMinutes,
    updateAutoSaveInterval,
  };
}
