/**
 * @file ClipCompositionPanel.tsx
 * @description 動画・画像カードの「サイズ・位置・動き」欄。
 *
 * 以前は「位置・サイズ」と「ズーム」「移動」が別の欄にあり、同じ値（拡大率＝ズーム開始、
 * 横・縦＝移動の開始）が 2 か所に出ていた。ここでは**サイズ・横・縦の 1 組のスライダー**で、
 * 「動かさない」なら全体の構図を、「動かす」なら選んだ時点（開始＝先頭／終了＝末尾）の構図を編集する。
 * 保存形式・描画は従来のズーム（zoomStart/EndScale）と移動（positionX/Y・panEndPositionX/Y）のまま。
 */
import React, { useEffect, useState } from 'react';
import { Move, MoveDiagonal, RotateCcw, RotateCw, ZoomIn } from 'lucide-react';
import type { MediaItem } from '../../types';
import MiniPreview from '../common/MiniPreview';
import NumericSliderField from '../common/NumericSliderField';
import {
  COMPACT_AXIS_LABEL_CLASS,
  COMPACT_RESET_BUTTON_CLASS,
  COMPACT_SPACER_LABEL,
} from '../common/CompactField';
import {
  CENTER_ORIGIN_MAX,
  CENTER_ORIGIN_MIN,
  fromCenterPixels,
  roundCenterOrigin,
  toCenterPixels,
} from '../../utils/centerOriginPosition';
import {
  MAX_MEDIA_ZOOM_SCALE,
  MIN_MEDIA_ZOOM_SCALE,
  mediaPercentToScale,
  mediaScaleToPercent,
  type MediaTransformResetKind,
} from '../../utils/mediaZoom';
import {
  isMediaMotionActive,
  resolveMediaMotionRange,
  type MediaComposition,
  type MediaMotionPoint,
} from '../../utils/mediaMotion';

/** 黒帯除去で使うサイズ（102.5%） */
const BLACK_BAR_REMOVAL_SCALE = 1.025;

export interface ClipCompositionPanelProps {
  item: MediaItem;
  isDisabled: boolean;
  canvasWidth: number;
  canvasHeight: number;
  mediaElement: HTMLVideoElement | HTMLImageElement | null;
  /** プレビュー現在位置のこのクリップ内の時刻（動かさないときのミニプレビュー用） */
  currentLocalTime: number;
  /** 親が端点を停止プレビュー中ならその時点（再生・シークで null に戻る） */
  previewEndpoint?: MediaMotionPoint;
  /** 動かさないときのサイズ（開始・終了が連動） */
  onUpdateScale: (value: number) => void;
  /** 動かさないときの横・縦（px） */
  onUpdatePosition: (axis: 'x' | 'y', value: string) => void;
  /** 動かすときに、選んだ時点の構図だけを変える */
  onUpdateMotionPoint?: (point: MediaMotionPoint, patch: Partial<MediaComposition>) => void;
  /** 終了の構図を決める（null で開始と同じ＝動きを止める） */
  onSetMotionEnd?: (end: MediaComposition | null) => void;
  /** その時点（先頭／末尾）を本プレビューで停止表示する */
  onPreviewEndpoint?: (point: MediaMotionPoint) => void;
  /** 動かさないときのサイズ変更。表示中のカードなら現在位置を保つ */
  onPreviewScale?: () => void;
  onInheritComposition?: () => void;
  /** 直前カードの最後の構図 */
  previousComposition?: MediaComposition;
  onResetSetting: (type: MediaTransformResetKind) => void;
  onRotate?: () => void;
}

const choiceButtonClass = (selected: boolean) => `flex w-full items-center justify-center whitespace-nowrap rounded-lg border px-1 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 disabled:pointer-events-none disabled:opacity-40 md:px-2 md:text-sm ${
  selected
    ? 'border-blue-400 bg-blue-500/20 text-blue-100'
    : 'border-gray-700 bg-gray-800 text-gray-200 hover:border-gray-500 hover:bg-gray-700'
}`;


// 見た目・押せる範囲・1 文字ラベルの取り決めは CompactField.tsx に集約
const resetIconClass = COMPACT_RESET_BUTTON_CLASS;

/** 横・縦の 1 文字ラベル（サイズの行は同じ幅の空白で数値欄の左端をそろえる） */
const axisLabelClass = COMPACT_AXIS_LABEL_CLASS;

/** サイズと横・縦の数値欄を同じ幅（横・縦の −100〜100 と同じ 4 桁）にそろえる */
const POSITION_INPUT_WIDTH_CHARS = 4;

/** サイズ行の見えないラベル（横・縦の 1 文字ラベルと同じ幅を空けて数値欄の左端をそろえる） */
const SPACER_LABEL = COMPACT_SPACER_LABEL;

const sliderClass = 'flex-1 min-w-0 accent-blue-400 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50';

const ClipCompositionPanel: React.FC<ClipCompositionPanelProps> = ({
  item: v,
  isDisabled,
  canvasWidth,
  canvasHeight,
  mediaElement,
  currentLocalTime,
  previewEndpoint,
  onUpdateScale,
  onUpdatePosition,
  onUpdateMotionPoint,
  onSetMotionEnd,
  onPreviewEndpoint,
  onPreviewScale,
  onInheritComposition,
  previousComposition,
  onResetSetting,
  onRotate,
}) => {
  const canMove = Boolean(onUpdateMotionPoint && onSetMotionEnd);
  const isMoving = isMediaMotionActive(v);
  // 「動かす」は、実際に動いているか、利用者が動かすを選んだ（まだ終了が開始と同じ）とき
  const [isMotionOn, setIsMotionOn] = useState(isMoving);
  const [editPoint, setEditPoint] = useState<MediaMotionPoint>(previewEndpoint ?? 'start');
  // 「動かさない」に戻したときの終了。もう一度「動かす」にしたら戻す
  const [savedEnd, setSavedEnd] = useState<MediaComposition | null>(null);

  useEffect(() => {
    if (isMoving) setIsMotionOn(true);
  }, [isMoving]);
  useEffect(() => {
    if (previewEndpoint) setEditPoint(previewEndpoint);
  }, [previewEndpoint]);

  const motionMode = canMove && isMotionOn;
  const range = resolveMediaMotionRange(v);
  const shown = motionMode ? range[editPoint] : range.start;
  const toDisplay = (point: MediaComposition) => ({
    size: mediaScaleToPercent(point.scale),
    x: roundCenterOrigin(fromCenterPixels(point.x, canvasWidth, 'x')),
    y: roundCenterOrigin(fromCenterPixels(point.y, canvasHeight, 'y')),
  });
  const shownDisplay = toDisplay(shown);
  const miniPreviewTime = motionMode
    ? (editPoint === 'start' ? 0 : v.duration)
    : previewEndpoint === 'start' ? 0 : previewEndpoint === 'end' ? v.duration : currentLocalTime;

  const selectPoint = (point: MediaMotionPoint) => {
    setEditPoint(point);
    onPreviewEndpoint?.(point);
  };

  const updatePoint = (patch: Partial<MediaComposition>) => {
    onUpdateMotionPoint?.(editPoint, patch);
    onPreviewEndpoint?.(editPoint);
  };

  const handleSize = (percent: number) => {
    if (motionMode) {
      updatePoint({ scale: mediaPercentToScale(percent) });
      return;
    }
    onUpdateScale(mediaPercentToScale(percent));
    onPreviewScale?.();
  };

  const handleAxis = (axis: 'x' | 'y', percent: number) => {
    const px = toCenterPixels(percent, axis === 'x' ? canvasWidth : canvasHeight, axis);
    if (motionMode) {
      updatePoint({ [axis]: px });
      return;
    }
    onUpdatePosition(axis, String(px));
  };

  const resetSize = () => {
    if (motionMode) {
      updatePoint({ scale: editPoint === 'start' ? 1 : range.start.scale });
      return;
    }
    onResetSetting('scale');
    onPreviewScale?.();
  };

  // 「位置」のくるくるは横・縦をまとめて戻す（横だけなら数値欄に 0 かスライダーを中央へ）
  const resetPosition = () => {
    if (motionMode) {
      updatePoint(editPoint === 'start' ? { x: 0, y: 0 } : { x: range.start.x, y: range.start.y });
      return;
    }
    onResetSetting('x');
    onResetSetting('y');
  };

  const isBlackBarRemoved = Math.abs(shown.scale - BLACK_BAR_REMOVAL_SCALE) < 0.001;
  const toggleBlackBar = (checked: boolean) => {
    const scale = checked ? BLACK_BAR_REMOVAL_SCALE : 1;
    if (motionMode) {
      updatePoint({ scale });
      return;
    }
    onUpdateScale(scale);
    onPreviewScale?.();
  };

  const turnMotionOff = () => {
    if (isMoving) setSavedEnd(range.end);
    setIsMotionOn(false);
    onSetMotionEnd?.(null);
    onPreviewScale?.();
  };

  const turnMotionOn = () => {
    setIsMotionOn(true);
    if (savedEnd && !isMoving) onSetMotionEnd?.(savedEnd);
    setSavedEnd(null);
    selectPoint('end');
  };

  const resetAll = () => {
    onResetSetting('composition-default');
    setIsMotionOn(false);
    setSavedEnd(null);
    setEditPoint('start');
    onPreviewScale?.();
  };

  const startDisplay = toDisplay(range.start);
  const endDisplay = toDisplay(range.end);
  const previousDisplay = previousComposition ? toDisplay(previousComposition) : null;
  const pointLabel = editPoint === 'start' ? '開始（先頭）' : '終了（末尾）';

  return (
    <div className="space-y-1.5" data-testid={`clip-composition-${v.id}`}>
      {/* ミニプレビュー: 調整結果を確認する場所なので**スライダーより上**に置く（指で隠れない） */}
      <MiniPreview item={v} mediaElement={mediaElement} localTime={miniPreviewTime} />
      {motionMode && (
        <p className="text-[11px] text-blue-200 md:text-xs" aria-live="polite" data-testid={`clip-composition-point-${v.id}`}>
          {pointLabel}の構図を表示・編集中
        </p>
      )}

      {/* 黒帯除去（よく使うので先頭） */}
      <label
        className={`flex min-h-9 items-center gap-1.5 px-1 text-[11px] text-gray-300 transition hover:text-white md:text-xs ${isDisabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
      >
        <input
          type="checkbox"
          checked={isBlackBarRemoved}
          onChange={(e) => toggleBlackBar(e.target.checked)}
          className="h-3.5 w-3.5 rounded accent-blue-500"
          disabled={isDisabled}
        />
        <span>黒帯除去（102.5%に拡大）{motionMode ? `：${pointLabel}` : ''}</span>
      </label>

      {/* サイズ（見出しの右端にリセット。値は数値欄に出ているので見出しには出さない） */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between text-[10px] text-gray-400 md:text-xs">
          <span className="flex items-center gap-1">
            <ZoomIn className="w-3 h-3" aria-hidden="true" /> サイズ
          </span>
          <button
            type="button"
            onClick={resetSize}
            disabled={isDisabled}
            title={motionMode && editPoint === 'end' ? '開始と同じサイズにする' : '100%へ戻す'}
            aria-label="サイズをリセット"
            className={resetIconClass}
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
        <NumericSliderField
          ariaLabel="拡大率"
          label={SPACER_LABEL}
          labelClassName={axisLabelClass}
          min={mediaScaleToPercent(MIN_MEDIA_ZOOM_SCALE)}
          max={mediaScaleToPercent(MAX_MEDIA_ZOOM_SCALE)}
          step={0.1}
          stepperStep={2.5}
          value={shownDisplay.size}
          onChange={handleSize}
          onInputFocus={motionMode ? () => onPreviewEndpoint?.(editPoint) : onPreviewScale}
          unit="%"
          inputWidthChars={POSITION_INPUT_WIDTH_CHARS}
          disabled={isDisabled}
          sliderClassName={sliderClass}
        />
      </div>

      {/* 位置: 横・縦をまとめ、見出し 1 行＋1 文字ラベルの 2 行で詰める。くるくるは横・縦をまとめて戻す */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between text-[10px] text-gray-400 md:text-xs">
          <span className="flex items-center gap-1">
            <Move className="w-3 h-3" aria-hidden="true" /> 位置（右・上が＋）
          </span>
          <button
            type="button"
            onClick={resetPosition}
            disabled={isDisabled}
            title={motionMode && editPoint === 'end' ? '開始と同じ位置にする' : '中央へ戻す'}
            aria-label="位置をリセット"
            className={resetIconClass}
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
        {(['x', 'y'] as const).map((axis) => (
          <NumericSliderField
            key={axis}
            label={axis === 'x' ? '横' : '縦'}
            labelClassName={axisLabelClass}
            ariaLabel={axis === 'x' ? '横位置' : '縦位置'}
            min={CENTER_ORIGIN_MIN}
            max={CENTER_ORIGIN_MAX}
            step={1}
            value={shownDisplay[axis]}
            onChange={(percent) => handleAxis(axis, percent)}
            onInputFocus={motionMode ? () => onPreviewEndpoint?.(editPoint) : undefined}
            unit="%"
            inputWidthChars={POSITION_INPUT_WIDTH_CHARS}
            disabled={isDisabled}
            sliderClassName={sliderClass}
          />
        ))}
      </div>

      {/* 動き（ズーム・位置の移動）: サイズ・位置と同じ見出しの書き方。
          時点の選択は「動かす」を選んだときだけ出す */}
      {canMove && (
        <div className="flex flex-col gap-1.5 border-t border-gray-700/50 pt-2" data-testid={`clip-motion-${v.id}`}>
          <div className="flex items-center text-[10px] text-gray-400 md:text-xs">
            <span className="flex items-center gap-1" id={`clip-motion-heading-${v.id}`}>
              <MoveDiagonal className="w-3 h-3" aria-hidden="true" /> 動き（ズーム・位置の移動）
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-labelledby={`clip-motion-heading-${v.id}`}>
            <button
              type="button"
              aria-pressed={!motionMode}
              disabled={isDisabled}
              onClick={turnMotionOff}
              className={choiceButtonClass(!motionMode)}
            >
              動かさない
            </button>
            <button
              type="button"
              aria-pressed={motionMode}
              disabled={isDisabled}
              onClick={motionMode ? undefined : turnMotionOn}
              className={choiceButtonClass(motionMode)}
            >
              動かす
            </button>
          </div>
          {!motionMode && (
            <p className="text-[10px] leading-snug text-gray-500 md:text-xs">
              「動かす」を選ぶと、開始（先頭）と終了（末尾）の構図を決めて、ズームイン・ズームアウトや位置の移動ができます。
            </p>
          )}

          {motionMode && (
            <div className="flex flex-col gap-2 rounded-lg border border-gray-700/60 bg-gray-900/40 p-2">
              {/* 編集する時点を選び、上のサイズ・位置で調整する */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400 md:text-xs" id={`clip-motion-point-label-${v.id}`}>
                  編集する時点（選んで、上のサイズ・位置を変更）
                </span>
                <div className="grid grid-cols-2 gap-1.5" role="group" aria-labelledby={`clip-motion-point-label-${v.id}`}>
                  {(['start', 'end'] as const).map((point) => (
                    <button
                      key={point}
                      type="button"
                      aria-pressed={editPoint === point}
                      disabled={isDisabled}
                      onClick={() => selectPoint(point)}
                      className={choiceButtonClass(editPoint === point)}
                    >
                      {point === 'start' ? '開始（先頭）' : '終了（末尾）'}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-200" aria-live="polite" data-testid={`clip-motion-summary-${v.id}`}>
                {isMoving
                  ? `開始 ${startDisplay.size}%・横${startDisplay.x}%・縦${startDisplay.y}% → 終了 ${endDisplay.size}%・横${endDisplay.x}%・縦${endDisplay.y}%`
                  : 'まだ動きません。「終了（末尾）」を選んで、上のサイズや位置を変えてください。'}
              </p>
            </div>
          )}
        </div>
      )}

      {onInheritComposition && previousDisplay && (
        <button
          type="button"
          onClick={() => {
            onInheritComposition();
            if (motionMode) selectPoint('start');
            else onPreviewScale?.();
          }}
          disabled={isDisabled}
          title={motionMode
            ? '前の素材の最後の構図を、このカードの開始にします（終了は今のまま）'
            : '前の素材の最後の構図で、このカードを表示します'}
          className="min-h-11 w-full rounded-lg border border-blue-700 bg-blue-900/30 px-2.5 text-xs leading-snug text-blue-200 hover:bg-blue-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 md:text-sm"
        >
          前の素材の最後の構図を引き継ぐ（{previousDisplay.size}%・横{previousDisplay.x}%・縦{previousDisplay.y}%）
        </button>
      )}

      <button
        type="button"
        onClick={resetAll}
        disabled={isDisabled}
        title="サイズを100%・位置を中央に戻し、動きを止めます"
        className="inline-flex min-h-9 items-center gap-1 rounded px-1 text-xs text-gray-400 transition-colors hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-30 motion-reduce:transition-none"
      >
        <RotateCcw className="h-3 w-3" aria-hidden="true" />
        100%・中央に戻す
      </button>

      {/* 回転（あまり使わないので一番下） */}
      {onRotate && (
        <div className="flex flex-col gap-1 border-t border-gray-700/50 pt-2">
          <div className="flex items-center justify-between text-[10px] text-gray-400 md:text-xs">
            <div className="flex items-center gap-1">
              <RotateCw className="w-3 h-3" /> 回転: {v.rotation || 0}°
            </div>
            <button
              type="button"
              onClick={() => onResetSetting('rotation')}
              disabled={isDisabled}
              title="リセット"
              aria-label="回転をリセット"
              className={resetIconClass}
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
          <button
            type="button"
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
    </div>
  );
};

export default React.memo(ClipCompositionPanel);
