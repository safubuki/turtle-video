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

  it('動画尺に合わせて表示区間を自動短縮し、元のトリム値は保持する', () => {
    const { rerender } = render(
      <BgmClipList
        clips={useAudioStore.getState().bgmClips}
        isLocked={false}
        totalDuration={60}
        currentTime={50}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
        onBeforeEdit={vi.fn()}
      />,
    );

    expect(screen.getByText('20.0s 〜 60.0s')).toBeInTheDocument();
    expect(screen.getByText('動画尺に自動調整')).toBeInTheDocument();
    expect(useAudioStore.getState().bgmClips[0].trimEnd).toBe(100);

    rerender(
      <BgmClipList
        clips={useAudioStore.getState().bgmClips}
        isLocked={false}
        totalDuration={130}
        currentTime={50}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
        onBeforeEdit={vi.fn()}
      />,
    );

    expect(screen.getByText('20.0s 〜 130.0s')).toBeInTheDocument();
    expect(screen.getAllByText('末尾まで自動延長').length).toBeGreaterThan(0);
    expect(screen.queryByText('動画尺に自動調整')).not.toBeInTheDocument();
  });

  it('動画尺より後ろのBGMは削除せず自動休止する', () => {
    render(
      <BgmClipList
        clips={useAudioStore.getState().bgmClips}
        isLocked={false}
        totalDuration={10}
        currentTime={5}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
        onBeforeEdit={vi.fn()}
      />,
    );

    expect(screen.getByText('自動休止')).toBeInTheDocument();
    expect(useAudioStore.getState().bgmClips).toHaveLength(1);
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
