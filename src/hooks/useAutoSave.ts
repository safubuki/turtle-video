/**
 * @file useAutoSave.ts
 * @author Turtle Village
 * @description 自動保存機能を提供するカスタムフック。2分間隔で自動保存を実行する。
 */

import { useEffect, useRef, useCallback } from 'react';
import { useMediaStore } from '../stores/mediaStore';
import { useAudioStore } from '../stores/audioStore';
import { useCaptionStore } from '../stores/captionStore';
import { useProjectStore } from '../stores/projectStore';

/** 自動保存間隔（ミリ秒） */
const AUTO_SAVE_INTERVAL = 2 * 60 * 1000; // 2分

/**
 * 自動保存機能を提供するカスタムフック
 */
export function useAutoSave() {
  const intervalRef = useRef<number | null>(null);
  const lastSaveHashRef = useRef<string>('');
  
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
    saveProjectAuto,
  ]);
  
  // 自動保存タイマーの設定
  useEffect(() => {
    // 初回起動時は少し遅延してから保存情報を更新
    const initTimeout = setTimeout(() => {
      useProjectStore.getState().refreshSaveInfo();
    }, 1000);
    
    // 自動保存タイマー開始
    intervalRef.current = window.setInterval(() => {
      performAutoSave();
    }, AUTO_SAVE_INTERVAL);
    
    return () => {
      clearTimeout(initTimeout);
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [performAutoSave]);
  
  return {
    performAutoSave,
  };
}
