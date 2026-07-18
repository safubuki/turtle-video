/**
 * audioStore のテスト
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAudioStore } from '../../stores/audioStore';
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
      narrations: [],
      isNarrationLocked: false,
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
      useAudioStore.setState({ bgm: null, bgmClips: [], narrations: [] });
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

      // 既にクリップがある場合は再移行しない
      useAudioStore.setState({ bgm: createMockAudioTrack() });
      useAudioStore.getState().migrateLegacyBgmToClips(40);
      expect(useAudioStore.getState().bgmClips).toHaveLength(1);
    });

    it('restoreFromSave restores bgmClips and clearAllAudio clears them', () => {
      const clip = createMockNarrationClip({ id: 'bgmclip-1', url: 'blob:restored' });
      useAudioStore.getState().restoreFromSave(null, false, [], false, [clip]);
      expect(useAudioStore.getState().bgmClips).toHaveLength(1);

      useAudioStore.getState().clearAllAudio();
      expect(useAudioStore.getState().bgmClips).toHaveLength(0);
    });
  });
});
