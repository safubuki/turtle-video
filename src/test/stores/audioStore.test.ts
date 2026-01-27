/**
 * audioStore のテスト
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAudioStore } from '../../stores/audioStore';
import type { AudioTrack } from '../../types';

const createMockAudioTrack = (overrides: Partial<AudioTrack> = {}): AudioTrack => ({
  file: new File([''], 'test.mp3', { type: 'audio/mpeg' }),
  url: 'blob:test',
  startPoint: 0,
  delay: 0,
  volume: 1.0,
  fadeIn: false,
  fadeOut: false,
  duration: 60,
  isAi: false,
  ...overrides,
});

describe('audioStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useAudioStore.setState({
      bgm: null,
      isBgmLocked: false,
      narration: null,
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
      
      updateBgmVolume(2.0); // max is 1.0
      expect(useAudioStore.getState().bgm?.volume).toBe(1.0);
      
      updateBgmVolume(-0.5); // min is 0
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
    it('should set narration', () => {
      const { setNarration } = useAudioStore.getState();
      const track = createMockAudioTrack({ isAi: true });
      
      setNarration(track);
      
      expect(useAudioStore.getState().narration).toBe(track);
      expect(useAudioStore.getState().narration?.isAi).toBe(true);
    });

    it('should update narration delay', () => {
      useAudioStore.setState({ narration: createMockAudioTrack() });
      const { updateNarrationDelay } = useAudioStore.getState();
      
      updateNarrationDelay(5);
      
      expect(useAudioStore.getState().narration?.delay).toBe(5);
    });

    it('should not allow negative delay', () => {
      useAudioStore.setState({ narration: createMockAudioTrack() });
      const { updateNarrationDelay } = useAudioStore.getState();
      
      updateNarrationDelay(-5);
      
      expect(useAudioStore.getState().narration?.delay).toBe(0);
    });
  });

  describe('clearAllAudio', () => {
    it('should clear all audio', () => {
      useAudioStore.setState({
        bgm: createMockAudioTrack(),
        isBgmLocked: true,
        narration: createMockAudioTrack({ isAi: true }),
        isNarrationLocked: true,
      });
      
      const { clearAllAudio } = useAudioStore.getState();
      clearAllAudio();
      
      const state = useAudioStore.getState();
      expect(state.bgm).toBeNull();
      expect(state.isBgmLocked).toBe(false);
      expect(state.narration).toBeNull();
      expect(state.isNarrationLocked).toBe(false);
    });
  });
});
