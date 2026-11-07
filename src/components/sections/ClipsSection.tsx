/**
 * @file ClipsSection.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 動画・画像クリップの管理を行うセクション。アップロード、並び替え、各クリップの基本操作（削除、複製）を提供するリストビュー。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Lock,
  Unlock,
  CircleHelp,
  ArrowDownUp,
  RectangleHorizontal,
  RectangleVertical,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  Columns2,
} from 'lucide-react';
import type { ClipTransition, MediaItem, MediaZoomDirection, SplitCompareSettings } from '../../types';
import ClipItem from '../media/ClipItem';
import SettingsAccordionHeader from '../common/SettingsAccordionHeader';
import { usePlatformCapabilities } from '../../app/PlatformCapabilitiesContext';
import { getAppFlavorUiCapabilities } from '../../app/appFlavorUi';
import { useMediaStore } from '../../stores/mediaStore';
import { useCanvasStore } from '../../stores/canvasStore';
import { useUIStore } from '../../stores/uiStore';
import type { AspectRatio } from '../../stores/canvasStore';
import { resolveMediaScaleFactor, type MediaTransformResetKind, type MediaZoomEndpointPreview } from '../../utils/mediaZoom';
import {
  CLIP_TRANSITION_DEFAULT_DURATION,
  CLIP_TRANSITION_DURATION_OPTIONS,
  CLIP_TRANSITION_TYPE_OPTIONS,
  getClipTransitionLabel,
} from '../../utils/clipTransitions';
import {
  createDefaultSplitCompareSettings,
  describeSplitCompareSettings,
  getSplitComparePairForIndex,
  isSplitCompareDiagonalOffsetWanted,
  resolveSplitCompareAutoOffsetPatch,
  resolveSplitCompareMatchDuration,
  resolveSplitCompareDisplayLayout,
  resolveSplitCompareRoles,
  SPLIT_COMPARE_DIVIDER_OPTIONS,
  SPLIT_COMPARE_FIT_OPTIONS,
  SPLIT_COMPARE_LAYOUT_OPTIONS,
  SPLIT_COMPARE_LINE_COLOR_OPTIONS,
} from '../../utils/splitCompare';
import {
  collapseAllClipCards,
  createInitialClipCardDisclosure,
  expandAllClipCards,
  isClipCardBodyOpen,
  resolveFocusedClipId,
  stepClipCardDisclosure,
  toggleClipCard,
  type ClipCardDisclosureState,
} from '../../utils/clipCardDisclosure';

const SPLIT_COMPARE_MATCH_DURATION_OPTIONS: { value: 'keep' | 'match'; label: string }[] = [
  { value: 'keep', label: 'そろえない' },
  { value: 'match', label: '短い方に合わせる' },
];

/** 並べて比較の設定ボタン 1 行（ラベル + 選択肢） */
function SplitCompareOptionRow<T extends string>({
  label,
  options,
  value,
  disabled,
  onSelect,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  disabled: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <span className="text-gray-500 shrink-0 w-12">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          disabled={disabled}
          aria-pressed={value === opt.value}
          className={`flex-1 py-1 rounded transition ${value === opt.value
            ? 'bg-cyan-400 text-gray-900 font-semibold'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            } disabled:opacity-40`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * カードとカードの間のトランジションコネクタ（standard フレーバー限定）。
 * タップで種類（なし/ディゾルブ/フェード黒/フェード白）と時間（0.5/1/2秒）を設定する。
 * ディゾルブは重なり分だけタイムラインを短縮し、フェードは長さを変えない。
 * 「並べて比較」に切り替えると、上下 2 枚のカードを同時に再生して画面を分割して並べる。
 */
const ClipTransitionConnector: React.FC<{
  transition: ClipTransition | null;
  /** この境界の並べて比較の設定（null = 比較しない） */
  splitCompare: SplitCompareSettings | null;
  /** 比較にできない理由（前後が別の比較ペア）。null なら設定できる */
  splitCompareBlockedReason: string | null;
  /** 前後どちらかが比較ペアに入っている（この境界のディゾルブはカット扱い） */
  isAdjacentToSplitCompare: boolean;
  /** 動画の向き。比較を ON にしたときの初期の並べ方（横=左右 / 縦=上下）に使う */
  aspectRatio: AspectRatio;
  /** 比較ペアの長さ（上のカード, 下のカード）。比較中だけ渡す */
  pairDurations: [number, number] | null;
  /** 長さそろえがオンのまま長さがずれたとき、そろえ直す */
  onRealignSplitCompareDuration: () => void;
  disabled: boolean;
  /** 「すべて閉じる」のたびに増える。開いている設定パネルを畳む */
  closeSignal: number;
  onBeforeEdit: () => void;
  onChange: (transition: ClipTransition | null) => void;
  onChangeSplitCompare: (settings: SplitCompareSettings | null) => void;
}> = ({
  transition,
  splitCompare,
  splitCompareBlockedReason,
  isAdjacentToSplitCompare,
  aspectRatio,
  pairDurations,
  onRealignSplitCompareDuration,
  disabled,
  closeSignal,
  onBeforeEdit,
  onChange,
  onChangeSplitCompare,
}) => {
  const [open, setOpen] = useState(false);
  const [appliedCloseSignal, setAppliedCloseSignal] = useState(closeSignal);
  if (appliedCloseSignal !== closeSignal) {
    setAppliedCloseSignal(closeSignal);
    if (open) setOpen(false);
  }
  const isCompare = !!splitCompare;
  const isCompareBlocked = !isCompare && splitCompareBlockedReason !== null;
  // 切り替えで消える側の設定を覚えておき、戻したときに復元する（誤タップで設定を失わない）
  const rememberedTransitionRef = useRef<ClipTransition | null>(null);
  const rememberedSplitCompareRef = useRef<SplitCompareSettings | null>(null);
  const updateSplitCompare = (patch: Partial<SplitCompareSettings>) => {
    if (!splitCompare) return;
    onBeforeEdit();
    onChangeSplitCompare({ ...splitCompare, ...patch });
  };
  /** 順番に再生（トランジション）へ切り替える。比較中なら解除して以前のトランジションを戻す */
  const switchToSequential = () => {
    if (!isCompare) return;
    onBeforeEdit();
    rememberedSplitCompareRef.current = splitCompare;
    onChangeSplitCompare(null);
    if (rememberedTransitionRef.current) {
      onChange(rememberedTransitionRef.current);
    }
  };
  /** 並べて比較へ切り替える。以前の比較設定があれば戻す */
  const switchToCompare = () => {
    if (isCompare || isCompareBlocked) return;
    onBeforeEdit();
    rememberedTransitionRef.current = transition;
    onChangeSplitCompare(rememberedSplitCompareRef.current ?? createDefaultSplitCompareSettings(aspectRatio));
  };

  // 2 色の楕円ボタン（左: トランジション=紫 / 右: 並べて比較=水色、間はななめに区切る）。
  // 押した側のモードに切り替えて設定を開く。選択中の側をもう一度押すと開閉する。
  const SEGMENT_SLANT_PX = 7;
  const transitionLabel = transition && !isCompare
    ? `${getClipTransitionLabel(transition.type)} ${transition.duration}秒`
    : 'トランジション';
  const compareLabel = splitCompare
    ? `2画面表示 ${describeSplitCompareSettings(splitCompare, aspectRatio)}`
    : '2画面表示';

  return (
    <div className="flex flex-col items-center py-0.5">
      <div
        className={`flex items-stretch rounded-full border overflow-hidden bg-gray-900 text-[10px] ${isCompare
          ? 'border-cyan-500/50'
          : transition
            ? 'border-purple-500/50'
            : 'border-gray-700'
          } ${disabled ? 'opacity-40' : ''}`}
        role="group"
        aria-label="カード間のつなぎ方"
      >
        <button
          type="button"
          onClick={() => {
            if (isCompare) {
              switchToSequential();
              setOpen(true);
              return;
            }
            if (!open) onBeforeEdit();
            setOpen((prev) => !prev);
          }}
          disabled={disabled}
          className={`pl-2.5 py-0.5 flex items-center gap-1 transition ${!isCompare && transition
            ? 'bg-purple-900/60 text-purple-100 font-semibold'
            : !isCompare
              ? 'bg-purple-950/50 text-purple-300/80 hover:text-purple-100'
              : 'bg-purple-950/30 text-purple-300/50 hover:text-purple-200'
            }`}
          style={{
            paddingRight: `${SEGMENT_SLANT_PX + 6}px`,
            clipPath: `polygon(0 0, 100% 0, calc(100% - ${SEGMENT_SLANT_PX}px) 100%, 0 100%)`,
          }}
          title="このカード間のトランジション（切り替え効果）を設定"
          aria-label={transitionLabel}
          aria-expanded={open && !isCompare}
          aria-pressed={!isCompare}
        >
          <ArrowDownUp className="w-3 h-3" />
          {transitionLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!isCompare) {
              if (isCompareBlocked) {
                // 設定できない理由をパネルで見せる
                if (!open) onBeforeEdit();
                setOpen(true);
                return;
              }
              switchToCompare();
              setOpen(true);
              return;
            }
            if (!open) onBeforeEdit();
            setOpen((prev) => !prev);
          }}
          disabled={disabled}
          className={`pr-2.5 py-0.5 flex items-center gap-1 transition ${isCompare
            ? 'bg-cyan-800/70 text-cyan-50 font-semibold'
            : isCompareBlocked
              ? 'bg-cyan-950/20 text-cyan-300/30'
              : 'bg-cyan-950/50 text-cyan-300/80 hover:text-cyan-100'
            }`}
          style={{
            marginLeft: `-${SEGMENT_SLANT_PX - 2}px`,
            paddingLeft: `${SEGMENT_SLANT_PX + 6}px`,
            clipPath: `polygon(${SEGMENT_SLANT_PX}px 0, 100% 0, 100% 100%, 0 100%)`,
          }}
          title={isCompareBlocked
            ? splitCompareBlockedReason ?? undefined
            : '上下のカードを同時に再生し、画面を2つに分けて並べます'}
          aria-label={compareLabel}
          aria-expanded={open && isCompare}
          aria-pressed={isCompare}
        >
          <Columns2 className="w-3 h-3" />
          {compareLabel}
        </button>
      </div>
      {open && (
        <div className={`w-full mt-1.5 mb-0.5 p-2 bg-gray-800/80 border rounded-lg space-y-1.5 text-[10px] ${isCompare ? 'border-cyan-500/30' : 'border-purple-500/30'}`}>
          {!isCompare && splitCompareBlockedReason && (
            <div className="text-[10px] md:text-xs text-gray-400">2画面表示: {splitCompareBlockedReason}</div>
          )}
          {splitCompare ? (
            <>
              {/* 比較のオン/オフ。オフにすると順番に再生へ戻り（以前のトランジションも復元）、設定を閉じる */}
              <div className="flex items-center gap-1" role="group" aria-label="2画面表示のオン・オフ">
                <span className="text-cyan-300 shrink-0 w-12 font-semibold flex items-center gap-0.5">
                  <Columns2 className="w-3 h-3" />
                  2画面:
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed
                  className="flex-1 py-1 rounded bg-cyan-400 text-gray-900 font-semibold cursor-default"
                >
                  オン
                </button>
                <button
                  type="button"
                  onClick={() => {
                    switchToSequential();
                    setOpen(false);
                  }}
                  disabled={disabled}
                  aria-pressed={false}
                  title="2画面表示をやめて、順番に再生に戻します"
                  className="flex-1 py-1 rounded transition bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-40"
                >
                  オフ
                </button>
              </div>
              <SplitCompareOptionRow
                label="並べ方"
                options={SPLIT_COMPARE_LAYOUT_OPTIONS}
                value={resolveSplitCompareDisplayLayout(splitCompare.layout, aspectRatio)}
                disabled={disabled}
                onSelect={(layout) => updateSplitCompare({ layout })}
              />
              <SplitCompareOptionRow
                label="境界線"
                options={SPLIT_COMPARE_DIVIDER_OPTIONS}
                value={splitCompare.divider}
                disabled={disabled}
                onSelect={(divider) => updateSplitCompare({ divider })}
              />
              <SplitCompareOptionRow
                label="線の色"
                options={SPLIT_COMPARE_LINE_COLOR_OPTIONS}
                value={splitCompare.lineColor}
                disabled={disabled}
                onSelect={(lineColor) => updateSplitCompare({ lineColor })}
              />
              <SplitCompareOptionRow
                label="表示"
                options={SPLIT_COMPARE_FIT_OPTIONS}
                value={splitCompare.fit}
                disabled={disabled}
                onSelect={(fit) => updateSplitCompare({ fit })}
              />
              <SplitCompareOptionRow
                label="長さ"
                options={SPLIT_COMPARE_MATCH_DURATION_OPTIONS}
                value={splitCompare.matchDuration ? 'match' : 'keep'}
                disabled={disabled}
                onSelect={(choice) => {
                  if (choice === 'match' && splitCompare.matchDuration) {
                    // オンのまま押し直したら、ずれた長さをそろえ直す
                    onBeforeEdit();
                    onRealignSplitCompareDuration();
                    return;
                  }
                  updateSplitCompare({ matchDuration: choice === 'match' });
                }}
              />
              {/* 長さ（操作に使う情報なので、ほかの行と同じ読める大きさで出す） */}
              {pairDurations && (
                <div className="pl-[3.25rem] text-[10px] md:text-xs text-gray-400">
                  上 {pairDurations[0].toFixed(1)}秒 ・ 下 {pairDurations[1].toFixed(1)}秒
                  {splitCompare.matchDuration
                    && Math.abs(pairDurations[0] - pairDurations[1]) > 0.05
                    && <span className="block text-amber-300">長さがずれています。「短い方に合わせる」を押すとそろえ直します。</span>}
                </div>
              )}
            </>
          ) : (
          <>
          <div className="flex gap-1">
            <button
              onClick={() => {
                onBeforeEdit();
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
                onClick={() => {
                  onBeforeEdit();
                  onChange({
                    type: opt.value,
                    duration: transition?.duration ?? CLIP_TRANSITION_DEFAULT_DURATION,
                  });
                }}
                disabled={disabled || (opt.value === 'dissolve' && isAdjacentToSplitCompare && transition?.type !== 'dissolve')}
                title={opt.value === 'dissolve' && isAdjacentToSplitCompare
                  ? '2画面表示の前後では使えません（3本を同時に流すことになるため）'
                  : undefined}
                className={`flex-1 py-1 rounded transition flex items-center justify-center gap-0.5 ${transition?.type === opt.value
                  ? 'bg-purple-500 text-gray-900 font-semibold'
                  : opt.value === 'dissolve' && isAdjacentToSplitCompare
                    // 使えないことが一目で分かるよう、塗りを消して破線枠・薄い文字・鍵にする
                    ? 'bg-transparent border border-dashed border-gray-700 text-gray-600 cursor-not-allowed'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
              >
                {opt.value === 'dissolve' && isAdjacentToSplitCompare && transition?.type !== 'dissolve' && (
                  <Lock className="w-2.5 h-2.5" aria-hidden />
                )}
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 shrink-0 w-8">時間:</span>
            {CLIP_TRANSITION_DURATION_OPTIONS.map((duration) => (
              <button
                key={duration}
                onClick={() => {
                  if (!transition) return;
                  onBeforeEdit();
                  onChange({ ...transition, duration });
                }}
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
            {isAdjacentToSplitCompare
              ? '※ 2画面表示の前後では、ディゾルブは使えません（2本の並びと次の動画の計3本を同時に流すことになるため、カットでつながります）。フェードは使えます'
              : transition?.type === 'dissolve'
                ? '※ ディゾルブは前の動画が流れたまま次が重なって始まります（重なりぶん動画全体が短くなります）'
                : '※ フェードは動画全体の長さを変えません'}
          </div>
          </>
          )}
        </div>
      )}
    </div>
  );
};

interface ClipsSectionProps {
  /** 動画全体のタイトル。全体設定の先頭に置く */
  titleSettingsPanel?: React.ReactNode;
  /** カードとは独立しているが、操作上は動画・画像に属する先頭設定 */
  watermarkPanel?: React.ReactNode;
  audioSettingsPanel?: React.ReactNode;
  mediaItems: MediaItem[];
  mediaTimelineRanges: Record<string, { start: number; end: number }>;
  currentTime: number;
  /** 再生中は枠だけを追従し、カードの高さは変えない */
  isPlaying?: boolean;
  /** 書き出し中はカードを閉じ、プレビュー位置への追従も止める */
  isExporting?: boolean;
  isClipsLocked: boolean;
  mediaElements: Record<string, HTMLVideoElement | HTMLImageElement>;
  onToggleClipsLock: () => void;
  onMediaUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenMediaPicker: () => void;
  supportsShowOpenFilePicker: boolean;
  onAspectRatioChange: (aspectRatio: AspectRatio) => void;
  onMoveMedia: (index: number, direction: 'up' | 'down') => void;
  onRemoveMedia: (id: string) => void;
  onToggleMediaLock: (id: string) => void;
  onToggleTransformPanel: (id: string) => void;
  onUpdateVideoTrim: (id: string, type: 'start' | 'end', value: string) => void;
  onSetVideoTrimFromCurrent: (id: string, type: 'start' | 'end') => void;
  onUpdateImageDuration: (id: string, value: string) => void;
  onSetImageEndFromCurrent?: (id: string) => void;
  onUpdateMediaScale: (id: string, value: string | number) => void;
  onUpdateMediaZoomDirection: (id: string, direction: MediaZoomDirection) => void;
  onUpdateMediaZoomAmount: (id: string, amount: number) => void;
  onUpdateMediaZoomEndpoint?: (id: string, endpoint: 'start' | 'end', scale: number) => void;
  onPreviewMediaZoomEndpoint?: (id: string, endpoint: 'start' | 'end') => void;
  onPreviewMediaScale?: (id: string) => void;
  zoomEndpointPreview?: MediaZoomEndpointPreview | null;
  onInheritMediaZoom?: (id: string) => void;
  onSplitMedia?: (id: string) => void;
  onUpdateMediaPosition: (id: string, axis: 'x' | 'y', value: string) => void;
  onRotateMedia: (id: string) => void;
  onUpdateMediaBlur: (id: string, value: number) => void;
  onResetMediaSetting: (id: string, type: MediaTransformResetKind) => void;
  onUpdateMediaVolume: (id: string, value: number) => void;
  onToggleMediaMute: (id: string) => void;
  onBeforeTransitionEdit: () => void;
  onUpdateVideoPlaybackSpeed?: (id: string, speed: number) => void;
  bulkVolumeEnabled?: boolean;
  onUpdateVideoShowSpeedBadge?: (id: string, show: boolean) => void;
  onUpdateVideoSpeedBadgeLabelStyle?: (id: string, style: 'ja' | 'en') => void;
  onUpdateVideoSpeedBadgePosition?: (id: string, axis: 'x' | 'y', value: number) => void;
  onApplyVideoSpeedBadgePreset?: (
    id: string,
    preset: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  ) => void;
  onToggleMediaFadeIn: (id: string, checked: boolean) => void;
  onToggleMediaFadeOut: (id: string, checked: boolean) => void;
  onUpdateFadeInDuration: (id: string, duration: number) => void;
  onUpdateFadeOutDuration: (id: string, duration: number) => void;
  onOpenHelp: () => void;
  /** 初期表示でアコーディオンを開くかどうか（既定は開いた状態） */
  defaultOpen?: boolean;
}

/**
 * クリップセクションコンポーネント
 */
const ClipsSection: React.FC<ClipsSectionProps> = ({
  titleSettingsPanel,
  watermarkPanel,
  audioSettingsPanel,
  mediaItems,
  mediaTimelineRanges,
  currentTime,
  isPlaying = false,
  isExporting = false,
  isClipsLocked,
  mediaElements,
  onToggleClipsLock,
  onMediaUpload,
  onOpenMediaPicker,
  supportsShowOpenFilePicker,
  onAspectRatioChange,
  onMoveMedia,
  onRemoveMedia,
  onToggleMediaLock,
  onToggleTransformPanel,
  onUpdateVideoTrim,
  onSetVideoTrimFromCurrent,
  onUpdateImageDuration,
  onSetImageEndFromCurrent,
  onUpdateMediaScale,
  onUpdateMediaZoomDirection,
  onUpdateMediaZoomAmount,
  onUpdateMediaZoomEndpoint,
  onPreviewMediaZoomEndpoint,
  onPreviewMediaScale,
  zoomEndpointPreview,
  onInheritMediaZoom,
  onSplitMedia,
  onUpdateMediaPosition,
  onRotateMedia,
  onUpdateMediaBlur,
  onResetMediaSetting,
  onUpdateMediaVolume,
  onToggleMediaMute,
  onBeforeTransitionEdit,
  onUpdateVideoPlaybackSpeed,
  bulkVolumeEnabled = false,
  onUpdateVideoShowSpeedBadge,
  onUpdateVideoSpeedBadgeLabelStyle,
  onUpdateVideoSpeedBadgePosition,
  onApplyVideoSpeedBadgePreset,
  onToggleMediaFadeIn,
  onToggleMediaFadeOut,
  onUpdateFadeInDuration,
  onUpdateFadeOutDuration,
  onOpenHelp,
  defaultOpen = true,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 簡単コピーは standard フレーバー（Android/PC）限定機能
  const { isIosSafari } = usePlatformCapabilities();
  const uiCapabilities = getAppFlavorUiCapabilities(isIosSafari ? 'apple-safari' : 'standard');
  const [isOverallSettingsOpen, setIsOverallSettingsOpen] = useState(false);
  const titleSettingsNode = uiCapabilities.supportsVideoTitle ? titleSettingsPanel : null;
  const watermarkNode = uiCapabilities.supportsWatermark ? watermarkPanel : null;
  const audioSettingsNode = uiCapabilities.supportsClipAudioSettings ? audioSettingsPanel : null;
  const hasOverallSettings = Boolean(titleSettingsNode || watermarkNode || audioSettingsNode);
  // 出力の向き（16:9 横 / 9:16 縦）。プロジェクトごとに保持され、プレビュー/カード/エクスポートに反映される。
  const aspectRatio = useCanvasStore((s) => s.aspectRatio);
  const canvasWidth = useCanvasStore((s) => s.width);
  const showToast = useUIStore((s) => s.showToast);
  /** 素材の幅・高さ（動画は保存値、画像は読み込み済み要素から）。不明なら null */
  const resolveSourceSize = (item: MediaItem): { width: number; height: number } | null => {
    if (item.sourceWidth && item.sourceHeight) {
      return { width: item.sourceWidth, height: item.sourceHeight };
    }
    const element = mediaElements[item.id];
    if (element instanceof HTMLVideoElement && element.videoWidth > 0) {
      return { width: element.videoWidth, height: element.videoHeight };
    }
    if (element instanceof HTMLImageElement && element.naturalWidth > 0) {
      return { width: element.naturalWidth, height: element.naturalHeight };
    }
    return null;
  };
  /**
   * カード間の「並べて比較」設定を変える。左右・ななめになった／ではなくなったときは、
   * 何も触っていない横長素材だけ横位置を ±5% 自動調整・復元する（ユーザーの調整は変えない）。
   */
  /** 長さそろえで変更した値を書き込む（動画は終了位置、画像は表示時間）。書き込んだ実際の値を返す */
  const writeMatchDurationValue = (itemId: string, field: 'trimEnd' | 'duration', value: number): number | null => {
    const store = useMediaStore.getState();
    if (field === 'trimEnd') store.updateVideoTrim(itemId, 'end', value);
    else store.updateImageDuration(itemId, value);
    const written = useMediaStore.getState().mediaItems.find((item) => item.id === itemId);
    if (!written) return null;
    return field === 'trimEnd' ? written.trimEnd : written.duration;
  };
  const readMatchDurationValue = (itemId: string, field: 'trimEnd' | 'duration'): number | null => {
    const item = useMediaStore.getState().mediaItems.find((candidate) => candidate.id === itemId);
    if (!item) return null;
    return field === 'trimEnd' ? item.trimEnd : item.duration;
  };
  /** 自動で詰めたままなら元へ戻す（ユーザーが触っていたら戻さない） */
  const revertMatchDuration = (restore: SplitCompareSettings['matchDurationRestore']) => {
    if (!restore) return;
    const current = readMatchDurationValue(restore.itemId, restore.field);
    if (current === null || Math.abs(current - restore.applied) > 0.0005) return;
    const item = useMediaStore.getState().mediaItems.find((candidate) => candidate.id === restore.itemId);
    if (!item || item.isLocked || isClipsLocked) return;
    writeMatchDurationValue(restore.itemId, restore.field, restore.original);
  };
  /**
   * 長い方を短い方の長さへ詰め、戻すための情報を返す。
   * 以前に詰めた情報があれば、元の値はそのまま引き継ぐ（何度そろえ直してもオフで最初の値へ戻る）。
   */
  const applyMatchDuration = (
    index: number,
    previousRestore: SplitCompareSettings['matchDurationRestore'],
  ): SplitCompareSettings['matchDurationRestore'] => {
    const state = useMediaStore.getState();
    const head = state.mediaItems[index];
    const partner = state.mediaItems[index + 1];
    if (!head || !partner) return previousRestore ?? null;
    const plan = resolveSplitCompareMatchDuration(head, partner);
    if (!plan) return previousRestore ?? null;
    const target = state.mediaItems.find((item) => item.id === plan.itemId);
    if (!target || target.isLocked || isClipsLocked) {
      showToast('ロック中のカードがあるため、長さをそろえられません');
      return previousRestore ?? null;
    }
    // 前回と別のカードを詰めることになったら、前回の分は（触っていなければ）先に戻す
    if (previousRestore && previousRestore.itemId !== plan.itemId) revertMatchDuration(previousRestore);
    const original = previousRestore && previousRestore.itemId === plan.itemId
      ? previousRestore.original
      : plan.current;
    const applied = writeMatchDurationValue(plan.itemId, plan.field, plan.next);
    if (applied === null) return previousRestore ?? null;
    return { itemId: plan.itemId, field: plan.field, original, applied };
  };
  /** 「短い方に合わせる」をもう一度押したとき（オンのまま長さがずれた場合）にそろえ直す */
  const handleRealignSplitCompareDuration = (index: number) => {
    const head = mediaItems[index];
    const settings = head?.splitCompareToNext;
    if (!head || !settings?.matchDuration) return;
    const restore = applyMatchDuration(index, settings.matchDurationRestore ?? null);
    updateMediaItem(head.id, { splitCompareToNext: { ...settings, matchDurationRestore: restore } });
  };
  const handleChangeSplitCompare = (index: number, requested: SplitCompareSettings | null) => {
    const head = mediaItems[index];
    const partner = mediaItems[index + 1];
    if (!head) return;
    const previous = splitCompareRoles[index] === 'head' ? head.splitCompareToNext ?? null : null;
    // 長さそろえ: オンになったら長い方を詰め、オフ（比較オフを含む）になったら自動で詰めた分を戻す
    let settings = requested;
    const wasMatching = !!previous?.matchDuration;
    const isMatching = !!requested?.matchDuration;
    if (wasMatching && !isMatching) {
      revertMatchDuration(previous?.matchDurationRestore ?? null);
      if (settings) settings = { ...settings, matchDurationRestore: null };
    } else if (!wasMatching && isMatching && settings) {
      settings = { ...settings, matchDurationRestore: applyMatchDuration(index, null) };
    }
    const wasWanted = isSplitCompareDiagonalOffsetWanted(previous, aspectRatio);
    const isWanted = isSplitCompareDiagonalOffsetWanted(settings, aspectRatio);
    const offsetPatch = (item: MediaItem, role: 'head' | 'partner') => resolveSplitCompareAutoOffsetPatch({
      item,
      role,
      wasWanted,
      isWanted,
      sourceSize: resolveSourceSize(item),
      canvasWidth,
    });
    // 長さそろえで head の値が変わっている場合があるので、最新のカードを基準に位置調整を判定する
    const latestHead = useMediaStore.getState().mediaItems.find((item) => item.id === head.id) ?? head;
    const latestPartner = partner
      ? useMediaStore.getState().mediaItems.find((item) => item.id === partner.id) ?? partner
      : undefined;
    updateMediaItem(head.id, {
      splitCompareToNext: settings,
      // 比較と切り替え効果は同じ境界で併用しない
      ...(settings ? { transitionToNext: null } : {}),
      ...(offsetPatch(latestHead, 'head') ?? {}),
    });
    const partnerPatch = latestPartner ? offsetPatch(latestPartner, 'partner') : null;
    if (partner && partnerPatch) {
      updateMediaItem(partner.id, partnerPatch);
    }
  };
  const duplicateMediaItem = useMediaStore((s) => s.duplicateMediaItem);
  const addContinuationMediaItem = useMediaStore((s) => s.addContinuationMediaItem);
  const updateMediaItem = useMediaStore((s) => s.updateMediaItem);
  const canDuplicate = !isIosSafari;
  // クリップ間トランジションは standard フレーバー（Android/PC）限定
  const supportsTransitions = !isIosSafari;
  // 並べて比較の役割（コネクタの表示・設定可否に使う）
  const splitCompareRoles = useMemo(() => resolveSplitCompareRoles(mediaItems), [mediaItems]);
  // 動画倍速は standard フレーバー（Android/PC）限定（apple-safari では UI 非表示）
  const supportsPlaybackSpeed = !isIosSafari;
  const clipListRestoreEpoch = useMediaStore((s) => s.clipListRestoreEpoch);
  // 初期表示は開いた状態（素材が未登録でも開く）。保存プロジェクト読み込み時や素材追加時も開く。
  const [isSectionOpen, setIsSectionOpen] = useState(defaultOpen);
  const prevSectionCountRef = useRef(mediaItems.length);
  const prevSectionEpochRef = useRef(clipListRestoreEpoch);
  const focusId = useMemo(
    () => !isPlaying && !isExporting && zoomEndpointPreview && mediaItems.some((item) => item.id === zoomEndpointPreview.id)
      ? zoomEndpointPreview.id : resolveFocusedClipId(mediaItems, currentTime),
    [mediaItems, currentTime, zoomEndpointPreview, isPlaying, isExporting],
  );
  // 並べて比較のペアは同時に画面へ出るので、片方が再生位置ならもう片方の枠も同じように光らせる。
  // （ズーム端点の確認中は 1 枚だけを表示するので対象外）
  const focusedIds = useMemo(() => {
    const ids = new Set<string>();
    if (!focusId) return ids;
    ids.add(focusId);
    const isZoomEndpointFocus = !isPlaying && !isExporting && zoomEndpointPreview?.id === focusId;
    if (!supportsTransitions || isZoomEndpointFocus) return ids;
    const index = mediaItems.findIndex((item) => item.id === focusId);
    const pair = index >= 0 ? getSplitComparePairForIndex(mediaItems, index, splitCompareRoles) : null;
    if (pair) {
      const partner = mediaItems[index === pair.headIndex ? pair.partnerIndex : pair.headIndex];
      if (partner) ids.add(partner.id);
    }
    return ids;
  }, [focusId, mediaItems, splitCompareRoles, supportsTransitions, zoomEndpointPreview, isPlaying, isExporting]);
  const [disclosure, setDisclosure] = useState<ClipCardDisclosureState>(() => (
    createInitialClipCardDisclosure(isExporting ? null : resolveFocusedClipId(mediaItems, currentTime))
  ));
  const [transitionCloseSignal, setTransitionCloseSignal] = useState(0);
  const disclosureRef = useRef(disclosure);
  disclosureRef.current = disclosure;
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingScrollIdRef = useRef<string | null>(null);
  const prevIdsRef = useRef<string[] | null>(null);
  const prevFocusRef = useRef<string | null>(focusId);
  const prevPlayingRef = useRef(isPlaying);
  const prevExportingRef = useRef(isExporting);
  const epochRef = useRef<number | null>(null);
  const prevFocusRenderRef = useRef(focusId);
  const prevTimeRenderRef = useRef(currentTime);
  const focusChangeDeltaRef = useRef(0);
  if (prevFocusRenderRef.current !== focusId) {
    focusChangeDeltaRef.current = Math.abs(currentTime - prevTimeRenderRef.current);
    prevFocusRenderRef.current = focusId;
  }
  prevTimeRenderRef.current = currentTime;

  const idsKey = mediaItems.map((item) => item.id).join('\0');

  useEffect(() => {
    const ids = idsKey.length > 0 ? idsKey.split('\0') : [];
    const previousIds = prevIdsRef.current;
    const previousFocusId = prevFocusRef.current;
    const wasPlaying = prevPlayingRef.current;
    const epochChanged = epochRef.current !== null && epochRef.current !== clipListRestoreEpoch;

    if (isExporting) {
      if (!prevExportingRef.current) {
        const closed = collapseAllClipCards(focusId);
        disclosureRef.current = closed;
        setDisclosure(closed);
      }
      pendingScrollIdRef.current = null;
      prevIdsRef.current = ids;
      prevFocusRef.current = focusId;
      prevPlayingRef.current = isPlaying;
      epochRef.current = clipListRestoreEpoch;
      prevExportingRef.current = true;
      return;
    }
    prevExportingRef.current = false;

    if (previousIds === null || epochRef.current === null) {
      prevIdsRef.current = ids;
      prevFocusRef.current = focusId;
      prevPlayingRef.current = isPlaying;
      epochRef.current = clipListRestoreEpoch;
      return;
    }

    const stepped = stepClipCardDisclosure(disclosureRef.current, {
      previousIds,
      nextIds: ids,
      focusId,
      previousFocusId,
      isPlaying,
      wasPlaying,
      focusChangeDeltaSec: focusChangeDeltaRef.current,
      restoreEpochChanged: epochChanged,
    });
    prevIdsRef.current = ids;
    prevFocusRef.current = focusId;
    prevPlayingRef.current = isPlaying;
    epochRef.current = clipListRestoreEpoch;
    if (stepped.state !== disclosureRef.current) {
      disclosureRef.current = stepped.state;
      setDisclosure(stepped.state);
    }
    // スマホではプレビューのシーク中に画面をカード一覧へ飛ばさない。
    // カード自体の開閉は stepClipCardDisclosure の state 更新をそのまま使う。
    const isMobileSeek = stepped.scrollReason === 'seek'
      && window.matchMedia('(max-width: 767px)').matches;
    if (isMobileSeek) {
      pendingScrollIdRef.current = null;
    } else if (stepped.scrollToId) {
      pendingScrollIdRef.current = stepped.scrollToId;
    }
  }, [clipListRestoreEpoch, focusId, idsKey, isPlaying, isExporting]);

  useEffect(() => {
    const epochChanged = prevSectionEpochRef.current !== clipListRestoreEpoch;
    prevSectionEpochRef.current = clipListRestoreEpoch;
    if (epochChanged) {
      setIsSectionOpen(true);
      prevSectionCountRef.current = mediaItems.length;
      return;
    }
    if (mediaItems.length > prevSectionCountRef.current) {
      setIsSectionOpen(true);
    }
    prevSectionCountRef.current = mediaItems.length;
  }, [clipListRestoreEpoch, mediaItems.length]);

  useEffect(() => {
    const id = pendingScrollIdRef.current;
    if (!id) return;
    const node = cardRefs.current.get(id);
    if (!node || typeof node.scrollIntoView !== 'function') return;
    pendingScrollIdRef.current = null;
    try {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch {
      // jsdom には scrollIntoView が無いことがある
    }
  });

  const handleAddClick = () => {
    if (isClipsLocked) return;
    if (supportsShowOpenFilePicker) {
      onOpenMediaPicker();
      return;
    }
    fileInputRef.current?.click();
  };

  return (
    <section className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden shadow-xl min-w-0">
      <div
        className="p-4 bg-gray-850 border-b border-gray-800 flex justify-between items-center gap-3 cursor-pointer hover:bg-gray-800/50 transition"
        onClick={() => setIsSectionOpen((open) => !open)}
      >
        <h2 className="font-bold flex items-center gap-2 text-blue-400 md:text-base lg:text-lg min-w-0">
          {isSectionOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
          <span className="w-6 h-6 lg:w-7 lg:h-7 rounded-full bg-blue-500/10 flex items-center justify-center text-xs lg:text-sm shrink-0">
            1
          </span>
          <span className="truncate">動画・画像</span>
          {mediaItems.length > 0 && (
            <span className="shrink-0 text-[10px] md:text-xs text-blue-300 font-normal">
              ({mediaItems.length}件)
            </span>
          )}
          <button
            onClick={(event) => {
              event.stopPropagation();
              onOpenHelp();
            }}
            className="p-1 rounded-lg transition border border-blue-500/45 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200"
            title="このセクションの説明"
            aria-label="動画・画像セクションの説明"
          >
            <CircleHelp className="w-4 h-4" />
          </button>
        </h2>
        <div className="flex items-center gap-1.5 shrink-0" onClick={(event) => event.stopPropagation()}>
          {/* 出力の向き切替（16:9 横 / 9:16 縦）。既定は横。 */}
          {uiCapabilities.supportsAspectRatioSelection && (
            <div
              className="flex items-center rounded-lg border border-gray-700 bg-gray-800/70 p-0.5"
              role="group"
              aria-label="出力の向き"
            >
            <button
              type="button"
              onClick={() => onAspectRatioChange('landscape')}
              aria-pressed={aspectRatio === 'landscape'}
              title="横画面 (16:9)"
              className={`p-1 rounded-md transition ${aspectRatio === 'landscape' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            >
              <RectangleHorizontal className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onAspectRatioChange('portrait')}
              aria-pressed={aspectRatio === 'portrait'}
              title="縦画面 (9:16)"
              className={`p-1 rounded-md transition ${aspectRatio === 'portrait' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            >
              <RectangleVertical className="w-4 h-4" />
            </button>
            </div>
          )}
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
      {isSectionOpen && mediaItems.length >= 2 && (
        <div className="px-4 py-1.5 border-b border-gray-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDisclosure(expandAllClipCards(mediaItems.map((item) => item.id)))}
            disabled={isExporting}
            className="min-h-9 px-2.5 rounded-lg border border-gray-700 bg-gray-800/70 text-[10px] md:text-xs text-gray-300 hover:text-white hover:border-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
          >
            すべて開く
          </button>
          <button
            type="button"
            onClick={() => {
              setDisclosure(collapseAllClipCards(focusId));
              setTransitionCloseSignal((value) => value + 1);
            }}
            disabled={isExporting}
            className="min-h-9 px-2.5 rounded-lg border border-gray-700 bg-gray-800/70 text-[10px] md:text-xs text-gray-300 hover:text-white hover:border-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
          >
            すべて閉じる
          </button>
        </div>
      )}
      {isSectionOpen && (
      <div className="p-3 lg:p-4 space-y-3 max-h-[min(32rem,72svh)] lg:max-h-128 overflow-y-auto custom-scrollbar">
        {hasOverallSettings && (
          <div className="bg-gray-800/50 rounded-xl border border-gray-600/70">
            <SettingsAccordionHeader
              title="全体設定"
              icon={<SlidersHorizontal className="w-3 h-3 shrink-0" />}
              isOpen={isOverallSettingsOpen}
              controlsId="clip-overall-settings"
              onToggle={() => setIsOverallSettingsOpen((open) => !open)}
            />
            {isOverallSettingsOpen && (
              <div id="clip-overall-settings" className="space-y-3 border-t border-gray-700/60 px-3 py-3">
                {titleSettingsNode}
                {watermarkNode}
                {audioSettingsNode}
              </div>
            )}
          </div>
        )}
        {mediaItems.length === 0 && (
          <div className="text-center py-8 text-gray-600 text-xs md:text-sm border-2 border-dashed border-gray-800 rounded">
            動画または画像ファイルを追加してください
          </div>
        )}
        {mediaItems.map((v, i) => (
          <React.Fragment key={v.id}>
          <div
            ref={(node) => {
              if (node) cardRefs.current.set(v.id, node);
              else cardRefs.current.delete(v.id);
            }}
            className="min-w-0"
          >
          <ClipItem
            item={v}
            isOpen={!isExporting && isClipCardBodyOpen(disclosure, v.id)}
            isFocused={focusedIds.has(v.id)}
            onToggleOpen={() => {
              if (!isExporting) setDisclosure((prev) => toggleClipCard(prev, v.id, focusId));
            }}
            timelineRange={mediaTimelineRanges[v.id] ?? { start: 0, end: v.duration }}
            currentTime={currentTime}
            index={i}
            totalItems={mediaItems.length}
            isClipsLocked={isClipsLocked || isExporting}
            mediaElement={mediaElements[v.id] || null}
            onMoveUp={() => onMoveMedia(i, 'up')}
            onMoveDown={() => onMoveMedia(i, 'down')}
            onDuplicate={canDuplicate ? () => duplicateMediaItem(v.id) : undefined}
            onAddContinuation={canDuplicate ? () => addContinuationMediaItem(v.id) : undefined}
            onSplit={canDuplicate && onSplitMedia ? () => onSplitMedia(v.id) : undefined}
            onRemove={() => onRemoveMedia(v.id)}
            onToggleLock={() => onToggleMediaLock(v.id)}
            onToggleTransformPanel={() => onToggleTransformPanel(v.id)}
            onUpdateVideoTrim={(type, value) => onUpdateVideoTrim(v.id, type, value)}
            onSetVideoTrimFromCurrent={
              uiCapabilities.supportsMediaTrimFromPreview
                ? (type) => onSetVideoTrimFromCurrent(v.id, type)
                : undefined
            }
            onUpdateImageDuration={(value) => onUpdateImageDuration(v.id, value)}
            onSetImageEndFromCurrent={
              uiCapabilities.supportsMediaTrimFromPreview && v.type === 'image' && onSetImageEndFromCurrent
                ? () => onSetImageEndFromCurrent(v.id)
                : undefined
            }
            onUpdateScale={(value) => onUpdateMediaScale(v.id, value)}
            onUpdateZoomDirection={(direction) => onUpdateMediaZoomDirection(v.id, direction)}
            onUpdateZoomAmount={(amount) => onUpdateMediaZoomAmount(v.id, amount)}
            onUpdateZoomEndpoint={onUpdateMediaZoomEndpoint ? (endpoint, scale) => onUpdateMediaZoomEndpoint(v.id, endpoint, scale) : undefined}
            onPreviewZoomEndpoint={onPreviewMediaZoomEndpoint ? (endpoint) => onPreviewMediaZoomEndpoint(v.id, endpoint) : undefined}
            onPreviewScale={onPreviewMediaScale ? () => onPreviewMediaScale(v.id) : undefined}
            zoomPreviewEndpoint={zoomEndpointPreview?.id === v.id ? zoomEndpointPreview.endpoint : undefined}
            onInheritZoom={i > 0 && onInheritMediaZoom ? () => onInheritMediaZoom(v.id) : undefined}
            previousZoomEndScale={i > 0 ? resolveMediaScaleFactor(mediaItems[i - 1], mediaItems[i - 1].duration) : undefined}
            onUpdatePosition={(axis, value) => onUpdateMediaPosition(v.id, axis, value)}
            onRotate={uiCapabilities.supportsMediaRotation ? () => onRotateMedia(v.id) : undefined}
            onUpdateBlur={
              uiCapabilities.supportsMediaBlur
                ? (value) => onUpdateMediaBlur(v.id, value)
                : undefined
            }
            onResetSetting={(type) => onResetMediaSetting(v.id, type)}
            onUpdateVolume={(value) => onUpdateMediaVolume(v.id, value)}
            onToggleMute={() => onToggleMediaMute(v.id)}
            bulkVolumeEnabled={bulkVolumeEnabled}
            onUpdatePlaybackSpeed={
              supportsPlaybackSpeed && onUpdateVideoPlaybackSpeed
                ? (speed) => onUpdateVideoPlaybackSpeed(v.id, speed)
                : undefined
            }
            onUpdateShowSpeedBadge={
              supportsPlaybackSpeed && onUpdateVideoShowSpeedBadge
                ? (show) => onUpdateVideoShowSpeedBadge(v.id, show)
                : undefined
            }
            onUpdateSpeedBadgeLabelStyle={
              supportsPlaybackSpeed && onUpdateVideoSpeedBadgeLabelStyle
                ? (style) => onUpdateVideoSpeedBadgeLabelStyle(v.id, style)
                : undefined
            }
            onUpdateSpeedBadgePosition={
              supportsPlaybackSpeed && onUpdateVideoSpeedBadgePosition
                ? (axis, value) => onUpdateVideoSpeedBadgePosition(v.id, axis, value)
                : undefined
            }
            onApplySpeedBadgePreset={
              supportsPlaybackSpeed && onApplyVideoSpeedBadgePreset
                ? (preset) => onApplyVideoSpeedBadgePreset(v.id, preset)
                : undefined
            }
            onToggleFadeIn={(checked) => onToggleMediaFadeIn(v.id, checked)}
            onToggleFadeOut={(checked) => onToggleMediaFadeOut(v.id, checked)}
            onUpdateFadeInDuration={(duration) => onUpdateFadeInDuration(v.id, duration)}
            onUpdateFadeOutDuration={(duration) => onUpdateFadeOutDuration(v.id, duration)}
          />
          </div>
          {supportsTransitions && i < mediaItems.length - 1 && (
            <ClipTransitionConnector
              transition={v.transitionToNext ?? null}
              splitCompare={splitCompareRoles[i] === 'head' ? v.splitCompareToNext ?? null : null}
              splitCompareBlockedReason={
                splitCompareRoles[i] === 'partner'
                  ? '上のカードと2画面表示中のため、このカードからは設定できません'
                  : splitCompareRoles[i + 1] === 'head'
                    ? '下のカードが次のカードと2画面表示中のため設定できません'
                    : null
              }
              isAdjacentToSplitCompare={splitCompareRoles[i] !== null || splitCompareRoles[i + 1] !== null}
              aspectRatio={aspectRatio}
              pairDurations={splitCompareRoles[i] === 'head' && mediaItems[i + 1]
                ? [v.duration, mediaItems[i + 1].duration]
                : null}
              onRealignSplitCompareDuration={() => handleRealignSplitCompareDuration(i)}
              disabled={isClipsLocked || v.isLocked}
              closeSignal={transitionCloseSignal}
              onBeforeEdit={onBeforeTransitionEdit}
              onChange={(transition) => updateMediaItem(v.id, { transitionToNext: transition })}
              onChangeSplitCompare={(settings) => handleChangeSplitCompare(i, settings)}
            />
          )}
          </React.Fragment>
        ))}
      </div>
      )}
    </section>
  );
};

export default React.memo(ClipsSection);
