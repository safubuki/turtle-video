/**
 * @file CaptionFontSizeField.tsx
 * @author Turtle Village
 * @description 文字サイズ設定（小/中/大/特大 + カスタム数値）の共通コントロール。
 *
 * キャプションの一括スタイル設定と動画タイトル設定（Issue #211）が
 * **同じ見た目・同じ操作感**になるよう、実装をここへ 1 本化する。
 * カスタム（数値指定）は standard フレーバー限定のため `supportsCustom` で切り替える。
 */
import React from 'react';
import type { CaptionSize } from '../../types';
import { SwipeProtectedSlider } from '../SwipeProtectedSlider';
import {
  CAPTION_FONT_SIZE_CUSTOM_MAX,
  CAPTION_FONT_SIZE_CUSTOM_MIN,
  CAPTION_FONT_SIZE_PRESETS,
  clampCustomFontSize,
} from '../../utils/captionStyle';

export const CAPTION_FONT_SIZE_OPTIONS: { value: CaptionSize; label: string }[] = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
  { value: 'xlarge', label: '特大' },
];

interface CaptionFontSizeFieldProps {
  /** 選択中のプリセット */
  fontSize: CaptionSize;
  /** カスタム値（px @1080p 基準）。null でプリセット使用 */
  fontSizeCustom: number | null | undefined;
  disabled?: boolean;
  /** カスタム指定を許可するか（standard フレーバー限定機能） */
  supportsCustom: boolean;
  /** スライダー等の aria-label 接頭辞（「キャプション」「タイトル」） */
  ariaLabelPrefix: string;
  /** input 要素の id 接頭辞（同一画面に複数置くため一意化する） */
  idPrefix: string;
  onSetFontSize: (size: CaptionSize) => void;
  onSetFontSizeCustom: (value: number | null) => void;
}

const CaptionFontSizeField = React.memo<CaptionFontSizeFieldProps>(({
  fontSize,
  fontSizeCustom,
  disabled = false,
  supportsCustom,
  ariaLabelPrefix,
  idPrefix,
  onSetFontSize,
  onSetFontSizeCustom,
}) => {
  const isCustom = fontSizeCustom != null;
  const customValue = fontSizeCustom ?? CAPTION_FONT_SIZE_PRESETS[fontSize];

  return (
    <>
      <div className="flex items-center gap-2 text-[10px] md:text-xs">
        <span className="text-gray-400 w-16">サイズ:</span>
        <div className="flex gap-1 flex-1">
          {CAPTION_FONT_SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                // プリセットを選んだらカスタムは解除する（キャプションと同じ挙動）
                onSetFontSizeCustom(null);
                onSetFontSize(opt.value);
              }}
              disabled={disabled}
              className={`flex-1 max-w-[4rem] py-1 rounded transition ${
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
                // 現在のプリセット相当の px から編集を始める
                if (!isCustom) onSetFontSizeCustom(CAPTION_FONT_SIZE_PRESETS[fontSize]);
              }}
              disabled={disabled}
              className={`flex-1 max-w-[4.5rem] py-1 rounded transition ${
                isCustom
                  ? 'bg-yellow-500 text-gray-900'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } disabled:opacity-50`}
              title="サイズを数値で自由に指定"
            >
              カスタム
            </button>
          )}
        </div>
      </div>
      {supportsCustom && isCustom && (
        <div className="flex items-center gap-2 text-[10px] md:text-xs pl-16">
          <SwipeProtectedSlider
            min={CAPTION_FONT_SIZE_CUSTOM_MIN}
            max={CAPTION_FONT_SIZE_CUSTOM_MAX}
            step={2}
            value={customValue}
            onChange={(val) => onSetFontSizeCustom(clampCustomFontSize(val))}
            disabled={disabled}
            ariaLabel={`${ariaLabelPrefix}のカスタム文字サイズ`}
            className={`flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${disabled ? '' : 'cursor-pointer'}`}
          />
          <input
            id={`${idPrefix}-font-size-custom`}
            type="number"
            min={CAPTION_FONT_SIZE_CUSTOM_MIN}
            max={CAPTION_FONT_SIZE_CUSTOM_MAX}
            step={2}
            value={Math.round(customValue)}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!Number.isNaN(val)) onSetFontSizeCustom(clampCustomFontSize(val));
            }}
            disabled={disabled}
            aria-label={`${ariaLabelPrefix}のカスタム文字サイズ（数値）`}
            className="w-14 bg-gray-700 border border-gray-600 rounded px-1 text-right focus:outline-none focus:border-yellow-500 disabled:opacity-50"
          />
          <span className="text-gray-500 whitespace-nowrap">px</span>
        </div>
      )}
    </>
  );
});

CaptionFontSizeField.displayName = 'CaptionFontSizeField';

export default CaptionFontSizeField;
