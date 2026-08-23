/**
 * キャプションのタイミング打ちバーにある無音区間ナビゲーションのテスト（Issue #217）。
 *
 * 固定する不変条件:
 * - 「-1s」の左に「無音区間：前へ」、「+1s」の右に「無音区間：次へ」が並ぶこと
 * - モバイルでは5操作を1行グリッドへ固定し、「次へ」だけを改行させないこと
 * - 押すと onSeekToSilenceBoundary が正しい方向で呼ばれること
 * - 移動先が無い方向のボタンは無効になること（先頭・末尾で足踏みしない）
 * - 既存の -1s / +1s / 再生ボタンを壊していないこと
 * - 「読みやすい位置へ自動調整」は既定 ON で、OFF 時は comfortAdjust: false になること
 */
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import CaptionSection from '../components/sections/CaptionSection';
import type { Caption } from '../types';
import { DEFAULT_VIDEO_TITLE_SETTINGS } from '../utils/videoTitle';

// タイミング打ちはキャプション 2 件以上で使えるため、最低限の 2 件を用意する
const captions: Caption[] = [
  {
    id: 'c1',
    text: '1つ目',
    startTime: 0,
    endTime: 2,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 0.5,
    fadeOutDuration: 0.5,
  },
  {
    id: 'c2',
    text: '2つ目',
    startTime: 3,
    endTime: 5,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 0.5,
    fadeOutDuration: 0.5,
  },
];

function renderStampBar(
  overrides: Partial<ComponentProps<typeof CaptionSection>> = {},
) {
  const onSeekToSilenceBoundary = vi.fn();
  const onSeekBy = vi.fn();

  const props: ComponentProps<typeof CaptionSection> = {
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
    onToggleLock: vi.fn(),
    totalDuration: 10,
    currentTime: 5,
    onAddCaption: vi.fn(),
    onUpdateCaption: vi.fn(),
    onRemoveCaption: vi.fn(),
    onMoveCaption: vi.fn(),
    onClearAllCaptions: vi.fn(),
    onSetEnabled: vi.fn(),
    onSetFontSize: vi.fn(),
    onSetFontStyle: vi.fn(),
    onSetTextAlign: vi.fn(),
    onSetFontColor: vi.fn(),
    onSetStrokeColor: vi.fn(),
    onSetStrokeWidth: vi.fn(),
    onSetPosition: vi.fn(),
    onSetBlur: vi.fn(),
    onSetBackgroundEnabled: vi.fn(),
    onSetBackgroundColor: vi.fn(),
    onSetBackgroundOpacity: vi.fn(),
    onSetBackgroundRadius: vi.fn(),
    onSetBulkFadeIn: vi.fn(),
    onSetBulkFadeOut: vi.fn(),
    onSetBulkFadeInDuration: vi.fn(),
    onSetBulkFadeOutDuration: vi.fn(),
    onOpenHelp: vi.fn(),
    formatTime: (s: number) => `${s.toFixed(1)}s`,
    onApplyCaptions: vi.fn(),
    onShiftCaptions: vi.fn(),
    isPlaying: false,
    onTogglePlay: vi.fn(),
    onSeekBy,
    onSeekToSilenceBoundary,
    hasPrevSilenceBoundary: true,
    hasNextSilenceBoundary: true,
    onUpdateCaptionLive: vi.fn(),
    onUpdateVideoTitle: vi.fn(),
    onSetVideoTitleRange: vi.fn(),
    onResetVideoTitle: vi.fn(),
    onSetFontSizeCustom: vi.fn(),
    onSetPositionCustom: vi.fn(),
    ...overrides,
  };

  const result = render(<CaptionSection {...props} />);

  // タイミング打ちモードへ入る（バーはこのモードでのみ表示される）
  fireEvent.click(screen.getByRole('button', { name: /タイミング打ち/ }));

  return { ...result, onSeekToSilenceBoundary, onSeekBy };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('タイミング打ちバーの無音区間ナビゲーション', () => {
  it('「無音区間：前へ」で prev 方向へ移動を要求する', () => {
    const { onSeekToSilenceBoundary } = renderStampBar();

    fireEvent.click(screen.getByRole('button', { name: '無音区間：前へ' }));

    expect(onSeekToSilenceBoundary).toHaveBeenCalledTimes(1);
    expect(onSeekToSilenceBoundary).toHaveBeenCalledWith('prev', { comfortAdjust: true });
  });

  it('「無音区間：次へ」で next 方向へ移動を要求する', () => {
    const { onSeekToSilenceBoundary } = renderStampBar();

    fireEvent.click(screen.getByRole('button', { name: '無音区間：次へ' }));

    expect(onSeekToSilenceBoundary).toHaveBeenCalledTimes(1);
    expect(onSeekToSilenceBoundary).toHaveBeenCalledWith('next', { comfortAdjust: true });
  });

  it('「読みやすい位置へ自動調整」は既定 ON で、OFF にすると exact 移動になる', () => {
    const { onSeekToSilenceBoundary } = renderStampBar({
      silenceRegions: [
        { silenceStart: 1, silenceEnd: 2, duration: 1, center: 1.5 },
      ],
    });

    const comfortToggle = screen.getByRole('checkbox', {
      name: /読みやすい位置へ自動調整/,
    });
    expect(comfortToggle).toBeChecked();

    fireEvent.click(comfortToggle);
    expect(comfortToggle).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: '無音区間：次へ' }));
    expect(onSeekToSilenceBoundary).toHaveBeenLastCalledWith('next', { comfortAdjust: false });
  });

  it('-1s の左・+1s の右に並ぶ', () => {
    renderStampBar();

    const prevButton = screen.getByRole('button', { name: '無音区間：前へ' });
    const nextButton = screen.getByRole('button', { name: '無音区間：次へ' });
    const minusButton = screen.getByRole('button', { name: '-1s' });
    const plusButton = screen.getByRole('button', { name: '+1s' });

    // DOM 上の並び順を DOCUMENT_POSITION_FOLLOWING で確認する
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    expect(follows(prevButton, minusButton)).toBe(true);
    expect(follows(plusButton, nextButton)).toBe(true);
  });

  it('モバイルでは5操作を専用の1行グリッドへ固定する', () => {
    renderStampBar();

    const transport = screen.getByTestId('caption-stamp-transport');
    expect(transport).toHaveClass('basis-full');
    expect(transport).toHaveClass(
      'grid-cols-[minmax(0,1fr)_auto_auto_auto_minmax(0,1fr)]',
    );
    expect(transport).toContainElement(
      screen.getByRole('button', { name: '無音区間：前へ' }),
    );
    expect(transport).toContainElement(screen.getByRole('button', { name: '-1s' }));
    expect(transport).toContainElement(screen.getByTitle('再生'));
    expect(transport).toContainElement(screen.getByRole('button', { name: '+1s' }));
    expect(transport).toContainElement(
      screen.getByRole('button', { name: '無音区間：次へ' }),
    );
  });

  it('移動先が無い方向のボタンは無効になる', () => {
    // 尺が 0 なら先頭・末尾候補も無く、両方向とも無効になる
    renderStampBar({
      totalDuration: 0,
      currentTime: 0,
      hasPrevSilenceBoundary: false,
      hasNextSilenceBoundary: false,
      silenceRegions: [],
    });

    expect(screen.getByRole('button', { name: '無音区間：前へ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '無音区間：次へ' })).toBeDisabled();
  });

  it('既存の -1s / +1s は従来どおり動く', () => {
    const { onSeekBy } = renderStampBar();

    fireEvent.click(screen.getByRole('button', { name: '-1s' }));
    expect(onSeekBy).toHaveBeenLastCalledWith(-1);

    fireEvent.click(screen.getByRole('button', { name: '+1s' }));
    expect(onSeekBy).toHaveBeenLastCalledWith(1);
  });
});
