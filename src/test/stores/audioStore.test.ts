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
): NarrationClip => ({
  id: 'narration-1',
  sourceType: 'file',
  file: new File([''], 'narration.mp3', { type: 'audio/mpeg' }),
  url: 'blob:narration',
  startTime: 0,
  volume: 1.0,
  duration: 30,
  isAiEditable: false,
  ...overrides,
});

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

      updateBgmVolume(2.0);
      expect(useAudioStore.getState().bgm?.volume).toBe(2.0);

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
      expect(useAudioStore.getState().narrations[0].volume).toBe(2.0);
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
});
