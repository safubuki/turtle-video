import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WatermarkOverlay } from '../types';
import OverlaySection from '../components/sections/OverlaySection';
import { DEFAULT_WATERMARK_OVERLAY } from '../utils/watermarkOverlay';

function renderSection(
  hasImage = false,
  overrides: Partial<WatermarkOverlay> = {},
) {
  const props = {
    watermark: {
      ...DEFAULT_WATERMARK_OVERLAY,
      file: hasImage ? new File(['logo'], 'logo.png', { type: 'image/png' }) : null,
      url: hasImage ? 'blob:logo' : null,
      endTime: 10,
      ...overrides,
    },
    totalDuration: 10,
    currentTime: 3.2,
    canvasWidth: 1920,
    canvasHeight: 1080,
    onImageSelect: vi.fn(),
    onUpdate: vi.fn(),
    onSetRange: vi.fn(),
    onRemoveImage: vi.fn(),
  };
  const result = render(<OverlaySection {...props} />);
  fireEvent.click(screen.getByText('ウォーターマーク'));
  return { ...result, props };
}

describe('OverlaySection', () => {
  it('PNG/JPEG/WebP の画像選択導線を表示する', () => {
    const { container, props } = renderSection(false);
    expect(screen.getByText('ロゴ画像を重ねる')).toBeInTheDocument();

    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('image/png,image/jpeg,image/webp');
    fireEvent.change(input, { target: { files: [file] } });
    expect(props.onImageSelect).toHaveBeenCalledWith(file);
  });

  it('表示切替で画像・調整値を削除せず enabled だけ更新する', () => {
    const { props } = renderSection(true);
    fireEvent.click(screen.getByRole('button', { name: 'ウォーターマークを非表示にする' }));
    expect(props.onUpdate).toHaveBeenCalledWith({ enabled: false });
    expect(screen.getByLabelText('ウォーターマークの横位置')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '円形' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('全体レイヤー')).not.toBeInTheDocument();
  });

  it('現在位置を開始・終了へ反映できる', () => {
    const { props } = renderSection(true);
    fireEvent.click(screen.getByRole('button', { name: '開始' }));
    expect(props.onSetRange).toHaveBeenCalledWith(3.2, 10, 10);
  });

  it('位置・倍率・透過・回転・ぼかしの既定値を個別に戻せる', () => {
    const { props } = renderSection(true, {
      positionX: 80,
      positionY: 20,
      size: 1.5,
      opacity: 0.4,
      rotation: 45,
      maskSize: 70,
      feather: 12,
    });

    fireEvent.click(screen.getByRole('button', { name: '横位置をデフォルトに戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '縦位置をデフォルトに戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '拡大率をデフォルトに戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '透過度をデフォルトに戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '回転をデフォルトに戻す' }));
    fireEvent.click(screen.getByRole('button', { name: 'マスクサイズをデフォルトに戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '周辺ぼかしをデフォルトに戻す' }));

    expect(props.onUpdate).toHaveBeenCalledWith({ positionX: 50 });
    expect(props.onUpdate).toHaveBeenCalledWith({ positionY: 50 });
    expect(props.onUpdate).toHaveBeenCalledWith({ size: 1 });
    expect(props.onUpdate).toHaveBeenCalledWith({ opacity: 1 });
    expect(props.onUpdate).toHaveBeenCalledWith({ rotation: 0 });
    expect(props.onUpdate).toHaveBeenCalledWith({ maskSize: 100 });
    expect(props.onUpdate).toHaveBeenCalledWith({ feather: 0 });
    const resetButton = screen.getByRole('button', { name: '横位置をデフォルトに戻す' });
    expect(resetButton).toHaveClass('text-gray-200');
    expect(resetButton.parentElement).toContainElement(screen.getByText('横位置'));
    const positionInput = screen.getByLabelText('横位置');
    const controlRow = positionInput.parentElement?.parentElement;
    expect(controlRow).toHaveClass('grid-cols-[5rem_minmax(0,1fr)_5rem]');
    expect(controlRow).toHaveClass('sm:grid-cols-[5.75rem_minmax(0,1fr)_5.5rem]');
  });

  it('左下・右下・中央・左上・右上の順で、画像サイズに応じた位置を簡単設定できる', () => {
    const { container, props } = renderSection(true);
    const thumbnail = container.querySelector('img');
    if (!thumbnail) throw new Error('watermark thumbnail not found');
    Object.defineProperty(thumbnail, 'naturalWidth', { configurable: true, value: 400 });
    Object.defineProperty(thumbnail, 'naturalHeight', { configurable: true, value: 200 });
    fireEvent.load(thumbnail);

    const group = screen.getByRole('group', { name: 'ウォーターマークの位置を簡単設定' });
    expect(group.parentElement).toHaveClass('border-b');
    expect(group.parentElement).not.toHaveClass('border-t');
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual([
      '左下',
      '右下',
      '中央',
      '左上',
      '右上',
    ]);

    fireEvent.click(within(group).getByRole('button', { name: '左下' }));
    const calls = props.onUpdate.mock.calls;
    const position = calls[calls.length - 1]?.[0];
    expect(position.positionX).toBe(9);
    expect(position.positionY).toBe(85);
  });
});
