/**
 * オーディオストア - Zustand
 * BGM・ナレーションの状態管理
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { AudioTrack } from '../types';
import { revokeObjectUrl } from '../utils';

interface AudioState {
  // BGM
  bgm: AudioTrack | null;
  isBgmLocked: boolean;

  // Narration
  narration: AudioTrack | null;
  isNarrationLocked: boolean;

  // BGM Actions
  setBgm: (track: AudioTrack | null) => void;
  updateBgmStartPoint: (value: number) => void;
  updateBgmDelay: (value: number) => void;
  updateBgmVolume: (value: number) => void;
  toggleBgmFadeIn: (enabled: boolean) => void;
  toggleBgmFadeOut: (enabled: boolean) => void;
  toggleBgmLock: () => void;
  removeBgm: () => void;

  // Narration Actions
  setNarration: (track: AudioTrack | null) => void;
  updateNarrationStartPoint: (value: number) => void;
  updateNarrationDelay: (value: number) => void;
  updateNarrationVolume: (value: number) => void;
  toggleNarrationFadeIn: (enabled: boolean) => void;
  toggleNarrationFadeOut: (enabled: boolean) => void;
  toggleNarrationLock: () => void;
  removeNarration: () => void;

  // Clear
  clearAllAudio: () => void;
}

// Helper: オーディオファイルからトラックを作成
export function createAudioTrack(
  file: File,
  duration: number,
  defaultVolume: number = 1.0,
  isAi: boolean = false
): AudioTrack {
  return {
    file,
    url: URL.createObjectURL(file),
    startPoint: 0,
    delay: 0,
    volume: defaultVolume,
    fadeIn: false,
    fadeOut: false,
    duration,
    isAi,
  };
}

export const useAudioStore = create<AudioState>()(
  devtools(
    (set, get) => ({
      // Initial state
      bgm: null,
      isBgmLocked: false,
      narration: null,
      isNarrationLocked: false,

      // === BGM Actions ===
      setBgm: (track) => {
        const { bgm } = get();
        if (bgm?.url) revokeObjectUrl(bgm.url);
        set({ bgm: track });
      },

      updateBgmStartPoint: (value) => {
        set((state) => {
          if (!state.bgm) return state;
          const safeValue = Math.max(0, Math.min(state.bgm.duration, value));
          return { bgm: { ...state.bgm, startPoint: safeValue } };
        });
      },

      updateBgmDelay: (value) => {
        set((state) => {
          if (!state.bgm) return state;
          return { bgm: { ...state.bgm, delay: Math.max(0, value) } };
        });
      },

      updateBgmVolume: (value) => {
        set((state) => {
          if (!state.bgm) return state;
          return { bgm: { ...state.bgm, volume: Math.max(0, Math.min(1, value)) } };
        });
      },

      toggleBgmFadeIn: (enabled) => {
        set((state) => {
          if (!state.bgm) return state;
          return { bgm: { ...state.bgm, fadeIn: enabled } };
        });
      },

      toggleBgmFadeOut: (enabled) => {
        set((state) => {
          if (!state.bgm) return state;
          return { bgm: { ...state.bgm, fadeOut: enabled } };
        });
      },

      toggleBgmLock: () => {
        set((state) => ({ isBgmLocked: !state.isBgmLocked }));
      },

      removeBgm: () => {
        const { bgm } = get();
        if (bgm?.url) revokeObjectUrl(bgm.url);
        set({ bgm: null });
      },

      // === Narration Actions ===
      setNarration: (track) => {
        const { narration } = get();
        if (narration?.url) revokeObjectUrl(narration.url);
        set({ narration: track });
      },

      updateNarrationStartPoint: (value) => {
        set((state) => {
          if (!state.narration) return state;
          const safeValue = Math.max(0, Math.min(state.narration.duration, value));
          return { narration: { ...state.narration, startPoint: safeValue } };
        });
      },

      updateNarrationDelay: (value) => {
        set((state) => {
          if (!state.narration) return state;
          return { narration: { ...state.narration, delay: Math.max(0, value) } };
        });
      },

      updateNarrationVolume: (value) => {
        set((state) => {
          if (!state.narration) return state;
          return { narration: { ...state.narration, volume: Math.max(0, Math.min(1, value)) } };
        });
      },

      toggleNarrationFadeIn: (enabled) => {
        set((state) => {
          if (!state.narration) return state;
          return { narration: { ...state.narration, fadeIn: enabled } };
        });
      },

      toggleNarrationFadeOut: (enabled) => {
        set((state) => {
          if (!state.narration) return state;
          return { narration: { ...state.narration, fadeOut: enabled } };
        });
      },

      toggleNarrationLock: () => {
        set((state) => ({ isNarrationLocked: !state.isNarrationLocked }));
      },

      removeNarration: () => {
        const { narration } = get();
        if (narration?.url) revokeObjectUrl(narration.url);
        set({ narration: null });
      },

      // === Clear All ===
      clearAllAudio: () => {
        const { bgm, narration } = get();
        if (bgm?.url) revokeObjectUrl(bgm.url);
        if (narration?.url) revokeObjectUrl(narration.url);
        set({
          bgm: null,
          isBgmLocked: false,
          narration: null,
          isNarrationLocked: false,
        });
      },
    }),
    { name: 'audio-store' }
  )
);

export default useAudioStore;
