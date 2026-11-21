/**
 * @file clipColor.ui.test.tsx
 * @description 動画・画像カードの「色合い」欄（前／次の素材に色を合わせる・手動の色調整）。
 */
import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClipItem from '../components/media/ClipItem';
import ClipColorSettingsPanel from '../components/sections/ClipColorSettingsPanel';
import { useCanvasStore } from '../stores/canvasStore';
import { useMediaStore } from '../stores/mediaStore';
import type { MediaItem } from '../types';

vi.mock('../components/common/ClipThumbnail', () => ({
  default: () => <div data-testid="clip-thumbnail" />,
}));

vi.mock('../components/common/MiniPreview', () => ({
  default: () => <div data-testid="mini-preview" />,
}));

function createItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'clip-2',
    file: new File(['x'], 'next.png', { type: 'image/png' }),
    type: 'image',
    url: 'blob:clip-2',
    volume: 1,
    isMuted: false,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 1,
    fadeOutDuration: 1,
    duration: 4,
    originalDuration: 0,
    trimStart: 0,
    trimEnd: 0,
    scale: 1,
    positionX: 0,
    positionY: 0,
    rotation: 0,
    blur: 0,
    isTransformOpen: false,
    isLocked: false,
    ...overrides,
  };
}

function renderItem(overrides: Partial<ComponentProps<typeof ClipItem>> = {}) {
  const props: ComponentProps<typeof ClipItem> = {
    item: createItem(),
    timelineRange: { start: 4, end: 8 },
    currentTime: 0,
    index: 1,
    totalItems: 2,
    isClipsLocked: false,
    mediaElement: null,
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onRemove: vi.fn(),
    onToggleLock: vi.fn(),
    onToggleTransformPanel: vi.fn(),
    onUpdateVideoTrim: vi.fn(),
    onUpdateImageDuration: vi.fn(),
    onUpdateScale: vi.fn(),
    onUpdatePosition: vi.fn(),
    onUpdateBlur: vi.fn(),
    onUpdateColorAdjust: vi.fn(),
    onMatchColorToPrevious: vi.fn(),
    onMatchColorToNext: vi.fn(),
    onUpdateColorMatchStrength: vi.fn(),
    onClearColorMatch: vi.fn(),
    onResetColor: vi.fn(),
    onRestoreColor: vi.fn(),
    onResetSetting: vi.fn(),
    onUpdateVolume: vi.fn(),
    onToggleMute: vi.fn(),
    onToggleFadeIn: vi.fn(),
    onToggleFadeOut: vi.fn(),
    onUpdateFadeInDuration: vi.fn(),
    onUpdateFadeOutDuration: vi.fn(),
    ...overrides,
  };
  return { ...render(<ClipItem {...props} />), props };
}

const openColor = (name: RegExp = /^色合い/) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  useCanvasStore.setState({ width: 1280, height: 720 });
});

describe('色合い欄', () => {
  it('カード設定の一番下（音量・再生速度の下）に置く', () => {
    renderItem({
      item: createItem({ type: 'video', file: new File(['x'], 'next.mp4', { type: 'video/mp4' }), trimEnd: 4, originalDuration: 4 }),
      onUpdatePlaybackSpeed: vi.fn(),
    });
    const volume = screen.getByRole('button', { name: '音量・再生速度' });
    const color = screen.getByRole('button', { name: '色合い' });
    expect(volume.compareDocumentPosition(color) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('開くと前／次に合わせるボタンと、カラーバー付きの 5 項目のスライダーが出る（両端の説明文字は置かない）', () => {
    const { props } = renderItem();
    const fade = screen.getByRole('button', { name: 'フェード・ぼかし' });
    const color = screen.getByRole('button', { name: '色合い' });
    expect(fade.compareDocumentPosition(color) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId('clip-color-panel-clip-2')).not.toBeInTheDocument();

    openColor();
    const panel = screen.getByTestId('clip-color-panel-clip-2');
    const tracks: Record<string, string> = {
      明るさ: 'color-grade-slider--brightness',
      コントラスト: 'color-grade-slider--contrast',
      彩度: 'color-grade-slider--saturation',
      色温度: 'color-grade-slider--temperature',
      色かぶり: 'color-grade-slider--tint',
    };
    for (const [name, track] of Object.entries(tracks)) {
      const slider = within(panel).getByRole('slider', { name });
      expect(slider).toHaveValue('0');
      expect(slider).toHaveClass('color-grade-slider', track);
    }
    for (const label of ['暗く', '明るく', 'くっきり', '白黒', 'あざやか', '青み', '暖かみ', 'マゼンタ']) {
      expect(within(panel).queryByText(label)).not.toBeInTheDocument();
    }
    expect(within(panel).getByRole('button', { name: '前の素材に合わせる' })).toBeEnabled();
    expect(within(panel).getByRole('button', { name: '次の素材に合わせる' })).toBeEnabled();

    fireEvent.change(within(panel).getByRole('slider', { name: '色温度' }), { target: { value: '25' } });
    expect(props.onUpdateColorAdjust).toHaveBeenLastCalledWith({ temperature: 25 });
    fireEvent.change(within(panel).getByRole('slider', { name: '明るさ' }), { target: { value: '-40' } });
    expect(props.onUpdateColorAdjust).toHaveBeenLastCalledWith({ brightness: -40 });
    // 何も変えていなければ全リセットは押せない
    expect(within(panel).getByRole('button', { name: '色合いをすべて元に戻す' })).toBeDisabled();
  });

  it.each([
    ['前の素材に合わせる', 'onMatchColorToPrevious', 'onMatchColorToNext'],
    ['次の素材に合わせる', 'onMatchColorToNext', 'onMatchColorToPrevious'],
  ] as const)('「%s」は処理中の表示を出し、その間はもう一方も押せない', async (label, handlerName, otherName) => {
    let finish: () => void = () => {};
    const handler = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const other = vi.fn();
    renderItem({ [handlerName]: handler, [otherName]: other });
    openColor();
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '合わせています…' })).toBeDisabled();
    const otherLabel = label === '前の素材に合わせる' ? '次の素材に合わせる' : '前の素材に合わせる';
    expect(screen.getByRole('button', { name: otherLabel })).toBeDisabled();
    await act(async () => { finish(); });
    expect(screen.getByRole('button', { name: label })).toBeEnabled();
    expect(other).not.toHaveBeenCalled();
  });

  it('自動合わせは手動のスライダーより下に、向いている場面の説明と注意点付きで置く', () => {
    renderItem();
    openColor();
    const panel = screen.getByTestId('clip-color-panel-clip-2');
    const lastSlider = within(panel).getByRole('slider', { name: '色かぶり' });
    const matchButton = within(panel).getByRole('button', { name: '前の素材に合わせる' });
    const usage = within(panel).getByText(/同じ場面の続きでつなぎ目の色をそろえます/);
    const caution = within(panel).getByText(/場面や写っている物が違う素材では、色が大きく変わることがあります/);
    expect(within(panel).getAllByRole('slider')[0]).toHaveAccessibleName('明るさ');
    expect(lastSlider.compareDocumentPosition(usage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(usage.compareDocumentPosition(caution) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(caution.compareDocumentPosition(matchButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('合わせた直後だけ「合わせる前に戻す」を出し、押す前の色合いへ戻す', async () => {
    const before = { brightness: 15, contrast: 0, saturation: 0, temperature: 0, tint: 0 };
    const onMatchColorToPrevious = vi.fn(async () => true);
    const { props } = renderItem({ item: createItem({ colorAdjust: before }), onMatchColorToPrevious });
    openColor(/色合い（調整中）/);
    expect(screen.queryByRole('button', { name: /合わせる前に戻す/ })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '前の素材に合わせる' }));
    });
    const undo = screen.getByRole('button', { name: /合わせる前に戻す/ });
    fireEvent.click(undo);
    expect(props.onRestoreColor).toHaveBeenCalledWith({ adjust: before, match: null });
    expect(screen.queryByRole('button', { name: /合わせる前に戻す/ })).not.toBeInTheDocument();
  });

  it('合わせられなかったとき（false）は「合わせる前に戻す」を出さない', async () => {
    renderItem({ onMatchColorToPrevious: vi.fn(async () => false) });
    openColor();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '前の素材に合わせる' }));
    });
    expect(screen.queryByRole('button', { name: /合わせる前に戻す/ })).not.toBeInTheDocument();
  });

  it('先頭のカードは「前」、最後のカードは「次」が押せない。1 枚だけなら両方押せず案内を出す', () => {
    const { unmount } = renderItem({ onMatchColorToPrevious: undefined, index: 0 });
    openColor();
    expect(screen.getByRole('button', { name: '前の素材に合わせる' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '次の素材に合わせる' })).toBeEnabled();
    unmount();

    renderItem({ onMatchColorToPrevious: undefined, onMatchColorToNext: undefined, index: 0, totalItems: 1 });
    openColor();
    expect(screen.getByRole('button', { name: '前の素材に合わせる' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '次の素材に合わせる' })).toBeDisabled();
    expect(screen.getByText(/素材が 2 つ以上あるときに使えます/)).toBeInTheDocument();
    expect(screen.queryByText(/同じ場面の続き/)).not.toBeInTheDocument();
  });

  it('合わせ済みなら見出しに「調整中」、強さの変更・自動補正を外す・全リセットができる', () => {
    const { props } = renderItem({
      item: createItem({
        colorMatch: { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [0.05, 0, 0], strength: 80 },
        colorAdjust: { brightness: 0, contrast: 12, saturation: 0, temperature: 0, tint: 0 },
      }),
    });
    openColor(/色合い（調整中）/);
    const panel = screen.getByTestId('clip-color-panel-clip-2');
    const strength = within(panel).getByRole('slider', { name: '細かな色ずれの補正' });
    expect(strength).toHaveValue('80');
    fireEvent.change(strength, { target: { value: '55' } });
    expect(props.onUpdateColorMatchStrength).toHaveBeenLastCalledWith(55);
    fireEvent.click(within(panel).getByRole('button', { name: '細かな色ずれの補正を外す' }));
    expect(props.onClearColorMatch).toHaveBeenCalledTimes(1);
    expect(within(panel).getByRole('slider', { name: 'コントラスト' })).toHaveValue('12');
    fireEvent.click(within(panel).getByRole('button', { name: 'コントラストをリセット' }));
    expect(props.onUpdateColorAdjust).toHaveBeenLastCalledWith({ contrast: 0 });
    fireEvent.click(within(panel).getByRole('button', { name: '色合いをすべて元に戻す' }));
    expect(props.onResetColor).toHaveBeenCalledTimes(1);
  });

  it('色合いの操作を渡さない画面（iPhone / iPad 版）では欄を出さない', () => {
    renderItem({ onUpdateColorAdjust: undefined, onMatchColorToPrevious: undefined, onMatchColorToNext: undefined });
    expect(screen.queryByRole('button', { name: /^色合い/ })).not.toBeInTheDocument();
  });

  it('ロック中は操作できない', () => {
    renderItem({ item: createItem({ isLocked: true }) });
    const header = screen.getByRole('button', { name: '色合い' });
    expect(header).toBeDisabled();
  });

  it('全体の色合いが適用中のときは、個別パネルに重ね掛け中の案内を出す', () => {
    renderItem({ isGlobalColorActive: true });
    openColor();
    expect(screen.getByTestId('clip-color-global-notice-clip-2')).toHaveTextContent(/全体の色合いが適用中です/);
  });
});

describe('色合い 一括設定パネル（ClipColorSettingsPanel）', () => {
  beforeEach(() => {
    useMediaStore.getState().resetBulkColor();
  });

  function renderConnectedBulkPanel(isLocked = false) {
    const Wrapper = () => {
      const enabled = useMediaStore((s) => s.bulkColorEnabled);
      const adjust = useMediaStore((s) => s.bulkColorAdjust);
      const activePresetId = useMediaStore((s) => s.bulkColorPresetId);
      const presetStrength = useMediaStore((s) => s.bulkColorPresetStrength);
      const setEnabled = useMediaStore((s) => s.setBulkColorEnabled);
      const updateAdjust = useMediaStore((s) => s.updateBulkColorAdjust);
      const applyPreset = useMediaStore((s) => s.applyBulkColorPreset);
      const setStrength = useMediaStore((s) => s.setBulkColorPresetStrength);
      const reset = useMediaStore((s) => s.resetBulkColor);
      return (
        <ClipColorSettingsPanel
          isLocked={isLocked}
          enabled={enabled}
          adjust={adjust}
          activePresetId={activePresetId}
          presetStrength={presetStrength}
          onToggleEnabled={setEnabled}
          onUpdateAdjust={updateAdjust}
          onApplyPreset={applyPreset}
          onChangePresetStrength={setStrength}
          onReset={reset}
        />
      );
    };
    return render(<Wrapper />);
  }

  it('雰囲気プリセットを押すと自動で適用中になり、5本スライダーと強さ調整が連動する', () => {
    renderConnectedBulkPanel();
    fireEvent.click(screen.getByRole('button', { name: '色合い 一括設定' }));

    expect(screen.queryByTestId('clip-bulk-color-preset-strength')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ナチュラル（元の色・補正なし）' })).toHaveAttribute('aria-pressed', 'true');

    // 「シネマ」プリセットをワンクリック
    fireEvent.click(screen.getByRole('button', { name: 'シネマ' }));
    expect(screen.getByRole('button', { name: '色合い 一括設定（適用中）' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '全体の色合いを適用する' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'シネマ' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'ナチュラル（元の色・補正なし）' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('clip-bulk-color-preset-strength')).toBeInTheDocument();

    // チェックで一時オフするとプリセットの選択ハイライトも外れ、再チェックで復帰する
    fireEvent.click(screen.getByRole('checkbox', { name: '全体の色合いを適用する' }));
    expect(screen.getByRole('button', { name: 'シネマ' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('clip-bulk-color-preset-strength')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: '全体の色合いを適用する' }));
    expect(screen.getByRole('button', { name: 'シネマ' })).toHaveAttribute('aria-pressed', 'true');

    const tintSlider = screen.getByRole('slider', { name: '全体の色かぶり' }) as HTMLInputElement;
    expect(Number(tintSlider.value)).toBe(-65);

    // 強さクイックボタン「弱」(50%) でスライダーが連動して弱まる（Math.round(-65 * 0.5) = -32）
    fireEvent.click(screen.getByRole('button', { name: '弱' }));
    expect(Number(tintSlider.value)).toBe(-32);

    // 5 本スライダーを手動微調整すると強さ欄が閉じ、値が保持される
    fireEvent.change(screen.getByRole('slider', { name: '全体の色温度' }), { target: { value: '-80' } });
    expect(screen.queryByTestId('clip-bulk-color-preset-strength')).not.toBeInTheDocument();
    expect(screen.getByRole('slider', { name: '全体の色温度' })).toHaveValue('-80');

    // チェックを外すと値を残したまま一時オフになり、見出しの（適用中）が消える
    fireEvent.click(screen.getByRole('checkbox', { name: '全体の色合いを適用する' }));
    expect(screen.getByRole('button', { name: '色合い 一括設定' })).toBeInTheDocument();
    expect(screen.getByText(/一時オフ中です/)).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: '全体の色温度' })).toHaveValue('-80');

    // 「タートル」プリセットをワンクリックすると深いタートルグリーン設定が入る
    fireEvent.click(screen.getByRole('button', { name: 'タートル' }));
    expect(screen.getByRole('button', { name: 'タートル' })).toHaveAttribute('aria-pressed', 'true');
    expect(Number((screen.getByRole('slider', { name: '全体の色かぶり' }) as HTMLInputElement).value)).toBe(-96);
    expect(Number((screen.getByRole('slider', { name: '全体の色温度' }) as HTMLInputElement).value)).toBe(-72);

    // 「ナチュラル（元の色・補正なし）」を押すと即座に 0・オフへ戻る
    fireEvent.click(screen.getByRole('button', { name: 'ナチュラル（元の色・補正なし）' }));
    expect(screen.getByRole('button', { name: 'ナチュラル（元の色・補正なし）' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('slider', { name: '全体の色温度' })).toHaveValue('0');
    expect(screen.getByRole('slider', { name: '全体の色かぶり' })).toHaveValue('0');
    expect(screen.getByRole('button', { name: '全体の色合いを元に戻す' })).toBeDisabled();
  });
});
