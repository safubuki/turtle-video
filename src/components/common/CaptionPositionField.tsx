/**
 * @file CaptionPositionField.tsx
 * @author Turtle Village
 * @description 表示位置設定（上/中央/下 + カスタム XY）の共通コントロール。
 *
 * キャプションの一括スタイル設定とキャプション個別設定モーダルが
 * **同じ見た目・同じ操作感**になるよう、実装をここへ 1 本化する。
 * カスタム XY は standard フレーバー限定のため `supportsCustom` で切り替える。
 *
 * `allowDefaultOption` を立てると先頭に「デフォルト」（一括設定を継承）が増え、
 * `position` に null を渡せるようになる（個別設定モーダル用）。
 */
import React from 'react';
import type { CaptionPosition } from '../../types';
import { SwipeProtectedSlider } from '../SwipeProtectedSlider';
import {
  CAPTION_POSITION_CUSTOM_DEFAULT,
  clampPositionPercent,
} from '../../utils/captionStyle';
import ResponsiveButtonLabel from './ResponsiveButtonLabel';

export const CAPTION_POSITION_OPTIONS: {
  value: CaptionPosition;
  label: string;
  /** 幅の狭い場所（個別設定モーダル）で使う短縮ラベル */
  shortLabel: string;
}[] = [
  { value: 'top', label: '上部', shortLabel: '上' },
  { value: 'center', label: '中央', shortLabel: '中' },
  { value: 'bottom', label: '下部', shortLabel: '下' },
];

interface CaptionPositionFieldProps {
  /** 選択中のプリセット。個別設定で未指定（一括設定を継承）のときは null */
  position: CaptionPosition | null;
  /** カスタム XY（%）。null でプリセット使用 */
  positionCustom: { x: number; y: number } | null | undefined;
  disabled?: boolean;
  /** カスタム XY 指定を許可するか（standard フレーバー限定機能） */
  supportsCustom: boolean;
  /** 「デフォルト」（一括設定を継承）を選べるようにするか */
  allowDefaultOption?: boolean;
  /**
   * 幅が狭い場所（個別設定モーダル）向けのレイアウト。
   * 「デフォルト」が増えてボタンが 1 つ多くなるため、**スマホ幅でだけ**
   * 短縮ラベル・詰めたラベル列に切り替えて折り返しを防ぐ。
   * PC（md 以上）ではモーダルが横広になるので一括設定と同じ表示に戻る。
   */
  compact?: boolean;
  /** スライダー等の aria-label 接頭辞 */
  ariaLabelPrefix: string;
  /** input 要素の id 接頭辞（同一画面に複数置くため一意化する） */
  idPrefix: string;
  onSetPosition: (position: CaptionPosition | null) => void;
  onSetPositionCustom: (value: { x: number; y: number } | null) => void;
}

const CaptionPositionField = React.memo<CaptionPositionFieldProps>(({
  position,
  positionCustom,
  disabled = false,
  supportsCustom,
  allowDefaultOption = false,
  compact = false,
  ariaLabelPrefix,
  idPrefix,
  onSetPosition,
  onSetPositionCustom,
}) => {
  const isCustom = positionCustom != null;
  const isDefaultSelected = allowDefaultOption && !isCustom && position === null;
  const customPosition = positionCustom ?? CAPTION_POSITION_CUSTOM_DEFAULT;

  const handleAxisChange = (axis: 'x' | 'y', value: number) => {
    onSetPositionCustom({ ...customPosition, [axis]: clampPositionPercent(value) });
  };

  return (
    <>
      <div className="flex items-center gap-2 text-[10px] md:text-xs">
        <span className={`text-gray-400 shrink-0 ${compact ? 'w-10 md:w-16' : 'w-16'}`}>位置:</span>
        <div className="flex gap-1 flex-1 min-w-0">
          {/* 個別設定のみ: 一括設定を継承する「デフォルト」 */}
          {allowDefaultOption && (
            <button
              onClick={() => {
                onSetPositionCustom(null);
                onSetPosition(null);
              }}
              disabled={disabled}
              className={`min-w-0 flex-1 px-0.5 py-1 rounded transition whitespace-nowrap ${
                isDefaultSelected
                  ? 'bg-yellow-500 text-gray-900'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } disabled:opacity-50`}
              title="一括設定の表示位置に従う"
              aria-label={`${ariaLabelPrefix}の表示位置 デフォルト`}
            >
              <ResponsiveButtonLabel full="デフォルト" short="既定" enabled={compact} />
            </button>
          )}
          {CAPTION_POSITION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onSetPositionCustom(null);
                onSetPosition(opt.value);
              }}
              disabled={disabled}
              className={`min-w-0 flex-1 px-0.5 py-1 rounded transition whitespace-nowrap ${
                !isCustom && position === opt.value
                  ? 'bg-yellow-500 text-gray-900'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } disabled:opacity-50`}
              title={opt.label}
              aria-label={`${ariaLabelPrefix}の表示位置 ${opt.label}`}
            >
              <ResponsiveButtonLabel full={opt.label} short={opt.shortLabel} enabled={compact} />
            </button>
          ))}
          {supportsCustom && (
            <button
              onClick={() => {
                if (!isCustom) onSetPositionCustom({ ...CAPTION_POSITION_CUSTOM_DEFAULT });
              }}
              disabled={disabled}
              className={`min-w-0 flex-1 px-0.5 py-1 rounded transition whitespace-nowrap ${
                isCustom
                  ? 'bg-yellow-500 text-gray-900'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } disabled:opacity-50`}
              title="XY 座標で自由に配置"
              aria-label={`${ariaLabelPrefix}の表示位置 カスタム`}
            >
              <ResponsiveButtonLabel full="カスタム" short="任意" enabled={compact} />
            </button>
          )}
        </div>
      </div>
      {/* カスタム位置入力（キャンバスに対する % / テキスト中心） */}
      {supportsCustom && isCustom && (
        <div className={`space-y-1.5 ${compact ? 'pl-10 md:pl-16' : 'pl-16'}`}>
          {(['x', 'y'] as const).map((axis) => (
            <div key={axis} className="flex items-center gap-2 text-[10px] md:text-xs">
              <span className="text-gray-500 w-4 uppercase">{axis}</span>
              <SwipeProtectedSlider
                min={0}
                max={100}
                step={1}
                value={customPosition[axis]}
                onChange={(val) => handleAxisChange(axis, val)}
                disabled={disabled}
                ariaLabel={`${ariaLabelPrefix}の表示位置 ${axis.toUpperCase()}`}
                className={`flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${disabled ? '' : 'cursor-pointer'}`}
              />
              <input
                id={`${idPrefix}-position-custom-${axis}`}
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round(customPosition[axis])}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!Number.isNaN(val)) handleAxisChange(axis, val);
                }}
                disabled={disabled}
                aria-label={`${ariaLabelPrefix}の表示位置 ${axis.toUpperCase()}（数値）`}
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
    </>
  );
});

CaptionPositionField.displayName = 'CaptionPositionField';

export default CaptionPositionField;
