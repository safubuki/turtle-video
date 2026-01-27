import React, { memo } from 'react';
import type { MediaResourceLoaderProps } from '../../types';

/**
 * 動画/画像/音声リソースローダー
 * 画面内に配置し、透明度で隠すことでブラウザの描画停止を回避
 */
const MediaResourceLoader = memo<MediaResourceLoaderProps>(
  ({ mediaItems, bgm, narration, onElementLoaded, onRefAssign, onSeeked }) => {
    const hiddenStyle: React.CSSProperties = {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '320px',
      height: '240px',
      opacity: 0.001,
      pointerEvents: 'none',
      zIndex: -100,
      visibility: 'visible',
    };

    const audioStyle: React.CSSProperties = { display: 'none' };

    const handleError = (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
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
    };

    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: 0, height: 0, overflow: 'hidden' }}>
        {/* 動画・画像 */}
        {mediaItems.map((v) => (
          <React.Fragment key={v.id}>
            {v.type === 'video' ? (
              <video
                ref={(el) => onRefAssign(v.id, el)}
                src={v.url}
                onLoadedMetadata={(e) => onElementLoaded(v.id, e.currentTarget)}
                onSeeked={onSeeked}
                onError={handleError}
                preload="auto"
                playsInline
                style={hiddenStyle}
              />
            ) : (
              <img
                ref={(el) => onRefAssign(v.id, el)}
                src={v.url}
                alt="resource"
                onLoad={(e) => onElementLoaded(v.id, e.currentTarget)}
                style={hiddenStyle}
              />
            )}
          </React.Fragment>
        ))}

        {/* BGM用Audio要素 */}
        {bgm && (
          <audio
            ref={(el) => onRefAssign('bgm', el)}
            src={bgm.url}
            onLoadedMetadata={(e) => onElementLoaded('bgm', e.currentTarget)}
            onError={handleError}
            preload="auto"
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
            style={audioStyle}
          />
        )}
      </div>
    );
  },
  (prev, next) => {
    const itemsChanged = prev.mediaItems !== next.mediaItems;
    const bgmChanged = prev.bgm?.url !== next.bgm?.url;
    const narrationChanged = prev.narration?.url !== next.narration?.url;
    return !itemsChanged && !bgmChanged && !narrationChanged;
  }
);

MediaResourceLoader.displayName = 'MediaResourceLoader';

export default MediaResourceLoader;
