/**
 * uiStore のテスト
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useUIStore } from '../../stores/uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset store before each test
    useUIStore.setState({
      toastMessage: '',
      errorMsg: '',
      isPlaying: false,
      currentTime: 0,
      isProcessing: false,
      exportUrl: '',
      exportExt: 'mp4',
      showAiModal: false,
      aiPrompt: '',
      aiScript: '',
      aiVoice: 'Kore',
      isAiLoading: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Toast', () => {
    it('should show toast message', () => {
      const { showToast } = useUIStore.getState();
      
      showToast('Test message');
      
      expect(useUIStore.getState().toastMessage).toBe('Test message');
    });

    it('should auto-clear toast after timeout', () => {
      const { showToast } = useUIStore.getState();
      
      showToast('Test message', 1000);
      
      expect(useUIStore.getState().toastMessage).toBe('Test message');
      
      vi.advanceTimersByTime(1000);
      
      expect(useUIStore.getState().toastMessage).toBe('');
    });

    it('should clear toast manually', () => {
      useUIStore.setState({ toastMessage: 'Test' });
      const { clearToast } = useUIStore.getState();
      
      clearToast();
      
      expect(useUIStore.getState().toastMessage).toBe('');
    });
  });

  describe('Error', () => {
    it('should set error message', () => {
      const { setError } = useUIStore.getState();
      
      setError('Error occurred');
      
      expect(useUIStore.getState().errorMsg).toBe('Error occurred');
    });

    it('should clear error', () => {
      useUIStore.setState({ errorMsg: 'Error' });
      const { clearError } = useUIStore.getState();
      
      clearError();
      
      expect(useUIStore.getState().errorMsg).toBe('');
    });
  });

  describe('Playback', () => {
    it('should set playing state', () => {
      const { play, pause } = useUIStore.getState();
      
      expect(useUIStore.getState().isPlaying).toBe(false);
      
      play();
      expect(useUIStore.getState().isPlaying).toBe(true);
      
      pause();
      expect(useUIStore.getState().isPlaying).toBe(false);
    });

    it('should update current time', () => {
      const { setCurrentTime } = useUIStore.getState();
      
      setCurrentTime(30);
      
      expect(useUIStore.getState().currentTime).toBe(30);
    });
  });

  describe('Export', () => {
    it('should set export url and extension', () => {
      const { setExportUrl, setExportExt } = useUIStore.getState();
      
      setExportUrl('blob:test');
      setExportExt('mp4');
      
      expect(useUIStore.getState().exportUrl).toBe('blob:test');
      expect(useUIStore.getState().exportExt).toBe('mp4');
    });

    it('should clear export', () => {
      useUIStore.setState({ exportUrl: 'blob:test', exportExt: 'mp4' });
      const { clearExport } = useUIStore.getState();
      
      clearExport();
      
      expect(useUIStore.getState().exportUrl).toBeNull();
      // exportExt is not cleared by clearExport
      expect(useUIStore.getState().exportExt).toBe('mp4');
    });
  });

  describe('AI Modal', () => {
    it('should open AI modal', () => {
      const { openAiModal } = useUIStore.getState();
      
      openAiModal();
      
      expect(useUIStore.getState().showAiModal).toBe(true);
    });

    it('should close AI modal', () => {
      useUIStore.setState({
        showAiModal: true,
        aiPrompt: 'test prompt',
        aiScript: 'test script',
      });
      const { closeAiModal } = useUIStore.getState();
      
      closeAiModal();
      
      const state = useUIStore.getState();
      expect(state.showAiModal).toBe(false);
      // closeAiModal doesn't reset prompt/script (resetAiModal does that)
      expect(state.aiPrompt).toBe('test prompt');
      expect(state.aiScript).toBe('test script');
    });

    it('should set AI voice', () => {
      const { setAiVoice } = useUIStore.getState();
      
      setAiVoice('Puck');
      
      expect(useUIStore.getState().aiVoice).toBe('Puck');
    });
  });

  describe('resetUI', () => {
    it('should reset all UI state', () => {
      useUIStore.setState({
        toastMessage: 'Test',
        errorMsg: 'Error',
        isPlaying: true,
        currentTime: 30,
        isProcessing: true,
        exportUrl: 'blob:test',
        exportExt: 'mp4',
        showAiModal: true,
        aiPrompt: 'prompt',
        aiScript: 'script',
        isAiLoading: true,
      });
      
      const { resetUI } = useUIStore.getState();
      resetUI();
      
      const state = useUIStore.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.currentTime).toBe(0);
      expect(state.isProcessing).toBe(false);
      expect(state.exportUrl).toBeNull();
      expect(state.showAiModal).toBe(false);
    });
  });
});
