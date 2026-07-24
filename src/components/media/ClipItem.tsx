/**
 * @file ClipItem.tsx
 * @author Turtle Village
 * @description タイムライン上の個々のメディアクリップ（動画・画像）を表示・操作するためのコンポーネント。ドラッグ移動、リサイズ、詳細設定モーダルへのアクセスを提供する。
 */
import React, { useCallback, useState } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  MonitorPlay,
  Image as ImageIcon,
  Clock,
  Scissors,
  Lock,
  Unlock,
  RotateCcw,
  RotateCw,
  Blend,
  ZoomIn,
  Move,
  ChevronDown,
  ChevronRight,
  Volume2,
  VolumeX,
  RefreshCw,
  MapPin,
} from 'lucide-react';
import type { MediaItem } from '../../types';
import MiniPreview from '../common/MiniPreview';
import ClipThumbnail from '../common/ClipThumbnail';
import { SwipeProtectedSlider } from '../SwipeProtectedSlider';
import { useCanvasStore } from '../../stores/canvasStore';
import { canSetVideoTrimFromPreviewPosition } from '../../utils/media';

export interface ClipItemProps {
  item: MediaItem;
  timelineRange: { start: number; end: number };
  /** プロジェクト全体のプレビュー現在位置（秒） */
  currentTime: number;
  index: number;
  totalItems: number;
  isClipsLocked: boolean;
  mediaElement: HTMLVideoElement | HTMLImageElement | null;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** 簡単コピー（standard フレーバーのみ供給される。未供給時はボタン非表示） */
  onDuplicate?: () => void;
  onRemove: () => void;
  onToggleLock: () => void;
  onToggleTransformPanel: () => void;
  onUpdateVideoTrim: (type: 'start' | 'end', value: string) => void;
  /** プレビュー現在位置をこの動画の開始/終了トリムへ反映 */
  onSetVideoTrimFromCurrent: (type: 'start' | 'end') => void;
  onUpdateImageDuration: (value: string) => void;
  onUpdateScale: (value: string | number) => void;
  onUpdatePosition: (axis: 'x' | 'y', value: string) => void;
  /** クリップを 90 度単位で時計回りに回転（0→90→180→270→0） */
  onRotate: () => void;
  onUpdateBlur: (value: number) => void;
  onResetSetting: (type: 'scale' | 'x' | 'y' | 'rotation' | 'blur') => void;
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
  timelineRange,
  currentTime,
  index: i,
  totalItems,
  isClipsLocked,
  mediaElement,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
  onToggleLock,
  onToggleTransformPanel,
  onUpdateVideoTrim,
  onSetVideoTrimFromCurrent,
  onUpdateImageDuration,
  onUpdateScale,
  onUpdatePosition,
  onRotate,
  onUpdateBlur,
  onResetSetting,
  onUpdateVolume,
  onToggleMute,
  onToggleFadeIn,
  onToggleFadeOut,
  onUpdateFadeInDuration,
  onUpdateFadeOutDuration,
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const canvasWidth = useCanvasStore((s) => s.width);
  const canvasHeight = useCanvasStore((s) => s.height);
  const isDisabled = isClipsLocked || v.isLocked;

  // スワイプ保護用コールバック
  const handleTrimStart = useCallback((val: number) => onUpdateVideoTrim('start', String(val)), [onUpdateVideoTrim]);
  const handleTrimEnd = useCallback((val: number) => onUpdateVideoTrim('end', String(val)), [onUpdateVideoTrim]);
  const handleScale = useCallback((val: number) => onUpdateScale(val), [onUpdateScale]);
  const handlePositionX = useCallback((val: number) => onUpdatePosition('x', String(val)), [onUpdatePosition]);
  const handlePositionY = useCallback((val: number) => onUpdatePosition('y', String(val)), [onUpdatePosition]);
  const handleBlur = useCallback((val: number) => onUpdateBlur(val), [onUpdateBlur]);
  const handleImageDuration = useCallback((val: number) => onUpdateImageDuration(String(val)), [onUpdateImageDuration]);
  const handleVolume = useCallback((val: number) => onUpdateVolume(val), [onUpdateVolume]);
  const formatTimelineTime = useCallback((seconds: number): string => {
    if (!Number.isFinite(seconds)) return '00:00.0';
    const totalTenths = Math.max(0, Math.round(seconds * 10));
    const minutes = Math.floor(totalTenths / 600);
    const secs = Math.floor((totalTenths % 600) / 10);
    const tenths = totalTenths % 10;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
  }, []);

  // プレビュー現在位置 → このクリップ内の相対位置（有効区間先頭基準）
  const previewPositionInClip = currentTime - timelineRange.start;
  const canSetTrimStartFromPreview = !isDisabled
    && v.type === 'video'
    && canSetVideoTrimFromPreviewPosition({
      sourceTrimStart: v.trimStart,
      sourceTrimEnd: v.trimEnd,
      originalDuration: v.originalDuration,
      previewPosition: previewPositionInClip,
      type: 'start',
    });
  const canSetTrimEndFromPreview = !isDisabled
    && v.type === 'video'
    && canSetVideoTrimFromPreviewPosition({
      sourceTrimStart: v.trimStart,
      sourceTrimEnd: v.trimEnd,
      originalDuration: v.originalDuration,
      previewPosition: previewPositionInClip,
      type: 'end',
    });

  return (
    <div className="bg-gray-800 p-3 lg:p-4 rounded-xl border border-gray-700/50 relative group">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2 overflow-hidden min-w-0">
          <span className="bg-gray-900 text-gray-500 w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full text-[10px] md:text-xs font-mono shrink-0">
            {i + 1}
          </span>
          <ClipThumbnail file={v.file} type={v.type} />
          {v.type === 'image' ? (
            <ImageIcon className="w-3 h-3 md:w-4 md:h-4 text-yellow-500 shrink-0" />
          ) : (
            <MonitorPlay className="w-3 h-3 md:w-4 md:h-4 text-blue-500 shrink-0" />
          )}
          <span className="text-xs md:text-sm font-medium truncate max-w-24 lg:max-w-32 text-gray-300">
            {v.file.name}
          </span>
          <button
            onClick={onToggleLock}
            className={`p-1 rounded hover:bg-gray-700 shrink-0 ${v.isLocked ? 'text-red-400' : 'text-gray-500'}`}
          >
            {v.isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          </button>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onMoveUp}
            disabled={i === 0 || isDisabled}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 text-gray-300 flex items-center gap-0.5 disabled:opacity-30 disabled:transition-none text-[10px] transition"
            title="上へ移動"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={i === totalItems - 1 || isDisabled}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 text-gray-300 flex items-center gap-0.5 disabled:opacity-30 disabled:transition-none text-[10px] transition"
            title="下へ移動"
          >
            <ArrowDown className="w-3 h-3" />
          </button>
          {onDuplicate && (
            <button
              onClick={onDuplicate}
              disabled={isDisabled}
              className="px-2 py-1 bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 rounded border border-blue-800/50 disabled:opacity-30 text-[10px] transition"
              title="このクリップをコピー（直後に複製を挿入）"
            >
              <Copy className="w-3 h-3" />
            </button>
          )}
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
        <div className="bg-black/30 p-2 lg:p-3 rounded mb-2 border border-gray-700/50 space-y-2">
          <div className="flex items-center justify-between text-[10px] md:text-xs text-gray-500">
            <span>表示区間</span>
            <span className="font-mono text-gray-300">
              {formatTimelineTime(timelineRange.start)} - {formatTimelineTime(timelineRange.end)}
            </span>
          </div>
          <div className="flex items-center gap-2 mb-1 text-[10px] md:text-xs text-gray-400">
            <Scissors className="w-3 h-3" />
            <span>
              トリミング: {v.trimStart.toFixed(2)}s - {v.trimEnd.toFixed(2)}s
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] md:text-xs">
            <span className="text-gray-500 mr-0.5">プレビュー位置を反映:</span>
            <button
              type="button"
              onClick={() => onSetVideoTrimFromCurrent('start')}
              disabled={!canSetTrimStartFromPreview}
              className="min-h-9 px-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 hover:border-green-500/60 hover:text-green-200 disabled:opacity-30 flex items-center gap-1 transition"
              title={
                canSetTrimStartFromPreview
                  ? `現在位置(${formatTimelineTime(currentTime)})をトリミング開始点に設定`
                  : 'この動画の表示区間内で、終了点より前の位置へプレビューを移動してください'
              }
            >
              <MapPin className="w-3.5 h-3.5" /> 開始
            </button>
            <button
              type="button"
              onClick={() => onSetVideoTrimFromCurrent('end')}
              disabled={!canSetTrimEndFromPreview}
              className="min-h-9 px-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 hover:border-red-500/60 hover:text-red-200 disabled:opacity-30 flex items-center gap-1 transition"
              title={
                canSetTrimEndFromPreview
                  ? `現在位置(${formatTimelineTime(currentTime)})をトリミング終了点に設定`
                  : 'この動画の表示区間内で、開始点より後ろの位置へプレビューを移動してください'
              }
            >
              <MapPin className="w-3.5 h-3.5" /> 終了
            </button>
          </div>
          {/* 開始位置 */}
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
            <input
              type="number"
              min="0"
              max={v.originalDuration}
              step="0.1"
              value={Math.round(v.trimStart * 100) / 100}
              onChange={(e) => onUpdateVideoTrim('start', e.target.value)}
              disabled={isDisabled}
              className="w-12 bg-gray-700 border border-gray-600 rounded px-1 text-right focus:outline-none focus:border-green-500 disabled:opacity-50"
            />
            <span className="text-gray-500">秒</span>
          </div>
          {/* 終了位置 */}
          <div className="flex items-center gap-2 text-[10px]">
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
            <input
              type="number"
              min="0"
              max={v.originalDuration}
              step="0.1"
              value={Math.round(v.trimEnd * 100) / 100}
              onChange={(e) => onUpdateVideoTrim('end', e.target.value)}
              disabled={isDisabled}
              className="w-12 bg-gray-700 border border-gray-600 rounded px-1 text-right focus:outline-none focus:border-red-500 disabled:opacity-50"
            />
            <span className="text-gray-500">秒</span>
          </div>
        </div>
      )}

      {/* 画像表示時間UI (新設: ヘッダー下) */}
      {v.type === 'image' && (
        <div className="bg-black/30 p-2 rounded mb-2 border border-gray-700/50">
          <div className="flex items-center justify-between text-[10px] md:text-xs text-gray-500 mb-1">
            <span>表示区間</span>
            <span className="font-mono text-gray-300">
              {formatTimelineTime(timelineRange.start)} - {formatTimelineTime(timelineRange.end)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <Clock className="w-3 h-3 text-gray-400" />
            <span className="text-gray-400 w-14">表示時間</span>
            <SwipeProtectedSlider
              min={0.5}
              max={30}
              step={0.5}
              value={v.duration}
              onChange={handleImageDuration}
              disabled={isDisabled}
              className="flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            />
            <input
              type="number"
              min="0.5"
              max="60"
              step="0.5"
              value={v.duration}
              onChange={(e) => onUpdateImageDuration(e.target.value)}
              disabled={isDisabled}
              className="w-12 bg-gray-700 border border-gray-600 rounded px-1 text-right focus:outline-none focus:border-yellow-500 disabled:opacity-50"
            />
            <span className="text-gray-500">秒</span>
          </div>
        </div>
      )}

      {/* 調整パネル開閉ボタン */}
      <button
        onClick={onToggleTransformPanel}
        disabled={isDisabled}
        className="text-xs md:text-sm flex items-center gap-1 text-gray-400 hover:text-white mb-2 disabled:opacity-50"
      >
        {v.isTransformOpen ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <span>位置・サイズ・回転・ぼかし調整</span>
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
              min={-canvasWidth}
              max={canvasWidth}
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
              min={-canvasHeight}
              max={canvasHeight}
              step={10}
              value={v.positionY || 0}
              onChange={handlePositionY}
              disabled={isDisabled}
              className="w-full accent-blue-400 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            />
          </div>

          {/* 回転 (90度単位) */}
          <div className="flex flex-col gap-1 border-t border-gray-700/50 pt-2 mt-1">
            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <div className="flex items-center gap-1">
                <RotateCw className="w-3 h-3" /> 回転: {v.rotation || 0}°
              </div>
              <button
                onClick={() => onResetSetting('rotation')}
                disabled={isDisabled}
                title="リセット"
                className="hover:text-white disabled:opacity-30"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
            <button
              onClick={onRotate}
              disabled={isDisabled}
              title="90度ずつ回転（縦横の入れ替えに）"
              className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 text-[11px] font-medium transition disabled:opacity-40 disabled:pointer-events-none"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>90°回転</span>
            </button>
          </div>

          {/* ぼかし（カード単位・1080p基準） */}
          <div className="flex flex-col gap-1 border-t border-gray-700/50 pt-2 mt-1">
            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <div className="flex items-center gap-1">
                <Blend className="w-3 h-3" />
                <span>ぼかし: {(v.blur ?? 0) > 0 ? `${Math.round(v.blur ?? 0)} px` : 'なし'}</span>
              </div>
              <button
                onClick={() => onResetSetting('blur')}
                disabled={isDisabled || (v.blur ?? 0) === 0}
                title="ぼかしをリセット"
                aria-label="ぼかしをリセット"
                className="hover:text-white disabled:opacity-30"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
            <SwipeProtectedSlider
              min={0}
              max={30}
              step={1}
              value={v.blur ?? 0}
              onChange={handleBlur}
              disabled={isDisabled}
              ariaLabel="ぼかし強度"
              className="w-full accent-cyan-400 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            />
            <div className="flex justify-between text-[9px] text-gray-600" aria-hidden="true">
              <span>くっきり</span>
              <span>強くぼかす</span>
            </div>
          </div>

          {/* ミニプレビュー */}
          <MiniPreview item={v} mediaElement={mediaElement} />
        </div>
      )}

      {/* 設定パネル開閉ボタン (音量・フェード) */}
      <button
        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
        disabled={isDisabled}
        className="text-xs md:text-sm flex items-center gap-1 text-gray-400 hover:text-white mb-2 disabled:opacity-50 mt-2"
      >
        {isSettingsOpen ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        {/* Sliders Icon removed as per user request */}
        <span>{v.type === 'video' ? '音量・フェード設定' : 'フェード設定'}</span>
      </button>

      {/* 設定パネル (アコーディオン) */}
      {isSettingsOpen && (
        <div className="px-2 mb-2 space-y-3 border-t border-gray-700/50 pt-2 mt-2 bg-gray-900/30 rounded p-2">
          {/* 音量設定 (動画のみ) */}
          {v.type === 'video' && (
            <div className="bg-gray-800/50 p-2 rounded-lg flex items-center gap-2">
              <button
                onClick={onToggleMute}
                disabled={isDisabled}
                className={`p-1 rounded transition ${v.isMuted ? 'bg-red-500/20 text-red-300' : 'text-gray-400 hover:text-white disabled:opacity-50'}`}
                title={v.isMuted ? "ミュート解除" : "ミュート"}
              >
                {v.isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              </button>
              <SwipeProtectedSlider
                min={0}
                max={2.5}
                step={0.05}
                value={v.volume}
                disabled={v.isMuted || isDisabled}
                onChange={handleVolume}
                className={`flex-1 accent-blue-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${v.isMuted || isDisabled ? '' : 'cursor-pointer'}`}
              />
              <span className="text-[10px] md:text-xs text-gray-400 w-10 text-right">{Math.round(v.volume * 100)}%</span>
              <button
                onClick={() => onUpdateVolume(1)}
                disabled={isDisabled}
                className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition disabled:opacity-50"
                title="リセット"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* フェード設定 (共通) - 改善版 */}
          <div className="flex flex-col gap-2 mt-2 text-[10px] md:text-xs">
            {/* フェードイン */}
            <div className="flex items-center gap-2">
              <label
                className={`flex items-center gap-1 w-24 justify-start ${isDisabled ? 'opacity-50' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={v.fadeIn}
                  onChange={(e) => onToggleFadeIn(e.target.checked)}
                  disabled={isDisabled}
                  className="accent-blue-500 rounded cursor-pointer disabled:opacity-50 disabled:cursor-default"
                />
                <span className="whitespace-nowrap">フェードイン</span>
              </label>
              <SwipeProtectedSlider
                min={0}
                max={2}
                step={1}
                value={v.fadeInDuration === 0.5 ? 0 : v.fadeInDuration === 1.0 ? 1 : 2}
                onChange={(val) => {
                  const steps = [0.5, 1.0, 2.0];
                  onUpdateFadeInDuration(steps[val]);
                }}
                disabled={isDisabled || !v.fadeIn}
                className={`flex-1 accent-blue-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 disabled:cursor-default disabled:bg-gray-800 disabled:accent-gray-700 ${isDisabled || !v.fadeIn ? '' : 'cursor-pointer'}`}
              />
              <span className={`text-gray-400 w-8 text-right whitespace-nowrap ${isDisabled || !v.fadeIn ? 'text-gray-600' : 'text-gray-400'}`}>{v.fadeInDuration}秒</span>
            </div>

            {/* フェードアウト */}
            <div className="flex items-center gap-2">
              <label
                className={`flex items-center gap-1 w-24 justify-start ${isDisabled ? 'opacity-50' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={v.fadeOut}
                  onChange={(e) => onToggleFadeOut(e.target.checked)}
                  disabled={isDisabled}
                  className="accent-blue-500 rounded cursor-pointer disabled:opacity-50 disabled:cursor-default"
                />
                <span className="whitespace-nowrap">フェードアウト</span>
              </label>
              <SwipeProtectedSlider
                min={0}
                max={2}
                step={1}
                value={v.fadeOutDuration === 0.5 ? 0 : v.fadeOutDuration === 1.0 ? 1 : 2}
                onChange={(val) => {
                  const steps = [0.5, 1.0, 2.0];
                  onUpdateFadeOutDuration(steps[val]);
                }}
                disabled={isDisabled || !v.fadeOut}
                className={`flex-1 accent-blue-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 disabled:cursor-default disabled:bg-gray-800 disabled:accent-gray-700 ${isDisabled || !v.fadeOut ? '' : 'cursor-pointer'}`}
              />
              <span className={`text-gray-400 w-8 text-right whitespace-nowrap ${isDisabled || !v.fadeOut ? 'text-gray-600' : 'text-gray-400'}`}>{v.fadeOutDuration}秒</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ClipItem);
