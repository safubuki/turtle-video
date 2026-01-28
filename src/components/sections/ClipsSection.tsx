import React from 'react';
import { Upload, Lock, Unlock } from 'lucide-react';
import type { MediaItem } from '../../types';
import ClipItem from '../media/ClipItem';

interface ClipsSectionProps {
  mediaItems: MediaItem[];
  isClipsLocked: boolean;
  mediaElements: Record<string, HTMLVideoElement | HTMLImageElement>;
  onToggleClipsLock: () => void;
  onMediaUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMoveMedia: (index: number, direction: 'up' | 'down') => void;
  onRemoveMedia: (id: string) => void;
  onToggleMediaLock: (id: string) => void;
  onToggleTransformPanel: (id: string) => void;
  onUpdateVideoTrim: (id: string, type: 'start' | 'end', value: string) => void;
  onUpdateImageDuration: (id: string, value: string) => void;
  onUpdateMediaScale: (id: string, value: string | number) => void;
  onUpdateMediaPosition: (id: string, axis: 'x' | 'y', value: string) => void;
  onResetMediaSetting: (id: string, type: 'scale' | 'x' | 'y') => void;
  onUpdateMediaVolume: (id: string, value: number) => void;
  onToggleMediaMute: (id: string) => void;
  onToggleMediaFadeIn: (id: string, checked: boolean) => void;
  onToggleMediaFadeOut: (id: string, checked: boolean) => void;
}

/**
 * クリップセクションコンポーネント
 */
const ClipsSection: React.FC<ClipsSectionProps> = ({
  mediaItems,
  isClipsLocked,
  mediaElements,
  onToggleClipsLock,
  onMediaUpload,
  onMoveMedia,
  onRemoveMedia,
  onToggleMediaLock,
  onToggleTransformPanel,
  onUpdateVideoTrim,
  onUpdateImageDuration,
  onUpdateMediaScale,
  onUpdateMediaPosition,
  onResetMediaSetting,
  onUpdateMediaVolume,
  onToggleMediaMute,
  onToggleMediaFadeIn,
  onToggleMediaFadeOut,
}) => {
  return (
    <section className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden shadow-xl">
      <div className="p-4 bg-gray-850 border-b border-gray-800 flex justify-between items-center">
        <h2 className="font-bold flex items-center gap-2 text-blue-400">
          <span className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center text-xs">
            1
          </span>{' '}
          動画・画像
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleClipsLock}
            className={`p-1.5 rounded transition ${isClipsLocked ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
          >
            {isClipsLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
          <label
            className={`cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${isClipsLocked ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <Upload className="w-3 h-3" /> 追加
            <input
              type="file"
              multiple
              accept="video/*, image/*"
              className="hidden"
              onChange={onMediaUpload}
              disabled={isClipsLocked}
            />
          </label>
        </div>
      </div>
      <div className="p-3 space-y-3 max-h-75 overflow-y-auto custom-scrollbar">
        {mediaItems.length === 0 && (
          <div className="text-center py-8 text-gray-600 text-xs border-2 border-dashed border-gray-800 rounded">
            動画または画像ファイルを追加してください
          </div>
        )}
        {mediaItems.map((v, i) => (
          <ClipItem
            key={v.id}
            item={v}
            index={i}
            totalItems={mediaItems.length}
            isClipsLocked={isClipsLocked}
            mediaElement={mediaElements[v.id] || null}
            onMoveUp={() => onMoveMedia(i, 'up')}
            onMoveDown={() => onMoveMedia(i, 'down')}
            onRemove={() => onRemoveMedia(v.id)}
            onToggleLock={() => onToggleMediaLock(v.id)}
            onToggleTransformPanel={() => onToggleTransformPanel(v.id)}
            onUpdateVideoTrim={(type, value) => onUpdateVideoTrim(v.id, type, value)}
            onUpdateImageDuration={(value) => onUpdateImageDuration(v.id, value)}
            onUpdateScale={(value) => onUpdateMediaScale(v.id, value)}
            onUpdatePosition={(axis, value) => onUpdateMediaPosition(v.id, axis, value)}
            onResetSetting={(type) => onResetMediaSetting(v.id, type)}
            onUpdateVolume={(value) => onUpdateMediaVolume(v.id, value)}
            onToggleMute={() => onToggleMediaMute(v.id)}
            onToggleFadeIn={(checked) => onToggleMediaFadeIn(v.id, checked)}
            onToggleFadeOut={(checked) => onToggleMediaFadeOut(v.id, checked)}
          />
        ))}
      </div>
    </section>
  );
};

export default React.memo(ClipsSection);
