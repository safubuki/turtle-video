import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Header from '../components/Header';

describe('header flavor badge placement', () => {
  it('Header はタイトルを従来どおり表示し、flavor badge を表示しない', () => {
    render(
      <Header
        onOpenSettings={vi.fn()}
        onOpenProjectManager={vi.fn()}
        onOpenAppHelp={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'タートルビデオ' })).toBeInTheDocument();
    expect(screen.queryByText('標準モード')).not.toBeInTheDocument();
    expect(screen.queryByText('Apple Safari 動作モード')).not.toBeInTheDocument();
    expect(screen.queryByText('Safari動作')).not.toBeInTheDocument();
  });

  it('Header に一括クリアボタンを表示し、クリックと無効状態を制御できる', () => {
    const onClearAll = vi.fn();
    const { rerender } = render(
      <Header
        onOpenSettings={vi.fn()}
        onOpenProjectManager={vi.fn()}
        onOpenAppHelp={vi.fn()}
        onClearAll={onClearAll}
        clearAllDisabled={false}
      />,
    );

    const clearButton = screen.getByRole('button', { name: '一括クリア' });
    expect(clearButton).not.toBeDisabled();
    fireEvent.click(clearButton);
    expect(onClearAll).toHaveBeenCalledTimes(1);

    rerender(
      <Header
        onOpenSettings={vi.fn()}
        onOpenProjectManager={vi.fn()}
        onOpenAppHelp={vi.fn()}
        onClearAll={onClearAll}
        clearAllDisabled
      />,
    );
    expect(screen.getByRole('button', { name: '一括クリア' })).toBeDisabled();
  });
});