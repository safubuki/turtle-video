/**
 * @file CaptionTextAlignField.tsx
 * @description キャプションの左揃え／中揃え／右揃えを一括・個別設定で共有する。
 */
import React from 'react';
import type { CaptionTextAlign } from '../../types';
import ResponsiveButtonLabel from './ResponsiveButtonLabel';

interface CaptionTextAlignFieldProps {
  /** 個別設定で一括値を継承しているときは null */
  textAlign: CaptionTextAlign | null;
  disabled?: boolean;
  allowDefaultOption?: boolean;
  /** 個別設定モーダルでは狭幅用の短縮ラベルを使う */
  compact?: boolean;
  ariaLabelPrefix: string;
  onSetTextAlign: (value: CaptionTextAlign | null) => void;
}

const ALIGN_OPTIONS: ReadonlyArray<{
  value: CaptionTextAlign;
  label: string;
  shortLabel: string;
}> = [
  { value: 'left', label: '左揃え', shortLabel: '左' },
  { value: 'center', label: '中揃え', shortLabel: '中' },
  { value: 'right', label: '右揃え', shortLabel: '右' },
];

const CaptionTextAlignField = React.memo<CaptionTextAlignFieldProps>(({
  textAlign,
  disabled = false,
  allowDefaultOption = false,
  compact = false,
  ariaLabelPrefix,
  onSetTextAlign,
}) => {
  const buttonClass = (selected: boolean) =>
    `min-w-0 flex-1 whitespace-nowrap rounded px-0.5 py-1 transition disabled:opacity-50 ${
      selected
        ? 'bg-yellow-500 text-gray-900'
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    }`;

  return (
    <div className="flex items-center gap-2 text-[10px] md:text-xs">
      <span className={`shrink-0 text-gray-400 ${compact ? 'w-10 md:w-16' : 'w-16'}`}>
        揃え:
      </span>
      <div
        className="flex min-w-0 flex-1 gap-1"
        role="group"
        aria-label={`${ariaLabelPrefix}の文字揃え`}
      >
        {allowDefaultOption && (
          <button
            type="button"
            onClick={() => onSetTextAlign(null)}
            disabled={disabled}
            className={buttonClass(textAlign === null)}
            aria-label={`${ariaLabelPrefix}の文字揃え デフォルト`}
            aria-pressed={textAlign === null}
            title="一括設定の文字揃えに従う"
          >
            <ResponsiveButtonLabel full="デフォルト" short="既定" enabled={compact} />
          </button>
        )}
        {ALIGN_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSetTextAlign(option.value)}
            disabled={disabled}
            className={buttonClass(textAlign === option.value)}
            aria-label={`${ariaLabelPrefix}の文字揃え ${option.label}`}
            aria-pressed={textAlign === option.value}
            title={option.label}
          >
            <ResponsiveButtonLabel
              full={option.label}
              short={option.shortLabel}
              enabled={compact}
            />
          </button>
        ))}
      </div>
    </div>
  );
});

CaptionTextAlignField.displayName = 'CaptionTextAlignField';

export default CaptionTextAlignField;
