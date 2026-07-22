import type { ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CaptionSection from '../components/sections/CaptionSection';
import type { Caption } from '../types';

function renderCaptionSection(
  overrides: Partial<ComponentProps<typeof CaptionSection>> = {},
  openOutlineSettings = true
) {
  const props: ComponentProps<typeof CaptionSection> = {
    captions: [],
    settings: {
      enabled: true,
      fontSize: 'medium',
      fontStyle: 'gothic',
      fontColor: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 2,
      position: 'bottom',
      blur: 0,
      bulkFadeIn: false,
      bulkFadeOut: false,
      bulkFadeInDuration: 0.5,
      bulkFadeOutDuration: 0.5,
    },
    isLocked: false,
    totalDuration: 10,
    currentTime: 0,
    onToggleLock: vi.fn(),
    onAddCaption: vi.fn(),
    onUpdateCaption: vi.fn(),
    onRemoveCaption: vi.fn(),
    onMoveCaption: vi.fn(),
    onSetEnabled: vi.fn(),
    onSetFontSize: vi.fn(),
    onSetFontStyle: vi.fn(),
    onSetFontColor: vi.fn(),
    onSetStrokeColor: vi.fn(),
    onSetStrokeWidth: vi.fn(),
    onSetPosition: vi.fn(),
    onSetBlur: vi.fn(),
    onSetFontSizeCustom: vi.fn(),
    onSetPositionCustom: vi.fn(),
    onSetBulkFadeIn: vi.fn(),
    onSetBulkFadeOut: vi.fn(),
    onSetBulkFadeInDuration: vi.fn(),
    onSetBulkFadeOutDuration: vi.fn(),
    onOpenHelp: vi.fn(),
    formatTime: (seconds) => `${seconds.toFixed(1)}s`,
    onApplyCaptions: vi.fn(),
    onShiftCaptions: vi.fn(),
    isPlaying: false,
    onTogglePlay: vi.fn(),
    onSeekBy: vi.fn(),
    onUpdateCaptionLive: vi.fn(),
    ...overrides,
  };

  render(<CaptionSection {...props} />);
  if (openOutlineSettings) {
    fireEvent.click(screen.getByRole('button', { name: 'スタイル/フェード一括設定' }));
    fireEvent.click(screen.getByRole('button', { name: '文字の縁・色' }));
  }
  return props;
}

describe('CaptionSection outline and color controls', () => {
  it('詳細設定は閉じている間だけ「（開いて設定）」を表示する', () => {
    renderCaptionSection({}, false);
    const styleButton = screen.getByRole('button', { name: 'スタイル/フェード一括設定' });

    expect(styleButton).toHaveAttribute('aria-expanded', 'false');
    expect(within(styleButton).getByText('（開いて設定）')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '文字の縁・色' })).not.toBeInTheDocument();

    fireEvent.click(styleButton);

    expect(styleButton).toHaveAttribute('aria-expanded', 'true');
    expect(within(styleButton).queryByText('（開いて設定）')).not.toBeInTheDocument();

    const outlineButton = screen.getByRole('button', { name: '文字の縁・色' });
    expect(outlineButton).toHaveAttribute('aria-expanded', 'false');
    expect(within(outlineButton).getByText('（開いて設定）')).toBeInTheDocument();
    expect(screen.queryByLabelText('キャプションの縁の幅')).not.toBeInTheDocument();

    fireEvent.click(outlineButton);

    expect(outlineButton).toHaveAttribute('aria-expanded', 'true');
    expect(within(outlineButton).queryByText('（開いて設定）')).not.toBeInTheDocument();
    expect(screen.getByLabelText('キャプションの縁の幅')).toBeInTheDocument();
  });

  it('字体の直下で縁幅をスライダーと数値入力の両方から設定できる', () => {
    const props = renderCaptionSection();
    const fontLabel = screen.getByText('字体:');
    const strokeWidthLabel = screen.getByText('縁の幅:');

    expect(
      fontLabel.compareDocumentPosition(strokeWidthLabel) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText('キャプションの縁の幅'), {
      target: { value: '4.5' },
    });
    fireEvent.change(screen.getByLabelText('キャプションの縁の幅（数値）'), {
      target: { value: '7.5' },
    });

    expect(props.onSetStrokeWidth).toHaveBeenNthCalledWith(1, 4.5);
    expect(props.onSetStrokeWidth).toHaveBeenNthCalledWith(2, 7.5);
  });

  it('縁色と文字本体色をカラーピッカーまたは16進数入力から設定できる', () => {
    const props = renderCaptionSection();

    fireEvent.change(screen.getByLabelText('キャプションの縁の色（16進数）'), {
      target: { value: '#f0a' },
    });
    fireEvent.blur(screen.getByLabelText('キャプションの縁の色（16進数）'));
    fireEvent.change(screen.getByLabelText('キャプションの文字本体'), {
      target: { value: '#123456' },
    });

    expect(props.onSetStrokeColor).toHaveBeenCalledWith('#FF00AA');
    expect(props.onSetFontColor).toHaveBeenCalledWith('#123456');
  });

  it('ロック中は縁幅と色の入力をすべて無効化する', () => {
    renderCaptionSection({ isLocked: true });

    expect(screen.getByLabelText('キャプションの縁の幅')).toBeDisabled();
    expect(screen.getByLabelText('キャプションの縁の幅（数値）')).toBeDisabled();
    expect(screen.getByLabelText('キャプションの縁の色')).toBeDisabled();
    expect(screen.getByLabelText('キャプションの文字本体')).toBeDisabled();
  });
});

describe('CaptionSection bulk timing alignment', () => {
  const createCaption = (
    id: string,
    text: string,
    startTime: number,
    endTime: number
  ): Caption => ({
    id,
    text,
    startTime,
    endTime,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 0.5,
    fadeOutDuration: 0.5,
  });
  const captions = [
    createCaption('caption-1', '先頭', 2, 4),
    createCaption('caption-2', '二枚目', 5, 8),
    createCaption('caption-3', '三枚目', 9, 11),
  ];

  it('すべてのカードの先頭をプレビュー現在位置へ合わせる', () => {
    const props = renderCaptionSection({ captions, currentTime: 8.34 }, false);

    expect(screen.getByText('対象の先頭 0:02.0 → 0:08.3（+6.3秒）')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '現在位置（0:08.3）に先頭を合わせる' }));

    expect(props.onShiftCaptions).toHaveBeenCalledWith(6.3, 0);
    expect(screen.getByText('対象の先頭を 0:08.3 に合わせました（+6.3秒）')).toBeInTheDocument();
  });

  it('選択カード以降では、そのカードを先頭として現在位置へ合わせる', () => {
    const props = renderCaptionSection({ captions, currentTime: 1.2 }, false);

    fireEvent.change(screen.getByLabelText('ずらす対象のキャプションカード'), {
      target: { value: '1' },
    });
    expect(screen.getByText('対象の先頭 0:05.0 → 0:01.2（−3.8秒）')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '現在位置（0:01.2）に先頭を合わせる' }));

    expect(props.onShiftCaptions).toHaveBeenCalledWith(-3.8, 1);
  });

  it('対象の先頭が現在位置に合っているときは操作を無効にする', () => {
    const props = renderCaptionSection({ captions, currentTime: 2 }, false);
    const alignButton = screen.getByRole('button', {
      name: '現在位置（0:02.0）に先頭を合わせる',
    });

    expect(alignButton).toBeDisabled();
    expect(
      screen.getByText('対象の先頭は、すでにプレビューの現在位置に合っています。')
    ).toBeInTheDocument();
    fireEvent.click(alignButton);
    expect(props.onShiftCaptions).not.toHaveBeenCalled();
  });

  it('従来の秒数指定による早める・遅らせる操作も維持する', () => {
    const props = renderCaptionSection({ captions }, false);

    expect(screen.getByText('秒数で微調整:')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '遅らせる' }));

    expect(props.onShiftCaptions).toHaveBeenCalledWith(1, 0);
  });
});
