import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CaptionSettingsModal from '../components/modals/CaptionSettingsModal';
import type { Caption, CaptionSettings } from '../types';

const settings: CaptionSettings = {
  enabled: true,
  fontSize: 'medium',
  fontStyle: 'gothic',
  fontColor: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 4,
  position: 'bottom',
  blur: 1.5,
  bulkFadeIn: false,
  bulkFadeOut: false,
  bulkFadeInDuration: 0.5,
  bulkFadeOutDuration: 0.5,
};

describe('CaptionSettingsModal clear', () => {
  it('clears only the selected caption individual settings and closes the modal', () => {
    const caption: Caption = {
      id: 'caption-1',
      text: '本文',
      startTime: 2,
      endTime: 6,
      fadeIn: true,
      fadeOut: true,
      fadeInDuration: 0.5,
      fadeOutDuration: 0.5,
      overrideFontStyle: 'mincho',
      overrideFadeOut: 'on',
      overrideFadeOutDuration: 1,
    };
    const onUpdate = vi.fn();
    const onClose = vi.fn();
    render(<CaptionSettingsModal caption={caption} settings={settings} onUpdate={onUpdate} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /この個別設定をクリア/ }));

    expect(onUpdate).toHaveBeenCalledWith('caption-1', expect.objectContaining({
      overrideFontStyle: undefined,
      overrideFontColor: undefined,
      overrideStrokeColor: undefined,
      overrideStrokeWidth: undefined,
      overrideBlur: undefined,
      overrideFadeOut: undefined,
      overrideFadeOutDuration: undefined,
      sequentialFadeMode: undefined,
      sequentialGapSec: undefined,
    }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('文字の縁・色を初期状態では閉じ、一括設定値から個別値へ変更できる', () => {
    const caption: Caption = {
      id: 'caption-1',
      text: '本文',
      startTime: 0,
      endTime: 3,
      fadeIn: false,
      fadeOut: false,
      fadeInDuration: 0.5,
      fadeOutDuration: 0.5,
    };
    const onUpdate = vi.fn();
    render(<CaptionSettingsModal caption={caption} settings={settings} onUpdate={onUpdate} onClose={vi.fn()} />);

    const accordion = screen.getByRole('button', { name: '文字の縁・色' });
    expect(accordion).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('個別キャプションの縁の幅')).not.toBeInTheDocument();

    fireEvent.click(accordion);

    expect(accordion).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('個別キャプションの縁の幅（数値）')).toHaveValue(4);
    expect(screen.getByLabelText('個別キャプションの縁の色（16進数）')).toHaveValue('#000000');
    expect(screen.getByLabelText('個別キャプションの文字本体（16進数）')).toHaveValue('#FFFFFF');

    fireEvent.change(screen.getByLabelText('個別キャプションの縁の幅（数値）'), {
      target: { value: '6.5' },
    });
    fireEvent.change(screen.getByLabelText('個別キャプションの縁の色'), {
      target: { value: '#123456' },
    });
    fireEvent.change(screen.getByLabelText('個別キャプションの文字本体（16進数）'), {
      target: { value: '#f0a' },
    });
    fireEvent.blur(screen.getByLabelText('個別キャプションの文字本体（16進数）'));

    expect(onUpdate).toHaveBeenCalledWith('caption-1', { overrideStrokeWidth: 6.5 });
    expect(onUpdate).toHaveBeenCalledWith('caption-1', { overrideStrokeColor: '#123456' });
    expect(onUpdate).toHaveBeenCalledWith('caption-1', { overrideFontColor: '#FF00AA' });
  });

  it('ぼかしを個別設定でき、縁・色とぼかしだけを一括設定へ戻せる', () => {
    const caption: Caption = {
      id: 'caption-1',
      text: '本文',
      startTime: 0,
      endTime: 3,
      fadeIn: false,
      fadeOut: false,
      fadeInDuration: 0.5,
      fadeOutDuration: 0.5,
      overrideFontColor: '#00FF00',
      overrideStrokeColor: '#FF0000',
      overrideStrokeWidth: 8,
      overrideBlur: 2.5,
    };
    const onUpdate = vi.fn();
    render(<CaptionSettingsModal caption={caption} settings={settings} onUpdate={onUpdate} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('個別キャプションのぼかし'), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: '文字の縁・色' }));
    fireEvent.click(screen.getByRole('button', { name: '文字の縁・色を一括設定に戻す' }));
    fireEvent.click(screen.getByRole('button', { name: 'ぼかしを一括設定に戻す' }));

    expect(onUpdate).toHaveBeenCalledWith('caption-1', { overrideBlur: 3 });
    expect(onUpdate).toHaveBeenCalledWith('caption-1', {
      overrideStrokeWidth: undefined,
      overrideStrokeColor: undefined,
      overrideFontColor: undefined,
    });
    expect(onUpdate).toHaveBeenCalledWith('caption-1', { overrideBlur: undefined });
  });
});
