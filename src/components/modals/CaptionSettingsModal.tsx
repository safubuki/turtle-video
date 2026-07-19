/**
 * @file CaptionSettingsModal.tsx
 * @author Turtle Village
 * @description キャプション個別スタイル設定のモーダル。一括設定を上書き（Override）するためのUI。
 */
import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Caption, CaptionPosition, CaptionSize, CaptionFontStyle } from '../../types';
import { SwipeProtectedSlider } from '../SwipeProtectedSlider';
import { useDisableBodyScroll } from '../../hooks/useDisableBodyScroll';
import { usePlatformCapabilities } from '../../app/PlatformCapabilitiesContext';
import {
  BASIC_CAPTION_FONT_OPTIONS,
  createLocalFontValue,
  getAvailableDropdownFontOptions,
  getAvailablePinnedFontOptions,
  getLocalFontFamilyFromValue,
  isExtendedCaptionFontStyle,
  resolveCaptionFontFamily,
} from '../../utils/captionFontCatalog';
import {
  CAPTION_FONT_SIZE_CUSTOM_MAX,
  CAPTION_FONT_SIZE_CUSTOM_MIN,
  CAPTION_FONT_SIZE_PRESETS,
  CAPTION_POSITION_CUSTOM_DEFAULT,
  clampCustomFontSize,
  clampPositionPercent,
} from '../../utils/captionStyle';
import {
  SEQUENTIAL_GAP_MAX_SEC,
  clampSequentialGapSec,
  isSequentialCaption,
  resolveSequentialCaptionSegments,
} from '../../utils/captionTimeline';
import { queryLocalFontFamilies, supportsLocalFontAccess } from '../../utils/fontAvailability';

interface CaptionSettingsModalProps {
  caption: Caption;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Omit<Caption, 'id'>>) => void;
}

// 拡張型：デフォルトオプション付き
type PositionOption = 'default' | CaptionPosition;
type FontStyleOption = 'default' | CaptionFontStyle;
type SizeOption = 'default' | CaptionSize;
type FadeOption = 'default' | 'on' | 'off';

/**
 * キャプション個別設定モーダル
 */
const CaptionSettingsModal: React.FC<CaptionSettingsModalProps> = ({
  caption,
  onClose,
  onUpdate,
}) => {
  // モーダル表示中は背景のスクロールを防止
  // このコンポーネントは親で条件付きレンダリングされているため、
  // マウント時は常に表示状態なので true を渡す
  useDisableBodyScroll(true);

  // 現在の値を取得（undefinedの場合は'default'）
  const currentPosition: PositionOption = caption.overridePosition ?? 'default';
  const currentFontStyle: FontStyleOption = caption.overrideFontStyle ?? 'default';
  const currentFontSize: SizeOption = caption.overrideFontSize ?? 'default';
  const currentFadeIn: FadeOption = caption.overrideFadeIn ?? 'default';
  const currentFadeOut: FadeOption = caption.overrideFadeOut ?? 'default';
  const currentFadeInDuration = caption.overrideFadeInDuration ?? 0.5;
  const currentFadeOutDuration = caption.overrideFadeOutDuration ?? 0.5;
  // 個別カスタム値（一括設定と同等の自由指定・standard 限定）
  const isCustomFontSize = caption.overrideFontSizeCustom != null;
  const isCustomPosition = caption.overridePositionCustom != null;
  const customPosition = caption.overridePositionCustom ?? CAPTION_POSITION_CUSTOM_DEFAULT;

  // 時分割（複数行の順次表示）設定
  const isSequential = isSequentialCaption(caption);
  const sequentialFadeMode = caption.sequentialFadeMode ?? 'card';
  const sequentialGapSec = clampSequentialGapSec(caption.sequentialGapSec ?? 0);
  const SEQUENTIAL_GAP_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
    { value: 0, label: 'なし' },
    { value: 0.2, label: '200ms' },
  ];
  const isPresetSequentialGap = SEQUENTIAL_GAP_PRESETS.some((p) => p.value === sequentialGapSec);
  const [isCustomSequentialGap, setIsCustomSequentialGap] = useState(!isPresetSequentialGap);

  // サイズオプション
  const fontSizeOptions: { value: SizeOption; label: string }[] = [
    { value: 'default', label: 'デフォルト' },
    { value: 'small', label: '小' },
    { value: 'medium', label: '中' },
    { value: 'large', label: '大' },
    { value: 'xlarge', label: '特大' },
  ];

  // 拡張フォント（システムフォント）は standard フレーバー（Android/PC）限定
  const { isIosSafari } = usePlatformCapabilities();
  const supportsExtendedFonts = !isIosSafari;

  // PC: Local Font Access API（Chromium 系）で端末の全フォントを追加読み込み（一括設定と同等）
  const [localFontFamilies, setLocalFontFamilies] = useState<string[]>([]);
  const [localFontsLoading, setLocalFontsLoading] = useState(false);
  const canLoadLocalFonts = supportsExtendedFonts && supportsLocalFontAccess();
  const handleLoadLocalFonts = async () => {
    if (localFontsLoading) return;
    setLocalFontsLoading(true);
    try {
      setLocalFontFamilies(await queryLocalFontFamilies());
    } finally {
      setLocalFontsLoading(false);
    }
  };
  // 既に local: フォントが選択されている場合、モーダルを開いた時点で一覧を補完する
  useEffect(() => {
    let cancelled = false;
    if (getLocalFontFamilyFromValue(caption.overrideFontStyle ?? '') !== null && supportsLocalFontAccess()) {
      queryLocalFontFamilies().then((families) => {
        if (!cancelled) setLocalFontFamilies(families);
      }).catch(() => { /* 許可なしは無視 */ });
    }
    return () => { cancelled = true; };
    // モーダルを開いた初回のみ実行する
  }, []);

  // 字体オプション: デフォルト + 基本 2（モーダルは幅が狭いため固定は 2 つに抑え、残りはドロップダウンへ）
  const fontStyleOptions: { value: FontStyleOption; label: string }[] = [
    { value: 'default', label: 'デフォルト' },
    ...BASIC_CAPTION_FONT_OPTIONS.map(({ value, label }) => ({ value, label })),
  ];
  // ドロップダウン: 実在する丸ゴシック + 実在するその他フォント
  const modalDropdownOptions = [
    ...getAvailablePinnedFontOptions().filter((o) => o.extended),
    ...getAvailableDropdownFontOptions(),
  ];
  const isDropdownFontSelected = caption.overrideFontStyle !== undefined
    && isExtendedCaptionFontStyle(caption.overrideFontStyle)
    && !BASIC_CAPTION_FONT_OPTIONS.some((o) => o.value === caption.overrideFontStyle);
  const dropdownFontValue = isDropdownFontSelected ? (caption.overrideFontStyle ?? '') : '';
  const selectedLocalFamily = getLocalFontFamilyFromValue(caption.overrideFontStyle ?? '');
  const dropdownHasSelected = !dropdownFontValue
    || modalDropdownOptions.some((o) => o.value === dropdownFontValue)
    || (selectedLocalFamily !== null && localFontFamilies.includes(selectedLocalFamily));

  // 配置オプション
  const positionOptions: { value: PositionOption; label: string }[] = [
    { value: 'default', label: 'デフォルト' },
    { value: 'top', label: '上部' },
    { value: 'center', label: '中央' },
    { value: 'bottom', label: '下部' },
  ];

  // 更新ハンドラ（プリセット選択時は個別カスタム値を解除する）
  const handleFontSizeChange = (value: SizeOption) => {
    onUpdate(caption.id, {
      overrideFontSize: value === 'default' ? undefined : value,
      overrideFontSizeCustom: undefined,
    });
  };

  const handleEnableCustomFontSize = () => {
    if (isCustomFontSize) return;
    onUpdate(caption.id, {
      overrideFontSize: undefined,
      overrideFontSizeCustom: caption.overrideFontSize
        ? CAPTION_FONT_SIZE_PRESETS[caption.overrideFontSize]
        : CAPTION_FONT_SIZE_PRESETS.medium,
    });
  };

  const handleCustomFontSizeChange = (value: number) => {
    onUpdate(caption.id, { overrideFontSizeCustom: clampCustomFontSize(value) });
  };

  const handleEnableCustomPosition = () => {
    if (isCustomPosition) return;
    onUpdate(caption.id, {
      overridePosition: undefined,
      overridePositionCustom: { ...CAPTION_POSITION_CUSTOM_DEFAULT },
    });
  };

  const handleCustomPositionChange = (axis: 'x' | 'y', value: number) => {
    onUpdate(caption.id, {
      overridePositionCustom: { ...customPosition, [axis]: clampPositionPercent(value) },
    });
  };

  const handleFontStyleChange = (value: FontStyleOption) => {
    onUpdate(caption.id, {
      overrideFontStyle: value === 'default' ? undefined : value,
    });
  };

  const handlePositionChange = (value: PositionOption) => {
    onUpdate(caption.id, {
      overridePosition: value === 'default' ? undefined : value,
      overridePositionCustom: undefined,
    });
  };

  const handleFadeInChange = (value: FadeOption) => {
    onUpdate(caption.id, {
      overrideFadeIn: value === 'default' ? undefined : value,
      // デフォルトに戻す場合は時間もクリア
      ...(value === 'default' ? { overrideFadeInDuration: undefined } : {}),
    });
  };

  const handleFadeOutChange = (value: FadeOption) => {
    onUpdate(caption.id, {
      overrideFadeOut: value === 'default' ? undefined : value,
      // デフォルトに戻す場合は時間もクリア
      ...(value === 'default' ? { overrideFadeOutDuration: undefined } : {}),
    });
  };

  const handleFadeInDurationChange = (value: number) => {
    const steps = [0.5, 1.0, 2.0];
    onUpdate(caption.id, {
      overrideFadeInDuration: steps[value],
    });
  };

  const handleFadeOutDurationChange = (value: number) => {
    const steps = [0.5, 1.0, 2.0];
    onUpdate(caption.id, {
      overrideFadeOutDuration: steps[value],
    });
  };

  // セグメンテッドコントロールのスタイル（一括設定と同じ）
  const getButtonClass = (isSelected: boolean) =>
    `flex-1 py-1 rounded transition text-[10px] whitespace-nowrap ${isSelected
      ? 'bg-yellow-500 text-gray-900'
      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    }`;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[300] p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-sm font-bold flex items-center gap-2">
            ⚙️ キャプション個別設定
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-700 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-4 space-y-3">
          {/* ■ スタイル設定 */}
          <div className="space-y-2">
            <div className="text-[10px] text-yellow-400 font-bold">■ スタイル設定</div>
            {/* サイズ: プリセット + カスタム値（standard のみ・一括設定と同等） */}
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-gray-400 w-16">サイズ:</span>
              <div className="flex gap-1 flex-1">
                {fontSizeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleFontSizeChange(opt.value)}
                    className={getButtonClass(!isCustomFontSize && currentFontSize === opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
                {supportsExtendedFonts && (
                  <button
                    onClick={handleEnableCustomFontSize}
                    className={getButtonClass(isCustomFontSize)}
                    title="サイズを数値で自由に指定"
                  >
                    カスタム
                  </button>
                )}
              </div>
            </div>
            {/* カスタムサイズ入力 */}
            {supportsExtendedFonts && isCustomFontSize && (
              <div className="flex items-center gap-2 text-[10px] pl-16">
                <SwipeProtectedSlider
                  min={CAPTION_FONT_SIZE_CUSTOM_MIN}
                  max={CAPTION_FONT_SIZE_CUSTOM_MAX}
                  step={2}
                  value={caption.overrideFontSizeCustom ?? CAPTION_FONT_SIZE_PRESETS.medium}
                  onChange={handleCustomFontSizeChange}
                  className="flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer"
                />
                <input
                  type="number"
                  min={CAPTION_FONT_SIZE_CUSTOM_MIN}
                  max={CAPTION_FONT_SIZE_CUSTOM_MAX}
                  step={2}
                  value={Math.round(caption.overrideFontSizeCustom ?? CAPTION_FONT_SIZE_PRESETS.medium)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!Number.isNaN(val)) handleCustomFontSizeChange(val);
                  }}
                  className="w-14 bg-gray-700 border border-gray-600 rounded px-1 text-right focus:outline-none focus:border-yellow-500"
                />
                <span className="text-gray-500 whitespace-nowrap">px</span>
              </div>
            )}
            {/* 字体: デフォルト + 固定 + ドロップダウン（standard のみ） */}
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-gray-400 w-16">字体:</span>
              <div className="flex gap-1 flex-1 items-stretch">
                {fontStyleOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleFontStyleChange(opt.value)}
                    className={getButtonClass(currentFontStyle === opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
                {supportsExtendedFonts && (
                  <select
                    value={dropdownFontValue}
                    onChange={(e) => {
                      const value = e.target.value as CaptionFontStyle | '';
                      if (value) handleFontStyleChange(value);
                    }}
                    className={`flex-1 min-w-0 py-1 px-0.5 rounded transition text-[10px] bg-gray-700 focus:outline-none focus:ring-1 focus:ring-yellow-500 ${dropdownFontValue
                      ? 'text-yellow-300 ring-1 ring-yellow-500/70 font-semibold'
                      : 'text-gray-300 hover:bg-gray-600'
                      }`}
                    title="その他のシステムフォントから選ぶ（端末に実在するもののみ表示）"
                  >
                    <option value="" disabled className="bg-gray-800 text-gray-500">
                      その他▾
                    </option>
                    {modalDropdownOptions.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-gray-800 text-gray-200" style={{ fontFamily: opt.family }}>
                        {opt.label}
                      </option>
                    ))}
                    {localFontFamilies.length > 0 && (
                      <optgroup label="端末のフォント" className="bg-gray-800 text-gray-400">
                        {localFontFamilies.map((family) => (
                          <option
                            key={family}
                            value={createLocalFontValue(family)}
                            className="bg-gray-800 text-gray-200"
                            style={{ fontFamily: family }}
                          >
                            {family}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {!dropdownHasSelected && (
                      <option value={dropdownFontValue} className="bg-gray-800 text-gray-200" style={{ fontFamily: resolveCaptionFontFamily(dropdownFontValue) }}>
                        {selectedLocalFamily ?? dropdownFontValue}
                      </option>
                    )}
                  </select>
                )}
              </div>
            </div>
            {/* PC: 端末の全フォント読み込み（Local Font Access API 対応環境のみ・一括設定と同等） */}
            {canLoadLocalFonts && localFontFamilies.length === 0 && (
              <div className="pl-16">
                <button
                  onClick={handleLoadLocalFonts}
                  disabled={localFontsLoading}
                  className="text-[10px] text-blue-300 hover:text-blue-200 underline underline-offset-2 disabled:opacity-50"
                  title="この PC にインストールされている全フォントを選択肢に追加します（許可が必要）"
                >
                  {localFontsLoading ? '読み込み中…' : '＋ この端末の全フォントから選ぶ（PC）'}
                </button>
              </div>
            )}
            {/* 位置: プリセット + カスタム XY（standard のみ・一括設定と同等） */}
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-gray-400 w-16">位置:</span>
              <div className="flex gap-1 flex-1">
                {positionOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handlePositionChange(opt.value)}
                    className={getButtonClass(!isCustomPosition && currentPosition === opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
                {supportsExtendedFonts && (
                  <button
                    onClick={handleEnableCustomPosition}
                    className={getButtonClass(isCustomPosition)}
                    title="XY 座標で自由に配置"
                  >
                    カスタム
                  </button>
                )}
              </div>
            </div>
            {/* カスタム位置入力（キャンバスに対する % / テキスト中心） */}
            {supportsExtendedFonts && isCustomPosition && (
              <div className="space-y-1.5 pl-16">
                {(['x', 'y'] as const).map((axis) => (
                  <div key={axis} className="flex items-center gap-2 text-[10px]">
                    <span className="text-gray-500 w-4 uppercase">{axis}</span>
                    <SwipeProtectedSlider
                      min={0}
                      max={100}
                      step={1}
                      value={customPosition[axis]}
                      onChange={(val) => handleCustomPositionChange(axis, val)}
                      className="flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(customPosition[axis])}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val)) handleCustomPositionChange(axis, val);
                      }}
                      className="w-14 bg-gray-700 border border-gray-600 rounded px-1 text-right focus:outline-none focus:border-yellow-500"
                    />
                    <span className="text-gray-500">%</span>
                  </div>
                ))}
                <div className="text-[9px] text-gray-500">X=50 が中央、Y=0 が最上部（テキスト中心の位置）</div>
              </div>
            )}
          </div>

          {/* ■ フェード設定 */}
          <div className="space-y-2 pt-3 border-t border-gray-700">
            <div className="text-[10px] text-yellow-400 font-bold">■ フェード設定</div>
            {/* フェードイン */}
            <div className="flex items-center gap-2 text-[10px]">
              <label className="flex items-center gap-1 w-24 justify-start cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentFadeIn === 'on'}
                  onChange={(e) => handleFadeInChange(e.target.checked ? 'on' : 'off')}
                  className="accent-yellow-500 rounded cursor-pointer"
                />
                <span className="whitespace-nowrap">フェードイン</span>
              </label>
              <SwipeProtectedSlider
                min={0}
                max={2}
                step={1}
                value={currentFadeInDuration === 0.5 ? 0 : currentFadeInDuration === 1.0 ? 1 : 2}
                onChange={handleFadeInDurationChange}
                disabled={currentFadeIn !== 'on'}
                className={`flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 disabled:cursor-default disabled:bg-gray-800 disabled:accent-gray-700 ${currentFadeIn === 'on' ? 'cursor-pointer' : ''}`}
              />
              <span className={`w-8 text-right whitespace-nowrap ${currentFadeIn !== 'on' ? 'text-gray-600' : 'text-gray-400'}`}>{currentFadeInDuration}秒</span>
            </div>
            {/* フェードアウト */}
            <div className="flex items-center gap-2 text-[10px]">
              <label className="flex items-center gap-1 w-24 justify-start cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentFadeOut === 'on'}
                  onChange={(e) => handleFadeOutChange(e.target.checked ? 'on' : 'off')}
                  className="accent-yellow-500 rounded cursor-pointer"
                />
                <span className="whitespace-nowrap">フェードアウト</span>
              </label>
              <SwipeProtectedSlider
                min={0}
                max={2}
                step={1}
                value={currentFadeOutDuration === 0.5 ? 0 : currentFadeOutDuration === 1.0 ? 1 : 2}
                onChange={handleFadeOutDurationChange}
                disabled={currentFadeOut !== 'on'}
                className={`flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 disabled:cursor-default disabled:bg-gray-800 disabled:accent-gray-700 ${currentFadeOut === 'on' ? 'cursor-pointer' : ''}`}
              />
              <span className={`w-8 text-right whitespace-nowrap ${currentFadeOut !== 'on' ? 'text-gray-600' : 'text-gray-400'}`}>{currentFadeOutDuration}秒</span>
            </div>
            {/* デフォルトに戻すボタン */}
            {(currentFadeIn !== 'default' || currentFadeOut !== 'default') && (
              <button
                onClick={() => {
                  onUpdate(caption.id, {
                    overrideFadeIn: undefined,
                    overrideFadeOut: undefined,
                    overrideFadeInDuration: undefined,
                    overrideFadeOutDuration: undefined,
                  });
                }}
                className="text-[9px] text-gray-500 hover:text-yellow-400 transition"
              >
                フェード設定をデフォルトに戻す
              </button>
            )}
          </div>

          {/* ■ 時分割設定（複数行テキストのカードのみ） */}
          {isSequential && (
            <div className="space-y-2 pt-3 border-t border-gray-700">
              <div className="text-[10px] text-emerald-300 font-bold">
                ■ 時分割設定（{resolveSequentialCaptionSegments(caption).length}行を順番に表示）
              </div>
              {/* フェードの適用単位 */}
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-gray-400 w-16">フェード:</span>
                <div className="flex gap-1 flex-1">
                  <button
                    onClick={() => onUpdate(caption.id, { sequentialFadeMode: undefined })}
                    className={getButtonClass(sequentialFadeMode === 'card')}
                    title="カード全体でフェード（最初の行の頭でイン、最後の行の尻でアウト）"
                  >
                    カード全体
                  </button>
                  <button
                    onClick={() => onUpdate(caption.id, { sequentialFadeMode: 'line' })}
                    className={getButtonClass(sequentialFadeMode === 'line')}
                    title="行ごとにフェード（各行の表示開始でイン、表示終了でアウト）"
                  >
                    行ごと
                  </button>
                </div>
              </div>
              <p className="text-[9px] text-gray-500 pl-16">
                フェードの ON/OFF と時間は上のフェード設定（または一括設定）に従います
              </p>
              {/* 行の間隔 */}
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-gray-400 w-16">行の間隔:</span>
                <div className="flex gap-1 flex-1 items-center">
                  {SEQUENTIAL_GAP_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => {
                        setIsCustomSequentialGap(false);
                        onUpdate(caption.id, {
                          sequentialGapSec: preset.value === 0 ? undefined : preset.value,
                        });
                      }}
                      className={getButtonClass(!isCustomSequentialGap && sequentialGapSec === preset.value)}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setIsCustomSequentialGap(true)}
                    className={getButtonClass(isCustomSequentialGap)}
                  >
                    カスタム
                  </button>
                  {isCustomSequentialGap && (
                    <>
                      <input
                        type="number"
                        min={0}
                        max={SEQUENTIAL_GAP_MAX_SEC}
                        step={0.1}
                        value={sequentialGapSec}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!Number.isNaN(val)) {
                            onUpdate(caption.id, {
                              sequentialGapSec: clampSequentialGapSec(val) || undefined,
                            });
                          }
                        }}
                        className="w-14 bg-gray-700 border border-gray-600 rounded px-1 text-right focus:outline-none focus:border-yellow-500"
                      />
                      <span className="text-gray-500 shrink-0">秒</span>
                    </>
                  )}
                </div>
              </div>
              <p className="text-[9px] text-gray-500 pl-16">
                行と行の間に何も表示しない間隔を挟みます（表示時間内で自動調整）
              </p>
            </div>
          )}

          <p className="text-[9px] text-gray-500 pt-2">
            ※「デフォルト」選択時は一括設定の値に従います
          </p>
        </div>
      </div>
    </div>
  );
};

export default CaptionSettingsModal;
