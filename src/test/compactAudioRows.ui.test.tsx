/**
 * @file compactAudioRows.ui.test.tsx
 * @description 音量・再生速度などのスライダー欄の並べ方（13-304）。
 * - 見出し行に「項目名（＋ミュート）」と右端のリセット。リセットは＋ボタンの隣に置かない
 * - 「速度」のような左ラベルで縦書きにならない。音量と速度の数値欄は左端・幅をそろえる
 * - 対になる横・縦は 1 文字ラベルで続けて並べる
 */
import type { ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClipItem from '../components/media/ClipItem';
import BgmClipList from '../components/sections/BgmClipList';
import NarrationSection from '../components/sections/NarrationSection';
import CaptionPositionField from '../components/common/CaptionPositionField';
import { useAudioStore } from '../stores/audioStore';
import { useCanvasStore } from '../stores/canvasStore';
import type { BgmClip, MediaItem, NarrationClip } from '../types';

vi.mock('../components/common/ClipThumbnail', () => ({ default: () => <div data-testid="clip-thumbnail" /> }));
vi.mock('../components/common/MiniPreview', () => ({ default: () => <div data-testid="mini-preview" /> }));

const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

/** そのスライダー行の＋ボタン（数値欄・スライダー・−/+ が同じ行にある） */
function plusButtonFor(ariaLabel: string) {
  return screen.getByRole('button', { name: new RegExp(`^${ariaLabel}を[\\d.]+増やす$`) });
}

function createVideo(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'video-1', file: new File(['x'], 'clip.mp4', { type: 'video/mp4' }), type: 'video', url: 'blob:video-1',
    volume: 1, isMuted: false, fadeIn: false, fadeOut: false, fadeInDuration: 1, fadeOutDuration: 1,
    duration: 5, originalDuration: 10, trimStart: 0, trimEnd: 10, scale: 1, positionX: 0, positionY: 0,
    rotation: 0, blur: 0, isTransformOpen: false, isLocked: false, playbackSpeed: 2, showSpeedBadge: true,
    ...overrides,
  };
}

function renderClip(overrides: Partial<ComponentProps<typeof ClipItem>> = {}) {
  const props: ComponentProps<typeof ClipItem> = {
    item: createVideo(), timelineRange: { start: 0, end: 5 }, currentTime: 0, index: 0, totalItems: 1,
    isClipsLocked: false, mediaElement: null,
    onMoveUp: vi.fn(), onMoveDown: vi.fn(), onRemove: vi.fn(), onToggleLock: vi.fn(), onToggleTransformPanel: vi.fn(),
    onUpdateVideoTrim: vi.fn(), onUpdateImageDuration: vi.fn(), onUpdateScale: vi.fn(), onUpdatePosition: vi.fn(),
    onResetSetting: vi.fn(), onUpdateVolume: vi.fn(), onToggleMute: vi.fn(),
    onUpdatePlaybackSpeed: vi.fn(), onUpdateShowSpeedBadge: vi.fn(), onUpdateSpeedBadgePosition: vi.fn(),
    onApplySpeedBadgePreset: vi.fn(),
    onToggleFadeIn: vi.fn(), onToggleFadeOut: vi.fn(), onUpdateFadeInDuration: vi.fn(), onUpdateFadeOutDuration: vi.fn(),
    ...overrides,
  };
  render(<ClipItem {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '音量・再生速度' }));
  return props;
}

beforeEach(() => {
  useCanvasStore.setState({ width: 1280, height: 720 });
});

describe('動画カードの音量・再生速度', () => {
  it('音量: リセットは見出し、ミュートは数値欄の左。再生速度: 見出しの下に数値欄から始まる行', () => {
    const props = renderClip();
    const volumeReset = screen.getByRole('button', { name: '音量をリセット' });
    const volumeInput = screen.getByRole('spinbutton', { name: '音量（数値）' });
    const speedInput = screen.getByRole('spinbutton', { name: '再生速度（数値）' });
    // リセットは見出し（数値欄より前）。＋ボタンの右には置かない
    expect(before(volumeReset, volumeInput)).toBe(true);
    expect(before(plusButtonFor('音量'), volumeReset)).toBe(false);
    // ミュートは数値欄（%）の左に置くアイコンだけのボタン（従来の位置。見出しには置かない）
    const mute = screen.getByTitle('ミュート');
    expect(mute.textContent).toBe('');
    expect(before(volumeReset, mute)).toBe(true);
    expect(before(mute, volumeInput)).toBe(true);
    expect(mute.parentElement).toContainElement(volumeInput);
    expect(volumeReset.parentElement).not.toContainElement(mute);
    fireEvent.click(mute);
    expect(props.onToggleMute).toHaveBeenCalledTimes(1);
    fireEvent.click(volumeReset);
    expect(props.onUpdateVolume).toHaveBeenCalledWith(1);
    // 「速度」の左ラベル（縦書きになっていた）は無く、見出しは横書きの「再生速度」
    expect(screen.queryByText('速度', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('再生速度')).toBeInTheDocument();
    // 再生速度は見出し（アイコン＋再生速度）の下に数値欄から始まる行（音量の行とは揃えない）
    expect(before(screen.getByText('再生速度'), speedInput)).toBe(true);
    expect(speedInput.parentElement?.parentElement?.querySelector('button[title="ミュート"]')).toBeNull();
    // 速度のリセットは等倍へ
    fireEvent.click(screen.getByRole('button', { name: '再生速度をリセット' }));
    expect(props.onUpdatePlaybackSpeed).toHaveBeenCalledWith(1);
  });

  it('速度バッジの横・縦は 1 文字ラベルで続けて並べる', () => {
    renderClip();
    const x = screen.getByRole('spinbutton', { name: '速度バッジの横位置（数値）' });
    const y = screen.getByRole('spinbutton', { name: '速度バッジの縦位置（数値）' });
    const heading = screen.getByText('表示位置（左上が0%）');
    expect(before(heading, x)).toBe(true);
    expect(x.style.width).toBe(y.style.width);
    const xLabel = within(x.closest('div.flex-col') as HTMLElement).getByText('横');
    // 1 文字ラベルは文字幅より広い w-4 で、数値欄にくっつけない
    expect(xLabel.className).toContain('w-4');
    expect(y.closest('.mt-1')).not.toBeNull();
    expect(x.closest('.mt-1')).toBeNull();
  });
});

describe('BGM・ナレーションの開始位置と音量', () => {
  it('BGM: 開始位置と音量のリセットは見出しにあり、＋ボタンの隣に無い', () => {
    const clip: BgmClip = {
      id: 'bgm-1', sourceType: 'file', file: new File([''], 'song.mp3', { type: 'audio/mpeg' }), url: 'blob:song',
      startTime: 20, volume: 1, isMuted: false, duration: 100, trimStart: 0, trimEnd: 100, isAiEditable: false,
    };
    useAudioStore.setState({ bgmClips: [clip], bgmAutoAdjustToTimeline: true });
    render(
      <BgmClipList
        clips={useAudioStore.getState().bgmClips}
        isLocked={false}
        totalDuration={60}
        currentTime={10}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
        onBeforeEdit={vi.fn()}
        onBeforeContinuousEdit={vi.fn()}
      />,
    );
    const startReset = screen.getByRole('button', { name: 'BGMの開始位置を0秒にリセット' });
    expect(before(startReset, screen.getByRole('spinbutton', { name: 'BGMの開始位置（数値）' }))).toBe(true);
    const volumeReset = screen.getByRole('button', { name: '音量をリセット' });
    expect(before(volumeReset, screen.getByRole('spinbutton', { name: 'BGMの音量（数値）' }))).toBe(true);
    expect(before(screen.getByTitle('ミュート'), screen.getByRole('spinbutton', { name: 'BGMの音量（数値）' }))).toBe(true);
    expect(before(volumeReset, screen.getByTitle('ミュート'))).toBe(true);
    fireEvent.click(startReset);
    expect(useAudioStore.getState().bgmClips[0].startTime).toBe(0);
  });

  it('ナレーション: 音量のリセットとミュートは見出しにある', () => {
    const narration: NarrationClip = {
      id: 'n-1', sourceType: 'file', file: new File([''], 'n.wav', { type: 'audio/wav' }), url: 'blob:n',
      startTime: 2, volume: 1, isMuted: false, trimStart: 0, trimEnd: 4, duration: 4, isAiEditable: false,
    };
    const onUpdateVolume = vi.fn();
    render(
      <NarrationSection
        narrations={[narration]} offlineMode={false} isNarrationLocked={false} isCaptionLocked={false}
        totalDuration={30} currentTime={0}
        onToggleNarrationLock={vi.fn()} onAddAiNarration={vi.fn()} onEditAiNarration={vi.fn()} onNarrationUpload={vi.fn()}
        onRemoveNarration={vi.fn()} onMoveNarration={vi.fn()} onSaveNarration={vi.fn()} onAddCaptionsFromNarration={vi.fn()}
        onUpdateStartTime={vi.fn()} onSetStartTimeToCurrent={vi.fn()} onSetEndTimeToCurrent={vi.fn()}
        onUpdateVolume={onUpdateVolume} onToggleMute={vi.fn()} onUpdateTrimStart={vi.fn()} onUpdateTrimEnd={vi.fn()}
        formatTime={(value: number) => `${value.toFixed(1)}s`} onOpenHelp={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('ナレーション'));
    const input = screen.getByRole('spinbutton', { name: 'ナレーションの音量（数値）' });
    const reset = screen.getByRole('button', { name: '音量をリセット' });
    expect(before(reset, input)).toBe(true);
    expect(before(screen.getByTitle('ミュート'), input)).toBe(true);
    expect(before(reset, screen.getByTitle('ミュート'))).toBe(true);
    expect(before(screen.getByRole('button', { name: 'ナレーションの開始位置を0秒にリセット' }),
      screen.getByRole('spinbutton', { name: 'ナレーションの開始位置（数値）' }))).toBe(true);
    fireEvent.click(reset);
    expect(onUpdateVolume).toHaveBeenCalledWith('n-1', '1');
  });
});

describe('キャプションのカスタム位置', () => {
  it('横・縦は 1 文字ラベルで続けて並べ、向きは注記で説明する', () => {
    render(
      <CaptionPositionField
        position="bottom"
        positionCustom={{ x: 0, y: -60 }}
        onSetPosition={vi.fn()}
        onSetPositionCustom={vi.fn()}
        ariaLabelPrefix="テスト"
        idPrefix="t"
        supportsCustom
      />,
    );
    expect(screen.getByText('横')).toBeInTheDocument();
    expect(screen.getByText('縦')).toBeInTheDocument();
    expect(screen.queryByText('横 (右+)')).not.toBeInTheDocument();
    expect(screen.getByText(/横は右が＋、縦は上が＋/)).toBeInTheDocument();
  });
});
