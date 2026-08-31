import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NumericSliderField from '../components/common/NumericSliderField';
import { HOLD_REPEAT_INITIAL_DELAY_MS } from '../utils/holdToRepeat';

describe('NumericSliderField', () => {
  const renderField = (overrides: Partial<React.ComponentProps<typeof NumericSliderField>> = {}) => {
    const onChange = vi.fn();
    render(
      <NumericSliderField
        value={20}
        min={0}
        max={30}
        step={0.1}
        onChange={onChange}
        label="終了"
        unit="秒"
        ariaLabel="終了位置"
        {...overrides}
      />
    );
    return { onChange };
  };

  const getNumberInput = () => screen.getByLabelText('終了位置（数値）') as HTMLInputElement;

  it('入力途中では onChange を呼ばず、確定時にまとめて反映する', () => {
    const { onChange } = renderField();
    const input = getNumberInput();

    // 全消し → 「1」→「0」と打つ流れ。従来はここで最小値クランプが割り込んでいた
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '10' } });

    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('10');

    fireEvent.blur(input, { target: { value: '10' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it('空欄のまま確定しても値を変更しない', () => {
    const { onChange } = renderField();
    const input = getNumberInput();

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input, { target: { value: '' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('確定時に範囲外の値を min / max へ収める', () => {
    const { onChange } = renderField();
    const input = getNumberInput();

    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.blur(input, { target: { value: '999' } });

    expect(onChange).toHaveBeenCalledWith(30);
  });

  it('Enter で確定できる', () => {
    const { onChange } = renderField();
    const input = getNumberInput();

    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input, { target: { value: '5' } });

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('Escape で編集を破棄し元の値へ戻す', () => {
    const { onChange } = renderField();
    const input = getNumberInput();

    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('20');
  });

  it('− / + ボタンが step 単位で値を増減する', () => {
    const { onChange } = renderField();

    fireEvent.click(screen.getByLabelText('終了位置を0.1増やす'));
    expect(onChange).toHaveBeenLastCalledWith(20.1);

    fireEvent.click(screen.getByLabelText('終了位置を0.1減らす'));
    expect(onChange).toHaveBeenLastCalledWith(19.9);
  });

  it('stepperStep を指定するとスライダーの刻みと別の増減量を使える', () => {
    const { onChange } = renderField({ step: 0.1, stepperStep: 1 });

    fireEvent.click(screen.getByLabelText('終了位置を1増やす'));
    expect(onChange).toHaveBeenLastCalledWith(21);
  });

  it('端の値ではステッパーを無効化して範囲外操作を防ぐ', () => {
    renderField({ value: 30 });
    expect(screen.getByLabelText('終了位置を0.1増やす')).toBeDisabled();
    expect(screen.getByLabelText('終了位置を0.1減らす')).not.toBeDisabled();
  });

  it('浮動小数の誤差を step の桁数で丸める', () => {
    const { onChange } = renderField({ value: 0.3, step: 0.1 });

    fireEvent.click(screen.getByLabelText('終了位置を0.1増やす'));
    // 0.3 + 0.1 が 0.30000000000000004 にならないこと
    expect(onChange).toHaveBeenLastCalledWith(0.4);
  });

  it('disabled のときはスライダー・数値欄・ステッパーをすべて無効化する', () => {
    renderField({ disabled: true });

    expect(getNumberInput()).toBeDisabled();
    expect(screen.getByLabelText('終了位置を0.1増やす')).toBeDisabled();
    expect(screen.getByLabelText('終了位置を0.1減らす')).toBeDisabled();
    expect(screen.getByLabelText('終了位置')).toBeDisabled();
  });

  it('＋が上限を超えるときは step 格子外の max そのものへ収める', () => {
    const { onChange } = renderField({ value: 7, min: 0, max: 7.04, step: 0.1 });

    fireEvent.click(screen.getByLabelText('終了位置を0.1増やす'));
    expect(onChange).toHaveBeenCalledWith(7.04);
  });

  it('max が step 格子外でも右端の値を 0.1 へ丸め戻さない', () => {
    const { onChange } = renderField({ value: 7, min: 0, max: 7.04, step: 0.1 });

    fireEvent.change(screen.getByLabelText('終了位置'), { target: { value: '7.04' } });
    expect(onChange).toHaveBeenCalledWith(7.04);
  });

  it('実尺の端数は数値欄にそのまま出す', () => {
    renderField({ value: 7.04, min: 0, max: 7.04, step: 0.1 });

    expect(getNumberInput().value).toBe('7.04');
    expect(screen.getByLabelText('終了位置を0.1増やす')).toBeDisabled();
  });

  it('スライダー操作は従来どおり即時反映する', () => {
    const { onChange } = renderField();

    fireEvent.change(screen.getByLabelText('終了位置'), { target: { value: '12.5' } });
    expect(onChange).toHaveBeenCalledWith(12.5);
  });

  it('hideInput でも −/+ の単発クリックで増減する', () => {
    const { onChange } = renderField({ hideInput: true });

    fireEvent.click(screen.getByLabelText('終了位置を0.1増やす'));
    expect(onChange).toHaveBeenLastCalledWith(20.1);
  });
});

const StatefulNumericSliderField = ({
  initialValue = 0,
  max = 100,
}: {
  initialValue?: number;
  max?: number;
}) => {
  const [value, setValue] = useState(initialValue);
  return (
    <NumericSliderField
      value={value}
      min={0}
      max={max}
      step={1}
      onChange={setValue}
      ariaLabel="値"
    />
  );
};

const pointerDownPlus = () => {
  fireEvent.pointerDown(screen.getByLabelText('値を1増やす'), {
    button: 0,
    pointerId: 1,
    clientX: 8,
    clientY: 8,
  });
};

describe('NumericSliderField hold-to-repeat', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('短押しの click は 1 ステップだけで、pointerdown だけでは値を変えない', () => {
    vi.useFakeTimers();
    render(<StatefulNumericSliderField />);
    const plus = screen.getByLabelText('値を1増やす');
    const input = screen.getByLabelText('値（数値）') as HTMLInputElement;

    fireEvent.pointerDown(plus, { button: 0, pointerId: 1, clientX: 8, clientY: 8 });
    expect(input.value).toBe('0');

    fireEvent.pointerUp(plus, { pointerId: 1 });
    fireEvent.click(plus);
    expect(input.value).toBe('1');
  });

  it('長押しすると遅延のあと繰り返し増減し、離すと止まる', () => {
    vi.useFakeTimers();
    render(<StatefulNumericSliderField />);
    const plus = screen.getByLabelText('値を1増やす');
    const input = screen.getByLabelText('値（数値）') as HTMLInputElement;

    pointerDownPlus();
    act(() => {
      vi.advanceTimersByTime(HOLD_REPEAT_INITIAL_DELAY_MS - 1);
    });
    expect(input.value).toBe('0');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    const afterFirstRepeat = Number(input.value);
    expect(afterFirstRepeat).toBeGreaterThanOrEqual(1);

    act(() => {
      vi.advanceTimersByTime(600);
    });
    const whileHolding = Number(input.value);
    expect(whileHolding).toBeGreaterThan(afterFirstRepeat);

    fireEvent.pointerUp(plus, { pointerId: 1 });
    const afterRelease = Number(input.value);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(Number(input.value)).toBe(afterRelease);
  });

  it('長押し後の click は二重に増減しない', () => {
    vi.useFakeTimers();
    render(<StatefulNumericSliderField />);
    const plus = screen.getByLabelText('値を1増やす');
    const input = screen.getByLabelText('値（数値）') as HTMLInputElement;

    pointerDownPlus();
    act(() => {
      vi.advanceTimersByTime(HOLD_REPEAT_INITIAL_DELAY_MS + 50);
    });
    const heldValue = Number(input.value);
    expect(heldValue).toBeGreaterThanOrEqual(1);

    fireEvent.pointerUp(plus, { pointerId: 1 });
    fireEvent.click(plus);
    expect(Number(input.value)).toBe(heldValue);
  });

  it('長押し中に指が動くと繰り返しを始めず、click も抑止する', () => {
    vi.useFakeTimers();
    render(<StatefulNumericSliderField />);
    const plus = screen.getByLabelText('値を1増やす');
    const input = screen.getByLabelText('値（数値）') as HTMLInputElement;

    pointerDownPlus();
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 8, clientY: 28 });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(input.value).toBe('0');

    fireEvent.pointerUp(plus, { pointerId: 1 });
    fireEvent.click(plus);
    expect(input.value).toBe('0');
  });

  it('上限に達したら繰り返しを止める', () => {
    vi.useFakeTimers();
    render(<StatefulNumericSliderField initialValue={8} max={10} />);
    pointerDownPlus();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect((screen.getByLabelText('値（数値）') as HTMLInputElement).value).toBe('10');
    expect(screen.getByLabelText('値を1増やす')).toBeDisabled();
  });
});
