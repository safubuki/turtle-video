/**
 * @file OverlaySection.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 動画・画像セクション内でロゴ表示を設定する。
 * 「ウォーターマーク」（クリップに重ねる・Issue #210）と
 * 「エンドロール」（クリップの後に続けてタイムラインを延長する）をタブで切り替える。
 * スライダー等の操作 UI は両者で共有し、書き込み先だけをタブで切り替える。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, MapPin, RotateCcw, Trash2 } from 'lucide-react';
import type {
  EndrollBackgroundMode,
  EndrollOverlay,
  WatermarkMask,
  WatermarkOverlay,
  WatermarkScope,
} from '../../types';
import {
  DEFAULT_ENDROLL_OVERLAY,
  ENDROLL_DURATION_MAX_SEC,
  ENDROLL_DURATION_MIN_SEC,
} from '../../utils/endrollOverlay';
import {
  DEFAULT_WATERMARK_OVERLAY,
  resolveWatermarkPresetPosition,
  WATERMARK_FEATHER_MAX,
  WATERMARK_FEATHER_MIN,
  WATERMARK_MASK_SIZE_MAX,
  WATERMARK_MASK_SIZE_MIN,
  WATERMARK_ROTATION_MAX,
  WATERMARK_ROTATION_MIN,
  WATERMARK_SIZE_MAX,
  WATERMARK_SIZE_MIN,
  type WatermarkPositionPreset,
} from '../../utils/watermarkOverlay';
import SettingsAccordionHeader from '../common/SettingsAccordionHeader';
import {
  CENTER_ORIGIN_MAX,
  CENTER_ORIGIN_MIN,
  fromTopLeftPercent,
  roundCenterOrigin,
  toTopLeftPercent,
} from '../../utils/centerOriginPosition';
import { SwipeProtectedSlider } from '../SwipeProtectedSlider';
import NumericStepperInput from '../common/NumericStepperInput';
import CaptionColorField from '../common/CaptionColorField';

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
    // 3 列目は −/+ と数値欄が並ぶため、幅を auto にして詰まらないようにする
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[5.75rem_minmax(0,1fr)_auto]">
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
      {/* スマホでスライダーを目的の値へ合わせにくいため、数値欄に −/+ を添える */}
      <NumericStepperInput
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        decimals={decimals}
        unit={suffix}
        ariaLabel={`ウォーターマークの${label}`}
        inputId={id}
        inputClassName="w-12 sm:w-14 focus:border-blue-500 font-semibold text-white"
      />
    </div>
  );
});
NumericControl.displayName = 'NumericControl';

interface OverlaySectionProps {
  watermark: WatermarkOverlay;
  /** クリップ後に続くエンドロール。画像・設定はウォーターマークと独立 */
  endroll: EndrollOverlay;
  /** 出力全体の長さ（クリップ + エンドロール） */
  totalDuration: number;
  /** クリップだけの長さ。ウォーターマークの表示範囲はこちらが上限 */
  clipsDuration: number;
  currentTime: number;
  canvasWidth: number;
  canvasHeight: number;
  /** BGM が 1 つも無いとき true。エンドロールの BGM フェード設定を無効化する */
  hasNoBgm: boolean;
  onImageSelect: (file: File) => void;
  onUpdate: (updates: Partial<WatermarkOverlay>) => void;
  onSetRange: (startTime: number, endTime: number, totalDuration?: number) => void;
  onRemoveImage: () => void;
  onEndrollImageSelect: (file: File) => void;
  onEndrollUpdate: (updates: Partial<EndrollOverlay>) => void;
  onEndrollRemoveImage: () => void;
}

/** どちらのロゴを設定しているか */
type LogoTab = 'watermark' | 'endroll';

const WATERMARK_SCOPE_OPTIONS: { value: WatermarkScope; label: string }[] = [
  { value: 'main', label: '本編のみ' },
  { value: 'full', label: '全編（エンドロール含む）' },
];

const BACKGROUND_OPTIONS: { value: EndrollBackgroundMode; label: string }[] = [
  { value: 'black', label: '黒' },
  { value: 'white', label: '白' },
  { value: 'custom', label: 'カスタム' },
];

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
  endroll,
  totalDuration,
  clipsDuration,
  currentTime,
  canvasWidth,
  canvasHeight,
  hasNoBgm,
  onImageSelect,
  onUpdate,
  onSetRange,
  onRemoveImage,
  onEndrollImageSelect,
  onEndrollUpdate,
  onEndrollRemoveImage,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<LogoTab>('watermark');
  const [naturalSize, setNaturalSize] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousUrlRef = useRef<string | null>(watermark.url);
  const previousEndrollUrlRef = useRef<string | null>(endroll.url);
  const isEndrollTab = tab === 'endroll';

  /**
   * 現在のタブが指すロゴ設定。位置・サイズ・マスク・フェードの共有 UI は
   * この値を読み、`updateActive` へ書き戻す（操作 UI は 1 セットだけ持つ）。
   */
  const active = isEndrollTab ? endroll : watermark;
  const updateActive = isEndrollTab ? onEndrollUpdate : onUpdate;
  const activeDefaults = isEndrollTab ? DEFAULT_ENDROLL_OVERLAY : DEFAULT_WATERMARK_OVERLAY;
  const activeLabel = isEndrollTab ? 'エンドロール' : 'ウォーターマーク';
  const controlPrefix = isEndrollTab ? 'endroll' : 'watermark';

  // ウォーターマークの表示範囲の上限は scope で決まる。
  // - main（既定）: 本編のみ = クリップ尺まで
  // - full: エンドロールを含む全編 = totalDuration まで
  // エンドロール未設定なら両者は同値なので、従来と挙動は変わらない。
  const watermarkRangeLimit = watermark.scope === 'full' ? totalDuration : clipsDuration;
  const rangeDefaultEnd = watermarkRangeLimit > 0
    ? watermarkRangeLimit
    : DEFAULT_WATERMARK_OVERLAY.endTime;
  const timeSliderMax = Math.max(rangeDefaultEnd, watermark.endTime);
  const previewMark = Math.round(currentTime * 10) / 10;
  const currentNaturalSize = naturalSize?.url === active.url ? naturalSize : null;
  const resolvedPositionPresets = useMemo(
    () => currentNaturalSize
      ? POSITION_PRESETS.map((preset) => ({
        ...preset,
        position: resolveWatermarkPresetPosition({
          // プリセット計算は位置・サイズ・マスクだけを見るため、
          // 共通スタイルを満たすエンドロールにもそのまま使える。
          overlay: active as WatermarkOverlay,
          preset: preset.value,
          imageNaturalWidth: currentNaturalSize.width,
          imageNaturalHeight: currentNaturalSize.height,
          canvasWidth,
          canvasHeight,
        }),
      }))
      : [],
    [active, canvasHeight, canvasWidth, currentNaturalSize],
  );

  useEffect(() => {
    if (watermark.url && watermark.url !== previousUrlRef.current) {
      setIsOpen(true);
      setTab('watermark');
    }
    previousUrlRef.current = watermark.url;
  }, [watermark.url]);

  useEffect(() => {
    if (endroll.url && endroll.url !== previousEndrollUrlRef.current) {
      setIsOpen(true);
      setTab('endroll');
    }
    previousEndrollUrlRef.current = endroll.url;
  }, [endroll.url]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    // タブに応じて書き込み先を切り替える（画像はそれぞれ別に保持する）
    if (isEndrollTab) onEndrollImageSelect(file);
    else onImageSelect(file);
  };

  const renderTabButton = (value: LogoTab, label: string, overlayUrl: string | null) => {
    const isSelected = tab === value;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={isSelected}
        onClick={() => setTab(value)}
        className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-2 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 md:text-xs ${
          isSelected
            ? 'border-blue-400 bg-blue-500/20 text-blue-100'
            : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600 hover:text-gray-200'
        }`}
      >
        {/* 設定状態が一目で分かるように、未設定は「指定なし」・設定済はサムネイル */}
        {overlayUrl ? (
          <img
            src={overlayUrl}
            alt=""
            className="h-6 w-6 shrink-0 rounded bg-black/40 object-contain"
          />
        ) : (
          <span className="shrink-0 rounded bg-gray-900/70 px-1 py-0.5 text-[9px] text-gray-500">
            指定なし
          </span>
        )}
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <div className="rounded-lg border border-gray-700/70 bg-gray-900/30">
      <SettingsAccordionHeader
        title="ロゴ表示"
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

          {/* どちらを設定中かをタブで切り替える。操作 UI は共通で、書き込み先だけが変わる */}
          <div className="flex gap-2" role="tablist" aria-label="ロゴ表示の種類">
            {renderTabButton('watermark', 'ウォーターマーク', watermark.url)}
            {renderTabButton('endroll', 'エンドロール', endroll.url)}
          </div>
          <p className="text-[9px] leading-relaxed text-gray-500">
            {isEndrollTab
              ? '動画の再生が終わった後に、単色背景でロゴを表示します。設定した長さだけ動画が長くなります。'
              : '再生中の映像にロゴを重ねて表示します。動画の長さは変わりません。'}
          </p>

          {!active.url ? (
            <div className="rounded-lg border border-dashed border-gray-700 bg-black/20 px-3 py-4 text-center">
              <p className="text-xs font-semibold text-gray-200">
                {isEndrollTab ? '動画の最後にロゴを表示' : 'ロゴ画像を重ねる'}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-gray-500">
                {isEndrollTab
                  ? 'PNG・JPEG・WebP。設定すると、その長さのぶん動画が長くなります。'
                  : 'PNG・JPEG・WebP。必要なときだけ追加でき、カードをまたいで表示できます。'}
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
                    src={active.url}
                    alt=""
                    data-testid="logo-preview"
                    className="max-h-full max-w-full object-contain"
                    onLoad={(event) => {
                      setNaturalSize({
                        url: active.url as string,
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      });
                    }}
                  />
                </div>
                <div className="min-w-24 flex-1">
                  <p className="truncate text-xs font-semibold text-gray-100">
                    {active.file?.name ?? `${activeLabel}画像`}
                  </p>
                  <p className="mt-1 text-[9px] text-gray-500">
                    {isEndrollTab
                      ? '非表示にすると動画は長くなりません（画像と設定は保持）。'
                      : '非表示でも画像と設定は保持されます。'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updateActive({ enabled: !active.enabled })}
                  className={`flex min-h-10 items-center gap-1 rounded-lg border px-2 text-[10px] transition ${
                    active.enabled
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                      : 'border-gray-600 bg-gray-800 text-gray-400'
                  }`}
                  aria-label={active.enabled ? `${activeLabel}を非表示にする` : `${activeLabel}を表示する`}
                >
                  {active.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {active.enabled ? '表示中' : '非表示'}
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
                  onClick={isEndrollTab ? onEndrollRemoveImage : onRemoveImage}
                  className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-red-800/70 text-red-400 hover:bg-red-950/50"
                  aria-label={`${activeLabel}画像を削除`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {isEndrollTab ? (
                /* エンドロール固有の設定（長さ・背景色・BGM フェード） */
                <div className="space-y-2 rounded-lg border border-gray-700/70 bg-black/20 p-2">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-gray-300 md:text-xs">
                    <span>エンドロール設定</span>
                    <ResetButton
                      label="エンドロールの長さ"
                      onClick={() => onEndrollUpdate({
                        durationSec: DEFAULT_ENDROLL_OVERLAY.durationSec,
                      })}
                    />
                  </div>
                  <NumericControl
                    id="endroll-duration"
                    label="長さ"
                    value={endroll.durationSec}
                    defaultValue={DEFAULT_ENDROLL_OVERLAY.durationSec}
                    min={ENDROLL_DURATION_MIN_SEC}
                    max={ENDROLL_DURATION_MAX_SEC}
                    step={0.5}
                    suffix="秒"
                    onChange={(durationSec) => onEndrollUpdate({ durationSec })}
                  />
                  <p className="text-[9px] leading-relaxed text-amber-300/80">
                    {endroll.enabled
                      ? `動画は ${clipsDuration.toFixed(1)} 秒 + ${endroll.durationSec.toFixed(1)} 秒 = ${totalDuration.toFixed(1)} 秒になります。`
                      : '「非表示」の間は動画の長さは変わりません。'}
                  </p>

                  <div className="space-y-1.5 border-t border-gray-700/50 pt-2">
                    <p className="text-[10px] text-gray-400 md:text-xs">背景色</p>
                    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="エンドロールの背景色">
                      {BACKGROUND_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onEndrollUpdate({ backgroundMode: option.value })}
                          aria-pressed={endroll.backgroundMode === option.value}
                          className={`min-h-10 rounded-lg border text-[10px] transition md:text-xs ${
                            endroll.backgroundMode === option.value
                              ? 'border-blue-400 bg-blue-500/20 text-blue-200'
                              : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {endroll.backgroundMode === 'custom' && (
                      <div className="pt-1">
                        <CaptionColorField
                          label="カスタム色"
                          value={endroll.backgroundColor}
                          fallback="#000000"
                          idPrefix="endroll-background"
                          ariaLabelPrefix="エンドロール背景"
                          onChange={(backgroundColor) => onEndrollUpdate({ backgroundColor })}
                        />
                      </div>
                    )}
                  </div>

                  <div className="border-t border-gray-700/50 pt-2">
                    <label
                      className={`flex items-center gap-2 text-[10px] md:text-xs ${
                        hasNoBgm ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={endroll.bgmFadeOut && !hasNoBgm}
                        disabled={hasNoBgm}
                        onChange={(event) => onEndrollUpdate({ bgmFadeOut: event.target.checked })}
                        className="rounded accent-blue-500 disabled:cursor-not-allowed"
                      />
                      <span>エンドロール中に BGM を徐々に消す</span>
                    </label>
                    <p className="mt-1 text-[9px] leading-relaxed text-gray-500">
                      {hasNoBgm
                        ? 'BGM が設定されていないため使用できません。'
                        : 'エンドロールの長さをかけて音量を 0 まで下げます。'}
                    </p>
                  </div>
                </div>
              ) : (
              <div className="space-y-2 rounded-lg border border-gray-700/70 bg-black/20 p-2">
                <div className="flex items-center justify-between text-[10px] font-semibold text-gray-300 md:text-xs">
                  <span>表示する時間</span>
                  <ResetButton
                    label="表示する時間"
                    onClick={() => onSetRange(0, rangeDefaultEnd, watermarkRangeLimit)}
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
                  onChange={(value) => onSetRange(value, watermark.endTime, watermarkRangeLimit)}
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
                  onChange={(value) => onSetRange(watermark.startTime, value, watermarkRangeLimit)}
                />
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] md:text-xs">
                  <span className="mr-0.5 text-gray-500">プレビュー位置を反映:</span>
                  <button
                    type="button"
                    disabled={previewMark >= watermark.endTime}
                    onClick={() => onSetRange(previewMark, watermark.endTime, watermarkRangeLimit)}
                    className="flex min-h-9 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-gray-200 transition hover:border-green-500/60 hover:text-green-200 disabled:opacity-30"
                    title="現在位置を開始時間に設定"
                  >
                    <MapPin className="h-3.5 w-3.5" /> 開始
                  </button>
                  <button
                    type="button"
                    disabled={previewMark <= watermark.startTime}
                    onClick={() => onSetRange(watermark.startTime, previewMark, watermarkRangeLimit)}
                    className="flex min-h-9 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-gray-200 transition hover:border-red-500/60 hover:text-red-200 disabled:opacity-30"
                    title="現在位置を終了時間に設定"
                  >
                    <MapPin className="h-3.5 w-3.5" /> 終了
                  </button>
                </div>

                {/* 表示できる範囲を本編までにするか、エンドロールまで伸ばすか */}
                <div className="space-y-1.5 border-t border-gray-700/50 pt-2">
                  <p className="text-[10px] text-gray-400 md:text-xs">表示する区間</p>
                  <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="ウォーターマークを表示する区間">
                    {WATERMARK_SCOPE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          if (watermark.scope === option.value) return;
                          const nextLimit = option.value === 'full' ? totalDuration : clipsDuration;
                          onUpdate({ scope: option.value });
                          // 全編へ切り替えたら終了を末尾まで伸ばす。本編へ戻すときは
                          // はみ出した範囲をクリップ尺へ収める。
                          onSetRange(
                            watermark.startTime,
                            option.value === 'full' ? nextLimit : Math.min(watermark.endTime, nextLimit),
                            nextLimit,
                          );
                        }}
                        aria-pressed={watermark.scope === option.value}
                        className={`min-h-10 rounded-lg border px-2 text-[10px] transition md:text-xs ${
                          watermark.scope === option.value
                            ? 'border-blue-400 bg-blue-500/20 text-blue-200'
                            : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] leading-relaxed text-gray-500">
                    {watermark.scope === 'full'
                      ? 'エンドロールにもロゴを重ねます。'
                      : '動画本編にだけロゴを表示します（エンドロールには出しません）。'}
                  </p>
                </div>
              </div>
              )}

              <div className="space-y-2 rounded-lg border border-gray-700/70 bg-black/20 p-2">
                <p className="text-[10px] font-semibold text-gray-300 md:text-xs">位置・見た目</p>
                {/* 位置は「中央原点・上が＋」の共通座標系で操作する（動画・画像・字幕と同一）。
                    保存値は従来どおり左上原点 0〜100% のまま。centerOriginPosition.ts で変換する。 */}
                <NumericControl
                  id={`${controlPrefix}-x`}
                  label="横 (右+)"
                  value={roundCenterOrigin(fromTopLeftPercent(active.positionX, 'x'))}
                  defaultValue={roundCenterOrigin(fromTopLeftPercent(activeDefaults.positionX, 'x'))}
                  min={CENTER_ORIGIN_MIN}
                  max={CENTER_ORIGIN_MAX}
                  step={1}
                  suffix="%"
                  onChange={(shown) => updateActive({ positionX: toTopLeftPercent(shown, 'x') })}
                />
                <NumericControl
                  id={`${controlPrefix}-y`}
                  label="縦 (上+)"
                  value={roundCenterOrigin(fromTopLeftPercent(active.positionY, 'y'))}
                  defaultValue={roundCenterOrigin(fromTopLeftPercent(activeDefaults.positionY, 'y'))}
                  min={CENTER_ORIGIN_MIN}
                  max={CENTER_ORIGIN_MAX}
                  step={1}
                  suffix="%"
                  onChange={(shown) => updateActive({ positionY: toTopLeftPercent(shown, 'y') })}
                />
                <div className="space-y-1.5 border-b border-gray-700/50 pb-2">
                  <p className="text-[10px] text-gray-400 md:text-xs">簡単設定</p>
                  <div
                    className="grid grid-cols-3 gap-1.5 sm:grid-cols-5"
                    role="group"
                    aria-label={`${activeLabel}の位置を簡単設定`}
                  >
                    {POSITION_PRESETS.map((preset) => {
                      const resolved = resolvedPositionPresets.find(
                        (candidate) => candidate.value === preset.value,
                      );
                      const isSelected = Boolean(
                        resolved
                        && Math.abs(active.positionX - resolved.position.positionX) < 0.5
                        && Math.abs(active.positionY - resolved.position.positionY) < 0.5,
                      );
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          disabled={!resolved}
                          aria-pressed={isSelected}
                          onClick={() => resolved && updateActive(resolved.position)}
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
                <NumericControl id={`${controlPrefix}-size`} label="拡大率" value={active.size} defaultValue={activeDefaults.size} min={WATERMARK_SIZE_MIN} max={WATERMARK_SIZE_MAX} step={0.05} suffix="倍" onChange={(size) => updateActive({ size })} />
                <NumericControl
                  id={`${controlPrefix}-transparency`}
                  label="透過度"
                  value={(1 - active.opacity) * 100}
                  defaultValue={0}
                  min={0}
                  max={100}
                  step={1}
                  suffix="%"
                  onChange={(transparency) => updateActive({ opacity: 1 - transparency / 100 })}
                />
                <NumericControl id={`${controlPrefix}-rotation`} label="回転" value={active.rotation} defaultValue={activeDefaults.rotation} min={WATERMARK_ROTATION_MIN} max={WATERMARK_ROTATION_MAX} step={1} suffix="°" onChange={(rotation) => updateActive({ rotation })} />
              </div>

              <div className="space-y-2 rounded-lg border border-gray-700/70 bg-black/20 p-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-gray-300 md:text-xs">マスク</p>
                  <ResetButton
                    label="マスク形状"
                    onClick={() => updateActive({ mask: activeDefaults.mask })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {MASK_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateActive({ mask: option.value })}
                      aria-pressed={active.mask === option.value}
                      className={`min-h-10 rounded-lg border text-[10px] transition md:text-xs ${
                        active.mask === option.value
                          ? 'border-blue-400 bg-blue-500/20 text-blue-200'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <NumericControl id={`${controlPrefix}-mask-size`} label="マスクサイズ" value={active.maskSize} defaultValue={activeDefaults.maskSize} min={WATERMARK_MASK_SIZE_MIN} max={WATERMARK_MASK_SIZE_MAX} step={1} suffix="%" onChange={(maskSize) => updateActive({ maskSize })} />
                <NumericControl id={`${controlPrefix}-feather`} label="周辺ぼかし" value={active.feather} defaultValue={activeDefaults.feather} min={WATERMARK_FEATHER_MIN} max={WATERMARK_FEATHER_MAX} step={1} suffix="px" onChange={(feather) => updateActive({ feather })} />
                <p className="text-[9px] leading-relaxed text-gray-500">
                  マスク範囲を小さくすると、画像の外周より内側で自然にぼかせます。
                </p>
              </div>

              {/* フェード（動画・画像クリップと同じ 0.5 / 1 / 2 秒ステップ） */}
              <div className="space-y-2 rounded-lg border border-gray-700/70 bg-black/20 p-2">
                <p className="text-[10px] font-semibold text-gray-300 md:text-xs">フェード</p>
                <div className="flex flex-col gap-2 text-[10px] md:text-xs">
                  <div className="flex items-center gap-2">
                    <label className="flex w-24 cursor-pointer items-center justify-start gap-1">
                      <input
                        type="checkbox"
                        checked={active.fadeIn}
                        onChange={(e) => updateActive({ fadeIn: e.target.checked })}
                        className="cursor-pointer rounded accent-blue-500"
                      />
                      <span className="whitespace-nowrap">フェードイン</span>
                    </label>
                    <SwipeProtectedSlider
                      min={0}
                      max={2}
                      step={1}
                      value={
                        active.fadeInDuration === 0.5
                          ? 0
                          : active.fadeInDuration === 1.0
                            ? 1
                            : 2
                      }
                      onChange={(val) => {
                        const steps = [0.5, 1.0, 2.0];
                        updateActive({ fadeInDuration: steps[val] });
                      }}
                      disabled={!active.fadeIn}
                      ariaLabel={`${activeLabel}のフェードイン時間`}
                      className={`h-1 flex-1 appearance-none rounded bg-gray-600 accent-blue-500 disabled:cursor-default disabled:bg-gray-800 disabled:accent-gray-700 disabled:opacity-50 ${active.fadeIn ? 'cursor-pointer' : ''}`}
                    />
                    <span
                      className={`w-8 whitespace-nowrap text-right ${active.fadeIn ? 'text-gray-400' : 'text-gray-600'}`}
                    >
                      {active.fadeInDuration}秒
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex w-24 cursor-pointer items-center justify-start gap-1">
                      <input
                        type="checkbox"
                        checked={active.fadeOut}
                        onChange={(e) => updateActive({ fadeOut: e.target.checked })}
                        className="cursor-pointer rounded accent-blue-500"
                      />
                      <span className="whitespace-nowrap">フェードアウト</span>
                    </label>
                    <SwipeProtectedSlider
                      min={0}
                      max={2}
                      step={1}
                      value={
                        active.fadeOutDuration === 0.5
                          ? 0
                          : active.fadeOutDuration === 1.0
                            ? 1
                            : 2
                      }
                      onChange={(val) => {
                        const steps = [0.5, 1.0, 2.0];
                        updateActive({ fadeOutDuration: steps[val] });
                      }}
                      disabled={!active.fadeOut}
                      ariaLabel={`${activeLabel}のフェードアウト時間`}
                      className={`h-1 flex-1 appearance-none rounded bg-gray-600 accent-blue-500 disabled:cursor-default disabled:bg-gray-800 disabled:accent-gray-700 disabled:opacity-50 ${active.fadeOut ? 'cursor-pointer' : ''}`}
                    />
                    <span
                      className={`w-8 whitespace-nowrap text-right ${active.fadeOut ? 'text-gray-400' : 'text-gray-600'}`}
                    >
                      {active.fadeOutDuration}秒
                    </span>
                  </div>
                </div>
                <p className="text-[9px] leading-relaxed text-gray-500">
                  {isEndrollTab
                    ? 'エンドロールの開始・終了に合わせてロゴがフェードします。'
                    : '表示する時間の開始・終了に合わせて、動画と同じようにフェードします。'}
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
