import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BgmSection from '../components/sections/BgmSection';
import type { BgmClip } from '../types';

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
      />
    );

    expect(screen.getByText('(2件)')).toBeInTheDocument();
    expect(screen.queryByText('(2曲)')).not.toBeInTheDocument();
  });
});
