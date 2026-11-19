/**
 * @file sectionFileDrop.test.tsx
 * @description 動画・画像 / BGM / ナレーションの各セクションへファイルをドラッグ&ドロップして追加する
 */
import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClipsSection from '../components/sections/ClipsSection';
import BgmSection from '../components/sections/BgmSection';
import NarrationSection from '../components/sections/NarrationSection';
import { PlatformCapabilitiesProvider } from '../app/PlatformCapabilitiesContext';
import { getPlatformCapabilities } from '../utils/platform';
import { useUIStore } from '../stores/uiStore';
import { usePreventWindowFileDrop } from '../hooks/useFileDropZone';
import {
  hasDraggedFiles,
  matchesFileAccept,
  partitionFilesByAccept,
  resolveDroppedFileMimeType,
} from '../utils/fileDrop';

const video = () => new File(['v'], 'clip.mp4', { type: 'video/mp4' });
const image = () => new File(['i'], 'photo.png', { type: 'image/png' });
const mp3 = () => new File(['a'], 'song.mp3', { type: 'audio/mpeg' });
const text = () => new File(['t'], 'memo.txt', { type: 'text/plain' });

function fileTransfer(files: File[]) {
  return { dataTransfer: { files, types: ['Files'], dropEffect: 'none' } };
}

function dragFilesOver(target: Element, files: File[]) {
  fireEvent.dragEnter(target, fileTransfer(files));
  fireEvent.dragOver(target, fileTransfer(files));
}

function dropFiles(target: Element, files: File[]) {
  dragFilesOver(target, files);
  fireEvent.drop(target, fileTransfer(files));
}

function renderClipsSection(overrides: Partial<ComponentProps<typeof ClipsSection>> = {}) {
  const props: ComponentProps<typeof ClipsSection> = {
    mediaItems: [],
    mediaTimelineRanges: {},
    currentTime: 0,
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
    defaultOpen: true,
    ...overrides,
  };
  return { ...render(<ClipsSection {...props} />), props };
}

function bgmSectionProps(overrides: Partial<ComponentProps<typeof BgmSection>> = {}): ComponentProps<typeof BgmSection> {
  return {
    bgm: null,
    bgmClips: [],
    isBgmLocked: false,
    totalDuration: 30,
    currentTime: 0,
    onToggleBgmLock: vi.fn(),
    onBgmUpload: vi.fn(),
    onRemoveBgm: vi.fn(),
    onUpdateStartPoint: vi.fn(),
    onUpdateDelay: vi.fn(),
    onUpdateVolume: vi.fn(),
    onToggleFadeIn: vi.fn(),
    onToggleFadeOut: vi.fn(),
    onUpdateFadeInDuration: vi.fn(),
    onUpdateFadeOutDuration: vi.fn(),
    formatTime: (value: number) => `${value.toFixed(1)}s`,
    onOpenHelp: vi.fn(),
    onAddBgmClips: vi.fn(),
    onBeforeBgmClipEdit: vi.fn(),
    onBeforeBgmClipContinuousEdit: vi.fn(),
    ...overrides,
  };
}

function narrationSectionProps(
  overrides: Partial<ComponentProps<typeof NarrationSection>> = {},
): ComponentProps<typeof NarrationSection> {
  return {
    narrations: [],
    offlineMode: false,
    isNarrationLocked: false,
    isCaptionLocked: false,
    totalDuration: 30,
    currentTime: 0,
    onToggleNarrationLock: vi.fn(),
    onAddAiNarration: vi.fn(),
    onEditAiNarration: vi.fn(),
    onNarrationUpload: vi.fn(),
    onRemoveNarration: vi.fn(),
    onMoveNarration: vi.fn(),
    onSaveNarration: vi.fn(),
    onAddCaptionsFromNarration: vi.fn(),
    onUpdateStartTime: vi.fn(),
    onSetStartTimeToCurrent: vi.fn(),
    onSetEndTimeToCurrent: vi.fn(),
    onUpdateVolume: vi.fn(),
    onToggleMute: vi.fn(),
    onUpdateTrimStart: vi.fn(),
    onUpdateTrimEnd: vi.fn(),
    formatTime: (value: number) => `${value.toFixed(1)}s`,
    onOpenHelp: vi.fn(),
    ...overrides,
  } as ComponentProps<typeof NarrationSection>;
}

beforeEach(() => {
  useUIStore.setState({ toastMessage: '' });
});

describe('ドロップの受付判定', () => {
  it('input accept と同じ書式（type/*・MIME・拡張子）で判定する', () => {
    expect(matchesFileAccept(video(), 'image/*,video/*')).toBe(true);
    expect(matchesFileAccept(image(), 'image/*,video/*')).toBe(true);
    expect(matchesFileAccept(mp3(), 'image/*,video/*')).toBe(false);
    expect(matchesFileAccept(mp3(), 'audio/*')).toBe(true);
    expect(matchesFileAccept(video(), 'audio/*')).toBe(false);
    expect(matchesFileAccept(video(), 'audio/*,video/*,.mp4')).toBe(true);
    expect(matchesFileAccept(new File([''], 'a.MOV', { type: '' }), '.mov')).toBe(true);
    expect(matchesFileAccept(text(), 'audio/*')).toBe(false);
    expect(matchesFileAccept(text(), '')).toBe(true);
  });

  it('type が空のファイル（Windows の .opus など）は拡張子から推定する', () => {
    expect(resolveDroppedFileMimeType({ name: 'voice.opus', type: '' })).toBe('audio/opus');
    expect(matchesFileAccept(new File([''], 'voice.opus', { type: '' }), 'audio/*')).toBe(true);
    expect(matchesFileAccept(new File([''], 'noext', { type: '' }), 'audio/*')).toBe(false);
  });

  it('受け付けるものとそれ以外に分け、ページ内のドラッグ（Files 以外）は対象外', () => {
    const { accepted, rejected } = partitionFilesByAccept([mp3(), text(), video()], 'audio/*');
    expect(accepted.map((f) => f.name)).toEqual(['song.mp3']);
    expect(rejected.map((f) => f.name)).toEqual(['memo.txt', 'clip.mp4']);
    expect(hasDraggedFiles({ types: ['Files'] })).toBe(true);
    expect(hasDraggedFiles({ types: ['text/plain'] })).toBe(false);
    expect(hasDraggedFiles(null)).toBe(false);
  });
});

describe('動画・画像セクションへのドロップ', () => {
  it('ドラッグ中は案内を出し、動画・画像だけを追加して他は件数をトーストで伝える', () => {
    const onDropMediaFiles = vi.fn();
    renderClipsSection({ onDropMediaFiles });
    const section = screen.getByTestId('clips-section');

    dragFilesOver(section, [video()]);
    expect(screen.getByTestId('clips-section-drop-overlay')).toHaveTextContent('ドロップして動画・画像を追加');

    fireEvent.drop(section, fileTransfer([video(), text(), image()]));
    expect(screen.queryByTestId('clips-section-drop-overlay')).not.toBeInTheDocument();
    expect(onDropMediaFiles).toHaveBeenCalledTimes(1);
    expect(onDropMediaFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['clip.mp4', 'photo.png']);
    expect(useUIStore.getState().toastMessage).toContain('1件は追加しませんでした');
  });

  it('子要素を出入りしても案内は消えず、セクションから出たら消える', () => {
    renderClipsSection({ onDropMediaFiles: vi.fn() });
    const section = screen.getByTestId('clips-section');
    const header = screen.getByText('動画・画像');
    fireEvent.dragEnter(section, fileTransfer([video()]));
    fireEvent.dragEnter(header, fileTransfer([video()]));
    fireEvent.dragLeave(section, fileTransfer([video()]));
    expect(screen.getByTestId('clips-section-drop-overlay')).toBeInTheDocument();
    fireEvent.dragLeave(header, fileTransfer([video()]));
    expect(screen.queryByTestId('clips-section-drop-overlay')).not.toBeInTheDocument();
  });

  it('閉じたセクション（見出しバーだけ）にもドロップできる', () => {
    const onDropMediaFiles = vi.fn();
    renderClipsSection({ onDropMediaFiles, defaultOpen: false });
    dropFiles(screen.getByText('動画・画像'), [video()]);
    expect(onDropMediaFiles).toHaveBeenCalledTimes(1);
  });

  it('ロック中は「追加できません」と出し、追加しない', () => {
    const onDropMediaFiles = vi.fn();
    renderClipsSection({ onDropMediaFiles, isClipsLocked: true });
    const section = screen.getByTestId('clips-section');
    dragFilesOver(section, [video()]);
    expect(screen.getByTestId('clips-section-drop-overlay')).toHaveTextContent('ロック中のため追加できません');
    fireEvent.drop(section, fileTransfer([video()]));
    expect(onDropMediaFiles).not.toHaveBeenCalled();
  });

  it('ページ内の要素ドラッグ（ファイル以外）には反応しない', () => {
    const onDropMediaFiles = vi.fn();
    renderClipsSection({ onDropMediaFiles });
    const section = screen.getByTestId('clips-section');
    fireEvent.dragEnter(section, { dataTransfer: { files: [], types: ['text/plain'] } });
    expect(screen.queryByTestId('clips-section-drop-overlay')).not.toBeInTheDocument();
    fireEvent.drop(section, { dataTransfer: { files: [], types: ['text/plain'] } });
    expect(onDropMediaFiles).not.toHaveBeenCalled();
  });

  it('受け付けるファイルが 1 件もなければ追加処理を呼ばない', () => {
    const onDropMediaFiles = vi.fn();
    renderClipsSection({ onDropMediaFiles });
    dropFiles(screen.getByTestId('clips-section'), [mp3()]);
    expect(onDropMediaFiles).not.toHaveBeenCalled();
    expect(useUIStore.getState().toastMessage).toContain('動画・画像ではないファイル1件');
  });
});

describe('BGM セクションへのドロップ', () => {
  it('音声と音声付き動画を受け付け、閉じた見出しバーにもドロップできる', () => {
    const onDropBgmFiles = vi.fn();
    render(<BgmSection {...bgmSectionProps({ onDropBgmFiles })} />);
    const header = screen.getByText('BGM');
    dragFilesOver(header, [mp3()]);
    expect(screen.getByTestId('bgm-section-drop-overlay')).toHaveTextContent('ドロップしてBGMを追加');
    fireEvent.drop(header, fileTransfer([mp3(), video(), image()]));
    expect(onDropBgmFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['song.mp3', 'clip.mp4']);
    expect(useUIStore.getState().toastMessage).toContain('1件はBGMに追加しませんでした');
  });

  it('単一 BGM（iOS Safari）は先頭 1 件だけ渡す', () => {
    const onDropBgmFiles = vi.fn();
    render(
      <PlatformCapabilitiesProvider capabilities={{
        ...getPlatformCapabilities(), isIOS: true, isSafari: true, isIosSafari: true,
      }}>
        <BgmSection {...bgmSectionProps({ onDropBgmFiles })} />
      </PlatformCapabilitiesProvider>,
    );
    dropFiles(screen.getByTestId('bgm-section'), [mp3(), new File(['b'], 'second.mp3', { type: 'audio/mpeg' })]);
    expect(onDropBgmFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['song.mp3']);
  });

  it('ロック中は追加しない', () => {
    const onDropBgmFiles = vi.fn();
    render(<BgmSection {...bgmSectionProps({ onDropBgmFiles, isBgmLocked: true })} />);
    dropFiles(screen.getByTestId('bgm-section'), [mp3()]);
    expect(onDropBgmFiles).not.toHaveBeenCalled();
  });
});

describe('ナレーションセクションへのドロップ', () => {
  it('音声ファイルだけを受け付け、動画は受け付けない', () => {
    const onDropNarrationFiles = vi.fn();
    render(<NarrationSection {...narrationSectionProps({ onDropNarrationFiles })} />);
    const header = screen.getByText('ナレーション');
    dragFilesOver(header, [mp3()]);
    expect(screen.getByTestId('narration-section-drop-overlay')).toHaveTextContent('ドロップしてナレーションを追加');
    fireEvent.drop(header, fileTransfer([mp3(), video()]));
    expect(onDropNarrationFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['song.mp3']);
    expect(useUIStore.getState().toastMessage).toContain('1件はナレーションに追加しませんでした');
  });

  it('ロック中は追加しない', () => {
    const onDropNarrationFiles = vi.fn();
    render(<NarrationSection {...narrationSectionProps({ onDropNarrationFiles, isNarrationLocked: true })} />);
    dropFiles(screen.getByTestId('narration-section'), [mp3()]);
    expect(onDropNarrationFiles).not.toHaveBeenCalled();
  });
});

describe('セクション外へのドロップ', () => {
  it('ブラウザがファイルを開いて画面遷移しないよう既定動作を止める', () => {
    const { unmount } = renderHook(() => usePreventWindowFileDrop());
    const makeEvent = (type: string, types: string[]) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { types, dropEffect: 'copy' } });
      return event;
    };

    const fileDragOver = makeEvent('dragover', ['Files']);
    act(() => { window.dispatchEvent(fileDragOver); });
    expect(fileDragOver.defaultPrevented).toBe(true);
    expect((fileDragOver as unknown as { dataTransfer: DataTransfer }).dataTransfer.dropEffect).toBe('none');

    const fileDrop = makeEvent('drop', ['Files']);
    act(() => { window.dispatchEvent(fileDrop); });
    expect(fileDrop.defaultPrevented).toBe(true);

    // ファイル以外（テキスト選択のドラッグなど）は邪魔しない
    const textDrop = makeEvent('drop', ['text/plain']);
    act(() => { window.dispatchEvent(textDrop); });
    expect(textDrop.defaultPrevented).toBe(false);

    unmount();
    const afterUnmount = makeEvent('drop', ['Files']);
    window.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
  });
});
