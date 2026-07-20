/**
 * @file audioStore.ts
 * @author Turtle Village
 * @description Audio state store (BGM and narrations)
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { AudioTrack, BgmClip, NarrationClip, NarrationSourceType } from '../types';
import { revokeObjectUrl } from '../utils';
import { useLogStore } from './logStore';

interface CreateNarrationClipParams {
  file: File | { name: string };
  url: string;
  duration: number;
  startTime: number;
  sourceType: NarrationSourceType;
  blobUrl?: string;
  volume?: number;
  aiScript?: string;
  aiVoice?: NarrationClip['aiVoice'];
  aiVoiceStyle?: string;
}

interface AudioState {
  // BGM（レガシー単一トラック。standard フレーバーでは bgmClips へ自動移行される）
  bgm: AudioTrack | null;
  isBgmLocked: boolean;

  // BGM クリップ（複数 BGM 対応・standard フレーバー限定機能）
  bgmClips: BgmClip[];

  // Narrations
  narrations: NarrationClip[];
  isNarrationLocked: boolean;

  // BGM actions
  setBgm: (track: AudioTrack | null) => void;
  updateBgmStartPoint: (value: number) => void;
  updateBgmDelay: (value: number) => void;
  updateBgmVolume: (value: number) => void;
  toggleBgmFadeIn: (enabled: boolean) => void;
  toggleBgmFadeOut: (enabled: boolean) => void;
  updateBgmFadeInDuration: (duration: number) => void;
  updateBgmFadeOutDuration: (duration: number) => void;
  toggleBgmLock: () => void;
  removeBgm: () => void;

  // BGM clip actions（複数 BGM・standard フレーバー限定）
  /** 自動フィット付きで BGM クリップを追加する。totalDuration は現在の動画全体の長さ */
  addBgmClip: (params: { file: File; url: string; duration: number }, totalDuration: number) => void;
  duplicateBgmClip: (id: string) => void;
  updateBgmClipStartTime: (id: string, value: number) => void;
  updateBgmClipVolume: (id: string, value: number) => void;
  toggleBgmClipMute: (id: string) => void;
  updateBgmClipTrim: (id: string, edge: 'start' | 'end', value: number) => void;
  /** タイムライン上の終了位置を指定し、音源内の trimEnd へ変換する */
  setBgmClipEndTime: (id: string, timelineEnd: number) => void;
  /** 選択した BGM だけを動画末尾で終わるようトリム／再配置する */
  fitBgmClipToTimelineEnd: (id: string, totalDuration: number) => void;
  toggleBgmClipFadeIn: (id: string, enabled: boolean) => void;
  toggleBgmClipFadeOut: (id: string, enabled: boolean) => void;
  updateBgmClipFadeInDuration: (id: string, duration: number) => void;
  updateBgmClipFadeOutDuration: (id: string, duration: number) => void;
  moveBgmClip: (id: string, direction: 'up' | 'down') => void;
  removeBgmClip: (id: string) => void;
  /** レガシー単一 BGM を bgmClips へ移行する（standard フレーバーの起動/復元時） */
  migrateLegacyBgmToClips: (totalDuration: number) => void;

  // Narration actions
  addNarration: (clip: NarrationClip) => void;
  duplicateNarration: (id: string) => void;
  updateNarrationStartTime: (id: string, value: number) => void;
  updateNarrationVolume: (id: string, value: number) => void;
  toggleNarrationMute: (id: string) => void;
  updateNarrationTrim: (id: string, edge: 'start' | 'end', value: number) => void;
  /** タイムライン上の終了位置を指定し、音源内の trimEnd へ変換する */
  setNarrationEndTime: (id: string, timelineEnd: number) => void;
  updateNarrationMeta: (id: string, updates: Partial<NarrationClip>) => void;
  replaceNarrationAudio: (
    id: string,
    payload: Pick<NarrationClip, 'file' | 'url' | 'blobUrl' | 'duration' | 'sourceType' | 'isAiEditable' | 'aiScript' | 'aiVoice' | 'aiVoiceStyle'>
  ) => void;
  moveNarration: (id: string, direction: 'up' | 'down') => void;
  removeNarration: (id: string) => void;
  setNarrations: (clips: NarrationClip[]) => void;
  toggleNarrationLock: () => void;

  // Clear
  clearAllAudio: () => void;

  // Restore
  restoreFromSave: (
    bgm: AudioTrack | null,
    isBgmLocked: boolean,
    narrations: NarrationClip[],
    isNarrationLocked: boolean,
    bgmClips?: BgmClip[]
  ) => void;
}

function generateNarrationId(): string {
  return `narration_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateBgmClipId(): string {
  return `bgmclip_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** 既存 BGM クリップ群の実効末尾（タイムライン上で最後に音が終わる時刻）を返す */
export function resolveBgmClipsCoverageEnd(clips: BgmClip[]): number {
  return clips.reduce((end, clip) => {
    const trimStart = Number.isFinite(clip.trimStart) ? Math.max(0, clip.trimStart) : 0;
    const trimEnd = Number.isFinite(clip.trimEnd)
      ? Math.max(trimStart, Math.min(clip.duration, clip.trimEnd))
      : clip.duration;
    return Math.max(end, clip.startTime + Math.max(0, trimEnd - trimStart));
  }, 0);
}

/**
 * 自動フィット: 追加する BGM クリップの開始位置とトリム終了を決める。
 * - 開始位置は既存クリップの実効末尾（連続配置・重なりなし）
 * - トリム終了は「動画の残り時間」にぴったり収まるよう調整
 * - 動画が無い/残り時間が無い場合はトリムしない（後から動画を足すケースを妨げない）
 */
export function resolveBgmClipAutoFit(
  existingClips: BgmClip[],
  sourceDuration: number,
  totalDuration: number,
): { startTime: number; trimStart: number; trimEnd: number } {
  const startTime = resolveBgmClipsCoverageEnd(existingClips);
  const safeDuration = Math.max(0, sourceDuration);
  const remaining = totalDuration - startTime;
  if (totalDuration <= 0 || remaining <= 0) {
    return { startTime, trimStart: 0, trimEnd: safeDuration };
  }
  return {
    startTime,
    trimStart: 0,
    trimEnd: Math.min(safeDuration, remaining),
  };
}

const MIN_AUDIO_CLIP_DURATION_SEC = 0.05;

function resolveClipTrimBounds(clip: NarrationClip): {
  duration: number;
  trimStart: number;
  trimEnd: number;
} {
  const duration = Number.isFinite(clip.duration) ? Math.max(0, clip.duration) : 0;
  const trimStart = Number.isFinite(clip.trimStart)
    ? Math.max(0, Math.min(duration, clip.trimStart))
    : 0;
  const trimEnd = Number.isFinite(clip.trimEnd)
    ? Math.max(trimStart, Math.min(duration, clip.trimEnd))
    : duration;
  return { duration, trimStart, trimEnd };
}

/** タイムライン上の終了時刻から、同じ開始位置を保った音源内 trimEnd を求める。 */
export function resolveAudioClipEndAtTimelineTime(
  clip: NarrationClip,
  timelineEnd: number,
): { trimEnd: number } | null {
  if (!Number.isFinite(timelineEnd)) return null;
  const startTime = Number.isFinite(clip.startTime) ? Math.max(0, clip.startTime) : 0;
  const { duration, trimStart } = resolveClipTrimBounds(clip);
  const requestedPlayableDuration = timelineEnd - startTime;
  if (requestedPlayableDuration < MIN_AUDIO_CLIP_DURATION_SEC) return null;
  const trimEnd = Math.min(duration, trimStart + requestedPlayableDuration);
  if (trimEnd - trimStart < MIN_AUDIO_CLIP_DURATION_SEC) return null;
  return { trimEnd };
}

/**
 * クリップの実効終了を動画末尾へ合わせる。
 * 音源が十分長ければ開始位置を保ってトリムし、短ければ実効長を保って後ろへ移動する。
 */
export function resolveAudioClipFitToTimelineEnd(
  clip: NarrationClip,
  totalDuration: number,
): { startTime: number; trimEnd: number } | null {
  if (!Number.isFinite(totalDuration) || totalDuration < MIN_AUDIO_CLIP_DURATION_SEC) return null;
  const { duration, trimStart, trimEnd } = resolveClipTrimBounds(clip);
  const maxPlayableDuration = duration - trimStart;
  if (maxPlayableDuration < MIN_AUDIO_CLIP_DURATION_SEC) return null;

  const startTime = Number.isFinite(clip.startTime) ? Math.max(0, clip.startTime) : 0;
  const durationFromCurrentStart = totalDuration - startTime;
  if (
    durationFromCurrentStart >= MIN_AUDIO_CLIP_DURATION_SEC
    && durationFromCurrentStart <= maxPlayableDuration
  ) {
    return { startTime, trimEnd: trimStart + durationFromCurrentStart };
  }

  const currentPlayableDuration = Math.max(
    MIN_AUDIO_CLIP_DURATION_SEC,
    Math.min(maxPlayableDuration, trimEnd - trimStart),
  );
  const playableDuration = Math.min(currentPlayableDuration, totalDuration);
  return {
    startTime: Math.max(0, totalDuration - playableDuration),
    trimEnd: trimStart + playableDuration,
  };
}

function revokeNarrationUrls(clips: NarrationClip[]): void {
  clips.forEach((clip) => {
    if (clip.url) revokeObjectUrl(clip.url);
  });
}

// Helper: create BGM track
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
    fadeInDuration: 2.0,
    fadeOutDuration: 2.0,
    duration,
    isAi,
  };
}

// Helper: create narration clip
export function createNarrationClip(params: CreateNarrationClipParams): NarrationClip {
  const safeDuration = Math.max(0, params.duration);
  return {
    id: generateNarrationId(),
    sourceType: params.sourceType,
    file: params.file,
    url: params.url,
    blobUrl: params.blobUrl,
    startTime: Math.max(0, params.startTime),
    volume: Math.max(0, Math.min(2.5, params.volume ?? 1.0)),
    isMuted: false,
    trimStart: 0,
    trimEnd: safeDuration,
    duration: safeDuration,
    isAiEditable: params.sourceType === 'ai',
    aiScript: params.aiScript,
    aiVoice: params.aiVoice,
    aiVoiceStyle: params.aiVoiceStyle,
  };
}

function normalizeNarrationClip(clip: NarrationClip): NarrationClip {
  const duration = Math.max(0, clip.duration);
  const fallbackTrimEnd = duration;
  const rawTrimStart = Number.isFinite(clip.trimStart) ? clip.trimStart : 0;
  const rawTrimEnd = Number.isFinite(clip.trimEnd) ? clip.trimEnd : fallbackTrimEnd;
  const clampedTrimStart = Math.max(0, Math.min(duration, rawTrimStart));
  const clampedTrimEnd = Math.max(clampedTrimStart, Math.min(duration, rawTrimEnd));

  return {
    ...clip,
    duration,
    startTime: Math.max(0, clip.startTime),
    volume: Math.max(0, Math.min(2.5, clip.volume)),
    isMuted: Boolean(clip.isMuted),
    trimStart: clampedTrimStart,
    trimEnd: clampedTrimEnd,
  };
}

export const useAudioStore = create<AudioState>()(
  devtools(
    (set, get) => ({
      // Initial state
      bgm: null,
      isBgmLocked: false,
      bgmClips: [],
      narrations: [],
      isNarrationLocked: false,

      // === BGM actions ===
      setBgm: (track) => {
        const { bgm } = get();
        if (bgm?.url) revokeObjectUrl(bgm.url);
        useLogStore.getState().info('AUDIO', 'BGMを設定', {
          fileName: track?.file instanceof File ? track.file.name : track?.file?.name || 'unknown',
          duration: track?.duration || 0,
          isAi: track?.isAi || false,
        });
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
          return { bgm: { ...state.bgm, volume: Math.max(0, Math.min(2.5, value)) } };
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

      updateBgmFadeInDuration: (duration) => {
        set((state) => {
          if (!state.bgm) return state;
          return { bgm: { ...state.bgm, fadeInDuration: duration } };
        });
      },

      updateBgmFadeOutDuration: (duration) => {
        set((state) => {
          if (!state.bgm) return state;
          return { bgm: { ...state.bgm, fadeOutDuration: duration } };
        });
      },

      toggleBgmLock: () => {
        set((state) => ({ isBgmLocked: !state.isBgmLocked }));
      },

      removeBgm: () => {
        const { bgm } = get();
        if (bgm?.url) {
          useLogStore.getState().info('AUDIO', 'BGMを削除', {
            fileName: bgm.file instanceof File ? bgm.file.name : (bgm.file as { name: string }).name,
          });
          revokeObjectUrl(bgm.url);
        }
        set({ bgm: null });
      },

      // === BGM clip actions（複数 BGM・standard フレーバー限定） ===
      addBgmClip: (params, totalDuration) => {
        set((state) => {
          const fit = resolveBgmClipAutoFit(state.bgmClips, params.duration, totalDuration);
          const clip: BgmClip = normalizeNarrationClip({
            id: generateBgmClipId(),
            sourceType: 'file',
            file: params.file,
            url: params.url,
            startTime: fit.startTime,
            volume: 1.0,
            isMuted: false,
            trimStart: fit.trimStart,
            trimEnd: fit.trimEnd,
            duration: Math.max(0, params.duration),
            isAiEditable: false,
            fadeIn: false,
            fadeOut: false,
            fadeInDuration: 2.0,
            fadeOutDuration: 2.0,
          });
          useLogStore.getState().info('AUDIO', 'BGMクリップを追加', {
            id: clip.id,
            fileName: params.file.name,
            startTime: clip.startTime,
            trimEnd: clip.trimEnd,
            totalDuration,
          });
          return { bgmClips: [...state.bgmClips, clip] };
        });
      },

      duplicateBgmClip: (id) => {
        set((state) => {
          const source = state.bgmClips.find((clip) => clip.id === id);
          if (!source || !(source.file instanceof File)) return state;
          const trimStart = Number.isFinite(source.trimStart) ? Math.max(0, source.trimStart) : 0;
          const trimEnd = Number.isFinite(source.trimEnd)
            ? Math.max(trimStart, Math.min(source.duration, source.trimEnd))
            : source.duration;
          const copy: BgmClip = normalizeNarrationClip({
            ...source,
            id: generateBgmClipId(),
            url: URL.createObjectURL(source.file),
            startTime: source.startTime + Math.max(0, trimEnd - trimStart),
          });
          useLogStore.getState().info('AUDIO', 'BGMクリップを複製', {
            sourceId: source.id,
            newId: copy.id,
          });
          return { bgmClips: [...state.bgmClips, copy] };
        });
      },

      updateBgmClipStartTime: (id, value) => {
        set((state) => ({
          bgmClips: state.bgmClips.map((clip) => (
            clip.id === id ? normalizeNarrationClip({ ...clip, startTime: Math.max(0, value) }) : clip
          )),
        }));
      },

      updateBgmClipVolume: (id, value) => {
        set((state) => ({
          bgmClips: state.bgmClips.map((clip) => (
            clip.id === id
              ? normalizeNarrationClip({ ...clip, volume: Math.max(0, Math.min(2.5, value)) })
              : clip
          )),
        }));
      },

      toggleBgmClipMute: (id) => {
        set((state) => ({
          bgmClips: state.bgmClips.map((clip) => (
            clip.id === id ? normalizeNarrationClip({ ...clip, isMuted: !clip.isMuted }) : clip
          )),
        }));
      },

      updateBgmClipTrim: (id, edge, value) => {
        set((state) => ({
          bgmClips: state.bgmClips.map((clip) => {
            if (clip.id !== id) return clip;
            const minGap = 0.05;
            const duration = Math.max(0, clip.duration);
            const trimStart = Number.isFinite(clip.trimStart) ? clip.trimStart : 0;
            const trimEnd = Number.isFinite(clip.trimEnd) ? clip.trimEnd : duration;
            if (edge === 'start') {
              const nextStart = Math.max(0, Math.min(value, trimEnd - minGap));
              return normalizeNarrationClip({ ...clip, trimStart: nextStart });
            }
            const nextEnd = Math.min(duration, Math.max(value, trimStart + minGap));
            return normalizeNarrationClip({ ...clip, trimEnd: nextEnd });
          }),
        }));
      },

      setBgmClipEndTime: (id, timelineEnd) => {
        set((state) => ({
          bgmClips: state.bgmClips.map((clip) => {
            if (clip.id !== id) return clip;
            const update = resolveAudioClipEndAtTimelineTime(clip, timelineEnd);
            return update ? normalizeNarrationClip({ ...clip, ...update }) : clip;
          }),
        }));
      },

      fitBgmClipToTimelineEnd: (id, totalDuration) => {
        set((state) => ({
          bgmClips: state.bgmClips.map((clip) => {
            if (clip.id !== id) return clip;
            const update = resolveAudioClipFitToTimelineEnd(clip, totalDuration);
            return update ? normalizeNarrationClip({ ...clip, ...update }) : clip;
          }),
        }));
      },

      toggleBgmClipFadeIn: (id, enabled) => {
        set((state) => ({
          bgmClips: state.bgmClips.map((clip) => (
            clip.id === id ? { ...clip, fadeIn: enabled } : clip
          )),
        }));
      },

      toggleBgmClipFadeOut: (id, enabled) => {
        set((state) => ({
          bgmClips: state.bgmClips.map((clip) => (
            clip.id === id ? { ...clip, fadeOut: enabled } : clip
          )),
        }));
      },

      updateBgmClipFadeInDuration: (id, duration) => {
        set((state) => ({
          bgmClips: state.bgmClips.map((clip) => (
            clip.id === id ? { ...clip, fadeInDuration: duration } : clip
          )),
        }));
      },

      updateBgmClipFadeOutDuration: (id, duration) => {
        set((state) => ({
          bgmClips: state.bgmClips.map((clip) => (
            clip.id === id ? { ...clip, fadeOutDuration: duration } : clip
          )),
        }));
      },

      moveBgmClip: (id, direction) => {
        set((state) => {
          const idx = state.bgmClips.findIndex((clip) => clip.id === id);
          if (idx < 0) return state;
          const target = direction === 'up' ? idx - 1 : idx + 1;
          if (target < 0 || target >= state.bgmClips.length) return state;
          const next = [...state.bgmClips];
          [next[idx], next[target]] = [next[target], next[idx]];
          return { bgmClips: next };
        });
      },

      removeBgmClip: (id) => {
        const clip = get().bgmClips.find((item) => item.id === id);
        if (clip?.url) {
          useLogStore.getState().info('AUDIO', 'BGMクリップを削除', { id });
          revokeObjectUrl(clip.url);
        }
        set((state) => ({
          bgmClips: state.bgmClips.filter((item) => item.id !== id),
        }));
      },

      migrateLegacyBgmToClips: (totalDuration) => {
        set((state) => {
          if (!state.bgm) return state;
          if (state.bgmClips.length > 0) {
            // 保存データには iOS/旧版互換のため bgmClips の 1 曲目を近似した
            // ミラー bgm が併存する。standard ではミラーを再生経路に残すと
            // 1 曲目が二重再生になるため、ここで破棄する（URL はクリップと
            // 独立に発行されているため、クリップ側と共有していない場合のみ解放）。
            const clipUrls = new Set(state.bgmClips.map((clip) => clip.url));
            if (state.bgm.url && !clipUrls.has(state.bgm.url)) {
              revokeObjectUrl(state.bgm.url);
            }
            useLogStore.getState().info('AUDIO', '互換ミラーBGMを破棄（bgmClipsを使用）', {
              bgmClipCount: state.bgmClips.length,
            });
            return { bgm: null };
          }
          const bgm = state.bgm;
          const trimStart = Math.max(0, bgm.startPoint);
          const availableTimeline = totalDuration > 0
            ? Math.max(0, totalDuration - Math.max(0, bgm.delay))
            : Number.POSITIVE_INFINITY;
          const trimEnd = Math.min(bgm.duration, trimStart + availableTimeline);
          const clip: BgmClip = normalizeNarrationClip({
            id: generateBgmClipId(),
            sourceType: 'file',
            file: bgm.file,
            url: bgm.url, // URL の所有権をクリップへ移す（revoke しない）
            blobUrl: bgm.blobUrl,
            startTime: Math.max(0, bgm.delay),
            volume: bgm.volume,
            isMuted: false,
            trimStart,
            trimEnd: trimEnd > trimStart ? trimEnd : bgm.duration,
            duration: bgm.duration,
            isAiEditable: false,
            fadeIn: bgm.fadeIn,
            fadeOut: bgm.fadeOut,
            fadeInDuration: bgm.fadeInDuration,
            fadeOutDuration: bgm.fadeOutDuration,
          });
          useLogStore.getState().info('AUDIO', 'レガシーBGMをクリップ形式へ移行', {
            newId: clip.id,
            startTime: clip.startTime,
            trimStart: clip.trimStart,
            trimEnd: clip.trimEnd,
          });
          return { bgm: null, bgmClips: [clip] };
        });
      },

      // === Narration actions ===
      addNarration: (clip) => {
        useLogStore.getState().info('AUDIO', 'ナレーションを追加', {
          id: clip.id,
          fileName: clip.file instanceof File ? clip.file.name : clip.file.name,
          sourceType: clip.sourceType,
          startTime: clip.startTime,
          duration: clip.duration,
        });
        set((state) => ({ narrations: [...state.narrations, normalizeNarrationClip(clip)] }));
      },

      // ナレーションを複製（Android/PC 向け簡単コピー）。
      // 独立した ObjectURL を発行し、元クリップのトリム後末尾へ連続配置する（重なり回避）。
      duplicateNarration: (id) => {
        set((state) => {
          const source = state.narrations.find((clip) => clip.id === id);
          if (!source) return state;
          if (!(source.file instanceof File)) {
            useLogStore.getState().warn('AUDIO', 'ナレーション複製をスキップ（File 実体なし）', { id });
            return state;
          }
          const trimStart = Number.isFinite(source.trimStart) ? Math.max(0, source.trimStart) : 0;
          const trimEnd = Number.isFinite(source.trimEnd)
            ? Math.max(trimStart, Math.min(source.duration, source.trimEnd))
            : source.duration;
          const effectiveLength = Math.max(0, trimEnd - trimStart);
          const copy: NarrationClip = normalizeNarrationClip({
            ...source,
            id: generateNarrationId(),
            url: URL.createObjectURL(source.file),
            startTime: source.startTime + effectiveLength,
          });
          useLogStore.getState().info('AUDIO', 'ナレーションを複製', {
            sourceId: source.id,
            newId: copy.id,
            fileName: source.file.name,
            startTime: copy.startTime,
          });
          return { narrations: [...state.narrations, copy] };
        });
      },

      updateNarrationStartTime: (id, value) => {
        set((state) => ({
          narrations: state.narrations.map((clip) => {
            if (clip.id !== id) return clip;
            return { ...clip, startTime: Math.max(0, value) };
          }),
        }));
      },

      updateNarrationVolume: (id, value) => {
        set((state) => ({
          narrations: state.narrations.map((clip) => {
            if (clip.id !== id) return clip;
            return normalizeNarrationClip({ ...clip, volume: Math.max(0, Math.min(2.5, value)) });
          }),
        }));
      },

      toggleNarrationMute: (id) => {
        set((state) => ({
          narrations: state.narrations.map((clip) => (
            clip.id === id ? normalizeNarrationClip({ ...clip, isMuted: !clip.isMuted }) : clip
          )),
        }));
      },

      updateNarrationTrim: (id, edge, value) => {
        set((state) => ({
          narrations: state.narrations.map((clip) => {
            if (clip.id !== id) return clip;
            const minGap = 0.05;
            const duration = Math.max(0, clip.duration);
            const trimStart = Number.isFinite(clip.trimStart) ? clip.trimStart : 0;
            const trimEnd = Number.isFinite(clip.trimEnd) ? clip.trimEnd : duration;

            if (edge === 'start') {
              const nextStart = Math.max(0, Math.min(value, trimEnd - minGap));
              return normalizeNarrationClip({ ...clip, trimStart: nextStart });
            }

            const nextEnd = Math.min(duration, Math.max(value, trimStart + minGap));
            return normalizeNarrationClip({ ...clip, trimEnd: nextEnd });
          }),
        }));
      },

      setNarrationEndTime: (id, timelineEnd) => {
        set((state) => ({
          narrations: state.narrations.map((clip) => {
            if (clip.id !== id) return clip;
            const update = resolveAudioClipEndAtTimelineTime(clip, timelineEnd);
            return update ? normalizeNarrationClip({ ...clip, ...update }) : clip;
          }),
        }));
      },

      updateNarrationMeta: (id, updates) => {
        set((state) => ({
          narrations: state.narrations.map((clip) => {
            if (clip.id !== id) return clip;
            const next = { ...clip, ...updates };
            return normalizeNarrationClip(next);
          }),
        }));
      },

      replaceNarrationAudio: (id, payload) => {
        set((state) => ({
          narrations: state.narrations.map((clip) => {
            if (clip.id !== id) return clip;
            if (clip.url && clip.url !== payload.url) {
              revokeObjectUrl(clip.url);
            }
            return {
              ...clip,
              file: payload.file,
              url: payload.url,
              blobUrl: payload.blobUrl,
              duration: payload.duration,
              trimStart: 0,
              trimEnd: Math.max(0, payload.duration),
              sourceType: payload.sourceType,
              isAiEditable: payload.isAiEditable,
              aiScript: payload.aiScript,
              aiVoice: payload.aiVoice,
              aiVoiceStyle: payload.aiVoiceStyle,
            };
          }),
        }));
      },

      moveNarration: (id, direction) => {
        set((state) => {
          const idx = state.narrations.findIndex((clip) => clip.id === id);
          if (idx < 0) return state;
          const target = direction === 'up' ? idx - 1 : idx + 1;
          if (target < 0 || target >= state.narrations.length) return state;
          const next = [...state.narrations];
          [next[idx], next[target]] = [next[target], next[idx]];
          return { narrations: next };
        });
      },

      removeNarration: (id) => {
        const clip = get().narrations.find((item) => item.id === id);
        if (clip?.url) {
          useLogStore.getState().info('AUDIO', 'ナレーションを削除', {
            id: clip.id,
            fileName: clip.file instanceof File ? clip.file.name : clip.file.name,
          });
          revokeObjectUrl(clip.url);
        }

        set((state) => ({
          narrations: state.narrations.filter((item) => item.id !== id),
        }));
      },

      setNarrations: (clips) => {
        const { narrations } = get();
        revokeNarrationUrls(narrations);
        set({ narrations: clips.map((clip) => normalizeNarrationClip(clip)) });
      },

      toggleNarrationLock: () => {
        set((state) => ({ isNarrationLocked: !state.isNarrationLocked }));
      },

      // === Clear all ===
      clearAllAudio: () => {
        const { bgm, bgmClips, narrations } = get();
        useLogStore.getState().info('AUDIO', '全オーディオをクリア', {
          hasBgm: !!bgm,
          bgmClipCount: bgmClips.length,
          narrationCount: narrations.length,
        });

        if (bgm?.url) revokeObjectUrl(bgm.url);
        revokeNarrationUrls(bgmClips);
        revokeNarrationUrls(narrations);

        set({
          bgm: null,
          isBgmLocked: false,
          bgmClips: [],
          narrations: [],
          isNarrationLocked: false,
        });
      },

      // === Restore from save ===
      restoreFromSave: (newBgm, newIsBgmLocked, newNarrations, newIsNarrationLocked, newBgmClips = []) => {
        const { bgm, bgmClips, narrations } = get();

        if (bgm?.url) revokeObjectUrl(bgm.url);
        revokeNarrationUrls(bgmClips);
        revokeNarrationUrls(narrations);

        set({
          bgm: newBgm,
          isBgmLocked: newIsBgmLocked,
          bgmClips: newBgmClips.map((clip) => normalizeNarrationClip(clip)),
          narrations: newNarrations.map((clip) => normalizeNarrationClip(clip)),
          isNarrationLocked: newIsNarrationLocked,
        });
      },
    }),
    { name: 'audio-store' }
  )
);

export default useAudioStore;
