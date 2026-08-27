import { describe, expect, it } from 'vitest';
import {
  PREVIEW_UI_TIME_JUMP_SEC,
  PREVIEW_UI_TIME_PUBLISH_INTERVAL_MS,
  shouldPublishPreviewUiTime,
} from '../utils/previewUiTime';

describe('shouldPublishPreviewUiTime', () => {
  it('初回は必ず公開する', () => {
    expect(shouldPublishPreviewUiTime({
      nowMs: 1000,
      lastPublishAtMs: null,
      timeSec: 0,
      lastPublishedTimeSec: null,
    })).toBe(true);
  });

  it('force なら間隔内でも公開する', () => {
    expect(shouldPublishPreviewUiTime({
      nowMs: 1010,
      lastPublishAtMs: 1000,
      timeSec: 0.01,
      lastPublishedTimeSec: 0,
      force: true,
    })).toBe(true);
  });

  it('通常プレビューでは間隔未満の連続更新を間引く', () => {
    expect(shouldPublishPreviewUiTime({
      nowMs: 1000 + PREVIEW_UI_TIME_PUBLISH_INTERVAL_MS - 1,
      lastPublishAtMs: 1000,
      timeSec: 0.04,
      lastPublishedTimeSec: 0,
    })).toBe(false);
  });

  it('間隔を超えたら公開する', () => {
    expect(shouldPublishPreviewUiTime({
      nowMs: 1000 + PREVIEW_UI_TIME_PUBLISH_INTERVAL_MS,
      lastPublishAtMs: 1000,
      timeSec: 0.05,
      lastPublishedTimeSec: 0,
    })).toBe(true);
  });

  it('シークなど大きな時刻ジャンプはすぐ公開する', () => {
    expect(shouldPublishPreviewUiTime({
      nowMs: 1005,
      lastPublishAtMs: 1000,
      timeSec: PREVIEW_UI_TIME_JUMP_SEC,
      lastPublishedTimeSec: 0,
    })).toBe(true);
  });
});
