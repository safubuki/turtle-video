/**
 * media.ts のテスト
 */

import { describe, it, expect } from 'vitest';
import {
  generateId,
  getMediaType,
  calculateTotalDuration,
  getActiveMediaItem,
  swapArrayItems,
  validateTrim,
  MIN_VIDEO_TRIM_DURATION_SEC,
  computeVideoTrimFromPreviewPosition,
  canSetVideoTrimFromPreviewPosition,
  AUTO_THUMBNAIL_OFFSET_SEC,
  computeAutoThumbnailSourceTime,
  isThumbnailSourceTimeInRange,
  resolveThumbnailAfterTrimChange,
  computeThumbnailSourceTimeFromPreviewPosition,
  canSetVideoThumbnailFromPreviewPosition,
  buildThumbnailSeekCandidates,
  computeAutoProjectPosterTimelineTime,
  buildAutoProjectPosterContentKey,
  resolveAutoProjectPosterCaptureTime,
  isCanvasEffectivelyBlank,
  isRgbaBufferEffectivelyBlank,
  PREVIEW_START_CLEAR_ZONE_SEC,
  validateScale,
  validatePosition,
} from '../utils/media';
import type { MediaItem } from '../types';

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('should generate string IDs', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('should generate unique IDs even when called rapidly', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId());
    }
    // 1000回呼び出して全て一意であること
    expect(ids.size).toBe(1000);
  });

  it('should contain timestamp and counter components', () => {
    const id = generateId();
    // ID形式: timestamp-counter-random
    expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
  });
});

describe('getMediaType', () => {
  it('should detect video files', () => {
    const videoFile = new File([''], 'test.mp4', { type: 'video/mp4' });
    expect(getMediaType(videoFile)).toBe('video');
  });

  it('should detect image files', () => {
    const imageFile = new File([''], 'test.jpg', { type: 'image/jpeg' });
    expect(getMediaType(imageFile)).toBe('image');
  });

  it('should detect audio files', () => {
    const audioFile = new File([''], 'test.mp3', { type: 'audio/mpeg' });
    expect(getMediaType(audioFile)).toBe('audio');
  });

  it('should return null for unknown types', () => {
    const unknownFile = new File([''], 'test.txt', { type: 'text/plain' });
    expect(getMediaType(unknownFile)).toBeNull();
  });
});

// Helper to create mock MediaItem
const createMockMediaItem = (overrides: Partial<MediaItem> = {}): MediaItem => ({
  id: generateId(),
  file: new File([''], 'test.mp4', { type: 'video/mp4' }),
  type: 'video',
  url: 'blob:test',
  volume: 1.0,
  isMuted: false,
  fadeIn: false,
  fadeOut: false,
  fadeInDuration: 1.0,
  fadeOutDuration: 1.0,
  duration: 10,
  originalDuration: 10,
  trimStart: 0,
  trimEnd: 10,
  scale: 1.0,
  positionX: 0,
  positionY: 0,
  isTransformOpen: false,
  isLocked: false,
  ...overrides,
});

describe('calculateTotalDuration', () => {
  it('should calculate total duration of all items', () => {
    const items = [
      createMockMediaItem({ duration: 10 }),
      createMockMediaItem({ duration: 20 }),
      createMockMediaItem({ duration: 30 }),
    ];
    expect(calculateTotalDuration(items)).toBe(60);
  });

  it('should return 0 for empty array', () => {
    expect(calculateTotalDuration([])).toBe(0);
  });

  it('should handle non-finite durations', () => {
    const items = [
      createMockMediaItem({ duration: 10 }),
      createMockMediaItem({ duration: Infinity }),
      createMockMediaItem({ duration: NaN }),
    ];
    expect(calculateTotalDuration(items)).toBe(10);
  });
});

describe('getActiveMediaItem', () => {
  it('should find the active item at given time', () => {
    const items = [
      createMockMediaItem({ id: 'a', duration: 10 }),
      createMockMediaItem({ id: 'b', duration: 10 }),
      createMockMediaItem({ id: 'c', duration: 10 }),
    ];

    const result1 = getActiveMediaItem(items, 5);
    expect(result1?.item.id).toBe('a');
    expect(result1?.index).toBe(0);
    expect(result1?.localTime).toBe(5);

    const result2 = getActiveMediaItem(items, 15);
    expect(result2?.item.id).toBe('b');
    expect(result2?.index).toBe(1);
    expect(result2?.localTime).toBe(5);
  });

  it('should return null for out of range time', () => {
    const items = [createMockMediaItem({ duration: 10 })];
    expect(getActiveMediaItem(items, 20)).toBeNull();
    expect(getActiveMediaItem(items, -5)).toBeNull();
  });

  it('should return null for empty array', () => {
    expect(getActiveMediaItem([], 5)).toBeNull();
  });
});

describe('swapArrayItems', () => {
  it('should swap two items', () => {
    const arr = ['a', 'b', 'c'];
    const result = swapArrayItems(arr, 0, 2);
    expect(result).toEqual(['c', 'b', 'a']);
  });

  it('should return original array for invalid indices', () => {
    const arr = ['a', 'b', 'c'];
    expect(swapArrayItems(arr, 0, -1)).toEqual(arr);
    expect(swapArrayItems(arr, 0, 5)).toEqual(arr);
  });
});

describe('validateTrim', () => {
  it('should validate trim values', () => {
    // validateTrim(start, end, maxDuration) -> { start, end, duration }
    const result = validateTrim(2, 8, 10);
    expect(result.start).toBe(2);
    expect(result.end).toBe(8);
    expect(result.duration).toBe(6);
  });

  it('should clamp start to valid range', () => {
    const result = validateTrim(-5, 8, 10);
    expect(result.start).toBeGreaterThanOrEqual(0);
    expect(result.end).toBe(8);
  });

  it('should not allow start to exceed end', () => {
    const result = validateTrim(9, 5, 10);
    expect(result.start).toBeLessThan(result.end);
  });

  it('should clamp end to maxDuration', () => {
    const result = validateTrim(2, 15, 10);
    expect(result.end).toBeLessThanOrEqual(10);
  });
});

describe('computeVideoTrimFromPreviewPosition', () => {
  it('sets start from preview position relative to current trim', () => {
    // 元 0-10s を 2-8s にトリム済み。プレビュー上 2s → 元動画 4s を新開始点に
    const result = computeVideoTrimFromPreviewPosition({
      sourceTrimStart: 2,
      sourceTrimEnd: 8,
      originalDuration: 10,
      previewPosition: 2,
      type: 'start',
    });
    expect(result).toEqual({ start: 4, end: 8, duration: 4 });
  });

  it('sets end from preview position relative to current trim', () => {
    const result = computeVideoTrimFromPreviewPosition({
      sourceTrimStart: 2,
      sourceTrimEnd: 8,
      originalDuration: 10,
      previewPosition: 3,
      type: 'end',
    });
    expect(result).toEqual({ start: 2, end: 5, duration: 3 });
  });

  it('supports repeated re-trimming without resetting to source 0', () => {
    // 1回目: 2-8 → 4-8
    const first = computeVideoTrimFromPreviewPosition({
      sourceTrimStart: 2,
      sourceTrimEnd: 8,
      originalDuration: 10,
      previewPosition: 2,
      type: 'start',
    });
    expect(first).not.toBeNull();
    // 2回目: 4-8 のプレビュー 1s → 元 5s 開始
    const second = computeVideoTrimFromPreviewPosition({
      sourceTrimStart: first!.start,
      sourceTrimEnd: first!.end,
      originalDuration: 10,
      previewPosition: 1,
      type: 'start',
    });
    expect(second).toEqual({ start: 5, end: 8, duration: 3 });
  });

  it('does not move the opposite edge when setting start or end', () => {
    const startOnly = computeVideoTrimFromPreviewPosition({
      sourceTrimStart: 1,
      sourceTrimEnd: 9,
      originalDuration: 12,
      previewPosition: 2,
      type: 'start',
    });
    expect(startOnly?.end).toBe(9);

    const endOnly = computeVideoTrimFromPreviewPosition({
      sourceTrimStart: 1,
      sourceTrimEnd: 9,
      originalDuration: 12,
      previewPosition: 4,
      type: 'end',
    });
    expect(endOnly?.start).toBe(1);
  });

  it('rejects settings shorter than minimum duration', () => {
    const tooShortStart = computeVideoTrimFromPreviewPosition({
      sourceTrimStart: 0,
      sourceTrimEnd: 5,
      originalDuration: 10,
      previewPosition: 5 - MIN_VIDEO_TRIM_DURATION_SEC / 2,
      type: 'start',
    });
    expect(tooShortStart).toBeNull();

    const tooShortEnd = computeVideoTrimFromPreviewPosition({
      sourceTrimStart: 0,
      sourceTrimEnd: 5,
      originalDuration: 10,
      previewPosition: MIN_VIDEO_TRIM_DURATION_SEC / 2,
      type: 'end',
    });
    expect(tooShortEnd).toBeNull();
  });

  it('rejects preview positions outside the current playable range', () => {
    expect(
      computeVideoTrimFromPreviewPosition({
        sourceTrimStart: 2,
        sourceTrimEnd: 8,
        originalDuration: 10,
        previewPosition: -0.1,
        type: 'start',
      })
    ).toBeNull();
    expect(
      computeVideoTrimFromPreviewPosition({
        sourceTrimStart: 2,
        sourceTrimEnd: 8,
        originalDuration: 10,
        previewPosition: 6.1,
        type: 'end',
      })
    ).toBeNull();
  });

  it('canSetVideoTrimFromPreviewPosition mirrors null checks', () => {
    expect(
      canSetVideoTrimFromPreviewPosition({
        sourceTrimStart: 2,
        sourceTrimEnd: 8,
        originalDuration: 10,
        previewPosition: 2,
        type: 'start',
      })
    ).toBe(true);
    expect(
      canSetVideoTrimFromPreviewPosition({
        sourceTrimStart: 2,
        sourceTrimEnd: 8,
        originalDuration: 10,
        previewPosition: 5.95,
        type: 'start',
      })
    ).toBe(false);
  });
});

describe('video thumbnail auto/manual (Issue #208)', () => {
  it('auto time is sourceTrimStart + 0.2 for untrimmed and trimmed clips', () => {
    expect(computeAutoThumbnailSourceTime(0, 10)).toBeCloseTo(AUTO_THUMBNAIL_OFFSET_SEC);
    // 開始を 2s にトリム → 2.2s
    expect(computeAutoThumbnailSourceTime(2, 10)).toBeCloseTo(2.2);
  });

  it('uses midpoint for very short clips instead of going out of range', () => {
    // 有効尺 0.1s → 中央 0.05
    expect(computeAutoThumbnailSourceTime(1, 1.1)).toBeCloseTo(1.05, 2);
    // 有効尺ちょうど 0.2s 以下
    const t = computeAutoThumbnailSourceTime(0, 0.15);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(0.15);
  });

  it('keeps manual when still in range after trim, falls back when outside', () => {
    const keep = resolveThumbnailAfterTrimChange({
      mode: 'manual',
      thumbnailSourceTime: 3,
      sourceTrimStart: 1,
      sourceTrimEnd: 8,
    });
    expect(keep).toEqual({
      thumbnailMode: 'manual',
      thumbnailSourceTime: 3,
      fellBackToAuto: false,
    });

    const fallback = resolveThumbnailAfterTrimChange({
      mode: 'manual',
      thumbnailSourceTime: 0.5,
      sourceTrimStart: 2,
      sourceTrimEnd: 8,
    });
    expect(fallback.thumbnailMode).toBe('auto');
    expect(fallback.fellBackToAuto).toBe(true);
    expect(fallback.thumbnailSourceTime).toBeCloseTo(2.2);
  });

  it('auto always recomputes from current trim start', () => {
    const resolved = resolveThumbnailAfterTrimChange({
      mode: 'auto',
      thumbnailSourceTime: 0.2,
      sourceTrimStart: 5,
      sourceTrimEnd: 12,
    });
    expect(resolved.thumbnailMode).toBe('auto');
    expect(resolved.thumbnailSourceTime).toBeCloseTo(5.2);
    expect(resolved.fellBackToAuto).toBe(false);
  });

  it('manual thumbnail from preview uses source absolute time', () => {
    // trim 2-8, preview 1.5s into clip → source 3.5
    const t = computeThumbnailSourceTimeFromPreviewPosition({
      sourceTrimStart: 2,
      sourceTrimEnd: 8,
      originalDuration: 10,
      previewPosition: 1.5,
    });
    expect(t).toBeCloseTo(3.5);
    expect(
      canSetVideoThumbnailFromPreviewPosition({
        sourceTrimStart: 2,
        sourceTrimEnd: 8,
        originalDuration: 10,
        previewPosition: 1.5,
      })
    ).toBe(true);
    expect(
      canSetVideoThumbnailFromPreviewPosition({
        sourceTrimStart: 2,
        sourceTrimEnd: 8,
        originalDuration: 10,
        previewPosition: -0.1,
      })
    ).toBe(false);
  });

  it('range check uses half-open [start, end)', () => {
    expect(isThumbnailSourceTimeInRange(2, 2, 8)).toBe(true);
    expect(isThumbnailSourceTimeInRange(7.99, 2, 8)).toBe(true);
    expect(isThumbnailSourceTimeInRange(8, 2, 8)).toBe(false);
    expect(isThumbnailSourceTimeInRange(1.9, 2, 8)).toBe(false);
  });

  it('seek candidates stay within trim range and prefer primary time', () => {
    const candidates = buildThumbnailSeekCandidates({
      primarySourceTime: 2.2,
      sourceTrimStart: 2,
      sourceTrimEnd: 5,
      mediaDuration: 10,
    });
    expect(candidates[0]).toBeCloseTo(2.2);
    for (const t of candidates) {
      expect(t).toBeGreaterThanOrEqual(2);
      expect(t).toBeLessThan(5);
    }
  });

  it('project poster auto time uses timeline 0.2s (not per-clip)', () => {
    expect(computeAutoProjectPosterTimelineTime(10)).toBeCloseTo(0.2);
    expect(computeAutoProjectPosterTimelineTime(0.1)).toBeCloseTo(0.05);
    expect(computeAutoProjectPosterTimelineTime(0)).toBe(0);
  });

  it('auto project poster content key changes when order or leading duration changes', () => {
    const base = {
      type: 'video' as const,
      duration: 5,
      trimStart: 0,
      trimEnd: 5,
      scale: 1,
      positionX: 0,
      positionY: 0,
      rotation: 0,
      blur: 0,
      playbackSpeed: 1 as const,
      transitionToNext: null,
    };
    const a = { ...base, id: 'a' };
    const b = { ...base, id: 'b', duration: 3, trimEnd: 3 };
    const keyAb = buildAutoProjectPosterContentKey([a, b], 8, 'landscape');
    const keyBa = buildAutoProjectPosterContentKey([b, a], 8, 'landscape');
    const keyAbShort = buildAutoProjectPosterContentKey(
      [{ ...a, duration: 2, trimEnd: 2 }, b],
      5,
      'landscape',
    );
    expect(keyAb).not.toBe(keyBa);
    expect(keyAb).not.toBe(keyAbShort);
    expect(keyAb).toBe(buildAutoProjectPosterContentKey([a, b], 8, 'landscape'));
    expect(keyAb).not.toBe(buildAutoProjectPosterContentKey([a, b], 8, 'portrait'));
  });

  // --- 自動サムネイル黒画像対策 ---
  it('auto poster capture time stays outside the preview start clear zone', () => {
    // 通常尺: 表示上の自動時刻 0.2s をそのまま使う（クリア帯の外）
    expect(resolveAutoProjectPosterCaptureTime(10)).toBeCloseTo(0.2);

    // 短尺: 表示時刻は 0.05s でクリア帯に入るため、キャプチャは外へ押し出す
    expect(computeAutoProjectPosterTimelineTime(0.1)).toBeLessThanOrEqual(
      PREVIEW_START_CLEAR_ZONE_SEC,
    );
    expect(resolveAutoProjectPosterCaptureTime(0.1)).toBeGreaterThan(
      PREVIEW_START_CLEAR_ZONE_SEC,
    );

    // 総尺を越えない
    expect(resolveAutoProjectPosterCaptureTime(0.02)).toBeLessThanOrEqual(0.02);
    expect(resolveAutoProjectPosterCaptureTime(0)).toBe(0);
  });

  it('detects an all-black buffer as blank and a drawn buffer as not blank', () => {
    // 4 画素ぶんの RGBA を作る
    const fill = (r: number, g: number, b: number, a = 255) => {
      const out: number[] = [];
      for (let i = 0; i < 4; i++) out.push(r, g, b, a);
      return out;
    };

    // 真っ黒 = シーク未完了で描画スキップされたフレーム
    expect(isRgbaBufferEffectivelyBlank(fill(0, 0, 0))).toBe(true);
    // 通常のフレーム
    expect(isRgbaBufferEffectivelyBlank(fill(255, 255, 255))).toBe(false);
    // 暗いが真っ黒ではないフレームは黒扱いしない（意図的な暗所を守る）
    expect(isRgbaBufferEffectivelyBlank(fill(58, 58, 58))).toBe(false);

    // 1 画素でも明るければ黒ではない（部分描画を黒と誤判定しない）
    const partiallyDrawn = [...fill(0, 0, 0), 200, 200, 200, 255];
    expect(isRgbaBufferEffectivelyBlank(partiallyDrawn)).toBe(false);
  });

  it('treats a fully transparent buffer as not blank (判定不能扱い)', () => {
    // alpha=0 のみ = ラスタライズされていない。黒と断定して上書きしない。
    const transparent = [0, 0, 0, 0, 0, 0, 0, 0];
    expect(isRgbaBufferEffectivelyBlank(transparent)).toBe(false);
    expect(isRgbaBufferEffectivelyBlank([])).toBe(false);
  });

  it('treats a zero-sized canvas as not blank (判定不能は既存挙動を維持)', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 0;
    canvas.height = 0;
    expect(isCanvasEffectivelyBlank(canvas)).toBe(false);
  });
});

describe('validateScale', () => {
  it('should clamp scale to min/max', () => {
    expect(validateScale(0.3)).toBe(0.5); // min is 0.5
    expect(validateScale(5)).toBe(3.0); // max is 3.0
    expect(validateScale(1.5)).toBe(1.5);
  });
});

describe('validatePosition', () => {
  it('should clamp position to valid range', () => {
    // default limit is MAX_CANVAS_WIDTH (1920)
    expect(validatePosition(3000)).toBeLessThanOrEqual(1920);
    expect(validatePosition(-3000)).toBeGreaterThanOrEqual(-1920);
    expect(validatePosition(100)).toBe(100);
  });

  it('should handle custom limits', () => {
    expect(validatePosition(2000, 1000)).toBe(1000);
    expect(validatePosition(-2000, 1000)).toBe(-1000);
  });
});
