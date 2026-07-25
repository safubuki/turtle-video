/**
 * @file settingsAccordionHeader.test.tsx
 * @description Issue #214 の回帰テスト。設定アコーディオンの見出しが
 * 「カード見出し + 閉じているときだけ（開いて設定） + aria-expanded で開閉状態が分かる」
 * という統一ルールを満たすことを、共通コンポーネントと実利用箇所の両面で検証する。
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsAccordionHeader from '../components/common/SettingsAccordionHeader';
import BgmClipList from '../components/sections/BgmClipList';
import NarrationSection from '../components/sections/NarrationSection';
import { useAudioStore } from '../stores/audioStore';
import type { BgmClip, NarrationClip } from '../types';

const OPEN_HINT = '（開いて設定）';

describe('SettingsAccordionHeader', () => {
  it('閉じているときだけ「（開いて設定）」を表示する', () => {
    const { rerender } = render(
      <SettingsAccordionHeader
        title="トリミング設定"
        isOpen={false}
        controlsId="test-panel"
        onToggle={vi.fn()}
      />,
    );

    const closedHeader = screen.getByRole('button', { name: /トリミング設定/ });
    expect(closedHeader).toHaveAttribute('aria-expanded', 'false');
    expect(closedHeader).toHaveAttribute('aria-controls', 'test-panel');
    expect(within(closedHeader).getByText(OPEN_HINT)).toBeInTheDocument();

    rerender(
      <SettingsAccordionHeader
        title="トリミング設定"
        isOpen={true}
        controlsId="test-panel"
        onToggle={vi.fn()}
      />,
    );

    const openHeader = screen.getByRole('button', { name: /トリミング設定/ });
    expect(openHeader).toHaveAttribute('aria-expanded', 'true');
    expect(within(openHeader).queryByText(OPEN_HINT)).toBeNull();
  });

  it('見出し全体のクリックで開閉を通知し、無効時は発火しない', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <SettingsAccordionHeader
        title="フェード設定"
        isOpen={false}
        controlsId="fade-panel"
        onToggle={onToggle}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /フェード設定/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <SettingsAccordionHeader
        title="フェード設定"
        isOpen={false}
        controlsId="fade-panel"
        disabled
        onToggle={onToggle}
      />,
    );

    const disabledHeader = screen.getByRole('button', { name: /フェード設定/ });
    expect(disabledHeader).toBeDisabled();
    fireEvent.click(disabledHeader);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

const createBgmClip = (): BgmClip => ({
  id: 'bgmclip-accordion',
  sourceType: 'file',
  file: new File([''], 'song.mp3', { type: 'audio/mpeg' }),
  url: 'blob:song',
  startTime: 0,
  volume: 1,
  isMuted: false,
  duration: 100,
  trimStart: 0,
  trimEnd: 100,
  isAiEditable: false,
});

describe('BGM クリップのアコーディオン見出し', () => {
  beforeEach(() => {
    useAudioStore.setState({ bgmClips: [createBgmClip()], bgmAutoAdjustToTimeline: false });
  });

  it('トリミング設定とフェード設定が統一見出しになり、開くと補助文言が消える', () => {
    render(
      <BgmClipList
        clips={useAudioStore.getState().bgmClips}
        isLocked={false}
        totalDuration={120}
        currentTime={0}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
        onBeforeEdit={vi.fn()}
      />,
    );

    const trimHeader = screen.getByRole('button', { name: /トリミング設定/ });
    const fadeHeader = screen.getByRole('button', { name: /フェード設定/ });

    for (const header of [trimHeader, fadeHeader]) {
      expect(header).toHaveAttribute('aria-expanded', 'false');
      expect(within(header).getByText(OPEN_HINT)).toBeInTheDocument();
    }

    fireEvent.click(trimHeader);

    const openedTrimHeader = screen.getByRole('button', { name: /トリミング設定/ });
    expect(openedTrimHeader).toHaveAttribute('aria-expanded', 'true');
    expect(within(openedTrimHeader).queryByText(OPEN_HINT)).toBeNull();
    // 展開部が見出しと aria で結び付いていることを確認する
    const panelId = openedTrimHeader.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId as string)).not.toBeNull();

    // 開いていない側は補助文言を保ったまま
    expect(within(screen.getByRole('button', { name: /フェード設定/ })).getByText(OPEN_HINT))
      .toBeInTheDocument();
  });
});

const createNarrationClip = (): NarrationClip => ({
  id: 'narration-accordion',
  sourceType: 'file',
  file: new File([''], 'narration.wav', { type: 'audio/wav' }),
  url: 'blob:narration',
  startTime: 0,
  volume: 1,
  isMuted: false,
  trimStart: 0,
  trimEnd: 12,
  duration: 12,
  isAiEditable: false,
});

describe('ナレーションのトリミング設定見出し', () => {
  it('閉じた状態で「（開いて設定）」を表示し、見出しクリックで展開する', () => {
    render(
      <NarrationSection
        narrations={[createNarrationClip()]}
        offlineMode={false}
        isNarrationLocked={false}
        totalDuration={30}
        currentTime={0}
        onToggleNarrationLock={vi.fn()}
        onAddAiNarration={vi.fn()}
        onEditAiNarration={vi.fn()}
        onNarrationUpload={vi.fn()}
        onRemoveNarration={vi.fn()}
        onMoveNarration={vi.fn()}
        onSaveNarration={vi.fn()}
        onUpdateStartTime={vi.fn()}
        onSetStartTimeToCurrent={vi.fn()}
        onSetEndTimeToCurrent={vi.fn()}
        onUpdateVolume={vi.fn()}
        onToggleMute={vi.fn()}
        onUpdateTrimStart={vi.fn()}
        onUpdateTrimEnd={vi.fn()}
        formatTime={(value) => `${value.toFixed(1)}s`}
        onOpenHelp={vi.fn()}
      />,
    );

    // セクション自体を開いてからクリップ内のアコーディオンを確認する
    fireEvent.click(screen.getByText('ナレーション'));

    const trimHeader = screen.getByRole('button', { name: /トリミング設定/ });
    expect(trimHeader).toHaveAttribute('aria-expanded', 'false');
    expect(within(trimHeader).getByText(OPEN_HINT)).toBeInTheDocument();

    fireEvent.click(trimHeader);

    const openedHeader = screen.getByRole('button', { name: /トリミング設定/ });
    expect(openedHeader).toHaveAttribute('aria-expanded', 'true');
    expect(within(openedHeader).queryByText(OPEN_HINT)).toBeNull();
  });
});
