import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CaptionSettingsModal from '../components/modals/CaptionSettingsModal';
import type { Caption } from '../types';

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
    render(<CaptionSettingsModal caption={caption} onUpdate={onUpdate} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /この個別設定をクリア/ }));

    expect(onUpdate).toHaveBeenCalledWith('caption-1', expect.objectContaining({
      overrideFontStyle: undefined,
      overrideFadeOut: undefined,
      overrideFadeOutDuration: undefined,
      sequentialFadeMode: undefined,
      sequentialGapSec: undefined,
    }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

