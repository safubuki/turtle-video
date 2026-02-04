/**
 * captionStore のテスト
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useCaptionStore } from '../../stores/captionStore';
import type { CaptionSettings } from '../../types';

describe('captionStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useCaptionStore.setState({
      captions: [],
      settings: {
        enabled: true,
        fontSize: 'medium',
        fontStyle: 'gothic',
        fontColor: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 2,
        position: 'bottom',
        bulkFadeIn: false,
        bulkFadeOut: false,
        bulkFadeInDuration: 0.5,
        bulkFadeOutDuration: 0.5,
      },
      isLocked: false,
    });
  });

  describe('settings property', () => {
    it('should have settings property accessible', () => {
      const { settings } = useCaptionStore.getState();
      expect(settings).toBeDefined();
      expect(settings.fontSize).toBe('medium');
      expect(settings.fontColor).toBe('#FFFFFF');
    });

    it('should update settings when setFontSize is called', () => {
      const { setFontSize } = useCaptionStore.getState();
      
      setFontSize('large');
      
      const { settings } = useCaptionStore.getState();
      expect(settings.fontSize).toBe('large');
    });

    it('should update settings when setFontColor is called', () => {
      const { setFontColor } = useCaptionStore.getState();
      
      setFontColor('#FF0000');
      
      const { settings } = useCaptionStore.getState();
      expect(settings.fontColor).toBe('#FF0000');
    });

    it('should update settings when setBulkFadeIn is called', () => {
      const { setBulkFadeIn } = useCaptionStore.getState();
      
      setBulkFadeIn(true);
      
      const { settings } = useCaptionStore.getState();
      expect(settings.bulkFadeIn).toBe(true);
    });
  });

  describe('restoreFromSave', () => {
    it('should restore captions and settings from saved data', () => {
      const savedCaptions = [
        {
          id: 'cap1',
          text: 'Test caption',
          startTime: 0,
          endTime: 5,
          fadeIn: false,
          fadeOut: false,
          fadeInDuration: 0.5,
          fadeOutDuration: 0.5,
        },
      ];

      const savedSettings: CaptionSettings = {
        enabled: false,
        fontSize: 'large',
        fontStyle: 'mincho',
        fontColor: '#00FF00',
        strokeColor: '#FF0000',
        strokeWidth: 4,
        position: 'top',
        bulkFadeIn: true,
        bulkFadeOut: true,
        bulkFadeInDuration: 1.0,
        bulkFadeOutDuration: 2.0,
      };

      const { restoreFromSave } = useCaptionStore.getState();
      
      restoreFromSave(savedCaptions, savedSettings, true);
      
      const { captions, settings, isLocked } = useCaptionStore.getState();
      
      // Verify captions were restored
      expect(captions).toHaveLength(1);
      expect(captions[0].text).toBe('Test caption');
      
      // Verify settings were restored
      expect(settings.enabled).toBe(false);
      expect(settings.fontSize).toBe('large');
      expect(settings.fontStyle).toBe('mincho');
      expect(settings.fontColor).toBe('#00FF00');
      expect(settings.strokeColor).toBe('#FF0000');
      expect(settings.strokeWidth).toBe(4);
      expect(settings.position).toBe('top');
      expect(settings.bulkFadeIn).toBe(true);
      expect(settings.bulkFadeOut).toBe(true);
      expect(settings.bulkFadeInDuration).toBe(1.0);
      expect(settings.bulkFadeOutDuration).toBe(2.0);
      
      // Verify lock state was restored
      expect(isLocked).toBe(true);
    });
  });

  describe('settings consistency', () => {
    it('should maintain settings changes across multiple updates', () => {
      const { setFontSize, setFontColor, setPosition } = useCaptionStore.getState();
      
      // Make multiple changes
      setFontSize('large');
      setFontColor('#FF0000');
      setPosition('top');
      
      // Verify all changes persist
      const { settings } = useCaptionStore.getState();
      expect(settings.fontSize).toBe('large');
      expect(settings.fontColor).toBe('#FF0000');
      expect(settings.position).toBe('top');
    });
  });
});
