/**
 * audioStore のテスト
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveAudioClipEndAtTimelineTime,
  resolveAudioClipFitToTimelineEnd,
  resolveAudioClipSourceTimeAtTimelineTime,
  resolveAudioClipTrimAtSourceTime,
  resolveEffectiveAudioClipPlayback,
  resolveBgmClipsEffectivePlayback,
  useAudioStore,
} from '../../stores/audioStore';
import type { AudioTrack, NarrationClip } from '../../types';

const createMockAudioTrack = (overrides: Partial<AudioTrack> = {}): AudioTrack => ({
  file: new File([''], 'test.mp3', { type: 'audio/mpeg' }),
  url: 'blob:test',
  startPoint: 0,
  delay: 0,
  volume: 1.0,
  fadeIn: false,
  fadeOut: false,
  fadeInDuration: 2.0,
  fadeOutDuration: 2.0,
  duration: 60,
  isAi: false,
  ...overrides,
});

const createMockNarrationClip = (
  overrides: Partial<NarrationClip> = {}
): NarrationClip => {
  const duration = overrides.duration ?? 30;
  const trimStart = overrides.trimStart ?? 0;
  const trimEnd = overrides.trimEnd ?? duration;

  const clip: NarrationClip = {
    id: overrides.id ?? 'narration-1',
    sourceType: overrides.sourceType ?? 'file',
    file: overrides.file ?? new File([''], 'narration.mp3', { type: 'audio/mpeg' }),
    url: overrides.url ?? 'blob:narration',
    startTime: overrides.startTime ?? 0,
    volume: overrides.volume ?? 1.0,
    isMuted: overrides.isMuted ?? false,
    duration,
    trimStart,
    trimEnd,
    isAiEditable: overrides.isAiEditable ?? false,
    audioNormalizeGain: overrides.audioNormalizeGain ?? 1,
  };

  if (overrides.blobUrl !== undefined) clip.blobUrl = overrides.blobUrl;
  if (overrides.aiScript !== undefined) clip.aiScript = overrides.aiScript;
  if (overrides.aiVoice !== undefined) clip.aiVoice = overrides.aiVoice;
  if (overrides.aiVoiceStyle !== undefined) clip.aiVoiceStyle = overrides.aiVoiceStyle;

  return clip;
};

describe('audioStore', () => {
  beforeEach(() => {
    useAudioStore.setState({
      bgm: null,
      isBgmLocked: false,
      bgmClips: [],
      narrations: [],
      isNarrationLocked: false,
      bulkBgmMuted: false,
      bulkBgmVolumeEnabled: false,
      bulkNarrationMuted: false,
      bulkNarrationVolumeEnabled: false,
    });
  });

  describe('BGM', () => {
    it('should set BGM', () => {
      const { setBgm } = useAudioStore.getState();
      const track = createMockAudioTrack();

      setBgm(track);

      expect(useAudioStore.getState().bgm).toBe(track);
    });

    it('should update BGM volume', () => {
      useAudioStore.setState({ bgm: createMockAudioTrack() });
      const { updateBgmVolume } = useAudioStore.getState();

      updateBgmVolume(0.5);

      expect(useAudioStore.getState().bgm?.volume).toBe(0.5);
    });

    it('should clamp BGM volume to valid range', () => {
      useAudioStore.setState({ bgm: createMockAudioTrack() });
      const { updateBgmVolume } = useAudioStore.getState();

      updateBgmVolume(3.0);
      expect(useAudioStore.getState().bgm?.volume).toBe(2.5);

      updateBgmVolume(-0.5);
      expect(useAudioStore.getState().bgm?.volume).toBe(0);
    });

    it('should toggle BGM fade in', () => {
      useAudioStore.setState({ bgm: createMockAudioTrack() });
      const { toggleBgmFadeIn } = useAudioStore.getState();

      expect(useAudioStore.getState().bgm?.fadeIn).toBe(false);

      toggleBgmFadeIn(true);
      expect(useAudioStore.getState().bgm?.fadeIn).toBe(true);
    });

    it('should toggle BGM lock', () => {
      const { toggleBgmLock } = useAudioStore.getState();

      expect(useAudioStore.getState().isBgmLocked).toBe(false);

      toggleBgmLock();
      expect(useAudioStore.getState().isBgmLocked).toBe(true);
    });

    it('should remove BGM', () => {
      useAudioStore.setState({ bgm: createMockAudioTrack() });
      const { removeBgm } = useAudioStore.getState();

      removeBgm();

      expect(useAudioStore.getState().bgm).toBeNull();
    });
  });

  describe('Narration', () => {
    it('should add narration clip', () => {
      const { addNarration } = useAudioStore.getState();
      const clip = createMockNarrationClip({ sourceType: 'ai', isAiEditable: true });

      addNarration(clip);

      expect(useAudioStore.getState().narrations).toHaveLength(1);
      expect(useAudioStore.getState().narrations[0]).toEqual(clip);
    });

    it('should update narration start time', () => {
      const clip = createMockNarrationClip();
      useAudioStore.setState({ narrations: [clip] });
      const { updateNarrationStartTime } = useAudioStore.getState();

      updateNarrationStartTime(clip.id, 5);
      expect(useAudioStore.getState().narrations[0].startTime).toBe(5);

      updateNarrationStartTime(clip.id, -3);
      expect(useAudioStore.getState().narrations[0].startTime).toBe(0);
    });

    it('should update narration volume with clamp', () => {
      const clip = createMockNarrationClip();
      useAudioStore.setState({ narrations: [clip] });
      const { updateNarrationVolume } = useAudioStore.getState();

      updateNarrationVolume(clip.id, 1.5);
      expect(useAudioStore.getState().narrations[0].volume).toBe(1.5);

      updateNarrationVolume(clip.id, 3.0);
      expect(useAudioStore.getState().narrations[0].volume).toBe(2.5);
    });

    it('should toggle narration mute', () => {
      const clip = createMockNarrationClip({ isMuted: false });
      useAudioStore.setState({ narrations: [clip] });
      const { toggleNarrationMute } = useAudioStore.getState();

      toggleNarrationMute(clip.id);
      expect(useAudioStore.getState().narrations[0].isMuted).toBe(true);

      toggleNarrationMute(clip.id);
      expect(useAudioStore.getState().narrations[0].isMuted).toBe(false);
    });

    it('should move narration order', () => {
      const clip1 = createMockNarrationClip({ id: 'n1' });
      const clip2 = createMockNarrationClip({ id: 'n2' });
      useAudioStore.setState({ narrations: [clip1, clip2] });
      const { moveNarration } = useAudioStore.getState();

      moveNarration('n2', 'up');

      expect(useAudioStore.getState().narrations.map((n) => n.id)).toEqual(['n2', 'n1']);
    });

    it('should remove narration clip', () => {
      const clip = createMockNarrationClip();
      useAudioStore.setState({ narrations: [clip] });
      const { removeNarration } = useAudioStore.getState();

      removeNarration(clip.id);

      expect(useAudioStore.getState().narrations).toHaveLength(0);
    });

    it('should update narration trim with clamp', () => {
      const clip = createMockNarrationClip({ duration: 10, trimStart: 0, trimEnd: 10 });
      useAudioStore.setState({ narrations: [clip] });
      const { updateNarrationTrim } = useAudioStore.getState();

      updateNarrationTrim(clip.id, 'start', 9.99);
      const afterStart = useAudioStore.getState().narrations[0];
      expect(afterStart.trimStart).toBeCloseTo(9.95, 2);

      updateNarrationTrim(clip.id, 'end', 0);
      const afterEnd = useAudioStore.getState().narrations[0];
      expect(afterEnd.trimEnd).toBeCloseTo(10, 2);
    });

    it('sets the narration timeline end using trimStart and startTime offsets', () => {
      const clip = createMockNarrationClip({
        startTime: 10,
        duration: 30,
        trimStart: 5,
        trimEnd: 30,
      });
      useAudioStore.setState({ narrations: [clip] });

      useAudioStore.getState().setNarrationEndTime(clip.id, 18);

      expect(useAudioStore.getState().narrations[0].trimEnd).toBeCloseTo(13);
    });
  });

  describe('audio clip timeline adjustment', () => {
    it('converts a timeline position into the source position that is actually playing', () => {
      const clip = createMockNarrationClip({
        startTime: 20,
        duration: 100,
        trimStart: 5,
        trimEnd: 25,
      });
      const playback = resolveEffectiveAudioClipPlayback(clip, 60);

      expect(resolveAudioClipSourceTimeAtTimelineTime(playback, 27)).toBe(12);
      expect(resolveAudioClipSourceTimeAtTimelineTime(playback, 19.9)).toBeNull();
      expect(resolveAudioClipSourceTimeAtTimelineTime(playback, 40.1)).toBeNull();
    });

    it('uses the BGM effective extension when resolving the currently playing source position', () => {
      const clip = createMockNarrationClip({
        id: 'bgmclip-tail',
        startTime: 20,
        duration: 100,
        trimStart: 5,
        trimEnd: 15,
      });
      const playback = resolveBgmClipsEffectivePlayback([clip], 60).get(clip.id)!;

      expect(playback.effectiveTrimEnd).toBe(45);
      expect(resolveAudioClipSourceTimeAtTimelineTime(playback, 50)).toBe(35);
    });

    it('sets source trim boundaries without changing timeline placement', () => {
      const clip = createMockNarrationClip({
        startTime: 20,
        duration: 100,
        trimStart: 5,
        trimEnd: 25,
      });

      expect(resolveAudioClipTrimAtSourceTime(clip, 'start', 12)).toEqual({
        trimStart: 12,
        trimEnd: 25,
      });
      expect(resolveAudioClipTrimAtSourceTime(clip, 'end', 18)).toEqual({
        trimStart: 5,
        trimEnd: 18,
      });
      expect(clip.startTime).toBe(20);
    });

    it('converts a timeline end into a source-relative trim end', () => {
      const clip = createMockNarrationClip({
        startTime: 10,
        duration: 30,
        trimStart: 5,
        trimEnd: 25,
      });
      expect(resolveAudioClipEndAtTimelineTime(clip, 18)).toEqual({ trimEnd: 13 });
      expect(resolveAudioClipEndAtTimelineTime(clip, 10)).toBeNull();
    });

    it('trims an overflowing clip without changing its start position', () => {
      const clip = createMockNarrationClip({
        startTime: 20,
        duration: 100,
        trimStart: 5,
        trimEnd: 100,
      });
      expect(resolveAudioClipFitToTimelineEnd(clip, 60)).toEqual({
        startTime: 20,
        trimEnd: 45,
      });
    });

    it('moves a short clip later while preserving its effective duration', () => {
      const clip = createMockNarrationClip({
        startTime: 0,
        duration: 20,
        trimStart: 0,
        trimEnd: 20,
      });
      expect(resolveAudioClipFitToTimelineEnd(clip, 60)).toEqual({
        startTime: 40,
        trimEnd: 20,
      });
    });

    it('fits the last active BGM to video end and disables later clips (D=6)', () => {
      // BGM1: 0-8s, BGM2: 8-15s, video shortened to 6s
      const bgm1 = createMockNarrationClip({
        id: 'bgmclip_1',
        startTime: 0,
        duration: 30,
        trimStart: 0,
        trimEnd: 8,
      });
      const bgm2 = createMockNarrationClip({
        id: 'bgmclip_2',
        startTime: 8,
        duration: 30,
        trimStart: 0,
        trimEnd: 7,
      });

      const map = resolveBgmClipsEffectivePlayback([bgm1, bgm2], 6);
      const e1 = map.get('bgmclip_1')!;
      const e2 = map.get('bgmclip_2')!;

      // 末尾の有効 BGM として自動末尾合わせ（手動操作不要）
      expect(e1.isDisabled).toBe(false);
      expect(e1.isTailFitToTimeline).toBe(true);
      expect(e1.isClampedByTimeline).toBe(true);
      expect(e1.effectiveTimelineEnd).toBe(6);
      expect(e1.configuredTimelineEnd).toBe(8);

      expect(e2.isDisabled).toBe(true);
      expect(e2.configuredTimelineEnd).toBe(15);
      expect(e2.configuredPlayableDuration).toBe(7);
    });

    it('restores middle BGM settings and tail-fits the last active clip (D=12, D=20)', () => {
      const bgm1 = createMockNarrationClip({
        id: 'bgmclip_1',
        startTime: 0,
        duration: 30,
        trimStart: 0,
        trimEnd: 8,
      });
      const bgm2 = createMockNarrationClip({
        id: 'bgmclip_2',
        startTime: 8,
        duration: 30,
        trimStart: 0,
        trimEnd: 7, // configured 8-15
      });

      // D=12: BGM1 は設定 0-8 に復元、BGM2 は 8-12 へ末尾合わせ
      const at12 = resolveBgmClipsEffectivePlayback([bgm1, bgm2], 12);
      expect(at12.get('bgmclip_1')!.effectiveTimelineEnd).toBe(8);
      expect(at12.get('bgmclip_1')!.isClampedByTimeline).toBe(false);
      expect(at12.get('bgmclip_1')!.isTailFitToTimeline).toBe(false);
      expect(at12.get('bgmclip_2')!.isDisabled).toBe(false);
      expect(at12.get('bgmclip_2')!.isTailFitToTimeline).toBe(true);
      expect(at12.get('bgmclip_2')!.effectiveTimelineEnd).toBe(12);
      expect(at12.get('bgmclip_2')!.isClampedByTimeline).toBe(true);

      // D=20: BGM2 は設定 15 を超えて 20 まで自動延長（音源 30s あり）
      const at20 = resolveBgmClipsEffectivePlayback([bgm1, bgm2], 20);
      expect(at20.get('bgmclip_1')!.effectiveTimelineEnd).toBe(8);
      expect(at20.get('bgmclip_2')!.effectiveTimelineEnd).toBe(20);
      expect(at20.get('bgmclip_2')!.isExtendedByTimeline).toBe(true);
      expect(at20.get('bgmclip_2')!.configuredTimelineEnd).toBe(15);

      // 設定値自体は不変（復元の根拠）
      expect(bgm1.trimEnd).toBe(8);
      expect(bgm2.trimEnd).toBe(7);
    });

    it('does not accumulate error when shortening and restoring repeatedly', () => {
      const clips = [
        createMockNarrationClip({
          id: 'bgmclip_a',
          startTime: 0,
          duration: 40,
          trimStart: 0,
          trimEnd: 8,
        }),
        createMockNarrationClip({
          id: 'bgmclip_b',
          startTime: 8,
          duration: 40,
          trimStart: 0,
          trimEnd: 7,
        }),
      ];
      for (let i = 0; i < 20; i++) {
        const short = resolveBgmClipsEffectivePlayback(clips, 6);
        expect(short.get('bgmclip_a')!.effectiveTimelineEnd).toBe(6);
        expect(short.get('bgmclip_a')!.configuredTimelineEnd).toBe(8);
        expect(short.get('bgmclip_b')!.isDisabled).toBe(true);

        const mid = resolveBgmClipsEffectivePlayback(clips, 12);
        expect(mid.get('bgmclip_a')!.effectiveTimelineEnd).toBe(8);
        expect(mid.get('bgmclip_b')!.effectiveTimelineEnd).toBe(12);

        const long = resolveBgmClipsEffectivePlayback(clips, 20);
        expect(long.get('bgmclip_b')!.effectiveTimelineEnd).toBe(20);
        expect(clips[0].trimEnd).toBe(8);
        expect(clips[1].trimEnd).toBe(7);
      }
    });

    it('single-clip resolve still only clamps (no extend) for narrations', () => {
      const narration = createMockNarrationClip({
        startTime: 0,
        duration: 30,
        trimStart: 0,
        trimEnd: 10,
      });
      const result = resolveEffectiveAudioClipPlayback(narration, 20);
      expect(result.effectiveTimelineEnd).toBe(10);
      expect(result.isExtendedByTimeline).toBe(false);
    });

    it('autoAdjust=false keeps configured ends without tail extension', () => {
      const bgm1 = createMockNarrationClip({
        id: 'bgmclip_1',
        startTime: 0,
        duration: 30,
        trimStart: 0,
        trimEnd: 8,
      });
      const bgm2 = createMockNarrationClip({
        id: 'bgmclip_2',
        startTime: 8,
        duration: 30,
        trimStart: 0,
        trimEnd: 7, // configured 8-15
      });

      const offAt20 = resolveBgmClipsEffectivePlayback([bgm1, bgm2], 20, { autoAdjust: false });
      expect(offAt20.get('bgmclip_1')!.effectiveTimelineEnd).toBe(8);
      expect(offAt20.get('bgmclip_2')!.effectiveTimelineEnd).toBe(15);
      expect(offAt20.get('bgmclip_2')!.isExtendedByTimeline).toBe(false);
      expect(offAt20.get('bgmclip_2')!.isTailFitToTimeline).toBe(false);

      // ON なら末尾延長されることと対比
      const onAt20 = resolveBgmClipsEffectivePlayback([bgm1, bgm2], 20, { autoAdjust: true });
      expect(onAt20.get('bgmclip_2')!.effectiveTimelineEnd).toBe(20);
      expect(onAt20.get('bgmclip_2')!.isExtendedByTimeline).toBe(true);
    });

    it('setBgmAutoAdjustToTimeline toggles the store flag (default true)', () => {
      expect(useAudioStore.getState().bgmAutoAdjustToTimeline).toBe(true);
      useAudioStore.getState().setBgmAutoAdjustToTimeline(false);
      expect(useAudioStore.getState().bgmAutoAdjustToTimeline).toBe(false);
      useAudioStore.getState().setBgmAutoAdjustToTimeline(true);
      expect(useAudioStore.getState().bgmAutoAdjustToTimeline).toBe(true);
    });
  });

  describe('clearAllAudio', () => {
    it('should clear all audio', () => {
      useAudioStore.setState({
        bgm: createMockAudioTrack(),
        isBgmLocked: true,
        narrations: [createMockNarrationClip({ id: 'n1' })],
        isNarrationLocked: true,
      });

      const { clearAllAudio } = useAudioStore.getState();
      clearAllAudio();

      const state = useAudioStore.getState();
      expect(state.bgm).toBeNull();
      expect(state.isBgmLocked).toBe(false);
      expect(state.narrations).toHaveLength(0);
      expect(state.isNarrationLocked).toBe(false);
    });
  });

  describe('duplicateNarration', () => {
    it('should append an independent copy placed right after the trimmed end', () => {
      const source = createMockNarrationClip({
        id: 'nar-src',
        startTime: 10,
        duration: 30,
        trimStart: 5,
        trimEnd: 20,
        volume: 1.2,
      });
      useAudioStore.setState({ narrations: [source] });

      useAudioStore.getState().duplicateNarration('nar-src');

      const narrations = useAudioStore.getState().narrations;
      expect(narrations).toHaveLength(2);
      const copy = narrations[1];
      expect(copy.id).not.toBe(source.id);
      expect(copy.url).not.toBe(source.url);
      // トリム後実効長 15 秒ぶん後ろへ連続配置
      expect(copy.startTime).toBeCloseTo(10 + 15);
      expect(copy.trimStart).toBe(5);
      expect(copy.trimEnd).toBe(20);
      expect(copy.volume).toBeCloseTo(1.2);
    });

    it('should skip duplication when file is not a File instance', () => {
      const source = createMockNarrationClip({
        id: 'nar-nofile',
        file: { name: 'ghost.mp3' },
      });
      useAudioStore.setState({ narrations: [source] });

      useAudioStore.getState().duplicateNarration('nar-nofile');

      expect(useAudioStore.getState().narrations).toHaveLength(1);
    });
  });

  describe('bgmClips (multi-BGM)', () => {
    beforeEach(() => {
      useAudioStore.setState({
        bgm: null,
        bgmClips: [],
        narrations: [],
        bulkBgmVolumeEnabled: false,
        bulkBgmVolume: 1,
        bgmAudioNormalizeEnabled: false,
        bgmAudioNormalizeMode: 'mean',
        bulkNarrationVolumeEnabled: false,
        bulkNarrationVolume: 1,
        narrationAudioNormalizeEnabled: false,
        narrationAudioNormalizeMode: 'mean',
      });
    });

    it('auto-fits the first clip to the video length', () => {
      const file = new File([''], 'song1.mp3', { type: 'audio/mpeg' });
      useAudioStore.getState().addBgmClip({ file, url: 'blob:song1', duration: 120 }, 30);

      const clips = useAudioStore.getState().bgmClips;
      expect(clips).toHaveLength(1);
      expect(clips[0].startTime).toBe(0);
      expect(clips[0].trimStart).toBe(0);
      // 動画 30 秒にぴったり収まるようトリム
      expect(clips[0].trimEnd).toBeCloseTo(30);
      expect(clips[0].fadeIn).toBe(false);
    });

    it('places the second clip after the first and fits the remaining time', () => {
      const fileA = new File([''], 'a.mp3', { type: 'audio/mpeg' });
      const fileB = new File([''], 'b.mp3', { type: 'audio/mpeg' });
      useAudioStore.getState().addBgmClip({ file: fileA, url: 'blob:a', duration: 20 }, 60);
      useAudioStore.getState().addBgmClip({ file: fileB, url: 'blob:b', duration: 100 }, 60);

      const clips = useAudioStore.getState().bgmClips;
      expect(clips).toHaveLength(2);
      // 1 本目はソース 20 秒 < 動画 60 秒なのでトリムなし
      expect(clips[0].trimEnd).toBeCloseTo(20);
      // 2 本目は 1 本目の末尾 (20s) から開始し、残り 40 秒に収まる
      expect(clips[1].startTime).toBeCloseTo(20);
      expect(clips[1].trimEnd).toBeCloseTo(40);
    });

    it('fits only the selected BGM clip to the video end', () => {
      const first = createMockNarrationClip({
        id: 'bgmclip-first',
        startTime: 0,
        duration: 20,
        trimEnd: 20,
      });
      const second = createMockNarrationClip({
        id: 'bgmclip-second',
        startTime: 20,
        duration: 100,
        trimEnd: 100,
      });
      useAudioStore.setState({ bgmClips: [first, second] });

      useAudioStore.getState().fitBgmClipToTimelineEnd(second.id, 60);

      const clips = useAudioStore.getState().bgmClips;
      expect(clips[0]).toEqual(first);
      expect(clips[1].startTime).toBe(20);
      expect(clips[1].trimEnd).toBe(40);
    });

    it('sets a BGM trim boundary from a source position without moving its timeline start', () => {
      const source = createMockNarrationClip({
        id: 'bgmclip-source-trim',
        startTime: 20,
        duration: 100,
        trimStart: 5,
        trimEnd: 25,
      });
      useAudioStore.setState({ bgmClips: [source] });

      useAudioStore.getState().setBgmClipTrimAtSourceTime(source.id, 'start', 12);
      let updated = useAudioStore.getState().bgmClips[0];
      expect(updated.startTime).toBe(20);
      expect(updated.trimStart).toBe(12);
      expect(updated.trimEnd).toBe(25);

      useAudioStore.getState().setBgmClipTrimAtSourceTime(source.id, 'end', 18);
      updated = useAudioStore.getState().bgmClips[0];
      expect(updated.startTime).toBe(20);
      expect(updated.trimStart).toBe(12);
      expect(updated.trimEnd).toBe(18);
    });

    it('does not trim when there is no video yet', () => {
      const file = new File([''], 'solo.mp3', { type: 'audio/mpeg' });
      useAudioStore.getState().addBgmClip({ file, url: 'blob:solo', duration: 45 }, 0);

      const clips = useAudioStore.getState().bgmClips;
      expect(clips[0].trimEnd).toBeCloseTo(45);
    });

    it('duplicates a clip right after its trimmed end with an independent url', () => {
      const file = new File([''], 'dup.mp3', { type: 'audio/mpeg' });
      useAudioStore.getState().addBgmClip({ file, url: 'blob:dup', duration: 30 }, 100);
      const original = useAudioStore.getState().bgmClips[0];

      useAudioStore.getState().duplicateBgmClip(original.id);

      const clips = useAudioStore.getState().bgmClips;
      expect(clips).toHaveLength(2);
      expect(clips[1].id).not.toBe(original.id);
      expect(clips[1].url).not.toBe(original.url);
      expect(clips[1].startTime).toBeCloseTo(original.startTime + 30);
    });

    it('migrates the legacy single bgm into a clip once', () => {
      const legacy = createMockAudioTrack({
        startPoint: 5,
        delay: 2,
        volume: 1.5,
        fadeIn: true,
        duration: 90,
      });
      useAudioStore.setState({ bgm: legacy, bgmClips: [] });

      useAudioStore.getState().migrateLegacyBgmToClips(40);

      const state = useAudioStore.getState();
      expect(state.bgm).toBeNull();
      expect(state.bgmClips).toHaveLength(1);
      const clip = state.bgmClips[0];
      expect(clip.startTime).toBe(2);
      expect(clip.trimStart).toBe(5);
      // 残りタイムライン 38 秒ぶん: trimEnd = 5 + 38 = 43
      expect(clip.trimEnd).toBeCloseTo(43);
      expect(clip.volume).toBeCloseTo(1.5);
      expect(clip.fadeIn).toBe(true);

      // 既にクリップがある場合は再移行せず、互換ミラー bgm を破棄する
      // （保存→再読込で 1 曲目が二重再生になる回帰の防止）
      useAudioStore.setState({ bgm: createMockAudioTrack({ url: 'blob:mirror' }) });
      useAudioStore.getState().migrateLegacyBgmToClips(40);
      expect(useAudioStore.getState().bgmClips).toHaveLength(1);
      expect(useAudioStore.getState().bgm).toBeNull();
    });

    it('discards the restored iOS-compat mirror bgm when bgmClips exist', () => {
      const clip = createMockNarrationClip({ id: 'bgmclip-1', url: 'blob:clip-1' });
      useAudioStore.getState().restoreFromSave(
        createMockAudioTrack({ url: 'blob:mirror' }),
        false,
        [],
        false,
        [clip]
      );
      expect(useAudioStore.getState().bgm).not.toBeNull();

      useAudioStore.getState().migrateLegacyBgmToClips(40);

      const state = useAudioStore.getState();
      expect(state.bgm).toBeNull();
      expect(state.bgmClips).toHaveLength(1);
      expect(state.bgmClips[0].id).toBe('bgmclip-1');
    });

    it('restoreFromSave restores bgmClips and clearAllAudio clears them', () => {
      const clip = createMockNarrationClip({ id: 'bgmclip-1', url: 'blob:restored' });
      useAudioStore.getState().restoreFromSave(null, false, [], false, [clip]);
      expect(useAudioStore.getState().bgmClips).toHaveLength(1);

      useAudioStore.getState().clearAllAudio();
      expect(useAudioStore.getState().bgmClips).toHaveLength(0);
    });

    it('一括音量ONで追加したBGMへ音量を継承し、全クリア後も設定を残す', () => {
      useAudioStore.setState({
        bulkBgmVolumeEnabled: true,
        bulkBgmVolume: 0.4,
        bgmClips: [],
      });
      const file = new File([''], 'bulk.mp3', { type: 'audio/mpeg' });
      useAudioStore.getState().addBgmClip({ file, url: 'blob:bulk', duration: 10 }, 20);
      expect(useAudioStore.getState().bgmClips[0].volume).toBeCloseTo(0.4);

      useAudioStore.getState().clearAllAudio();
      expect(useAudioStore.getState().bulkBgmVolumeEnabled).toBe(true);
      expect(useAudioStore.getState().bulkBgmVolume).toBeCloseTo(0.4);
    });

    it('BGMが無くても一括ミュートを先にONにでき、追加曲はミュートされる', () => {
      useAudioStore.setState({ bgmClips: [], bulkBgmMuted: false });
      useAudioStore.getState().setAllBgmClipsMuted(true);
      expect(useAudioStore.getState().bulkBgmMuted).toBe(true);

      useAudioStore.getState().addBgmClip({
        file: new File([''], 'preset-mute.mp3', { type: 'audio/mpeg' }),
        url: 'blob:preset-mute',
        duration: 8,
      }, 20);
      expect(useAudioStore.getState().bgmClips[0].isMuted).toBe(true);
      expect(useAudioStore.getState().bulkBgmMuted).toBe(true);
    });

    it('BGMを一括ミュートすると追加曲もミュートする', () => {
      const file = new File([''], 'mute.mp3', { type: 'audio/mpeg' });
      useAudioStore.getState().addBgmClip({ file, url: 'blob:mute-1', duration: 10 }, 20);
      useAudioStore.getState().setAllBgmClipsMuted(true);
      expect(useAudioStore.getState().bgmClips[0].isMuted).toBe(true);

      useAudioStore.getState().addBgmClip({
        file: new File([''], 'mute-2.mp3', { type: 'audio/mpeg' }),
        url: 'blob:mute-2',
        duration: 8,
      }, 20);
      expect(useAudioStore.getState().bgmClips.every((clip) => clip.isMuted)).toBe(true);
    });

    it('個別ミュート操作で一括ミュートフラグを解除する', () => {
      useAudioStore.getState().addBgmClip({
        file: new File([''], 'toggle.mp3', { type: 'audio/mpeg' }),
        url: 'blob:toggle',
        duration: 8,
      }, 20);
      useAudioStore.getState().setAllBgmClipsMuted(true);
      const id = useAudioStore.getState().bgmClips[0].id;
      useAudioStore.getState().toggleBgmClipMute(id);
      expect(useAudioStore.getState().bulkBgmMuted).toBe(false);
      expect(useAudioStore.getState().bgmClips[0].isMuted).toBe(false);
    });

    it('全クリア後も一括ミュートフラグを残す', () => {
      useAudioStore.setState({ bulkBgmMuted: true, bulkNarrationMuted: true });
      useAudioStore.getState().clearAllAudio();
      expect(useAudioStore.getState().bgmClips).toHaveLength(0);
      expect(useAudioStore.getState().narrations).toHaveLength(0);
      expect(useAudioStore.getState().bulkBgmMuted).toBe(true);
      expect(useAudioStore.getState().bulkNarrationMuted).toBe(true);
    });
  });

  describe('narration bulk audio settings', () => {
    it('一括音量ONで追加したナレーションへ音量を継承する', () => {
      useAudioStore.setState({
        bulkNarrationVolumeEnabled: true,
        bulkNarrationVolume: 0.3,
        narrations: [],
      });
      useAudioStore.getState().addNarration(createMockNarrationClip({ id: 'n-bulk', volume: 1 }));
      expect(useAudioStore.getState().narrations[0].volume).toBeCloseTo(0.3);
    });

    it('ナレーションが無くても一括ミュートを先にONにでき、追加クリップはミュートされる', () => {
      useAudioStore.setState({ narrations: [], bulkNarrationMuted: false });
      useAudioStore.getState().setAllNarrationsMuted(true);
      expect(useAudioStore.getState().bulkNarrationMuted).toBe(true);

      useAudioStore.getState().addNarration(createMockNarrationClip({
        id: 'n-preset-mute',
        isMuted: false,
      }));
      expect(useAudioStore.getState().narrations[0].isMuted).toBe(true);
      expect(useAudioStore.getState().bulkNarrationMuted).toBe(true);
    });

    it('restoreFromSave は一括音設定を復元する', () => {
      useAudioStore.getState().restoreFromSave(
        null,
        false,
        [],
        false,
        [],
        true,
        {
          bulkBgmMuted: true,
          bulkBgmVolumeEnabled: true,
          bulkBgmVolume: 0.55,
          bgmAudioNormalizeEnabled: true,
          bgmAudioNormalizeMode: 'loudest',
          bulkNarrationMuted: true,
          bulkNarrationVolumeEnabled: true,
          bulkNarrationVolume: 1.2,
          narrationAudioNormalizeEnabled: true,
          narrationAudioNormalizeMode: 'mean',
        },
      );
      const state = useAudioStore.getState();
      expect(state.bulkBgmMuted).toBe(true);
      expect(state.bulkBgmVolumeEnabled).toBe(true);
      expect(state.bulkBgmVolume).toBeCloseTo(0.55);
      expect(state.bgmAudioNormalizeEnabled).toBe(true);
      expect(state.bgmAudioNormalizeMode).toBe('loudest');
      expect(state.bulkNarrationMuted).toBe(true);
      expect(state.bulkNarrationVolumeEnabled).toBe(true);
      expect(state.bulkNarrationVolume).toBeCloseTo(1.2);
      expect(state.narrationAudioNormalizeEnabled).toBe(true);
      expect(state.narrationAudioNormalizeMode).toBe('mean');
    });

    it('restoreFromSave は未保存の一括ミュートを既存クリップの全ミュートから補完する', () => {
      useAudioStore.getState().restoreFromSave(
        null,
        false,
        [createMockNarrationClip({ id: 'n-muted', isMuted: true })],
        false,
        [{
          ...createMockNarrationClip({ id: 'b-muted', isMuted: true }),
        } as any],
        false,
      );
      expect(useAudioStore.getState().bulkBgmMuted).toBe(true);
      expect(useAudioStore.getState().bulkNarrationMuted).toBe(true);

      useAudioStore.getState().restoreFromSave(null, false, [], false, [], false);
      expect(useAudioStore.getState().bulkBgmMuted).toBe(false);
      expect(useAudioStore.getState().bulkNarrationMuted).toBe(false);
    });
  });
});
