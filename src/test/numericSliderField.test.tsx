import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NumericSliderField from '../components/common/NumericSliderField';

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

  it('スライダー操作は従来どおり即時反映する', () => {
    const { onChange } = renderField();

    fireEvent.change(screen.getByLabelText('終了位置'), { target: { value: '12.5' } });
    expect(onChange).toHaveBeenCalledWith(12.5);
  });
});
