import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CaptionSection from '../components/sections/CaptionSection';
import { PlatformCapabilitiesProvider } from '../app/PlatformCapabilitiesContext';
import type { Caption } from '../types';
import { getPlatformCapabilities } from '../utils/platform';
import { DEFAULT_VIDEO_TITLE_SETTINGS } from '../utils/videoTitle';
import { useCanvasStore } from '../stores/canvasStore';
import { PORTRAIT_MINI_PREVIEW_MAX_WIDTH_CLASS } from '../components/common/CaptionMiniPreview';

// このファイルでは一括設定欄の表示幅だけを検証するため、描画処理は切り離す。
vi.mock('../components/common/CaptionMiniPreview', () => ({
  default: () => <div data-testid="caption-mini-preview-mock" />,
  PORTRAIT_MINI_PREVIEW_MAX_WIDTH_CLASS: 'max-w-[clamp(8rem,16dvh,11rem)]',
}));

function renderCaptionSection(
  overrides: Partial<ComponentProps<typeof CaptionSection>> = {},
  openOutlineSettings = true,
  isIosSafari = false,
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
      backgroundEnabled: false,
      backgroundColor: '#000000',
      backgroundOpacity: 0.45,
      backgroundRadius: 16,
      bulkFadeIn: false,
      bulkFadeOut: false,
      bulkFadeInDuration: 0.5,
      bulkFadeOutDuration: 0.5,
    },
    videoTitle: { ...DEFAULT_VIDEO_TITLE_SETTINGS },
    isLocked: false,
    totalDuration: 10,
    currentTime: 0,
    onToggleLock: vi.fn(),
    onAddCaption: vi.fn(),
    onUpdateCaption: vi.fn(),
    onRemoveCaption: vi.fn(),
    onMoveCaption: vi.fn(),
    onClearAllCaptions: vi.fn(),
    onSetEnabled: vi.fn(),
    onSetFontSize: vi.fn(),
    onSetFontStyle: vi.fn(),
    onSetFontColor: vi.fn(),
    onSetStrokeColor: vi.fn(),
    onSetStrokeWidth: vi.fn(),
    onSetPosition: vi.fn(),
    onSetBlur: vi.fn(),
    onSetBackgroundEnabled: vi.fn(),
    onSetBackgroundColor: vi.fn(),
    onSetBackgroundOpacity: vi.fn(),
    onSetBackgroundRadius: vi.fn(),
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
    onSeekToSilenceBoundary: vi.fn(),
    hasPrevSilenceBoundary: false,
    hasNextSilenceBoundary: false,
    onUpdateCaptionLive: vi.fn(),
    onUpdateVideoTitle: vi.fn(),
    onSetVideoTitleRange: vi.fn(),
    onResetVideoTitle: vi.fn(),
    ...overrides,
  };

  const section = <CaptionSection {...props} />;
  render(isIosSafari ? (
    <PlatformCapabilitiesProvider
      capabilities={{
        ...getPlatformCapabilities(),
        isIOS: true,
        isSafari: true,
        isIosSafari: true,
      }}
    >
      {section}
    </PlatformCapabilitiesProvider>
  ) : section);
  if (openOutlineSettings) {
    fireEvent.click(screen.getByRole('button', { name: 'キャプション スタイル/フェードの一括設定' }));
    fireEvent.click(screen.getByRole('button', { name: '文字の縁・色' }));
  }
  return props;
}

describe('CaptionSection bulk delete', () => {
  it('apple-safari ではタイトル・一括削除・新しい文字装飾を表示しない', () => {
    renderCaptionSection({}, false, true);

    expect(screen.queryByRole('button', { name: 'キャプションをすべて削除' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'タイトル' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'キャプション スタイル/フェードの一括設定' }));

    expect(screen.queryByRole('button', { name: '文字の縁・色' })).not.toBeInTheDocument();
    expect(screen.queryByText('キャプション背景の帯')).not.toBeInTheDocument();
  });

  it('確認ダイアログでOKしたときだけ一括削除する', () => {
    const captions: Caption[] = [
      {
        id: 'c1',
        text: 'A',
        startTime: 0,
        endTime: 2,
        fadeIn: false,
        fadeOut: false,
        fadeInDuration: 0.5,
        fadeOutDuration: 0.5,
      },
      {
        id: 'c2',
        text: 'B',
        startTime: 2,
        endTime: 4,
        fadeIn: false,
        fadeOut: false,
        fadeInDuration: 0.5,
        fadeOutDuration: 0.5,
      },
    ];
    const props = renderCaptionSection({ captions }, false);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    fireEvent.click(screen.getByRole('button', { name: 'キャプションをすべて削除' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(props.onClearAllCaptions).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it('確認をキャンセルしたら削除しない', () => {
    const captions: Caption[] = [
      {
        id: 'c1',
        text: 'A',
        startTime: 0,
        endTime: 2,
        fadeIn: false,
        fadeOut: false,
        fadeInDuration: 0.5,
        fadeOutDuration: 0.5,
      },
    ];
    const props = renderCaptionSection({ captions }, false);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    fireEvent.click(screen.getByRole('button', { name: 'キャプションをすべて削除' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(props.onClearAllCaptions).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('キャプションが無いときは一括削除ボタンを無効化する', () => {
    renderCaptionSection({ captions: [] }, false);
    expect(screen.getByRole('button', { name: 'キャプションをすべて削除' })).toBeDisabled();
  });

  it('単発キャプションの入力欄に項目名を表示する', () => {
    renderCaptionSection({}, false);

    expect(screen.getByText('単発キャプション')).toHaveClass('text-yellow-400');
    expect(screen.getByLabelText('単発キャプション')).toHaveAttribute(
      'id',
      'single-caption-input',
    );
  });
});

describe('CaptionSection outline and color controls', () => {
  it('詳細設定は閉じている間だけ「（開いて設定）」を表示する', () => {
    renderCaptionSection({}, false);
    const styleButton = screen.getByRole('button', { name: 'キャプション スタイル/フェードの一括設定' });

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
    // 数値欄は入力途中では確定せず、フォーカスを外した時点で反映する
    const strokeNumber = screen.getByLabelText('キャプションの縁の幅（数値）');
    fireEvent.change(strokeNumber, { target: { value: '7.5' } });
    fireEvent.blur(strokeNumber, { target: { value: '7.5' } });

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

describe('CaptionSection bulk mini preview sizing', () => {
  it('縦向きプロジェクトではPCでもミニプレビューの幅を小さく抑える', () => {
    const previousCanvasState = useCanvasStore.getState();
    useCanvasStore.setState({ width: 720, height: 1280 });

    try {
      renderCaptionSection({ previewCanvasRef: { current: null } }, false);
      fireEvent.click(screen.getByRole('button', { name: 'キャプション スタイル/フェードの一括設定' }));

      expect(screen.getByTestId('caption-bulk-mini-preview-container')).toHaveClass(
        PORTRAIT_MINI_PREVIEW_MAX_WIDTH_CLASS,
      );
    } finally {
      cleanup();
      useCanvasStore.setState(previousCanvasState);
    }
  });

  it('横向きプロジェクトでは一括設定の従来幅を維持する', () => {
    const previousCanvasState = useCanvasStore.getState();
    useCanvasStore.setState({ width: 1280, height: 720 });

    try {
      renderCaptionSection({ previewCanvasRef: { current: null } }, false);
      fireEvent.click(screen.getByRole('button', { name: 'キャプション スタイル/フェードの一括設定' }));

      expect(screen.getByTestId('caption-bulk-mini-preview-container')).toHaveClass('max-w-none');
      expect(screen.getByTestId('caption-bulk-mini-preview-container')).not.toHaveClass(
        PORTRAIT_MINI_PREVIEW_MAX_WIDTH_CLASS,
      );
    } finally {
      cleanup();
      useCanvasStore.setState(previousCanvasState);
    }
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
    fireEvent.click(screen.getByRole('button', { name: '現在位置に先頭を合わせる' }));

    expect(props.onShiftCaptions).toHaveBeenCalledWith(6.3, 0);
    expect(screen.getByText('対象の先頭を 0:08.3 に合わせました（+6.3秒）')).toBeInTheDocument();
  });

  it('選択カード以降では、そのカードを先頭として現在位置へ合わせる', () => {
    const props = renderCaptionSection({ captions, currentTime: 1.2 }, false);

    fireEvent.change(screen.getByLabelText('ずらす対象のキャプションカード'), {
      target: { value: '1' },
    });
    expect(screen.getByText('対象の先頭 0:05.0 → 0:01.2（−3.8秒）')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '現在位置に先頭を合わせる' }));

    expect(props.onShiftCaptions).toHaveBeenCalledWith(-3.8, 1);
  });

  it('対象の先頭が現在位置に合っているときは操作を無効にする', () => {
    const props = renderCaptionSection({ captions, currentTime: 2 }, false);
    const alignButton = screen.getByRole('button', {
      name: '現在位置に先頭を合わせる',
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

  it('キャプション背景の帯は既定 OFF で、ON 時だけ濃さ・角丸を表示する', () => {
    const offProps = renderCaptionSection({}, true);
    expect(screen.getByText('キャプション背景の帯')).toBeInTheDocument();
    expect(screen.queryByLabelText('キャプション背景の濃さ')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'キャプション背景の帯' }));
    expect(offProps.onSetBackgroundEnabled).toHaveBeenCalledWith(true);

    // ON 状態だけを単独で描画
    cleanup();
    renderCaptionSection(
      {
        settings: {
          enabled: true,
          fontSize: 'medium',
          fontStyle: 'gothic',
          fontColor: '#FFFFFF',
          strokeColor: '#000000',
          strokeWidth: 2,
          position: 'bottom',
          blur: 0,
          backgroundEnabled: true,
          backgroundColor: '#000000',
          backgroundOpacity: 0.45,
          backgroundRadius: 16,
          bulkFadeIn: false,
          bulkFadeOut: false,
          bulkFadeInDuration: 0.5,
          bulkFadeOutDuration: 0.5,
        },
      },
      true,
    );
    expect(screen.getByLabelText('キャプション背景の濃さ')).toBeInTheDocument();
    expect(screen.getByLabelText('キャプション背景の角丸')).toBeInTheDocument();
  });

  // 【Issue #216】エクスポート中の現在位置表示の凍結
  describe('エクスポート中の現在位置表示（Issue #216）', () => {
    const buildProps = (
      overrides: Partial<ComponentProps<typeof CaptionSection>>
    ): ComponentProps<typeof CaptionSection> => ({
      captions,
      settings: {
        enabled: true,
        fontSize: 'medium',
        fontStyle: 'gothic',
        fontColor: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 2,
        position: 'bottom',
        blur: 0,
        backgroundEnabled: false,
        backgroundColor: '#000000',
        backgroundOpacity: 0.45,
        backgroundRadius: 16,
        bulkFadeIn: false,
        bulkFadeOut: false,
        bulkFadeInDuration: 0.5,
        bulkFadeOutDuration: 0.5,
      },
      videoTitle: { ...DEFAULT_VIDEO_TITLE_SETTINGS },
      isLocked: false,
      totalDuration: 20,
      currentTime: 3,
      onToggleLock: vi.fn(),
      onAddCaption: vi.fn(),
      onUpdateCaption: vi.fn(),
      onRemoveCaption: vi.fn(),
      onMoveCaption: vi.fn(),
      onClearAllCaptions: vi.fn(),
      onSetEnabled: vi.fn(),
      onSetFontSize: vi.fn(),
      onSetFontStyle: vi.fn(),
      onSetFontColor: vi.fn(),
      onSetStrokeColor: vi.fn(),
      onSetStrokeWidth: vi.fn(),
      onSetPosition: vi.fn(),
      onSetBlur: vi.fn(),
      onSetBackgroundEnabled: vi.fn(),
      onSetBackgroundColor: vi.fn(),
      onSetBackgroundOpacity: vi.fn(),
      onSetBackgroundRadius: vi.fn(),
      onSetFontSizeCustom: vi.fn(),
      onSetPositionCustom: vi.fn(),
      onSetBulkFadeIn: vi.fn(),
      onSetBulkFadeOut: vi.fn(),
      onSetBulkFadeInDuration: vi.fn(),
      onSetBulkFadeOutDuration: vi.fn(),
      onOpenHelp: vi.fn(),
      formatTime: (seconds: number) => `${seconds.toFixed(1)}s`,
      onApplyCaptions: vi.fn(),
      onShiftCaptions: vi.fn(),
      isPlaying: false,
      onTogglePlay: vi.fn(),
      onSeekBy: vi.fn(),
      onSeekToSilenceBoundary: vi.fn(),
      hasPrevSilenceBoundary: false,
      hasNextSilenceBoundary: false,
      onUpdateCaptionLive: vi.fn(),
      onUpdateVideoTitle: vi.fn(),
      onSetVideoTitleRange: vi.fn(),
      onResetVideoTitle: vi.fn(),
      ...overrides,
    });

    // ボタン文言からは時刻を外したため、凍結の検証は説明文（aria-live）で行う
    it('エクスポート中は currentTime が進んでも表示を更新しない', () => {
      const props = buildProps({ currentTime: 3, isExporting: false });
      const { rerender } = render(<CaptionSection {...props} />);
      expect(screen.getByText('対象の先頭 0:02.0 → 0:03.0（+1.0秒）')).toBeInTheDocument();

      // エクスポート開始（開始直前の値 3.0 を維持する）
      rerender(<CaptionSection {...buildProps({ currentTime: 3, isExporting: true })} />);
      // エクスポート中に再生位置が進んでも表示は 0:03.0 のまま
      rerender(<CaptionSection {...buildProps({ currentTime: 12.7, isExporting: true })} />);

      expect(screen.getByText('対象の先頭 0:02.0 → 0:03.0（+1.0秒）')).toBeInTheDocument();
      expect(screen.queryByText(/0:12\.7/)).not.toBeInTheDocument();
    });

    it('ボタン文言には現在位置の時刻を含めない（チラつき・幅の抑制）', () => {
      render(<CaptionSection {...buildProps({ currentTime: 3, isExporting: false })} />);
      const alignButton = screen.getByRole('button', { name: '現在位置に先頭を合わせる' });
      expect(alignButton).toBeInTheDocument();
      expect(alignButton.textContent).not.toMatch(/\d:\d\d\.\d/);
    });

    it('エクスポート中も表示項目自体は消えない', () => {
      const { rerender } = render(
        <CaptionSection {...buildProps({ currentTime: 3, isExporting: false })} />
      );
      rerender(<CaptionSection {...buildProps({ currentTime: 9.9, isExporting: true })} />);

      expect(screen.getByText('対象の先頭 0:02.0 → 0:03.0（+1.0秒）')).toBeInTheDocument();
    });

    it('エクスポート終了後は現在位置との連動が再開する', () => {
      const { rerender } = render(
        <CaptionSection {...buildProps({ currentTime: 3, isExporting: false })} />
      );
      rerender(<CaptionSection {...buildProps({ currentTime: 12.7, isExporting: true })} />);
      // 完了・中断・失敗のいずれでも isExporting が false へ戻る
      rerender(<CaptionSection {...buildProps({ currentTime: 12.7, isExporting: false })} />);

      expect(screen.getByText('対象の先頭 0:02.0 → 0:12.7（+10.7秒）')).toBeInTheDocument();
    });

    it('通常のプレビュー中（非エクスポート）は従来どおり更新される', () => {
      const { rerender } = render(
        <CaptionSection {...buildProps({ currentTime: 3, isExporting: false })} />
      );
      rerender(<CaptionSection {...buildProps({ currentTime: 6.5, isExporting: false })} />);

      expect(screen.getByText('対象の先頭 0:02.0 → 0:06.5（+4.5秒）')).toBeInTheDocument();
    });

    it('エクスポート中でも一括時間移動の適用そのものは動作する', () => {
      const props = buildProps({ currentTime: 3, isExporting: false });
      const { rerender } = render(<CaptionSection {...props} />);
      const exportingProps = buildProps({
        currentTime: 12.7,
        isExporting: true,
        onShiftCaptions: props.onShiftCaptions,
      });
      rerender(<CaptionSection {...exportingProps} />);

      // 凍結された表示値（3.0）を基準に適用される
      fireEvent.click(screen.getByRole('button', { name: '現在位置に先頭を合わせる' }));
      expect(exportingProps.onShiftCaptions).toHaveBeenCalledWith(1, 0);
    });
  });
});
