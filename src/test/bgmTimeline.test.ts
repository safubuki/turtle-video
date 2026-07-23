import { describe, expect, it } from 'vitest';
import type { BgmClip } from '../types';
import { resolveEffectiveBgmTimeline } from '../utils/bgmTimeline';

const createClip = (id: string, startTime: number, trimEnd: number): BgmClip => ({
  id,
  sourceType: 'file',
  file: new File(['audio'], `${id}.mp3`, { type: 'audio/mpeg' }),
  url: `blob:${id}`,
  startTime,
  volume: 1,
  isMuted: false,
  trimStart: 0,
  trimEnd,
  duration: trimEnd,
  isAiEditable: false,
  fadeOut: true,
  fadeOutDuration: 1,
});

describe('resolveEffectiveBgmTimeline', () => {
  const clips = [createClip('bgm-1', 0, 8), createClip('bgm-2', 8, 7)];

  it('動画を6秒へ短縮しても元設定を変更せず、先頭だけを0〜6秒にする', () => {
    const result = resolveEffectiveBgmTimeline(clips, 6);

    expect(result.playbackClips).toHaveLength(1);
    expect(result.playbackClips[0].id).toBe('bgm-1');
    expect(result.playbackClips[0].trimEnd).toBe(6);
    expect(result.states[0].isTrimmedByTimeline).toBe(true);
    expect(result.states[1].isInactive).toBe(true);
    expect(clips[0].trimEnd).toBe(8);
    expect(clips[1].trimEnd).toBe(7);
  });

  it('動画を12秒へ戻すと先頭を0〜8秒、後続を8〜12秒で自動復帰する', () => {
    const result = resolveEffectiveBgmTimeline(clips, 12);

    expect(result.playbackClips).toHaveLength(2);
    expect(result.playbackClips[0].trimEnd).toBe(8);
    expect(result.playbackClips[1].startTime).toBe(8);
    expect(result.playbackClips[1].trimEnd).toBe(4);
    expect(result.states[1].effectiveEnd).toBe(12);
    expect(result.states[1].isTrimmedByTimeline).toBe(true);
  });

  it('動画を15秒へ戻すと両方の元区間を復元する', () => {
    const result = resolveEffectiveBgmTimeline(clips, 15);

    expect(result.playbackClips).toHaveLength(2);
    expect(result.playbackClips[0].trimEnd).toBe(8);
    expect(result.playbackClips[1].trimEnd).toBe(7);
    expect(result.states.every((state) => !state.isTrimmedByTimeline)).toBe(true);
  });

  it('動画を20秒へ延長すると最後のBGMだけを末尾まで繰り返す', () => {
    const result = resolveEffectiveBgmTimeline(clips, 20);

    expect(result.playbackClips.map((clip) => [clip.startTime, clip.trimEnd])).toEqual([
      [0, 8],
      [8, 7],
      [15, 5],
    ]);
    expect(result.states[1].effectiveEnd).toBe(20);
    expect(result.states[1].isAutoExtended).toBe(true);
    expect(result.playbackClips[1].fadeOut).toBe(false);
    expect(result.playbackClips[2].fadeOut).toBe(true);
  });

  it('最後のBGMで自動延長をOFFにすると元区間の後ろを補完しない', () => {
    const disabled = clips.map((clip, index) => (
      index === 1 ? { ...clip, autoExtendToTimelineEnd: false } : clip
    ));
    const result = resolveEffectiveBgmTimeline(disabled, 20);

    expect(result.playbackClips).toHaveLength(2);
    expect(result.states[1].effectiveEnd).toBe(15);
    expect(result.states[1].isAutoExtended).toBe(false);
  });

  it('追加時の自動トリムは先に元音源の続きを使い、その後に繰り返す', () => {
    const autoTrimmed = {
      ...createClip('auto', 0, 15),
      duration: 30,
      wasAutoTrimmedOnAdd: true,
    };
    const result = resolveEffectiveBgmTimeline([autoTrimmed], 40);

    expect(result.playbackClips.map((clip) => [clip.startTime, clip.trimStart, clip.trimEnd])).toEqual([
      [0, 0, 30],
      [30, 0, 10],
    ]);
  });

  it('動画がない場合はすべて休止し、保存値は維持する', () => {
    const result = resolveEffectiveBgmTimeline(clips, 0);

    expect(result.playbackClips).toEqual([]);
    expect(result.states.every((state) => state.isInactive)).toBe(true);
    expect(clips.map((clip) => clip.startTime)).toEqual([0, 8]);
  });
});
