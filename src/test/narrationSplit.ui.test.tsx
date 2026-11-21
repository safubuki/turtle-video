import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NarrationSection from '../components/sections/NarrationSection';
import { PlatformCapabilitiesProvider } from '../app/PlatformCapabilitiesContext';
import { useAudioStore } from '../stores/audioStore';
import type { NarrationClip } from '../types';
import type { PlatformCapabilities } from '../utils/platform';

const STANDARD_CAPS: PlatformCapabilities = {
  userAgent: 'Mozilla/5.0 Chrome/130.0',
  platform: 'Win32',
  maxTouchPoints: 0,
  isAndroid: false,
  isIOS: false,
  isSafari: false,
  isIosSafari: false,
  supportsShowSaveFilePicker: false,
  supportsShowOpenFilePicker: false,
  supportsTrackProcessor: true,
  supportsMp4MediaRecorder: true,
  audioContextMayInterrupt: false,
  supportedMediaRecorderProfile: { mimeType: 'video/mp4', extension: 'mp4' },
};

const IOS_CAPS: PlatformCapabilities = {
  ...STANDARD_CAPS,
  isIOS: true,
  isSafari: true,
  isIosSafari: true,
};

function createNarrationClip(overrides: Partial<NarrationClip> = {}): NarrationClip {
  const duration = overrides.duration ?? 12;
  const trimStart = overrides.trimStart ?? 0;
  const trimEnd = overrides.trimEnd ?? duration;
  return {
    id: overrides.id ?? 'narration-1',
    sourceType: overrides.sourceType ?? 'file',
    file: overrides.file ?? new File(['audio'], 'narration.wav', { type: 'audio/wav' }),
    url: overrides.url ?? 'blob:narration-1',
    startTime: overrides.startTime ?? 2,
    volume: overrides.volume ?? 1,
    isMuted: overrides.isMuted ?? false,
    trimStart,
    trimEnd,
    duration,
    isAiEditable: overrides.isAiEditable ?? false,
    blobUrl: overrides.blobUrl,
  };
}

function buildProps(overrides: Partial<React.ComponentProps<typeof NarrationSection>> = {}) {
  return {
    narrations: [createNarrationClip()],
    offlineMode: false,
    isNarrationLocked: false,
    isCaptionLocked: false,
    totalDuration: 30,
    currentTime: 5,
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
    onSplitNarration: vi.fn(),
    onUpdateVolume: vi.fn(),
    onToggleMute: vi.fn(),
    onUpdateTrimStart: vi.fn(),
    onUpdateTrimEnd: vi.fn(),
    formatTime: (value: number) => `${value.toFixed(2)}s`,
    onOpenHelp: vi.fn(),
    ...overrides,
  };
}

describe('NarrationSection 現在位置で分割', () => {
  beforeEach(() => {
    useAudioStore.setState({ narrations: [], isNarrationLocked: false });
  });

  it('再生区間内では有効になり、クリックで onSplitNarration を呼び出す', () => {
    const onSplitNarration = vi.fn();
    render(
      <PlatformCapabilitiesProvider capabilities={STANDARD_CAPS}>
        <NarrationSection {...buildProps({ currentTime: 5.5, onSplitNarration })} />
      </PlatformCapabilitiesProvider>,
    );
    fireEvent.click(screen.getByText('ナレーション'));

    const splitBtn = screen.getByRole('button', { name: '現在位置で分割' });
    expect(splitBtn).toBeEnabled();
    fireEvent.click(splitBtn);
    expect(onSplitNarration).toHaveBeenCalledWith('narration-1');
  });

  it('再生区間外・ロック中・File実体なしでは無効になる', () => {
    const { rerender } = render(
      <PlatformCapabilitiesProvider capabilities={STANDARD_CAPS}>
        <NarrationSection {...buildProps({ currentTime: 1.5 })} />
      </PlatformCapabilitiesProvider>,
    );
    fireEvent.click(screen.getByText('ナレーション'));
    expect(screen.getByRole('button', { name: '現在位置で分割' })).toBeDisabled();

    rerender(
      <PlatformCapabilitiesProvider capabilities={STANDARD_CAPS}>
        <NarrationSection {...buildProps({ currentTime: 5, isNarrationLocked: true })} />
      </PlatformCapabilitiesProvider>,
    );
    expect(screen.getByRole('button', { name: '現在位置で分割' })).toBeDisabled();

    rerender(
      <PlatformCapabilitiesProvider capabilities={STANDARD_CAPS}>
        <NarrationSection
          {...buildProps({
            currentTime: 5,
            narrations: [createNarrationClip({ file: { name: 'legacy.wav' } })],
          })}
        />
      </PlatformCapabilitiesProvider>,
    );
    expect(screen.getByRole('button', { name: '現在位置で分割' })).toBeDisabled();
  });

  it('apple-safari（iOS Safari）では分割ボタンを表示しない', () => {
    render(
      <PlatformCapabilitiesProvider capabilities={IOS_CAPS}>
        <NarrationSection {...buildProps({ currentTime: 5 })} />
      </PlatformCapabilitiesProvider>,
    );
    fireEvent.click(screen.getByText('ナレーション'));

    expect(screen.queryByRole('button', { name: '現在位置で分割' })).not.toBeInTheDocument();
  });

  it('audioStore と連動して前半・後半の2クリップに分かれ、後半の開始位置を独立調整できる', () => {
    const initial = createNarrationClip({
      id: 'nar-live',
      startTime: 2,
      duration: 10,
      trimStart: 1,
      trimEnd: 8,
    });
    useAudioStore.setState({ narrations: [initial], isNarrationLocked: false });

    const { rerender } = render(
      <PlatformCapabilitiesProvider capabilities={STANDARD_CAPS}>
        <NarrationSection
          {...buildProps({
            narrations: useAudioStore.getState().narrations,
            currentTime: 5.25,
            onSplitNarration: (id) => useAudioStore.getState().splitNarration(id, 5.25),
          })}
        />
      </PlatformCapabilitiesProvider>,
    );
    fireEvent.click(screen.getByText('ナレーション'));
    fireEvent.click(screen.getByRole('button', { name: '現在位置で分割' }));

    const splitClips = useAudioStore.getState().narrations;
    expect(splitClips).toHaveLength(2);
    expect(splitClips[0].trimEnd).toBeCloseTo(4.25, 6);
    expect(splitClips[1].startTime).toBeCloseTo(5.25, 6);
    expect(splitClips[1].trimStart).toBeCloseTo(4.25, 6);
    expect(splitClips[1].trimEnd).toBeCloseTo(8, 6);

    // 後半だけ 1 秒後ろへずらしても前半には影響しない
    useAudioStore.getState().updateNarrationStartTime(splitClips[1].id, 6.25);
    const shifted = useAudioStore.getState().narrations;
    expect(shifted[0].startTime).toBeCloseTo(2, 6);
    expect(shifted[1].startTime).toBeCloseTo(6.25, 6);

    rerender(
      <PlatformCapabilitiesProvider capabilities={STANDARD_CAPS}>
        <NarrationSection
          {...buildProps({
            narrations: shifted,
            currentTime: 5.25,
          })}
        />
      </PlatformCapabilitiesProvider>,
    );
    expect(screen.getByText('(2件)')).toBeInTheDocument();
  });
});
