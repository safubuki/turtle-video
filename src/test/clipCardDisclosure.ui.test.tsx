import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClipsSection from '../components/sections/ClipsSection';
import useMediaStore from '../stores/mediaStore';
import type { MediaItem } from '../types';

function createImage(id: string, duration = 5): MediaItem {
  return {
    id,
    file: new File(['image'], `${id}.png`, { type: 'image/png' }),
    type: 'image',
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

function renderSection(overrides: Partial<ComponentProps<typeof ClipsSection>> = {}) {
  const props: ComponentProps<typeof ClipsSection> = {
    mediaItems: [],
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
    ...overrides,
  };
  return { ...render(<ClipsSection {...props} />), props };
}

function durationSliders() {
  return screen.queryAllByRole('slider', { name: '画像の表示時間' });
}

describe('動画・画像カードの折りたたみ', () => {
  it('素材が無いときはセクションを閉じ、保存プロジェクトに素材があれば開く', () => {
    const { rerender, props } = renderSection({ mediaItems: [] });
    expect(screen.queryByText('動画または画像ファイルを追加してください')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('動画・画像'));
    expect(screen.getByText('動画または画像ファイルを追加してください')).toBeInTheDocument();

    rerender(<ClipsSection {...props} mediaItems={[createImage('added')]} currentTime={0} />);
    expect(screen.getByTestId('clip-card-added')).toBeInTheDocument();
  });

  it('閉じていても保存プロジェクトの読み込みでセクションを開く', () => {
    const { rerender, props } = renderSection({
      mediaItems: [createImage('a'), createImage('b')],
    });
    fireEvent.click(screen.getByText('動画・画像'));
    expect(screen.queryByTestId('clip-card-a')).not.toBeInTheDocument();

    act(() => {
      useMediaStore.setState((state) => ({ clipListRestoreEpoch: state.clipListRestoreEpoch + 1 }));
    });
    rerender(<ClipsSection {...props} mediaItems={[createImage('c'), createImage('d')]} currentTime={0} />);
    expect(screen.getByTestId('clip-card-c')).toBeInTheDocument();
    expect(screen.getByText('(2件)')).toBeInTheDocument();
  });

  it('1枚のときは再生位置のカードが開き、まとめて開閉は出ない', () => {
    renderSection({ mediaItems: [createImage('only')] });
    expect(durationSliders()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'すべて開く' })).not.toBeInTheDocument();
    expect(screen.getByTestId('clip-card-only')).toHaveAttribute('data-focused', 'true');
  });

  it('閉じた列から必要なカードだけ開き、プレビュー位置へ追従する', () => {
    const items = [createImage('a'), createImage('b'), createImage('c')];
    const { rerender, props } = renderSection({ mediaItems: items, currentTime: 0 });

    expect(screen.getByRole('button', { name: 'すべて開く' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'すべて閉じる' })).toBeEnabled();
    expect(durationSliders()).toHaveLength(1);
    expect(screen.getByTestId('clip-card-a')).toHaveAttribute('data-focused', 'true');
    expect(screen.getByTestId('clip-card-b')).toHaveAttribute('data-focused', 'false');
    expect(screen.queryByTestId('clip-card-body-b')).not.toBeInTheDocument();
    expect(screen.queryByTestId('clip-card-summary-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('clip-card-a').querySelector('[data-thumbnail-size="compact"]')).not.toBeNull();
    expect(screen.getByTestId('clip-card-b').querySelector('[data-thumbnail-size="prominent"]')).not.toBeNull();
    expect(screen.getByTestId('clip-card-summary-b')).not.toHaveClass('overflow-x-auto');
    expect(screen.getByTestId('clip-card-summary-b')).toHaveTextContent('0:00.0–0:05.0');
    expect(screen.getByTestId('clip-card-summary-b')).toHaveTextContent('5秒');

    fireEvent.click(screen.getByTestId('clip-card-toggle-b'));
    expect(durationSliders()).toHaveLength(2);
    expect(screen.queryByTestId('clip-card-summary-b')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'すべて閉じる' }));
    expect(durationSliders()).toHaveLength(0);
    expect(screen.getByTestId('clip-card-a')).toHaveAttribute('data-focused', 'true');

    rerender(<ClipsSection {...props} mediaItems={items} currentTime={6} isPlaying={false} />);
    expect(screen.getByTestId('clip-card-b')).toHaveAttribute('data-focused', 'true');
    expect(screen.getByTestId('clip-card-body-b')).toBeInTheDocument();
    expect(screen.queryByTestId('clip-card-body-a')).not.toBeInTheDocument();
  });

  it('再生中と終端停止ではカードを開かず、停止中のスライダー移動で開く', () => {
    const items = [createImage('a'), createImage('b')];
    const { rerender, props } = renderSection({
      mediaItems: items,
      currentTime: 4.8,
      isPlaying: true,
    });
    expect(screen.getByTestId('clip-card-body-a')).toBeInTheDocument();

    rerender(<ClipsSection {...props} mediaItems={items} currentTime={5.05} isPlaying />);
    expect(screen.getByTestId('clip-card-b')).toHaveAttribute('data-focused', 'true');
    expect(screen.queryByTestId('clip-card-body-b')).not.toBeInTheDocument();
    expect(screen.getByTestId('clip-card-body-a')).toBeInTheDocument();

    rerender(<ClipsSection {...props} mediaItems={items} currentTime={6} isPlaying={false} />);
    expect(screen.queryByTestId('clip-card-body-b')).not.toBeInTheDocument();
    expect(screen.getByTestId('clip-card-body-a')).toBeInTheDocument();

    rerender(<ClipsSection {...props} mediaItems={items} currentTime={0} isPlaying={false} />);
    rerender(<ClipsSection {...props} mediaItems={items} currentTime={6} isPlaying={false} />);
    expect(screen.getByTestId('clip-card-body-b')).toBeInTheDocument();
    expect(screen.queryByTestId('clip-card-body-a')).not.toBeInTheDocument();
  });

  it('複数を同時に追加するとプレビュー位置のカードだけ開く', () => {
    const { rerender, props } = renderSection({ mediaItems: [] });
    const items = [createImage('a'), createImage('b'), createImage('c'), createImage('d')];
    rerender(<ClipsSection {...props} mediaItems={items} currentTime={0} isPlaying={false} />);

    expect(screen.getByTestId('clip-card-a')).toHaveAttribute('data-focused', 'true');
    expect(screen.getByTestId('clip-card-body-a')).toBeInTheDocument();
    expect(screen.queryByTestId('clip-card-body-d')).not.toBeInTheDocument();
    expect(screen.getByTestId('clip-card-summary-d')).toBeInTheDocument();
  });

  it('セクションがロック中でもまとめて開閉できる', () => {
    renderSection({
      mediaItems: [createImage('a'), createImage('b')],
      isClipsLocked: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'すべて開く' }));
    expect(durationSliders()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'すべて閉じる' }));
    expect(durationSliders()).toHaveLength(0);
  });
});
