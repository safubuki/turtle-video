/**
 * @file indexedDB.ts
 * @author Turtle Village
 * @description IndexedDBのラッパーユーティリティ。プロジェクトデータの保存・読み込み・削除を行う。
 */

const DB_NAME = 'turtle-video-db';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

// スロットタイプ
export type SaveSlot = 'auto' | 'manual';

// 保存されるメディアアイテムのシリアライズ形式
export interface SerializedMediaItem {
  id: string;
  fileName: string;
  fileType: string;
  fileData: ArrayBuffer;  // Fileの内容をArrayBufferで保存
  type: 'video' | 'image';
  volume: number;
  isMuted: boolean;
  fadeIn: boolean;
  fadeOut: boolean;
  fadeInDuration: number;
  fadeOutDuration: number;
  duration: number;
  originalDuration: number;
  trimStart: number;
  trimEnd: number;
  scale: number;
  positionX: number;
  positionY: number;
  isTransformOpen: boolean;
  isLocked: boolean;
}

// 保存されるオーディオトラックのシリアライズ形式
export interface SerializedAudioTrack {
  fileName: string;
  fileType: string;
  fileData: ArrayBuffer | null;  // AI生成の場合はblobUrlから取得
  blobData?: ArrayBuffer;        // blobUrl用
  startPoint: number;
  delay: number;
  volume: number;
  fadeIn: boolean;
  fadeOut: boolean;
  fadeInDuration: number;
  fadeOutDuration: number;
  duration: number;
  isAi: boolean;
}

// 保存されるキャプションの形式
export interface SerializedCaption {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  fadeIn: boolean;
  fadeOut: boolean;
  fadeInDuration: number;
  fadeOutDuration: number;
  overridePosition?: 'top' | 'center' | 'bottom';
  overrideFontStyle?: 'gothic' | 'mincho';
  overrideFontSize?: 'small' | 'medium' | 'large' | 'xlarge';
  overrideFadeIn?: 'on' | 'off';
  overrideFadeOut?: 'on' | 'off';
  overrideFadeInDuration?: number;
  overrideFadeOutDuration?: number;
}

// キャプション設定の形式
export interface SerializedCaptionSettings {
  enabled: boolean;
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  fontStyle: 'gothic' | 'mincho';
  fontColor: string;
  strokeColor: string;
  strokeWidth: number;
  position: 'top' | 'center' | 'bottom';
  bulkFadeIn: boolean;
  bulkFadeOut: boolean;
  bulkFadeInDuration: number;
  bulkFadeOutDuration: number;
}

// プロジェクトデータ全体
export interface ProjectData {
  slot: SaveSlot;
  savedAt: string;  // ISO 8601 形式
  version: string;  // アプリバージョン
  
  // メディア
  mediaItems: SerializedMediaItem[];
  isClipsLocked: boolean;
  
  // オーディオ
  bgm: SerializedAudioTrack | null;
  isBgmLocked: boolean;
  narration: SerializedAudioTrack | null;
  isNarrationLocked: boolean;
  
  // キャプション
  captions: SerializedCaption[];
  captionSettings: SerializedCaptionSettings;
  isCaptionsLocked: boolean;
}

/**
 * IndexedDBを開く
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      reject(new Error('IndexedDBを開けませんでした'));
    };
    
    request.onsuccess = () => {
      resolve(request.result);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'slot' });
      }
    };
  });
}

/**
 * プロジェクトデータを保存
 */
export async function saveProject(data: ProjectData): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(data);
    
    request.onerror = () => {
      reject(new Error('プロジェクトの保存に失敗しました'));
    };
    
    request.onsuccess = () => {
      resolve();
    };
    
    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * プロジェクトデータを読み込み
 */
export async function loadProject(slot: SaveSlot): Promise<ProjectData | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(slot);
    
    request.onerror = () => {
      reject(new Error('プロジェクトの読み込みに失敗しました'));
    };
    
    request.onsuccess = () => {
      resolve(request.result || null);
    };
    
    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * プロジェクトデータを削除
 */
export async function deleteProject(slot: SaveSlot): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(slot);
    
    request.onerror = () => {
      reject(new Error('プロジェクトの削除に失敗しました'));
    };
    
    request.onsuccess = () => {
      resolve();
    };
    
    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * 全スロットのプロジェクト情報を取得（メタデータのみ）
 */
export async function getProjectsInfo(): Promise<{ auto: ProjectData | null; manual: ProjectData | null }> {
  const [autoData, manualData] = await Promise.all([
    loadProject('auto'),
    loadProject('manual'),
  ]);
  return { auto: autoData, manual: manualData };
}

/**
 * 全プロジェクトを削除
 */
export async function deleteAllProjects(): Promise<void> {
  await Promise.all([
    deleteProject('auto'),
    deleteProject('manual'),
  ]);
}

/**
 * FileをArrayBufferに変換
 */
export async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * BlobURLからArrayBufferを取得
 */
export async function blobUrlToArrayBuffer(blobUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(blobUrl);
  return response.arrayBuffer();
}

/**
 * ArrayBufferからFileを作成
 */
export function arrayBufferToFile(buffer: ArrayBuffer, fileName: string, fileType: string): File {
  const blob = new Blob([buffer], { type: fileType });
  return new File([blob], fileName, { type: fileType });
}

/**
 * IndexedDBの使用容量を取得（概算）
 */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  }
  return null;
}
