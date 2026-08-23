import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CaptionSettingsModal from '../components/modals/CaptionSettingsModal';
import type { Caption, CaptionSettings } from '../types';
import { useCanvasStore } from '../stores/canvasStore';

const settings: CaptionSettings = {
  enabled: true,
  fontSize: 'medium',
  fontStyle: 'gothic',
  fontColor: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 4,
  position: 'bottom',
  blur: 1.5,
  backgroundEnabled: false,
  backgroundColor: '#000000',
  backgroundOpacity: 0.45,
  backgroundRadius: 16,
  bulkFadeIn: false,
  bulkFadeOut: false,
  bulkFadeInDuration: 0.5,
  bulkFadeOutDuration: 0.5,
};

describe('CaptionSettingsModal clear', () => {
  it('個別設定の補足説明を10px以上・高コントラストで表示する', () => {
    const caption: Caption = {
      id: 'caption-readable-help',
      text: '1行目\n2行目',
      startTime: 0,
      endTime: 3,
      fadeIn: false,
      fadeOut: false,
      fadeInDuration: 0.5,
      fadeOutDuration: 0.5,
      overridePositionCustom: { x: 50, y: 50 },
    };
    render(
      <CaptionSettingsModal
        caption={caption}
        settings={settings}
        onUpdate={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '文字の縁・色' }));
    const helperTexts = [
      '変更した項目だけ、このカードの個別設定として一括設定より優先します。',
      '中央が 0。横は右が＋、縦は上が＋（テキスト中心の位置）',
      'フェードの ON/OFF と時間は上のフェード設定（または一括設定）に従います',
      '行と行の間に何も表示しない間隔を挟みます（表示時間内で自動調整）',
      '※「デフォルト」選択時は一括設定の値に従います',
      '本文と開始・終了時間は変更しません',
    ];

    for (const text of helperTexts) {
      const helper = screen.getByText(text);
      expect(helper).toHaveClass('text-[10px]');
      expect(helper).toHaveClass('md:text-xs');
      expect(helper).toHaveClass('text-gray-400');
    }
  });

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
      overrideBackgroundEnabled: undefined,
      overrideBackgroundColor: undefined,
      overrideBackgroundOpacity: undefined,
      overrideBackgroundRadius: undefined,
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

    // 数値欄は入力途中では確定せず、フォーカスを外した時点で反映する
    const strokeNumber = screen.getByLabelText('個別キャプションの縁の幅（数値）');
    fireEvent.change(strokeNumber, { target: { value: '6.5' } });
    fireEvent.blur(strokeNumber, { target: { value: '6.5' } });
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

  it('背景の帯を個別でONにでき、一括設定へ戻せる', () => {
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
    const { rerender } = render(
      <CaptionSettingsModal caption={caption} settings={settings} onUpdate={onUpdate} onClose={vi.fn()} />,
    );

    expect(screen.queryByLabelText('個別キャプション背景の濃さ')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'キャプション背景の帯' }));
    expect(onUpdate).toHaveBeenCalledWith('caption-1', { overrideBackgroundEnabled: true });

    const enabledCaption: Caption = { ...caption, overrideBackgroundEnabled: true };
    rerender(
      <CaptionSettingsModal
        caption={enabledCaption}
        settings={settings}
        onUpdate={onUpdate}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('個別キャプション背景の濃さ')).toBeInTheDocument();
    expect(screen.getByLabelText('個別キャプション背景の角丸')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '背景の帯を一括設定に戻す' }));
    expect(onUpdate).toHaveBeenCalledWith('caption-1', {
      overrideBackgroundEnabled: undefined,
      overrideBackgroundColor: undefined,
      overrideBackgroundOpacity: undefined,
      overrideBackgroundRadius: undefined,
    });
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

  it('縦向きプロジェクトではスマホの画面高に合わせてミニプレビューの幅を抑える', () => {
    const previousCanvasState = useCanvasStore.getState();
    useCanvasStore.setState({ width: 720, height: 1280 });
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);

    try {
      const caption: Caption = {
        id: 'caption-portrait',
        text: '縦向きプレビュー',
        startTime: 0,
        endTime: 3,
        fadeIn: false,
        fadeOut: false,
        fadeInDuration: 0.5,
        fadeOutDuration: 0.5,
      };

      const { unmount } = render(
        <CaptionSettingsModal
          caption={caption}
          settings={settings}
          previewCanvasRef={{ current: null }}
          onUpdate={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByTestId('caption-mini-preview-container')).toHaveClass(
        'max-w-[clamp(12rem,24dvh,18rem)]',
      );
      expect(screen.getByTestId('caption-mini-preview-container')).not.toHaveClass('md:max-w-sm');
      unmount();
    } finally {
      getContextSpy.mockRestore();
      useCanvasStore.setState(previousCanvasState);
    }
  });

  it('横向きプロジェクトでは従来のミニプレビュー幅を維持する', () => {
    const previousCanvasState = useCanvasStore.getState();
    useCanvasStore.setState({ width: 1280, height: 720 });
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);

    try {
      const caption: Caption = {
        id: 'caption-landscape',
        text: '横向きプレビュー',
        startTime: 0,
        endTime: 3,
        fadeIn: false,
        fadeOut: false,
        fadeInDuration: 0.5,
        fadeOutDuration: 0.5,
      };

      const { unmount } = render(
        <CaptionSettingsModal
          caption={caption}
          settings={settings}
          previewCanvasRef={{ current: null }}
          onUpdate={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByTestId('caption-mini-preview-container')).toHaveClass('max-w-sm');
      expect(screen.getByTestId('caption-mini-preview-container')).not.toHaveClass(
        'max-w-[clamp(12rem,24dvh,18rem)]',
      );
      unmount();
    } finally {
      getContextSpy.mockRestore();
      useCanvasStore.setState(previousCanvasState);
    }
  });
});
