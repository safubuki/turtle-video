/**
 * @file media.ts
 * @author Turtle Village
 * @description メディアアイテムの作成、ID生成、トリム値やスケールの検証など、メディア操作に関連するユーティリティ関数群。
 */

import type { MediaItem } from '../types';
import { calculateTotalDurationWithTransitions } from './transitionTimeline';
import { useLogStore } from '../stores/logStore';
import { MAX_CANVAS_WIDTH } from '../constants';

/**
 * ID生成用カウンター（同一ミリ秒内での重複を防止）
 */
let idCounter = 0;

/**
 * 一意なIDを生成
 * タイムスタンプ + カウンター + ランダム文字列で確実に一意性を保証
 * @returns 一意なID文字列
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const counter = (idCounter++).toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `${timestamp}-${counter}-${random}`;
}

/**
 * ファイルがメディアタイプか判定
 * @param file - ファイル
 * @returns 'video' | 'image' | 'audio' | null
 */
export function getMediaType(file: File): 'video' | 'image' | 'audio' | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  return null;
}

/**
 * ファイルからMediaItemを作成
 * @param file - アップロードされたファイル
 * @returns 新しいMediaItem
 */
export async function createMediaItem(file: File): Promise<MediaItem> {
  const isImage = file.type.startsWith('image');
  const fileData = typeof file.arrayBuffer === 'function'
    ? await file.arrayBuffer()
    : await new Response(file).arrayBuffer();
  const stableFile = new File([fileData], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });
  useLogStore.getState().debug('MEDIA', 'メディアアイテムを作成', { fileName: file.name, type: isImage ? 'image' : 'video', size: file.size });
  return {
    id: generateId(),
    file: stableFile,
    fileData,
    type: isImage ? 'image' : 'video',
    url: URL.createObjectURL(stableFile),
    volume: 1.0,
    isMuted: false,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 1.0,
    fadeOutDuration: 1.0,
    duration: isImage ? 5 : 0,
    originalDuration: 0,
    trimStart: 0,
    trimEnd: 0,
    scale: 1.0,
    positionX: 0,
    positionY: 0,
    rotation: 0,
    blur: 0,
    isTransformOpen: false,
    isLocked: false,
  };
}

/**
 * メディアアイテムの総再生時間を計算
 * @param items - メディアアイテムの配列
 * @returns 総再生時間（秒）
 */
export function calculateTotalDuration(items: MediaItem[]): number {
  // ディゾルブ（重ねる）トランジションのオーバーラップぶん短くなる。
  // トランジション未使用時は従来の単純合計と完全一致する。
  return calculateTotalDurationWithTransitions(items);
}

/**
 * 指定時間にアクティブなメディアアイテムを取得
 * @param items - メディアアイテムの配列
 * @param time - 現在時間
 * @returns アクティブなアイテム情報 { item, index, localTime } または null
 */
export function getActiveMediaItem(
  items: MediaItem[],
  time: number
): { item: MediaItem; index: number; localTime: number } | null {
  let t = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (time >= t && time < t + item.duration) {
      return {
        item,
        index: i,
        localTime: time - t,
      };
    }
    t += item.duration;
  }
  return null;
}

/**
 * 配列内の要素を入れ替え
 * @param arr - 配列
 * @param fromIndex - 元のインデックス
 * @param toIndex - 移動先インデックス
 * @returns 新しい配列
 */
export function swapArrayItems<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  if (toIndex < 0 || toIndex >= arr.length) return arr;
  const copy = [...arr];
  [copy[fromIndex], copy[toIndex]] = [copy[toIndex], copy[fromIndex]];
  return copy;
}

/** 動画トリム後に許可する最低尺（秒）。スライダー/検証と同一。 */
export const MIN_VIDEO_TRIM_DURATION_SEC = 0.1;

/**
 * トリム値を検証・調整
 * @param start - 開始位置
 * @param end - 終了位置
 * @param maxDuration - 最大長さ
 * @returns 調整された { start, end, duration }
 */
export function validateTrim(
  start: number,
  end: number,
  maxDuration: number
): { start: number; end: number; duration: number } {
  const minDuration = MIN_VIDEO_TRIM_DURATION_SEC;
  const safeStart = Math.max(0, Math.min(start, end - minDuration));
  const safeEnd = Math.max(safeStart + minDuration, Math.min(end, maxDuration));
  return {
    start: safeStart,
    end: safeEnd,
    duration: safeEnd - safeStart,
  };
}

/**
 * プレビュー上の動画内相対位置から、新しい source trim を計算する。
 *
 * 既にトリミング済みでも `sourceTrimStart + previewPosition` を基準にするため、
 * 再トリミングで元動画 0 秒基準に戻ったり誤差が蓄積したりしない。
 *
 * - 開始点設定: newStart = sourceTrimStart + previewPosition, newEnd は据え置き
 * - 終了点設定: newEnd = sourceTrimStart + previewPosition, newStart は据え置き
 *
 * @returns 新しい trim。最低尺未満・範囲外など無効な場合は null
 */
export function computeVideoTrimFromPreviewPosition(params: {
  sourceTrimStart: number;
  sourceTrimEnd: number;
  originalDuration: number;
  /** クリップ内の相対位置（現在の有効区間先頭からの秒数） */
  previewPosition: number;
  type: 'start' | 'end';
  minDuration?: number;
}): { start: number; end: number; duration: number } | null {
  const minDuration = params.minDuration ?? MIN_VIDEO_TRIM_DURATION_SEC;
  const originalDuration = Number.isFinite(params.originalDuration)
    ? Math.max(0, params.originalDuration)
    : 0;
  if (originalDuration < minDuration) return null;

  const sourceTrimStart = Number.isFinite(params.sourceTrimStart)
    ? Math.max(0, Math.min(params.sourceTrimStart, originalDuration))
    : 0;
  const sourceTrimEnd = Number.isFinite(params.sourceTrimEnd)
    ? Math.max(sourceTrimStart, Math.min(params.sourceTrimEnd, originalDuration))
    : originalDuration;
  const playableDuration = sourceTrimEnd - sourceTrimStart;
  if (playableDuration < minDuration) return null;

  if (!Number.isFinite(params.previewPosition)) return null;
  // 現在の有効区間内にクランプ（区間外の指定は無効扱い）
  if (params.previewPosition < 0 || params.previewPosition > playableDuration) {
    return null;
  }

  // 浮動小数点の蓄積を避けるため、元動画上の絶対位置を一度だけ合成する
  const sourcePosition = sourceTrimStart + params.previewPosition;

  let newStart: number;
  let newEnd: number;
  if (params.type === 'start') {
    newStart = sourcePosition;
    newEnd = sourceTrimEnd;
  } else {
    newStart = sourceTrimStart;
    newEnd = sourcePosition;
  }

  // 最低尺を下回る・逆転する設定は許可しない（勝手にクランプしない）
  if (newEnd - newStart < minDuration) {
    return null;
  }

  return validateTrim(newStart, newEnd, originalDuration);
}

/**
 * プレビュー現在位置から動画トリムを設定できるか判定する。
 * UI のボタン disabled と同一条件。
 */
export function canSetVideoTrimFromPreviewPosition(params: {
  sourceTrimStart: number;
  sourceTrimEnd: number;
  originalDuration: number;
  previewPosition: number;
  type: 'start' | 'end';
  minDuration?: number;
}): boolean {
  return computeVideoTrimFromPreviewPosition(params) !== null;
}

/**
 * スケール値を検証
 * @param scale - スケール値
 * @param min - 最小値
 * @param max - 最大値
 * @returns 検証されたスケール値
 */
export function validateScale(scale: number, min: number = 0.5, max: number = 3.0): number {
  if (isNaN(scale)) return 1.0;
  return Math.max(min, Math.min(max, scale));
}

/**
 * 位置値を検証
 * @param position - 位置値
 * @param limit - 上限/下限
 * @returns 検証された位置値
 */
export function validatePosition(position: number, limit: number = MAX_CANVAS_WIDTH): number {
  if (isNaN(position)) return 0;
  return Math.max(-limit, Math.min(limit, position));
}

/**
 * ObjectURLを解放
 * @param url - 解放するURL
 */
export function revokeObjectUrl(url: string | undefined | null): void {
  if (url) {
    try {
      useLogStore.getState().debug('MEDIA', 'ObjectURLを解放', { url: url.substring(0, 50) });
      URL.revokeObjectURL(url);
    } catch (e) {
      useLogStore.getState().warn('MEDIA', 'ObjectURL解放失敗', { url: url.substring(0, 50), error: e instanceof Error ? e.message : String(e) });
    }
  }
}
