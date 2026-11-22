/**
 * @file ClipItem.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description タイムライン上の個々のメディアクリップ（動画・画像）を表示・操作するためのコンポーネント。ドラッグ移動、リサイズ、詳細設定モーダルへのアクセスを提供する。
 */
import React, { useCallback, useMemo, useState } from 'react';
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
  Blend,
  Gauge,
  MapPin,
  Split,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { MediaColorAdjust, MediaItem, MediaZoomDirection, SpeedBadgeLabelStyle, VideoPlaybackSpeed } from '../../types';
import ClipThumbnail from '../common/ClipThumbnail';
import ClipFileNameButton from './ClipFileNameButton';
import SettingsAccordionHeader from '../common/SettingsAccordionHeader';
import PresetFadeDurationField from '../common/PresetFadeDurationField';
import NumericSliderField from '../common/NumericSliderField';
import {
  COMPACT_AXIS_LABEL_CLASS,
  COMPACT_AXIS_SECOND_ROW_CLASS,
  CompactFieldHeader,
  CompactMuteToggle,
} from '../common/CompactField';
import { useCanvasStore } from '../../stores/canvasStore';
import {
  canSetVideoTrimFromPreviewPosition,
  computeVideoContinuationTrim,
  resolveImageDurationFromPreviewPosition,
  resolveMediaThumbnailSourceTime,
  resolveVideoSplitSourceTime,
} from '../../utils/media';
import {
  TIME_SLIDER_STEP_SEC,
  TIME_STEPPER_STEP_SEC,
  formatTimeStepperInput,
  resolveEndTimeInput,
  resolveTimeSliderMax,
  stepEndTime,
  stepStartTime,
  formatClipCompactClock,
  formatClipDurationLabel,
} from '../../utils/timeStepperInput';
import {
  IMAGE_DURATION_SLIDER_STEP,
  IMAGE_DURATION_STEP,
  MAX_IMAGE_DURATION,
  MIN_IMAGE_DURATION,
} from '../../constants';
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
  normalizeSpeedRampDuration,
  resolveSpeedBadgePresetPosition,
  resolveVideoSpeedRampForItem,
  SPEED_RAMP_MIN_SPEED_DIFF,
  type SpeedBadgePositionPreset,
} from '../../utils/playbackSpeed';
import { formatNormalizeAdjustment } from '../../utils/videoAudioLoudness';
import {
  resolveMediaScaleFactor,
  type MediaTransformResetKind,
} from '../../utils/mediaZoom';
import type { MediaComposition, MediaMotionPoint } from '../../utils/mediaMotion';
import ClipCompositionPanel from './ClipCompositionPanel';
import ClipColorPanel, { type ColorSnapshot } from './ClipColorPanel';
import { hasMediaColorSettings } from '../../utils/mediaColor';

import { MEDIA_VOLUME_MAX } from '../../utils/mediaVolume';

/** 音量（0〜300%）・速度バッジ位置（0〜100%）の数値欄の幅（3 桁） */
const AUDIO_SPEED_INPUT_WIDTH_CHARS = 3;
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
  /** 現行終了から素材終端までの続きクリップを直後へ追加（standard のみ。余りが無いときは非表示） */
  onAddContinuation?: () => void;
  onSplit?: () => void;
  onRemove: () => void;
  onToggleLock: () => void;
  onToggleTransformPanel: () => void;
  onUpdateVideoTrim: (type: 'start' | 'end', value: string) => void;
  /** プレビュー現在位置をこの動画の開始/終了トリムへ反映 */
  onSetVideoTrimFromCurrent?: (type: 'start' | 'end') => void;
  onUpdateImageDuration: (value: string) => void;
  /** プレビュー現在位置をこの画像の表示終了へ反映 */
  onSetImageEndFromCurrent?: () => void;
  onUpdateScale: (value: string | number) => void;
  /** @deprecated 旧ズーム欄の方向ボタン。「サイズ・位置・動き」へ統合したため使わない（互換のため残す） */
  onUpdateZoomDirection?: (direction: MediaZoomDirection) => void;
  /** @deprecated 旧ズーム量。使わない（互換のため残す） */
  onUpdateZoomAmount?: (amount: number) => void;
  /** その時点（先頭／末尾）を本プレビューで停止表示する（「動かす」の開始・終了の確認） */
  onPreviewZoomEndpoint?: (endpoint: 'start' | 'end') => void;
  /** 動かさないときのサイズ操作。表示中のカードなら現在位置を保ち、別カードなら先頭を確認する */
  onPreviewScale?: () => void;
  zoomPreviewEndpoint?: 'start' | 'end';
  /** 「動かす」で、開始か終了の一方の構図（サイズ・横・縦）を変える。未指定なら動きの欄を出さない */
  onUpdateMotionPoint?: (point: MediaMotionPoint, patch: Partial<MediaComposition>) => void;
  /** 終了の構図を決める（null で開始と同じ＝動きを止める） */
  onSetMotionEnd?: (end: MediaComposition | null) => void;
  /** 前の素材の最後の構図を引き継ぐ */
  onInheritComposition?: () => void;
  /** 直前カードの最後の構図 */
  previousComposition?: MediaComposition;
  onUpdatePosition: (axis: 'x' | 'y', value: string) => void;
  /** クリップを 90 度単位で時計回りに回転（0→90→180→270→0） */
  onRotate?: () => void;
  onUpdateBlur?: (value: number) => void;
  /** 色合いの手動調整（standard 限定。未指定なら「色合い」欄を出さない） */
  onUpdateColorAdjust?: (patch: Partial<MediaColorAdjust>) => void;
  /** 前（上）の素材に色を合わせる（先頭カードでは未指定）。結果を入れたら true */
  onMatchColorToPrevious?: () => Promise<boolean | void> | boolean | void;
  /** 次（下）の素材に色を合わせる（最後のカードでは未指定）。結果を入れたら true */
  onMatchColorToNext?: () => Promise<boolean | void> | boolean | void;
  /** 自動で合わせる前の色合いへ戻す */
  onRestoreColor?: (snapshot: ColorSnapshot) => void;
  onUpdateColorMatchStrength?: (strength: number) => void;
  onClearColorMatch?: () => void;
  onResetColor?: () => void;
  /** 全体の色合い一括設定が有効かつ適用中のとき true */
  isGlobalColorActive?: boolean;
  onResetSetting: (type: MediaTransformResetKind) => void;
  onUpdateVolume: (value: number) => void;
  onToggleMute: () => void;
  /** 一括音量が有効なときは個別スライダーを無効化する */
  bulkVolumeEnabled?: boolean;
  onUpdatePlaybackSpeed?: (speed: VideoPlaybackSpeed) => void;
  onUpdateShowSpeedBadge?: (show: boolean) => void;
  onUpdateSpeedBadgeLabelStyle?: (style: SpeedBadgeLabelStyle) => void;
  onUpdateSpeedBadgePosition?: (axis: 'x' | 'y', value: number) => void;
  onApplySpeedBadgePreset?: (preset: SpeedBadgePositionPreset) => void;
  /** 速度のなめらか接続の ON/OFF（standard 限定。未指定なら UI を出さない） */
  onUpdateSpeedRampIn?: (enabled: boolean) => void;
  /** なめらか接続にかける時間（0.5 / 1 / 2 秒） */
  onUpdateSpeedRampDuration?: (duration: number) => void;
  /**
   * 直前のカードが動画ならその速さ。先頭・直前が画像なら null（なめらか接続は効かない）。
   */
  previousVideoSpeed?: number | null;
  /** 直前または自分が 2 画面表示のペア（同時再生なので、なめらか接続は効かない） */
  isInSplitComparePair?: boolean;
  /**
   * 2 画面表示のペアとして同時再生されるカード。フェードはペアの設定（カード間の 2 画面の設定）で
   * まとめて変えるため、カードのフェードイン/アウトは出さずに案内だけ出す。
   */
  isSplitCompareFadeShared?: boolean;
  /**
   * 直後のカードが動画のときの、そのカードのなめらか接続の状態（無ければ null）。
   * なめらか接続は後ろのカードが受け持つが、前のカードの速度を変えた人も気づけるよう、
   * 前のカードからも同じ設定を切り替えられるようにする（設定の実体は後ろのカード 1 つ）。
   */
  nextClipSpeedRamp?: NextClipSpeedRampInfo | null;
  onUpdateNextSpeedRampIn?: (enabled: boolean) => void;
  onUpdateNextSpeedRampDuration?: (duration: number) => void;
  onToggleFadeIn: (checked: boolean) => void;
  onToggleFadeOut: (checked: boolean) => void;
  onUpdateFadeInDuration: (duration: number) => void;
  onUpdateFadeOutDuration: (duration: number) => void;
  /** 表示区間まで開いているか。未指定時は開いたまま（単体表示・既存テスト用） */
  isOpen?: boolean;
  /** プレビュー再生位置がこのカードにある */
  isFocused?: boolean;
  onToggleOpen?: () => void;
}

/** 直後の動画カードのなめらか接続の状態（前のカードから同じ設定を操作するため） */
export interface NextClipSpeedRampInfo {
  /** 直後の動画の設定速度 */
  speed: number;
  /** 直後のカードでなめらか接続が ON か */
  enabled: boolean;
  /** かける時間の設定（0.5 / 1 / 2 秒） */
  duration: number;
  /** 実際にかかる秒数（短いクリップでは縮む）。効いていなければ null */
  actualSec: number | null;
  /** 直後のカードがロック中 */
  isLocked: boolean;
  /** このカードと直後のカードが 2 画面表示のペア（または直後が次とペア） */
  isSplitComparePair: boolean;
}

interface SpeedRampControlProps {
  testIdPrefix: string;
  itemId: string;
  label: string;
  durationAriaLabel: string;
  checked: boolean;
  disabled: boolean;
  duration: number;
  note: string;
  onToggle: (enabled: boolean) => void;
  onUpdateDuration?: (duration: number) => void;
}

/** 速度のなめらか接続の ON/OFF・かける時間・説明（「前から」「次へ」の両方で使う） */
const SpeedRampControl = React.memo<SpeedRampControlProps>(({
  testIdPrefix,
  itemId,
  label,
  durationAriaLabel,
  checked,
  disabled,
  duration,
  note,
  onToggle,
  onUpdateDuration,
}) => (
  <div
    data-testid={`${testIdPrefix}-${itemId}`}
    className="space-y-1.5 rounded-lg border border-gray-700/50 bg-gray-900/40 p-2"
  >
    <label
      className={`flex items-center gap-1.5 text-[10px] text-gray-300 md:text-xs ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        data-testid={`${testIdPrefix}-toggle-${itemId}`}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onToggle(e.target.checked)}
        className="rounded accent-amber-500 w-3 h-3"
      />
      <span>{label}</span>
    </label>
    {checked && onUpdateDuration && (
      <div className="flex items-center gap-2 text-[10px] md:text-xs">
        <span className="shrink-0 text-gray-500">かける時間</span>
        <PresetFadeDurationField
          value={duration}
          onChange={onUpdateDuration}
          disabled={disabled}
          ariaLabel={durationAriaLabel}
          accentClassName="accent-amber-500"
        />
      </div>
    )}
    <p
      data-testid={`${testIdPrefix}-note-${itemId}`}
      className="text-[10px] leading-snug text-gray-400 md:text-xs"
    >
      {note}
    </p>
  </div>
));

SpeedRampControl.displayName = 'SpeedRampControl';

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
  onAddContinuation,
  onSplit,
  onRemove,
  onToggleLock,
  onToggleTransformPanel,
  onUpdateVideoTrim,
  onSetVideoTrimFromCurrent,
  onUpdateImageDuration,
  onSetImageEndFromCurrent,
  onUpdateScale,
  onPreviewZoomEndpoint,
  onPreviewScale,
  zoomPreviewEndpoint,
  onUpdateMotionPoint,
  onSetMotionEnd,
  onInheritComposition,
  previousComposition,
  onUpdatePosition,
  onRotate,
  onUpdateBlur,
  onUpdateColorAdjust,
  onMatchColorToPrevious,
  onMatchColorToNext,
  onRestoreColor,
  onUpdateColorMatchStrength,
  onClearColorMatch,
  onResetColor,
  isGlobalColorActive = false,
  onResetSetting,
  onUpdateVolume,
  onToggleMute,
  bulkVolumeEnabled = false,
  onUpdatePlaybackSpeed,
  onUpdateShowSpeedBadge,
  onUpdateSpeedBadgeLabelStyle,
  onUpdateSpeedBadgePosition,
  onApplySpeedBadgePreset,
  onUpdateSpeedRampIn,
  onUpdateSpeedRampDuration,
  previousVideoSpeed = null,
  isInSplitComparePair = false,
  isSplitCompareFadeShared = false,
  nextClipSpeedRamp = null,
  onUpdateNextSpeedRampIn,
  onUpdateNextSpeedRampDuration,
  onToggleFadeIn,
  onToggleFadeOut,
  onUpdateFadeInDuration,
  onUpdateFadeOutDuration,
  isOpen = true,
  isFocused = false,
  onToggleOpen,
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  /** 動画の音量・再生速度（既定は閉じる。再生速度が無い画面は音量だけ） */
  const [isVolumeSpeedOpen, setIsVolumeSpeedOpen] = useState(false);
  const [isColorOpen, setIsColorOpen] = useState(false);
  const noopColor = useCallback(() => {}, []);
  const canvasWidth = useCanvasStore((s) => s.width);
  const canvasHeight = useCanvasStore((s) => s.height);
  const isDisabled = isClipsLocked || v.isLocked;
  const playbackSpeed = normalizeVideoPlaybackSpeed(v.playbackSpeed);
  const speedBadgeLabelStyle = normalizeSpeedBadgeLabelStyle(v.speedBadgeLabelStyle);
  const sourceClipDuration = v.type === 'video' ? getVideoSourceClipDuration(v) : 0;
  const speedRamp = v.type === 'video' ? resolveVideoSpeedRampForItem(v) : null;
  const speedRampDuration = normalizeSpeedRampDuration(v.speedRampDuration);
  const showSpeedRampControls = v.type === 'video'
    && !!onUpdateSpeedRampIn
    && (previousVideoSpeed != null || Boolean(v.speedRampIn));
  const speedRampNote = (() => {
    if (previousVideoSpeed == null) return '前が動画のときに使えます（先頭や画像の次では変わりません）。';
    if (isInSplitComparePair) return '2画面表示のペアでは使えません。';
    const fromLabel = formatPlaybackSpeedValue(previousVideoSpeed);
    const toLabel = formatPlaybackSpeedValue(playbackSpeed);
    if (Math.abs(previousVideoSpeed - playbackSpeed) < SPEED_RAMP_MIN_SPEED_DIFF) {
      return `前の動画も ${fromLabel}倍のため、変化しません。`;
    }
    if (v.speedRampIn) {
      // 短いクリップでは段がクリップ全体に縮むので、実際にかかる秒数を出す
      const rampSec = Number((speedRamp?.timelineDuration ?? speedRampDuration).toFixed(1));
      return `${fromLabel}倍 → ${toLabel}倍 を、先頭 ${rampSec}秒でなだらかに変えます。前の動画はそのままです。`;
    }
    return `前の動画（${fromLabel}倍）とのつなぎ目で速さが急に変わるのを、この動画の先頭でなだらかにします。`;
  })();
  const showNextSpeedRampControls = v.type === 'video'
    && !!nextClipSpeedRamp
    && !!onUpdateNextSpeedRampIn;
  const nextSpeedRampNote = (() => {
    if (!nextClipSpeedRamp) return '';
    if (nextClipSpeedRamp.isSplitComparePair) return '2画面表示のペアでは使えません。';
    const fromLabel = formatPlaybackSpeedValue(playbackSpeed);
    const toLabel = formatPlaybackSpeedValue(nextClipSpeedRamp.speed);
    if (Math.abs(nextClipSpeedRamp.speed - playbackSpeed) < SPEED_RAMP_MIN_SPEED_DIFF) {
      return `次の動画も ${toLabel}倍のため、変化しません。`;
    }
    if (nextClipSpeedRamp.enabled) {
      const rampSec = Number((nextClipSpeedRamp.actualSec ?? nextClipSpeedRamp.duration).toFixed(1));
      return `次の動画の先頭 ${rampSec}秒で ${fromLabel}倍 → ${toLabel}倍 へなだらかに変えます。この動画はそのままです（次の動画のカードと同じ設定です）。`;
    }
    return `次の動画（${toLabel}倍）とのつなぎ目で速さが急に変わるのを、次の動画の先頭でなだらかにします。`;
  })();
  const continuationTrim = useMemo(
    () => (v.type === 'video' && onAddContinuation
      ? computeVideoContinuationTrim({
        type: v.type,
        trimEnd: v.trimEnd,
        originalDuration: v.originalDuration,
      })
      : null),
    [onAddContinuation, v.originalDuration, v.trimEnd, v.type],
  );

  // スワイプ保護用コールバック
  const trimSliderMax = resolveTimeSliderMax(v.originalDuration, v.originalDuration);
  const handleTrimStart = useCallback((val: number) => onUpdateVideoTrim('start', String(val)), [onUpdateVideoTrim]);
  const resolveTrimStartStep = useCallback(
    (from: number, direction: 1 | -1) => stepStartTime(from, direction),
    [],
  );
  const handleTrimEnd = useCallback((val: number) => {
    const next = resolveEndTimeInput(val, {
      startTime: v.trimStart,
      limitSec: v.originalDuration,
    });
    if (next != null) onUpdateVideoTrim('end', String(next));
  }, [onUpdateVideoTrim, v.trimStart, v.originalDuration]);
  const resolveTrimEndStep = useCallback(
    (from: number, direction: 1 | -1) => (
      stepEndTime(from, direction, {
        startTime: v.trimStart,
        limitSec: v.originalDuration,
      }) ?? from
    ),
    [v.trimStart, v.originalDuration],
  );
  const canSplit = !isDisabled && resolveVideoSplitSourceTime(v, currentTime - timelineRange.start) != null;
  // プレビュー現在位置のこのクリップ内の時刻（「動かさない」ときのミニプレビュー用）
  const clipLocalTime = Math.min(
    Math.max(0, currentTime - timelineRange.start),
    Math.max(0, v.duration),
  );
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
      speedRamp,
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
      speedRamp,
    });
  const imageDurationFromPreview = v.type === 'image'
    ? resolveImageDurationFromPreviewPosition({
        timelineStart: timelineRange.start,
        previewTime: currentTime,
      })
    : null;
  const isImageEndAlreadyAtPreview = imageDurationFromPreview != null
    && Math.abs(imageDurationFromPreview - v.duration) < IMAGE_DURATION_STEP / 2;
  const imageEndFromPreviewAction = imageDurationFromPreview == null || isImageEndAlreadyAtPreview
    ? null
    : imageDurationFromPreview > v.duration
      ? 'extend'
      : 'shorten';
  const canSetImageEndFromPreview = !isDisabled
    && imageEndFromPreviewAction != null;
  const imageEndFromPreviewButtonLabel = imageEndFromPreviewAction === 'extend'
    ? 'ここまで延長'
    : imageEndFromPreviewAction === 'shorten'
      ? 'ここまで短縮'
      : '終了位置を反映';
  const imageEndFromPreviewAriaLabel = imageEndFromPreviewAction === 'extend'
    ? 'プレビュー現在位置まで画像の表示時間を延長'
    : imageEndFromPreviewAction === 'shorten'
      ? 'プレビュー現在位置まで画像の表示時間を短縮'
      : 'プレビュー現在位置を画像の終了位置に反映';
  const imageEndFromPreviewTitle = (() => {
    if (isDisabled) return '画像または動画・画像セクションのロックを解除してください';
    if (currentTime < timelineRange.start + MIN_IMAGE_DURATION) {
      return '画像の開始位置から0.5秒以上あとへプレビューを移動してください';
    }
    if (currentTime > timelineRange.start + MAX_IMAGE_DURATION) {
      return `画像の開始位置から${MAX_IMAGE_DURATION}秒以内へプレビューを移動してください`;
    }
    if (imageDurationFromPreview == null) return 'プレビュー現在位置を画像の終了位置に設定できません';
    if (isImageEndAlreadyAtPreview) return '画像の終了位置はすでにプレビュー現在位置です';
    const action = imageEndFromPreviewAction === 'extend' ? '延長' : '短縮';
    return `現在位置(${formatTimelineTime(currentTime)})まで画像の表示時間を${action}`;
  })();

  // リスト用サムネはクリップの先頭フレーム。先頭が黒のときだけ直後を使う。
  // プロジェクト全体のポスター設定はプレビューセクション側（複数クリップ合成前提）。
  const thumbnailSourceTime = v.type === 'video' ? resolveMediaThumbnailSourceTime({
    ...v,
    thumbnailMode: 'auto',
  }) : undefined;
  const thumbnailRangeEnd = v.type === 'video'
    ? (v.trimEnd > v.trimStart ? v.trimEnd : (v.originalDuration > 0 ? v.originalDuration : undefined))
    : undefined;
  // 分割点などが 1/100 秒（例 13.38）のとき、見出しだけ 0.1 秒へ丸めると
  // トリミング欄の 13.38 と食い違って見えるため、0.1 秒で表せない値は 1/100 秒で出す。
  const rangeLabel = `${formatClipCompactClock(timelineRange.start)}–${formatClipCompactClock(timelineRange.end)}`;
  const durationLabel = formatClipDurationLabel(v.duration);
  const showSpeedMark = v.type === 'video' && Math.abs(playbackSpeed - 1) >= VIDEO_PLAYBACK_SPEED_STEP / 2;
  const showMuteMark = v.type === 'video' && v.isMuted;
  const bodyId = `clip-card-body-${v.id}`;
  const toggleLabel = isOpen ? `${v.file.name}のカードを閉じる` : `${v.file.name}のカードを開く`;

  return (
    <div
      data-testid={`clip-card-${v.id}`}
      data-focused={isFocused ? 'true' : 'false'}
      className={`bg-gray-800 rounded-xl border relative group ${isOpen ? 'p-3 lg:p-4' : 'px-3 pt-3 pb-2 lg:px-4 lg:pt-4 lg:pb-3'} ${
        isFocused ? 'border-blue-400/90 ring-1 ring-blue-400/60' : 'border-gray-700/50'
      }`}
    >
      <div
        data-testid={`clip-card-header-${v.id}`}
        className={`grid grid-cols-[104px_minmax(0,1fr)] gap-x-2.5 gap-y-1 ${isOpen ? 'mb-3' : ''}`}
      >
        <div className="row-span-3 flex items-center">
          <div className="relative inline-flex">
            <ClipThumbnail
              file={v.file}
              type={v.type}
              scale={resolveMediaScaleFactor(v, 0)}
              positionX={v.positionX}
              positionY={v.positionY}
              rotation={v.rotation}
              sourceTime={thumbnailSourceTime}
              rangeStart={v.type === 'video' ? v.trimStart : undefined}
              rangeEnd={thumbnailRangeEnd}
              displaySize="card"
            />
            <span
              data-testid={`clip-card-index-${v.id}`}
              className="pointer-events-none absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-950/90 px-1 text-[10px] font-mono text-white ring-1 ring-gray-500/70"
            >
              {i + 1}
            </span>
          </div>
        </div>
        <div data-testid={`clip-card-actions-${v.id}`} className="col-start-2 flex min-w-0 items-center justify-between">
          <button
            type="button"
            data-testid={`clip-card-toggle-${v.id}`}
            onClick={onToggleOpen}
            aria-expanded={isOpen}
            aria-controls={isOpen ? bodyId : undefined}
            aria-label={toggleLabel}
            title={isOpen ? 'カードを閉じる' : 'カードを開く'}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 active:scale-95 ${
              isOpen
                ? 'border-blue-500/50 bg-blue-900/30 text-blue-300 hover:bg-blue-800/50 hover:text-blue-100'
                : 'border-gray-600/70 bg-gray-700/60 text-gray-300 hover:bg-gray-600 hover:text-white'
            }`}
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
          <div data-testid={`clip-card-secondary-actions-${v.id}`} className="ml-2 flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1">
            <button
              type="button"
              onClick={onToggleLock}
              aria-label={v.isLocked ? 'このクリップのロックを解除' : 'このクリップをロック'}
              title={v.isLocked ? 'ロック解除' : 'ロック'}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 active:scale-95 ${
                v.isLocked
                  ? 'border-red-500/60 bg-red-950/40 text-red-400 hover:bg-red-900/50'
                  : 'border-gray-600/70 bg-gray-700/60 text-gray-300 hover:bg-gray-600 hover:text-white'
              }`}
            >
              {v.isLocked ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : <Unlock className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={onMoveUp}
              disabled={i === 0 || isDisabled}
              aria-label="上へ移動"
              title="上へ移動"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-600/70 bg-gray-700/60 text-gray-300 hover:bg-gray-600 hover:text-white transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 active:scale-95 disabled:opacity-25 disabled:active:scale-100"
            >
              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={i === totalItems - 1 || isDisabled}
              aria-label="下へ移動"
              title="下へ移動"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-600/70 bg-gray-700/60 text-gray-300 hover:bg-gray-600 hover:text-white transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 active:scale-95 disabled:opacity-25 disabled:active:scale-100"
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {onDuplicate && (
              <button
                type="button"
                onClick={onDuplicate}
                disabled={isDisabled}
                aria-label="このクリップをコピー"
                title="このクリップをコピー（直後に複製を挿入）"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-blue-800/50 bg-blue-900/30 text-blue-300 hover:bg-blue-900/50 hover:text-blue-100 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 active:scale-95 disabled:opacity-25 disabled:active:scale-100"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={onRemove}
              disabled={isDisabled}
              aria-label="このクリップを削除"
              title="削除"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-red-800/50 bg-red-900/30 text-red-400 hover:bg-red-900/50 hover:text-red-300 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/80 active:scale-95 disabled:opacity-25 disabled:active:scale-100"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="col-start-2 flex min-w-0 items-center gap-1.5">
          {v.type === 'image' ? <ImageIcon className="h-3.5 w-3.5 shrink-0 text-yellow-500" aria-hidden="true" /> : <MonitorPlay className="h-3.5 w-3.5 shrink-0 text-blue-500" aria-hidden="true" />}
          <ClipFileNameButton name={v.file.name} isOpen={isOpen} onActivate={onToggleOpen} />
        </div>
        <button
          type="button"
          data-testid={`clip-card-summary-${v.id}`}
          onClick={onToggleOpen}
          aria-label={`${rangeLabel}、${durationLabel}。カードを${isOpen ? '閉じる' : '開く'}`}
          className="col-start-2 flex min-h-5 min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md px-1 py-0.5 text-left text-[10px] leading-tight text-gray-300 hover:bg-gray-700/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 md:text-xs"
        >
          <span className="font-mono text-gray-200">{rangeLabel}</span>
          <span className="text-gray-400">{durationLabel}</span>
          {showSpeedMark && <span className="rounded bg-amber-500/15 px-1 text-amber-200">{formatPlaybackSpeedValue(playbackSpeed)}倍</span>}
          {showMuteMark && <span className="rounded bg-red-500/15 px-1 text-red-300">ミュート</span>}
        </button>
      </div>

      {isOpen && (
      <div id={bodyId} data-testid={bodyId}>
      {/* 動画トリミングUI */}
      {v.type === 'video' && (
        <div className="bg-black/30 p-2 lg:p-3 rounded mb-2 border border-gray-700/50 space-y-2">
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
          {onSplit && (
            <button
              type="button"
              onClick={onSplit}
              disabled={!canSplit}
              title={canSplit ? 'サイズ・位置の動きを保って前半・後半へ分割' : 'この動画の開始・終了から0.1秒以上離れた位置へ移動してください'}
              className="min-h-11 w-full rounded-lg border border-blue-700 bg-blue-900/30 px-2.5 text-xs text-blue-200 hover:bg-blue-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40"
            >
              現在位置で分割
            </button>
          )}
          <NumericSliderField
            label="開始"
            ariaLabel="トリミング開始位置"
            min={0}
            max={trimSliderMax}
            step={TIME_STEPPER_STEP_SEC}
            // 表示は終了と同じ 1/100 秒（分割した 13.38 を 13.4 と出さない）。−/+ は 0.1 秒格子へ吸着
            decimals={2}
            resolveStep={resolveTrimStartStep}
            value={v.trimStart}
            onChange={handleTrimStart}
            formatDisplayValue={formatTimeStepperInput}
            disabled={isDisabled}
            unit="秒"
            sliderClassName="flex-1 min-w-0 accent-green-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            inputClassName="w-14 focus:border-green-500"
          />
          {/* 終了位置 */}
          <NumericSliderField
            label="終了"
            ariaLabel="トリミング終了位置"
            min={0}
            max={trimSliderMax}
            step={TIME_SLIDER_STEP_SEC}
            stepperStep={TIME_STEPPER_STEP_SEC}
            value={v.trimEnd}
            onChange={handleTrimEnd}
            formatDisplayValue={formatTimeStepperInput}
            resolveStep={resolveTrimEndStep}
            disabled={isDisabled}
            unit="秒"
            sliderClassName="flex-1 min-w-0 accent-red-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
            inputClassName="w-14 focus:border-red-500"
          />
          {continuationTrim && (
            <button
              type="button"
              onClick={onAddContinuation}
              disabled={isDisabled}
              data-testid={`clip-add-continuation-${v.id}`}
              className="min-h-9 w-full min-w-0 px-2.5 py-1.5 rounded-lg bg-blue-900/30 hover:bg-blue-900/50 text-blue-200 border border-blue-800/50 disabled:opacity-30 flex items-center justify-center gap-x-1.5 gap-y-0.5 flex-wrap text-[10px] md:text-xs leading-tight text-center transition"
              title={`続きを追加コピー: このクリップの終了 ${continuationTrim.trimStart.toFixed(2)}s から素材終端 ${continuationTrim.trimEnd.toFixed(2)}s までを直後に追加`}
              aria-label={`続きを追加コピー（${continuationTrim.trimStart.toFixed(2)}秒から${continuationTrim.trimEnd.toFixed(2)}秒）`}
            >
              <Split className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">
                続きを追加コピー（{continuationTrim.trimStart.toFixed(2)}s 〜 {continuationTrim.trimEnd.toFixed(2)}s）
              </span>
            </button>
          )}
        </div>
      )}

      {/* 画像表示時間UI (新設: ヘッダー下) */}
      {v.type === 'image' && (
        <div className="bg-black/30 p-2 rounded mb-2 border border-gray-700/50 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px]">
            <Clock className="w-3 h-3 text-gray-400 shrink-0" />
            <NumericSliderField
              label="表示時間"
              labelClassName="text-gray-400 w-14 shrink-0"
              ariaLabel="画像の表示時間"
              min={MIN_IMAGE_DURATION}
              max={MAX_IMAGE_DURATION}
              step={IMAGE_DURATION_SLIDER_STEP}
              stepperStep={IMAGE_DURATION_STEP}
              decimals={1}
              value={v.duration}
              onChange={handleImageDuration}
              formatDisplayValue={formatTimeStepperInput}
              disabled={isDisabled}
              unit="秒"
              className="flex-1 min-w-0"
              sliderClassName="flex-1 min-w-0 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
              inputClassName="w-14 focus:border-yellow-500"
            />
          </div>
          {onSetImageEndFromCurrent && (
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] md:text-xs">
              <span className="text-gray-500 mr-0.5">プレビュー位置を反映:</span>
              <button
                type="button"
                onClick={onSetImageEndFromCurrent}
                disabled={!canSetImageEndFromPreview}
                aria-label={imageEndFromPreviewAriaLabel}
                className="min-h-9 min-w-28 px-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 hover:border-yellow-500/60 hover:text-yellow-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-1 transition-colors motion-reduce:transition-none"
                title={imageEndFromPreviewTitle}
              >
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                {imageEndFromPreviewButtonLabel}
              </button>
            </div>
          )}
        </div>
      )}

      {/* サイズ・位置・動き（アコーディオン）。サイズ・横・縦の 1 組のスライダーで、
          動かさないなら全体、動かすなら選んだ時点（開始／終了）の構図を編集する（ClipCompositionPanel） */}
      <div className="mb-2 rounded-lg border border-gray-700/70 bg-gray-900/30">
        <SettingsAccordionHeader
          title="サイズ・位置・動き"
          isOpen={v.isTransformOpen}
          disabled={isDisabled}
          controlsId={`clip-transform-settings-${v.id}`}
          onToggle={onToggleTransformPanel}
        />
        {v.isTransformOpen && (
        <div
          id={`clip-transform-settings-${v.id}`}
          className="px-2 pb-2 border-t border-gray-700/60 pt-2"
        >
          <ClipCompositionPanel
            item={v}
            isDisabled={isDisabled}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            mediaElement={mediaElement}
            currentLocalTime={clipLocalTime}
            previewEndpoint={zoomPreviewEndpoint}
            onUpdateScale={onUpdateScale}
            onUpdatePosition={onUpdatePosition}
            onUpdateMotionPoint={onUpdateMotionPoint}
            onSetMotionEnd={onSetMotionEnd}
            onPreviewEndpoint={onPreviewZoomEndpoint}
            onPreviewScale={onPreviewScale}
            onInheritComposition={onInheritComposition}
            previousComposition={previousComposition}
            onResetSetting={onResetSetting}
            onRotate={onRotate}
          />
        </div>
        )}
      </div>

      {/* フェード・ぼかし（アコーディオン）: 見た目の効果 */}
      <div className="mb-2 rounded-lg border border-gray-700/70 bg-gray-900/30">
        <SettingsAccordionHeader
          title={onUpdateBlur ? 'フェード・ぼかし' : 'フェード'}
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
          {/* フェード設定 (共通) */}
          <div className="flex flex-col gap-2 text-xs md:text-sm">
            <h3 className="font-medium text-gray-300">フェード</h3>
            {isSplitCompareFadeShared ? (
              // 2 画面表示中: フェードはペアの設定で 2 画面まとめて掛かる（カードのフェードは使わない）。
              // 編集する場所を 1 つにするため、カードのフェードは出さない。
              <p
                data-testid={`clip-split-compare-fade-note-${v.id}`}
                className="text-[10px] leading-snug text-cyan-200/80 md:text-xs"
              >
                2画面表示中は2画面の設定でフェードを変えます
              </p>
            ) : (
            <>
            {/* フェードイン */}
            <div className="flex items-center gap-2">
              <label
                className={`flex w-28 shrink-0 items-center justify-start gap-1.5 ${isDisabled ? 'opacity-50' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={v.fadeIn}
                  onChange={(e) => onToggleFadeIn(e.target.checked)}
                  disabled={isDisabled}
                  className="h-3.5 w-3.5 cursor-pointer rounded accent-blue-500 disabled:cursor-default disabled:opacity-50"
                />
                <span className="whitespace-nowrap">フェードイン</span>
              </label>
              <PresetFadeDurationField
                value={v.fadeInDuration}
                onChange={onUpdateFadeInDuration}
                disabled={isDisabled || !v.fadeIn}
                ariaLabel="動画のフェードイン時間"
                accentClassName="accent-blue-500"
              />
            </div>

            {/* フェードアウト */}
            <div className="flex items-center gap-2">
              <label
                className={`flex w-28 shrink-0 items-center justify-start gap-1.5 ${isDisabled ? 'opacity-50' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={v.fadeOut}
                  onChange={(e) => onToggleFadeOut(e.target.checked)}
                  disabled={isDisabled}
                  className="h-3.5 w-3.5 cursor-pointer rounded accent-blue-500 disabled:cursor-default disabled:opacity-50"
                />
                <span className="whitespace-nowrap">フェードアウト</span>
              </label>
              <PresetFadeDurationField
                value={v.fadeOutDuration}
                onChange={onUpdateFadeOutDuration}
                disabled={isDisabled || !v.fadeOut}
                ariaLabel="動画のフェードアウト時間"
                accentClassName="accent-blue-500"
              />
            </div>
            </>
            )}
          </div>

          {/* ぼかし（カード単位・1080p基準） */}
          {onUpdateBlur && (
            <div className="flex flex-col gap-1 border-t border-gray-700/50 pt-2">
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
              unit="px"
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

      {/* 音量・再生速度（動画のみ。再生速度が無い画面は音量だけ） */}
      {v.type === 'video' && (
        <div className="mb-2 rounded-lg border border-gray-700/70 bg-gray-900/30">
          <SettingsAccordionHeader
            title={onUpdatePlaybackSpeed ? '音量・再生速度' : '音量'}
            isOpen={isVolumeSpeedOpen}
            disabled={isDisabled}
            controlsId={`clip-volume-speed-${v.id}`}
            onToggle={() => setIsVolumeSpeedOpen(!isVolumeSpeedOpen)}
          />
          {isVolumeSpeedOpen && (
            <div
              id={`clip-volume-speed-${v.id}`}
              className="px-2 pb-2 space-y-3 border-t border-gray-700/60 pt-2"
            >
            <div className="space-y-1.5">
            {/* 音量: 見出し（音量 … リセット）→ [ミュート][数値欄][スライダー][−/+]（ミュートは従来どおり数値欄の左） */}
            <div className="flex flex-col gap-0.5">
              <CompactFieldHeader
                title="音量"
                onReset={() => onUpdateVolume(1)}
                resetDisabled={isDisabled || bulkVolumeEnabled}
                resetLabel="音量をリセット"
                resetTitle="100%へ戻す"
              />
              <div className="flex items-center gap-1.5">
                <CompactMuteToggle muted={v.isMuted} disabled={isDisabled} onToggle={onToggleMute} />
                <NumericSliderField
                  ariaLabel="音量"
                  min={0}
                  max={MEDIA_VOLUME_MAX * 100}
                  step={5}
                  value={Math.round(v.volume * 100)}
                  disabled={v.isMuted || isDisabled || bulkVolumeEnabled}
                  onChange={(value) => handleVolume(value / 100)}
                  unit="%"
                  inputWidthChars={AUDIO_SPEED_INPUT_WIDTH_CHARS}
                  className="flex-1 min-w-0"
                  sliderClassName={`flex-1 min-w-0 accent-blue-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${v.isMuted || isDisabled || bulkVolumeEnabled ? '' : 'cursor-pointer'}`}
                />
              </div>
            </div>
            {bulkVolumeEnabled && (
              <p className="px-1 text-[10px] leading-relaxed text-blue-300/80 md:text-xs">一括音量設定中のため、ここでは変更できません。</p>
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
            {onUpdatePlaybackSpeed && (
            <div className="space-y-2 border-t border-gray-700/50 pt-2">
              <div className="flex flex-col gap-0.5">
              <CompactFieldHeader
                icon={<Gauge className="w-3 h-3" aria-hidden="true" />}
                title="再生速度"
                info={(
                  <span className="font-mono text-gray-300">
                    元 {sourceClipDuration.toFixed(1)}s → 表示 {v.duration.toFixed(1)}s
                  </span>
                )}
                onReset={() => onUpdatePlaybackSpeed(1)}
                resetDisabled={isDisabled || Math.abs(playbackSpeed - 1) < VIDEO_PLAYBACK_SPEED_STEP / 2}
                resetLabel="再生速度をリセット"
                resetTitle="等倍へ戻す"
              />
              {/* 見出し（アイコン＋再生速度）の下に、数値欄から始まる行（サイズ・ぼかし等と同じ形） */}
              <NumericSliderField
                ariaLabel="再生速度"
                min={MIN_VIDEO_PLAYBACK_SPEED}
                max={MAX_VIDEO_PLAYBACK_SPEED}
                step={VIDEO_PLAYBACK_SPEED_STEP}
                value={playbackSpeed}
                onChange={onUpdatePlaybackSpeed}
                disabled={isDisabled}
                unit="倍"
                decimals={2}
                fixedDecimals
                inputWidthChars={5}
                sliderClassName="flex-1 min-w-0 accent-amber-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
                inputClassName="focus:border-amber-500"
              />
              </div>
              <div className="flex flex-wrap gap-1">
                {VIDEO_PLAYBACK_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => onUpdatePlaybackSpeed(speed)}
                    className={`min-h-7 px-2 rounded-lg border text-[10px] font-medium transition disabled:opacity-40 ${
                      Math.abs(playbackSpeed - speed) < VIDEO_PLAYBACK_SPEED_STEP / 2
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                    }`}
                    title={speed === 1 ? '等倍再生' : `${formatPlaybackSpeedValue(speed)}倍速で再生・書き出し`}
                  >
                    {speed === 1 ? '等倍' : `${formatPlaybackSpeedValue(speed)}倍`}
                  </button>
                ))}
              </div>
              {showSpeedRampControls && (
                <SpeedRampControl
                  testIdPrefix="clip-speed-ramp"
                  itemId={v.id}
                  label="前の動画から速度をなめらかにつなぐ"
                  durationAriaLabel="速度をなめらかにつなぐ時間"
                  checked={Boolean(v.speedRampIn)}
                  disabled={isDisabled}
                  duration={speedRampDuration}
                  note={speedRampNote}
                  onToggle={(enabled) => onUpdateSpeedRampIn?.(enabled)}
                  onUpdateDuration={onUpdateSpeedRampDuration}
                />
              )}
              {showNextSpeedRampControls && nextClipSpeedRamp && (
                <SpeedRampControl
                  testIdPrefix="clip-next-speed-ramp"
                  itemId={v.id}
                  label="次の動画へ速度をなめらかにつなぐ"
                  durationAriaLabel="次の動画へ速度をなめらかにつなぐ時間"
                  checked={nextClipSpeedRamp.enabled}
                  // 設定の実体は次のカード。どちらかがロック中なら変えない
                  disabled={isDisabled || nextClipSpeedRamp.isLocked}
                  duration={nextClipSpeedRamp.duration}
                  note={nextSpeedRampNote}
                  onToggle={(enabled) => onUpdateNextSpeedRampIn?.(enabled)}
                  onUpdateDuration={onUpdateNextSpeedRampDuration}
                />
              )}
              {onUpdateShowSpeedBadge && (
                <div className="space-y-2">
                  <label
                    className={`flex items-center gap-1.5 text-[10px] text-gray-300 md:text-xs ${isDisabled ? 'opacity-50' : 'cursor-pointer'}`}
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
                  {Math.abs(playbackSpeed - 1) < VIDEO_PLAYBACK_SPEED_STEP / 2 && (
                    <p className="text-[10px] leading-snug text-gray-400 md:text-xs">
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
                          <div className="flex flex-col gap-0.5">
                          <CompactFieldHeader title="表示位置（左上が0%）" />
                          <NumericSliderField
                            label="横"
                            labelClassName={COMPACT_AXIS_LABEL_CLASS}
                            ariaLabel="速度バッジの横位置"
                            min={0}
                            max={100}
                            step={1}
                            value={v.speedBadgePositionX ?? DEFAULT_SPEED_BADGE_POSITION.x}
                            onChange={(val) => onUpdateSpeedBadgePosition('x', val)}
                            disabled={isDisabled}
                            unit="%"
                            inputWidthChars={AUDIO_SPEED_INPUT_WIDTH_CHARS}
                            sliderClassName="flex-1 min-w-0 accent-amber-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
                            inputClassName="focus:border-amber-500"
                          />
                          <NumericSliderField
                            label="縦"
                            className={COMPACT_AXIS_SECOND_ROW_CLASS}
                            labelClassName={COMPACT_AXIS_LABEL_CLASS}
                            ariaLabel="速度バッジの縦位置"
                            min={0}
                            max={100}
                            step={1}
                            value={v.speedBadgePositionY ?? DEFAULT_SPEED_BADGE_POSITION.y}
                            onChange={(val) => onUpdateSpeedBadgePosition('y', val)}
                            disabled={isDisabled}
                            unit="%"
                            inputWidthChars={AUDIO_SPEED_INPUT_WIDTH_CHARS}
                            sliderClassName="flex-1 min-w-0 accent-amber-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
                            inputClassName="focus:border-amber-500"
                          />
                          </div>
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
      )}

      {/* 色合い（アコーディオン・standard 限定）: 隣の素材に合わせる自動補正と手動の色調整。使う頻度が低いので一番下 */}
      {onUpdateColorAdjust && (
        <div className="mb-2 rounded-lg border border-gray-700/70 bg-gray-900/30">
          <SettingsAccordionHeader
            title={hasMediaColorSettings(v) ? '色合い（調整中）' : '色合い'}
            isOpen={isColorOpen}
            disabled={isDisabled}
            controlsId={`clip-color-settings-${v.id}`}
            onToggle={() => setIsColorOpen(!isColorOpen)}
          />
          {isColorOpen && (
            <div
              id={`clip-color-settings-${v.id}`}
              className="px-2 pb-2 border-t border-gray-700/60 pt-2"
            >
              <ClipColorPanel
                item={v}
                isDisabled={isDisabled}
                onUpdateAdjust={onUpdateColorAdjust}
                onMatchPrevious={onMatchColorToPrevious}
                onMatchNext={onMatchColorToNext}
                onRestore={onRestoreColor}
                onUpdateMatchStrength={onUpdateColorMatchStrength ?? noopColor}
                onClearMatch={onClearColorMatch ?? noopColor}
                onReset={onResetColor ?? noopColor}
                isGlobalColorActive={isGlobalColorActive}
              />
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
