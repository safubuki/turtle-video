/**
 * @file projectStore.ts
 * @author Turtle Village
 * @description プロジェクトの保存・読み込み・削除を管理するZustandストア。
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { MediaItem, AudioTrack, Caption, CaptionSettings } from '../types';
import {
  saveProject,
  loadProject,
  deleteAllProjects,
  getProjectsInfo,
  fileToArrayBuffer,
  blobUrlToArrayBuffer,
  arrayBufferToFile,
  type ProjectData,
  type SaveSlot,
  type SerializedMediaItem,
  type SerializedAudioTrack,
  type SerializedCaption,
} from '../utils/indexedDB';
import { useLogStore } from './logStore';

// アプリバージョン
import versionData from '../../version.json';

interface ProjectState {
  // 状態
  isSaving: boolean;
  isLoading: boolean;
  lastAutoSave: string | null;
  lastManualSave: string | null;
  autoSaveError: string | null;
  
  // アクション
  saveProjectManual: (
    mediaItems: MediaItem[],
    isClipsLocked: boolean,
    bgm: AudioTrack | null,
    isBgmLocked: boolean,
    narration: AudioTrack | null,
    isNarrationLocked: boolean,
    captions: Caption[],
    captionSettings: CaptionSettings,
    isCaptionsLocked: boolean
  ) => Promise<void>;
  
  saveProjectAuto: (
    mediaItems: MediaItem[],
    isClipsLocked: boolean,
    bgm: AudioTrack | null,
    isBgmLocked: boolean,
    narration: AudioTrack | null,
    isNarrationLocked: boolean,
    captions: Caption[],
    captionSettings: CaptionSettings,
    isCaptionsLocked: boolean
  ) => Promise<void>;
  
  loadProjectFromSlot: (slot: SaveSlot) => Promise<{
    mediaItems: MediaItem[];
    isClipsLocked: boolean;
    bgm: AudioTrack | null;
    isBgmLocked: boolean;
    narration: AudioTrack | null;
    isNarrationLocked: boolean;
    captions: Caption[];
    captionSettings: CaptionSettings;
    isCaptionsLocked: boolean;
  } | null>;
  
  deleteAllSaves: () => Promise<void>;
  
  refreshSaveInfo: () => Promise<void>;
  
  clearAutoSaveError: () => void;
}

/**
 * MediaItemをシリアライズ形式に変換
 */
async function serializeMediaItem(item: MediaItem): Promise<SerializedMediaItem> {
  const fileData = await fileToArrayBuffer(item.file);
  return {
    id: item.id,
    fileName: item.file.name,
    fileType: item.file.type,
    fileData,
    type: item.type,
    volume: item.volume,
    isMuted: item.isMuted,
    fadeIn: item.fadeIn,
    fadeOut: item.fadeOut,
    fadeInDuration: item.fadeInDuration,
    fadeOutDuration: item.fadeOutDuration,
    duration: item.duration,
    originalDuration: item.originalDuration,
    trimStart: item.trimStart,
    trimEnd: item.trimEnd,
    scale: item.scale,
    positionX: item.positionX,
    positionY: item.positionY,
    isTransformOpen: item.isTransformOpen,
    isLocked: item.isLocked,
  };
}

/**
 * シリアライズ形式からMediaItemを復元
 */
function deserializeMediaItem(data: SerializedMediaItem): MediaItem {
  const file = arrayBufferToFile(data.fileData, data.fileName, data.fileType);
  return {
    id: data.id,
    file,
    type: data.type,
    url: URL.createObjectURL(file),
    volume: data.volume,
    isMuted: data.isMuted,
    fadeIn: data.fadeIn,
    fadeOut: data.fadeOut,
    fadeInDuration: data.fadeInDuration,
    fadeOutDuration: data.fadeOutDuration,
    duration: data.duration,
    originalDuration: data.originalDuration,
    trimStart: data.trimStart,
    trimEnd: data.trimEnd,
    scale: data.scale,
    positionX: data.positionX,
    positionY: data.positionY,
    isTransformOpen: data.isTransformOpen,
    isLocked: data.isLocked,
  };
}

/**
 * AudioTrackをシリアライズ形式に変換
 */
async function serializeAudioTrack(track: AudioTrack): Promise<SerializedAudioTrack> {
  let fileData: ArrayBuffer | null = null;
  let blobData: ArrayBuffer | undefined;
  
  // 通常のファイル
  if (track.file instanceof File) {
    fileData = await fileToArrayBuffer(track.file);
  }
  
  // AI生成の場合はblobUrlからデータを取得
  if (track.blobUrl) {
    try {
      blobData = await blobUrlToArrayBuffer(track.blobUrl);
    } catch {
      // blobUrlが無効な場合は無視
    }
  }
  
  const fileName = track.file instanceof File ? track.file.name : (track.file as { name: string }).name;
  
  return {
    fileName,
    fileType: track.file instanceof File ? track.file.type : 'audio/wav',
    fileData,
    blobData,
    startPoint: track.startPoint,
    delay: track.delay,
    volume: track.volume,
    fadeIn: track.fadeIn,
    fadeOut: track.fadeOut,
    fadeInDuration: track.fadeInDuration,
    fadeOutDuration: track.fadeOutDuration,
    duration: track.duration,
    isAi: track.isAi,
  };
}

/**
 * シリアライズ形式からAudioTrackを復元
 */
function deserializeAudioTrack(data: SerializedAudioTrack): AudioTrack {
  let file: File | { name: string };
  let url: string;
  let blobUrl: string | undefined;
  
  if (data.fileData) {
    const f = arrayBufferToFile(data.fileData, data.fileName, data.fileType);
    file = f;
    url = URL.createObjectURL(f);
  } else if (data.blobData) {
    const blob = new Blob([data.blobData], { type: data.fileType });
    file = { name: data.fileName };
    url = URL.createObjectURL(blob);
    blobUrl = url;
  } else {
    file = { name: data.fileName };
    url = '';
  }
  
  return {
    file,
    url,
    blobUrl,
    startPoint: data.startPoint,
    delay: data.delay,
    volume: data.volume,
    fadeIn: data.fadeIn,
    fadeOut: data.fadeOut,
    fadeInDuration: data.fadeInDuration,
    fadeOutDuration: data.fadeOutDuration,
    duration: data.duration,
    isAi: data.isAi,
  };
}

/**
 * Captionをシリアライズ形式に変換
 */
function serializeCaption(caption: Caption): SerializedCaption {
  return {
    id: caption.id,
    text: caption.text,
    startTime: caption.startTime,
    endTime: caption.endTime,
    fadeIn: caption.fadeIn,
    fadeOut: caption.fadeOut,
    fadeInDuration: caption.fadeInDuration,
    fadeOutDuration: caption.fadeOutDuration,
    overridePosition: caption.overridePosition,
    overrideFontStyle: caption.overrideFontStyle,
    overrideFontSize: caption.overrideFontSize,
    overrideFadeIn: caption.overrideFadeIn,
    overrideFadeOut: caption.overrideFadeOut,
    overrideFadeInDuration: caption.overrideFadeInDuration,
    overrideFadeOutDuration: caption.overrideFadeOutDuration,
  };
}

/**
 * シリアライズ形式からCaptionを復元
 */
function deserializeCaption(data: SerializedCaption): Caption {
  return {
    id: data.id,
    text: data.text,
    startTime: data.startTime,
    endTime: data.endTime,
    fadeIn: data.fadeIn,
    fadeOut: data.fadeOut,
    fadeInDuration: data.fadeInDuration,
    fadeOutDuration: data.fadeOutDuration,
    overridePosition: data.overridePosition,
    overrideFontStyle: data.overrideFontStyle,
    overrideFontSize: data.overrideFontSize,
    overrideFadeIn: data.overrideFadeIn,
    overrideFadeOut: data.overrideFadeOut,
    overrideFadeInDuration: data.overrideFadeInDuration,
    overrideFadeOutDuration: data.overrideFadeOutDuration,
  };
}

export const useProjectStore = create<ProjectState>()(
  devtools(
    (set) => ({
      // 初期状態
      isSaving: false,
      isLoading: false,
      lastAutoSave: null,
      lastManualSave: null,
      autoSaveError: null,
      
      // 手動保存
      saveProjectManual: async (
        mediaItems, isClipsLocked,
        bgm, isBgmLocked,
        narration, isNarrationLocked,
        captions, captionSettings, isCaptionsLocked
      ) => {
        set({ isSaving: true });
        useLogStore.getState().info('SYSTEM', '手動保存を開始', { 
          mediaCount: mediaItems.length, 
          hasBgm: !!bgm, 
          hasNarration: !!narration,
          captionCount: captions.length
        });
        try {
          const serializedMediaItems = await Promise.all(
            mediaItems.map(serializeMediaItem)
          );
          
          const serializedBgm = bgm ? await serializeAudioTrack(bgm) : null;
          const serializedNarration = narration ? await serializeAudioTrack(narration) : null;
          const serializedCaptions = captions.map(serializeCaption);
          
          const projectData: ProjectData = {
            slot: 'manual',
            savedAt: new Date().toISOString(),
            version: versionData.version,
            mediaItems: serializedMediaItems,
            isClipsLocked,
            bgm: serializedBgm,
            isBgmLocked,
            narration: serializedNarration,
            isNarrationLocked,
            captions: serializedCaptions,
            captionSettings,
            isCaptionsLocked,
          };
          
          await saveProject(projectData);
          useLogStore.getState().info('SYSTEM', '手動保存完了', { savedAt: projectData.savedAt });
          set({ lastManualSave: projectData.savedAt, isSaving: false });
        } catch (error) {
          useLogStore.getState().error('SYSTEM', '手動保存失敗', { error: error instanceof Error ? error.message : String(error) });
          set({ isSaving: false });
          throw error;
        }
      },
      
      // 自動保存
      saveProjectAuto: async (
        mediaItems, isClipsLocked,
        bgm, isBgmLocked,
        narration, isNarrationLocked,
        captions, captionSettings, isCaptionsLocked
      ) => {
        // 保存するデータがない場合はスキップ
        if (mediaItems.length === 0 && !bgm && !narration && captions.length === 0) {
          return;
        }
        
        useLogStore.getState().debug('SYSTEM', '自動保存を開始', { 
          mediaCount: mediaItems.length, 
          hasBgm: !!bgm, 
          hasNarration: !!narration,
          captionCount: captions.length
        });
        try {
          const serializedMediaItems = await Promise.all(
            mediaItems.map(serializeMediaItem)
          );
          
          const serializedBgm = bgm ? await serializeAudioTrack(bgm) : null;
          const serializedNarration = narration ? await serializeAudioTrack(narration) : null;
          const serializedCaptions = captions.map(serializeCaption);
          
          const projectData: ProjectData = {
            slot: 'auto',
            savedAt: new Date().toISOString(),
            version: versionData.version,
            mediaItems: serializedMediaItems,
            isClipsLocked,
            bgm: serializedBgm,
            isBgmLocked,
            narration: serializedNarration,
            isNarrationLocked,
            captions: serializedCaptions,
            captionSettings,
            isCaptionsLocked,
          };
          
          await saveProject(projectData);
          useLogStore.getState().debug('SYSTEM', '自動保存完了', { savedAt: projectData.savedAt });
          set({ lastAutoSave: projectData.savedAt, autoSaveError: null });
        } catch (error) {
          useLogStore.getState().error('SYSTEM', '自動保存失敗', { error: error instanceof Error ? error.message : String(error) });
          set({ autoSaveError: error instanceof Error ? error.message : '自動保存に失敗しました' });
        }
      },
      
      // プロジェクト読み込み
      loadProjectFromSlot: async (slot) => {
        set({ isLoading: true });
        useLogStore.getState().info('SYSTEM', 'プロジェクトを読み込み中', { slot });
        try {
          const data = await loadProject(slot);
          if (!data) {
            useLogStore.getState().warn('SYSTEM', '読み込むプロジェクトが見つかりません', { slot });
            set({ isLoading: false });
            return null;
          }
          
          const mediaItems = data.mediaItems.map(deserializeMediaItem);
          const bgm = data.bgm ? deserializeAudioTrack(data.bgm) : null;
          const narration = data.narration ? deserializeAudioTrack(data.narration) : null;
          const captions = data.captions.map(deserializeCaption);
          
          useLogStore.getState().info('SYSTEM', 'プロジェクト読み込み完了', { 
            slot,
            mediaCount: mediaItems.length,
            hasBgm: !!bgm,
            hasNarration: !!narration,
            captionCount: captions.length,
            savedAt: data.savedAt
          });
          set({ isLoading: false });
          
          return {
            mediaItems,
            isClipsLocked: data.isClipsLocked,
            bgm,
            isBgmLocked: data.isBgmLocked,
            narration,
            isNarrationLocked: data.isNarrationLocked,
            captions,
            captionSettings: data.captionSettings,
            isCaptionsLocked: data.isCaptionsLocked,
          };
        } catch (error) {
          useLogStore.getState().error('SYSTEM', 'プロジェクト読み込み失敗', { slot, error: error instanceof Error ? error.message : String(error) });
          set({ isLoading: false });
          throw error;
        }
      },
      
      // 全削除
      deleteAllSaves: async () => {
        useLogStore.getState().info('SYSTEM', '全保存データを削除');
        await deleteAllProjects();
        set({ lastAutoSave: null, lastManualSave: null });
        useLogStore.getState().info('SYSTEM', '全保存データ削除完了');
      },
      
      // 保存情報を更新
      refreshSaveInfo: async () => {
        try {
          const info = await getProjectsInfo();
          set({
            lastAutoSave: info.auto?.savedAt || null,
            lastManualSave: info.manual?.savedAt || null,
          });
        } catch {
          // エラーは無視
        }
      },
      
      // エラークリア
      clearAutoSaveError: () => set({ autoSaveError: null }),
    }),
    { name: 'ProjectStore' }
  )
);
