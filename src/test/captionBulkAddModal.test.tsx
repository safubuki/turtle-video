import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CaptionBulkAddModal from '../components/modals/CaptionBulkAddModal';

const renderModal = (onApplyCaptions = vi.fn(), onClose = vi.fn()) => {
  render(
    <CaptionBulkAddModal
      captions={[]}
      totalDuration={30}
      currentTime={0}
      formatTime={(seconds) => `${seconds.toFixed(1)}s`}
      onApplyCaptions={onApplyCaptions}
      onClose={onClose}
    />,
  );
  return onApplyCaptions;
};

describe('CaptionBulkAddModal split modes', () => {
  it('restores blank-line time-split input to one line per card', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: '空行で時分割' }));
    const textarea = screen.getByPlaceholderText(/この工場では/);
    fireEvent.change(textarea, { target: { value: 'A\nB\n\nC' } });

    fireEvent.click(screen.getByRole('button', { name: '1行カード' }));

    expect((textarea as HTMLTextAreaElement).value).toBe('A\nB\nC');
    expect(screen.getByRole('button', { name: '3件を追加' })).toBeEnabled();
  });

  it('creates only + continuation lines as a time-split card in hybrid mode', () => {
    const onApply = renderModal();
    const textarea = screen.getByPlaceholderText(/通常カード/);
    fireEvent.change(textarea, { target: { value: '通常A\n時分割A\n+ 時分割B\n通常B' } });

    fireEvent.click(screen.getByRole('button', { name: '3件を追加' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].map((item: { text: string }) => item.text)).toEqual([
      '通常A',
      '時分割A\n時分割B',
      '通常B',
    ]);
  });

  it('removes only time notation from the text area', () => {
    renderModal();
    const textarea = screen.getByPlaceholderText(/通常カード/);
    fireEvent.change(textarea, {
      target: { value: '[00:01-00:04] 本文\n+ 続き\n[注釈] 残す' },
    });

    fireEvent.click(screen.getByRole('button', { name: /時間指定だけ消す/ }));

    expect((textarea as HTMLTextAreaElement).value).toBe('本文\n+ 続き\n[注釈] 残す');
  });

  it('exposes an accessible close button that calls onClose', () => {
    const onClose = vi.fn();
    renderModal(vi.fn(), onClose);

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

