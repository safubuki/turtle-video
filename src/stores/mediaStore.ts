/**
 * メディアストア - Zustand
 * メディアアイテムの状態管理
 */

/**
 * @file mediaStore.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 動画・画像クリップの状態（追加、削除、順序変更、プロパティ更新）を管理するZustandストア。
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { MediaItem, SpeedBadgeLabelStyle, VideoAudioNormalizeMode, VideoPlaybackSpeed } from '../types';
import type { AspectRatio } from './canvasStore';
import {
  createMediaItem,
  areAllExistingVideosMuted,
  resolveSavedBulkMuted,
  applyBulkMuteToAddedMediaItems,
  applyBulkVolumeToAddedMediaItems,
  calculateTotalDuration,
  clampMediaVolume,
  generateId,
  validateTrim,
  validateScale,
  normalizeImageDuration,
  validatePosition,
  revokeObjectUrl,
  getNextRotation,
  normalizeMediaBlur,
  computeAutoThumbnailSourceTime,
  resolveThumbnailAfterTrimChange,
  computeAutoProjectPosterTimelineTime,
  computeVideoTimelineDurationFromTrim,
  normalizeVideoPlaybackSpeed,
  normalizeVideoAudioNormalizeMode,
  normalizeSpeedBadgeLabelStyle,
  normalizeSpeedBadgePosition,
  resolveSpeedBadgePresetPosition,
  DEFAULT_SPEED_BADGE_LABEL_STYLE,
} from '../utils';
import { useLogStore } from './logStore';

export type ProjectPosterMode = 'auto' | 'manual';

interface MediaState {
  // State
  mediaItems: MediaItem[];
  totalDuration: number;
  isClipsLocked: boolean;
  /**
   * プロジェクト全体のポスター（アプリ内表示用）。
   * 出力 MP4 のエクスプローラーアイコンとは別（埋め込みなし）。
   */
  projectPosterMode: ProjectPosterMode;
  /** タイムライン上の秒 */
  projectPosterTimelineTime: number;
  /** 小さい JPEG data URL（表示用・任意） */
  projectPosterDataUrl: string | null;
  /** ポスター画像を生成した時点の出力向き */
  projectPosterAspectRatio: AspectRatio;
  /** 動画の一括ミュート。動画 0 本でも ON にでき、追加動画へ継承する */
  bulkVideoMuted: boolean;
  /** 動画の一括音量。ON のとき全動画の volume を揃える */
  bulkVideoVolumeEnabled: boolean;
  bulkVideoVolume: number;
  /** 動画間の音量揃え。ON のとき参加クリップの RMS を揃える */
  videoAudioNormalizeEnabled: boolean;
  /** 音量揃えの目標。mean=平均、loudest=一番大きい音。旧データは mean */
  videoAudioNormalizeMode: VideoAudioNormalizeMode;

  // Actions
  addMediaItems: (files: File[]) => Promise<void>;
  duplicateMediaItem: (id: string) => void;
  removeMediaItem: (id: string) => void;
  moveMediaItem: (index: number, direction: 'up' | 'down') => void;
  updateMediaItem: (id: string, updates: Partial<MediaItem>) => void;

  // Video specific
  setVideoDuration: (id: string, originalDuration: number) => void;
  setMediaSourceDimensions: (id: string, sourceWidth: number, sourceHeight: number) => void;
  updateVideoTrim: (id: string, type: 'start' | 'end', value: number) => void;
  /**
   * プレビュー等で指定した元動画時刻を手動サムネイルに設定する。
   * @returns 成功時 true。範囲外・非動画など無効時は false（モードは変更しない）
   */
  setVideoThumbnailManual: (id: string, sourceTime: number) => boolean;
  /** サムネイルを自動設定（開始+0.2s）へ戻す */
  resetVideoThumbnailToAuto: (id: string) => void;

  /** プロジェクトポスターをプレビュー現在フレームで手動設定 */
  setProjectPosterManual: (
    timelineTime: number,
    dataUrl: string | null,
    aspectRatio: AspectRatio,
  ) => void;
  /** プロジェクトポスターを自動（タイムライン先頭付近）へ戻す */
  resetProjectPosterToAuto: (
    totalDuration: number,
    dataUrl?: string | null,
    aspectRatio?: AspectRatio,
  ) => void;
  /** ポスター画像だけ更新（自動再キャプチャ用） */
  setProjectPosterDataUrl: (dataUrl: string | null, aspectRatio?: AspectRatio) => void;
  /**
   * 出力向き変更後のポスター状態を整合させる。
   * 手動ポスターの向きが不一致なら自動へ戻し、自動ポスターは再取得待ちで画像をクリアする。
   * @returns 手動設定を自動へ戻した場合 true
   */
  reconcileProjectPosterAspectRatio: (
    aspectRatio: AspectRatio,
    totalDuration: number,
  ) => boolean;

  // Image specific
  updateImageDuration: (id: string, duration: number) => void;

  // Transform
  updateScale: (id: string, scale: number) => void;
  updatePosition: (id: string, axis: 'x' | 'y', value: number) => void;
  /** クリップの回転を 90 度単位で1段階進める（0→90→180→270→0 の巡回） */
  rotateClip: (id: string) => void;
  /** クリップ単位のぼかし強度を更新（0〜30px @1080p基準） */
  updateBlur: (id: string, blur: number) => void;
  resetTransform: (id: string, type: 'scale' | 'x' | 'y' | 'rotation' | 'blur') => void;
  toggleTransformPanel: (id: string) => void;

  // Audio
  updateVolume: (id: string, volume: number) => void;
  toggleMute: (id: string) => void;
  /** 動画の再生速度（0.5〜8.0）。タイムライン尺を再計算する */
  updateVideoPlaybackSpeed: (id: string, speed: VideoPlaybackSpeed) => void;
  /** 一括音量の有効/無効。有効化時は全動画へ現在値を適用する */
  setBulkVideoVolumeEnabled: (enabled: boolean) => void;
  /** 一括音量の値。有効時のみ全動画へ反映する */
  setBulkVideoVolume: (volume: number) => void;
  /** 音量揃えの有効/無効。無効化時はゲインを 1 に戻す */
  setVideoAudioNormalizeEnabled: (enabled: boolean) => void;
  /** 音量揃えの目標（平均 / 一番大きい音） */
  setVideoAudioNormalizeMode: (mode: VideoAudioNormalizeMode) => void;
  /** カード単位で音量揃え対象にするか */
  setVideoAudioNormalizeParticipating: (id: string, participating: boolean) => void;
  /** 解析結果の揃えゲインを一括反映する */
  applyVideoNormalizeGains: (gains: Record<string, number>) => void;
  /** 倍速バッジ表示の ON/OFF */
  updateVideoShowSpeedBadge: (id: string, show: boolean) => void;
  /** バッジ文言スタイル（ja / en） */
  updateVideoSpeedBadgeLabelStyle: (id: string, style: SpeedBadgeLabelStyle) => void;
  /** 倍速バッジ位置（0–100%） */
  updateVideoSpeedBadgePosition: (id: string, axis: 'x' | 'y', value: number) => void;
  /** 倍速バッジ位置を四隅プリセットへ */
  applyVideoSpeedBadgePreset: (
    id: string,
    preset: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  ) => void;
  /**
   * 動画クリップを一括ミュート/解除する。
   * 画像は音声がないため対象外。muted=true でフラグ ON + 全動画ミュート。
   * 動画が無くてもフラグだけ立て、追加時に継承する。
   */
  setAllVideosMuted: (muted: boolean) => void;

  // Fade
  toggleFadeIn: (id: string, enabled: boolean) => void;
  toggleFadeOut: (id: string, enabled: boolean) => void;
  updateFadeInDuration: (id: string, duration: number) => void;
  updateFadeOutDuration: (id: string, duration: number) => void;

  // Lock
  toggleItemLock: (id: string) => void;
  toggleClipsLock: () => void;

  // Clear
  clearAllMedia: () => void;

  // Restore
  isLocked: boolean;
  restoreFromSave: (
    items: MediaItem[],
    isLocked: boolean,
    poster?: {
      mode?: ProjectPosterMode;
      timelineTime?: number;
      dataUrl?: string | null;
      aspectRatio?: AspectRatio;
    },
    audioSettings?: {
      bulkVideoMuted?: boolean;
      bulkVideoVolumeEnabled?: boolean;
      bulkVideoVolume?: number;
      videoAudioNormalizeEnabled?: boolean;
      videoAudioNormalizeMode?: VideoAudioNormalizeMode;
    }
  ) => void;
}

export const useMediaStore = create<MediaState>()(
  devtools(
    (set, get) => ({
      // Initial state
      mediaItems: [],
      totalDuration: 0,
      isClipsLocked: false,
      projectPosterMode: 'auto',
      projectPosterTimelineTime: 0.2,
      projectPosterDataUrl: null,
      projectPosterAspectRatio: 'landscape',
      bulkVideoMuted: false,
      bulkVideoVolumeEnabled: false,
      bulkVideoVolume: 1,
      videoAudioNormalizeEnabled: false,
      videoAudioNormalizeMode: 'mean',

      // Add media items
      addMediaItems: async (files) => {
        useLogStore.getState().info('MEDIA', 'メディアアイテムを追加', { fileCount: files.length, fileNames: files.map(f => f.name) });
        const newItems: MediaItem[] = [];
        for (const file of files) {
          newItems.push(await createMediaItem(file));
        }
        set((state) => {
          const bulkMuted = state.bulkVideoMuted || areAllExistingVideosMuted(state.mediaItems);
          const mutedItems = applyBulkMuteToAddedMediaItems(newItems, bulkMuted);
          const itemsToAdd = applyBulkVolumeToAddedMediaItems(
            mutedItems,
            state.bulkVideoVolumeEnabled,
            state.bulkVideoVolume,
          );
          const updated = [...state.mediaItems, ...itemsToAdd];
          useLogStore.getState().info('MEDIA', 'メディアアイテム追加完了', { totalItems: updated.length, totalDuration: calculateTotalDuration(updated) });
          return {
            mediaItems: updated,
            totalDuration: calculateTotalDuration(updated),
          };
        });
      },

      // Duplicate media item (Android/PC 向け簡単コピー)
      // 独立した ObjectURL を発行し、元アイテムの直後へ挿入する。
      duplicateMediaItem: (id) => {
        set((state) => {
          const index = state.mediaItems.findIndex((m) => m.id === id);
          if (index < 0) return state;
          const source = state.mediaItems[index];
          const copy: MediaItem = {
            ...source,
            id: generateId(),
            url: URL.createObjectURL(source.file),
            isTransformOpen: false,
            isLocked: false,
          };
          useLogStore.getState().info('MEDIA', 'メディアアイテムを複製', {
            sourceId: source.id,
            newId: copy.id,
            fileName: source.file.name,
            type: source.type,
          });
          const updated = [
            ...state.mediaItems.slice(0, index + 1),
            copy,
            ...state.mediaItems.slice(index + 1),
          ];
          return {
            mediaItems: updated,
            totalDuration: calculateTotalDuration(updated),
          };
        });
      },

      // Remove media item
      removeMediaItem: (id) => {
        set((state) => {
          const item = state.mediaItems.find((m) => m.id === id);
          if (item) {
            useLogStore.getState().info('MEDIA', 'メディアアイテムを削除', { id, fileName: item.file.name, type: item.type });
            revokeObjectUrl(item.url);
          }
          const updated = state.mediaItems.filter((m) => m.id !== id);
          return {
            mediaItems: updated,
            totalDuration: calculateTotalDuration(updated),
          };
        });
      },

      // Move media item
      moveMediaItem: (index, direction) => {
        set((state) => {
          const items = [...state.mediaItems];
          const targetIndex = direction === 'up' ? index - 1 : index + 1;
          if (targetIndex < 0 || targetIndex >= items.length) return state;
          [items[index], items[targetIndex]] = [items[targetIndex], items[index]];
          return { mediaItems: items };
        });
      },

      // Generic update
      updateMediaItem: (id, updates) => {
        set((state) => {
          const updated = state.mediaItems.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          );
          return {
            mediaItems: updated,
            totalDuration: calculateTotalDuration(updated),
          };
        });
      },

      // Set video duration when loaded
      setVideoDuration: (id, originalDuration) => {
        useLogStore.getState().info('MEDIA', '動画の長さを設定', { id, originalDuration });
        set((state) => {
          const updated = state.mediaItems.map((item): MediaItem => {
            if (item.id !== id) return item;
            const isInitialized = item.originalDuration > 0;
            const newTrimStart = isInitialized ? item.trimStart : 0;
            const newTrimEnd = isInitialized && item.trimEnd > 0 ? item.trimEnd : originalDuration;
            const sourceDuration = newTrimEnd - newTrimStart;
            if (item.type !== 'video') {
              return {
                ...item,
                originalDuration,
                trimStart: newTrimStart,
                trimEnd: newTrimEnd,
                duration: sourceDuration > 0 ? sourceDuration : originalDuration,
              };
            }
            const timelineDuration = computeVideoTimelineDurationFromTrim({
              trimStart: newTrimStart,
              trimEnd: newTrimEnd > newTrimStart ? newTrimEnd : originalDuration,
              originalDuration,
              playbackSpeed: item.playbackSpeed,
            });
            // 初回尺確定・auto は開始+0.2s。manual は範囲外なら auto へ
            const thumb = resolveThumbnailAfterTrimChange({
              mode: item.thumbnailMode,
              thumbnailSourceTime: item.thumbnailSourceTime,
              sourceTrimStart: newTrimStart,
              sourceTrimEnd: newTrimEnd,
            });
            // 初回 or 明示 auto は常に自動位置を確定（manual 維持は上記で範囲内のみ）
            const useAuto =
              item.thumbnailMode !== 'manual'
              || !isInitialized
              || thumb.fellBackToAuto;
            return {
              ...item,
              originalDuration,
              trimStart: newTrimStart,
              trimEnd: newTrimEnd,
              duration: timelineDuration > 0
                ? timelineDuration
                : computeVideoTimelineDurationFromTrim({
                  trimStart: 0,
                  trimEnd: originalDuration,
                  originalDuration,
                  playbackSpeed: item.playbackSpeed,
                }),
              thumbnailMode: useAuto ? 'auto' : 'manual',
              thumbnailSourceTime: useAuto
                ? computeAutoThumbnailSourceTime(newTrimStart, newTrimEnd)
                : (item.thumbnailSourceTime ?? thumb.thumbnailSourceTime),
            };
          });
          return {
            mediaItems: updated,
            totalDuration: calculateTotalDuration(updated),
          };
        });
      },

      // Set source dimensions (called when video/image metadata loads)
      setMediaSourceDimensions: (id, sourceWidth, sourceHeight) => {
        if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)
          || sourceWidth <= 0 || sourceHeight <= 0) {
          return;
        }
        set((state) => {
          const updated = state.mediaItems.map((item) => {
            if (item.id !== id) return item;
            if (item.sourceWidth === sourceWidth && item.sourceHeight === sourceHeight) {
              return item;
            }
            return { ...item, sourceWidth, sourceHeight };
          });
          return { mediaItems: updated };
        });
      },

      // Update video trim
      updateVideoTrim: (id, type, value) => {
        set((state) => {
          const updated = state.mediaItems.map((item) => {
            if (item.id !== id) return item;
            const start = type === 'start' ? value : item.trimStart;
            const end = type === 'end' ? value : item.trimEnd;
            const validated = validateTrim(start, end, item.originalDuration);
            if (item.type !== 'video') {
              return {
                ...item,
                trimStart: validated.start,
                trimEnd: validated.end,
                duration: validated.duration,
              };
            }
            // 手動位置が範囲外なら auto へ。auto は開始+0.2s を再計算
            const thumb = resolveThumbnailAfterTrimChange({
              mode: item.thumbnailMode,
              thumbnailSourceTime: item.thumbnailSourceTime,
              sourceTrimStart: validated.start,
              sourceTrimEnd: validated.end,
            });
            if (thumb.fellBackToAuto) {
              useLogStore.getState().info('MEDIA', '手動サムネイルが範囲外のため自動へ戻した', {
                id,
                previousTime: item.thumbnailSourceTime,
                newTime: thumb.thumbnailSourceTime,
              });
            }
            return {
              ...item,
              trimStart: validated.start,
              trimEnd: validated.end,
              duration: computeVideoTimelineDurationFromTrim({
                trimStart: validated.start,
                trimEnd: validated.end,
                originalDuration: item.originalDuration,
                playbackSpeed: item.playbackSpeed,
              }),
              thumbnailMode: thumb.thumbnailMode,
              thumbnailSourceTime: thumb.thumbnailSourceTime,
            };
          });
          return {
            mediaItems: updated,
            totalDuration: calculateTotalDuration(updated),
          };
        });
      },

      setVideoThumbnailManual: (id, sourceTime) => {
        if (!Number.isFinite(sourceTime)) return false;
        let applied = false;
        set((state) => {
          const updated = state.mediaItems.map((item) => {
            if (item.id !== id || item.type !== 'video') return item;
            const end = item.trimEnd > item.trimStart
              ? item.trimEnd
              : (item.originalDuration > 0 ? item.originalDuration : item.trimStart);
            if (sourceTime < item.trimStart || sourceTime >= end) {
              return item;
            }
            applied = true;
            useLogStore.getState().info('MEDIA', '動画サムネイルを手動設定', {
              id,
              sourceTime,
              previousMode: item.thumbnailMode ?? 'auto',
            });
            return {
              ...item,
              thumbnailMode: 'manual' as const,
              thumbnailSourceTime: sourceTime,
            };
          });
          return applied ? { mediaItems: updated } : state;
        });
        return applied;
      },

      resetVideoThumbnailToAuto: (id) => {
        set((state) => {
          const updated = state.mediaItems.map((item) => {
            if (item.id !== id || item.type !== 'video') return item;
            const end = item.trimEnd > item.trimStart
              ? item.trimEnd
              : (item.originalDuration > 0 ? item.originalDuration : item.trimStart);
            const thumbnailSourceTime = computeAutoThumbnailSourceTime(item.trimStart, end);
            useLogStore.getState().info('MEDIA', '動画サムネイルを自動設定に戻す', {
              id,
              thumbnailSourceTime,
              previousMode: item.thumbnailMode ?? 'auto',
            });
            return {
              ...item,
              thumbnailMode: 'auto' as const,
              thumbnailSourceTime,
            };
          });
          return { mediaItems: updated };
        });
      },

      setProjectPosterManual: (timelineTime, dataUrl, aspectRatio) => {
        if (!Number.isFinite(timelineTime)) return;
        const t = Math.max(0, timelineTime);
        useLogStore.getState().info('MEDIA', 'プロジェクトポスターを手動設定', {
          timelineTime: t,
          hasImage: Boolean(dataUrl),
          aspectRatio,
        });
        set({
          projectPosterMode: 'manual',
          projectPosterTimelineTime: t,
          projectPosterDataUrl: dataUrl,
          projectPosterAspectRatio: aspectRatio,
        });
      },

      resetProjectPosterToAuto: (totalDuration, dataUrl = null, aspectRatio) => {
        const t = computeAutoProjectPosterTimelineTime(totalDuration);
        useLogStore.getState().info('MEDIA', 'プロジェクトポスターを自動設定に戻す', {
          timelineTime: t,
          hasImage: Boolean(dataUrl),
          aspectRatio,
        });
        set((state) => ({
          projectPosterMode: 'auto',
          projectPosterTimelineTime: t,
          projectPosterDataUrl: dataUrl ?? null,
          projectPosterAspectRatio: aspectRatio ?? state.projectPosterAspectRatio,
        }));
      },

      setProjectPosterDataUrl: (dataUrl, aspectRatio) => {
        set((state) => ({
          projectPosterDataUrl: dataUrl,
          projectPosterAspectRatio: aspectRatio ?? state.projectPosterAspectRatio,
        }));
      },

      reconcileProjectPosterAspectRatio: (aspectRatio, totalDuration) => {
        let resetManual = false;
        set((state) => {
          if (
            state.projectPosterMode === 'manual'
            && state.projectPosterAspectRatio === aspectRatio
          ) {
            return state;
          }
          resetManual = state.projectPosterMode === 'manual';
          const timelineTime = computeAutoProjectPosterTimelineTime(totalDuration);
          useLogStore.getState().info(
            'MEDIA',
            resetManual
              ? '動画形式変更で手動ポスターの比率が不一致のため自動へ戻した'
              : '動画形式変更に合わせて自動ポスターを再取得',
            {
              previousAspectRatio: state.projectPosterAspectRatio,
              aspectRatio,
              timelineTime,
            },
          );
          return {
            projectPosterMode: 'auto',
            projectPosterTimelineTime: timelineTime,
            projectPosterDataUrl: null,
            projectPosterAspectRatio: aspectRatio,
          };
        });
        return resetManual;
      },

      // Update image duration
      updateImageDuration: (id, duration) => {
        const safeDuration = normalizeImageDuration(duration);
        set((state) => {
          const updated = state.mediaItems.map((item) =>
            item.id === id ? { ...item, duration: safeDuration } : item
          );
          return {
            mediaItems: updated,
            totalDuration: calculateTotalDuration(updated),
          };
        });
      },

      // Transform - Scale
      updateScale: (id, scale) => {
        const validated = validateScale(scale);
        set((state) => ({
          mediaItems: state.mediaItems.map((item) =>
            item.id === id ? { ...item, scale: validated } : item
          ),
        }));
      },

      // Transform - Position
      updatePosition: (id, axis, value) => {
        const validated = validatePosition(value);
        set((state) => ({
          mediaItems: state.mediaItems.map((item) => {
            if (item.id !== id) return item;
            return axis === 'x'
              ? { ...item, positionX: validated }
              : { ...item, positionY: validated };
          }),
        }));
      },

      // Transform - Rotation（90 度単位で1段階進める。0→90→180→270→0）
      rotateClip: (id) => {
        set((state) => ({
          mediaItems: state.mediaItems.map((item) =>
            item.id === id ? { ...item, rotation: getNextRotation(item.rotation) } : item
          ),
        }));
      },

      // Transform - Blur（1080p基準px。preview/exportではCanvas実寸へ比例変換）
      updateBlur: (id, blur) => {
        const normalized = normalizeMediaBlur(blur);
        set((state) => ({
          mediaItems: state.mediaItems.map((item) =>
            item.id === id ? { ...item, blur: normalized } : item
          ),
        }));
      },

      // Reset transform
      resetTransform: (id, type) => {
        set((state) => ({
          mediaItems: state.mediaItems.map((item) => {
            if (item.id !== id) return item;
            if (type === 'scale') return { ...item, scale: 1.0 };
            if (type === 'x') return { ...item, positionX: 0 };
            if (type === 'y') return { ...item, positionY: 0 };
            if (type === 'rotation') return { ...item, rotation: 0 };
            if (type === 'blur') return { ...item, blur: 0 };
            return item;
          }),
        }));
      },

      // Toggle transform panel
      toggleTransformPanel: (id) => {
        set((state) => ({
          mediaItems: state.mediaItems.map((item) =>
            item.id === id ? { ...item, isTransformOpen: !item.isTransformOpen } : item
          ),
        }));
      },

      // Audio - Volume (max 2.5 = 250%)
      updateVolume: (id, volume) => {
        set((state) => ({
          bulkVideoVolumeEnabled: false,
          mediaItems: state.mediaItems.map((item) =>
            item.id === id ? { ...item, volume: clampMediaVolume(volume) } : item
          ),
        }));
      },

      setBulkVideoVolumeEnabled: (enabled) => {
        set((state) => {
          if (!enabled) {
            return { bulkVideoVolumeEnabled: false };
          }
          const volume = clampMediaVolume(state.bulkVideoVolume);
          return {
            bulkVideoVolumeEnabled: true,
            bulkVideoVolume: volume,
            mediaItems: state.mediaItems.map((item) =>
              item.type === 'video' ? { ...item, volume } : item
            ),
          };
        });
      },

      setBulkVideoVolume: (volume) => {
        const next = clampMediaVolume(volume);
        set((state) => {
          if (!state.bulkVideoVolumeEnabled) {
            return { bulkVideoVolume: next };
          }
          return {
            bulkVideoVolume: next,
            mediaItems: state.mediaItems.map((item) =>
              item.type === 'video' ? { ...item, volume: next } : item
            ),
          };
        });
      },

      setVideoAudioNormalizeEnabled: (enabled) => {
        set((state) => ({
          videoAudioNormalizeEnabled: Boolean(enabled),
          mediaItems: enabled
            ? state.mediaItems
            : state.mediaItems.map((item) =>
              item.type === 'video' ? { ...item, audioNormalizeGain: 1 } : item
            ),
        }));
      },

      setVideoAudioNormalizeMode: (mode) => {
        set({ videoAudioNormalizeMode: normalizeVideoAudioNormalizeMode(mode) });
      },

      setVideoAudioNormalizeParticipating: (id, participating) => {
        set((state) => ({
          mediaItems: state.mediaItems.map((item) =>
            item.id === id && item.type === 'video'
              ? {
                ...item,
                audioNormalizeEnabled: Boolean(participating),
                audioNormalizeGain: participating ? item.audioNormalizeGain : 1,
              }
              : item
          ),
        }));
      },

      applyVideoNormalizeGains: (gains) => {
        set((state) => ({
          mediaItems: state.mediaItems.map((item) => {
            if (item.type !== 'video') return item;
            const nextGain = Number.isFinite(gains[item.id]) ? gains[item.id] : 1;
            if (item.audioNormalizeGain === nextGain) return item;
            return { ...item, audioNormalizeGain: nextGain };
          }),
        }));
      },

      // Audio - Mute
      toggleMute: (id) => {
        set((state) => ({
          bulkVideoMuted: false,
          mediaItems: state.mediaItems.map((item) =>
            item.id === id ? { ...item, isMuted: !item.isMuted } : item
          ),
        }));
      },

      updateVideoPlaybackSpeed: (id, speed) => {
        const nextSpeed = normalizeVideoPlaybackSpeed(speed);
        useLogStore.getState().info('MEDIA', '動画再生速度を更新', { id, speed: nextSpeed });
        set((state) => {
          const updated = state.mediaItems.map((item) => {
            if (item.id !== id || item.type !== 'video') return item;
            return {
              ...item,
              playbackSpeed: nextSpeed,
              duration: computeVideoTimelineDurationFromTrim({
                trimStart: item.trimStart,
                trimEnd: item.trimEnd,
                originalDuration: item.originalDuration,
                playbackSpeed: nextSpeed,
              }),
            };
          });
          return {
            mediaItems: updated,
            totalDuration: calculateTotalDuration(updated),
          };
        });
      },

      updateVideoShowSpeedBadge: (id, show) => {
        set((state) => ({
          mediaItems: state.mediaItems.map((item) => {
            if (item.id !== id || item.type !== 'video') return item;
            const pos = normalizeSpeedBadgePosition(
              item.speedBadgePositionX,
              item.speedBadgePositionY,
            );
            return {
              ...item,
              showSpeedBadge: Boolean(show),
              // 初回 ON 時に既定位置・文言スタイルを埋める
              speedBadgePositionX: item.speedBadgePositionX ?? pos.x,
              speedBadgePositionY: item.speedBadgePositionY ?? pos.y,
              speedBadgeLabelStyle:
                item.speedBadgeLabelStyle ?? DEFAULT_SPEED_BADGE_LABEL_STYLE,
            };
          }),
        }));
      },

      updateVideoSpeedBadgeLabelStyle: (id, style) => {
        const next = normalizeSpeedBadgeLabelStyle(style);
        set((state) => ({
          mediaItems: state.mediaItems.map((item) =>
            item.id === id && item.type === 'video'
              ? { ...item, speedBadgeLabelStyle: next }
              : item
          ),
        }));
      },

      updateVideoSpeedBadgePosition: (id, axis, value) => {
        const safe = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
        set((state) => ({
          mediaItems: state.mediaItems.map((item) => {
            if (item.id !== id || item.type !== 'video') return item;
            const pos = normalizeSpeedBadgePosition(
              item.speedBadgePositionX,
              item.speedBadgePositionY,
            );
            return {
              ...item,
              speedBadgePositionX: axis === 'x' ? safe : pos.x,
              speedBadgePositionY: axis === 'y' ? safe : pos.y,
            };
          }),
        }));
      },

      applyVideoSpeedBadgePreset: (id, preset) => {
        const pos = resolveSpeedBadgePresetPosition(preset);
        set((state) => ({
          mediaItems: state.mediaItems.map((item) =>
            item.id === id && item.type === 'video'
              ? {
                ...item,
                speedBadgePositionX: pos.x,
                speedBadgePositionY: pos.y,
              }
              : item
          ),
        }));
      },

      setAllVideosMuted: (muted) => {
        set((state) => ({
          bulkVideoMuted: muted,
          mediaItems: state.mediaItems.map((item) =>
            item.type === 'video' ? { ...item, isMuted: muted } : item
          ),
        }));
      },

      // Fade In
      toggleFadeIn: (id, enabled) => {
        set((state) => ({
          mediaItems: state.mediaItems.map((item) =>
            item.id === id ? { ...item, fadeIn: enabled } : item
          ),
        }));
      },

      // Fade Out
      toggleFadeOut: (id, enabled) => {
        set((state) => ({
          mediaItems: state.mediaItems.map((item) =>
            item.id === id ? { ...item, fadeOut: enabled } : item
          ),
        }));
      },

      // Fade Duration - In
      updateFadeInDuration: (id, duration) => {
        set((state) => ({
          mediaItems: state.mediaItems.map((item) =>
            item.id === id ? { ...item, fadeInDuration: duration } : item
          ),
        }));
      },

      // Fade Duration - Out
      updateFadeOutDuration: (id, duration) => {
        set((state) => ({
          mediaItems: state.mediaItems.map((item) =>
            item.id === id ? { ...item, fadeOutDuration: duration } : item
          ),
        }));
      },

      // Item lock
      toggleItemLock: (id) => {
        set((state) => ({
          mediaItems: state.mediaItems.map((item) =>
            item.id === id ? { ...item, isLocked: !item.isLocked } : item
          ),
        }));
      },

      // Clips section lock
      toggleClipsLock: () => {
        set((state) => {
          const nextIsClipsLocked = !state.isClipsLocked;
          return {
            isClipsLocked: nextIsClipsLocked,
            // 旧 save/restore 契約との互換用 alias。
            // 関連する操作では isClipsLocked と同期する。
            isLocked: nextIsClipsLocked,
          };
        });
      },

      // Clear all
      clearAllMedia: () => {
        const { mediaItems } = get();
        useLogStore.getState().info('MEDIA', '全メディアをクリア', { itemCount: mediaItems.length });
        mediaItems.forEach((item) => revokeObjectUrl(item.url));
        set({
          mediaItems: [],
          totalDuration: 0,
          isClipsLocked: false,
          isLocked: false,
          projectPosterMode: 'auto',
          projectPosterTimelineTime: 0.2,
          projectPosterDataUrl: null,
          projectPosterAspectRatio: 'landscape',
        });
      },

      // Restore from save (isLockedのエイリアス)
      isLocked: false,
      restoreFromSave: (items, isLocked, poster, audioSettings) => {
        const { mediaItems } = get();
        // 既存のURLを解放
        mediaItems.forEach((item) => revokeObjectUrl(item.url));
        const totalDuration = calculateTotalDuration(items);
        const mode = poster?.mode === 'manual' ? 'manual' as const : 'auto' as const;
        const timelineTime = mode === 'manual' && Number.isFinite(poster?.timelineTime)
          ? Math.max(0, poster!.timelineTime as number)
          : computeAutoProjectPosterTimelineTime(totalDuration);
        const aspectRatio = poster?.aspectRatio === 'portrait' ? 'portrait' : 'landscape';
        set({
          mediaItems: items,
          totalDuration,
          isClipsLocked: isLocked,
          isLocked,
          projectPosterMode: mode,
          projectPosterTimelineTime: timelineTime,
          projectPosterDataUrl: poster?.dataUrl ?? null,
          projectPosterAspectRatio: aspectRatio,
          bulkVideoMuted: resolveSavedBulkMuted(
            audioSettings?.bulkVideoMuted,
            areAllExistingVideosMuted(items),
          ),
          bulkVideoVolumeEnabled: Boolean(audioSettings?.bulkVideoVolumeEnabled),
          bulkVideoVolume: clampMediaVolume(audioSettings?.bulkVideoVolume ?? 1),
          videoAudioNormalizeEnabled: Boolean(audioSettings?.videoAudioNormalizeEnabled),
          videoAudioNormalizeMode: normalizeVideoAudioNormalizeMode(audioSettings?.videoAudioNormalizeMode),
        });
      },
    }),
    { name: 'media-store' }
  )
);

export default useMediaStore;
