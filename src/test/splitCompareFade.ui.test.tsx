/**
 * @file splitCompareFade.ui.test.tsx
 * @description 2画面表示（並べて比較）のフェードを 2 画面の設定でまとめて変える UI。
 * - コネクタの 2 画面設定にフェードイン/アウト（0.5 / 1 / 2 秒）がある
 * - 2 画面を ON にするとカードのフェードを引き継ぎ、OFF にするとペアのフェードを 2 枚のカードへ書き戻す
 * - ペア中のカードはカードのフェードを出さずに案内を出す（ペアでないカードは従来どおり）
 */
import type { ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClipsSection from '../components/sections/ClipsSection';
import ClipItem from '../components/media/ClipItem';
import useMediaStore from '../stores/mediaStore';
import type { MediaItem, SplitCompareSettings } from '../types';

vi.mock('../components/common/ClipThumbnail', () => ({
  default: () => <div data-testid="clip-thumbnail" />,
}));

vi.mock('../components/common/MiniPreview', () => ({
  default: () => <div data-testid="mini-preview" />,
}));

function createVideo(id: string, duration = 5, overrides: Partial<MediaItem> = {}): MediaItem {
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
    ...overrides,
  };
}

const PAIR: SplitCompareSettings = {
  layout: 'horizontal',
  divider: 'straight',
  fit: 'cover',
  lineColor: 'white',
  fadeIn: false,
  fadeOut: false,
  fadeInDuration: 1,
  fadeOutDuration: 1,
};

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

const items = () => useMediaStore.getState().mediaItems;
const openComparePanel = () => fireEvent.click(screen.getByRole('button', { name: /2画面表示 左右・まっすぐ/ }));

describe('2画面の設定でフェードをまとめて変える', () => {
  beforeEach(() => {
    useMediaStore.setState({ isClipsLocked: false });
  });

  it('2画面の設定にフェードイン/アウトがあり、0.5 / 1 / 2 秒を選ぶとペアの設定に入る', () => {
    useMediaStore.setState({
      mediaItems: [createVideo('a', 6, { splitCompareToNext: { ...PAIR } }), createVideo('b', 4)],
    });
    const { rerender } = render(<ClipsSection {...makeProps(items())} />);
    openComparePanel();

    const group = screen.getByTestId('split-compare-fade-settings');
    // 並べ方・境界線・長さと同じ 2 画面の設定パネルの中にある
    expect(group.closest('[class*="border-cyan-500"]')).not.toBeNull();
    const fadeInRow = within(group).getByTestId('split-compare-fade-in');
    const fadeOutRow = within(group).getByTestId('split-compare-fade-out');
    const fadeInToggle = within(fadeInRow).getByRole('checkbox', { name: 'フェードイン' });
    expect(fadeInToggle).not.toBeChecked();
    expect(within(fadeOutRow).getByRole('checkbox', { name: 'フェードアウト' })).not.toBeChecked();

    // 秒数は 0.5 / 1 / 2 秒の 3 段（つまみは段の番号、1 秒が中央）。オフの間は選べない
    const fadeInSlider = within(fadeInRow).getByRole('slider', { name: '2画面のフェードイン時間' });
    expect(fadeInSlider).toHaveAttribute('min', '0');
    expect(fadeInSlider).toHaveAttribute('max', '2');
    expect(fadeInSlider).toHaveValue('1');
    expect(fadeInSlider).toBeDisabled();

    fireEvent.click(fadeInToggle);
    expect(items()[0].splitCompareToNext).toMatchObject({ fadeIn: true, fadeInDuration: 1, fadeOut: false });
    // カード自身のフェードは変えない
    expect(items()[0].fadeIn).toBe(false);
    expect(items()[1].fadeIn).toBe(false);

    rerender(<ClipsSection {...makeProps(items())} />);
    const enabledSlider = within(screen.getByTestId('split-compare-fade-in'))
      .getByRole('slider', { name: '2画面のフェードイン時間' });
    expect(enabledSlider).not.toBeDisabled();
    for (const [index, seconds] of [[0, 0.5], [2, 2], [1, 1]] as const) {
      fireEvent.change(enabledSlider, { target: { value: String(index) } });
      expect(items()[0].splitCompareToNext?.fadeInDuration).toBe(seconds);
      rerender(<ClipsSection {...makeProps(items())} />);
    }

    fireEvent.click(within(screen.getByTestId('split-compare-fade-out')).getByRole('checkbox', { name: 'フェードアウト' }));
    rerender(<ClipsSection {...makeProps(items())} />);
    fireEvent.change(
      within(screen.getByTestId('split-compare-fade-out')).getByRole('slider', { name: '2画面のフェードアウト時間' }),
      { target: { value: '2' } },
    );
    expect(items()[0].splitCompareToNext).toMatchObject({ fadeOut: true, fadeOutDuration: 2 });
  });

  it('フェード行のラベル列は秒数欄に重ならない幅を持つ（カードのフェード行と同じ w-28・文字より狭くならない）', () => {
    useMediaStore.setState({
      mediaItems: [createVideo('a', 6, { splitCompareToNext: { ...PAIR } }), createVideo('b', 4)],
    });
    render(<ClipsSection {...makeProps(items())} />);
    openComparePanel();

    // jsdom はレイアウトを計算しないため、重ならないための幅の約束をクラスで確かめる
    for (const [testId, name] of [['split-compare-fade-in', 'フェードイン'], ['split-compare-fade-out', 'フェードアウト']] as const) {
      const row = screen.getByTestId(testId);
      expect(row).toHaveClass('flex', 'gap-2');
      const label = within(row).getByRole('checkbox', { name }).closest('label') as HTMLElement;
      // 固定幅の列（イン/アウトで秒数欄の左端をそろえる）。中身より狭くならず、縮まない
      expect(label).toHaveClass('w-28', 'min-w-max', 'shrink-0');
      expect(label).not.toHaveClass('w-[5.75rem]');
      expect(within(label).getByText(name)).toHaveClass('whitespace-nowrap');
      // ラベルの隣（行の 2 つ目）が秒数欄。縮むのはこちら側だけ
      expect(row.children).toHaveLength(2);
      expect(row.children[0]).toBe(label);
      const field = row.children[1] as HTMLElement;
      expect(field).toHaveClass('min-w-0', 'flex-1');
      expect(within(field).getByRole('slider', { name: `2画面の${name}時間` })).toBeInTheDocument();
    }
  });

  it('ロック中は 2 画面のフェードも変えられない', () => {
    useMediaStore.setState({
      mediaItems: [createVideo('a', 6, { splitCompareToNext: { ...PAIR, fadeOut: true } }), createVideo('b', 4)],
    });
    render(<ClipsSection {...makeProps(items())} isClipsLocked />);
    fireEvent.click(screen.getByRole('button', { name: /2画面表示 左右・まっすぐ/ }));
    // ロック中はコネクタ自体が押せない（パネルも開かない）
    expect(screen.queryByTestId('split-compare-fade-settings')).not.toBeInTheDocument();
  });

  it('2 画面を ON にすると、2 枚のカードに付いていたフェードをペアへ引き継ぐ（どちらかが ON・長いほう）', () => {
    useMediaStore.setState({
      mediaItems: [
        createVideo('a', 6, { fadeOut: true, fadeOutDuration: 0.5 }),
        createVideo('b', 4, { fadeOut: true, fadeOutDuration: 2, fadeIn: true, fadeInDuration: 0.5 }),
      ],
    });
    const { rerender } = render(<ClipsSection {...makeProps(items())} />);
    fireEvent.click(screen.getByRole('button', { name: '2画面表示' }));
    expect(items()[0].splitCompareToNext).toMatchObject({
      fadeIn: true, fadeInDuration: 0.5, fadeOut: true, fadeOutDuration: 2,
    });

    rerender(<ClipsSection {...makeProps(items())} />);
    const group = screen.getByTestId('split-compare-fade-settings');
    expect(within(group).getByRole('checkbox', { name: 'フェードイン' })).toBeChecked();
    expect(within(group).getByRole('checkbox', { name: 'フェードアウト' })).toBeChecked();
    expect(within(group).getByRole('slider', { name: '2画面のフェードアウト時間' })).toHaveValue('2');
  });

  it('カードにフェードが無ければ、ON にしたときのペアのフェードはオフ・1 秒', () => {
    useMediaStore.setState({ mediaItems: [createVideo('a', 6), createVideo('b', 4)] });
    render(<ClipsSection {...makeProps(items())} />);
    fireEvent.click(screen.getByRole('button', { name: '2画面表示' }));
    expect(items()[0].splitCompareToNext).toMatchObject({
      fadeIn: false, fadeInDuration: 1, fadeOut: false, fadeOutDuration: 1,
    });
  });

  it('2 画面を OFF にすると、ペアのフェードを 2 枚のカードへ書き戻し、もう一度 ON で最後のペア設定が戻る', () => {
    useMediaStore.setState({
      mediaItems: [
        // カード自身は古いフェード（ペア中は使われていない）
        createVideo('a', 6, { fadeIn: true, fadeInDuration: 2 }),
        createVideo('b', 4),
        createVideo('c', 3, { fadeOut: true, fadeOutDuration: 0.5 }),
      ],
    });
    const { rerender } = render(<ClipsSection {...makeProps(items())} />);
    fireEvent.click(screen.getAllByRole('button', { name: '2画面表示' })[0]);
    rerender(<ClipsSection {...makeProps(items())} />);
    // ペア設定を変える（イン オフ・アウト 2 秒）
    const group = screen.getByTestId('split-compare-fade-settings');
    fireEvent.click(within(group).getByRole('checkbox', { name: 'フェードイン' }));
    rerender(<ClipsSection {...makeProps(items())} />);
    fireEvent.click(within(screen.getByTestId('split-compare-fade-settings')).getByRole('checkbox', { name: 'フェードアウト' }));
    rerender(<ClipsSection {...makeProps(items())} />);
    fireEvent.change(
      within(screen.getByTestId('split-compare-fade-settings')).getByRole('slider', { name: '2画面のフェードアウト時間' }),
      { target: { value: '2' } },
    );
    expect(items()[0].splitCompareToNext).toMatchObject({ fadeIn: false, fadeOut: true, fadeOutDuration: 2 });

    rerender(<ClipsSection {...makeProps(items())} />);
    fireEvent.click(screen.getByRole('button', { name: 'オフ' }));
    const [a, b, c] = items();
    expect(a.splitCompareToNext).toBeNull();
    for (const card of [a, b]) {
      expect(card).toMatchObject({ fadeIn: false, fadeOut: true, fadeInDuration: 2, fadeOutDuration: 2 });
    }
    // ペアでないカードは変えない
    expect(c).toMatchObject({ fadeIn: false, fadeOut: true, fadeOutDuration: 0.5 });

    // もう一度 ON: 覚えていたペア設定（最後に設定したフェード）が戻る
    rerender(<ClipsSection {...makeProps(items())} />);
    fireEvent.click(screen.getAllByRole('button', { name: '2画面表示' })[0]);
    expect(items()[0].splitCompareToNext).toMatchObject({ fadeIn: false, fadeOut: true, fadeOutDuration: 2 });
  });

  it('ペア中のカード（partner）はカードのフェードを出さず、2 画面の設定で変える案内を出す。ペアでないカードは従来どおり', () => {
    useMediaStore.setState({
      mediaItems: [createVideo('a', 6, { splitCompareToNext: { ...PAIR } }), createVideo('b', 4), createVideo('c', 3)],
    });
    render(<ClipsSection {...makeProps(items())} />);
    // 再生位置のカード（ペアは同時に始まり、表示は後ろの b が受け持つ）の「フェード・ぼかし」を開く
    fireEvent.click(screen.getAllByRole('button', { name: 'フェード・ぼかし' })[0]);
    const panel = document.getElementById('clip-audio-settings-b') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(within(panel).getByTestId('clip-split-compare-fade-note-b'))
      .toHaveTextContent('2画面表示中は2画面の設定でフェードを変えます');
    expect(within(panel).queryByRole('checkbox', { name: 'フェードイン' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('slider', { name: '動画のフェードアウト時間' })).not.toBeInTheDocument();
    // ぼかしはカードごとのまま
    expect(within(panel).getByRole('slider', { name: 'ぼかし強度' })).toBeInTheDocument();
  });

  it('ペアでない再生位置のカードは、カードのフェードをそのまま切り替えられる', () => {
    useMediaStore.setState({
      mediaItems: [createVideo('a', 6, { splitCompareToNext: { ...PAIR } }), createVideo('b', 4), createVideo('c', 3)],
    });
    const props = makeProps(items());
    // c の区間（ペアの長いほう 6 秒の後）
    render(<ClipsSection {...props} currentTime={7} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'フェード・ぼかし' })[0]);
    const panel = document.getElementById('clip-audio-settings-c') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(within(panel).queryByTestId('clip-split-compare-fade-note-c')).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'フェードアウト' }));
    expect(props.onToggleMediaFadeOut).toHaveBeenCalledWith('c', true);
  });
});

describe('ClipItem: カードのフェード（2画面のペアかどうか）', () => {
  function renderClipItem(overrides: Partial<ComponentProps<typeof ClipItem>> = {}) {
    const props: ComponentProps<typeof ClipItem> = {
      item: createVideo('video-1', 5),
      timelineRange: { start: 0, end: 5 },
      currentTime: 0,
      index: 0,
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
      onUpdateZoomDirection: vi.fn(),
      onUpdateZoomAmount: vi.fn(),
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
    const result = render(<ClipItem {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /^フェード/ }));
    return { ...result, props };
  }

  it('ペアでないカードは従来どおりフェードイン/アウトを切り替え、秒数を選べる', () => {
    const { props } = renderClipItem({ item: createVideo('video-1', 5, { fadeOut: true }) });
    expect(screen.queryByTestId('clip-split-compare-fade-note-video-1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'フェードイン' }));
    expect(props.onToggleFadeIn).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'フェードアウト' }));
    expect(props.onToggleFadeOut).toHaveBeenCalledWith(false);
    fireEvent.change(screen.getByRole('slider', { name: '動画のフェードアウト時間' }), { target: { value: '2' } });
    expect(props.onUpdateFadeOutDuration).toHaveBeenCalledWith(2);
  });

  it('ペア中（isSplitCompareFadeShared）はカードのフェードを出さず案内だけ出す', () => {
    renderClipItem({ item: createVideo('video-1', 5, { fadeIn: true, fadeOut: true }), isSplitCompareFadeShared: true });
    expect(screen.getByTestId('clip-split-compare-fade-note-video-1'))
      .toHaveTextContent('2画面表示中は2画面の設定でフェードを変えます');
    expect(screen.queryByRole('checkbox', { name: 'フェードイン' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'フェードアウト' })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: '動画のフェードイン時間' })).not.toBeInTheDocument();
  });
});
