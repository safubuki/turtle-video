import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PresetFadeDurationField from '../components/common/PresetFadeDurationField';

describe('PresetFadeDurationField', () => {
  it('2 秒から − を押すと隣の 1 秒を選ぶ', () => {
    const onChange = vi.fn();
    render(
      <PresetFadeDurationField
        value={2}
        onChange={onChange}
        ariaLabel="フェード時間"
        accentClassName="accent-yellow-500"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'フェード時間を0.5減らす' }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('スライダーの 1.5 秒は許可するプリセットへ丸める', () => {
    const onChange = vi.fn();
    render(
      <PresetFadeDurationField
        value={1}
        onChange={onChange}
        ariaLabel="フェード時間"
        accentClassName="accent-yellow-500"
      />,
    );
    fireEvent.change(screen.getByRole('slider', { name: 'フェード時間' }), {
      target: { value: '1.5' },
    });
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
