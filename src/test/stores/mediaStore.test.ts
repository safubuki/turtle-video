/**
 * mediaStore のテスト
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useMediaStore } from '../../stores/mediaStore';

describe('mediaStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useMediaStore.setState({
      mediaItems: [],
      totalDuration: 0,
      isClipsLocked: false,
    });
  });

  describe('addMediaItems', () => {
    it('should add media items from files', () => {
      const { addMediaItems } = useMediaStore.getState();
      const file = new File([''], 'test.mp4', { type: 'video/mp4' });
      
      addMediaItems([file]);
      
      const { mediaItems } = useMediaStore.getState();
      expect(mediaItems).toHaveLength(1);
      expect(mediaItems[0].file).toBe(file);
      expect(mediaItems[0].type).toBe('video');
    });

    it('should add image files with default duration', () => {
      const { addMediaItems } = useMediaStore.getState();
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      
      addMediaItems([file]);
      
      const { mediaItems } = useMediaStore.getState();
      expect(mediaItems[0].type).toBe('image');
      expect(mediaItems[0].duration).toBe(5); // default image duration
    });
  });

  describe('removeMediaItem', () => {
    it('should remove an item by id', () => {
      const { addMediaItems, removeMediaItem } = useMediaStore.getState();
      const file = new File([''], 'test.mp4', { type: 'video/mp4' });
      
      addMediaItems([file]);
      const { mediaItems: before } = useMediaStore.getState();
      const id = before[0].id;
      
      removeMediaItem(id);
      
      const { mediaItems: after } = useMediaStore.getState();
      expect(after).toHaveLength(0);
    });
  });

  describe('moveMediaItem', () => {
    it('should move item up', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'a', duration: 10 } as any,
          { id: 'b', duration: 10 } as any,
        ],
        totalDuration: 20,
      });
      
      const { moveMediaItem } = useMediaStore.getState();
      moveMediaItem(1, 'up');
      
      const { mediaItems } = useMediaStore.getState();
      expect(mediaItems[0].id).toBe('b');
      expect(mediaItems[1].id).toBe('a');
    });

    it('should move item down', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'a', duration: 10 } as any,
          { id: 'b', duration: 10 } as any,
        ],
        totalDuration: 20,
      });
      
      const { moveMediaItem } = useMediaStore.getState();
      moveMediaItem(0, 'down');
      
      const { mediaItems } = useMediaStore.getState();
      expect(mediaItems[0].id).toBe('b');
      expect(mediaItems[1].id).toBe('a');
    });

    it('should not move if at boundary', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'a', duration: 10 } as any,
          { id: 'b', duration: 10 } as any,
        ],
        totalDuration: 20,
      });
      
      const { moveMediaItem } = useMediaStore.getState();
      moveMediaItem(0, 'up'); // Can't move first item up
      
      const { mediaItems } = useMediaStore.getState();
      expect(mediaItems[0].id).toBe('a');
    });
  });

  describe('toggleClipsLock', () => {
    it('should toggle clips lock state', () => {
      const { toggleClipsLock } = useMediaStore.getState();
      
      expect(useMediaStore.getState().isClipsLocked).toBe(false);
      
      toggleClipsLock();
      expect(useMediaStore.getState().isClipsLocked).toBe(true);
      
      toggleClipsLock();
      expect(useMediaStore.getState().isClipsLocked).toBe(false);
    });
  });

  describe('clearAllMedia', () => {
    it('should clear all media items', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'a', duration: 10, url: 'blob:test' } as any,
        ],
        totalDuration: 10,
        isClipsLocked: true,
      });
      
      const { clearAllMedia } = useMediaStore.getState();
      clearAllMedia();
      
      const state = useMediaStore.getState();
      expect(state.mediaItems).toHaveLength(0);
      expect(state.totalDuration).toBe(0);
      expect(state.isClipsLocked).toBe(false);
    });
  });

  describe('updateScale', () => {
    it('should update scale within valid range', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'a', scale: 1.0 } as any,
        ],
      });
      
      const { updateScale } = useMediaStore.getState();
      updateScale('a', 2.0);
      
      const { mediaItems } = useMediaStore.getState();
      expect(mediaItems[0].scale).toBe(2.0);
    });

    it('should clamp scale to valid range', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'a', scale: 1.0 } as any,
        ],
      });
      
      const { updateScale } = useMediaStore.getState();
      updateScale('a', 5.0); // max is 3.0
      
      const { mediaItems } = useMediaStore.getState();
      expect(mediaItems[0].scale).toBe(3.0);
    });
  });
});
