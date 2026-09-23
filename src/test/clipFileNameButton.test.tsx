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

  it('タップでは全文を出し、カードは開閉しない', () => {
    installMatchMedia(false);
    const onActivate = vi.fn();
    render(<ClipFileNameButton name={LONG_NAME} onActivate={onActivate} />);

    fireEvent.click(screen.getByTestId('clip-file-name'));
    expect(screen.getByTestId('clip-file-name-popup')).toHaveTextContent(LONG_NAME);
    expect(onActivate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'ファイル名の表示を閉じる' }));
    expect(screen.queryByTestId('clip-file-name-popup')).not.toBeInTheDocument();
  });
});
