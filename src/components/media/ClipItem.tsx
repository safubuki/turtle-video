/**
 * @file ClipItem.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
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
  Volume2,
  VolumeX,
  RefreshCw,
  MapPin,
} from 'lucide-react';
import type { MediaItem, SpeedBadgeLabelStyle, VideoPlaybackSpeed } from '../../types';
import MiniPreview from '../common/MiniPreview';
import {
  CENTER_ORIGIN_MAX,
  CENTER_ORIGIN_MIN,
  fromCenterPixels,
  roundCenterOrigin,
  toCenterPixels,
} from '../../utils/centerOriginPosition';
import ClipThumbnail from '../common/ClipThumbnail';
import SettingsAccordionHeader from '../common/SettingsAccordionHeader';
import { SwipeProtectedSlider } from '../SwipeProtectedSlider';
import NumericSliderField from '../common/NumericSliderField';
import { useCanvasStore } from '../../stores/canvasStore';
import {
  canSetVideoTrimFromPreviewPosition,
  resolveMediaThumbnailSourceTime,
} from '../../utils/media';
import { MIN_SCALE, MAX_SCALE } from '../../constants';
import {
  VIDEO_PLAYBACK_SPEEDS,
  MIN_VIDEO_PLAYBACK_SPEED,
  MAX_VIDEO_PLAYBACK_SPEED,
  VIDEO_PLAYBACK_SPEED_STEP,
  DEFAULT_SPEED_BADGE_POSITION,
  formatPlaybackSpeedValue,
  getVideoSourceClipDuration,
  normalizeSpeedBadgeLabelStyle,
  normalizeVideoPlaybackSpeed,
  resolveSpeedBadgePresetPosition,
  type SpeedBadgePositionPreset,
} from '../../utils/playbackSpeed';
import { formatNormalizeAdjustment } from '../../utils/videoAudioLoudness';

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
  onSetVideoTrimFromCurrent?: (type: 'start' | 'end') => void;
  onUpdateImageDuration: (value: string) => void;
  onUpdateScale: (value: string | number) => void;
  onUpdatePosition: (axis: 'x' | 'y', value: string) => void;
  /** クリップを 90 度単位で時計回りに回転（0→90→180→270→0） */
  onRotate?: () => void;
  onUpdateBlur?: (value: number) => void;
  onResetSetting: (type: 'scale' | 'x' | 'y' | 'rotation' | 'blur') => void;
  onUpdateVolume: (value: number) => void;
  onToggleMute: () => void;
  /** 一括音量が有効なときは個別スライダーを無効化する */
  bulkVolumeEnabled?: boolean;
  onUpdatePlaybackSpeed?: (speed: VideoPlaybackSpeed) => void;
  onUpdateShowSpeedBadge?: (show: boolean) => void;
  onUpdateSpeedBadgeLabelStyle?: (style: SpeedBadgeLabelStyle) => void;
  onUpdateSpeedBadgePosition?: (axis: 'x' | 'y', value: number) => void;
  onApplySpeedBadgePreset?: (preset: SpeedBadgePositionPreset) => void;
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
  bulkVolumeEnabled = false,
  onUpdatePlaybackSpeed,
  onUpdateShowSpeedBadge,
  onUpdateSpeedBadgeLabelStyle,
  onUpdateSpeedBadgePosition,
  onApplySpeedBadgePreset,
  onToggleFadeIn,
  onToggleFadeOut,
  onUpdateFadeInDuration,
  onUpdateFadeOutDuration,
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  /** 再生速度アコーディオン（既定は閉じる） */
  const [isPlaybackSpeedOpen, setIsPlaybackSpeedOpen] = useState(false);
  const canvasWidth = useCanvasStore((s) => s.width);
  const canvasHeight = useCanvasStore((s) => s.height);
  const isDisabled = isClipsLocked || v.isLocked;
  const playbackSpeed = normalizeVideoPlaybackSpeed(v.playbackSpeed);
  const speedBadgeLabelStyle = normalizeSpeedBadgeLabelStyle(v.speedBadgeLabelStyle);
  const sourceClipDuration = v.type === 'video' ? getVideoSourceClipDuration(v) : 0;

  // スワイプ保護用コールバック
  const handleTrimStart = useCallback((val: number) => onUpdateVideoTrim('start', String(val)), [onUpdateVideoTrim]);
  const handleTrimEnd = useCallback((val: number) => onUpdateVideoTrim('end', String(val)), [onUpdateVideoTrim]);
  const handleScale = useCallback((val: number) => onUpdateScale(val), [onUpdateScale]);
  // 位置は「中央原点・上が＋」の共通座標系（%）で操作し、保存形式(px)へ変換して渡す。
  // ロゴ・キャプションと操作感を揃えるための変換層（centerOriginPosition.ts 参照）。
  const handlePositionX = useCallback(
    (val: number) => onUpdatePosition('x', String(toCenterPixels(val, canvasWidth, 'x'))),
    [onUpdatePosition, canvasWidth],
  );
  const handlePositionY = useCallback(
    (val: number) => onUpdatePosition('y', String(toCenterPixels(val, canvasHeight, 'y'))),
    [onUpdatePosition, canvasHeight],
  );
  const displayPositionX = roundCenterOrigin(fromCenterPixels(v.positionX || 0, canvasWidth, 'x'));
  const displayPositionY = roundCenterOrigin(fromCenterPixels(v.positionY || 0, canvasHeight, 'y'));
  const handleBlur = useCallback((val: number) => onUpdateBlur?.(val), [onUpdateBlur]);
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
      playbackSpeed: v.playbackSpeed,
    });
  const canSetTrimEndFromPreview = !isDisabled
    && v.type === 'video'
    && canSetVideoTrimFromPreviewPosition({
      sourceTrimStart: v.trimStart,
      sourceTrimEnd: v.trimEnd,
      originalDuration: v.originalDuration,
      previewPosition: previewPositionInClip,
      type: 'end',
      playbackSpeed: v.playbackSpeed,
    });

  // リスト用サムネはクリップ単位の自動位置（有効開始+0.2s）。
  // プロジェクト全体のポスター設定はプレビューセクション側（複数クリップ合成前提）。
  const thumbnailSourceTime = v.type === 'video' ? resolveMediaThumbnailSourceTime({
    ...v,
    thumbnailMode: 'auto',
  }) : undefined;
  const thumbnailRangeEnd = v.type === 'video'
    ? (v.trimEnd > v.trimStart ? v.trimEnd : (v.originalDuration > 0 ? v.originalDuration : undefined))
    : undefined;

  return (
    <div className="bg-gray-800 p-3 lg:p-4 rounded-xl border border-gray-700/50 relative group">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2 overflow-hidden min-w-0">
          <span className="bg-gray-900 text-gray-500 w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full text-[10px] md:text-xs font-mono shrink-0">
            {i + 1}
          </span>
          <ClipThumbnail
            file={v.file}
            type={v.type}
            sourceTime={thumbnailSourceTime}
            rangeStart={v.type === 'video' ? v.trimStart : undefined}
            rangeEnd={thumbnailRangeEnd}
          />
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
          {onSetVideoTrimFromCurrent && (
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
          )}
          {/* 開始位置 */}
          <NumericSliderField
            label="開始"
            ariaLabel="トリミング開始位置"
            min={0}
            max={v.originalDuration}
            step={0.1}
            value={v.trimStart}
            onChange={handleTrimStart}
            disabled={isDisabled}
            unit="秒"
            sliderClassName="flex-1 min-w-0 accent-green-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            inputClassName="w-12 focus:border-green-500"
          />
          {/* 終了位置 */}
          <NumericSliderField
            label="終了"
            ariaLabel="トリミング終了位置"
            min={0}
            max={v.originalDuration}
            step={0.1}
            value={v.trimEnd}
            onChange={handleTrimEnd}
            disabled={isDisabled}
            unit="秒"
            sliderClassName="flex-1 min-w-0 accent-red-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            inputClassName="w-12 focus:border-red-500"
          />
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
          <div className="flex items-center gap-1.5 text-[10px]">
            <Clock className="w-3 h-3 text-gray-400 shrink-0" />
            <NumericSliderField
              label="表示時間"
              labelClassName="text-gray-400 w-14 shrink-0"
              ariaLabel="画像の表示時間"
              min={0.5}
              max={30}
              step={0.5}
              value={v.duration}
              onChange={handleImageDuration}
              disabled={isDisabled}
              unit="秒"
              className="flex-1 min-w-0"
              sliderClassName="flex-1 min-w-0 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
              inputClassName="w-12 focus:border-yellow-500"
            />
          </div>
        </div>
      )}

      {/* 調整パネル (アコーディオン) */}
      <div className="mb-2 rounded-lg border border-gray-700/70 bg-gray-900/30">
        <SettingsAccordionHeader
          title="位置・サイズ・回転・ぼかし調整"
          isOpen={v.isTransformOpen}
          disabled={isDisabled}
          controlsId={`clip-transform-settings-${v.id}`}
          onToggle={onToggleTransformPanel}
        />
        {v.isTransformOpen && (
        <div
          id={`clip-transform-settings-${v.id}`}
          className="px-2 pb-2 space-y-2 border-t border-gray-700/60 pt-2"
        >
          {/* ミニプレビュー: 調整結果を確認する場所なので**スライダーより上**に置く。
              下に置くと、スライダーを操作する指（スマホ）がプレビューを隠してしまい、
              「動かす → 結果を見る」の往復で視線も上下に振られる。
              キャプション設定のミニプレビューとも配置を揃える。 */}
          <MiniPreview item={v} mediaElement={mediaElement} />

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

            <NumericSliderField
              ariaLabel="拡大率"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.001}
              stepperStep={0.025}
              value={v.scale || 1.0}
              onChange={handleScale}
              disabled={isDisabled}
              hideInput
              sliderClassName="flex-1 min-w-0 accent-blue-400 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            />
          </div>

          {/* 横方向 */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <div className="flex items-center gap-1">
                <Move className="w-3 h-3" /> 横 (右+): {displayPositionX}%
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
            <NumericSliderField
              ariaLabel="横位置"
              min={CENTER_ORIGIN_MIN}
              max={CENTER_ORIGIN_MAX}
              step={1}
              value={displayPositionX}
              onChange={handlePositionX}
              disabled={isDisabled}
              hideInput
              sliderClassName="flex-1 min-w-0 accent-blue-400 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            />
          </div>

          {/* 縦方向 */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <div className="flex items-center gap-1">
                <Move className="w-3 h-3" /> 縦 (上+): {displayPositionY}%
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
            <NumericSliderField
              ariaLabel="縦位置"
              min={CENTER_ORIGIN_MIN}
              max={CENTER_ORIGIN_MAX}
              step={1}
              value={displayPositionY}
              onChange={handlePositionY}
              disabled={isDisabled}
              hideInput
              sliderClassName="flex-1 min-w-0 accent-blue-400 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            />
          </div>

          {/* 回転 (90度単位) */}
          {onRotate && (
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
          )}

          {/* ぼかし（カード単位・1080p基準） */}
          {onUpdateBlur && (
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
            <NumericSliderField
              min={0}
              max={30}
              step={1}
              value={v.blur ?? 0}
              onChange={handleBlur}
              disabled={isDisabled}
              ariaLabel="ぼかし強度"
              hideInput
              sliderClassName="flex-1 min-w-0 accent-cyan-400 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            />
            <div className="flex justify-between text-[9px] text-gray-600" aria-hidden="true">
              <span>くっきり</span>
              <span>強くぼかす</span>
            </div>
            </div>
          )}
        </div>
        )}
        </div>

      {/* 設定パネル (アコーディオン: 音量・フェード) */}
      <div className="mb-2 rounded-lg border border-gray-700/70 bg-gray-900/30">
        <SettingsAccordionHeader
          title={v.type === 'video' ? '音量・フェード設定' : 'フェード設定'}
          isOpen={isSettingsOpen}
          disabled={isDisabled}
          controlsId={`clip-audio-settings-${v.id}`}
          onToggle={() => setIsSettingsOpen(!isSettingsOpen)}
        />
        {isSettingsOpen && (
        <div
          id={`clip-audio-settings-${v.id}`}
          className="px-2 pb-2 space-y-3 border-t border-gray-700/60 pt-2"
        >
          {/* 音量設定 (動画のみ) */}
          {v.type === 'video' && (
            <div className="space-y-1.5">
            <div className="bg-gray-800/50 p-2 rounded-lg flex items-center gap-2">
              <button
                onClick={onToggleMute}
                disabled={isDisabled}
                className={`p-1 rounded transition ${v.isMuted ? 'bg-red-500/20 text-red-300' : 'text-gray-400 hover:text-white disabled:opacity-50'}`}
                title={v.isMuted ? "ミュート解除" : "ミュート"}
              >
                {v.isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              </button>
              <NumericSliderField
                ariaLabel="音量"
                min={0}
                max={2.5}
                step={0.05}
                value={v.volume}
                disabled={v.isMuted || isDisabled || bulkVolumeEnabled}
                onChange={handleVolume}
                hideInput
                className="flex-1 min-w-0"
                sliderClassName={`flex-1 min-w-0 accent-blue-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${v.isMuted || isDisabled || bulkVolumeEnabled ? '' : 'cursor-pointer'}`}
              />
              <span className="text-[10px] md:text-xs text-gray-400 w-10 text-right shrink-0">{Math.round(v.volume * 100)}%</span>
              <button
                onClick={() => onUpdateVolume(1)}
                disabled={isDisabled || bulkVolumeEnabled}
                className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition disabled:opacity-50"
                title="リセット"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
            {bulkVolumeEnabled && (
              <p className="text-[9px] text-blue-300/80 px-1">一括音量設定中のため、ここでは変更できません。</p>
            )}
            {Math.abs((v.audioNormalizeGain ?? 1) - 1) >= 0.02 && (
              <div
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] ${
                  (v.audioNormalizeGain ?? 1) > 1
                    ? 'bg-emerald-500/15 text-emerald-200'
                    : 'bg-amber-500/15 text-amber-200'
                }`}
                data-testid={`clip-normalize-badge-${v.id}`}
              >
                <span className="font-medium">音量揃え</span>
                <span>{formatNormalizeAdjustment(v.audioNormalizeGain ?? 1)}</span>
                <span className="text-[9px] opacity-80">
                  {(v.audioNormalizeGain ?? 1) > 1 ? '（音を上げています）' : '（音を下げています）'}
                </span>
              </div>
            )}
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

      {/* 再生速度（アコーディオン・動画のみ・カード最下部・初期は閉じる） */}
      {v.type === 'video' && onUpdatePlaybackSpeed && (
        <div className="mb-0 rounded-lg border border-gray-700/70 bg-gray-900/30">
          <SettingsAccordionHeader
            title="再生速度"
            isOpen={isPlaybackSpeedOpen}
            disabled={isDisabled}
            controlsId={`clip-playback-speed-${v.id}`}
            onToggle={() => setIsPlaybackSpeedOpen(!isPlaybackSpeedOpen)}
          />
          {isPlaybackSpeedOpen && (
            <div
              id={`clip-playback-speed-${v.id}`}
              className="px-2 pb-2 space-y-2 border-t border-gray-700/60 pt-2"
            >
              <div className="flex items-center justify-between text-[10px] md:text-xs text-gray-500">
                <span>{formatPlaybackSpeedValue(playbackSpeed)}倍</span>
                <span className="font-mono text-gray-300">
                  元 {sourceClipDuration.toFixed(1)}s → 表示 {v.duration.toFixed(1)}s
                </span>
              </div>
              <NumericSliderField
                label="速度"
                ariaLabel="再生速度"
                min={MIN_VIDEO_PLAYBACK_SPEED}
                max={MAX_VIDEO_PLAYBACK_SPEED}
                step={VIDEO_PLAYBACK_SPEED_STEP}
                value={playbackSpeed}
                onChange={onUpdatePlaybackSpeed}
                disabled={isDisabled}
                unit="倍"
                decimals={1}
                sliderClassName="flex-1 min-w-0 accent-amber-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
                inputClassName="w-12 focus:border-amber-500"
              />
              <div className="flex flex-wrap gap-1">
                {VIDEO_PLAYBACK_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => onUpdatePlaybackSpeed(speed)}
                    className={`min-h-7 px-2 rounded-lg border text-[10px] font-medium transition disabled:opacity-40 ${
                      Math.abs(playbackSpeed - speed) < 0.05
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                    }`}
                    title={speed === 1 ? '等倍再生' : `${formatPlaybackSpeedValue(speed)}倍速で再生・書き出し`}
                  >
                    {speed === 1 ? '等倍' : `${formatPlaybackSpeedValue(speed)}倍`}
                  </button>
                ))}
              </div>
              {onUpdateShowSpeedBadge && (
                <div className="space-y-2">
                  <label
                    className={`flex items-center gap-1.5 text-[10px] text-gray-300 ${isDisabled ? 'opacity-50' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      data-testid={`clip-show-speed-badge-${v.id}`}
                      checked={Boolean(v.showSpeedBadge)}
                      disabled={isDisabled}
                      onChange={(e) => onUpdateShowSpeedBadge(e.target.checked)}
                      className="rounded accent-amber-500 w-3 h-3"
                    />
                    <span>プレビュー/書き出しに速度を表示</span>
                  </label>
                  {Math.abs(playbackSpeed - 1) < 0.05 && (
                    <p className="text-[10px] text-gray-500 leading-snug">
                      等倍の映像には出しません。先にチェックしてから速度を変えられます。
                    </p>
                  )}
                  {v.showSpeedBadge && (
                    <div
                      data-testid={`clip-speed-badge-settings-${v.id}`}
                      className="space-y-2"
                    >
                      {onUpdateSpeedBadgeLabelStyle && (
                        <div className="space-y-1">
                          <div className="text-[10px] text-gray-500">表示形式</div>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              disabled={isDisabled}
                              onClick={() => onUpdateSpeedBadgeLabelStyle('ja')}
                              className={`min-h-7 px-2 rounded border text-[10px] transition disabled:opacity-40 ${
                                speedBadgeLabelStyle === 'ja'
                                  ? 'border-amber-500/60 text-amber-200 bg-amber-500/10'
                                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
                              }`}
                            >
                              日本語（{formatPlaybackSpeedValue(playbackSpeed)}倍速）
                            </button>
                            <button
                              type="button"
                              disabled={isDisabled}
                              onClick={() => onUpdateSpeedBadgeLabelStyle('en')}
                              className={`min-h-7 px-2 rounded border text-[10px] transition disabled:opacity-40 ${
                                speedBadgeLabelStyle === 'en'
                                  ? 'border-amber-500/60 text-amber-200 bg-amber-500/10'
                                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
                              }`}
                            >
                              English（{formatPlaybackSpeedValue(playbackSpeed)}x）
                            </button>
                          </div>
                        </div>
                      )}
                      {onUpdateSpeedBadgePosition && onApplySpeedBadgePreset && (
                        <div className="bg-gray-900/40 rounded-lg p-2 space-y-2 border border-gray-700/50">
                          <div className="flex flex-wrap gap-1">
                            {(
                              [
                                ['top-left', '左上'],
                                ['top-right', '右上'],
                                ['bottom-left', '左下'],
                                ['bottom-right', '右下'],
                              ] as const
                            ).map(([preset, label]) => {
                              const pos = resolveSpeedBadgePresetPosition(preset as SpeedBadgePositionPreset);
                              const isActive =
                                Math.abs((v.speedBadgePositionX ?? DEFAULT_SPEED_BADGE_POSITION.x) - pos.x) < 0.5
                                && Math.abs((v.speedBadgePositionY ?? DEFAULT_SPEED_BADGE_POSITION.y) - pos.y) < 0.5;
                              return (
                                <button
                                  key={preset}
                                  type="button"
                                  disabled={isDisabled}
                                  onClick={() => onApplySpeedBadgePreset(preset)}
                                  className={`min-h-7 px-2 rounded border text-[10px] transition disabled:opacity-40 ${
                                    isActive
                                      ? 'border-amber-500/60 text-amber-200 bg-amber-500/10'
                                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                          <NumericSliderField
                            label="横"
                            ariaLabel="速度バッジの横位置"
                            min={0}
                            max={100}
                            step={1}
                            value={v.speedBadgePositionX ?? DEFAULT_SPEED_BADGE_POSITION.x}
                            onChange={(val) => onUpdateSpeedBadgePosition('x', val)}
                            disabled={isDisabled}
                            unit="%"
                            sliderClassName="flex-1 min-w-0 accent-amber-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
                            inputClassName="w-11 focus:border-amber-500"
                          />
                          <NumericSliderField
                            label="縦"
                            ariaLabel="速度バッジの縦位置"
                            min={0}
                            max={100}
                            step={1}
                            value={v.speedBadgePositionY ?? DEFAULT_SPEED_BADGE_POSITION.y}
                            onChange={(val) => onUpdateSpeedBadgePosition('y', val)}
                            disabled={isDisabled}
                            unit="%"
                            sliderClassName="flex-1 min-w-0 accent-amber-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
                            inputClassName="w-11 focus:border-amber-500"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(ClipItem);
