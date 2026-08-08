/**
 * @file VideoTitleSettingsPanel.tsx
 * @author Turtle Village
 * @description 動画タイトル設定（Issue #211）のアコーディオン UI。
 *
 * 通常キャプションとは別管理の 1 件だけの設定で、キャプションカテゴリの先頭付近に置く。
 * 毎回使う機能ではないため初期状態は閉じておき、開いてから設定する。
 * 既定は「中央・通常キャプションより大きめ」で、表示時間・見た目を個別に調整できる。
 *
 * 構成（既存 UI との統一を優先）:
 *   タイトル文字 → 開始/終了（スライダー+数値）→ プレビュー位置を反映
 *   → スタイル設定（アコーディオン: サイズ/字体/位置/縁・色/背景の帯）→ フェード → リセット
 * 時間まわりの操作感は `CaptionItem` と揃える（スライダー + 数値 + MapPin ボタン）。
 */
import React, { useState } from 'react';
import { Heading, MapPin, RotateCcw, Type } from 'lucide-react';
import type { CaptionPosition, VideoTitleSettings } from '../../types';
import SettingsAccordionHeader from '../common/SettingsAccordionHeader';
import CaptionColorField from '../common/CaptionColorField';
import CaptionFontSizeField from '../common/CaptionFontSizeField';
import CaptionFontStyleField from '../common/CaptionFontStyleField';
import { SwipeProtectedSlider } from '../SwipeProtectedSlider';
import type {
  getAvailableDropdownFontOptions,
  getAvailablePinnedFontOptions,
} from '../../utils/captionFontCatalog';
import {
  CAPTION_BLUR_MAX,
  CAPTION_BLUR_MIN,
  clampPositionPercent,
} from '../../utils/captionStyle';
import {
  VIDEO_TITLE_BACKGROUND_OPACITY_MAX,
  VIDEO_TITLE_BACKGROUND_OPACITY_MIN,
  VIDEO_TITLE_BACKGROUND_OPACITY_STEP,
  VIDEO_TITLE_BACKGROUND_RADIUS_MAX,
  VIDEO_TITLE_BACKGROUND_RADIUS_MIN,
  VIDEO_TITLE_BACKGROUND_RADIUS_STEP,
  VIDEO_TITLE_MIN_DURATION_SEC,
  VIDEO_TITLE_STROKE_WIDTH_MAX,
  VIDEO_TITLE_STROKE_WIDTH_MIN,
  VIDEO_TITLE_STROKE_WIDTH_STEP,
  clampVideoTitleBackgroundOpacity,
  clampVideoTitleBackgroundRadius,
  clampVideoTitleBlur,
  clampVideoTitleStrokeWidth,
} from '../../utils/videoTitle';

/** 位置カスタムを開始するときの既定 XY（%）。中央 */
const TITLE_POSITION_CUSTOM_DEFAULT = { x: 50, y: 50 };

interface VideoTitleSettingsPanelProps {
  title: VideoTitleSettings;
  isLocked: boolean;
  totalDuration: number;
  /** プレビューの現在位置（「プレビュー位置を反映」用） */
  currentTime: number;
  /** 拡張フォント選択肢を出すか（standard フレーバー限定） */
  supportsExtendedFonts: boolean;
  /** 固定表示する字体（キャプションと共有） */
  pinnedFontOptions: ReturnType<typeof getAvailablePinnedFontOptions>;
  /** 「その他▾」に並べる字体（キャプションと共有） */
  dropdownFontOptions: ReturnType<typeof getAvailableDropdownFontOptions>;
  /** 読み込み済みの端末フォント（キャプションと共有） */
  localFontFamilies: string[];
  localFontsLoading: boolean;
  onLoadLocalFonts: () => void;
  onUpdate: (updates: Partial<VideoTitleSettings>) => void;
  onSetRange: (startTime: number, endTime: number, totalDuration?: number) => void;
  onReset: () => void;
}

const positionOptions: { value: CaptionPosition; label: string }[] = [
  { value: 'top', label: '上部' },
  { value: 'center', label: '中央' },
  { value: 'bottom', label: '下部' },
];

const VideoTitleSettingsPanel = React.memo<VideoTitleSettingsPanelProps>(({
  title,
  isLocked,
  totalDuration,
  currentTime,
  supportsExtendedFonts,
  pinnedFontOptions,
  dropdownFontOptions,
  localFontFamilies,
  localFontsLoading,
  onLoadLocalFonts,
  onUpdate,
  onSetRange,
  onReset,
}) => {
  // 毎回使う機能ではないため初期状態は閉じる（Issue #211 の確認項目）
  const [isOpen, setIsOpen] = useState(false);
  // 見た目まわりはさらに段階開示する（キャプションの「スタイル/フェード一括設定」と同じ考え方）
  const [showStyleSettings, setShowStyleSettings] = useState(false);

  const isCustomPosition = title.positionCustom != null;
  const customPosition = title.positionCustom ?? TITLE_POSITION_CUSTOM_DEFAULT;

  const hasText = title.text.trim().length > 0;
  // スライダーの上限。CaptionItem と同じフォールバック（尺未確定なら 60 秒）
  const timeSliderMax = totalDuration || 60;
  // プレビュー位置の反映可否（CaptionItem と同じ 0.1 秒量子化で判定）
  const previewMark = Math.round(currentTime * 10) / 10;
  const canApplyPreviewToStart = previewMark < title.endTime;
  const canApplyPreviewToEnd = previewMark > title.startTime;

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-600/70">
      <SettingsAccordionHeader
        title="タイトル"
        icon={<Heading className="w-3 h-3 shrink-0" />}
        isOpen={isOpen}
        controlsId="video-title-settings"
        onToggle={() => setIsOpen((open) => !open)}
      />
      {isOpen && (
        <div
          id="video-title-settings"
          className="px-3 pb-3 pt-2 space-y-3 border-t border-gray-700/60"
        >
          <p className="text-[9px] leading-relaxed text-gray-500 md:text-[10px]">
            タイトルはキャプションとは別に保存されます。キャプション一覧には並びません。
          </p>

          {/* ■ タイトル文字 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="video-title-text"
                className="text-[10px] md:text-xs text-yellow-400 font-bold"
              >
                ■ タイトル文字
              </label>
              <label
                className={`flex items-center gap-1 text-[10px] md:text-xs ${isLocked ? 'opacity-50' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={title.enabled}
                  onChange={(e) => onUpdate({ enabled: e.target.checked })}
                  disabled={isLocked}
                  className="accent-yellow-500 rounded cursor-pointer disabled:opacity-50 disabled:cursor-default"
                />
                <span className="whitespace-nowrap text-gray-400">表示する</span>
              </label>
            </div>
            <textarea
              id="video-title-text"
              value={title.text}
              onChange={(e) => onUpdate({ text: e.target.value })}
              disabled={isLocked}
              rows={2}
              placeholder="動画のタイトルを入力...（改行で複数行）"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 disabled:opacity-50"
            />
            {!hasText && (
              <p className="text-[9px] text-gray-500">
                文字を入力するとプレビューに表示されます。
              </p>
            )}
          </div>

          {/* 表示時間（タイトル文字の直下・操作感はキャプションカードと同じ） */}
          <div className="space-y-2">
            {/* 開始時間 */}
            <div className="flex items-center gap-2 text-[10px]">
              <label className="text-gray-400 w-8 shrink-0" htmlFor="video-title-start">
                開始:
              </label>
              <SwipeProtectedSlider
                min={0}
                max={timeSliderMax}
                step={0.1}
                value={title.startTime}
                onChange={(value) => onSetRange(value, title.endTime, totalDuration)}
                disabled={isLocked}
                ariaLabel="タイトルの開始時間"
                className="flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
              />
              <input
                id="video-title-start"
                type="number"
                min={0}
                max={title.endTime - VIDEO_TITLE_MIN_DURATION_SEC}
                step={0.1}
                value={title.startTime}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!Number.isNaN(val) && val >= 0 && val < title.endTime) {
                    onSetRange(val, title.endTime, totalDuration);
                  }
                }}
                disabled={isLocked}
                className="w-12 bg-gray-700 border border-gray-600 rounded px-1 text-right text-white focus:outline-none focus:border-yellow-500 disabled:opacity-50"
              />
              <span className="text-gray-500">秒</span>
            </div>

            {/* 終了時間 */}
            <div className="flex items-center gap-2 text-[10px]">
              <label className="text-gray-400 w-8 shrink-0" htmlFor="video-title-end">
                終了:
              </label>
              <SwipeProtectedSlider
                min={0}
                max={timeSliderMax}
                step={0.1}
                value={title.endTime}
                onChange={(value) => onSetRange(title.startTime, value, totalDuration)}
                disabled={isLocked}
                ariaLabel="タイトルの終了時間"
                className="flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
              />
              <input
                id="video-title-end"
                type="number"
                min={title.startTime + VIDEO_TITLE_MIN_DURATION_SEC}
                max={totalDuration || 9999}
                step={0.1}
                value={title.endTime}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!Number.isNaN(val) && val > title.startTime) {
                    onSetRange(title.startTime, val, totalDuration);
                  }
                }}
                disabled={isLocked}
                className="w-12 bg-gray-700 border border-gray-600 rounded px-1 text-right text-white focus:outline-none focus:border-yellow-500 disabled:opacity-50"
              />
              <span className="text-gray-500">秒</span>
            </div>

            {/* プレビュー位置を反映（キャプション/BGM/ナレーションと同じ形式） */}
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] md:text-xs">
              <span className="text-gray-500 mr-0.5">プレビュー位置を反映:</span>
              <button
                type="button"
                onClick={() => {
                  if (canApplyPreviewToStart) {
                    onSetRange(previewMark, title.endTime, totalDuration);
                  }
                }}
                disabled={isLocked || !canApplyPreviewToStart}
                className="min-h-9 px-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 hover:border-yellow-500/60 hover:text-yellow-200 disabled:opacity-30 flex items-center gap-1 transition"
                title="現在位置を開始時間に設定"
              >
                <MapPin className="w-3.5 h-3.5" /> 開始
              </button>
              <button
                type="button"
                onClick={() => {
                  if (canApplyPreviewToEnd) {
                    onSetRange(title.startTime, previewMark, totalDuration);
                  }
                }}
                disabled={isLocked || !canApplyPreviewToEnd}
                className="min-h-9 px-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 hover:border-yellow-500/60 hover:text-yellow-200 disabled:opacity-30 flex items-center gap-1 transition"
                title="現在位置を終了時間に設定"
              >
                <MapPin className="w-3.5 h-3.5" /> 終了
              </button>
            </div>
          </div>

          {/* スタイル設定（見た目はすべてここへ集約する） */}
          <div className="rounded-lg border border-gray-700/70 bg-gray-900/30">
            <SettingsAccordionHeader
              title="スタイル設定"
              icon={<Type className="w-3 h-3 shrink-0" />}
              isOpen={showStyleSettings}
              controlsId="video-title-style-settings"
              onToggle={() => setShowStyleSettings((open) => !open)}
            />
            {showStyleSettings && (
              <div
                id="video-title-style-settings"
                className="space-y-2 border-t border-gray-700/60 px-2 pb-2 pt-2"
              >
                {/* サイズ: キャプションと同じ 小/中/大/特大 + カスタム（実装を共有） */}
                <CaptionFontSizeField
                  fontSize={title.fontSize}
                  fontSizeCustom={title.fontSizeCustom}
                  disabled={isLocked}
                  supportsCustom={supportsExtendedFonts}
                  ariaLabelPrefix="タイトル"
                  idPrefix="video-title"
                  onSetFontSize={(size) => {
                    // タイトルに「デフォルト」は無いので null は来ない
                    if (size) onUpdate({ fontSize: size });
                  }}
                  onSetFontSizeCustom={(value) => onUpdate({ fontSizeCustom: value })}
                />

                {/* 字体: キャプションと同じ 固定 + その他▾ + PC の全フォント読み込み（実装を共有） */}
                <CaptionFontStyleField
                  fontStyle={title.fontStyle}
                  disabled={isLocked}
                  supportsExtendedFonts={supportsExtendedFonts}
                  pinnedFontOptions={pinnedFontOptions}
                  dropdownFontOptions={dropdownFontOptions}
                  localFontFamilies={localFontFamilies}
                  localFontsLoading={localFontsLoading}
                  idPrefix="video-title"
                  onSetFontStyle={(style) => {
                    if (style) onUpdate({ fontStyle: style });
                  }}
                  onLoadLocalFonts={onLoadLocalFonts}
                />

                {/* 位置: プリセット + カスタム XY */}
                <div className="flex items-center gap-2 text-[10px] md:text-xs">
                  <span className="text-gray-400 w-16 shrink-0">位置:</span>
                  <div className="flex gap-1 flex-1">
                    {positionOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => onUpdate({ position: opt.value, positionCustom: null })}
                        disabled={isLocked}
                        className={`flex-1 max-w-[4rem] py-1 rounded transition ${
                          !isCustomPosition && title.position === opt.value
                            ? 'bg-yellow-500 text-gray-900'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        } disabled:opacity-50`}
                      >
                        {opt.label}
                      </button>
                    ))}
                    {supportsExtendedFonts && (
                      <button
                        onClick={() => {
                          if (!isCustomPosition) {
                            onUpdate({ positionCustom: { ...TITLE_POSITION_CUSTOM_DEFAULT } });
                          }
                        }}
                        disabled={isLocked}
                        className={`flex-1 max-w-[4.5rem] py-1 rounded transition ${
                          isCustomPosition
                            ? 'bg-yellow-500 text-gray-900'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        } disabled:opacity-50`}
                        title="XY 座標で自由に配置"
                      >
                        カスタム
                      </button>
                    )}
                  </div>
                </div>
                {supportsExtendedFonts && isCustomPosition && (
                  <div className="space-y-1.5 pl-16">
                    {(['x', 'y'] as const).map((axis) => (
                      <div key={axis} className="flex items-center gap-2 text-[10px] md:text-xs">
                        <span className="text-gray-500 w-4">{axis.toUpperCase()}</span>
                        <SwipeProtectedSlider
                          min={0}
                          max={100}
                          step={1}
                          value={customPosition[axis]}
                          onChange={(value) =>
                            onUpdate({
                              positionCustom: {
                                ...customPosition,
                                [axis]: clampPositionPercent(value),
                              },
                            })
                          }
                          disabled={isLocked}
                          ariaLabel={`タイトルの${axis.toUpperCase()}位置`}
                          className={`min-w-0 flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${isLocked ? '' : 'cursor-pointer'}`}
                        />
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={Math.round(customPosition[axis])}
                          onChange={(e) => {
                            const value = Number.parseFloat(e.target.value);
                            if (Number.isFinite(value)) {
                              onUpdate({
                                positionCustom: {
                                  ...customPosition,
                                  [axis]: clampPositionPercent(value),
                                },
                              });
                            }
                          }}
                          disabled={isLocked}
                          className="w-14 bg-gray-700 border border-gray-600 rounded px-1 text-right focus:outline-none focus:border-yellow-500 disabled:opacity-50"
                        />
                        <span className="text-gray-500">%</span>
                      </div>
                    ))}
                    <div className="text-[9px] text-gray-500">
                      X=50 が中央、Y=0 が最上部（テキスト中心の位置）
                    </div>
                  </div>
                )}

                {/* 縁の幅 */}
                <div className="flex items-center gap-2 text-[10px] md:text-xs">
                  <label className="text-gray-400 w-16 shrink-0" htmlFor="video-title-stroke-width">
                    縁の幅:
                  </label>
                  <SwipeProtectedSlider
                    min={VIDEO_TITLE_STROKE_WIDTH_MIN}
                    max={VIDEO_TITLE_STROKE_WIDTH_MAX}
                    step={VIDEO_TITLE_STROKE_WIDTH_STEP}
                    value={clampVideoTitleStrokeWidth(title.strokeWidth)}
                    onChange={(value) => onUpdate({ strokeWidth: clampVideoTitleStrokeWidth(value) })}
                    disabled={isLocked}
                    ariaLabel="タイトルの縁の幅"
                    className={`min-w-0 flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${isLocked ? '' : 'cursor-pointer'}`}
                  />
                  <input
                    id="video-title-stroke-width"
                    type="number"
                    min={VIDEO_TITLE_STROKE_WIDTH_MIN}
                    max={VIDEO_TITLE_STROKE_WIDTH_MAX}
                    step={VIDEO_TITLE_STROKE_WIDTH_STEP}
                    value={clampVideoTitleStrokeWidth(title.strokeWidth)}
                    onChange={(e) => {
                      const value = Number.parseFloat(e.target.value);
                      if (Number.isFinite(value)) {
                        onUpdate({ strokeWidth: clampVideoTitleStrokeWidth(value) });
                      }
                    }}
                    disabled={isLocked}
                    className="w-14 bg-gray-700 border border-gray-600 rounded px-1 text-right focus:outline-none focus:border-yellow-500 disabled:opacity-50"
                  />
                  <span className="text-gray-500">px</span>
                </div>

                <CaptionColorField
                  label="縁の色"
                  value={title.strokeColor}
                  fallback="#000000"
                  disabled={isLocked}
                  idPrefix="video-title"
                  ariaLabelPrefix="タイトル"
                  onChange={(color) => onUpdate({ strokeColor: color })}
                />
                <CaptionColorField
                  label="文字本体"
                  value={title.fontColor}
                  fallback="#FFFFFF"
                  disabled={isLocked}
                  idPrefix="video-title"
                  ariaLabelPrefix="タイトル"
                  onChange={(color) => onUpdate({ fontColor: color })}
                />

                {/* ぼかし: キャプションと同じ 0〜5（スライダーは 0.1 刻み） */}
                <div className="flex items-center gap-2 text-[10px] md:text-xs">
                  <span className="text-gray-400 w-16 shrink-0">ぼかし:</span>
                  <SwipeProtectedSlider
                    min={CAPTION_BLUR_MIN * 10}
                    max={CAPTION_BLUR_MAX * 10}
                    step={1}
                    value={clampVideoTitleBlur(title.blur) * 10}
                    onChange={(val) => onUpdate({ blur: clampVideoTitleBlur(val / 10) })}
                    disabled={isLocked}
                    ariaLabel="タイトルのぼかし"
                    className={`min-w-0 flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 disabled:cursor-default disabled:bg-gray-800 disabled:accent-gray-700 ${isLocked ? '' : 'cursor-pointer'}`}
                  />
                  <span
                    className={`w-8 text-right whitespace-nowrap ${isLocked ? 'text-gray-600' : 'text-gray-400'}`}
                  >
                    {clampVideoTitleBlur(title.blur).toFixed(1)}
                  </span>
                </div>

                {/* 背景の帯 */}
                <div className="space-y-2 pt-2 border-t border-gray-700/50">
                  <label
                    className={`flex items-center gap-1.5 text-[10px] md:text-xs text-gray-300 ${isLocked ? 'opacity-50' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={title.backgroundEnabled}
                      onChange={(e) => onUpdate({ backgroundEnabled: e.target.checked })}
                      disabled={isLocked}
                      className="accent-yellow-500 rounded cursor-pointer disabled:opacity-50 disabled:cursor-default"
                    />
                    <span className="font-semibold">タイトル背景の帯</span>
                  </label>
                  {title.backgroundEnabled && (
                    <div className="space-y-2">
                      <CaptionColorField
                        label="背景色"
                        value={title.backgroundColor}
                        fallback="#000000"
                        disabled={isLocked}
                        idPrefix="video-title-bg"
                        ariaLabelPrefix="タイトル"
                        onChange={(color) => onUpdate({ backgroundColor: color })}
                      />
                      <div className="flex items-center gap-2 text-[10px] md:text-xs">
                        <label className="text-gray-400 w-16 shrink-0" htmlFor="video-title-bg-opacity">
                          濃さ:
                        </label>
                        <SwipeProtectedSlider
                          min={VIDEO_TITLE_BACKGROUND_OPACITY_MIN}
                          max={VIDEO_TITLE_BACKGROUND_OPACITY_MAX}
                          step={VIDEO_TITLE_BACKGROUND_OPACITY_STEP}
                          value={clampVideoTitleBackgroundOpacity(title.backgroundOpacity)}
                          onChange={(value) =>
                            onUpdate({ backgroundOpacity: clampVideoTitleBackgroundOpacity(value) })
                          }
                          disabled={isLocked}
                          ariaLabel="タイトル背景の濃さ"
                          className={`min-w-0 flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${isLocked ? '' : 'cursor-pointer'}`}
                        />
                        <input
                          id="video-title-bg-opacity"
                          type="number"
                          min={0}
                          max={100}
                          step={5}
                          value={Math.round(
                            clampVideoTitleBackgroundOpacity(title.backgroundOpacity) * 100,
                          )}
                          onChange={(e) => {
                            const value = Number.parseFloat(e.target.value);
                            if (Number.isFinite(value)) {
                              onUpdate({
                                backgroundOpacity: clampVideoTitleBackgroundOpacity(value / 100),
                              });
                            }
                          }}
                          disabled={isLocked}
                          className="w-14 bg-gray-700 border border-gray-600 rounded px-1 text-right focus:outline-none focus:border-yellow-500 disabled:opacity-50"
                        />
                        <span className="text-gray-500">%</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] md:text-xs">
                        <label className="text-gray-400 w-16 shrink-0" htmlFor="video-title-bg-radius">
                          角丸:
                        </label>
                        <SwipeProtectedSlider
                          min={VIDEO_TITLE_BACKGROUND_RADIUS_MIN}
                          max={VIDEO_TITLE_BACKGROUND_RADIUS_MAX}
                          step={VIDEO_TITLE_BACKGROUND_RADIUS_STEP}
                          value={clampVideoTitleBackgroundRadius(title.backgroundRadius)}
                          onChange={(value) =>
                            onUpdate({ backgroundRadius: clampVideoTitleBackgroundRadius(value) })
                          }
                          disabled={isLocked}
                          ariaLabel="タイトル背景の角丸"
                          className={`min-w-0 flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${isLocked ? '' : 'cursor-pointer'}`}
                        />
                        <input
                          id="video-title-bg-radius"
                          type="number"
                          min={VIDEO_TITLE_BACKGROUND_RADIUS_MIN}
                          max={VIDEO_TITLE_BACKGROUND_RADIUS_MAX}
                          step={VIDEO_TITLE_BACKGROUND_RADIUS_STEP}
                          value={clampVideoTitleBackgroundRadius(title.backgroundRadius)}
                          onChange={(e) => {
                            const value = Number.parseFloat(e.target.value);
                            if (Number.isFinite(value)) {
                              onUpdate({
                                backgroundRadius: clampVideoTitleBackgroundRadius(value),
                              });
                            }
                          }}
                          disabled={isLocked}
                          className="w-14 bg-gray-700 border border-gray-600 rounded px-1 text-right focus:outline-none focus:border-yellow-500 disabled:opacity-50"
                        />
                        <span className="text-gray-500">px</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* フェード */}
          <div className="space-y-2 pt-2 border-t border-gray-700/50">
            <div className="text-[10px] md:text-xs text-yellow-400 font-bold">■ フェード</div>
            <div className="flex flex-col gap-1.5 text-[10px] md:text-xs">
              <div className="flex items-center gap-2">
                <label
                  className={`flex items-center gap-1 w-24 ${isLocked ? 'opacity-50' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    checked={title.fadeIn}
                    onChange={(e) => onUpdate({ fadeIn: e.target.checked })}
                    disabled={isLocked}
                    className="accent-yellow-500 rounded cursor-pointer disabled:opacity-50 disabled:cursor-default"
                  />
                  <span className="whitespace-nowrap">フェードイン</span>
                </label>
                <SwipeProtectedSlider
                  min={0.1}
                  max={3}
                  step={0.1}
                  value={title.fadeInDuration}
                  onChange={(value) => onUpdate({ fadeInDuration: value })}
                  disabled={isLocked || !title.fadeIn}
                  ariaLabel="タイトルのフェードイン時間"
                  className={`min-w-0 flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 disabled:bg-gray-800 ${isLocked || !title.fadeIn ? '' : 'cursor-pointer'}`}
                />
                <span
                  className={`w-10 text-right whitespace-nowrap ${isLocked || !title.fadeIn ? 'text-gray-600' : 'text-gray-400'}`}
                >
                  {title.fadeInDuration.toFixed(1)}秒
                </span>
              </div>
              <div className="flex items-center gap-2">
                <label
                  className={`flex items-center gap-1 w-24 ${isLocked ? 'opacity-50' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    checked={title.fadeOut}
                    onChange={(e) => onUpdate({ fadeOut: e.target.checked })}
                    disabled={isLocked}
                    className="accent-yellow-500 rounded cursor-pointer disabled:opacity-50 disabled:cursor-default"
                  />
                  <span className="whitespace-nowrap">フェードアウト</span>
                </label>
                <SwipeProtectedSlider
                  min={0.1}
                  max={3}
                  step={0.1}
                  value={title.fadeOutDuration}
                  onChange={(value) => onUpdate({ fadeOutDuration: value })}
                  disabled={isLocked || !title.fadeOut}
                  ariaLabel="タイトルのフェードアウト時間"
                  className={`min-w-0 flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 disabled:bg-gray-800 ${isLocked || !title.fadeOut ? '' : 'cursor-pointer'}`}
                />
                <span
                  className={`w-10 text-right whitespace-nowrap ${isLocked || !title.fadeOut ? 'text-gray-600' : 'text-gray-400'}`}
                >
                  {title.fadeOutDuration.toFixed(1)}秒
                </span>
              </div>
            </div>
          </div>

          {/* リセット */}
          <div className="pt-2 border-t border-gray-700/50">
            <button
              type="button"
              onClick={onReset}
              disabled={isLocked}
              className="flex items-center gap-1.5 rounded-md border border-gray-600 bg-gray-800 px-2 py-1.5 text-[10px] text-gray-300 transition hover:bg-gray-700 disabled:opacity-50 md:text-xs"
              title="タイトル設定を既定値に戻す（文字も消えます）"
            >
              <RotateCcw className="h-3 w-3" /> タイトル設定をリセット
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

VideoTitleSettingsPanel.displayName = 'VideoTitleSettingsPanel';

export default VideoTitleSettingsPanel;
