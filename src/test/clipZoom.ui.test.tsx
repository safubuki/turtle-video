/**
 * @file clipZoom.ui.test.tsx
 * @description 画像・動画カードのズームイン／アウト操作
 */
import type { ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClipItem from '../components/media/ClipItem';
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
    index: 0,
    totalItems: 1,
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
    onUpdateZoomDirection: vi.fn(),
    onUpdateZoomAmount: vi.fn(),
    onUpdateZoomEndpoint: vi.fn(),
    onPreviewZoomEndpoint: vi.fn(),
    onUpdatePosition: vi.fn(),
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

function openEffectPanel() {
  fireEvent.click(screen.getByRole('button', { name: 'フェード・ズームイン/アウト' }));
}

describe('ClipItem zoom', () => {
  it('starts with no zoom and chooses in, out, amount, and reset', () => {
    const { props } = renderItem();
    expect(screen.queryByRole('button', { name: 'ズームなし' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '音量・再生速度' })).not.toBeInTheDocument();
    openEffectPanel();
    const imagePanel = document.getElementById('clip-audio-settings-still-1');
    expect(imagePanel).not.toBeNull();
    expect(within(imagePanel as HTMLElement).queryByText(/黒帯除去/)).not.toBeInTheDocument();
    expect(within(imagePanel as HTMLElement).queryByRole('slider', { name: '拡大率' })).not.toBeInTheDocument();
    expect(screen.queryByText(/基準の拡大率/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ズームなし' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('spinbutton', { name: 'ズーム開始倍率（数値）' })).toHaveValue(100);
    expect(screen.getByRole('spinbutton', { name: 'ズーム終了倍率（数値）' })).toHaveValue(100);
    expect(screen.getByTestId('clip-thumbnail')).toHaveAttribute('data-scale', '1');
    expect(screen.getByTestId('mini-preview')).toHaveAttribute('data-local-time', '2');

    fireEvent.click(screen.getByRole('button', { name: 'ズームイン' }));
    expect(props.onUpdateZoomDirection).toHaveBeenCalledWith('in');

    fireEvent.click(screen.getByRole('button', { name: 'ズームアウト' }));
    expect(props.onUpdateZoomDirection).toHaveBeenCalledWith('out');
  });

  it('ズームの見出しを方向の前に置き、100%リセットは方向ボタンより後ろへ下げる', () => {
    renderItem();
    openEffectPanel();
    const fadeHeading = screen.getByRole('heading', { name: 'フェード' });
    const zoomHeading = screen.getByRole('heading', { name: 'ズーム' });
    const zoomIn = screen.getByRole('button', { name: 'ズームイン' });
    const hold = screen.getByRole('button', { name: '開始倍率で固定' });
    const reset = screen.getByRole('button', { name: '100%にリセット' });
    expect(screen.getByRole('group', { name: 'ズームの向き' })).toContainElement(zoomIn);
    expect(fadeHeading.compareDocumentPosition(zoomHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(zoomHeading.compareDocumentPosition(zoomIn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(zoomIn.compareDocumentPosition(hold) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hold.className).toContain('self-end');
    expect(hold.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(zoomIn.className).toContain('min-h-11');
    expect(zoomIn.className).toContain('rounded-lg');
    expect(reset.className).not.toContain('border');
  });

  it('旧ズームアウトも見た目を保ち、サイズ欄には実際の開始倍率を表示する', () => {
    const { props, rerender } = renderItem({
      item: createItem({ type: 'video', zoomDirection: 'out', zoomAmount: 1.3, scale: 1.5, duration: 8 }),
      onUpdatePlaybackSpeed: vi.fn(),
    });
    expect(screen.getByRole('button', { name: '音量・再生速度' })).toBeInTheDocument();
    openEffectPanel();
    const videoPanel = document.getElementById('clip-audio-settings-still-1');
    expect(videoPanel).not.toBeNull();
    expect(within(videoPanel as HTMLElement).queryByText(/黒帯除去/)).not.toBeInTheDocument();
    expect(within(videoPanel as HTMLElement).queryByRole('slider', { name: '音量' })).not.toBeInTheDocument();
    expect(within(videoPanel as HTMLElement).queryByRole('slider', { name: '拡大率' })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '拡大率（数値）' })).toHaveValue(195);
    expect(screen.getByRole('button', { name: 'ズームアウト' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('slider', { name: 'ズーム終了倍率' })).toBeInTheDocument();
    const amount = screen.getByRole('spinbutton', { name: 'ズーム開始倍率（数値）' });
    expect(amount).toHaveValue(195);
    expect(screen.getByRole('spinbutton', { name: 'ズーム終了倍率（数値）' })).toHaveValue(150);
    expect(amount.parentElement).toHaveTextContent('%');
    // ズームアウトの開始側は到達倍率。カードの静止サムネは開始フレームに合わせる。
    expect(Number(screen.getByTestId('clip-thumbnail').getAttribute('data-scale'))).toBeCloseTo(1.95);

    const hold = screen.getByRole('button', { name: '開始倍率で固定' });
    expect(hold).toHaveAttribute('title', '開始・終了を195%にそろえ、ズームの動きを止めます');
    fireEvent.click(hold);
    expect(props.onResetSetting).toHaveBeenCalledWith('zoom');

    rerender(
      <ClipItem
        {...props}
        item={createItem({ zoomDirection: 'in', zoomAmount: 1.2, scale: 1 })}
        currentTime={2}
      />,
    );
    expect(screen.getByTestId('mini-preview')).toHaveAttribute('data-local-time', '0');
    expect(screen.getByTestId('clip-thumbnail')).toHaveAttribute('data-scale', '1');
  });

  it.each(['image', 'video'] as const)('%sの開始倍率で固定と100％へのリセットを別々に操作できる', (type) => {
    const { props, rerender } = renderItem({
      item: createItem({ type, scale: 3, zoomStartScale: 3, zoomEndScale: 4, zoomDirection: 'in' }),
    });
    openEffectPanel();
    fireEvent.click(screen.getByRole('button', { name: '開始倍率で固定' }));
    expect(props.onResetSetting).toHaveBeenLastCalledWith('zoom');
    fireEvent.click(screen.getByRole('button', { name: '100%にリセット' }));
    expect(props.onResetSetting).toHaveBeenLastCalledWith('zoom-default');
    expect(props.onResetSetting).toHaveBeenCalledTimes(2);
    expect(props.onPreviewZoomEndpoint).toHaveBeenCalledWith('start');

    rerender(<ClipItem {...props} item={{ ...props.item, isLocked: true }} />);
    const reset = screen.getByRole('button', { name: '100%にリセット' });
    expect(reset).toBeDisabled();
    fireEvent.click(reset);
    expect(props.onResetSetting).toHaveBeenCalledTimes(2);
  });

  it('実効％で入力・クランプ・個別リセットでき、前の素材から固定倍率を引き継げる', () => {
    const { props } = renderItem({
      item: createItem({ scale: 1.4, zoomDirection: 'in', zoomAmount: 1.3 }),
      previousZoomEndScale: 1.825,
      onInheritZoom: vi.fn(),
    });
    openEffectPanel();
    expect(screen.getByText('開始 140% → 終了 182%')).toBeInTheDocument();
    const end = screen.getByRole('spinbutton', { name: 'ズーム終了倍率（数値）' });
    expect(end).toHaveAttribute('inputmode', 'decimal');
    fireEvent.focus(end);
    fireEvent.change(end, { target: { value: '130' } });
    fireEvent.blur(end);
    expect(props.onUpdateZoomEndpoint).toHaveBeenLastCalledWith('end', 1.3);
    fireEvent.focus(end);
    fireEvent.change(end, { target: { value: '125.5' } });
    fireEvent.blur(end);
    expect(props.onUpdateZoomEndpoint).toHaveBeenLastCalledWith('end', 1.255);
    fireEvent.focus(end);
    fireEvent.change(end, { target: { value: '900' } });
    fireEvent.blur(end);
    expect(props.onUpdateZoomEndpoint).toHaveBeenLastCalledWith('end', 6);
    fireEvent.click(screen.getByRole('button', { name: 'ズーム開始倍率をリセット' }));
    expect(props.onUpdateZoomEndpoint).toHaveBeenLastCalledWith('start', 1);
    fireEvent.click(screen.getByRole('button', { name: 'ズーム終了倍率をリセット' }));
    expect(props.onUpdateZoomEndpoint).toHaveBeenLastCalledWith('end', 1.4);
    fireEvent.click(screen.getByRole('button', { name: /前の素材の終了倍率を引き継ぐ/ }));
    expect(props.onInheritZoom).toHaveBeenCalledOnce();
  });

  it('位置・サイズの倍率を％で入力し、動画分割・継承・端点確認はロック時に無効になる', () => {
    const { props, rerender } = renderItem({
      item: createItem({ type: 'video', trimStart: 2, trimEnd: 10, duration: 4, playbackSpeed: 2 }),
      onSplit: vi.fn(),
      onInheritZoom: vi.fn(),
      previousZoomEndScale: 1.3,
    });
    fireEvent.click(screen.getByRole('button', { name: '現在位置で分割' }));
    expect(props.onSplit).toHaveBeenCalledOnce();
    openEffectPanel();
    const scale = screen.getByRole('spinbutton', { name: '拡大率（数値）' });
    expect(scale).toHaveValue(100);
    fireEvent.change(scale, { target: { value: '130' } });
    fireEvent.blur(scale);
    expect(props.onUpdateScale).toHaveBeenCalledWith(1.3);
    rerender(<ClipItem {...props} isClipsLocked />);
    expect(screen.getByRole('button', { name: '現在位置で分割' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /前の素材の終了倍率を引き継ぐ/ })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'ズーム終了倍率（数値）' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '終了（末尾）を確認' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '100%にリセット' })).toBeDisabled();
    rerender(<ClipItem {...props} currentTime={2} />);
    expect(screen.getByRole('button', { name: '現在位置で分割' })).toBeDisabled();
  });

  it('数値のフォーカス・確定・スライダー・確認ボタンで選んだ端点を表示する', () => {
    const { props, rerender } = renderItem();
    openEffectPanel();
    const start = screen.getByRole('spinbutton', { name: 'ズーム開始倍率（数値）' });
    const end = screen.getByRole('spinbutton', { name: 'ズーム終了倍率（数値）' });
    fireEvent.focus(end);
    expect(props.onPreviewZoomEndpoint).toHaveBeenLastCalledWith('end');
    expect(props.onUpdateZoomEndpoint).not.toHaveBeenCalled();
    fireEvent.change(end, { target: { value: '180' } });
    fireEvent.blur(end);
    expect(props.onUpdateZoomEndpoint).toHaveBeenLastCalledWith('end', 1.8);
    expect(props.onPreviewZoomEndpoint).toHaveBeenLastCalledWith('end');
    rerender(<ClipItem {...props} zoomPreviewEndpoint="end" />);
    expect(screen.getByTestId('mini-preview')).toHaveAttribute('data-local-time', '4');
    expect(screen.getByRole('button', { name: '終了（末尾）を確認' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.focus(start);
    expect(props.onPreviewZoomEndpoint).toHaveBeenLastCalledWith('start');
    fireEvent.change(screen.getByRole('slider', { name: 'ズーム開始倍率' }), { target: { value: '125' } });
    expect(props.onUpdateZoomEndpoint).toHaveBeenLastCalledWith('start', 1.25);
    expect(props.onPreviewZoomEndpoint).toHaveBeenLastCalledWith('start');
    rerender(<ClipItem {...props} zoomPreviewEndpoint="start" />);
    expect(screen.getByTestId('mini-preview')).toHaveAttribute('data-local-time', '0');
    fireEvent.click(screen.getByRole('button', { name: '終了（末尾）を確認' }));
    expect(props.onPreviewZoomEndpoint).toHaveBeenLastCalledWith('end');
  });

  it('ズームのスライダー上を縦スクロールしても倍率変更や端点シークを起こさない', () => {
    const { props } = renderItem();
    openEffectPanel();
    const slider = screen.getByRole('slider', { name: 'ズーム終了倍率' });
    const touch = (clientX: number, clientY: number) => ({ clientX, clientY, identifier: 1 });
    fireEvent.touchStart(slider, { touches: [touch(100, 100)] });
    fireEvent.change(slider, { target: { value: 150 } });
    fireEvent.touchMove(slider, { touches: [touch(103, 140)] });
    fireEvent.change(slider, { target: { value: 180 } });
    fireEvent.touchEnd(slider, { touches: [], changedTouches: [touch(103, 140)] });
    expect(props.onUpdateZoomEndpoint).not.toHaveBeenCalled();
    expect(props.onPreviewZoomEndpoint).not.toHaveBeenCalled();
  });
});
