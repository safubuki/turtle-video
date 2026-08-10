/**
 * @file NumericSliderField.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description スライダー＋数値入力＋(−/+)ステッパーを 1 行にまとめた共通コントロール。
 *
 * スマホでの数値調整が難しい問題（Issue: スライダー入力の操作性）への対応。
 * スライダーのつまみをタッチで目的の値へピンポイントに合わせるのは至難なため、
 * 数値欄の左右に −/+ を添えて 1 ステップずつ確実に詰められるようにする。
 * −/+ を数値欄と隣接させることで「数値を微調整する道具」という意味づけが視覚的に
 * 一致し、親指の移動距離も最短になる（バーの両端に置くとバーが左右から圧迫される）。
 *
 * 数値欄まわりの挙動（確定時のみ反映・タップで全選択）は
 * [NumericStepperInput](./NumericStepperInput.tsx) 側に実装している。
 */
import React from 'react';
import { SwipeProtectedSlider } from '../SwipeProtectedSlider';
import NumericStepperInput, {
  STEPPER_BUTTON_CLASS,
  clampValue,
  inferDecimals,
} from './NumericStepperInput';
import { Minus, Plus } from 'lucide-react';

export interface NumericSliderFieldProps {
  value: number;
  min: number;
  max: number;
  /** スライダーの刻み。ステッパーの増減量は stepperStep があればそちらを優先 */
  step?: number;
  /** −/+ ボタン 1 回あたりの増減量。省略時は step と同じ */
  stepperStep?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** 行頭のラベル（「開始」「音量」など）。省略時はラベル列を描画しない */
  label?: string;
  /** ラベル列の幅クラス。行ごとの既存レイアウトに合わせて上書きする */
  labelClassName?: string;
  /** 数値欄の右に置く単位（「秒」「px」など） */
  unit?: string;
  /** スライダーの見た目。呼び出し元の accent 色をそのまま活かす */
  sliderClassName?: string;
  /**
   * 数値欄の幅クラス。フォーカス色を変える場合は `focus:border-green-500` のように
   * **完全なクラス名**を含める（Tailwind は動的生成したクラス名を検出できない）。
   */
  inputClassName?: string;
  /** 表示時の小数桁数。省略時は step から推定する */
  decimals?: number;
  /**
   * 数値入力欄を出さず −/+ だけを添える。
   * 値を見出し側に表示しているフル幅スライダー（位置・拡大・音量など）向け。
   * タップでの微調整という課題は同じなので、ステッパーだけを提供する。
   */
  hideInput?: boolean;
  ariaLabel?: string;
  /** 数値欄の id。外部の label と紐付けたい場合に指定する（省略時は自動採番） */
  inputId?: string;
  /** 行全体に付与する追加クラス */
  className?: string;
}

const NumericSliderField = React.memo<NumericSliderFieldProps>(({
  value,
  min,
  max,
  step = 1,
  stepperStep,
  onChange,
  disabled = false,
  label,
  labelClassName = 'text-gray-500 w-6 shrink-0',
  unit,
  sliderClassName = 'flex-1 min-w-0 accent-blue-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50',
  inputClassName = 'w-12 focus:border-blue-500',
  decimals,
  hideInput = false,
  ariaLabel,
  inputId,
  className = '',
}) => {
  const resolvedDecimals = decimals ?? inferDecimals(step);
  const stepAmount = stepperStep ?? step;
  const displayValue = clampValue(value, min, max, resolvedDecimals);
  const effectiveLabel = ariaLabel ?? label;

  const handleStep = (direction: 1 | -1) => {
    const next = clampValue(displayValue + direction * stepAmount, min, max, resolvedDecimals);
    if (next !== displayValue) onChange(next);
  };

  return (
    <div className={`flex items-center gap-1.5 text-[10px] md:text-xs ${className}`}>
      {label && <span className={labelClassName}>{label}</span>}
      <SwipeProtectedSlider
        min={min}
        max={max}
        step={step}
        value={displayValue}
        onChange={onChange}
        disabled={disabled}
        ariaLabel={effectiveLabel}
        className={sliderClassName}
      />
      {hideInput ? (
        // 値は呼び出し元の見出しに表示されているため、増減だけを提供する
        <>
          <button
            type="button"
            onClick={() => handleStep(-1)}
            disabled={disabled || displayValue <= min}
            className={STEPPER_BUTTON_CLASS}
            aria-label={`${effectiveLabel ?? '値'}を${stepAmount}減らす`}
            tabIndex={-1}
          >
            <Minus className="w-3 h-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => handleStep(1)}
            disabled={disabled || displayValue >= max}
            className={STEPPER_BUTTON_CLASS}
            aria-label={`${effectiveLabel ?? '値'}を${stepAmount}増やす`}
            tabIndex={-1}
          >
            <Plus className="w-3 h-3" aria-hidden="true" />
          </button>
        </>
      ) : (
        <NumericStepperInput
          value={value}
          min={min}
          max={max}
          step={step}
          stepperStep={stepperStep}
          onChange={onChange}
          disabled={disabled}
          unit={unit}
          inputClassName={inputClassName}
          decimals={decimals}
          ariaLabel={effectiveLabel}
          inputId={inputId}
        />
      )}
      {hideInput && unit && (
        <span className="text-gray-500 shrink-0 whitespace-nowrap">{unit}</span>
      )}
    </div>
  );
});

NumericSliderField.displayName = 'NumericSliderField';

export default NumericSliderField;
