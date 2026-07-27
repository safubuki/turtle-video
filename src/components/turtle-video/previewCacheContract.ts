/**
 * @file previewCacheContract.ts
 * @author Turtle Village
 * @description プレビューキャッシュのフレーバー中立な契約型。
 *
 * 実装はフレーバー側が所有する:
 *   - standard      → src/flavors/standard/preview/androidPreviewCache.ts（Android 向け実装）
 *   - apple-safari  → 常に無効（appleSafariPreviewRuntime のスタブ）
 * 共有コンポーネント（TurtleVideo 等）はこの契約と PreviewRuntime 経由でのみ触れること。
 * フレーバー実装を直接 import してはいけない（ESLint で禁止）。
 */
import type {
  AudioTrack,
  Caption,
  CaptionSettings,
  MediaItem,
  NarrationClip,
  VideoTitleSettings,
  WatermarkOverlay,
} from '../../types';

export type PreviewCacheStatus = 'idle' | 'preparing' | 'ready' | 'failed';

export interface PreviewCacheEntry {
  url: string;
  duration: number;
  cacheKey: string;
  createdAt: number;
}

export interface ShouldUsePreviewCacheInput {
  isAndroid: boolean;
  isIosSafari: boolean;
  isExportMode: boolean;
  mediaItems: MediaItem[];
}

export interface CreatePreviewCacheKeyInput {
  mediaItems: MediaItem[];
  bgm: AudioTrack | null;
  narrations: NarrationClip[];
  captions: Caption[];
  captionSettings: CaptionSettings;
  /**
   * 動画タイトル（Issue #211）。焼き込み済みキャッシュ動画に含まれる要素なので、
   * タイトルを変更したらキャッシュが必ず無効化されるようキーへ含める。
   */
  videoTitle: VideoTitleSettings;
  /** ウォーターマークも焼き込み対象なので変更時にキャッシュを無効化する */
  watermarkOverlay?: WatermarkOverlay;
  canvasWidth: number;
  canvasHeight: number;
  fps: number;
}

export type ShouldUsePreviewCache = (input: ShouldUsePreviewCacheInput) => boolean;
export type CreatePreviewCacheKey = (input: CreatePreviewCacheKeyInput) => string;
