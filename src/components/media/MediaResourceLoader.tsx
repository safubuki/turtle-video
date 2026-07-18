/**
 * @file MediaResourceLoader.tsx
 * @author Turtle Village
 * @description Hidden media elements loader for preview/export
 */
import React, { memo, useMemo } from 'react';
import type { MediaResourceLoaderProps, MediaItem } from '../../types';
import { usePlatformCapabilities } from '../../app/PlatformCapabilitiesContext';

interface MediaItemResourceProps {
  item: MediaItem;
  videoPreload: 'auto' | 'metadata';
  hiddenStyle: React.CSSProperties;
  onRefAssign: (id: string, el: HTMLVideoElement | HTMLImageElement | HTMLAudioElement | null) => void;
  onElementLoaded: (id: string, el: HTMLVideoElement | HTMLImageElement | HTMLAudioElement) => void;
  onSeeked: () => void;
  onVideoLoadedData: () => void;
  onError: (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => void;
}

const MediaItemResource = memo<MediaItemResourceProps>(
  ({ item, videoPreload, hiddenStyle, onRefAssign, onElementLoaded, onSeeked, onVideoLoadedData, onError }) => {
    if (item.type === 'video') {
      return (
        <video
          ref={(el) => {
            if (el) {
              el.setAttribute('webkit-playsinline', '');
            }
            onRefAssign(item.id, el);
          }}
          src={item.url}
          onLoadedMetadata={(e) => onElementLoaded(item.id, e.currentTarget)}
          onLoadedData={onVideoLoadedData}
          onSeeked={onSeeked}
          onError={onError}
          preload={videoPreload}
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
  (prev, next) =>
    prev.item.id === next.item.id
    && prev.item.url === next.item.url
    && prev.videoPreload === next.videoPreload
);

MediaItemResource.displayName = 'MediaItemResource';

const MediaResourceLoader = memo<MediaResourceLoaderProps>(
  ({ mediaItems, bgm, narrations, onElementLoaded, onRefAssign, onSeeked, onVideoLoadedData }) => {
    const { isIosSafari, isAndroid } = usePlatformCapabilities();

    // Android はクリップ数が多いと一律 preload="auto" がデコーダ/メモリ圧迫の温床になるため、
    // 先頭動画以外は metadata に抑える。再生中の直近 next はプレビューエンジンが auto へ昇格させる。
    // iOS Safari / PC は従来どおり auto を維持する。
    const firstVideoId = useMemo(
      () => mediaItems.find((m) => m.type === 'video')?.id ?? null,
      [mediaItems],
    );
    const resolveVideoPreload = (item: MediaItem): 'auto' | 'metadata' =>
      isAndroid && !isIosSafari && item.type === 'video' && item.id !== firstVideoId
        ? 'metadata'
        : 'auto';
    const hiddenStyle: React.CSSProperties = useMemo(() => ({
      position: 'fixed',
      top: 0,
      left: 0,
      width: '320px',
      height: '240px',
      opacity: isIosSafari ? 0.01 : 0.001,
      pointerEvents: 'none',
      zIndex: -1000,
      visibility: 'visible',
    }), [isIosSafari]);

    const audioStyle: React.CSSProperties = useMemo(() => ({
      ...hiddenStyle,
      width: '1px',
      height: '1px',
    }), [hiddenStyle]);

    const handleError = useMemo(
      () => (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
        const el = e.currentTarget;
        if (!el) return;

        console.warn('Resource error, retrying:', (el as HTMLMediaElement).error);
        setTimeout(() => {
          try {
            el.load();
          } catch {
            // ignore
          }
        }, 1000);
      },
      []
    );

    const containerStyle: React.CSSProperties = useMemo(() => ({
      position: 'fixed',
      top: 0,
      left: 0,
      width: isIosSafari ? '1px' : 0,
      height: isIosSafari ? '1px' : 0,
      overflow: isIosSafari ? 'visible' : 'hidden',
      pointerEvents: 'none',
      zIndex: -1000,
    }), [isIosSafari]);

    return (
      <div style={containerStyle}>
        {mediaItems.map((item) => (
          <MediaItemResource
            key={item.id}
            item={item}
            videoPreload={resolveVideoPreload(item)}
            hiddenStyle={hiddenStyle}
            onRefAssign={onRefAssign}
            onElementLoaded={onElementLoaded}
            onSeeked={onSeeked}
            onVideoLoadedData={onVideoLoadedData}
            onError={handleError}
          />
        ))}

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

        {narrations.map((clip) => {
          if (!clip.url) return null;
          const trackId = `narration:${clip.id}`;
          return (
            <audio
              key={clip.id}
              ref={(el) => onRefAssign(trackId, el)}
              src={clip.url}
              onLoadedMetadata={(e) => onElementLoaded(trackId, e.currentTarget)}
              onError={handleError}
              preload="auto"
              crossOrigin="anonymous"
              style={audioStyle}
            />
          );
        })}
      </div>
    );
  },
  (prev, next) => {
    const prevIds = prev.mediaItems.map((m) => `${m.id}:${m.url}`).join(',');
    const nextIds = next.mediaItems.map((m) => `${m.id}:${m.url}`).join(',');
    const itemsChanged = prevIds !== nextIds;
    const bgmChanged = prev.bgm?.url !== next.bgm?.url;
    const prevNarrations = prev.narrations.map((n) => `${n.id}:${n.url}`).join(',');
    const nextNarrations = next.narrations.map((n) => `${n.id}:${n.url}`).join(',');
    const narrationChanged = prevNarrations !== nextNarrations;
    return !itemsChanged && !bgmChanged && !narrationChanged;
  }
);

MediaResourceLoader.displayName = 'MediaResourceLoader';

export default MediaResourceLoader;
