/**
 * メディアストア - Zustand
 * メディアアイテムの状態管理
 */

/**
 * @file mediaStore.ts
 * @author Turtle Village
 * @description 動画・画像クリップの状態（追加、削除、順序変更、プロパティ更新）を管理するZustandストア。
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { MediaItem } from '../types';
import {
  createMediaItem,
  calculateTotalDuration,
  validateTrim,
  validateScale,
  validatePosition,
  revokeObjectUrl,
  detectVideoFps
} from '../utils';

interface MediaState {
  // State
  mediaItems: MediaItem[];
  totalDuration: number;
  isClipsLocked: boolean;

  // Actions
  addMediaItems: (files: File[]) => Promise<void>;
  removeMediaItem: (id: string) => void;
  moveMediaItem: (index: number, direction: 'up' | 'down') => void;
  updateMediaItem: (id: string, updates: Partial<MediaItem>) => void;

  // Video specific
  setVideoDuration: (id: string, originalDuration: number) => void;
  updateVideoTrim: (id: string, type: 'start' | 'end', value: number) => void;

  // Image specific
  updateImageDuration: (id: string, duration: number) => void;

  // Transform
  updateScale: (id: string, scale: number) => void;
  updatePosition: (id: string, axis: 'x' | 'y', value: number) => void;
  resetTransform: (id: string, type: 'scale' | 'x' | 'y') => void;
  toggleTransformPanel: (id: string) => void;

  // Audio
  updateVolume: (id: string, volume: number) => void;
  toggleMute: (id: string) => void;

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
}

export const useMediaStore = create<MediaState>()(
  devtools(
    (set, get) => ({
      // Initial state
      mediaItems: [],
      totalDuration: 0,
      isClipsLocked: false,

      // Add media items
      addMediaItems: async (files) => {
        const newItemsProms = files.map(async (file) => {
          const fps = await detectVideoFps(file);
          return createMediaItem(file, fps);
        });
        const newItems = await Promise.all(newItemsProms);

        set((state) => {
          const updated = [...state.mediaItems, ...newItems];
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
        set((state) => {
          const updated = state.mediaItems.map((item) => {
            if (item.id !== id) return item;
            const isInitialized = item.originalDuration > 0;
            const newTrimStart = isInitialized ? item.trimStart : 0;
            const newTrimEnd = isInitialized && item.trimEnd > 0 ? item.trimEnd : originalDuration;
            const newDuration = newTrimEnd - newTrimStart;
            return {
              ...item,
              originalDuration,
              trimStart: newTrimStart,
              trimEnd: newTrimEnd,
              duration: newDuration > 0 ? newDuration : originalDuration,
            };
          });
          return {
            mediaItems: updated,
            totalDuration: calculateTotalDuration(updated),
          };
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
            return {
              ...item,
              trimStart: validated.start,
              trimEnd: validated.end,
              duration: validated.duration,
            };
          });
          return {
            mediaItems: updated,
            totalDuration: calculateTotalDuration(updated),
          };
        });
      },

      // Update image duration
      updateImageDuration: (id, duration) => {
        const safeDuration = Math.max(0.5, duration);
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

      // Reset transform
      resetTransform: (id, type) => {
        set((state) => ({
          mediaItems: state.mediaItems.map((item) => {
            if (item.id !== id) return item;
            if (type === 'scale') return { ...item, scale: 1.0 };
            if (type === 'x') return { ...item, positionX: 0 };
            if (type === 'y') return { ...item, positionY: 0 };
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

      // Audio - Volume (max 1.5 = 150%)
      updateVolume: (id, volume) => {
        set((state) => ({
          mediaItems: state.mediaItems.map((item) =>
            item.id === id ? { ...item, volume: Math.max(0, Math.min(2.0, volume)) } : item
          ),
        }));
      },

      // Audio - Mute
      toggleMute: (id) => {
        set((state) => ({
          mediaItems: state.mediaItems.map((item) =>
            item.id === id ? { ...item, isMuted: !item.isMuted } : item
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
        set((state) => ({ isClipsLocked: !state.isClipsLocked }));
      },

      // Clear all
      clearAllMedia: () => {
        const { mediaItems } = get();
        mediaItems.forEach((item) => revokeObjectUrl(item.url));
        set({ mediaItems: [], totalDuration: 0, isClipsLocked: false });
      },
    }),
    { name: 'media-store' }
  )
);

export default useMediaStore;
