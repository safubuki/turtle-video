/**
 * カード間コネクタの「並べて比較（同時再生）」UI のテスト
 */
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClipsSection from '../components/sections/ClipsSection';
import useMediaStore from '../stores/mediaStore';
import type { MediaItem } from '../types';

function createVideo(id: string, duration = 5): MediaItem {
  return {
    id,
    file: new File(['video'], `${id}.mp4`, { type: 'video/mp4' }),
    type: 'video',
    url: `blob:${id}`,
    volume: 1,
    isMuted: false,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 1,
    fadeOutDuration: 1,
    duration,
    originalDuration: duration,
    trimStart: 0,
    trimEnd: duration,
    scale: 1,
    positionX: 0,
    positionY: 0,
    rotation: 0,
    isTransformOpen: false,
    isLocked: false,
  };
}

function makeProps(mediaItems: MediaItem[]): ComponentProps<typeof ClipsSection> {
  return {
    mediaItems,
    mediaTimelineRanges: {},
    currentTime: 0,
    isPlaying: false,
    isClipsLocked: false,
    mediaElements: {},
    onToggleClipsLock: vi.fn(),
    onMediaUpload: vi.fn(),
    onOpenMediaPicker: vi.fn(),
    supportsShowOpenFilePicker: false,
    onAspectRatioChange: vi.fn(),
    onMoveMedia: vi.fn(),
    onRemoveMedia: vi.fn(),
    onToggleMediaLock: vi.fn(),
    onToggleTransformPanel: vi.fn(),
    onUpdateVideoTrim: vi.fn(),
    onSetVideoTrimFromCurrent: vi.fn(),
    onUpdateImageDuration: vi.fn(),
    onUpdateMediaScale: vi.fn(),
    onUpdateMediaZoomDirection: vi.fn(),
    onUpdateMediaZoomAmount: vi.fn(),
    onUpdateMediaPosition: vi.fn(),
    onRotateMedia: vi.fn(),
    onUpdateMediaBlur: vi.fn(),
    onResetMediaSetting: vi.fn(),
    onUpdateMediaVolume: vi.fn(),
    onToggleMediaMute: vi.fn(),
    onBeforeTransitionEdit: vi.fn(),
    onToggleMediaFadeIn: vi.fn(),
    onToggleMediaFadeOut: vi.fn(),
    onUpdateFadeInDuration: vi.fn(),
    onUpdateFadeOutDuration: vi.fn(),
    onOpenHelp: vi.fn(),
  };
}

function renderSection(mediaItems: MediaItem[]) {
  return render(<ClipsSection {...makeProps(mediaItems)} />);
}

describe('並べて比較（同時再生）コネクタ', () => {
  beforeEach(() => {
    useMediaStore.setState({
      mediaItems: [
        { ...createVideo('a', 6), transitionToNext: { type: 'fade-black', duration: 1 } },
        createVideo('b', 4),
        createVideo('c', 5),
      ],
      totalDuration: 15,
      isClipsLocked: false,
    });
  });

  it('コネクタから比較を ON にすると、切り替え効果を外して既定設定で保存し、総尺がペアの長いほうになる', () => {
    const { rerender } = renderSection(useMediaStore.getState().mediaItems);
    fireEvent.click(screen.getAllByRole('button', { name: '並べて比較' })[0]);

    const state = useMediaStore.getState();
    expect(state.mediaItems[0].splitCompareToNext).toEqual({
      layout: 'horizontal', divider: 'straight', fit: 'cover', lineColor: 'white',
    });
    expect(state.mediaItems[0].transitionToNext).toBeNull();
    expect(state.totalDuration).toBe(11); // max(6, 4) + 5

    rerender(<ClipsSection {...makeProps(state.mediaItems)} />);
    // コネクタの表示が比較設定に変わる
    expect(screen.getByRole('button', { name: '並べて比較 左右・まっすぐ' })).toBeInTheDocument();

    // 並べ方・境界線を変更できる
    fireEvent.click(screen.getByRole('button', { name: 'ななめ' }));
    expect(useMediaStore.getState().mediaItems[0].splitCompareToNext?.divider).toBe('diagonal');

    // オン/オフが見え、「オフ」で比較を解除できて比較前のトランジションが戻る
    expect(screen.getByRole('button', { name: 'オン' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'オフ' }));
    expect(useMediaStore.getState().mediaItems[0].splitCompareToNext).toBeNull();
    expect(useMediaStore.getState().mediaItems[0].transitionToNext).toEqual({ type: 'fade-black', duration: 1 });
    expect(useMediaStore.getState().totalDuration).toBe(15);
  });

  it('楕円ボタンの水色側（並べて比較）を押すと、そのまま比較になって設定が開く。紫側で元に戻せる', () => {
    const { rerender } = renderSection(useMediaStore.getState().mediaItems);
    // 未設定の境界でも両方の入口が見えている
    expect(screen.getAllByRole('button', { name: '並べて比較' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: '並べて比較' })[0]);
    expect(useMediaStore.getState().mediaItems[0].splitCompareToNext).not.toBeNull();

    rerender(<ClipsSection {...makeProps(useMediaStore.getState().mediaItems)} />);
    expect(screen.getByRole('button', { name: 'ななめ' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ななめ' }));
    rerender(<ClipsSection {...makeProps(useMediaStore.getState().mediaItems)} />);
    // 紫側を押すと順番に再生へ戻り、トランジションの設定が開く
    fireEvent.click(screen.getAllByRole('button', { name: 'トランジション' })[0]);
    expect(useMediaStore.getState().mediaItems[0].splitCompareToNext).toBeNull();
    expect(useMediaStore.getState().mediaItems[0].transitionToNext).toEqual({ type: 'fade-black', duration: 1 });
    rerender(<ClipsSection {...makeProps(useMediaStore.getState().mediaItems)} />);
    expect(screen.getByRole('button', { name: 'ディゾルブ' })).toBeInTheDocument();
    // もう一度水色側を押すと、直前の比較設定（ななめ）が戻る
    fireEvent.click(screen.getAllByRole('button', { name: '並べて比較' })[0]);
    expect(useMediaStore.getState().mediaItems[0].splitCompareToNext?.divider).toBe('diagonal');
  });

  it('並べて比較のペアは、再生位置にあるとき 2 枚とも枠が光る', () => {
    const items: MediaItem[] = [
      { ...createVideo('a', 6), splitCompareToNext: { layout: 'auto', divider: 'straight', fit: 'cover', lineColor: 'white' } },
      createVideo('b', 4),
      createVideo('c', 5),
    ];
    useMediaStore.setState({ mediaItems: items });
    const { rerender } = render(<ClipsSection {...makeProps(items)} currentTime={1} />);
    expect(screen.getByTestId('clip-card-a')).toHaveAttribute('data-focused', 'true');
    expect(screen.getByTestId('clip-card-b')).toHaveAttribute('data-focused', 'true');
    expect(screen.getByTestId('clip-card-c')).toHaveAttribute('data-focused', 'false');
    // 短いほう（b）が終わって最後のコマで止まっている間もペアとして光る
    rerender(<ClipsSection {...makeProps(items)} currentTime={5} />);
    expect(screen.getByTestId('clip-card-b')).toHaveAttribute('data-focused', 'true');
    // ペアの後ろへ進んだら次のカードだけ
    rerender(<ClipsSection {...makeProps(items)} currentTime={7} />);
    expect(screen.getByTestId('clip-card-a')).toHaveAttribute('data-focused', 'false');
    expect(screen.getByTestId('clip-card-b')).toHaveAttribute('data-focused', 'false');
    expect(screen.getByTestId('clip-card-c')).toHaveAttribute('data-focused', 'true');
  });

  it('ペアの後ろの境界では比較を重ねて設定できず、ディゾルブも選べない', () => {
    useMediaStore.setState({
      mediaItems: [
        { ...createVideo('a', 6), splitCompareToNext: { layout: 'auto', divider: 'straight', fit: 'cover', lineColor: 'white' } },
        createVideo('b', 4),
        createVideo('c', 5),
      ],
    });
    renderSection(useMediaStore.getState().mediaItems);
    // 2 つ目のコネクタ（b → c）を開く
    // 2 つ目の境界の水色側を押しても比較にはならず、理由が出る
    fireEvent.click(screen.getByRole('button', { name: '並べて比較' }));
    expect(useMediaStore.getState().mediaItems[1].splitCompareToNext).toBeFalsy();
    expect(screen.getByText(/上のカードと並べて比較中のため/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ディゾルブ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'フェード(黒)' })).not.toBeDisabled();
  });
});
