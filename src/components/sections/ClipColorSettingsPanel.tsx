/**
 * @file ClipColorSettingsPanel.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 「全体設定」アコーディオン内の「色合い 一括設定」パネル（standard 限定）。
 * 各動画・画像カードの個別色合い設定を保ったまま、作品全体の雰囲気（青み・緑み・ダーク・モノクロなど）を
 * 上から重ね掛けする。雰囲気プリセットのワンクリック適用＋強さ調整（0〜150%）と、5 本スライダーの微調整が連動する。
 */
import React, { useState } from 'react';
import { CircleSlash2, Contrast, Droplet, Palette, Sparkles, Sun, Thermometer } from 'lucide-react';
import type { MediaColorAdjust, MediaColorPresetId } from '../../types';
import SettingsAccordionHeader from '../common/SettingsAccordionHeader';
import NumericSliderField from '../common/NumericSliderField';
import { CompactFieldHeader } from '../common/CompactField';
import {
  MEDIA_COLOR_ADJUST_MAX,
  MEDIA_COLOR_ADJUST_MIN,
  MEDIA_COLOR_PRESETS,
  MEDIA_COLOR_PRESET_STRENGTH_MAX,
  MEDIA_COLOR_PRESET_STRENGTH_MIN,
  findMediaColorPreset,
  normalizeMediaColorAdjust,
  resolveMediaColorAdjust,
  type MediaColorAdjustKey,
} from '../../utils/mediaColor';

/** -100〜100・0〜150% の数値欄の幅（符号＋3 桁） */
const COLOR_INPUT_WIDTH_CHARS = 4;

interface AdjustRowDefinition {
  key: MediaColorAdjustKey;
  title: string;
  icon: React.ReactNode;
  trackClassName: string;
}

const ADJUST_ROWS: AdjustRowDefinition[] = [
  { key: 'brightness', title: '明るさ', icon: <Sun className="w-3 h-3" aria-hidden="true" />, trackClassName: 'color-grade-slider--brightness' },
  { key: 'contrast', title: 'コントラスト', icon: <Contrast className="w-3 h-3" aria-hidden="true" />, trackClassName: 'color-grade-slider--contrast' },
  { key: 'saturation', title: '彩度', icon: <Droplet className="w-3 h-3" aria-hidden="true" />, trackClassName: 'color-grade-slider--saturation' },
  { key: 'temperature', title: '色温度', icon: <Thermometer className="w-3 h-3" aria-hidden="true" />, trackClassName: 'color-grade-slider--temperature' },
  { key: 'tint', title: '色かぶり', icon: <Palette className="w-3 h-3" aria-hidden="true" />, trackClassName: 'color-grade-slider--tint' },
];

const STRENGTH_QUICK_OPTIONS: readonly { label: string; value: number }[] = [
  { label: '弱', value: 50 },
  { label: '標準', value: 100 },
  { label: '強', value: 140 },
];

const sliderClass = (trackClassName: string) =>
  `color-grade-slider ${trackClassName} flex-1 min-w-0 h-5 appearance-none bg-transparent disabled:opacity-50`;

export interface ClipColorSettingsPanelProps {
  isLocked: boolean;
  enabled: boolean;
  adjust: MediaColorAdjust | undefined;
  activePresetId: MediaColorPresetId | null;
  presetStrength: number;
  onToggleEnabled: (enabled: boolean) => void;
  onUpdateAdjust: (patch: Partial<MediaColorAdjust>) => void;
  onApplyPreset: (presetId: MediaColorPresetId) => void;
  onChangePresetStrength: (strength: number) => void;
  onReset: () => void;
  accordionId?: string;
}

const ClipColorSettingsPanel: React.FC<ClipColorSettingsPanelProps> = ({
  isLocked,
  enabled,
  adjust,
  activePresetId,
  presetStrength,
  onToggleEnabled,
  onUpdateAdjust,
  onApplyPreset,
  onChangePresetStrength,
  onReset,
  accordionId = 'bulk-color-settings-video',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const resolvedAdjust = resolveMediaColorAdjust(adjust);
  const hasAdjustValues = Boolean(normalizeMediaColorAdjust(adjust));
  const isEffectiveActive = enabled && hasAdjustValues;
  const activePreset = enabled ? findMediaColorPreset(activePresetId) : null;
  const isNaturalSelected = !isEffectiveActive && !hasAdjustValues;
  const canReset = enabled || hasAdjustValues || activePresetId !== null;

  return (
    <div
      className="min-w-0 rounded-lg border border-gray-700/70 bg-gray-900/30"
      data-testid="clip-bulk-color-settings"
    >
      <SettingsAccordionHeader
        title={isEffectiveActive ? '色合い 一括設定（適用中）' : '色合い 一括設定'}
        isOpen={isOpen}
        disabled={isLocked}
        controlsId={accordionId}
        onToggle={() => setIsOpen((open) => !open)}
      />
      {isOpen && (
        <div
          id={accordionId}
          className="space-y-2.5 border-t border-gray-700/60 px-2 pb-2.5 pt-2"
        >
          {/* 有効/無効トグル（値を残したまま元映像と見比べられる） */}
          <div className="space-y-1 rounded-lg border border-gray-700/60 bg-black/20 p-2">
            <label
              className={`flex items-center gap-1.5 text-[10px] text-gray-200 md:text-xs ${isLocked ? 'opacity-50' : 'cursor-pointer'}`}
            >
              <input
                type="checkbox"
                checked={enabled}
                disabled={isLocked}
                onChange={(event) => onToggleEnabled(event.target.checked)}
                className="h-3.5 w-3.5 rounded accent-blue-500"
                aria-label="全体の色合いを適用する"
              />
              <span className="font-medium">全体の色合いを適用する</span>
            </label>
            <p className="text-[10px] leading-relaxed text-gray-400 md:text-xs">
              各素材の個別設定の上から、全体の雰囲気を重ね掛けします（字幕・タイトル・透かしには掛かりません）。
            </p>
            {!enabled && hasAdjustValues && (
              <p className="text-[10px] leading-relaxed text-blue-300/90 md:text-xs">
                一時オフ中です。スライダーやプリセットを操作すると自動で適用されます。
              </p>
            )}
          </div>

          {/* 雰囲気プリセット（ワンクリックで下の 5 本スライダーへ反映。先頭の「ナチュラル」で即座に元へ戻せる） */}
          <div className="space-y-1.5 rounded-lg border border-gray-700/60 bg-gray-900/40 p-2">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-200 md:text-xs">
              <Sparkles className="h-3 w-3 shrink-0 text-blue-300/90" aria-hidden="true" />
              <span>雰囲気プリセット</span>
            </div>
            <button
              type="button"
              disabled={isLocked}
              aria-pressed={isNaturalSelected}
              title="全体の色合いを解除し、元の色（標準）に戻します"
              onClick={onReset}
              className={`flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 disabled:pointer-events-none disabled:opacity-40 ${
                isNaturalSelected
                  ? 'border-blue-400/75 bg-blue-500/20 text-blue-100'
                  : 'border-gray-700 bg-gray-800/80 text-gray-200 hover:border-gray-500 hover:bg-gray-700/80'
              }`}
            >
              <CircleSlash2 className="h-3.5 w-3.5 shrink-0 text-gray-300" aria-hidden="true" />
              <span>ナチュラル（元の色・補正なし）</span>
            </button>
            <div
              className="grid grid-cols-3 gap-1.5"
              role="group"
              aria-label="雰囲気プリセット"
            >
              {MEDIA_COLOR_PRESETS.map((preset) => {
                const isSelected = enabled && activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={isLocked}
                    aria-pressed={isSelected}
                    title={preset.description}
                    onClick={() => onApplyPreset(preset.id)}
                    className={`flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-lg border px-1.5 py-1 text-[11px] font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 disabled:pointer-events-none disabled:opacity-40 sm:text-xs ${
                      isSelected
                        ? 'border-blue-400/75 bg-blue-500/20 text-blue-100'
                        : 'border-gray-700 bg-gray-800/80 text-gray-200 hover:border-gray-500 hover:bg-gray-700/80'
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/30"
                      style={{ backgroundColor: preset.swatch }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{preset.label}</span>
                  </button>
                );
              })}
            </div>

            {/* プリセット選択中だけ強さ調整を出し、下の 5 本スライダーを連動して動かす */}
            {activePreset && (
              <div
                className="space-y-1.5 border-t border-gray-700/60 pt-2"
                data-testid="clip-bulk-color-preset-strength"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-[10px] font-medium text-gray-300 md:text-xs">
                    「{activePreset.label}」の強さ
                  </span>
                  <div className="flex items-center gap-1" role="group" aria-label="プリセットの強さ目安">
                    {STRENGTH_QUICK_OPTIONS.map((opt) => {
                      const isCurrent = Math.abs(presetStrength - opt.value) <= 2;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={isLocked}
                          aria-pressed={isCurrent}
                          onClick={() => onChangePresetStrength(opt.value)}
                          className={`min-h-7 rounded-md border px-2 text-[10px] font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 disabled:opacity-40 ${
                            isCurrent
                              ? 'border-blue-400/70 bg-blue-500/20 text-blue-100'
                              : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <NumericSliderField
                  ariaLabel="プリセットの強さ"
                  min={MEDIA_COLOR_PRESET_STRENGTH_MIN}
                  max={MEDIA_COLOR_PRESET_STRENGTH_MAX}
                  step={5}
                  stepperStep={10}
                  value={presetStrength}
                  onChange={onChangePresetStrength}
                  disabled={isLocked}
                  unit="%"
                  inputWidthChars={COLOR_INPUT_WIDTH_CHARS}
                  sliderClassName={sliderClass('color-grade-slider--strength')}
                />
                <p className="text-[10px] leading-snug text-gray-400 md:text-xs">
                  強さを変えると下のスライダーも連動します。細かい調整は下のスライダーから行えます。
                </p>
              </div>
            )}
          </div>

          {/* 全体の色合い 5 本スライダー（プリセット連動＋手動微調整） */}
          <div className="space-y-1">
            {ADJUST_ROWS.map((row) => (
              <div key={row.key} className="flex flex-col">
                <CompactFieldHeader
                  icon={row.icon}
                  title={row.title}
                  onReset={() => onUpdateAdjust({ [row.key]: 0 })}
                  resetDisabled={isLocked || resolvedAdjust[row.key] === 0}
                  resetLabel={`全体の${row.title}をリセット`}
                  resetTitle="0へ戻す"
                />
                <NumericSliderField
                  ariaLabel={`全体の${row.title}`}
                  min={MEDIA_COLOR_ADJUST_MIN}
                  max={MEDIA_COLOR_ADJUST_MAX}
                  step={1}
                  value={resolvedAdjust[row.key]}
                  onChange={(value) => onUpdateAdjust({ [row.key]: value })}
                  disabled={isLocked}
                  inputWidthChars={COLOR_INPUT_WIDTH_CHARS}
                  sliderClassName={sliderClass(row.trackClassName)}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onReset}
              disabled={isLocked || !canReset}
              title="全体の色合い設定だけをすべて0に戻します（各素材の個別設定は残ります）"
              className="rounded px-1 py-0.5 text-[10px] text-gray-400 underline-offset-2 transition-colors motion-reduce:transition-none hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 disabled:opacity-40 md:text-xs"
            >
              全体の色合いを元に戻す
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ClipColorSettingsPanel);
