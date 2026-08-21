/**
 * @file media.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description メディアアイテムの作成、ID生成、トリム値やスケールの検証など、メディア操作に関連するユーティリティ関数群。
 */

import type { MediaItem } from '../types';
import { calculateTotalDurationWithTransitions } from './transitionTimeline';
import { useLogStore } from '../stores/logStore';
import { MAX_CANVAS_WIDTH, MIN_SCALE, MAX_SCALE } from '../constants';
import {
  computeTimelineDurationFromSource,
  getVideoSourceClipDuration,
  normalizeVideoPlaybackSpeed,
} from './playbackSpeed';

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

const LOGO_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function isArrayBufferValue(value: unknown): value is ArrayBuffer {
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

/**
 * ロゴ（ウォーターマーク / エンドロール）として使える画像か。
 * Android のギャラリーは MIME が空のことがあるので、拡張子でも判定する。
 */
export function isSupportedLogoImageFile(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/jpg') return true;
  if (LOGO_IMAGE_MIME_TYPES.has(type)) return true;
  const name = file.name.toLowerCase();
  return name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp');
}

/** 保存・再 File 化に使う MIME。空や image/jpg を正規化する。 */
export function resolveLogoImageMimeType(file: File): string {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/jpg') return 'image/jpeg';
  if (LOGO_IMAGE_MIME_TYPES.has(type)) return type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return file.type || 'application/octet-stream';
}

/**
 * ピッカー由来の File をメモリ上のコピーへ直す。
 * 動画クリップの createMediaItem と同じく、後から元 File が読めなくなっても保存できるようにする。
 */
export async function snapshotLogoImageFile(
  file: File,
): Promise<{ file: File; fileData: ArrayBuffer }> {
  let fileData: ArrayBuffer | null = null;
  try {
    const data = typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Response(file).arrayBuffer();
    if (data.byteLength > 0 || file.size === 0) {
      fileData = data;
    }
  } catch {
    fileData = null;
  }

  if (!fileData) {
    const tempUrl = URL.createObjectURL(file);
    try {
      const response = await fetch(tempUrl);
      fileData = await response.arrayBuffer();
    } finally {
      URL.revokeObjectURL(tempUrl);
    }
  }

  if (!isArrayBufferValue(fileData) || (file.size > 0 && fileData.byteLength === 0)) {
    throw new Error(`ロゴ画像「${file.name}」の読み込みに失敗しました`);
  }

  const stableFile = new File([fileData], file.name, {
    type: resolveLogoImageMimeType(file),
    lastModified: file.lastModified,
  });
  return { file: stableFile, fileData };
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
    audioNormalizeEnabled: true,
    audioNormalizeGain: 1,
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
    // 動画は自動サムネイル。元動画尺確定後に sourceTime を埋める
    thumbnailMode: isImage ? undefined : 'auto',
    thumbnailSourceTime: undefined,
  };
}

type MediaMuteSnapshot = Pick<MediaItem, 'type' | 'isMuted'>;

/**
 * 既存動画が1本以上あり、すべてミュートか。
 * 動画が無い場合は false。旧保存データの一括ミュート補完と、フラグ無し時の継承判定に使う。
 */
export function areAllExistingVideosMuted(
  items: readonly MediaMuteSnapshot[],
): boolean {
  const videos = items.filter((item) => item.type === 'video');
  return videos.length > 0 && videos.every((item) => Boolean(item.isMuted));
}

/**
 * 保存済みの一括ミュート。明示値があればそれを使い、旧データ（未保存）は既存クリップの全ミュートから補完する。
 */
export function resolveSavedBulkMuted(
  saved: boolean | undefined,
  existingAllMuted: boolean,
): boolean {
  if (typeof saved === 'boolean') return saved;
  return existingAllMuted;
}

/**
 * 一括ミュートが有効なとき、追加する動画へミュートを継承する。
 * 画像は対象外。無効なら追加アイテムを変えない。
 */
export function applyBulkMuteToAddedMediaItems<T extends MediaMuteSnapshot>(
  addedItems: T[],
  bulkMuted: boolean,
): T[] {
  if (!bulkMuted) return addedItems;
  return addedItems.map((item) =>
    item.type === 'video' && !item.isMuted ? { ...item, isMuted: true } : item,
  );
}

type MediaVolumeSnapshot = Pick<MediaItem, 'type' | 'volume'>;

/**
 * 一括音量が有効なとき、追加する動画へその音量を継承する。
 */
export function applyBulkVolumeToAddedMediaItems<T extends MediaVolumeSnapshot>(
  addedItems: T[],
  bulkEnabled: boolean,
  bulkVolume: number,
): T[] {
  if (!bulkEnabled) return addedItems;
  const volume = Math.max(0, Math.min(2.5, bulkVolume));
  return addedItems.map((item) =>
    item.type === 'video' ? { ...item, volume } : item,
  );
}

type AudioClipMuteSnapshot = { isMuted?: boolean };
type AudioClipVolumeSnapshot = { volume: number };

/**
 * 一括ミュートが有効か（既存クリップが1本以上あり、すべてミュート）。
 */
export function areAllExistingAudioClipsMuted(
  items: readonly AudioClipMuteSnapshot[],
): boolean {
  return items.length > 0 && items.every((item) => Boolean(item.isMuted));
}

/**
 * 一括ミュートが有効なとき、追加クリップへミュートを継承する。
 */
export function applyBulkMuteToAddedAudioClips<T extends AudioClipMuteSnapshot>(
  addedItems: T[],
  bulkMuted: boolean,
): T[] {
  if (!bulkMuted) return addedItems;
  return addedItems.map((item) => (
    item.isMuted ? item : { ...item, isMuted: true }
  ));
}

/**
 * 一括音量が有効なとき、追加クリップへその音量を継承する。
 */
export function applyBulkVolumeToAddedAudioClips<T extends AudioClipVolumeSnapshot>(
  addedItems: T[],
  bulkEnabled: boolean,
  bulkVolume: number,
): T[] {
  if (!bulkEnabled) return addedItems;
  const volume = Math.max(0, Math.min(2.5, bulkVolume));
  return addedItems.map((item) => ({ ...item, volume }));
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
  /**
   * クリップ内の相対位置（タイムライン上・有効区間先頭からの秒数）。
   * 倍速時もタイムライン秒。ソース上のオフセットは playbackSpeed を掛けて求める。
   */
  previewPosition: number;
  type: 'start' | 'end';
  minDuration?: number;
  /** 動画倍速。未指定は 1 */
  playbackSpeed?: unknown;
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

  const speed = normalizeVideoPlaybackSpeed(params.playbackSpeed);
  const timelinePlayable = playableDuration / speed;

  if (!Number.isFinite(params.previewPosition)) return null;
  // 現在の有効区間内にクランプ（区間外の指定は無効扱い・タイムライン秒）
  if (params.previewPosition < 0 || params.previewPosition > timelinePlayable) {
    return null;
  }

  // 浮動小数点の蓄積を避けるため、元動画上の絶対位置を一度だけ合成する
  const sourcePosition = sourceTrimStart + params.previewPosition * speed;

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
  playbackSpeed?: unknown;
}): boolean {
  return computeVideoTrimFromPreviewPosition(params) !== null;
}

/**
 * ソース trim と速度から動画のタイムライン尺を算出する（store 更新の単一経路用）。
 */
export function computeVideoTimelineDurationFromTrim(params: {
  trimStart: number;
  trimEnd: number;
  originalDuration?: number;
  playbackSpeed?: unknown;
}): number {
  const source = getVideoSourceClipDuration({
    trimStart: params.trimStart,
    trimEnd: params.trimEnd,
    originalDuration: params.originalDuration,
  });
  return computeTimelineDurationFromSource(source, params.playbackSpeed);
}

/** 自動サムネイル: クリップ有効開始からの既定オフセット（秒） */
export const AUTO_THUMBNAIL_OFFSET_SEC = 0.2;

/** 自動サムネイル再試行: 有効開始からのオフセット候補（秒） */
export const AUTO_THUMBNAIL_RETRY_OFFSETS_SEC = [0.2, 0.3, 0.5] as const;

/**
 * preview engine がタイムライン先頭で強制的に黒クリアする帯（秒）。
 * `usePreviewEngine` の `isNearTimelineStart`（time <= 0.05）と一致させる。
 * ここでキャプチャすると必ず黒フレームになるため、自動ポスターは外へ逃がす。
 */
export const PREVIEW_START_CLEAR_ZONE_SEC = 0.05;

/**
 * 自動サムネイルの元動画上時刻を計算する。
 * 常に sourceTrimStart + 0.2s を基準とし、有効尺が 0.2s 以下なら中央を使う。
 * 終端そのものにはならないよう、デコード可能な範囲へわずかに寄せる。
 */
export function computeAutoThumbnailSourceTime(
  sourceTrimStart: number,
  sourceTrimEnd: number
): number {
  const start = Number.isFinite(sourceTrimStart) ? Math.max(0, sourceTrimStart) : 0;
  const end = Number.isFinite(sourceTrimEnd) ? Math.max(start, sourceTrimEnd) : start;
  const duration = end - start;
  if (duration <= 0) return start;

  // 終端ちょうどは黒/未デコードになりやすいので僅かに手前へ
  const maxSeek = Math.max(start, end - Math.min(0.05, duration * 0.25));

  if (duration > AUTO_THUMBNAIL_OFFSET_SEC) {
    return Math.min(start + AUTO_THUMBNAIL_OFFSET_SEC, maxSeek);
  }

  // 短いクリップ: 中央付近
  return Math.min(start + duration / 2, maxSeek);
}

/**
 * サムネイル取得位置が有効トリム範囲内か。
 * 契約: sourceTrimStart <= time < sourceTrimEnd
 */
export function isThumbnailSourceTimeInRange(
  sourceTime: number,
  sourceTrimStart: number,
  sourceTrimEnd: number
): boolean {
  if (!Number.isFinite(sourceTime)) return false;
  const start = Number.isFinite(sourceTrimStart) ? sourceTrimStart : 0;
  const end = Number.isFinite(sourceTrimEnd) ? sourceTrimEnd : start;
  return sourceTime >= start && sourceTime < end;
}

/**
 * トリム変更後のサムネイル mode / 時刻を解決する。
 * - manual かつ範囲内: 維持
 * - manual かつ範囲外: auto へフォールバックし再計算
 * - auto: 常に現在の有効開始から再計算
 */
export function resolveThumbnailAfterTrimChange(params: {
  mode?: 'auto' | 'manual';
  thumbnailSourceTime?: number;
  sourceTrimStart: number;
  sourceTrimEnd: number;
}): {
  thumbnailMode: 'auto' | 'manual';
  thumbnailSourceTime: number;
  fellBackToAuto: boolean;
} {
  const mode = params.mode === 'manual' ? 'manual' : 'auto';
  if (
    mode === 'manual'
    && params.thumbnailSourceTime != null
    && isThumbnailSourceTimeInRange(
      params.thumbnailSourceTime,
      params.sourceTrimStart,
      params.sourceTrimEnd
    )
  ) {
    return {
      thumbnailMode: 'manual',
      thumbnailSourceTime: params.thumbnailSourceTime,
      fellBackToAuto: false,
    };
  }

  return {
    thumbnailMode: 'auto',
    thumbnailSourceTime: computeAutoThumbnailSourceTime(
      params.sourceTrimStart,
      params.sourceTrimEnd
    ),
    fellBackToAuto: mode === 'manual',
  };
}

/**
 * プレビュー上のクリップ相対位置から、手動サムネイル用の元動画時刻を計算する。
 * @returns 範囲外・無効なら null
 */
export function computeThumbnailSourceTimeFromPreviewPosition(params: {
  sourceTrimStart: number;
  sourceTrimEnd: number;
  originalDuration: number;
  /** クリップ有効区間先頭からの相対秒（タイムライン）。倍速時は speed を掛ける */
  previewPosition: number;
  playbackSpeed?: unknown;
}): number | null {
  const originalDuration = Number.isFinite(params.originalDuration)
    ? Math.max(0, params.originalDuration)
    : 0;
  if (originalDuration <= 0) return null;

  const sourceTrimStart = Number.isFinite(params.sourceTrimStart)
    ? Math.max(0, Math.min(params.sourceTrimStart, originalDuration))
    : 0;
  const sourceTrimEnd = Number.isFinite(params.sourceTrimEnd)
    ? Math.max(sourceTrimStart, Math.min(params.sourceTrimEnd, originalDuration))
    : originalDuration;
  const playable = sourceTrimEnd - sourceTrimStart;
  if (playable <= 0) return null;
  const speed = normalizeVideoPlaybackSpeed(params.playbackSpeed);
  const timelinePlayable = playable / speed;
  if (!Number.isFinite(params.previewPosition)) return null;
  if (params.previewPosition < 0 || params.previewPosition > timelinePlayable) return null;

  const sourceTime = sourceTrimStart + params.previewPosition * speed;
  // 終端ちょうどは < end 契約から外れるため僅かに手前へ
  if (sourceTime >= sourceTrimEnd) {
    return Math.max(sourceTrimStart, sourceTrimEnd - 0.001);
  }
  return sourceTime;
}

/**
 * プレビュー現在位置から動画サムネイルを手動設定できるか。
 * そのクリップの表示区間内にプレビューがあること。
 */
export function canSetVideoThumbnailFromPreviewPosition(params: {
  sourceTrimStart: number;
  sourceTrimEnd: number;
  originalDuration: number;
  previewPosition: number;
}): boolean {
  return computeThumbnailSourceTimeFromPreviewPosition(params) !== null;
}

/**
 * サムネイル生成のシーク候補列を構築する。
 * 主時刻 → 有効開始からの再試行オフセット → 中央。いずれも有効範囲内にクランプ。
 */
export function buildThumbnailSeekCandidates(params: {
  primarySourceTime: number;
  sourceTrimStart: number;
  sourceTrimEnd: number;
  /** video.duration。未取得時は sourceTrimEnd を上限に使う */
  mediaDuration?: number;
}): number[] {
  const start = Number.isFinite(params.sourceTrimStart) ? Math.max(0, params.sourceTrimStart) : 0;
  const end = Number.isFinite(params.sourceTrimEnd) ? Math.max(start, params.sourceTrimEnd) : start;
  const mediaEnd = Number.isFinite(params.mediaDuration) && (params.mediaDuration as number) > 0
    ? (params.mediaDuration as number)
    : end;
  const hardEnd = Math.min(end, mediaEnd);
  const range = hardEnd - start;
  if (range <= 0) {
    const t = Number.isFinite(params.primarySourceTime) ? Math.max(0, params.primarySourceTime) : 0;
    return [t];
  }

  const maxSeek = Math.max(start, hardEnd - Math.min(0.05, range * 0.25));
  const clamp = (t: number) => Math.max(start, Math.min(t, maxSeek));

  const primary = clamp(
    Number.isFinite(params.primarySourceTime) ? params.primarySourceTime : start + AUTO_THUMBNAIL_OFFSET_SEC
  );
  const fromStartOffsets = AUTO_THUMBNAIL_RETRY_OFFSETS_SEC.map((offset) => clamp(start + offset));
  // 主時刻から少し後ろへも再試行（手動設定の描画失敗向け）
  const fromPrimary = [0, 0.1, 0.3].map((delta) => clamp(primary + delta));
  const middle = clamp(start + range / 2);

  return Array.from(new Set([primary, ...fromPrimary, ...fromStartOffsets, middle]));
}

/**
 * MediaItem から表示用のサムネイル元動画時刻を解決する。
 * 未設定・auto は有効開始から自動計算。manual は保持値（範囲外なら自動へ）。
 */
export function resolveMediaThumbnailSourceTime(item: {
  type: 'video' | 'image';
  thumbnailMode?: 'auto' | 'manual';
  thumbnailSourceTime?: number;
  trimStart: number;
  trimEnd: number;
  originalDuration: number;
}): number | undefined {
  if (item.type !== 'video') return undefined;
  const end = item.trimEnd > item.trimStart
    ? item.trimEnd
    : (item.originalDuration > 0 ? item.originalDuration : item.trimStart);
  const resolved = resolveThumbnailAfterTrimChange({
    mode: item.thumbnailMode,
    thumbnailSourceTime: item.thumbnailSourceTime,
    sourceTrimStart: item.trimStart,
    sourceTrimEnd: end,
  });
  return resolved.thumbnailSourceTime;
}

/**
 * プロジェクト全体のポスター（アプリ内プレビュー用サムネ）の自動時刻。
 * タイムライン先頭付近の黒/未描画を避け、0.2s（短い作品は中央）を使う。
 * ※エクスプローラー等の OS アイコンとは別物（export コンテナへは埋め込まない）。
 */
export function computeAutoProjectPosterTimelineTime(totalDuration: number): number {
  const d = Number.isFinite(totalDuration) ? Math.max(0, totalDuration) : 0;
  if (d <= 0) return 0;
  if (d > AUTO_THUMBNAIL_OFFSET_SEC) {
    return Math.min(AUTO_THUMBNAIL_OFFSET_SEC, Math.max(0, d - 0.05));
  }
  return Math.min(d / 2, Math.max(0, d - 0.001));
}

/**
 * 自動プロジェクトポスターが再キャプチャすべきかを判定するコンテンツ指紋。
 * 先頭付近の見た目に影響する並び・尺・見た目調整が変わったらキーが変わる。
 * 音量・ミュート・フェードなど見た目に無関係な項目は含めない。
 */
export function buildAutoProjectPosterContentKey(
  items: ReadonlyArray<Pick<
    MediaItem,
    | 'id'
    | 'type'
    | 'duration'
    | 'trimStart'
    | 'trimEnd'
    | 'scale'
    | 'positionX'
    | 'positionY'
    | 'rotation'
    | 'blur'
    | 'playbackSpeed'
    | 'transitionToNext'
  >>,
  totalDuration: number,
  aspectRatio: string,
): string {
  const durationKey = Number.isFinite(totalDuration) ? totalDuration : 0;
  const itemKeys = items.map((item) => {
    const transition = item.transitionToNext;
    const transitionKey = transition
      ? `${transition.type}:${transition.duration}`
      : '';
    return [
      item.id,
      item.type,
      item.duration,
      item.trimStart,
      item.trimEnd,
      item.scale,
      item.positionX,
      item.positionY,
      item.rotation ?? 0,
      item.blur ?? 0,
      item.playbackSpeed ?? 1,
      transitionKey,
    ].join(':');
  });
  return `${aspectRatio}|${durationKey}|${itemKeys.join('|')}`;
}

/**
 * 自動ポスターのキャプチャに使うタイムライン時刻。
 *
 * `computeAutoProjectPosterTimelineTime()` は「表示上の自動位置」を返すが、
 * 総尺が極端に短いと 0.05 秒以下になり、preview engine の
 * `shouldForceStartClear`（`time <= 0.05` の先頭黒クリア）に入って
 * 必ず黒フレームを撮ってしまう。
 * キャプチャ時だけ先頭クリア帯の外へ押し出す。
 */
export function resolveAutoProjectPosterCaptureTime(totalDuration: number): number {
  const d = Number.isFinite(totalDuration) ? Math.max(0, totalDuration) : 0;
  if (d <= 0) return 0;
  const base = computeAutoProjectPosterTimelineTime(d);
  if (base > PREVIEW_START_CLEAR_ZONE_SEC) return base;
  // 先頭クリア帯より後ろで、かつ総尺を越えない位置へ寄せる。
  const safeUpperBound = Math.max(0, d - 0.001);
  return Math.min(PREVIEW_START_CLEAR_ZONE_SEC + 0.01, safeUpperBound);
}

/** 黒フレーム判定の輝度しきい値。意図的な暗所を弾きすぎないよう低めに置く */
export const BLANK_FRAME_LUMINANCE_THRESHOLD = 12;

/**
 * RGBA 画素列がすべて「ほぼ黒」かを判定する純ロジック。
 *
 * 全画素の輝度がしきい値未満なら true。
 * 完全透明（alpha=0）だけの画素列は「描画されていない」ため判定不能として false を返す
 * （jsdom のようにラスタライズしない環境で誤って黒判定しないためのガード）。
 */
export function isRgbaBufferEffectivelyBlank(
  data: Uint8ClampedArray | number[],
  luminanceThreshold = BLANK_FRAME_LUMINANCE_THRESHOLD,
): boolean {
  if (!data || data.length < 4) return false;

  let hasOpaquePixel = false;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    hasOpaquePixel = true;
    // Rec.601 相当の簡易輝度
    const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    if (luminance >= luminanceThreshold) return false;
  }

  // 不透明画素が 1 つも無い = 実際には描画されていない（判定不能）
  return hasOpaquePixel;
}

/**
 * Canvas がほぼ黒一色かを判定する。
 * 自動ポスターのキャプチャが「シーク未完了 / 描画スキップ」で黒画像になったのを
 * 検知して撮り直すために使う。
 *
 * 判定不能（サイズ 0 / context 取得失敗 / tainted canvas）は false（＝黒扱いしない）。
 */
export function isCanvasEffectivelyBlank(
  canvas: HTMLCanvasElement,
  luminanceThreshold = BLANK_FRAME_LUMINANCE_THRESHOLD,
): boolean {
  try {
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return false;

    // 全画素を読むと重いので、最大 32x32 のグリッドへ縮小して判定する。
    const sampleW = Math.min(32, canvas.width);
    const sampleH = Math.min(32, canvas.height);
    const off = document.createElement('canvas');
    off.width = sampleW;
    off.height = sampleH;
    const offCtx = off.getContext('2d', { willReadFrequently: true });
    if (!offCtx) return false;
    offCtx.drawImage(canvas, 0, 0, sampleW, sampleH);

    const { data } = offCtx.getImageData(0, 0, sampleW, sampleH);
    return isRgbaBufferEffectivelyBlank(data, luminanceThreshold);
  } catch {
    // getImageData 失敗（tainted 等）では黒判定しない＝既存の挙動を壊さない
    return false;
  }
}

/**
 * プレビュー Canvas からポスター画像（JPEG data URL）を生成する。
 * - UI 表示と MP4 cover art 埋め込みの両方に使う
 * - maxWidth 既定 1280（エクスプローラー/プレイヤー向けに十分な解像度）
 * 失敗時は null。
 */
export function createPosterDataUrlFromCanvas(
  canvas: HTMLCanvasElement,
  maxWidth = 1280,
  quality = 0.88
): string | null {
  try {
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return null;
    const scale = Math.min(1, maxWidth / canvas.width);
    const w = Math.max(1, Math.round(canvas.width * scale));
    const h = Math.max(1, Math.round(canvas.height * scale));
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0, w, h);
    return off.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}

/**
 * UI 用に縮小したポスター data URL を作る（一覧・プレビュー欄）。
 */
export function createPosterPreviewDataUrlFromCanvas(
  canvas: HTMLCanvasElement,
): string | null {
  return createPosterDataUrlFromCanvas(canvas, 320, 0.75);
}

/**
 * スケール値を検証
 * @param scale - スケール値
 * @param min - 最小値
 * @param max - 最大値
 * @returns 検証されたスケール値
 */
export function validateScale(scale: number, min: number = MIN_SCALE, max: number = MAX_SCALE): number {
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
