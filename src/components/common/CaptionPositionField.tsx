/**
 * @file CaptionPositionField.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
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
import NumericSliderField from './NumericSliderField';
import {
  CAPTION_POSITION_CUSTOM_DEFAULT,
  clampPositionPercent,
} from '../../utils/captionStyle';
import ResponsiveButtonLabel from './ResponsiveButtonLabel';
import {
  CENTER_ORIGIN_MAX,
  CENTER_ORIGIN_MIN,
  fromTopLeftPercent,
  roundCenterOrigin,
  toTopLeftPercent,
} from '../../utils/centerOriginPosition';

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
  /**
   * 現在のプリセット位置に相当するカスタム座標（左上原点 %）を返す。
   * 「カスタム」へ切り替えたときに**見た目を保ったまま**微調整を始められるようにする。
   * 未指定なら従来どおり既定値（中央）から始まる。
   */
  resolvePresetAsCustom?: () => { x: number; y: number };
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
  resolvePresetAsCustom,
}) => {
  const isCustom = positionCustom != null;
  const isDefaultSelected = allowDefaultOption && !isCustom && position === null;
  const customPosition = positionCustom ?? CAPTION_POSITION_CUSTOM_DEFAULT;

  /**
   * 表示は「中央原点・上が＋」の共通座標系（動画・画像・ロゴと同一）。
   * 保存値は従来どおり左上原点 0〜100% なので、ここで変換する。
   */
  const handleAxisChange = (axis: 'x' | 'y', shownValue: number) => {
    onSetPositionCustom({
      ...customPosition,
      [axis]: clampPositionPercent(toTopLeftPercent(shownValue, axis)),
    });
  };

  const displayPosition = (axis: 'x' | 'y') =>
    roundCenterOrigin(fromTopLeftPercent(customPosition[axis], axis));

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
                if (isCustom) return;
                // 直前のプリセット位置を引き継ぐ（下部に合わせてから微調整、が自然にできる）
                onSetPositionCustom(
                  resolvePresetAsCustom?.() ?? { ...CAPTION_POSITION_CUSTOM_DEFAULT },
                );
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
            <NumericSliderField
              key={axis}
              label={axis === 'x' ? '横 (右+)' : '縦 (上+)'}
              labelClassName="text-gray-500 w-10 shrink-0 whitespace-nowrap"
              min={CENTER_ORIGIN_MIN}
              max={CENTER_ORIGIN_MAX}
              step={1}
              value={displayPosition(axis)}
              onChange={(val) => handleAxisChange(axis, val)}
              disabled={disabled}
              ariaLabel={`${ariaLabelPrefix}の表示位置 ${axis.toUpperCase()}`}
              inputId={`${idPrefix}-position-custom-${axis}`}
              unit="%"
              sliderClassName={`flex-1 min-w-0 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${disabled ? '' : 'cursor-pointer'}`}
              inputClassName="w-14 focus:border-yellow-500"
            />
          ))}
          <div className="text-[9px] text-gray-500">
            中央が 0。横は右が＋、縦は上が＋（テキスト中心の位置）
          </div>
        </div>
      )}
    </>
  );
});

CaptionPositionField.displayName = 'CaptionPositionField';

export default CaptionPositionField;
