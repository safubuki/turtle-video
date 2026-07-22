import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CaptionBulkAddModal from '../components/modals/CaptionBulkAddModal';
import type { Caption } from '../types';

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

const createCaption = (overrides: Partial<Caption> = {}): Caption => ({
  id: 'caption-1',
  text: '1行目\n2行目',
  startTime: 1,
  endTime: 7,
  fadeIn: false,
  fadeOut: false,
  fadeInDuration: 1,
  fadeOutDuration: 1,
  ...overrides,
});

const renderEditingModal = (
  captions: Caption[],
  onApplyCaptions = vi.fn(),
  onClose = vi.fn(),
) => {
  render(
    <CaptionBulkAddModal
      captions={captions}
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
  it('exposes dialog semantics and closes with Escape', () => {
    const onClose = vi.fn();
    renderModal(vi.fn(), onClose);

    expect(screen.getByRole('dialog', { name: 'キャプションをまとめて入力' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

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

  it('時間付き時分割カードから + を削除すると別カードとして反映する', () => {
    const onApply = renderEditingModal([createCaption()]);
    const textarea = screen.getByPlaceholderText(/通常カード/) as HTMLTextAreaElement;
    expect(textarea.value).toBe('[00:01.0-00:07.0] 1行目\n+ 2行目');

    fireEvent.change(textarea, {
      target: { value: '[00:01.0-00:07.0] 1行目\n2行目' },
    });

    fireEvent.click(screen.getByRole('button', { name: '2件を反映' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'caption-1', text: '1行目', startTime: 1, endTime: 7 }),
      expect.objectContaining({ text: '2行目', startTime: 7.2, endTime: 10.2 }),
    ]);
    expect(onApply.mock.calls[0][0][1].id).toBeUndefined();
  });

  it('時分割ボタンでカーソル位置から後半を + 行へ移し、下部へスクロールする', async () => {
    renderModal();
    const textarea = screen.getByPlaceholderText(/通常カード/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '前半後半' } });
    textarea.focus();
    textarea.setSelectionRange(2, 2);
    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      value: 480,
    });
    textarea.scrollTop = 0;

    fireEvent.click(screen.getByRole('button', { name: /時分割行を追加/ }));

    expect(textarea.value).toBe('前半\n+ 後半');
    await waitFor(() => {
      expect(textarea.selectionStart).toBe(5);
      expect(textarea.selectionEnd).toBe(5);
      expect(textarea.scrollTop).toBe(480);
    });
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
