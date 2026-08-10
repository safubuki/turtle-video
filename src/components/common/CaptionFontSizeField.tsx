/**
 * @file CaptionFontSizeField.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 文字サイズ設定（小/中/大/特大 + カスタム数値）の共通コントロール。
 *
 * キャプションの一括スタイル設定・キャプション個別設定モーダル・動画タイトル設定
 * （Issue #211）が **同じ見た目・同じ操作感**になるよう、実装をここへ 1 本化する。
 * カスタム（数値指定）は standard フレーバー限定のため `supportsCustom` で切り替える。
 *
 * `allowDefaultOption` を立てると先頭に「デフォルト」（一括設定を継承）が増え、
 * `fontSize` に null を渡せるようになる（キャプション個別設定モーダル用）。
 */
import React from 'react';
import type { CaptionSize } from '../../types';
import NumericSliderField from './NumericSliderField';
import {
  CAPTION_FONT_SIZE_CUSTOM_MAX,
  CAPTION_FONT_SIZE_CUSTOM_MIN,
  CAPTION_FONT_SIZE_PRESETS,
  clampCustomFontSize,
} from '../../utils/captionStyle';
import ResponsiveButtonLabel from './ResponsiveButtonLabel';

export const CAPTION_FONT_SIZE_OPTIONS: { value: CaptionSize; label: string }[] = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
  { value: 'xlarge', label: '特大' },
];

interface CaptionFontSizeFieldProps {
  /** 選択中のプリセット。個別設定で未指定（一括設定を継承）のときは null */
  fontSize: CaptionSize | null;
  /** カスタム値（px @1080p 基準）。null でプリセット使用 */
  fontSizeCustom: number | null | undefined;
  disabled?: boolean;
  /** カスタム指定を許可するか（standard フレーバー限定機能） */
  supportsCustom: boolean;
  /**
   * 「デフォルト」（一括設定を継承）を選べるようにするか。
   * キャプション個別設定モーダル用。選択時は `onSetFontSize(null)` を呼ぶ。
   */
  allowDefaultOption?: boolean;
  /**
   * 幅が狭い場所（個別設定モーダル）向けのレイアウト。
   * 「デフォルト」が増えてボタンが 1 つ多くなるため、**スマホ幅でだけ**
   * 短縮ラベル・詰めたラベル列に切り替えて折り返しを防ぐ。
   * PC（md 以上）ではモーダルが横広になるので一括設定と同じ表示に戻る。
   */
  compact?: boolean;
  /**
   * `fontSize` が null（デフォルト）のときにカスタム編集の初期値へ使う px。
   * 一括設定の実効サイズを渡す。
   */
  inheritedFontSizePx?: number;
  /** スライダー等の aria-label 接頭辞（「キャプション」「タイトル」） */
  ariaLabelPrefix: string;
  /** input 要素の id 接頭辞（同一画面に複数置くため一意化する） */
  idPrefix: string;
  onSetFontSize: (size: CaptionSize | null) => void;
  onSetFontSizeCustom: (value: number | null) => void;
}

const CaptionFontSizeField = React.memo<CaptionFontSizeFieldProps>(({
  fontSize,
  fontSizeCustom,
  disabled = false,
  supportsCustom,
  allowDefaultOption = false,
  compact = false,
  inheritedFontSizePx,
  ariaLabelPrefix,
  idPrefix,
  onSetFontSize,
  onSetFontSizeCustom,
}) => {
  const isCustom = fontSizeCustom != null;
  const isDefaultSelected = allowDefaultOption && !isCustom && fontSize === null;
  // デフォルト（継承）時は一括設定の実効 px からカスタム編集を始められるようにする
  const presetPx = fontSize !== null
    ? CAPTION_FONT_SIZE_PRESETS[fontSize]
    : inheritedFontSizePx ?? CAPTION_FONT_SIZE_PRESETS.medium;
  const customValue = fontSizeCustom ?? presetPx;

  return (
    <>
      <div className="flex items-center gap-2 text-[10px] md:text-xs">
        <span className={`text-gray-400 shrink-0 ${compact ? 'w-10 md:w-16' : 'w-16'}`}>サイズ:</span>
        <div className="flex gap-1 flex-1 min-w-0">
          {/* 個別設定のみ: 一括設定を継承する「デフォルト」 */}
          {allowDefaultOption && (
            <button
              onClick={() => {
                onSetFontSizeCustom(null);
                onSetFontSize(null);
              }}
              disabled={disabled}
              className={`min-w-0 flex-1 px-0.5 py-1 rounded transition whitespace-nowrap ${
                isDefaultSelected
                  ? 'bg-yellow-500 text-gray-900'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } disabled:opacity-50`}
              title="一括設定の文字サイズに従う"
              aria-label="デフォルト"
            >
              <ResponsiveButtonLabel full="デフォルト" short="既定" enabled={compact} />
            </button>
          )}
          {CAPTION_FONT_SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                // プリセットを選んだらカスタムは解除する（キャプションと同じ挙動）
                onSetFontSizeCustom(null);
                onSetFontSize(opt.value);
              }}
              disabled={disabled}
              className={`min-w-0 flex-1 px-0.5 py-1 rounded transition whitespace-nowrap ${
                !isCustom && fontSize === opt.value
                  ? 'bg-yellow-500 text-gray-900'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } disabled:opacity-50`}
            >
              {opt.label}
            </button>
          ))}
          {supportsCustom && (
            <button
              onClick={() => {
                // 現在のプリセット（継承時は一括設定）相当の px から編集を始める
                if (!isCustom) onSetFontSizeCustom(presetPx);
              }}
              disabled={disabled}
              className={`min-w-0 flex-1 px-0.5 py-1 rounded transition whitespace-nowrap ${
                isCustom
                  ? 'bg-yellow-500 text-gray-900'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } disabled:opacity-50`}
              title="サイズを数値で自由に指定"
              aria-label="カスタム"
            >
              <ResponsiveButtonLabel full="カスタム" short="任意" enabled={compact} />
            </button>
          )}
        </div>
      </div>
      {supportsCustom && isCustom && (
        <div className={`flex items-center gap-2 text-[10px] md:text-xs ${compact ? 'pl-10 md:pl-16' : 'pl-16'}`}>
          <NumericSliderField
            min={CAPTION_FONT_SIZE_CUSTOM_MIN}
            max={CAPTION_FONT_SIZE_CUSTOM_MAX}
            step={2}
            value={customValue}
            onChange={(val) => onSetFontSizeCustom(clampCustomFontSize(val))}
            disabled={disabled}
            ariaLabel={`${ariaLabelPrefix}のカスタム文字サイズ`}
            inputId={`${idPrefix}-font-size-custom`}
            unit="px"
            className="flex-1 min-w-0"
            sliderClassName={`flex-1 min-w-0 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${disabled ? '' : 'cursor-pointer'}`}
            inputClassName="w-14 focus:border-yellow-500"
          />
        </div>
      )}
    </>
  );
});

CaptionFontSizeField.displayName = 'CaptionFontSizeField';

export default CaptionFontSizeField;
