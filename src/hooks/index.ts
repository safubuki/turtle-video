/**
 * Custom Hooks - タートルビデオ
 * ビジネスロジックをカプセル化したカスタムフック群
 */

export { useMediaItems } from './useMediaItems';
export type { UseMediaItemsReturn } from './useMediaItems';

export { useAudioTracks } from './useAudioTracks';
export type { UseAudioTracksReturn } from './useAudioTracks';

export { useAudioContext } from './useAudioContext';
export type { UseAudioContextReturn } from './useAudioContext';

export { usePlayback } from './usePlayback';
export type { UsePlaybackReturn } from './usePlayback';

// エクスポートエンジンはフレーバー別に物理分離されている:
//   standard      → src/flavors/standard/export/exportEngine.ts
//   apple-safari  → src/flavors/apple-safari/export/exportEngine.ts
// 共有契約型は ./export-strategies/types を参照。
export type { UseExportReturn, UseExportRuntimeConfig } from './export-strategies/types';

export { useAiNarration } from './useAiNarration';
export type { UseAiNarrationReturn } from './useAiNarration';

export { useAutoSave, getAutoSaveInterval, setAutoSaveInterval } from './useAutoSave';
export type { AutoSaveIntervalOption } from './useAutoSave';

export { useDisableBodyScroll } from './useDisableBodyScroll';
