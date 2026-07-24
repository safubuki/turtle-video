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
    useAudioStore.setState({
      bgmClips: [{ ...clip }],
      bgmAutoAdjustToTimeline: true,
    });
  });

  it('fits the selected clip settings to the video end from the UI', () => {
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

    // 通常は自動末尾合わせで足りるが、設定値を固定したいとき用
    fireEvent.click(screen.getByRole('button', { name: '設定を末尾に固定' }));

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

  it('shows disabled state when the clip starts after the video end', () => {
    useAudioStore.setState({
      bgmClips: [{
        ...clip,
        startTime: 20,
        trimStart: 0,
        trimEnd: 10,
      }],
    });

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

    expect(screen.getByText('無効')).toBeTruthy();
    expect(screen.getByText(/動画尺の外側のため再生されません/)).toBeTruthy();
    // 設定値自体はストアから消えない
    expect(useAudioStore.getState().bgmClips[0].startTime).toBe(20);
    expect(useAudioStore.getState().bgmClips[0].trimEnd).toBe(10);
  });

  it('shows auto tail-fit message when the last BGM is clamped by video duration', () => {
    useAudioStore.setState({
      bgmClips: [{
        ...clip,
        id: 'bgmclip_only',
        startTime: 0,
        trimStart: 0,
        trimEnd: 15,
      }],
      bgmAutoAdjustToTimeline: true,
    });

    render(
      <BgmClipList
        clips={useAudioStore.getState().bgmClips}
        isLocked={false}
        totalDuration={6}
        currentTime={3}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
        onBeforeEdit={vi.fn()}
      />,
    );

    expect(screen.getByText(/動画末尾まで自動調整中/)).toBeTruthy();
    // 設定 trim は書き換えない
    expect(useAudioStore.getState().bgmClips[0].trimEnd).toBe(15);
  });

  it('toggles auto-adjust off from the UI', () => {
    const onBeforeEdit = vi.fn();
    render(
      <BgmClipList
        clips={useAudioStore.getState().bgmClips}
        isLocked={false}
        totalDuration={60}
        currentTime={10}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
        onBeforeEdit={onBeforeEdit}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: /動画尺に合わせて自動調整/ });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    fireEvent.click(checkbox);
    expect(onBeforeEdit).toHaveBeenCalledWith('toggle-bgm-auto-adjust');
    expect(useAudioStore.getState().bgmAutoAdjustToTimeline).toBe(false);
  });
});
