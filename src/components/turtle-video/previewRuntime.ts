// 契約型の参照元は凍結済みレガシー実装（typeof のみ・ランタイム依存なし）。
// 実装本体は src/flavors/<flavor>/preview/ 配下にフレーバー別で存在する。
import type { useInactiveVideoManager } from './useInactiveVideoManager';
import type { usePreviewAudioSession } from './usePreviewAudioSession';
import type { usePreviewEngine } from './usePreviewEngine';
import type { usePreviewSeekController } from './usePreviewSeekController';
import type { usePreviewVisibilityLifecycle } from './usePreviewVisibilityLifecycle';
import type { PlatformCapabilities } from '../../utils/platform';
import type { getPreviewPlatformPolicy } from '../../utils/previewPlatform';
import type { CreatePreviewCacheKey, ShouldUsePreviewCache } from './previewCacheContract';

export interface PreviewRuntime {
  getPlatformCapabilities: () => PlatformCapabilities;
  getPreviewPlatformPolicy: typeof getPreviewPlatformPolicy;
  /** プレビューキャッシュ利用可否（apple-safari は常に false） */
  shouldUsePreviewCache: ShouldUsePreviewCache;
  /** プレビューキャッシュのキー生成（apple-safari は固定値スタブ） */
  createPreviewCacheKey: CreatePreviewCacheKey;
  useInactiveVideoManager: typeof useInactiveVideoManager;
  usePreviewAudioSession: typeof usePreviewAudioSession;
  usePreviewEngine: typeof usePreviewEngine;
  usePreviewSeekController: typeof usePreviewSeekController;
  usePreviewVisibilityLifecycle: typeof usePreviewVisibilityLifecycle;
}