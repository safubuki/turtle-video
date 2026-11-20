/**
 * @file clipMotion.ui.test.tsx
 * @description 動画・画像カードの「サイズ・位置・動き」「フェード・ぼかし」欄。
 * サイズ・横・縦は 1 組のスライダーで、動かさないなら全体、動かすなら選んだ時点（開始／終了）を編集する。
 */
import type { ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClipItem from '../components/media/ClipItem';
import { useCanvasStore } from '../stores/canvasStore';
import type { MediaItem } from '../types';

vi.mock('../components/common/ClipThumbnail', () => ({
  default: ({ scale }: { scale?: number }) => <div data-testid="clip-thumbnail" data-scale={scale} />,
}));

vi.mock('../components/common/MiniPreview', () => ({
  default: ({ localTime }: { localTime?: number }) => <div data-testid="mini-preview" data-local-time={localTime} />,
}));

function createItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'still-1',
    file: new File(['x'], 'still.png', { type: 'image/png' }),
    type: 'image',
    url: 'blob:still-1',
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
    isTransformOpen: true,
    isLocked: false,
    ...overrides,
  };
}

function renderItem(overrides: Partial<ComponentProps<typeof ClipItem>> = {}) {
  const props: ComponentProps<typeof ClipItem> = {
    item: createItem(),
    timelineRange: { start: 2, end: 6 },
    currentTime: 4,
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
    onPreviewZoomEndpoint: vi.fn(),
    onPreviewScale: vi.fn(),
    onUpdateMotionPoint: vi.fn(),
    onSetMotionEnd: vi.fn(),
    onUpdatePosition: vi.fn(),
    onRotate: vi.fn(),
    onUpdateBlur: vi.fn(),
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

const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  useCanvasStore.setState({ width: 1280, height: 720 });
});

describe('サイズ・位置・動き: 動かさない（既定）', () => {
  it('黒帯除去が先頭・回転が末尾。サイズ・横・縦は全体を変え、表示中の位置のまま確認する', () => {
    const { props } = renderItem();
    const panel = screen.getByTestId('clip-composition-still-1');
    expect(screen.getByRole('button', { name: 'サイズ・位置・動き' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '動かさない' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('group', { name: '編集する時点' })).not.toBeInTheDocument();
    // 現在位置（4 秒 − クリップ先頭 2 秒）のミニプレビュー
    expect(screen.getByTestId('mini-preview')).toHaveAttribute('data-local-time', '2');

    const blackBar = within(panel).getByRole('checkbox', { name: /黒帯除去/ });
    const size = within(panel).getByRole('slider', { name: '拡大率' });
    const rotate = within(panel).getByRole('button', { name: /90°回転/ });
    const resetAll = within(panel).getByRole('button', { name: /100%・中央に戻す/ });
    expect(before(blackBar, size)).toBe(true);
    expect(before(size, within(panel).getByRole('slider', { name: '横位置' }))).toBe(true);
    expect(before(resetAll, rotate)).toBe(true);
    // ぼかしはこの欄に無い
    expect(within(panel).queryByRole('slider', { name: 'ぼかし強度' })).not.toBeInTheDocument();

    fireEvent.change(size, { target: { value: '150' } });
    expect(props.onUpdateScale).toHaveBeenLastCalledWith(1.5);
    expect(props.onPreviewScale).toHaveBeenCalledTimes(1);
    fireEvent.change(within(panel).getByRole('slider', { name: '横位置' }), { target: { value: '10' } });
    expect(props.onUpdatePosition).toHaveBeenLastCalledWith('x', '128');
    fireEvent.click(blackBar);
    expect(props.onUpdateScale).toHaveBeenLastCalledWith(1.025);
    expect(props.onPreviewZoomEndpoint).not.toHaveBeenCalled();
    expect(props.onUpdateMotionPoint).not.toHaveBeenCalled();

    fireEvent.click(within(panel).getByRole('button', { name: 'サイズをリセット' }));
    expect(props.onResetSetting).toHaveBeenLastCalledWith('scale');
    // 位置のくるくるは横・縦をまとめて中央へ
    fireEvent.click(within(panel).getByRole('button', { name: '位置をリセット' }));
    expect(props.onResetSetting).toHaveBeenCalledWith('x');
    expect(props.onResetSetting).toHaveBeenLastCalledWith('y');
    fireEvent.click(resetAll);
    expect(props.onResetSetting).toHaveBeenLastCalledWith('composition-default');
  });

  it('サイズ・横・縦は見出しに値を出さず、数値欄の幅をそろえ、横・縦は 1 文字ラベルで続けて並べる', () => {
    renderItem({ item: createItem({ scale: 1.255, zoomStartScale: 1.255, zoomEndScale: 1.255, positionX: -128 }) });
    const panel = screen.getByTestId('clip-composition-still-1');
    // 値は数値欄だけ（見出しの「サイズ: 125.5%」「横 (右+): -10%」は出さない）
    expect(within(panel).queryByText(/サイズ:/)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/横 \(右\+\):/)).not.toBeInTheDocument();
    expect(within(panel).getByText('サイズ')).toBeInTheDocument();
    expect(within(panel).getByText('位置（右・上が＋）')).toBeInTheDocument();
    const size = within(panel).getByRole('spinbutton', { name: '拡大率（数値）' });
    const x = within(panel).getByRole('spinbutton', { name: '横位置（数値）' });
    const y = within(panel).getByRole('spinbutton', { name: '縦位置（数値）' });
    expect(size).toHaveValue(125.5);
    expect(x).toHaveValue(-10);
    expect(size.style.width).toBe(x.style.width);
    expect(y.style.width).toBe(x.style.width);
    // 横・縦は見出しを挟まず、1 文字ラベルを数値欄の左に置く
    const xLabel = within(panel).getByText('横');
    const yLabel = within(panel).getByText('縦');
    expect(before(xLabel, x)).toBe(true);
    expect(before(x, yLabel)).toBe(true);
    expect(before(yLabel, y)).toBe(true);
    // リセットはサイズと位置の見出しに 1 つずつ（＋ボタンの隣には置かない）
    expect(within(panel).queryByRole('button', { name: '横位置をリセット' })).not.toBeInTheDocument();
    expect(within(panel).getAllByRole('button', { name: /をリセット$/ }).map((b) => b.getAttribute('aria-label')))
      .toEqual(['サイズをリセット', '位置をリセット', '回転をリセット']);
  });

  it('「動き（ズーム・位置の移動）」は見出しで示し、編集する時点は「動かす」のときだけ出す（かんたん設定は置かない）', () => {
    renderItem({ item: createItem({ scale: 1.2, zoomStartScale: 1.2, zoomEndScale: 1.2, positionX: 64 }) });
    const motion = screen.getByTestId('clip-motion-still-1');
    expect(within(motion).getByText('動き（ズーム・位置の移動）')).toBeInTheDocument();
    const toggle = screen.getByRole('group', { name: '動き（ズーム・位置の移動）' });
    expect(toggle).toContainElement(screen.getByRole('button', { name: '動かさない' }));
    expect(within(motion).getByText(/「動かす」を選ぶと、開始（先頭）と終了（末尾）の構図を決めて/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /編集する時点/ })).not.toBeInTheDocument();
    // トグルの高さはキャプションの割り付けボタンと同じ（py-1.5。44px の min-h-11 にしない）
    for (const button of within(toggle).getAllByRole('button')) {
      expect(button.className).toContain('py-1.5');
      expect(button.className).not.toContain('min-h-11');
    }

    fireEvent.click(screen.getByRole('button', { name: '動かす' }));
    expect(screen.getByRole('group', { name: /編集する時点/ })).toBeInTheDocument();
    // ズームイン／アウトの専用ボタンは無い（終了のサイズで決める）
    expect(screen.queryByRole('group', { name: 'かんたん設定' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ズームイン' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ズームアウト' })).not.toBeInTheDocument();
  });
});

describe('サイズ・位置・動き: 動かす', () => {
  it('「動かす」で終了を選び、同じスライダーで選んだ時点だけを変える', () => {
    const { props } = renderItem();
    fireEvent.click(screen.getByRole('button', { name: '動かす' }));
    expect(props.onPreviewZoomEndpoint).toHaveBeenLastCalledWith('end');
    expect(screen.getByRole('button', { name: '終了（末尾）' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('clip-motion-summary-still-1')).toHaveTextContent('まだ動きません');
    expect(screen.getByTestId('clip-composition-point-still-1')).toHaveTextContent('終了（末尾）の構図を表示・編集中');
    expect(screen.getByTestId('mini-preview')).toHaveAttribute('data-local-time', '4');

    fireEvent.change(screen.getByRole('slider', { name: '拡大率' }), { target: { value: '150' } });
    expect(props.onUpdateMotionPoint).toHaveBeenLastCalledWith('end', { scale: 1.5 });
    expect(props.onUpdateScale).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '開始（先頭）' }));
    expect(props.onPreviewZoomEndpoint).toHaveBeenLastCalledWith('start');
    expect(screen.getByTestId('mini-preview')).toHaveAttribute('data-local-time', '0');
    fireEvent.change(screen.getByRole('slider', { name: '縦位置' }), { target: { value: '10' } });
    // 縦は上が＋（保存 px は下が＋）
    expect(props.onUpdateMotionPoint).toHaveBeenLastCalledWith('start', { y: -72 });
    expect(props.onUpdatePosition).not.toHaveBeenCalled();
    fireEvent.focus(screen.getByRole('spinbutton', { name: '横位置（数値）' }));
    expect(props.onPreviewZoomEndpoint).toHaveBeenLastCalledWith('start');
  });

  it('動いているカードは開始→終了を表示し、親が確認中の時点に合わせる。リセットは開始なら100%・中央、終了なら開始と同じ', () => {
    const item = createItem({
      scale: 1.4, zoomStartScale: 1.4, zoomEndScale: 1.82, zoomDirection: 'in',
      positionX: 0, positionY: 0, panEndPositionX: -128, panEndPositionY: 72,
    });
    const { props, rerender } = renderItem({ item });
    expect(screen.getByRole('button', { name: '動かす' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('clip-motion-summary-still-1'))
      .toHaveTextContent('開始 140%・横0%・縦0% → 終了 182%・横-10%・縦-10%');
    expect(screen.getByRole('spinbutton', { name: '拡大率（数値）' })).toHaveValue(140);

    rerender(<ClipItem {...props} zoomPreviewEndpoint="end" />);
    expect(screen.getByRole('button', { name: '終了（末尾）' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('spinbutton', { name: '拡大率（数値）' })).toHaveValue(182);
    fireEvent.click(screen.getByRole('button', { name: 'サイズをリセット' }));
    expect(props.onUpdateMotionPoint).toHaveBeenLastCalledWith('end', { scale: 1.4 });
    fireEvent.click(screen.getByRole('button', { name: '位置をリセット' }));
    expect(props.onUpdateMotionPoint).toHaveBeenLastCalledWith('end', { x: 0, y: 0 });

    fireEvent.click(screen.getByRole('button', { name: '開始（先頭）' }));
    fireEvent.click(screen.getByRole('button', { name: 'サイズをリセット' }));
    expect(props.onUpdateMotionPoint).toHaveBeenLastCalledWith('start', { scale: 1 });

  });

  it('「動かさない」で動きを止め、もう一度「動かす」で直前の終了に戻す', () => {
    const moving = createItem({ scale: 1, zoomStartScale: 1, zoomEndScale: 1.5, panEndPositionX: 200, panEndPositionY: 0 });
    const { props, rerender } = renderItem({ item: moving });
    fireEvent.click(screen.getByRole('button', { name: '動かさない' }));
    expect(props.onSetMotionEnd).toHaveBeenLastCalledWith(null);
    // ストアが固定に戻した状態
    rerender(<ClipItem {...props} item={createItem({ scale: 1, zoomStartScale: 1, zoomEndScale: 1 })} />);
    expect(screen.getByRole('button', { name: '動かさない' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '動かす' }));
    expect(props.onSetMotionEnd).toHaveBeenLastCalledWith({ scale: 1.5, x: 200, y: 0 });
  });

  it('前の素材の最後の構図を引き継げ、ロック中は動きの操作もできない', () => {
    const onInheritComposition = vi.fn();
    const { props, rerender } = renderItem({
      onInheritComposition,
      previousComposition: { scale: 1.5, x: 128, y: -72 },
    });
    fireEvent.click(screen.getByRole('button', { name: /前の素材の最後の構図を引き継ぐ（150%・横10%・縦10%）/ }));
    expect(onInheritComposition).toHaveBeenCalledTimes(1);

    rerender(<ClipItem {...props} onInheritComposition={onInheritComposition} previousComposition={{ scale: 1.5, x: 128, y: -72 }} isClipsLocked />);
    for (const name of ['動かす', /前の素材の最後の構図を引き継ぐ/, /100%・中央に戻す/]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByRole('slider', { name: '拡大率' })).toBeDisabled();
  });

  it('スライダー上を縦スクロールしても、選んだ時点の構図を変えない', () => {
    const { props } = renderItem({ item: createItem({ zoomStartScale: 1, zoomEndScale: 1.5, scale: 1 }) });
    fireEvent.click(screen.getByRole('button', { name: '終了（末尾）' }));
    vi.mocked(props.onUpdateMotionPoint!).mockClear();
    const slider = screen.getByRole('slider', { name: '拡大率' });
    const touch = (clientX: number, clientY: number) => ({ clientX, clientY, identifier: 1 });
    fireEvent.touchStart(slider, { touches: [touch(100, 100)] });
    fireEvent.change(slider, { target: { value: 150 } });
    fireEvent.touchMove(slider, { touches: [touch(103, 140)] });
    fireEvent.change(slider, { target: { value: 180 } });
    fireEvent.touchEnd(slider, { touches: [], changedTouches: [touch(103, 140)] });
    expect(props.onUpdateMotionPoint).not.toHaveBeenCalled();
  });

  it('動きの操作が無い画面では、サイズ・横・縦だけを出す', () => {
    renderItem({ onUpdateMotionPoint: undefined, onSetMotionEnd: undefined });
    expect(screen.getByRole('slider', { name: '拡大率' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '動かす' })).not.toBeInTheDocument();
  });
});

describe('フェード・ぼかし', () => {
  it('フェードとぼかしを同じ欄に置き、ぼかしが無い画面では「フェード」だけ', () => {
    const { props, unmount } = renderItem({ item: createItem({ isTransformOpen: false, blur: 4 }) });
    fireEvent.click(screen.getByRole('button', { name: 'フェード・ぼかし' }));
    const panel = document.getElementById('clip-audio-settings-still-1') as HTMLElement;
    expect(within(panel).getByRole('checkbox', { name: 'フェードイン' })).toBeInTheDocument();
    fireEvent.change(within(panel).getByRole('slider', { name: 'ぼかし強度' }), { target: { value: '8' } });
    expect(props.onUpdateBlur).toHaveBeenLastCalledWith(8);
    // ズーム・移動の操作はこの欄に無い
    expect(within(panel).queryByRole('button', { name: 'ズームイン' })).not.toBeInTheDocument();
    unmount();

    renderItem({ item: createItem({ isTransformOpen: false }), onUpdateBlur: undefined });
    expect(screen.getByRole('button', { name: 'フェード' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'フェード・ぼかし' })).not.toBeInTheDocument();
  });

  it('欄の並びは サイズ・位置・動き → フェード・ぼかし → 音量・再生速度', () => {
    renderItem({ item: createItem({ type: 'video', isTransformOpen: false }), onUpdatePlaybackSpeed: vi.fn() });
    const composition = screen.getByRole('button', { name: 'サイズ・位置・動き' });
    const look = screen.getByRole('button', { name: 'フェード・ぼかし' });
    const audio = screen.getByRole('button', { name: '音量・再生速度' });
    expect(before(composition, look)).toBe(true);
    expect(before(look, audio)).toBe(true);
  });
});
