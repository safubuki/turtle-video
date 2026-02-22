/**
 * @file indexedDB.ts
 * @author Turtle Village
 * @description IndexedDBのラッパーユーティリティ。プロジェクトデータの保存・読み込み・削除を行う。
 */

import { useLogStore } from '../stores/logStore';

const DB_NAME = 'turtle-video-db';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const OPEN_DB_TIMEOUT_MS = 15000;
const TRANSACTION_TIMEOUT_MS = 20000;

function getIdbErrorReason(error: DOMException | null): string {
  if (!error) return 'UnknownError';
  if (!error.message) return error.name;
  return `${error.name}: ${error.message}`;
}

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

export interface SerializedNarrationClip {
  id: string;
  sourceType: 'ai' | 'file';
  fileName: string;
  fileType: string;
  fileData: ArrayBuffer | null;
  blobData?: ArrayBuffer;
  startTime: number;
  volume: number;
  duration: number;
  isAiEditable: boolean;
  aiScript?: string;
  aiVoice?: string;
  aiVoiceStyle?: string;
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
  blur: number; // ぼかし強度（0〜5px、0=なし）
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
  narrations: SerializedNarrationClip[];
  narration?: SerializedAudioTrack | null;
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
    let settled = false;

    const rejectOnce = (reason: string) => {
      if (settled) return;
      settled = true;
      reject(new Error(`IndexedDBを開けませんでした (${reason})`));
    };

    const timeoutId = setTimeout(() => {
      useLogStore.getState().error('SYSTEM', 'IndexedDBオープンがタイムアウト', {
        timeoutMs: OPEN_DB_TIMEOUT_MS,
      });
      rejectOnce(`TimeoutError: open timeout (${OPEN_DB_TIMEOUT_MS}ms)`);
    }, OPEN_DB_TIMEOUT_MS);

    request.onerror = () => {
      clearTimeout(timeoutId);
      const reason = getIdbErrorReason(request.error);
      useLogStore.getState().error('SYSTEM', 'IndexedDBを開けませんでした', { reason });
      rejectOnce(reason);
    };

    request.onblocked = () => {
      useLogStore.getState().warn('SYSTEM', 'IndexedDBオープンがブロックされています', {
        dbName: DB_NAME,
        version: DB_VERSION,
      });
    };

    request.onsuccess = () => {
      clearTimeout(timeoutId);
      const db = request.result;
      if (settled) {
        try {
          db.close();
        } catch {
          // ignore
        }
        return;
      }
      db.onversionchange = () => {
        useLogStore.getState().warn('SYSTEM', 'IndexedDBバージョン変更を検知したため接続を閉じます');
        try {
          db.close();
        } catch {
          // ignore
        }
      };
      useLogStore.getState().debug('SYSTEM', 'IndexedDBを開きました');
      settled = true;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      useLogStore.getState().info('SYSTEM', 'IndexedDBをアップグレード中', { version: DB_VERSION });
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
  useLogStore.getState().debug('SYSTEM', 'プロジェクトをIndexedDBに保存中', { slot: data.slot });
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let settled = false;
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(data);

    const cleanup = () => {
      clearTimeout(timeoutId);
      try {
        db.close();
      } catch {
        // ignore
      }
    };

    const rejectOnce = (reason: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`プロジェクトの保存に失敗しました (${reason})`));
    };

    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const timeoutId = setTimeout(() => {
      useLogStore.getState().error('SYSTEM', 'プロジェクト保存がタイムアウト', {
        slot: data.slot,
        timeoutMs: TRANSACTION_TIMEOUT_MS,
      });
      try {
        transaction.abort();
      } catch {
        // ignore
      }
      rejectOnce(`TimeoutError: save timeout (${TRANSACTION_TIMEOUT_MS}ms)`);
    }, TRANSACTION_TIMEOUT_MS);

    request.onerror = () => {
      const reason = getIdbErrorReason(request.error);
      useLogStore.getState().error('SYSTEM', 'プロジェクトの保存に失敗', { slot: data.slot, reason });
      rejectOnce(reason);
    };

    request.onsuccess = () => {
      useLogStore.getState().debug('SYSTEM', 'プロジェクトをIndexedDBに保存完了', { slot: data.slot });
    };

    transaction.onerror = () => {
      const reason = getIdbErrorReason(transaction.error);
      useLogStore.getState().error('SYSTEM', '保存トランザクションでエラー', { slot: data.slot, reason });
      rejectOnce(reason);
    };

    transaction.onabort = () => {
      const reason = getIdbErrorReason(transaction.error) || 'AbortError';
      useLogStore.getState().error('SYSTEM', '保存トランザクションが中断されました', {
        slot: data.slot,
        reason,
      });
      rejectOnce(reason);
    };

    transaction.oncomplete = () => {
      resolveOnce();
    };
  });
}

/**
 * プロジェクトデータを読み込み
 */
export async function loadProject(slot: SaveSlot): Promise<ProjectData | null> {
  useLogStore.getState().debug('SYSTEM', 'プロジェクトをIndexedDBから読み込み中', { slot });
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let settled = false;
    let result: ProjectData | null = null;
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(slot);

    const cleanup = () => {
      clearTimeout(timeoutId);
      try {
        db.close();
      } catch {
        // ignore
      }
    };

    const rejectOnce = (reason: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`プロジェクトの読み込みに失敗しました (${reason})`));
    };

    const resolveOnce = (data: ProjectData | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(data);
    };

    const timeoutId = setTimeout(() => {
      useLogStore.getState().error('SYSTEM', 'プロジェクト読み込みがタイムアウト', {
        slot,
        timeoutMs: TRANSACTION_TIMEOUT_MS,
      });
      try {
        transaction.abort();
      } catch {
        // ignore
      }
      rejectOnce(`TimeoutError: load timeout (${TRANSACTION_TIMEOUT_MS}ms)`);
    }, TRANSACTION_TIMEOUT_MS);

    request.onerror = () => {
      const reason = getIdbErrorReason(request.error);
      useLogStore.getState().error('SYSTEM', 'プロジェクトの読み込みに失敗', { slot, reason });
      rejectOnce(reason);
    };

    request.onsuccess = () => {
      result = request.result || null;
      if (result) {
        useLogStore.getState().debug('SYSTEM', 'プロジェクトをIndexedDBから読み込み完了', { slot });
      }
    };

    transaction.onerror = () => {
      const reason = getIdbErrorReason(transaction.error);
      useLogStore.getState().error('SYSTEM', '読み込みトランザクションでエラー', { slot, reason });
      rejectOnce(reason);
    };

    transaction.onabort = () => {
      const reason = getIdbErrorReason(transaction.error) || 'AbortError';
      useLogStore.getState().error('SYSTEM', '読み込みトランザクションが中断されました', {
        slot,
        reason,
      });
      rejectOnce(reason);
    };

    transaction.oncomplete = () => {
      resolveOnce(result);
    };
  });
}

/**
 * プロジェクトデータを削除
 */
export async function deleteProject(slot: SaveSlot): Promise<void> {
  useLogStore.getState().info('SYSTEM', 'プロジェクトをIndexedDBから削除中', { slot });
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let settled = false;
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(slot);

    const cleanup = () => {
      clearTimeout(timeoutId);
      try {
        db.close();
      } catch {
        // ignore
      }
    };

    const rejectOnce = (reason: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`プロジェクトの削除に失敗しました (${reason})`));
    };

    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const timeoutId = setTimeout(() => {
      useLogStore.getState().error('SYSTEM', 'プロジェクト削除がタイムアウト', {
        slot,
        timeoutMs: TRANSACTION_TIMEOUT_MS,
      });
      try {
        transaction.abort();
      } catch {
        // ignore
      }
      rejectOnce(`TimeoutError: delete timeout (${TRANSACTION_TIMEOUT_MS}ms)`);
    }, TRANSACTION_TIMEOUT_MS);

    request.onerror = () => {
      const reason = getIdbErrorReason(request.error);
      useLogStore.getState().error('SYSTEM', 'プロジェクトの削除に失敗', { slot, reason });
      rejectOnce(reason);
    };

    request.onsuccess = () => {
      useLogStore.getState().info('SYSTEM', 'プロジェクトをIndexedDBから削除完了', { slot });
    };

    transaction.onerror = () => {
      const reason = getIdbErrorReason(transaction.error);
      useLogStore.getState().error('SYSTEM', '削除トランザクションでエラー', { slot, reason });
      rejectOnce(reason);
    };

    transaction.onabort = () => {
      const reason = getIdbErrorReason(transaction.error) || 'AbortError';
      useLogStore.getState().error('SYSTEM', '削除トランザクションが中断されました', {
        slot,
        reason,
      });
      rejectOnce(reason);
    };

    transaction.oncomplete = () => {
      resolveOnce();
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
