/**
 * @file MediaResourceLoader.tsx
 * @author Turtle Village
 * @description メディアリソース（動画、画像、音声）をDOM上に配置・管理するローダーコンポーネント。キャッシュ効率を高めるためのメモ化や、エラー時の再試行ロジックを含む。
 */
import React, { memo, useMemo } from 'react';
import type { MediaResourceLoaderProps, MediaItem } from '../../types';

/**
 * 個別のメディアアイテムをメモ化するコンポーネント
 * URLが変わらない限り再レンダリングしない
 */
interface MediaItemResourceProps {
  item: MediaItem;
  hiddenStyle: React.CSSProperties;
  onRefAssign: (id: string, el: HTMLVideoElement | HTMLImageElement | HTMLAudioElement | null) => void;
  onElementLoaded: (id: string, el: HTMLVideoElement | HTMLImageElement | HTMLAudioElement) => void;
  onSeeked: () => void;
  onError: (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => void;
}

const MediaItemResource = memo<MediaItemResourceProps>(
  ({ item, hiddenStyle, onRefAssign, onElementLoaded, onSeeked, onError }) => {
    if (item.type === 'video') {
      return (
        <video
          ref={(el) => onRefAssign(item.id, el)}
          src={item.url}
          onLoadedMetadata={(e) => onElementLoaded(item.id, e.currentTarget)}
          onSeeked={onSeeked}
          onError={onError}
          preload="auto"
          playsInline
          crossOrigin="anonymous"
          style={hiddenStyle}
        />
      );
    }
    return (
      <img
        ref={(el) => onRefAssign(item.id, el)}
        src={item.url}
        alt="resource"
        onLoad={(e) => onElementLoaded(item.id, e.currentTarget)}
        style={hiddenStyle}
      />
    );
  },
  (prev, next) => {
    // URLとIDが同じなら再レンダリングしない
    // トリミングや他のプロパティ変更では再レンダリングしない
    return prev.item.id === next.item.id && prev.item.url === next.item.url;
  }
);

MediaItemResource.displayName = 'MediaItemResource';

/**
 * 動画/画像/音声リソースローダー
 * 画面内に配置し、透明度で隠すことでブラウザの描画停止を回避
 */
const MediaResourceLoader = memo<MediaResourceLoaderProps>(
  ({ mediaItems, bgm, narration, onElementLoaded, onRefAssign, onSeeked }) => {
    const hiddenStyle: React.CSSProperties = useMemo(() => ({
      position: 'fixed',
      top: 0,
      left: 0,
      width: '320px',
      height: '240px',
      opacity: 0.001,
      pointerEvents: 'none',
      zIndex: -100,
      visibility: 'visible',
    }), []);

    const audioStyle: React.CSSProperties = useMemo(() => ({ display: 'none' }), []);

    const handleError = useMemo(() => (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
      const el = e.currentTarget;
      if (el) {
        console.warn('Resource error, retrying:', (el as HTMLMediaElement).error);
        setTimeout(() => {
          try {
            el.load();
          } catch (err) {
            /* ignore */
          }
        }, 1000);
      }
    }, []);

    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: 0, height: 0, overflow: 'hidden' }}>
        {/* 動画・画像 - 個別にメモ化 */}
        {mediaItems.map((v) => (
          <MediaItemResource
            key={v.id}
            item={v}
            hiddenStyle={hiddenStyle}
            onRefAssign={onRefAssign}
            onElementLoaded={onElementLoaded}
            onSeeked={onSeeked}
            onError={handleError}
          />
        ))}

        {/* BGM用Audio要素 */}
        {bgm && (
          <audio
            ref={(el) => onRefAssign('bgm', el)}
            src={bgm.url}
            onLoadedMetadata={(e) => onElementLoaded('bgm', e.currentTarget)}
            onError={handleError}
            preload="auto"
            crossOrigin="anonymous"
            style={audioStyle}
          />
        )}

        {/* ナレーション用Audio要素 */}
        {narration && (
          <audio
            ref={(el) => onRefAssign('narration', el)}
            src={narration.url}
            onLoadedMetadata={(e) => onElementLoaded('narration', e.currentTarget)}
            onError={handleError}
            preload="auto"
            crossOrigin="anonymous"
            style={audioStyle}
          />
        )}
      </div>
    );
  },
  (prev, next) => {
    // メディアアイテムのIDとURLだけを比較（順序や他のプロパティは無視）
    const prevIds = prev.mediaItems.map(m => `${m.id}:${m.url}`).join(',');
    const nextIds = next.mediaItems.map(m => `${m.id}:${m.url}`).join(',');
    const itemsChanged = prevIds !== nextIds;
    const bgmChanged = prev.bgm?.url !== next.bgm?.url;
    const narrationChanged = prev.narration?.url !== next.narration?.url;
    return !itemsChanged && !bgmChanged && !narrationChanged;
  }
);

MediaResourceLoader.displayName = 'MediaResourceLoader';

export default MediaResourceLoader;
