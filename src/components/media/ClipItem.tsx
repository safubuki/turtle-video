import React, { useCallback } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  MonitorPlay,
  Image as ImageIcon,
  Clock,
  Scissors,
  Lock,
  Unlock,
  RotateCcw,
  ZoomIn,
  Move,
  ChevronDown,
  ChevronRight,
  Volume2,
  VolumeX,
  RefreshCw,
} from 'lucide-react';
import type { MediaItem } from '../../types';
import MiniPreview from '../common/MiniPreview';
import { SwipeProtectedSlider } from '../SwipeProtectedSlider';

export interface ClipItemProps {
  item: MediaItem;
  index: number;
  totalItems: number;
  isClipsLocked: boolean;
  mediaElement: HTMLVideoElement | HTMLImageElement | null;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onToggleLock: () => void;
  onToggleTransformPanel: () => void;
  onUpdateVideoTrim: (type: 'start' | 'end', value: string) => void;
  onUpdateImageDuration: (value: string) => void;
  onUpdateScale: (value: string | number) => void;
  onUpdatePosition: (axis: 'x' | 'y', value: string) => void;
  onResetSetting: (type: 'scale' | 'x' | 'y') => void;
  onUpdateVolume: (value: number) => void;
  onToggleMute: () => void;
  onToggleFadeIn: (checked: boolean) => void;
  onToggleFadeOut: (checked: boolean) => void;
  onUpdateFadeInDuration: (duration: number) => void;
  onUpdateFadeOutDuration: (duration: number) => void;
}

/**
 * クリップアイテムコンポーネント
 * 動画/画像の個別設定UI
 */
const ClipItem: React.FC<ClipItemProps> = ({
  item: v,
  index: i,
  totalItems,
  isClipsLocked,
  mediaElement,
  onMoveUp,
  onMoveDown,
  onRemove,
  onToggleLock,
  onToggleTransformPanel,
  onUpdateVideoTrim,
  onUpdateImageDuration,
  onUpdateScale,
  onUpdatePosition,
  onResetSetting,
  onUpdateVolume,
  onToggleMute,
  onToggleFadeIn,
  onToggleFadeOut,
  onUpdateFadeInDuration,
  onUpdateFadeOutDuration,
}) => {
  const isDisabled = isClipsLocked || v.isLocked;

  // スワイプ保護用コールバック
  const handleTrimStart = useCallback((val: number) => onUpdateVideoTrim('start', String(val)), [onUpdateVideoTrim]);
  const handleTrimEnd = useCallback((val: number) => onUpdateVideoTrim('end', String(val)), [onUpdateVideoTrim]);
  const handleScale = useCallback((val: number) => onUpdateScale(val), [onUpdateScale]);
  const handlePositionX = useCallback((val: number) => onUpdatePosition('x', String(val)), [onUpdatePosition]);
  const handlePositionY = useCallback((val: number) => onUpdatePosition('y', String(val)), [onUpdatePosition]);
  const handleImageDuration = useCallback((val: number) => onUpdateImageDuration(String(val)), [onUpdateImageDuration]);
  const handleVolume = useCallback((val: number) => onUpdateVolume(val), [onUpdateVolume]);

  return (
    <div className="bg-gray-800 p-3 rounded-xl border border-gray-700/50 relative group">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="bg-gray-900 text-gray-500 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-mono">
            {i + 1}
          </span>
          {v.type === 'image' ? (
            <ImageIcon className="w-3 h-3 text-yellow-500" />
          ) : (
            <MonitorPlay className="w-3 h-3 text-blue-500" />
          )}
          <span className="text-xs font-medium truncate max-w-35 text-gray-300">
            {v.file.name}
          </span>
          <button
            onClick={onToggleLock}
            className={`p-1 rounded hover:bg-gray-700 ${v.isLocked ? 'text-red-400' : 'text-gray-500'}`}
          >
            {v.isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          </button>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onMoveUp}
            disabled={i === 0 || isDisabled}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 text-gray-300 flex items-center gap-0.5 disabled:opacity-30 text-[10px] transition"
            title="上へ移動"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={i === totalItems - 1 || isDisabled}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 text-gray-300 flex items-center gap-0.5 disabled:opacity-30 text-[10px] transition"
            title="下へ移動"
          >
            <ArrowDown className="w-3 h-3" />
          </button>
          <button
            onClick={onRemove}
            disabled={isDisabled}
            className="px-2 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded border border-red-800/50 disabled:opacity-30 text-[10px] transition"
            title="削除"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 動画トリミングUI */}
      {v.type === 'video' && (
        <div className="bg-black/30 p-2 rounded mb-2 border border-gray-700/50">
          <div className="flex items-center gap-2 mb-1 text-[10px] text-gray-400">
            <Scissors className="w-3 h-3" />
            <span>
              トリミング: {v.trimStart.toFixed(1)}s - {v.trimEnd.toFixed(1)}s
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-gray-500 w-6">開始</span>
            <SwipeProtectedSlider
              min={0}
              max={v.originalDuration}
              step={0.1}
              value={v.trimStart}
              onChange={handleTrimStart}
              disabled={isDisabled}
              className="flex-1 accent-green-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-2 text-[10px] mt-1">
            <span className="text-gray-500 w-6">終了</span>
            <SwipeProtectedSlider
              min={0}
              max={v.originalDuration}
              step={0.1}
              value={v.trimEnd}
              onChange={handleTrimEnd}
              disabled={isDisabled}
              className="flex-1 accent-red-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            />
          </div>
        </div>
      )}

      {/* 調整パネル開閉ボタン */}
      <button
        onClick={onToggleTransformPanel}
        disabled={isDisabled}
        className="text-xs flex items-center gap-1 text-gray-400 hover:text-white mb-2 disabled:opacity-50"
      >
        {v.isTransformOpen ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <span>位置・サイズ調整</span>
      </button>

      {/* 調整パネル (アコーディオン) */}
      {v.isTransformOpen && (
        <div className="px-2 mb-2 space-y-2 border-t border-gray-700/50 pt-2 mt-2 bg-gray-900/30 rounded p-2">
          {/* 拡大率 */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <div className="flex items-center gap-1">
                <ZoomIn className="w-3 h-3" /> 拡大: {((v.scale || 1.0) * 100).toFixed(1)}%
              </div>
              <button
                onClick={() => onResetSetting('scale')}
                disabled={isDisabled}
                title="リセット"
                className="hover:text-white disabled:opacity-30"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            {/* 拡大微調整チェックボックス */}
            <div className="flex items-center gap-2 px-1 mb-1">
              <label
                className={`flex items-center gap-1.5 text-[10px] text-gray-300 cursor-pointer hover:text-white transition ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={Math.abs((v.scale || 1.0) - 1.025) < 0.001}
                  onChange={(e) => onUpdateScale(e.target.checked ? 1.025 : 1.0)}
                  className="rounded accent-blue-500 w-3 h-3"
                  disabled={isDisabled}
                />
                <span>黒帯除去 (102.5%に拡大)</span>
              </label>
            </div>

            <SwipeProtectedSlider
              min={0.5}
              max={3.0}
              step={0.001}
              value={v.scale || 1.0}
              onChange={handleScale}
              disabled={isDisabled}
              className="w-full accent-blue-400 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            />
          </div>

          {/* 横方向 */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <div className="flex items-center gap-1">
                <Move className="w-3 h-3" /> 横方向: {Math.round(v.positionX || 0)}
              </div>
              <button
                onClick={() => onResetSetting('x')}
                disabled={isDisabled}
                title="リセット"
                className="hover:text-white disabled:opacity-30"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
            <SwipeProtectedSlider
              min={-1280}
              max={1280}
              step={10}
              value={v.positionX || 0}
              onChange={handlePositionX}
              disabled={isDisabled}
              className="w-full accent-blue-400 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            />
          </div>

          {/* 縦方向 */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <div className="flex items-center gap-1">
                <Move className="w-3 h-3" /> 縦方向: {Math.round(v.positionY || 0)}
              </div>
              <button
                onClick={() => onResetSetting('y')}
                disabled={isDisabled}
                title="リセット"
                className="hover:text-white disabled:opacity-30"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
            <SwipeProtectedSlider
              min={-720}
              max={720}
              step={10}
              value={v.positionY || 0}
              onChange={handlePositionY}
              disabled={isDisabled}
              className="w-full accent-blue-400 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            />
          </div>

          {/* ミニプレビュー */}
          <MiniPreview item={v} mediaElement={mediaElement} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-[10px] bg-gray-900/50 p-2 rounded-lg">
        {v.type === 'image' ? (
          <div className="col-span-2 flex items-center gap-2">
            <Clock className="w-3 h-3 text-gray-400" />
            <span className="text-gray-400">表示時間:</span>
            <input
              type="number"
              min="0.5"
              max="60"
              step="0.5"
              value={v.duration}
              onChange={(e) => onUpdateImageDuration(e.target.value)}
              disabled={isDisabled}
              className="w-12 bg-gray-700 rounded border border-gray-600 px-1 text-right focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <span className="text-gray-400">秒</span>
            <SwipeProtectedSlider
              min={0.5}
              max={30}
              step={0.5}
              value={v.duration}
              onChange={handleImageDuration}
              disabled={isDisabled}
              className="flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            />
          </div>
        ) : (
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={onToggleMute}
                disabled={isDisabled}
                className={`p-1.5 rounded flex items-center gap-1 ${v.isMuted ? 'bg-red-500/20 text-red-300' : 'bg-gray-700 text-gray-300'} disabled:opacity-50`}
              >
                {v.isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              </button>
              <SwipeProtectedSlider
                min={0}
                max={2.5}
                step={0.1}
                value={v.volume}
                disabled={v.isMuted || isDisabled}
                onChange={handleVolume}
                className="flex-1 accent-blue-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
              />
              <span className="text-[10px] text-gray-400 w-10 text-right">{Math.round(v.volume * 100)}%</span>
              <button
                onClick={() => onUpdateVolume(1)}
                disabled={isDisabled}
                className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition disabled:opacity-50"
                title="標準音量に戻す"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
            {/* 標準位置ラベル */}
            <div className="relative h-3 ml-9 mr-16 text-[8px]">
              <span className="absolute left-[40%] -translate-x-1/2 text-gray-500">標準</span>
            </div>
          </div>
        )}
        {/* フェード設定 */}
        <div className="col-span-2 space-y-2">
          {/* フェードイン設定 */}
          <div className="flex items-center gap-2">
            <label
              className={`flex items-center gap-1 cursor-pointer hover:text-blue-300 min-w-[80px] ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <input
                type="checkbox"
                checked={v.fadeIn}
                onChange={(e) => onToggleFadeIn(e.target.checked)}
                disabled={isDisabled}
                className="rounded accent-blue-500 w-3 h-3"
              />
              <span className="text-[10px]">フェードイン</span>
            </label>
            {v.fadeIn && (
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={v.fadeInDuration === 0.5 ? 0 : v.fadeInDuration === 1.0 ? 1 : 2}
                  onChange={(e) => {
                    const steps = [0.5, 1.0, 2.0];
                    onUpdateFadeInDuration(steps[parseInt(e.target.value)]);
                  }}
                  disabled={isDisabled}
                  className="flex-1 accent-blue-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
                />
                <span className="text-[10px] text-gray-400 w-10 text-right">{v.fadeInDuration}秒</span>
              </div>
            )}
          </div>
          {/* フェードアウト設定 */}
          <div className="flex items-center gap-2">
            <label
              className={`flex items-center gap-1 cursor-pointer hover:text-blue-300 min-w-[80px] ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <input
                type="checkbox"
                checked={v.fadeOut}
                onChange={(e) => onToggleFadeOut(e.target.checked)}
                disabled={isDisabled}
                className="rounded accent-blue-500 w-3 h-3"
              />
              <span className="text-[10px]">フェードアウト</span>
            </label>
            {v.fadeOut && (
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={v.fadeOutDuration === 0.5 ? 0 : v.fadeOutDuration === 1.0 ? 1 : 2}
                  onChange={(e) => {
                    const steps = [0.5, 1.0, 2.0];
                    onUpdateFadeOutDuration(steps[parseInt(e.target.value)]);
                  }}
                  disabled={isDisabled}
                  className="flex-1 accent-blue-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
                />
                <span className="text-[10px] text-gray-400 w-10 text-right">{v.fadeOutDuration}秒</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ClipItem);
