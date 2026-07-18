/**
 * @file ClipsSection.tsx
 * @author Turtle Village
 * @description 動画・画像クリップの管理を行うセクション。アップロード、並び替え、各クリップの基本操作（削除、複製）を提供するリストビュー。
 */
import React, { useRef, useState } from 'react';
import { Upload, Lock, Unlock, CircleHelp, ArrowDownUp } from 'lucide-react';
import type { ClipTransition, MediaItem } from '../../types';
import ClipItem from '../media/ClipItem';
import { usePlatformCapabilities } from '../../app/PlatformCapabilitiesContext';
import { useMediaStore } from '../../stores/mediaStore';
import {
  CLIP_TRANSITION_DEFAULT_DURATION,
  CLIP_TRANSITION_DURATION_OPTIONS,
  CLIP_TRANSITION_TYPE_OPTIONS,
  getClipTransitionLabel,
} from '../../utils/clipTransitions';

/**
 * カードとカードの間のトランジションコネクタ（standard フレーバー限定）。
 * タップで種類（なし/ディゾルブ/フェード黒/フェード白）と時間（0.5/1/2秒）を設定する。
 * トランジションはタイムライン長を変えない（見た目のみ）。
 */
const ClipTransitionConnector: React.FC<{
  transition: ClipTransition | null;
  disabled: boolean;
  onChange: (transition: ClipTransition | null) => void;
}> = ({ transition, disabled, onChange }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-center -my-1">
      <button
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        className={`px-2.5 py-0.5 rounded-full border text-[10px] transition flex items-center gap-1 ${transition
          ? 'bg-purple-900/40 border-purple-500/50 text-purple-200'
          : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
          } disabled:opacity-40`}
        title="このカード間のトランジション（切り替え効果）を設定"
      >
        <ArrowDownUp className="w-3 h-3" />
        {transition
          ? `${getClipTransitionLabel(transition.type)} ${transition.duration}秒`
          : 'トランジション'}
      </button>
      {open && (
        <div className="w-full mt-1 mb-1 p-2 bg-gray-800/80 border border-purple-500/30 rounded-lg space-y-1.5 text-[10px]">
          <div className="flex gap-1">
            <button
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              disabled={disabled}
              className={`flex-1 py-1 rounded transition ${!transition
                ? 'bg-purple-500 text-gray-900 font-semibold'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
            >
              なし
            </button>
            {CLIP_TRANSITION_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onChange({
                  type: opt.value,
                  duration: transition?.duration ?? CLIP_TRANSITION_DEFAULT_DURATION,
                })}
                disabled={disabled}
                className={`flex-1 py-1 rounded transition ${transition?.type === opt.value
                  ? 'bg-purple-500 text-gray-900 font-semibold'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 shrink-0 w-8">時間:</span>
            {CLIP_TRANSITION_DURATION_OPTIONS.map((duration) => (
              <button
                key={duration}
                onClick={() => transition && onChange({ ...transition, duration })}
                disabled={disabled || !transition}
                className={`flex-1 py-1 rounded transition ${transition?.duration === duration
                  ? 'bg-purple-500 text-gray-900 font-semibold'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  } disabled:opacity-40`}
              >
                {duration}秒
              </button>
            ))}
          </div>
          <div className="text-[9px] text-gray-500">
            {transition?.type === 'dissolve'
              ? '※ ディゾルブは前の動画が流れたまま次が重なって始まります（重なりぶん動画全体が短くなります）'
              : '※ フェードは動画全体の長さを変えません'}
          </div>
        </div>
      )}
    </div>
  );
};

interface ClipsSectionProps {
  mediaItems: MediaItem[];
  mediaTimelineRanges: Record<string, { start: number; end: number }>;
  isClipsLocked: boolean;
  mediaElements: Record<string, HTMLVideoElement | HTMLImageElement>;
  onToggleClipsLock: () => void;
  onMediaUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenMediaPicker: () => void;
  supportsShowOpenFilePicker: boolean;
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
  onUpdateFadeInDuration: (id: string, duration: number) => void;
  onUpdateFadeOutDuration: (id: string, duration: number) => void;
  onOpenHelp: () => void;
}

/**
 * クリップセクションコンポーネント
 */
const ClipsSection: React.FC<ClipsSectionProps> = ({
  mediaItems,
  mediaTimelineRanges,
  isClipsLocked,
  mediaElements,
  onToggleClipsLock,
  onMediaUpload,
  onOpenMediaPicker,
  supportsShowOpenFilePicker,
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
  onUpdateFadeInDuration,
  onUpdateFadeOutDuration,
  onOpenHelp,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 簡単コピーは standard フレーバー（Android/PC）限定機能
  const { isIosSafari } = usePlatformCapabilities();
  const duplicateMediaItem = useMediaStore((s) => s.duplicateMediaItem);
  const updateMediaItem = useMediaStore((s) => s.updateMediaItem);
  const canDuplicate = !isIosSafari;
  // クリップ間トランジションは standard フレーバー（Android/PC）限定
  const supportsTransitions = !isIosSafari;

  const handleAddClick = () => {
    if (isClipsLocked) return;
    if (supportsShowOpenFilePicker) {
      onOpenMediaPicker();
      return;
    }
    fileInputRef.current?.click();
  };

  return (
    <section className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden shadow-xl">
      <div className="p-4 bg-gray-850 border-b border-gray-800 flex justify-between items-center gap-3">
        <h2 className="font-bold flex items-center gap-2 text-blue-400 md:text-base lg:text-lg">
          <span className="w-6 h-6 lg:w-7 lg:h-7 rounded-full bg-blue-500/10 flex items-center justify-center text-xs lg:text-sm">
            1
          </span>
          <span>動画・画像</span>
          <button
            onClick={onOpenHelp}
            className="p-1 rounded-lg transition border border-blue-500/45 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200"
            title="このセクションの説明"
            aria-label="動画・画像セクションの説明"
          >
            <CircleHelp className="w-4 h-4" />
          </button>
        </h2>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onToggleClipsLock}
            className={`p-1 rounded-lg transition ${isClipsLocked ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-300 hover:text-white hover:bg-gray-600'}`}
            title={isClipsLocked ? 'ロック解除' : 'ロック'}
            aria-label={isClipsLocked ? '動画・画像セクションのロックを解除' : '動画・画像セクションをロック'}
          >
            {isClipsLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={handleAddClick}
            className={`bg-emerald-700 hover:bg-emerald-600 border border-emerald-500/45 text-white px-2.5 py-1 rounded-lg text-xs md:text-sm font-semibold whitespace-nowrap flex items-center gap-1 transition ${isClipsLocked ? 'opacity-50 pointer-events-none' : ''}`}
            disabled={isClipsLocked}
          >
            <Upload className="w-3 h-3" /> 追加
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={onMediaUpload}
            disabled={isClipsLocked}
          />
        </div>
      </div>
      <div className="p-3 lg:p-4 space-y-3 max-h-75 lg:max-h-128 overflow-y-auto custom-scrollbar">
        {mediaItems.length === 0 && (
          <div className="text-center py-8 text-gray-600 text-xs md:text-sm border-2 border-dashed border-gray-800 rounded">
            動画または画像ファイルを追加してください
          </div>
        )}
        {mediaItems.map((v, i) => (
          <React.Fragment key={v.id}>
          <ClipItem
            item={v}
            timelineRange={mediaTimelineRanges[v.id] ?? { start: 0, end: v.duration }}
            index={i}
            totalItems={mediaItems.length}
            isClipsLocked={isClipsLocked}
            mediaElement={mediaElements[v.id] || null}
            onMoveUp={() => onMoveMedia(i, 'up')}
            onMoveDown={() => onMoveMedia(i, 'down')}
            onDuplicate={canDuplicate ? () => duplicateMediaItem(v.id) : undefined}
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
            onUpdateFadeInDuration={(duration) => onUpdateFadeInDuration(v.id, duration)}
            onUpdateFadeOutDuration={(duration) => onUpdateFadeOutDuration(v.id, duration)}
          />
          {supportsTransitions && i < mediaItems.length - 1 && (
            <ClipTransitionConnector
              transition={v.transitionToNext ?? null}
              disabled={isClipsLocked || v.isLocked}
              onChange={(transition) => updateMediaItem(v.id, { transitionToNext: transition })}
            />
          )}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
};

export default React.memo(ClipsSection);
