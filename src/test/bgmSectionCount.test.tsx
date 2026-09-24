import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BgmSection from '../components/sections/BgmSection';
import { PlatformCapabilitiesProvider } from '../app/PlatformCapabilitiesContext';
import { getPlatformCapabilities } from '../utils/platform';
import type { AudioTrack, BgmClip } from '../types';

const createBgmClip = (id: string): BgmClip => ({
  id,
  sourceType: 'file',
  file: new File([''], `${id}.mp3`, { type: 'audio/mpeg' }),
  url: `blob:${id}`,
  startTime: 0,
  volume: 1,
  isMuted: false,
  trimStart: 0,
  trimEnd: 10,
  duration: 10,
  isAiEditable: false,
});

describe('BgmSection count', () => {
  it('単一BGMにも音量見出しと開始位置のリセットを表示する', () => {
    const bgm: AudioTrack = {
      file: new File([''], 'legacy.mp3', { type: 'audio/mpeg' }),
      url: 'blob:legacy',
      startPoint: 4.4,
      delay: 0,
      volume: 1,
      fadeIn: false,
      fadeOut: false,
      fadeInDuration: 0.5,
      fadeOutDuration: 0.5,
      duration: 30,
      isAi: false,
    };
    const onUpdateStartPoint = vi.fn();
    render(
      <PlatformCapabilitiesProvider capabilities={{
        ...getPlatformCapabilities(), isIOS: true, isSafari: true, isIosSafari: true,
      }}>
        <BgmSection
          bgm={bgm}
          bgmClips={[]}
          isBgmLocked={false}
          totalDuration={30}
          currentTime={0}
          onToggleBgmLock={vi.fn()}
          onBgmUpload={vi.fn()}
          onRemoveBgm={vi.fn()}
          onUpdateStartPoint={onUpdateStartPoint}
          onUpdateDelay={vi.fn()}
          onUpdateVolume={vi.fn()}
          onToggleFadeIn={vi.fn()}
          onToggleFadeOut={vi.fn()}
          onUpdateFadeInDuration={vi.fn()}
          onUpdateFadeOutDuration={vi.fn()}
          formatTime={(value) => `${value.toFixed(1)}s`}
          onOpenHelp={vi.fn()}
          onAddBgmClips={vi.fn()}
          onBeforeBgmClipEdit={vi.fn()}
          onBeforeBgmClipContinuousEdit={vi.fn()}
        />
      </PlatformCapabilitiesProvider>,
    );

    fireEvent.click(screen.getByText('BGM'));
    expect(screen.getByText('音量')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'BGMの開始位置を0秒にリセット' }));
    expect(onUpdateStartPoint).toHaveBeenCalledWith('0');
  });

  it('複数BGMの登録数をキャプションと同じ「件」単位で表示する', () => {
    render(
      <BgmSection
        bgm={null}
        bgmClips={[createBgmClip('bgm-1'), createBgmClip('bgm-2')]}
        isBgmLocked={false}
        totalDuration={30}
        currentTime={0}
        onToggleBgmLock={vi.fn()}
        onBgmUpload={vi.fn()}
        onRemoveBgm={vi.fn()}
        onUpdateStartPoint={vi.fn()}
        onUpdateDelay={vi.fn()}
        onUpdateVolume={vi.fn()}
        onToggleFadeIn={vi.fn()}
        onToggleFadeOut={vi.fn()}
        onUpdateFadeInDuration={vi.fn()}
        onUpdateFadeOutDuration={vi.fn()}
        formatTime={(value) => `${value.toFixed(1)}s`}
        onOpenHelp={vi.fn()}
        onAddBgmClips={vi.fn()}
        onBeforeBgmClipEdit={vi.fn()}
        onBeforeBgmClipContinuousEdit={vi.fn()}
      />
    );

    expect(screen.getByText('(2件)')).toBeInTheDocument();
    expect(screen.queryByText('(2曲)')).not.toBeInTheDocument();
  });
});
