/**
 * @file clipCardDisclosure.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 動画・画像カードの折りたたみ状態。保存しないセッション表示の遷移だけを持つ。
 */
import type { MediaItem } from '../types';
import {
  calculateTotalDurationWithTransitions,
  findActiveTimelineItemWithTransitions,
} from './transitionTimeline';

/** 再生中でも、これ以上時刻が飛んで別カードへ移ったらシークとして開く */
export const CLIP_CARD_SEEK_JUMP_SEC = 0.5;

export interface ClipCardDisclosureState {
  /** 見出しまたは「すべて開く」で開いたカード */
  pinnedIds: string[];
  /** 再生位置・追加について開いている1枚 */
  followId: string | null;
  /** ユーザーが閉じた再生位置。この区間にいる間は追従で開かない */
  suppressedFocusId: string | null;
}

export function createInitialClipCardDisclosure(focusId: string | null): ClipCardDisclosureState {
  return {
    pinnedIds: [],
    followId: focusId,
    suppressedFocusId: null,
  };
}

export function resolveFocusedClipId(items: MediaItem[], time: number): string | null {
  if (items.length === 0 || !Number.isFinite(time)) return null;
  const totalDuration = calculateTotalDurationWithTransitions(items);
  return findActiveTimelineItemWithTransitions(items, time, totalDuration)?.id ?? null;
}

export function isClipCardBodyOpen(state: ClipCardDisclosureState, id: string): boolean {
  return state.pinnedIds.includes(id) || state.followId === id;
}

function withoutId(ids: string[], id: string): string[] {
  return ids.filter((item) => item !== id);
}

export function toggleClipCard(
  state: ClipCardDisclosureState,
  id: string,
  focusId: string | null
): ClipCardDisclosureState {
  if (isClipCardBodyOpen(state, id)) {
    const wasFollow = state.followId === id;
    return {
      pinnedIds: withoutId(state.pinnedIds, id),
      followId: wasFollow ? null : state.followId,
      suppressedFocusId: id === focusId ? id : state.suppressedFocusId,
    };
  }
  if (state.pinnedIds.includes(id) && state.suppressedFocusId !== id) return state;
  return {
    pinnedIds: state.pinnedIds.includes(id) ? state.pinnedIds : [...state.pinnedIds, id],
    followId: state.followId,
    suppressedFocusId: state.suppressedFocusId === id ? null : state.suppressedFocusId,
  };
}

export function expandAllClipCards(ids: string[]): ClipCardDisclosureState {
  return {
    pinnedIds: [...ids],
    followId: null,
    suppressedFocusId: null,
  };
}

export function collapseAllClipCards(focusId: string | null): ClipCardDisclosureState {
  return {
    pinnedIds: [],
    followId: null,
    suppressedFocusId: focusId,
  };
}

export function applyClipCardSeek(
  state: ClipCardDisclosureState,
  nextFocusId: string | null
): ClipCardDisclosureState {
  if (!nextFocusId) {
    if (state.followId === null) return state;
    return { ...state, followId: null };
  }
  if (state.followId === nextFocusId && state.suppressedFocusId === null) return state;
  return {
    pinnedIds: state.pinnedIds,
    followId: nextFocusId,
    suppressedFocusId: null,
  };
}

export function applyClipCardPause(
  state: ClipCardDisclosureState,
  focusId: string | null
): ClipCardDisclosureState {
  if (!focusId) return state;
  if (focusId === state.followId) return state;
  if (focusId === state.suppressedFocusId) return state;
  return {
    pinnedIds: state.pinnedIds,
    followId: focusId,
    suppressedFocusId: null,
  };
}

export function noteClipFocusDuringPlayback(
  state: ClipCardDisclosureState,
  focusId: string | null
): ClipCardDisclosureState {
  if (!state.suppressedFocusId || !focusId || focusId === state.suppressedFocusId) {
    return state;
  }
  return { ...state, suppressedFocusId: null };
}

export function applyAddedClipCards(
  state: ClipCardDisclosureState,
  newIds: string[],
  focusId: string | null,
): ClipCardDisclosureState {
  if (newIds.length === 0) return state;
  // 1件の追加・複製は、そのカードを開く。複数同時はプレビュー位置のカードを開く。
  const openId = newIds.length > 1 ? (focusId ?? newIds[0]) : newIds[newIds.length - 1];
  if (!openId) return state;
  if (state.followId === openId && state.suppressedFocusId === null) return state;
  return {
    pinnedIds: state.pinnedIds,
    followId: openId,
    suppressedFocusId: null,
  };
}

export function pruneClipCardDisclosure(
  state: ClipCardDisclosureState,
  ids: readonly string[]
): ClipCardDisclosureState {
  const idSet = new Set(ids);
  const pinnedIds = state.pinnedIds.filter((id) => idSet.has(id));
  const followId = state.followId && idSet.has(state.followId) ? state.followId : null;
  const suppressedFocusId =
    state.suppressedFocusId && idSet.has(state.suppressedFocusId) ? state.suppressedFocusId : null;
  if (
    pinnedIds.length === state.pinnedIds.length &&
    followId === state.followId &&
    suppressedFocusId === state.suppressedFocusId
  ) {
    return state;
  }
  return { pinnedIds, followId, suppressedFocusId };
}

export interface ClipCardDisclosureStepInput {
  previousIds: readonly string[];
  nextIds: readonly string[];
  focusId: string | null;
  previousFocusId: string | null;
  isPlaying: boolean;
  wasPlaying: boolean;
  focusChangeDeltaSec: number;
  restoreEpochChanged: boolean;
}

export function stepClipCardDisclosure(
  state: ClipCardDisclosureState,
  input: ClipCardDisclosureStepInput
): { state: ClipCardDisclosureState; scrollToId: string | null } {
  if (input.restoreEpochChanged) {
    return {
      state: createInitialClipCardDisclosure(input.focusId),
      scrollToId: input.focusId,
    };
  }

  const added = input.nextIds.filter((id) => !input.previousIds.includes(id));
  const removed = input.previousIds.filter((id) => !input.nextIds.includes(id));
  const fullReplacement =
    input.previousIds.length > 0 &&
    input.nextIds.length > 0 &&
    added.length === input.nextIds.length &&
    removed.length === input.previousIds.length;

  if (fullReplacement) {
    return {
      state: createInitialClipCardDisclosure(input.focusId),
      scrollToId: input.focusId,
    };
  }

  let next = removed.length > 0 ? pruneClipCardDisclosure(state, input.nextIds) : state;
  if (added.length > 0) {
    const opened = applyAddedClipCards(next, added, input.focusId);
    return {
      state: opened,
      scrollToId: opened.followId,
    };
  }

  const focusMoved = input.focusId !== input.previousFocusId;
  if (input.isPlaying) {
    const jumped = focusMoved && input.focusChangeDeltaSec >= CLIP_CARD_SEEK_JUMP_SEC;
    if (jumped) {
      return { state: applyClipCardSeek(next, input.focusId), scrollToId: input.focusId };
    }
    return { state: noteClipFocusDuringPlayback(next, input.focusId), scrollToId: null };
  }

  if (input.wasPlaying) {
    return { state: applyClipCardPause(next, input.focusId), scrollToId: input.focusId };
  }

  if (focusMoved) {
    return { state: applyClipCardSeek(next, input.focusId), scrollToId: input.focusId };
  }

  return { state: next, scrollToId: null };
}
