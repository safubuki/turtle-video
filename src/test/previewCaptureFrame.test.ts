/**
 * @file previewCaptureFrame.test.ts
 * @description プレビュー画像キャプチャのフレーム一致ロジックのテスト。
 *
 * 「シークバーは終端なのに保存画像が 1 フレーム前になる」不具合の回帰防止。
 * 終端到達（再生し切り）と途中停止の双方で、描画時刻と video のソース時刻が
 * 現在位置に一致することを検証する。
 */
import { describe, it, expect } from 'vitest';
import type { MediaItem } from '../types';
import {
  CAPTURE_DISPLAY_CLAMP_EPSILON_SEC,
  resolveCaptureFrameTarget,
  resolveCaptureRenderTime,
} from '../utils/previewCaptureFrame';

function makeVideoItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'v1',
    type: 'video',
    file: null as unknown as File,
    url: 'blob:v1',
    duration: 9.54,
    originalDuration: 9.54,
    trimStart: 0,
    trimEnd: 9.54,
    volume: 1,
    isMuted: false,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 1,
    fadeOutDuration: 1,
    scale: 1,
    positionX: 0,
    positionY: 0,
    ...overrides,
  } as MediaItem;
}

function makeImageItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return makeVideoItem({ id: 'i1', type: 'image', duration: 3, ...overrides });
}

describe('resolveCaptureRenderTime', () => {
  it('終端スナップ後（currentTime === totalDuration）でも描画可能な最大時刻へ丸める', () => {
    // finalizePreviewAtTimelineEnd は currentTime を総尺そのものへスナップするが、
    // 描画側は総尺 - ε までしか描けない。ここを一致させるのが目的。
    expect(resolveCaptureRenderTime(9.54, 9.54)).toBeCloseTo(9.54 - CAPTURE_DISPLAY_CLAMP_EPSILON_SEC, 6);
  });

  it('総尺を超える値もクランプする', () => {
    expect(resolveCaptureRenderTime(12, 9.54)).toBeCloseTo(9.539, 6);
  });

  it('途中位置はそのまま返す', () => {
    expect(resolveCaptureRenderTime(4.2, 9.54)).toBe(4.2);
  });

  it('負値・総尺 0 でも 0 以上を返す', () => {
    expect(resolveCaptureRenderTime(-1, 9.54)).toBe(0);
    expect(resolveCaptureRenderTime(3, 0)).toBe(3);
    expect(resolveCaptureRenderTime(Number.NaN, 9.54)).toBe(0);
  });
});

describe('resolveCaptureFrameTarget', () => {
  it('終端で再生し切った直後は、最後のクリップの終端ソース時刻を狙う（1 フレーム前にしない）', () => {
    const items = [makeVideoItem()];
    const target = resolveCaptureFrameTarget(items, 9.54, 9.54);

    expect(target.isTimelineEnd).toBe(true);
    expect(target.videoId).toBe('v1');
    // trimEnd - ε。デコーダが最終フレームを保持できる位置。
    expect(target.videoSourceTime).toBeCloseTo(9.539, 6);
    expect(target.renderTime).toBeCloseTo(9.539, 6);
  });

  it('途中で停止した位置は、その時刻に対応するソース時刻を狙う', () => {
    const items = [makeVideoItem()];
    const target = resolveCaptureFrameTarget(items, 4.0, 9.54);

    expect(target.isTimelineEnd).toBe(false);
    expect(target.videoId).toBe('v1');
    expect(target.videoSourceTime).toBeCloseTo(4.0, 6);
    expect(target.renderTime).toBeCloseTo(4.0, 6);
  });

  it('trimStart がある動画は、ソース時刻に trimStart を加算する', () => {
    const items = [makeVideoItem({ trimStart: 2, trimEnd: 11.54, duration: 9.54 })];
    const target = resolveCaptureFrameTarget(items, 4.0, 9.54);

    expect(target.videoSourceTime).toBeCloseTo(6.0, 6);
  });

  it('倍速クリップはソース時刻へ速度を反映する', () => {
    const items = [makeVideoItem({ playbackSpeed: 2, duration: 5, trimEnd: 10 } as Partial<MediaItem>)];
    const target = resolveCaptureFrameTarget(items, 2.0, 5);

    // localTime 2.0 秒 × 2 倍速 = ソース 4.0 秒
    expect(target.videoSourceTime).toBeCloseTo(4.0, 6);
  });

  it('複数クリップでは現在位置が属するクリップを対象にする', () => {
    const items = [
      makeVideoItem({ id: 'a', duration: 4, trimEnd: 4 }),
      makeVideoItem({ id: 'b', duration: 6, trimStart: 1, trimEnd: 7 }),
    ];
    const target = resolveCaptureFrameTarget(items, 5.0, 10);

    expect(target.videoId).toBe('b');
    // b のローカル 1.0 秒 + trimStart 1 = ソース 2.0 秒
    expect(target.videoSourceTime).toBeCloseTo(2.0, 6);
  });

  it('終端が画像クリップなら video のシーク対象は無し（描画時刻だけ返す）', () => {
    const items = [makeVideoItem({ duration: 4, trimEnd: 4 }), makeImageItem({ duration: 3 })];
    const target = resolveCaptureFrameTarget(items, 7, 7);

    expect(target.videoId).toBeNull();
    expect(target.videoSourceTime).toBeNull();
    expect(target.renderTime).toBeCloseTo(6.999, 6);
  });

  it('メディアが無い場合も安全に解決する', () => {
    const target = resolveCaptureFrameTarget([], 0, 0);
    expect(target.videoId).toBeNull();
    expect(target.videoSourceTime).toBeNull();
    expect(target.renderTime).toBe(0);
  });
});
