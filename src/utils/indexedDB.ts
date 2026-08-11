/**
 * @file indexedDB.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description IndexedDBのラッパーユーティリティ。プロジェクトデータの保存・読み込み・削除を行う。
 */

import { useLogStore } from '../stores/logStore';
import type { CaptionFontStyle } from '../types';

const DB_NAME = 'turtle-video-db';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

function getIdbErrorReason(error: DOMException | null): string {
  if (!error) return 'UnknownError';
  if (!error.message) return error.name;
  return `${error.name}: ${error.message}`;
}

function closeDbSafely(db: IDBDatabase): void {
  try {
    db.close();
  } catch {
    // ignore close errors
  }
}

function getTransactionErrorReason(
  transaction: IDBTransaction | null,
  request: IDBRequest | null
): string {
  const txError = transaction?.error ?? null;
  if (txError) return getIdbErrorReason(txError);
  const requestError = request?.error ?? null;
  return getIdbErrorReason(requestError);
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
  /** 90度単位の時計回り回転（0 / 90 / 180 / 270）。旧データには存在しないため任意 */
  rotation?: number;
  /** クリップ単位のぼかし強度（0〜30px @1080p基準）。旧データには存在しないため任意 */
  blur?: number;
  isTransformOpen: boolean;
  isLocked: boolean;
  // ソース動画の解像度（エクスポートキャンバスサイズの動的決定に使用）
  sourceWidth?: number;
  sourceHeight?: number;
  // 次のクリップへのトランジション（standard フレーバー限定機能・任意）
  transitionToNext?: { type: 'dissolve' | 'fade-black' | 'fade-white'; duration: number } | null;
  /** 動画サムネイル設定モード（任意・旧データは auto） */
  thumbnailMode?: 'auto' | 'manual';
  /** サムネイル取得位置（元動画上の秒・任意） */
  thumbnailSourceTime?: number;
  /** 動画再生速度 1/2/4/8（任意・旧データは 1） */
  playbackSpeed?: 1 | 2 | 4 | 8;
  /** 倍速バッジ表示（任意・旧データは false） */
  showSpeedBadge?: boolean;
  /** バッジ文言 ja | en（任意・旧データは ja） */
  speedBadgeLabelStyle?: 'ja' | 'en';
  /** バッジ位置 X%（任意） */
  speedBadgePositionX?: number;
  /** バッジ位置 Y%（任意） */
  speedBadgePositionY?: number;
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
  isMuted?: boolean;
  trimStart?: number;
  trimEnd?: number;
  duration: number;
  isAiEditable: boolean;
  aiScript?: string;
  aiVoice?: string;
  aiVoiceStyle?: string;
  /** ナレーション全体の場面・状況（任意・旧データ互換） */
  aiNarrationScene?: string;
  // クリップ範囲基準フェード（BGM クリップ用・任意）
  fadeIn?: boolean;
  fadeOut?: boolean;
  fadeInDuration?: number;
  fadeOutDuration?: number;
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
  overrideFontStyle?: CaptionFontStyle;
  overrideFontSize?: 'small' | 'medium' | 'large' | 'xlarge';
  overrideFontColor?: string;
  overrideStrokeColor?: string;
  overrideStrokeWidth?: number;
  overrideBlur?: number;
  /** 個別背景帯（旧データでは未定義 → 一括設定を継承） */
  overrideBackgroundEnabled?: boolean;
  overrideBackgroundColor?: string;
  overrideBackgroundOpacity?: number;
  overrideBackgroundRadius?: number;
  overrideFadeIn?: 'on' | 'off';
  overrideFadeOut?: 'on' | 'off';
  overrideFadeInDuration?: number;
  overrideFadeOutDuration?: number;
  // 個別カスタム値（standard フレーバー限定・任意）
  overrideFontSizeCustom?: number;
  overridePositionCustom?: { x: number; y: number };
  // 時分割表示の任意設定（standard フレーバー限定・任意）
  sequentialFadeMode?: 'card' | 'line';
  sequentialGapSec?: number;
}

// キャプション設定の形式
export interface SerializedCaptionSettings {
  enabled: boolean;
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  fontStyle: CaptionFontStyle;
  fontColor: string;
  strokeColor: string;
  strokeWidth: number;
  position: 'top' | 'center' | 'bottom';
  blur: number; // ぼかし強度（0〜5px、0=なし）
  /** キャプション背景帯（旧データでは未定義 → 読込時 OFF） */
  backgroundEnabled?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;
  backgroundRadius?: number;
  bulkFadeIn: boolean;
  bulkFadeOut: boolean;
  bulkFadeInDuration: number;
  bulkFadeOutDuration: number;
  // 一括カスタム値（standard フレーバー限定機能・任意）
  fontSizeCustom?: number | null;
  positionCustom?: { x: number; y: number } | null;
}

/**
 * 動画タイトル設定の形式（Issue #211）。
 * キャプションとは別管理のため captions / captionSettings とは独立したフィールドに保存する。
 * 旧データ（タイトル未対応バージョン）には存在しないため全体を任意とし、
 * 読み込み時は normalizeVideoTitleSettings() で既定値へフォールバックする。
 */
export interface SerializedVideoTitleSettings {
  enabled: boolean;
  text: string;
  startTime: number;
  endTime: number;
  fontStyle: CaptionFontStyle;
  fontColor: string;
  strokeColor: string;
  strokeWidth: number;
  /** 文字サイズのプリセット（キャプションと同じ体系） */
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  /** カスタム文字サイズ px @1080p 基準（任意・null でプリセット使用） */
  fontSizeCustom?: number | null;
  position: 'top' | 'center' | 'bottom';
  positionCustom?: { x: number; y: number } | null;
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  /** 背景の帯の角丸半径 px @1080p 基準（任意・旧データは既定値で補完） */
  backgroundRadius?: number;
  fadeIn: boolean;
  fadeOut: boolean;
  fadeInDuration: number;
  fadeOutDuration: number;
}

/** ウォーターマークの保存形式（Issue #210）。Object URL は保存しない */
export interface SerializedWatermarkOverlay {
  fileName: string;
  fileType: string;
  fileLastModified?: number;
  fileData: ArrayBuffer;
  enabled: boolean;
  /** 本編のみ / 全編（エンドロール含む）。旧データには無く 'main' へ正規化される */
  scope?: 'main' | 'full';
  startTime: number;
  endTime: number;
  positionX: number;
  positionY: number;
  size: number;
  opacity: number;
  rotation: number;
  mask: 'rectangle' | 'rounded' | 'circle';
  maskSize?: number;
  feather: number;
  /** 任意・旧データは false / 1.0 で補完 */
  fadeIn?: boolean;
  fadeOut?: boolean;
  fadeInDuration?: number;
  fadeOutDuration?: number;
}

/**
 * エンドロール（クリップ後に続く単色背景 + ロゴ）の保存形。
 * ウォーターマークとは別フィールドで保存し、画像・設定が混ざらないようにする。
 * 旧データにはこのフィールド自体が無く、読込時は既定値（無効・5秒・黒）へ正規化される。
 */
export interface SerializedEndrollOverlay {
  fileName: string;
  fileType: string;
  fileLastModified?: number;
  fileData: ArrayBuffer;
  enabled: boolean;
  durationSec: number;
  backgroundMode: 'black' | 'white' | 'custom';
  backgroundColor: string;
  bgmFadeOut: boolean;
  positionX: number;
  positionY: number;
  size: number;
  opacity: number;
  rotation: number;
  mask: 'rectangle' | 'rounded' | 'circle';
  maskSize?: number;
  feather: number;
  fadeIn?: boolean;
  fadeOut?: boolean;
  fadeInDuration?: number;
  fadeOutDuration?: number;
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
  // 複数 BGM クリップ（standard フレーバー限定機能・任意）。
  // 存在する場合、bgm フィールドは先頭クリップの近似ミラー（iOS/旧版互換用）
  bgmClips?: SerializedNarrationClip[];
  /**
   * 動画尺に合わせて BGM 有効区間を自動調整するか（任意・既定 true）。
   * 旧データに無い場合は true として読む。
   */
  bgmAutoAdjustToTimeline?: boolean;
  narration?: SerializedAudioTrack | null;
  isNarrationLocked: boolean;
  
  // キャプション
  captions: SerializedCaption[];
  captionSettings: SerializedCaptionSettings;
  isCaptionsLocked: boolean;

  /**
   * 動画タイトル（Issue #211・任意）。キャプションとは別管理。
   * 旧データには無いため undefined を許容し、既定値へフォールバックする。
   */
  videoTitle?: SerializedVideoTitleSettings;

  /**
   * カードとは独立した範囲指定ウォーターマーク（Issue #210・任意）。
   * 旧データは undefined のため画像なしの既定状態へ補完する。
   */
  watermarkOverlay?: SerializedWatermarkOverlay;

  /** エンドロール。任意・旧データには存在しない（additive） */
  endrollOverlay?: SerializedEndrollOverlay;

  // 出力の向き（'landscape'=16:9 / 'portrait'=9:16）。任意・既定 landscape（旧データ後方互換）。
  aspectRatio?: 'landscape' | 'portrait';

  /**
   * プロジェクト全体のポスター（アプリ内プレビュー用）。
   * OS エクスプローラーの動画アイコンとは別（MP4 への埋め込みなし）。
   */
  projectPosterMode?: 'auto' | 'manual';
  projectPosterTimelineTime?: number;
  /** 小さい JPEG data URL（任意） */
  projectPosterDataUrl?: string | null;
  /** ポスター画像を生成した時点の出力向き（任意・旧データはプロジェクト向きへ補完） */
  projectPosterAspectRatio?: 'landscape' | 'portrait';
}

/**
 * IndexedDBを開く
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      const reason = getIdbErrorReason(request.error);
      useLogStore.getState().error('SYSTEM', 'IndexedDBを開けませんでした', { reason });
      reject(new Error(`IndexedDBを開けませんでした (${reason})`));
    };
    
    request.onsuccess = () => {
      useLogStore.getState().debug('SYSTEM', 'IndexedDBを開きました');
      resolve(request.result);
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

    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      closeDbSafely(db);
      resolve();
    };

    const rejectOnce = (reason: string) => {
      if (settled) return;
      settled = true;
      useLogStore.getState().error('SYSTEM', 'プロジェクトの保存に失敗', { slot: data.slot, reason });
      closeDbSafely(db);
      reject(new Error(`プロジェクトの保存に失敗しました (${reason})`));
    };

    let transaction: IDBTransaction;
    try {
      transaction = db.transaction([STORE_NAME], 'readwrite');
    } catch (error) {
      const reason = getIdbErrorReason(error as DOMException);
      rejectOnce(reason);
      return;
    }

    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(data);

    request.onsuccess = () => {
      // request成功はトランザクション完了前なので、resolveはoncompleteで行う
      useLogStore.getState().debug('SYSTEM', 'プロジェクト保存要求が受理', { slot: data.slot });
    };

    request.onerror = () => {
      const reason = getTransactionErrorReason(transaction, request);
      rejectOnce(reason);
    };

    transaction.onabort = () => {
      const reason = getTransactionErrorReason(transaction, request);
      rejectOnce(reason);
    };

    transaction.onerror = () => {
      const reason = getTransactionErrorReason(transaction, request);
      rejectOnce(reason);
    };

    transaction.oncomplete = () => {
      useLogStore.getState().debug('SYSTEM', 'プロジェクトをIndexedDBに保存完了', { slot: data.slot });
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

    const resolveOnce = (value: ProjectData | null) => {
      if (settled) return;
      settled = true;
      closeDbSafely(db);
      resolve(value);
    };

    const rejectOnce = (reason: string) => {
      if (settled) return;
      settled = true;
      useLogStore.getState().error('SYSTEM', 'プロジェクトの読み込みに失敗', { slot, reason });
      closeDbSafely(db);
      reject(new Error(`プロジェクトの読み込みに失敗しました (${reason})`));
    };

    let transaction: IDBTransaction;
    try {
      transaction = db.transaction([STORE_NAME], 'readonly');
    } catch (error) {
      const reason = getIdbErrorReason(error as DOMException);
      rejectOnce(reason);
      return;
    }

    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(slot);

    request.onsuccess = () => {
      result = request.result || null;
      if (result) {
        useLogStore.getState().debug('SYSTEM', 'プロジェクトをIndexedDBから読み込み完了', { slot });
      }
    };

    request.onerror = () => {
      const reason = getTransactionErrorReason(transaction, request);
      rejectOnce(reason);
    };

    transaction.onabort = () => {
      const reason = getTransactionErrorReason(transaction, request);
      rejectOnce(reason);
    };

    transaction.onerror = () => {
      const reason = getTransactionErrorReason(transaction, request);
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

    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      closeDbSafely(db);
      resolve();
    };

    const rejectOnce = (reason: string) => {
      if (settled) return;
      settled = true;
      useLogStore.getState().error('SYSTEM', 'プロジェクトの削除に失敗', { slot, reason });
      closeDbSafely(db);
      reject(new Error(`プロジェクトの削除に失敗しました (${reason})`));
    };

    let transaction: IDBTransaction;
    try {
      transaction = db.transaction([STORE_NAME], 'readwrite');
    } catch (error) {
      const reason = getIdbErrorReason(error as DOMException);
      rejectOnce(reason);
      return;
    }

    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(slot);

    request.onsuccess = () => {
      useLogStore.getState().info('SYSTEM', 'プロジェクト削除要求が受理', { slot });
    };

    request.onerror = () => {
      const reason = getTransactionErrorReason(transaction, request);
      rejectOnce(reason);
    };

    transaction.onabort = () => {
      const reason = getTransactionErrorReason(transaction, request);
      rejectOnce(reason);
    };

    transaction.onerror = () => {
      const reason = getTransactionErrorReason(transaction, request);
      rejectOnce(reason);
    };

    transaction.oncomplete = () => {
      useLogStore.getState().info('SYSTEM', 'プロジェクトをIndexedDBから削除完了', { slot });
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
 * 保存用IndexedDB全体を初期化
 */
export async function resetProjectDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);

    request.onsuccess = () => {
      useLogStore.getState().info('SYSTEM', '保存用IndexedDBを初期化');
      resolve();
    };

    request.onerror = () => {
      const reason = getIdbErrorReason(request.error);
      useLogStore.getState().error('SYSTEM', '保存用IndexedDBの初期化に失敗', { reason });
      reject(new Error(`保存用IndexedDBの初期化に失敗しました (${reason})`));
    };

    request.onblocked = () => {
      useLogStore.getState().warn('SYSTEM', '保存用IndexedDBの初期化がブロックされました');
      reject(new Error('保存用IndexedDBの初期化が他タブまたは別接続によりブロックされました'));
    };
  });
}

/**
 * FileをArrayBufferに変換
 */
export async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    try {
      return await file.arrayBuffer();
    } catch {
      // FileReader / Response fallback below
    }
  }

  try {
    return await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
      reader.readAsArrayBuffer(file);
    });
  } catch {
    try {
      return await new Response(file).arrayBuffer();
    } catch {
      throw new Error('ファイルの読み込みに失敗しました');
    }
  }
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
