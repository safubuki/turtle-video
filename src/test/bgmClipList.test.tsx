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

  it('一括音設定パネルをリスト先頭へ置く', () => {
    render(
      <BgmClipList
        audioSettingsPanel={<div>一括音設定パネル</div>}
        clips={useAudioStore.getState().bgmClips}
        isLocked={false}
        totalDuration={60}
        currentTime={10}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
        onBeforeEdit={vi.fn()}
        onBeforeContinuousEdit={vi.fn()}
      />,
    );
    const panel = screen.getByText('一括音設定パネル');
    const title = screen.getByTitle('song.mp3');
    expect(
      panel.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('長いファイル名でもタイトル行を伸縮させて省略する', () => {
    useAudioStore.setState({
      bgmClips: [{
        ...clip,
        file: new File([''], 'Rapid Express_FUGITIVE_ - Analog Jazz Chase Mix Super Long Title.mp3', { type: 'audio/mpeg' }),
      }],
    });
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
    const title = screen.getByTitle('Rapid Express_FUGITIVE_ - Analog Jazz Chase Mix Super Long Title.mp3');
    expect(title).toHaveClass('truncate');
    expect(title).toHaveClass('min-w-0');
    expect(title).toHaveClass('flex-1');
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
        onBeforeContinuousEdit={vi.fn()}
      />,
    );

    // 通常は自動末尾合わせで足りるが、設定値を固定したいとき用
    fireEvent.click(screen.getByRole('button', { name: '設定を末尾に固定' }));

    expect(onBeforeEdit).toHaveBeenCalledWith('fit-bgm-clip-to-timeline-end');
    expect(useAudioStore.getState().bgmClips[0].trimEnd).toBe(40);
  });

  it('現在流れている音源位置をトリミング開始に設定し、配置開始は動かさない', () => {
    const onBeforeEdit = vi.fn();
    render(
      <BgmClipList
        clips={useAudioStore.getState().bgmClips}
        isLocked={false}
        totalDuration={60}
        currentTime={50}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
        onBeforeEdit={onBeforeEdit}
        onBeforeContinuousEdit={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: '現在のBGM位置をトリミング開始に設定' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'トリミング設定' }));
    expect(screen.getByText('現在は音源内 30.0s を再生しています。')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: '現在のBGM位置をトリミング開始に設定' }),
    );

    const updated = useAudioStore.getState().bgmClips[0];
    expect(onBeforeEdit).toHaveBeenCalledWith('set-bgm-clip-trim-start-current');
    expect(updated.startTime).toBe(20);
    expect(updated.trimStart).toBe(30);
  });

  it('現在流れている音源位置をトリミング終了に設定する', () => {
    render(
      <BgmClipList
        clips={useAudioStore.getState().bgmClips}
        isLocked={false}
        totalDuration={60}
        currentTime={50}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
        onBeforeEdit={vi.fn()}
        onBeforeContinuousEdit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'トリミング設定' }));
    fireEvent.click(
      screen.getByRole('button', { name: '現在のBGM位置をトリミング終了に設定' }),
    );

    expect(useAudioStore.getState().bgmClips[0].trimEnd).toBe(30);
  });

  it('対象のBGMが現在流れていないときはトリム反映を無効にする', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'トリミング設定' }));
    expect(screen.getByText(/このBGMが流れている位置へプレビューを移動/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '現在のBGM位置をトリミング開始に設定' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: '現在のBGM位置をトリミング終了に設定' }),
    ).toBeDisabled();
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
        onBeforeContinuousEdit={vi.fn()}
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
        onBeforeContinuousEdit={vi.fn()}
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
        onBeforeContinuousEdit={vi.fn()}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: /動画尺に合わせて自動調整/ });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    fireEvent.click(checkbox);
    expect(onBeforeEdit).toHaveBeenCalledWith('toggle-bgm-auto-adjust');
    expect(useAudioStore.getState().bgmAutoAdjustToTimeline).toBe(false);
  });
});

/**
 * 連続値スライダーは再生を止めない。
 *
 * BGM クリップの音量スライダーはドラッグ中に毎目盛 onChange が発火するため、
 * 一時停止フック（onBeforeEdit = pausePreviewBeforeEdit）を呼ぶとプレビューが止まる。
 * 一時停止しない onBeforeContinuousEdit 側へ流れることを固定する。
 */
describe('BgmClipList continuous sliders keep the preview playing', () => {
  beforeEach(() => {
    useAudioStore.setState({
      bgmClips: [{ ...clip }],
      bgmAutoAdjustToTimeline: true,
    });
  });

  const renderList = () => {
    const onBeforeEdit = vi.fn();
    const onBeforeContinuousEdit = vi.fn();
    render(
      <BgmClipList
        clips={useAudioStore.getState().bgmClips}
        isLocked={false}
        totalDuration={60}
        currentTime={10}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
        onBeforeEdit={onBeforeEdit}
        onBeforeContinuousEdit={onBeforeContinuousEdit}
      />,
    );
    return { onBeforeEdit, onBeforeContinuousEdit };
  };

  it('does not pause the preview while dragging the volume slider', () => {
    const { onBeforeEdit, onBeforeContinuousEdit } = renderList();

    // 音量スライダー（0〜2.5 / step 0.05）を特定してドラッグを再現する
    const volumeSlider = screen
      .getAllByRole('slider')
      .find((el) => (el as HTMLInputElement).max === '2.5') as HTMLInputElement;
    expect(volumeSlider).toBeTruthy();

    // 100% を跨ぐアグレッシブな変更を再現（clip.volume の初期値 1 とは異なる値を並べる）
    const dragValues = ['1.95', '0.6', '2.5'];
    for (const value of dragValues) {
      fireEvent.change(volumeSlider, { target: { value } });
    }

    // 一時停止フックは一度も呼ばれない（= プレビューが止まらない）
    expect(onBeforeEdit).not.toHaveBeenCalled();
    // 連続編集フックがドラッグの各目盛で呼ばれる
    expect(onBeforeContinuousEdit).toHaveBeenCalledTimes(dragValues.length);
    expect(onBeforeContinuousEdit).toHaveBeenCalledWith('update-bgm-clip-volume');
    expect(useAudioStore.getState().bgmClips[0].volume).toBe(2.5);
  });

  it('still pauses the preview for one-shot buttons (mute / reorder)', () => {
    const { onBeforeEdit, onBeforeContinuousEdit } = renderList();

    fireEvent.click(screen.getByTitle('ミュート'));

    expect(onBeforeEdit).toHaveBeenCalledWith('toggle-bgm-clip-mute');
    expect(onBeforeContinuousEdit).not.toHaveBeenCalled();
  });
});
