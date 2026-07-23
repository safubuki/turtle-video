/**
 * @file bgmTimeline.ts
 * @description 保存されたBGM設定を変更せず、現在の動画尺に対する実効再生区間を導出する。
 */
import type { BgmClip } from '../types';

export const MIN_EFFECTIVE_BGM_DURATION_SEC = 0.05;

export interface EffectiveBgmClipState {
  source: BgmClip;
  playbackClip: BgmClip | null;
  effectiveStart: number;
  effectiveEnd: number;
  authoredEnd: number;
  isInactive: boolean;
  isTrimmedByTimeline: boolean;
  isAutoExtended: boolean;
  repeatCount: number;
}

const resolveBounds = (clip: BgmClip) => {
  const duration = Number.isFinite(clip.duration) ? Math.max(0, clip.duration) : 0;
  const trimStart = Number.isFinite(clip.trimStart)
    ? Math.max(0, Math.min(duration, clip.trimStart))
    : 0;
  const trimEnd = Number.isFinite(clip.trimEnd)
    ? Math.max(trimStart, Math.min(duration, clip.trimEnd))
    : duration;
  const startTime = Number.isFinite(clip.startTime) ? Math.max(0, clip.startTime) : 0;
  return { duration, trimStart, trimEnd, startTime };
};

/** 1つのBGMについて、動画尺内で実際に再生するクリップを返す。 */
export function resolveEffectiveBgmClip(
  clip: BgmClip,
  totalDuration: number,
): EffectiveBgmClipState {
  const { trimStart, trimEnd, startTime } = resolveBounds(clip);
  const authoredDuration = Math.max(0, trimEnd - trimStart);
  const authoredEnd = startTime + authoredDuration;
  const safeTotalDuration = Number.isFinite(totalDuration) ? Math.max(0, totalDuration) : 0;
  const availableTimelineDuration = Math.max(0, safeTotalDuration - startTime);
  const effectiveDuration = Math.min(authoredDuration, availableTimelineDuration);
  const effectiveEnd = startTime + effectiveDuration;
  const isInactive = effectiveDuration < MIN_EFFECTIVE_BGM_DURATION_SEC;
  const isTrimmedByTimeline = !isInactive
    && effectiveDuration < authoredDuration - 0.001;

  return {
    source: clip,
    playbackClip: isInactive
      ? null
      : {
        ...clip,
        startTime,
        trimStart,
        trimEnd: trimStart + effectiveDuration,
      },
    effectiveStart: startTime,
    effectiveEnd,
    authoredEnd,
    isInactive,
    isTrimmedByTimeline,
    isAutoExtended: false,
    repeatCount: 0,
  };
}

/** 全BGMの表示状態と、再生・書き出しへ渡す実効クリップを一度に導出する。 */
export function resolveEffectiveBgmTimeline(clips: BgmClip[], totalDuration: number) {
  const states = clips.map((clip) => resolveEffectiveBgmClip(clip, totalDuration));
  const safeTotalDuration = Number.isFinite(totalDuration) ? Math.max(0, totalDuration) : 0;
  const extensionTargetIndex = states.reduce((selected, state, index) => {
    if (!state.playbackClip) return selected;
    if (selected < 0) return index;
    const selectedStart = states[selected].effectiveStart;
    return state.effectiveStart >= selectedStart ? index : selected;
  }, -1);

  const playbackClips = states.flatMap((state, index) => {
    if (
      !state.playbackClip
      || index !== extensionTargetIndex
      || state.source.autoExtendToTimelineEnd === false
    ) {
      return state.playbackClip ? [state.playbackClip] : [];
    }

    const { duration, trimStart, trimEnd, startTime } = resolveBounds(state.source);
    const continuousEnd = state.source.wasAutoTrimmedOnAdd ? duration : trimEnd;
    const available = Math.max(0, safeTotalDuration - startTime);
    const firstDuration = Math.min(Math.max(0, continuousEnd - trimStart), available);
    if (firstDuration < MIN_EFFECTIVE_BGM_DURATION_SEC) return [state.playbackClip];

    const segments: BgmClip[] = [{
      ...state.source,
      startTime,
      trimStart,
      trimEnd: trimStart + firstDuration,
    }];
    let cursor = startTime + firstDuration;
    const repeatDuration = Math.max(0, continuousEnd - trimStart);
    const canRepeat = repeatDuration >= MIN_EFFECTIVE_BGM_DURATION_SEC;
    let repeatIndex = 0;
    const MAX_AUTO_REPEAT_SEGMENTS = 256;

    while (canRepeat && cursor < safeTotalDuration - 0.001 && repeatIndex < MAX_AUTO_REPEAT_SEGMENTS) {
      const segmentDuration = Math.min(repeatDuration, safeTotalDuration - cursor);
      segments.push({
        ...state.source,
        id: `${state.source.id}__auto_repeat_${repeatIndex + 1}`,
        startTime: cursor,
        trimStart,
        trimEnd: trimStart + segmentDuration,
        fadeIn: false,
      });
      cursor += segmentDuration;
      repeatIndex += 1;
    }

    if (segments.length > 1) {
      segments.slice(0, -1).forEach((segment) => {
        segment.fadeOut = false;
      });
    }

    const effectiveEnd = Math.min(safeTotalDuration, cursor);
    const isAutoExtended = effectiveEnd > state.effectiveEnd + 0.001;
    if (isAutoExtended) {
      states[index] = {
        ...state,
        playbackClip: segments[0],
        effectiveEnd,
        isInactive: false,
        isTrimmedByTimeline: false,
        isAutoExtended: true,
        repeatCount: Math.max(0, segments.length - 1),
      };
    }
    return segments;
  });

  return {
    states,
    playbackClips,
  };
}
