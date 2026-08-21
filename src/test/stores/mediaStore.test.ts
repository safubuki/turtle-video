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
      projectPosterMode: 'auto',
      projectPosterTimelineTime: 0.2,
      projectPosterDataUrl: null,
      projectPosterAspectRatio: 'landscape',
      bulkVideoMuted: false,
      bulkVideoVolumeEnabled: false,
      bulkVideoVolume: 1,
      videoAudioNormalizeEnabled: false,
      videoAudioNormalizeMode: 'mean',
    });
  });

  describe('addMediaItems', () => {
    it('should add media items from files', async () => {
      const { addMediaItems } = useMediaStore.getState();
      const file = new File(['test content'], 'test.mp4', { type: 'video/mp4', lastModified: 123456789 });
      
      await addMediaItems([file]);
      
      const { mediaItems } = useMediaStore.getState();
      const originalData = await new Response(file).arrayBuffer();
      expect(mediaItems).toHaveLength(1);
      expect(mediaItems[0].file).not.toBe(file);
      expect(mediaItems[0].file.name).toBe(file.name);
      expect(mediaItems[0].file.type).toBe(file.type);
      expect(mediaItems[0].file.lastModified).toBe(file.lastModified);
      expect(mediaItems[0].fileData).toBeInstanceOf(ArrayBuffer);
      await expect(new Response(mediaItems[0].file).arrayBuffer()).resolves.toEqual(
        originalData
      );
      expect(mediaItems[0].fileData?.byteLength).toBe(originalData.byteLength);
      expect(mediaItems[0].type).toBe('video');
    });

    it('should add image files with default duration', async () => {
      const { addMediaItems } = useMediaStore.getState();
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      
      await addMediaItems([file]);
      
      const { mediaItems } = useMediaStore.getState();
      expect(mediaItems[0].type).toBe('image');
      expect(mediaItems[0].duration).toBe(5); // default image duration
    });

    it('should handle same file added multiple times with unique IDs', async () => {
      const { addMediaItems } = useMediaStore.getState();
      const file = new File(['test content'], 'same-file.mp4', { type: 'video/mp4' });
      
      // 同じファイルを2回追加
      await addMediaItems([file]);
      await addMediaItems([file]);
      
      const { mediaItems } = useMediaStore.getState();
      expect(mediaItems).toHaveLength(2);
      // IDが異なること
      expect(mediaItems[0].id).not.toBe(mediaItems[1].id);
      // URLも異なること（createObjectURLは毎回新しいURLを生成）
      expect(mediaItems[0].url).not.toBe(mediaItems[1].url);
    });

    it('should handle files with same name added simultaneously', async () => {
      const { addMediaItems } = useMediaStore.getState();
      const file1 = new File(['content1'], 'duplicate.mp4', { type: 'video/mp4' });
      const file2 = new File(['content2'], 'duplicate.mp4', { type: 'video/mp4' });
      
      // 同じ名前の2つのファイルを同時に追加
      await addMediaItems([file1, file2]);
      
      const { mediaItems } = useMediaStore.getState();
      expect(mediaItems).toHaveLength(2);
      // IDが異なること
      expect(mediaItems[0].id).not.toBe(mediaItems[1].id);
    });
  });

  describe('removeMediaItem', () => {
    it('should remove an item by id', async () => {
      const { addMediaItems, removeMediaItem } = useMediaStore.getState();
      const file = new File([''], 'test.mp4', { type: 'video/mp4' });
      
      await addMediaItems([file]);
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

  describe('setAllVideosMuted', () => {
    it('動画だけを一括ミュートし、画像は変更しない', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'v1', type: 'video', isMuted: false, duration: 5 } as any,
          { id: 'i1', type: 'image', isMuted: false, duration: 5 } as any,
          { id: 'v2', type: 'video', isMuted: false, duration: 5 } as any,
        ],
        totalDuration: 15,
      });

      useMediaStore.getState().setAllVideosMuted(true);

      const { mediaItems } = useMediaStore.getState();
      expect(mediaItems.find((m) => m.id === 'v1')?.isMuted).toBe(true);
      expect(mediaItems.find((m) => m.id === 'v2')?.isMuted).toBe(true);
      expect(mediaItems.find((m) => m.id === 'i1')?.isMuted).toBe(false);
    });

    it('一括ミュート解除で全動画の isMuted を false にする', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'v1', type: 'video', isMuted: true, duration: 5 } as any,
          { id: 'v2', type: 'video', isMuted: true, duration: 5 } as any,
        ],
        totalDuration: 10,
      });

      useMediaStore.getState().setAllVideosMuted(false);

      const { mediaItems } = useMediaStore.getState();
      expect(mediaItems.every((m) => m.isMuted === false)).toBe(true);
    });

    it('動画が無くても一括ミュートを先にONにでき、追加動画はミュートされる', async () => {
      useMediaStore.setState({
        mediaItems: [],
        totalDuration: 0,
        bulkVideoMuted: false,
      });

      useMediaStore.getState().setAllVideosMuted(true);
      expect(useMediaStore.getState().bulkVideoMuted).toBe(true);
      expect(useMediaStore.getState().mediaItems).toHaveLength(0);

      await useMediaStore.getState().addMediaItems([
        new File(['new'], 'preset-mute.mp4', { type: 'video/mp4' }),
      ]);

      const addedVideo = useMediaStore.getState().mediaItems.find(
        (item) => item.file?.name === 'preset-mute.mp4',
      );
      expect(addedVideo?.isMuted).toBe(true);
      expect(useMediaStore.getState().bulkVideoMuted).toBe(true);
    });

    it('一括ミュート中に追加した動画もミュートし、一括ミュート状態を維持する', async () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'v1', type: 'video', isMuted: true, duration: 5 } as any,
          { id: 'i1', type: 'image', isMuted: false, duration: 5 } as any,
        ],
        totalDuration: 10,
        bulkVideoMuted: true,
      });

      await useMediaStore.getState().addMediaItems([
        new File(['new'], 'added.mp4', { type: 'video/mp4' }),
        new File(['still'], 'added.png', { type: 'image/png' }),
      ]);

      const { mediaItems } = useMediaStore.getState();
      const addedVideo = mediaItems.find((item) => item.file?.name === 'added.mp4');
      const addedImage = mediaItems.find((item) => item.file?.name === 'added.png');
      const videos = mediaItems.filter((item) => item.type === 'video');

      expect(addedVideo?.isMuted).toBe(true);
      expect(addedImage?.isMuted).toBe(false);
      expect(videos.length).toBe(2);
      expect(videos.every((item) => item.isMuted)).toBe(true);
    });

    it('一括ミュートが無効なら追加動画はミュートしない', async () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'v1', type: 'video', isMuted: true, duration: 5 } as any,
          { id: 'v2', type: 'video', isMuted: false, duration: 5 } as any,
        ],
        totalDuration: 10,
        bulkVideoMuted: false,
      });

      await useMediaStore.getState().addMediaItems([
        new File(['new'], 'added.mp4', { type: 'video/mp4' }),
      ]);

      const addedVideo = useMediaStore.getState().mediaItems.find(
        (item) => item.file?.name === 'added.mp4',
      );
      expect(addedVideo?.isMuted).toBe(false);
    });

    it('個別ミュート操作で一括ミュートフラグを解除する', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'v1', type: 'video', isMuted: true, duration: 5 } as any,
        ],
        bulkVideoMuted: true,
      });

      useMediaStore.getState().toggleMute('v1');
      expect(useMediaStore.getState().bulkVideoMuted).toBe(false);
      expect(useMediaStore.getState().mediaItems[0].isMuted).toBe(false);
    });

    it('全クリア後も一括ミュートフラグを残し、再追加動画へすぐ適用する', async () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'v1', type: 'video', isMuted: true, duration: 5, url: 'blob:v1' } as any,
        ],
        bulkVideoMuted: true,
      });

      useMediaStore.getState().clearAllMedia();
      expect(useMediaStore.getState().mediaItems).toHaveLength(0);
      expect(useMediaStore.getState().bulkVideoMuted).toBe(true);

      await useMediaStore.getState().addMediaItems([
        new File(['new'], 'after-clear.mp4', { type: 'video/mp4' }),
      ]);
      expect(useMediaStore.getState().mediaItems[0].isMuted).toBe(true);
      expect(useMediaStore.getState().bulkVideoMuted).toBe(true);
    });

    it('restoreFromSave は保存フラグを優先し、未保存なら全ミュートから補完する', () => {
      useMediaStore.getState().restoreFromSave([], false, undefined, { bulkVideoMuted: true });
      expect(useMediaStore.getState().bulkVideoMuted).toBe(true);

      useMediaStore.getState().restoreFromSave(
        [{ id: 'v1', type: 'video', isMuted: true, duration: 5 } as any],
        false,
      );
      expect(useMediaStore.getState().bulkVideoMuted).toBe(true);

      useMediaStore.getState().restoreFromSave([], false);
      expect(useMediaStore.getState().bulkVideoMuted).toBe(false);
    });
  });

  describe('bulk video volume and normalize', () => {
    it('一括音量を有効にすると全動画へ同じ音量を書き込む', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'v1', type: 'video', volume: 0.4, duration: 5 } as any,
          { id: 'i1', type: 'image', volume: 1, duration: 5 } as any,
          { id: 'v2', type: 'video', volume: 1.8, duration: 5 } as any,
        ],
        bulkVideoVolumeEnabled: false,
        bulkVideoVolume: 0.7,
      });

      useMediaStore.getState().setBulkVideoVolumeEnabled(true);
      const { mediaItems, bulkVideoVolumeEnabled } = useMediaStore.getState();
      expect(bulkVideoVolumeEnabled).toBe(true);
      expect(mediaItems.find((m) => m.id === 'v1')?.volume).toBeCloseTo(0.7);
      expect(mediaItems.find((m) => m.id === 'v2')?.volume).toBeCloseTo(0.7);
      expect(mediaItems.find((m) => m.id === 'i1')?.volume).toBe(1);
    });

    it('一括音量が有効なとき追加した動画もその音量を継承する', async () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'v1', type: 'video', volume: 0.6, isMuted: false, duration: 5 } as any,
        ],
        bulkVideoVolumeEnabled: true,
        bulkVideoVolume: 0.6,
      });

      await useMediaStore.getState().addMediaItems([
        new File(['new'], 'added.mp4', { type: 'video/mp4' }),
      ]);

      const addedVideo = useMediaStore.getState().mediaItems.find(
        (item) => item.file?.name === 'added.mp4',
      );
      expect(addedVideo?.volume).toBeCloseTo(0.6);
    });

    it('音量揃えOFFでゲインを1へ戻し、個別対象外はゲイン1のまま', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'v1', type: 'video', audioNormalizeGain: 2, audioNormalizeEnabled: true } as any,
          { id: 'v2', type: 'video', audioNormalizeGain: 0.5, audioNormalizeEnabled: true } as any,
        ],
        videoAudioNormalizeEnabled: true,
      });

      useMediaStore.getState().setVideoAudioNormalizeParticipating('v2', false);
      expect(useMediaStore.getState().mediaItems.find((m) => m.id === 'v2')?.audioNormalizeEnabled).toBe(false);
      expect(useMediaStore.getState().mediaItems.find((m) => m.id === 'v2')?.audioNormalizeGain).toBe(1);

      useMediaStore.getState().setVideoAudioNormalizeEnabled(false);
      expect(useMediaStore.getState().videoAudioNormalizeEnabled).toBe(false);
      expect(useMediaStore.getState().mediaItems.every((m) => m.audioNormalizeGain === 1)).toBe(true);
    });

    it('音量揃えの目標を平均と最大で切り替えられる', () => {
      expect(useMediaStore.getState().videoAudioNormalizeMode).toBe('mean');
      useMediaStore.getState().setVideoAudioNormalizeMode('loudest');
      expect(useMediaStore.getState().videoAudioNormalizeMode).toBe('loudest');
      useMediaStore.getState().setVideoAudioNormalizeMode('mean');
      expect(useMediaStore.getState().videoAudioNormalizeMode).toBe('mean');
    });

    it('動画を減らしても一括音量と音量揃えは有効のまま残り、追加動画へ引き継ぐ', async () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'v1', type: 'video', volume: 0.4, duration: 5, url: 'blob:v1', file: { name: 'v1.mp4' } } as any,
          { id: 'v2', type: 'video', volume: 0.4, duration: 5, url: 'blob:v2', file: { name: 'v2.mp4' } } as any,
          { id: 'v3', type: 'video', volume: 0.4, duration: 5, url: 'blob:v3', file: { name: 'v3.mp4' } } as any,
        ],
        bulkVideoVolumeEnabled: true,
        bulkVideoVolume: 0.4,
        videoAudioNormalizeEnabled: true,
        videoAudioNormalizeMode: 'loudest',
      });

      useMediaStore.getState().removeMediaItem('v2');
      useMediaStore.getState().removeMediaItem('v3');
      expect(useMediaStore.getState().mediaItems).toHaveLength(1);
      expect(useMediaStore.getState().bulkVideoVolumeEnabled).toBe(true);
      expect(useMediaStore.getState().videoAudioNormalizeEnabled).toBe(true);
      expect(useMediaStore.getState().videoAudioNormalizeMode).toBe('loudest');

      useMediaStore.getState().clearAllMedia();
      expect(useMediaStore.getState().mediaItems).toHaveLength(0);
      expect(useMediaStore.getState().bulkVideoVolumeEnabled).toBe(true);
      expect(useMediaStore.getState().bulkVideoVolume).toBeCloseTo(0.4);
      expect(useMediaStore.getState().videoAudioNormalizeEnabled).toBe(true);
      expect(useMediaStore.getState().videoAudioNormalizeMode).toBe('loudest');

      await useMediaStore.getState().addMediaItems([
        new File(['new'], 'readded.mp4', { type: 'video/mp4' }),
      ]);
      const addedVideo = useMediaStore.getState().mediaItems.find(
        (item) => item.file?.name === 'readded.mp4',
      );
      expect(addedVideo?.volume).toBeCloseTo(0.4);
      expect(addedVideo?.audioNormalizeEnabled).not.toBe(false);
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
      updateScale('a', 5.0); // max is 4.0
      
      const { mediaItems } = useMediaStore.getState();
      expect(mediaItems[0].scale).toBe(4.0);
    });
  });

  describe('setVideoDuration', () => {
    it('should set video duration and trim values on first load', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'a', type: 'video', duration: 0, originalDuration: 0, trimStart: 0, trimEnd: 0 } as any,
        ],
        totalDuration: 0,
      });
      
      const { setVideoDuration } = useMediaStore.getState();
      setVideoDuration('a', 30);
      
      const { mediaItems, totalDuration } = useMediaStore.getState();
      expect(mediaItems[0].originalDuration).toBe(30);
      expect(mediaItems[0].trimStart).toBe(0);
      expect(mediaItems[0].trimEnd).toBe(30);
      expect(mediaItems[0].duration).toBe(30);
      expect(totalDuration).toBe(30);
    });

    it('should preserve trim values if already initialized', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'a', type: 'video', duration: 15, originalDuration: 30, trimStart: 5, trimEnd: 20 } as any,
        ],
        totalDuration: 15,
      });
      
      const { setVideoDuration } = useMediaStore.getState();
      setVideoDuration('a', 30);
      
      const { mediaItems } = useMediaStore.getState();
      expect(mediaItems[0].trimStart).toBe(5);
      expect(mediaItems[0].trimEnd).toBe(20);
      expect(mediaItems[0].duration).toBe(15);
    });

    it('should update totalDuration and keep order in video->image timeline', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'video-1', type: 'video', duration: 0, originalDuration: 0, trimStart: 0, trimEnd: 0 } as any,
          { id: 'image-1', type: 'image', duration: 5, originalDuration: 5, trimStart: 0, trimEnd: 5 } as any,
        ],
        totalDuration: 5,
      });

      const { setVideoDuration } = useMediaStore.getState();
      setVideoDuration('video-1', 12);

      const { mediaItems, totalDuration } = useMediaStore.getState();
      expect(mediaItems.map((item) => item.id)).toEqual(['video-1', 'image-1']);
      expect(mediaItems[0].duration).toBe(12);
      expect(mediaItems[1].duration).toBe(5);
      expect(totalDuration).toBe(17);
    });
  });

  describe('updateVideoTrim', () => {
    it('should update trim start and recalculate duration', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'a', type: 'video', duration: 30, originalDuration: 30, trimStart: 0, trimEnd: 30 } as any,
        ],
        totalDuration: 30,
      });
      
      const { updateVideoTrim } = useMediaStore.getState();
      updateVideoTrim('a', 'start', 5);
      
      const { mediaItems, totalDuration } = useMediaStore.getState();
      expect(mediaItems[0].trimStart).toBe(5);
      expect(mediaItems[0].trimEnd).toBe(30);
      expect(mediaItems[0].duration).toBe(25);
      expect(totalDuration).toBe(25);
    });

    it('should update trim end and recalculate duration', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'a', type: 'video', duration: 30, originalDuration: 30, trimStart: 0, trimEnd: 30 } as any,
        ],
        totalDuration: 30,
      });
      
      const { updateVideoTrim } = useMediaStore.getState();
      updateVideoTrim('a', 'end', 20);
      
      const { mediaItems, totalDuration } = useMediaStore.getState();
      expect(mediaItems[0].trimStart).toBe(0);
      expect(mediaItems[0].trimEnd).toBe(20);
      expect(mediaItems[0].duration).toBe(20);
      expect(totalDuration).toBe(20);
    });

    it('should not allow trim start to exceed trim end', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'a', type: 'video', duration: 20, originalDuration: 30, trimStart: 0, trimEnd: 20 } as any,
        ],
        totalDuration: 20,
      });
      
      const { updateVideoTrim } = useMediaStore.getState();
      updateVideoTrim('a', 'start', 25); // exceeds trimEnd of 20
      
      const { mediaItems } = useMediaStore.getState();
      expect(mediaItems[0].trimStart).toBeLessThan(mediaItems[0].trimEnd);
    });

    it('should not affect other media items when updating one', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'a', type: 'video', duration: 30, originalDuration: 30, trimStart: 0, trimEnd: 30 } as any,
          { id: 'b', type: 'video', duration: 20, originalDuration: 20, trimStart: 0, trimEnd: 20 } as any,
        ],
        totalDuration: 50,
      });
      
      const { updateVideoTrim } = useMediaStore.getState();
      updateVideoTrim('a', 'end', 10);
      
      const { mediaItems, totalDuration } = useMediaStore.getState();
      // Item 'a' should be updated
      expect(mediaItems[0].trimEnd).toBe(10);
      expect(mediaItems[0].duration).toBe(10);
      // Item 'b' should remain unchanged
      expect(mediaItems[1].trimEnd).toBe(20);
      expect(mediaItems[1].duration).toBe(20);
      // Total duration should be updated
      expect(totalDuration).toBe(30);
    });
  });

  describe('updateImageDuration', () => {
    it('should update image duration', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'a', type: 'image', duration: 5 } as any,
        ],
        totalDuration: 5,
      });
      
      const { updateImageDuration } = useMediaStore.getState();
      updateImageDuration('a', 10);
      
      const { mediaItems, totalDuration } = useMediaStore.getState();
      expect(mediaItems[0].duration).toBe(10);
      expect(totalDuration).toBe(10);
    });

    it('should enforce minimum duration of 0.5 seconds', () => {
      useMediaStore.setState({
        mediaItems: [
          { id: 'a', type: 'image', duration: 5 } as any,
        ],
        totalDuration: 5,
      });
      
      const { updateImageDuration } = useMediaStore.getState();
      updateImageDuration('a', 0.1);
      
      const { mediaItems } = useMediaStore.getState();
      expect(mediaItems[0].duration).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('video thumbnail mode', () => {
    it('setVideoDuration initializes auto thumbnail at +0.2s', () => {
      useMediaStore.setState({
        mediaItems: [
          {
            id: 'a',
            type: 'video',
            duration: 0,
            originalDuration: 0,
            trimStart: 0,
            trimEnd: 0,
            thumbnailMode: 'auto',
          } as any,
        ],
        totalDuration: 0,
      });

      useMediaStore.getState().setVideoDuration('a', 10);
      const item = useMediaStore.getState().mediaItems[0];
      expect(item.thumbnailMode).toBe('auto');
      expect(item.thumbnailSourceTime).toBeCloseTo(0.2);
    });

    it('setVideoThumbnailManual switches to manual and stores source time', () => {
      useMediaStore.setState({
        mediaItems: [
          {
            id: 'a',
            type: 'video',
            duration: 10,
            originalDuration: 10,
            trimStart: 0,
            trimEnd: 10,
            thumbnailMode: 'auto',
            thumbnailSourceTime: 0.2,
          } as any,
        ],
      });

      const ok = useMediaStore.getState().setVideoThumbnailManual('a', 3.5);
      expect(ok).toBe(true);
      const item = useMediaStore.getState().mediaItems[0];
      expect(item.thumbnailMode).toBe('manual');
      expect(item.thumbnailSourceTime).toBeCloseTo(3.5);
    });

    it('rejects manual set outside trim range without changing mode', () => {
      useMediaStore.setState({
        mediaItems: [
          {
            id: 'a',
            type: 'video',
            duration: 5,
            originalDuration: 10,
            trimStart: 2,
            trimEnd: 7,
            thumbnailMode: 'auto',
            thumbnailSourceTime: 2.2,
          } as any,
        ],
      });

      const ok = useMediaStore.getState().setVideoThumbnailManual('a', 1.0);
      expect(ok).toBe(false);
      const item = useMediaStore.getState().mediaItems[0];
      expect(item.thumbnailMode).toBe('auto');
      expect(item.thumbnailSourceTime).toBeCloseTo(2.2);
    });

    it('resetVideoThumbnailToAuto recomputes from current trim start', () => {
      useMediaStore.setState({
        mediaItems: [
          {
            id: 'a',
            type: 'video',
            duration: 6,
            originalDuration: 10,
            trimStart: 2,
            trimEnd: 8,
            thumbnailMode: 'manual',
            thumbnailSourceTime: 5,
          } as any,
        ],
      });

      useMediaStore.getState().resetVideoThumbnailToAuto('a');
      const item = useMediaStore.getState().mediaItems[0];
      expect(item.thumbnailMode).toBe('auto');
      expect(item.thumbnailSourceTime).toBeCloseTo(2.2);
    });

    it('trim out of manual range falls back to auto', () => {
      useMediaStore.setState({
        mediaItems: [
          {
            id: 'a',
            type: 'video',
            duration: 10,
            originalDuration: 10,
            trimStart: 0,
            trimEnd: 10,
            thumbnailMode: 'manual',
            thumbnailSourceTime: 1,
          } as any,
        ],
        totalDuration: 10,
      });

      useMediaStore.getState().updateVideoTrim('a', 'start', 3);
      const item = useMediaStore.getState().mediaItems[0];
      expect(item.thumbnailMode).toBe('auto');
      expect(item.thumbnailSourceTime).toBeCloseTo(3.2);
    });

    it('trim keeps manual when still in range', () => {
      useMediaStore.setState({
        mediaItems: [
          {
            id: 'a',
            type: 'video',
            duration: 10,
            originalDuration: 10,
            trimStart: 0,
            trimEnd: 10,
            thumbnailMode: 'manual',
            thumbnailSourceTime: 5,
          } as any,
        ],
        totalDuration: 10,
      });

      useMediaStore.getState().updateVideoTrim('a', 'start', 2);
      const item = useMediaStore.getState().mediaItems[0];
      expect(item.thumbnailMode).toBe('manual');
      expect(item.thumbnailSourceTime).toBeCloseTo(5);
    });
  });

  describe('project poster', () => {
    it('setProjectPosterManual stores mode, time, and image', () => {
      useMediaStore.getState().setProjectPosterManual(
        3.5,
        'data:image/jpeg;base64,xx',
        'portrait',
      );
      const s = useMediaStore.getState();
      expect(s.projectPosterMode).toBe('manual');
      expect(s.projectPosterTimelineTime).toBeCloseTo(3.5);
      expect(s.projectPosterDataUrl).toBe('data:image/jpeg;base64,xx');
      expect(s.projectPosterAspectRatio).toBe('portrait');
    });

    it('resetProjectPosterToAuto uses timeline 0.2 and optional image', () => {
      useMediaStore.getState().setProjectPosterManual(
        5,
        'data:image/jpeg;base64,old',
        'landscape',
      );
      useMediaStore.getState().resetProjectPosterToAuto(
        12,
        'data:image/jpeg;base64,auto',
        'portrait',
      );
      const s = useMediaStore.getState();
      expect(s.projectPosterMode).toBe('auto');
      expect(s.projectPosterTimelineTime).toBeCloseTo(0.2);
      expect(s.projectPosterDataUrl).toBe('data:image/jpeg;base64,auto');
      expect(s.projectPosterAspectRatio).toBe('portrait');
    });

    it('reconcileProjectPosterAspectRatio resets an incompatible manual poster to auto', () => {
      useMediaStore.getState().setProjectPosterManual(
        4,
        'data:image/jpeg;base64,landscape',
        'landscape',
      );

      const reset = useMediaStore
        .getState()
        .reconcileProjectPosterAspectRatio('portrait', 20);
      const s = useMediaStore.getState();

      expect(reset).toBe(true);
      expect(s.projectPosterMode).toBe('auto');
      expect(s.projectPosterTimelineTime).toBeCloseTo(0.2);
      expect(s.projectPosterDataUrl).toBeNull();
      expect(s.projectPosterAspectRatio).toBe('portrait');
    });

    it('reconcileProjectPosterAspectRatio preserves a compatible manual poster', () => {
      useMediaStore.getState().setProjectPosterManual(
        4,
        'data:image/jpeg;base64,portrait',
        'portrait',
      );

      const reset = useMediaStore
        .getState()
        .reconcileProjectPosterAspectRatio('portrait', 20);
      const s = useMediaStore.getState();

      expect(reset).toBe(false);
      expect(s.projectPosterMode).toBe('manual');
      expect(s.projectPosterTimelineTime).toBe(4);
      expect(s.projectPosterDataUrl).toBe('data:image/jpeg;base64,portrait');
      expect(s.projectPosterAspectRatio).toBe('portrait');
    });

    it('reconcileProjectPosterAspectRatio clears auto image for recapture in the new ratio', () => {
      useMediaStore.getState().resetProjectPosterToAuto(
        20,
        'data:image/jpeg;base64,landscape-auto',
        'landscape',
      );

      const reset = useMediaStore
        .getState()
        .reconcileProjectPosterAspectRatio('portrait', 20);
      const s = useMediaStore.getState();

      expect(reset).toBe(false);
      expect(s.projectPosterMode).toBe('auto');
      expect(s.projectPosterDataUrl).toBeNull();
      expect(s.projectPosterAspectRatio).toBe('portrait');
    });
  });

  describe('duplicateMediaItem', () => {
    it('should insert an independent copy right after the source item', async () => {
      const { addMediaItems } = useMediaStore.getState();
      const fileA = new File(['aaa'], 'a.mp4', { type: 'video/mp4' });
      const fileB = new File(['bbb'], 'b.mp4', { type: 'video/mp4' });
      await addMediaItems([fileA, fileB]);

      const [itemA] = useMediaStore.getState().mediaItems;
      useMediaStore.getState().updateMediaItem(itemA.id, {
        trimStart: 1,
        trimEnd: 4,
        duration: 3,
        originalDuration: 10,
        scale: 1.5,
        volume: 0.8,
      });

      useMediaStore.getState().duplicateMediaItem(itemA.id);

      const items = useMediaStore.getState().mediaItems;
      expect(items).toHaveLength(3);
      // 複製は元の直後に挿入される
      expect(items[0].id).toBe(itemA.id);
      const copy = items[1];
      expect(copy.id).not.toBe(itemA.id);
      expect(copy.url).not.toBe(items[0].url);
      expect(copy.file).toBe(items[0].file);
      // 設定が引き継がれる
      expect(copy.trimStart).toBe(1);
      expect(copy.trimEnd).toBe(4);
      expect(copy.scale).toBe(1.5);
      expect(copy.volume).toBe(0.8);
      // 開閉/ロック状態は複製しない
      expect(copy.isTransformOpen).toBe(false);
      expect(copy.isLocked).toBe(false);
      // totalDuration が再計算される
      expect(useMediaStore.getState().totalDuration).toBeCloseTo(3 + 3 + items[2].duration);
    });

    it('should do nothing for unknown id', async () => {
      const { addMediaItems } = useMediaStore.getState();
      await addMediaItems([new File(['x'], 'x.mp4', { type: 'video/mp4' })]);
      useMediaStore.getState().duplicateMediaItem('missing');
      expect(useMediaStore.getState().mediaItems).toHaveLength(1);
    });
  });

  describe('rotateClip / resetTransform(rotation)', () => {
    it('cycles rotation 0 → 90 → 180 → 270 → 0 on repeated calls', async () => {
      const { addMediaItems, rotateClip } = useMediaStore.getState();
      await addMediaItems([new File(['x'], 'x.mp4', { type: 'video/mp4' })]);
      const id = useMediaStore.getState().mediaItems[0].id;

      expect(useMediaStore.getState().mediaItems[0].rotation).toBe(0);
      rotateClip(id);
      expect(useMediaStore.getState().mediaItems[0].rotation).toBe(90);
      rotateClip(id);
      expect(useMediaStore.getState().mediaItems[0].rotation).toBe(180);
      rotateClip(id);
      expect(useMediaStore.getState().mediaItems[0].rotation).toBe(270);
      rotateClip(id);
      expect(useMediaStore.getState().mediaItems[0].rotation).toBe(0);
    });

    it('normalizes a legacy item without rotation before advancing', async () => {
      const { addMediaItems, rotateClip } = useMediaStore.getState();
      await addMediaItems([new File(['x'], 'x.mp4', { type: 'video/mp4' })]);
      const id = useMediaStore.getState().mediaItems[0].id;
      // 旧データ相当: rotation を未定義に戻す
      useMediaStore.setState((s) => ({
        mediaItems: s.mediaItems.map((m) =>
          m.id === id ? { ...m, rotation: undefined } : m
        ),
      }));

      rotateClip(id);
      expect(useMediaStore.getState().mediaItems[0].rotation).toBe(90);
    });

    it('reset(rotation) returns rotation to 0 without touching scale/position', async () => {
      const { addMediaItems, rotateClip, updateScale, updatePosition, resetTransform } =
        useMediaStore.getState();
      await addMediaItems([new File(['x'], 'x.mp4', { type: 'video/mp4' })]);
      const id = useMediaStore.getState().mediaItems[0].id;

      rotateClip(id);
      rotateClip(id);
      updateScale(id, 1.5);
      updatePosition(id, 'x', 40);
      expect(useMediaStore.getState().mediaItems[0].rotation).toBe(180);

      resetTransform(id, 'rotation');
      const item = useMediaStore.getState().mediaItems[0];
      expect(item.rotation).toBe(0);
      expect(item.scale).toBe(1.5);
      expect(item.positionX).toBe(40);
    });
  });

  describe('updateBlur / resetTransform(blur)', () => {
    it('カードごとにぼかしを更新し、0〜30の範囲へ収める', async () => {
      const { addMediaItems } = useMediaStore.getState();
      await addMediaItems([
        new File(['a'], 'a.png', { type: 'image/png' }),
        new File(['b'], 'b.png', { type: 'image/png' }),
      ]);
      const [first, second] = useMediaStore.getState().mediaItems;

      expect(first.blur).toBe(0);
      useMediaStore.getState().updateBlur(first.id, 18);
      expect(useMediaStore.getState().mediaItems[0].blur).toBe(18);
      expect(useMediaStore.getState().mediaItems[1].blur).toBe(second.blur);

      useMediaStore.getState().updateBlur(first.id, 100);
      expect(useMediaStore.getState().mediaItems[0].blur).toBe(30);
      useMediaStore.getState().updateBlur(first.id, -5);
      expect(useMediaStore.getState().mediaItems[0].blur).toBe(0);
    });

    it('ぼかしだけをリセットし、位置・サイズ・回転は維持する', async () => {
      const { addMediaItems } = useMediaStore.getState();
      await addMediaItems([new File(['x'], 'x.mp4', { type: 'video/mp4' })]);
      const id = useMediaStore.getState().mediaItems[0].id;

      useMediaStore.getState().updateScale(id, 1.5);
      useMediaStore.getState().updatePosition(id, 'x', 40);
      useMediaStore.getState().rotateClip(id);
      useMediaStore.getState().updateBlur(id, 14);
      useMediaStore.getState().resetTransform(id, 'blur');

      expect(useMediaStore.getState().mediaItems[0]).toMatchObject({
        blur: 0,
        scale: 1.5,
        positionX: 40,
        rotation: 90,
      });
    });
  });
});
