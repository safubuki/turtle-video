import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CaptionColorField from '../components/common/CaptionColorField';

const setMobileMedia = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

afterEach(() => setMobileMedia(false));

describe('スマホ用カラーピッカー', () => {
  it('黒から開いた時は彩度と値を右端にし、設定するまで元の色を変更しない', () => {
    setMobileMedia(true);
    const onChange = vi.fn();
    render(
      <CaptionColorField
        label="縁の色"
        value="#000000"
        fallback="#000000"
        ariaLabelPrefix="個別キャプション"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '個別キャプションの縁の色' }));

    expect(screen.getByRole('dialog', { name: '個別キャプションの縁の色を選択' }))
      .toBeInTheDocument();
    expect(screen.getByLabelText('個別キャプションの縁の色の彩度')).toHaveValue('100');
    expect(screen.getByLabelText('個別キャプションの縁の色の値')).toHaveValue('100');
    expect(screen.getByText('#FF0000')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('設定を押した時だけ選択中の色を確定する', () => {
    setMobileMedia(true);
    const onChange = vi.fn();
    render(
      <CaptionColorField
        label="背景色"
        value="#000000"
        fallback="#000000"
        ariaLabelPrefix="キャプション"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'キャプションの背景色' }));
    fireEvent.change(screen.getByLabelText('キャプションの背景色の色調'), {
      target: { value: '120' },
    });
    fireEvent.click(screen.getByRole('button', { name: '設定' }));

    expect(onChange).toHaveBeenCalledWith('#00FF00');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('PCでは従来のネイティブ色入力を維持する', () => {
    setMobileMedia(false);
    const onChange = vi.fn();
    render(
      <CaptionColorField
        label="文字本体"
        value="#FFFFFF"
        fallback="#FFFFFF"
        ariaLabelPrefix="キャプション"
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText('キャプションの文字本体');
    expect(input).toHaveAttribute('type', 'color');
    fireEvent.change(input, { target: { value: '#123456' } });
    expect(onChange).toHaveBeenCalledWith('#123456');
  });
});
