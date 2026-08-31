/**
 * @file NumericStepperInput.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 数値入力欄を −/+ ボタンで挟んだ共通コントロール。
 *
 * スマホでの数値調整が難しい問題（Issue: スライダー入力の操作性）への対応の中核。
 * `NumericSliderField` の右半分にあたり、スライダーを別レイアウトで持つ箇所
 * （ナレーションの開始位置など）から単体で使えるよう切り出している。
 *
 * ここが解決している 3 点:
 * 1. **ステッパー**: スライダーのつまみをタッチで目的の値へ合わせるのは難しいため、
 *    数値欄の隣で 1 ステップずつ確実に詰められるようにする。長押しすると徐々に加速する。
 * 2. **ドラフト入力**: 入力中の文字列を保持し、確定（blur / Enter）まで onChange を
 *    呼ばない。従来は 1 文字ごとに parseFloat + クランプが走り、全消し→「10」と打つ
 *    途中の「1」が最小値へ丸められて意図した値を入力できなかった。
 * 3. **タップで全選択**: フォーカス時に既存値を選択し、「全選択して上書き」の手間を省く。
 */
import React, { useCallback, useId, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useHoldToRepeat } from '../../hooks/useHoldToRepeat';

export interface NumericStepperInputProps {
  value: number;
  min: number;
  max: number;
  /** 数値欄の刻み。ステッパーの増減量は stepperStep があればそちらを優先 */
  step?: number;
  /** −/+ ボタン 1 回あたりの増減量。省略時は step と同じ */
  stepperStep?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** 数値欄の右に置く単位（「秒」「px」など） */
  unit?: string;
  /**
   * 数値欄の幅クラス。フォーカス色を変える場合は `focus:border-indigo-500` のように
   * **完全なクラス名**を含める（Tailwind は動的生成したクラス名を検出できない）。
   */
  inputClassName?: string;
  /** 表示時の小数桁数。省略時は step から推定する */
  decimals?: number;
  ariaLabel?: string;
  /** 数値欄の id。外部の label と紐付けたい場合に指定する（省略時は自動採番） */
  inputId?: string;
  /** ラッパーに付与する追加クラス */
  className?: string;
}

/** step の小数桁数を推定する（0.1 → 1, 2 → 0） */
export const inferDecimals = (step: number): number => {
  if (!Number.isFinite(step)) return 0;
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
};

/** 値を [min, max] に収め、指定桁数へ丸める（浮動小数の誤差対策を兼ねる） */
export const clampValue = (value: number, min: number, max: number, decimals: number): number => {
  const clamped = Math.min(max, Math.max(min, value));
  const factor = 10 ** decimals;
  return Math.round(clamped * factor) / factor;
};

/**
 * −/+ ボタンの共通スタイル。スマホで押しやすいよう 28px（h-7）を確保する。
 * 押下の縮小フィードバックは transform のみをアニメートし、
 * OS の「視差を減らす」設定時は motion-reduce で無効化する。
 */
export const STEPPER_BUTTON_CLASS =
  'shrink-0 flex items-center justify-center rounded border border-gray-600 bg-gray-700 text-gray-200 ' +
  'transition-[background-color,border-color,transform] select-none touch-manipulation h-7 w-7 md:h-6 md:w-6 ' +
  '[-webkit-touch-callout:none] ' +
  'active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ' +
  'hover:bg-gray-600 hover:border-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ' +
  'disabled:opacity-30 disabled:hover:bg-gray-700 disabled:hover:border-gray-600 disabled:active:scale-100';

interface StepperHoldButtonProps {
  disabled: boolean;
  currentValue: number;
  applyStep: (current: number) => number;
  ariaLabel: string;
  ariaControls?: string;
  children: React.ReactNode;
}

/** −/+ を長押しすると徐々に加速して増減する。単発 tap / click は従来どおり 1 ステップ */
export const StepperHoldButton = React.memo<StepperHoldButtonProps>(({
  disabled,
  currentValue,
  applyStep,
  ariaLabel,
  ariaControls,
  children,
}) => {
  const hold = useHoldToRepeat(applyStep, currentValue, disabled);
  return (
    <button
      type="button"
      disabled={disabled}
      className={STEPPER_BUTTON_CLASS}
      aria-label={ariaLabel}
      aria-controls={ariaControls}
      tabIndex={-1}
      title="長押しすると徐々に速くなります"
      {...hold}
    >
      {children}
    </button>
  );
});

StepperHoldButton.displayName = 'StepperHoldButton';

const NumericStepperInput = React.memo<NumericStepperInputProps>(({
  value,
  min,
  max,
  step = 1,
  stepperStep,
  onChange,
  disabled = false,
  unit,
  inputClassName = 'w-16 focus:border-blue-500',
  decimals,
  ariaLabel,
  inputId: inputIdProp,
  className = '',
}) => {
  const resolvedDecimals = decimals ?? inferDecimals(step);
  const stepAmount = stepperStep ?? step;
  const displayValue = clampValue(value, min, max, resolvedDecimals);
  const generatedId = useId();
  const inputId = inputIdProp ?? generatedId;

  // 入力中の生文字列。null = 非編集中（value をそのまま表示する）
  const [draft, setDraft] = useState<string | null>(null);

  const commitDraft = useCallback(
    (raw: string) => {
      setDraft(null);
      const parsed = parseFloat(raw);
      // 空欄・不正値は変更なしとして元の値へ戻す
      if (Number.isNaN(parsed)) return;
      const next = clampValue(parsed, min, max, resolvedDecimals);
      if (next !== displayValue) onChange(next);
    },
    [min, max, resolvedDecimals, displayValue, onChange]
  );

  const applyStepBy = useCallback(
    (direction: 1 | -1) => (from: number) => {
      // ステッパー操作は編集中のドラフトより現在の確定値を優先する
      setDraft(null);
      const next = clampValue(from + direction * stepAmount, min, max, resolvedDecimals);
      if (next !== from) onChange(next);
      return next;
    },
    [stepAmount, min, max, resolvedDecimals, onChange]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(null);
    }
  }, []);

  const label = ariaLabel ?? '値';

  return (
    <div className={`flex items-center gap-1.5 shrink-0 ${className}`}>
      <StepperHoldButton
        disabled={disabled || displayValue <= min}
        currentValue={displayValue}
        applyStep={applyStepBy(-1)}
        ariaLabel={`${label}を${stepAmount}減らす`}
        ariaControls={inputId}
      >
        <Minus className="w-3 h-3" aria-hidden="true" />
      </StepperHoldButton>
      <input
        id={inputId}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft ?? displayValue}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commitDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel}（数値）` : undefined}
        className={`${inputClassName} shrink-0 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-[10px] md:text-xs text-right focus:outline-none disabled:opacity-50`}
      />
      <StepperHoldButton
        disabled={disabled || displayValue >= max}
        currentValue={displayValue}
        applyStep={applyStepBy(1)}
        ariaLabel={`${label}を${stepAmount}増やす`}
        ariaControls={inputId}
      >
        <Plus className="w-3 h-3" aria-hidden="true" />
      </StepperHoldButton>
      {unit && <span className="text-[10px] md:text-xs text-gray-500 shrink-0 whitespace-nowrap">{unit}</span>}
    </div>
  );
});

NumericStepperInput.displayName = 'NumericStepperInput';

export default NumericStepperInput;
