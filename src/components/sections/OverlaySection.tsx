/**
 * @file OverlaySection.tsx
 * @description 動画・画像セクション内で、カードをまたぐウォーターマークを設定する（Issue #210）。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, MapPin, RotateCcw, Trash2 } from 'lucide-react';
import type { WatermarkMask, WatermarkOverlay } from '../../types';
import {
  DEFAULT_WATERMARK_OVERLAY,
  resolveWatermarkPresetPosition,
  WATERMARK_FEATHER_MAX,
  WATERMARK_FEATHER_MIN,
  WATERMARK_MASK_SIZE_MAX,
  WATERMARK_MASK_SIZE_MIN,
  WATERMARK_POSITION_MAX,
  WATERMARK_POSITION_MIN,
  WATERMARK_ROTATION_MAX,
  WATERMARK_ROTATION_MIN,
  WATERMARK_SIZE_MAX,
  WATERMARK_SIZE_MIN,
  type WatermarkPositionPreset,
} from '../../utils/watermarkOverlay';
import SettingsAccordionHeader from '../common/SettingsAccordionHeader';
import { SwipeProtectedSlider } from '../SwipeProtectedSlider';

interface ResetButtonProps {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

const ResetButton = React.memo<ResetButtonProps>(({ label, disabled = false, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={`${label}をデフォルトに戻す`}
    aria-label={`${label}をデフォルトに戻す`}
    className="rounded p-0.5 text-gray-200 transition hover:bg-gray-700/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-default disabled:text-gray-600 disabled:hover:bg-transparent"
  >
    <RotateCcw className="h-3.5 w-3.5" />
  </button>
));
ResetButton.displayName = 'ResetButton';

interface NumericControlProps {
  id: string;
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}

const NumericControl = React.memo<NumericControlProps>(({
  id,
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  suffix,
  onChange,
}) => {
  const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  const displayValue = Number(value.toFixed(decimals));

  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)_5rem] items-center gap-2 sm:grid-cols-[5.75rem_minmax(0,1fr)_5.5rem]">
      <div className="flex min-w-0 items-center gap-0.5">
        <label htmlFor={id} className="truncate text-[10px] text-gray-400 md:text-xs">
          {label}
        </label>
        <ResetButton
          label={label}
          onClick={() => onChange(defaultValue)}
        />
      </div>
      <SwipeProtectedSlider
        min={min}
        max={max}
        step={step}
        value={displayValue}
        onChange={onChange}
        ariaLabel={`ウォーターマークの${label}`}
        className="h-1 min-w-0 w-full appearance-none rounded bg-gray-600 accent-blue-500"
      />
      <div className="relative">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={displayValue}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 py-1.5 pl-2 pr-7 text-right text-xs font-semibold text-white focus:border-blue-500 focus:outline-none"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
});
NumericControl.displayName = 'NumericControl';

interface OverlaySectionProps {
  watermark: WatermarkOverlay;
  totalDuration: number;
  currentTime: number;
  canvasWidth: number;
  canvasHeight: number;
  onImageSelect: (file: File) => void;
  onUpdate: (updates: Partial<WatermarkOverlay>) => void;
  onSetRange: (startTime: number, endTime: number, totalDuration?: number) => void;
  onRemoveImage: () => void;
}

const MASK_OPTIONS: { value: WatermarkMask; label: string }[] = [
  { value: 'rectangle', label: '四角' },
  { value: 'rounded', label: '角丸' },
  { value: 'circle', label: '円形' },
];

const POSITION_PRESETS: { value: WatermarkPositionPreset; label: string }[] = [
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom-right', label: '右下' },
  { value: 'center', label: '中央' },
  { value: 'top-left', label: '左上' },
  { value: 'top-right', label: '右上' },
];

const OverlaySection = React.memo<OverlaySectionProps>(({
  watermark,
  totalDuration,
  currentTime,
  canvasWidth,
  canvasHeight,
  onImageSelect,
  onUpdate,
  onSetRange,
  onRemoveImage,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousUrlRef = useRef<string | null>(watermark.url);
  const rangeDefaultEnd = totalDuration > 0
    ? totalDuration
    : DEFAULT_WATERMARK_OVERLAY.endTime;
  const timeSliderMax = Math.max(rangeDefaultEnd, watermark.endTime);
  const previewMark = Math.round(currentTime * 10) / 10;
  const currentNaturalSize = naturalSize?.url === watermark.url ? naturalSize : null;
  const resolvedPositionPresets = useMemo(
    () => currentNaturalSize
      ? POSITION_PRESETS.map((preset) => ({
        ...preset,
        position: resolveWatermarkPresetPosition({
          overlay: watermark,
          preset: preset.value,
          imageNaturalWidth: currentNaturalSize.width,
          imageNaturalHeight: currentNaturalSize.height,
          canvasWidth,
          canvasHeight,
        }),
      }))
      : [],
    [canvasHeight, canvasWidth, currentNaturalSize, watermark],
  );

  useEffect(() => {
    if (watermark.url && watermark.url !== previousUrlRef.current) setIsOpen(true);
    previousUrlRef.current = watermark.url;
  }, [watermark.url]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onImageSelect(file);
  };

  return (
    <div className="rounded-lg border border-gray-700/70 bg-gray-900/30">
      <SettingsAccordionHeader
        title="ウォーターマーク"
        isOpen={isOpen}
        controlsId="watermark-settings"
        onToggle={() => setIsOpen((open) => !open)}
      />

      {isOpen && (
        <div
          id="watermark-settings"
          className="space-y-3 border-t border-gray-700/60 px-2 pb-2 pt-2"
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />

          {!watermark.url ? (
            <div className="rounded-lg border border-dashed border-gray-700 bg-black/20 px-3 py-4 text-center">
              <p className="text-xs font-semibold text-gray-200">ロゴ画像を重ねる</p>
              <p className="mt-1 text-[10px] leading-relaxed text-gray-500">
                PNG・JPEG・WebP。必要なときだけ追加でき、カードをまたいで表示できます。
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-3 min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-semibold text-white transition hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                画像を選択
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-700 bg-black/20 p-2">
                <div className="flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-black/40">
                  <img
                    src={watermark.url}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                    onLoad={(event) => {
                      setNaturalSize({
                        url: watermark.url as string,
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      });
                    }}
                  />
                </div>
                <div className="min-w-24 flex-1">
                  <p className="truncate text-xs font-semibold text-gray-100">
                    {watermark.file?.name ?? 'ウォーターマーク画像'}
                  </p>
                  <p className="mt-1 text-[9px] text-gray-500">
                    非表示でも画像と設定は保持されます。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdate({ enabled: !watermark.enabled })}
                  className={`flex min-h-10 items-center gap-1 rounded-lg border px-2 text-[10px] transition ${
                    watermark.enabled
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                      : 'border-gray-600 bg-gray-800 text-gray-400'
                  }`}
                  aria-label={watermark.enabled ? 'ウォーターマークを非表示にする' : 'ウォーターマークを表示する'}
                >
                  {watermark.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {watermark.enabled ? '表示中' : '非表示'}
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="min-h-10 rounded-lg border border-blue-700/70 px-2 text-[10px] text-blue-300 hover:bg-blue-950/60"
                >
                  変更
                </button>
                <button
                  type="button"
                  onClick={onRemoveImage}
                  className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-red-800/70 text-red-400 hover:bg-red-950/50"
                  aria-label="ウォーターマーク画像を削除"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2 rounded-lg border border-gray-700/70 bg-black/20 p-2">
                <div className="flex items-center justify-between text-[10px] font-semibold text-gray-300 md:text-xs">
                  <span>表示範囲</span>
                  <ResetButton
                    label="表示範囲"
                    onClick={() => onSetRange(0, rangeDefaultEnd, totalDuration)}
                  />
                </div>
                <NumericControl
                  id="watermark-start"
                  label="開始"
                  value={watermark.startTime}
                  defaultValue={0}
                  min={0}
                  max={timeSliderMax}
                  step={0.1}
                  suffix="秒"
                  onChange={(value) => onSetRange(value, watermark.endTime, totalDuration)}
                />
                <NumericControl
                  id="watermark-end"
                  label="終了"
                  value={watermark.endTime}
                  defaultValue={rangeDefaultEnd}
                  min={0}
                  max={timeSliderMax}
                  step={0.1}
                  suffix="秒"
                  onChange={(value) => onSetRange(watermark.startTime, value, totalDuration)}
                />
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] md:text-xs">
                  <span className="mr-0.5 text-gray-500">プレビュー位置を反映:</span>
                  <button
                    type="button"
                    disabled={previewMark >= watermark.endTime}
                    onClick={() => onSetRange(previewMark, watermark.endTime, totalDuration)}
                    className="flex min-h-9 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-gray-200 transition hover:border-green-500/60 hover:text-green-200 disabled:opacity-30"
                    title="現在位置を開始時間に設定"
                  >
                    <MapPin className="h-3.5 w-3.5" /> 開始
                  </button>
                  <button
                    type="button"
                    disabled={previewMark <= watermark.startTime}
                    onClick={() => onSetRange(watermark.startTime, previewMark, totalDuration)}
                    className="flex min-h-9 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-gray-200 transition hover:border-red-500/60 hover:text-red-200 disabled:opacity-30"
                    title="現在位置を終了時間に設定"
                  >
                    <MapPin className="h-3.5 w-3.5" /> 終了
                  </button>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-gray-700/70 bg-black/20 p-2">
                <p className="text-[10px] font-semibold text-gray-300 md:text-xs">位置・見た目</p>
                <NumericControl id="watermark-x" label="横位置" value={watermark.positionX} defaultValue={DEFAULT_WATERMARK_OVERLAY.positionX} min={WATERMARK_POSITION_MIN} max={WATERMARK_POSITION_MAX} step={1} suffix="%" onChange={(positionX) => onUpdate({ positionX })} />
                <NumericControl id="watermark-y" label="縦位置" value={watermark.positionY} defaultValue={DEFAULT_WATERMARK_OVERLAY.positionY} min={WATERMARK_POSITION_MIN} max={WATERMARK_POSITION_MAX} step={1} suffix="%" onChange={(positionY) => onUpdate({ positionY })} />
                <div className="space-y-1.5 border-b border-gray-700/50 pb-2">
                  <p className="text-[10px] text-gray-400 md:text-xs">簡単設定</p>
                  <div
                    className="grid grid-cols-3 gap-1.5 sm:grid-cols-5"
                    role="group"
                    aria-label="ウォーターマークの位置を簡単設定"
                  >
                    {POSITION_PRESETS.map((preset) => {
                      const resolved = resolvedPositionPresets.find(
                        (candidate) => candidate.value === preset.value,
                      );
                      const isSelected = Boolean(
                        resolved
                        && Math.abs(watermark.positionX - resolved.position.positionX) < 0.5
                        && Math.abs(watermark.positionY - resolved.position.positionY) < 0.5,
                      );
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          disabled={!resolved}
                          aria-pressed={isSelected}
                          onClick={() => resolved && onUpdate(resolved.position)}
                          className={`min-h-10 rounded-lg border px-2 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-wait disabled:opacity-35 md:text-xs ${
                            isSelected
                              ? 'border-blue-400 bg-blue-500/20 text-blue-100'
                              : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-blue-500/60 hover:text-white'
                          }`}
                          title={`${preset.label}へ、画像サイズを考慮して配置`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  {!currentNaturalSize && (
                    <p className="text-[9px] text-gray-500">画像サイズを確認しています…</p>
                  )}
                </div>
                <NumericControl id="watermark-size" label="拡大率" value={watermark.size} defaultValue={DEFAULT_WATERMARK_OVERLAY.size} min={WATERMARK_SIZE_MIN} max={WATERMARK_SIZE_MAX} step={0.05} suffix="倍" onChange={(size) => onUpdate({ size })} />
                <NumericControl
                  id="watermark-transparency"
                  label="透過度"
                  value={(1 - watermark.opacity) * 100}
                  defaultValue={0}
                  min={0}
                  max={100}
                  step={1}
                  suffix="%"
                  onChange={(transparency) => onUpdate({ opacity: 1 - transparency / 100 })}
                />
                <NumericControl id="watermark-rotation" label="回転" value={watermark.rotation} defaultValue={DEFAULT_WATERMARK_OVERLAY.rotation} min={WATERMARK_ROTATION_MIN} max={WATERMARK_ROTATION_MAX} step={1} suffix="°" onChange={(rotation) => onUpdate({ rotation })} />
              </div>

              <div className="space-y-2 rounded-lg border border-gray-700/70 bg-black/20 p-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-gray-300 md:text-xs">マスク</p>
                  <ResetButton
                    label="マスク形状"
                    onClick={() => onUpdate({ mask: DEFAULT_WATERMARK_OVERLAY.mask })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {MASK_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onUpdate({ mask: option.value })}
                      aria-pressed={watermark.mask === option.value}
                      className={`min-h-10 rounded-lg border text-[10px] transition md:text-xs ${
                        watermark.mask === option.value
                          ? 'border-blue-400 bg-blue-500/20 text-blue-200'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <NumericControl id="watermark-mask-size" label="マスクサイズ" value={watermark.maskSize} defaultValue={DEFAULT_WATERMARK_OVERLAY.maskSize} min={WATERMARK_MASK_SIZE_MIN} max={WATERMARK_MASK_SIZE_MAX} step={1} suffix="%" onChange={(maskSize) => onUpdate({ maskSize })} />
                <NumericControl id="watermark-feather" label="周辺ぼかし" value={watermark.feather} defaultValue={DEFAULT_WATERMARK_OVERLAY.feather} min={WATERMARK_FEATHER_MIN} max={WATERMARK_FEATHER_MAX} step={1} suffix="px" onChange={(feather) => onUpdate({ feather })} />
                <p className="text-[9px] leading-relaxed text-gray-500">
                  マスク範囲を小さくすると、画像の外周より内側で自然にぼかせます。
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

OverlaySection.displayName = 'OverlaySection';

export default OverlaySection;
