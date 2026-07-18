/**
 * @file clipTransitions.ts
 * @author Turtle Village
 * @description クリップ間トランジション（standard フレーバー限定機能）の純ロジック。
 *
 * 設計方針: トランジションは**タイムライン長を一切変えない**。
 * - ディゾルブ: 現クリップの終端 d 秒間、次クリップのフレーム（プリロール済み要素の静止フレーム）を
 *   アルファを上げながら重ねる（クリップ同士のオーバーラップはさせない）。
 * - フェード(黒/白): 境界の前 d/2 秒で色板へディップし、後 d/2 秒で明ける。
 * これにより ON/OFF で総再生時間・各クリップの時間帯が変化せず、
 * 音声同期・キャプション・エクスポート尺との不整合が構造的に発生しない。
 * 描画は standard エンジンの renderFrame が行う（プレビューとエクスポートで同一 = WYSIWYG）。
 */
import type { ClipTransition, ClipTransitionType } from '../types';

/** 選択できるトランジション時間（秒） */
export const CLIP_TRANSITION_DURATION_OPTIONS = [0.5, 1, 2] as const;
export const CLIP_TRANSITION_DEFAULT_DURATION = 1;

export const CLIP_TRANSITION_TYPE_OPTIONS: { value: ClipTransitionType; label: string }[] = [
  { value: 'dissolve', label: 'ディゾルブ' },
  { value: 'fade-black', label: 'フェード(黒)' },
  { value: 'fade-white', label: 'フェード(白)' },
];

export function getClipTransitionLabel(type: ClipTransitionType): string {
  return CLIP_TRANSITION_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export interface OutgoingTransitionOverlay {
  color: string;
  alpha: number;
}

export interface IncomingTransitionOverlay {
  color: string;
  alpha: number;
}

function overlayColorFor(type: ClipTransitionType): string {
  return type === 'fade-white' ? '#ffffff' : '#000000';
}

/**
 * 「現クリップ → 次クリップ」側のオーバーレイを返す。
 * remainingSec = 現クリップ終端までの残り秒数。範囲外は null。
 */
export function getOutgoingTransitionOverlay(
  transition: ClipTransition,
  remainingSec: number,
): OutgoingTransitionOverlay | null {
  // ディゾルブはオーバーラップ方式（utils/transitionTimeline + エンジンの peer 描画）で
  // 実現するため、色オーバーレイは返さない。
  if (transition.type === 'dissolve') return null;
  const duration = Math.max(0.1, transition.duration);
  const half = duration / 2;
  if (remainingSec < 0 || remainingSec > half) return null;
  return {
    color: overlayColorFor(transition.type),
    alpha: clamp01(1 - remainingSec / half),
  };
}

/**
 * 「前クリップ → 現クリップ」側（明け）のオーバーレイを返す。
 * elapsedSec = 現クリップ開始からの経過秒数。ディゾルブは明け側の描画が無いので null。
 */
export function getIncomingTransitionOverlay(
  transition: ClipTransition,
  elapsedSec: number,
): IncomingTransitionOverlay | null {
  if (transition.type === 'dissolve') return null;
  const half = Math.max(0.05, transition.duration / 2);
  if (elapsedSec < 0 || elapsedSec >= half) return null;
  return {
    color: overlayColorFor(transition.type),
    alpha: clamp01(1 - elapsedSec / half),
  };
}
