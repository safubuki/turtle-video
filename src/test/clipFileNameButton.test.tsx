import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClipFileNameButton from '../components/media/ClipFileNameButton';

const LONG_NAME = 'Mascot_playing_baseball_full_title.mp4';

function installMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
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
}

describe('ClipFileNameButton', () => {
  it('マウスオーバーで全文を出し、クリックではカードを開く', () => {
    installMatchMedia(true);
    const onActivate = vi.fn();
    render(<ClipFileNameButton name={LONG_NAME} onActivate={onActivate} />);

    fireEvent.mouseEnter(screen.getByTestId('clip-file-name'));
    expect(screen.getByTestId('clip-file-name-popup')).toHaveTextContent(LONG_NAME);

    fireEvent.mouseLeave(screen.getByTestId('clip-file-name'));
    expect(screen.queryByTestId('clip-file-name-popup')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('clip-file-name'));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('タップでもカードを開閉し、開いたときはファイル名を2行まで表示する', () => {
    installMatchMedia(false);
    const onActivate = vi.fn();
    const { rerender } = render(<ClipFileNameButton name={LONG_NAME} onActivate={onActivate} />);

    fireEvent.click(screen.getByTestId('clip-file-name'));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('clip-file-name-popup')).not.toBeInTheDocument();

    rerender(<ClipFileNameButton name={LONG_NAME} isOpen onActivate={onActivate} />);
    expect(screen.getByTestId('clip-file-name')).toHaveAccessibleName(`${LONG_NAME}のカードを閉じる`);
    expect(screen.getByText(LONG_NAME)).toHaveClass('line-clamp-2');
    fireEvent.click(screen.getByTestId('clip-file-name'));
    expect(onActivate).toHaveBeenCalledTimes(2);
  });
});
