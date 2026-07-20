import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BgmClipList from '../components/sections/BgmClipList';
import { useAudioStore } from '../stores/audioStore';
import type { BgmClip } from '../types';

const clip: BgmClip = {
  id: 'bgmclip-1',
  sourceType: 'file',
  file: new File([''], 'song.mp3', { type: 'audio/mpeg' }),
  url: 'blob:song',
  startTime: 20,
  volume: 1,
  isMuted: false,
  duration: 100,
  trimStart: 0,
  trimEnd: 100,
  isAiEditable: false,
};

describe('BgmClipList timeline adjustment', () => {
  beforeEach(() => {
    useAudioStore.setState({ bgmClips: [{ ...clip }] });
  });

  it('fits the selected clip to the video end from the UI', () => {
    const onBeforeEdit = vi.fn();
    render(
      <BgmClipList
        clips={useAudioStore.getState().bgmClips}
        isLocked={false}
        totalDuration={60}
        currentTime={50}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
        onBeforeEdit={onBeforeEdit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '動画末尾に合わせる' }));

    expect(onBeforeEdit).toHaveBeenCalledWith('fit-bgm-clip-to-timeline-end');
    expect(useAudioStore.getState().bgmClips[0].trimEnd).toBe(40);
  });

  it('sets the playback end to the current preview position', () => {
    render(
      <BgmClipList
        clips={useAudioStore.getState().bgmClips}
        isLocked={false}
        totalDuration={60}
        currentTime={50}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
        onBeforeEdit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '終了' }));

    expect(useAudioStore.getState().bgmClips[0].trimEnd).toBe(30);
  });
});
