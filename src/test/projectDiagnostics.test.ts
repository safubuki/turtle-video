/**
 * @file projectDiagnostics.test.ts
 * @description 解析用の設定レポートが、調査に必要な値だけを出し、本文・内部情報を出さないことを固定する。
 */
import { describe, expect, it } from 'vitest';
import type { MediaItem, NarrationClip } from '../types';
import { buildProjectDiagnostics } from '../utils/projectDiagnostics';

const makeVideo = (overrides: Partial<MediaItem>): MediaItem => ({
  id: 'internal-video-id',
  file: new File([''], 'clip.mp4', { type: 'video/mp4' }),
  type: 'video',
  url: 'blob:secret-url',
  volume: 1,
  isMuted: false,
  fadeIn: false,
  fadeOut: false,
  fadeInDuration: 1,
  fadeOutDuration: 1,
  duration: 10,
  originalDuration: 10,
  trimStart: 0,
  trimEnd: 10,
  scale: 1.3,
  positionX: 12,
  positionY: 34,
  isTransformOpen: false,
  isLocked: false,
  audioNormalizeGain: 1.7,
  ...overrides,
});

const makeAudio = (overrides: Partial<NarrationClip>): NarrationClip => ({
  id: 'bgmclip_internal',
  sourceType: 'file',
  file: new File([''], 'song.mp3', { type: 'audio/mpeg' }),
  url: 'blob:secret-audio',
  startTime: 0,
  volume: 1.6,
  isMuted: false,
  trimStart: 0,
  trimEnd: 60,
  duration: 60,
  isAiEditable: false,
  fadeIn: true,
  fadeInDuration: 1,
  ...overrides,
});

function build() {
  return buildProjectDiagnostics({
    mediaItems: [
      makeVideo({
        file: new File([''], 'a.mp4'),
        duration: 8,
        originalDuration: 8,
        trimEnd: 4,
        playbackSpeed: 0.5,
        isMuted: true,
        transitionToNext: { type: 'dissolve', duration: 2 },
      }),
      makeVideo({ file: new File([''], 'b.mp4'), trimStart: 1.5, trimEnd: 11.5, originalDuration: 15 }),
    ],
    bgmClips: [makeAudio({})],
    narrations: [
      makeAudio({
        id: 'narration_internal',
        file: { name: 'voice.wav' },
        startTime: 3,
        trimEnd: 4,
        duration: 4,
        volume: 1,
        fadeIn: false,
        aiScript: '秘密の原稿',
        aiVoice: 'secret-voice',
      }),
    ],
    captions: [{ startTime: 1, endTime: 6.5, text: '秘密の字幕' } as never],
    bgmFitToVideoEnd: true,
    endrollSeconds: 0,
    output: { width: 1280, height: 720, orientation: 'landscape', fps: 30 },
    appVersion: '6.0.3',
    generatedAt: new Date('2026-11-01T00:00:00Z'),
  });
}

describe('buildProjectDiagnostics', () => {
  it('クリップの区間・トリム・速度・ミュート・ディゾルブを画面と同じ値で出す', () => {
    const report = build();
    expect(report.timeline).toEqual({ clipsSeconds: 16, endrollSeconds: 0, totalSeconds: 16 });
    expect(report.clips[0]).toMatchObject({
      no: 1, kind: 'video', fileName: 'a.mp4', start: 0, end: 8,
      trimIn: 0, trimOut: 4, speed: 0.5, mute: true, volumePercent: 100,
      fadeIn: null, transition: { type: 'dissolve', seconds: 2 },
    });
    // ディゾルブで 2 秒重なり、次クリップは 6 秒から
    expect(report.clips[1]).toMatchObject({ no: 2, start: 6, end: 16, trimIn: 1.5, trimOut: 11.5 });
    expect(report.clips[1].transition).toBeNull();
  });

  it('BGM／ナレーションの配置と実際に鳴る区間、キャプションの区間を出す', () => {
    const report = build();
    expect(report.bgm.fitToVideoEnd).toBe(true);
    expect(report.bgm.clips[0]).toMatchObject({
      fileName: 'song.mp3', start: 0, playStart: 0, playEnd: 16, volumePercent: 160, fadeIn: 1,
    });
    expect(report.narrations[0]).toMatchObject({ start: 3, playStart: 3, playEnd: 7 });
    expect(report.narrations[0]).not.toHaveProperty('fileName');
    expect(report.captions).toEqual([{ no: 1, start: 1, end: 6.5 }]);
  });

  it('本文・原稿・内部 ID・URL・見た目の調整値・内部の計算値を含めない', () => {
    const json = JSON.stringify(build());
    for (const secret of [
      '秘密の字幕', '秘密の原稿', 'secret-voice', 'internal', 'blob:',
    ]) {
      expect(json).not.toContain(secret);
    }
    // 内部のプロパティ名をそのまま出さない
    for (const internalKey of [
      'trimStart', 'trimEnd', 'playbackSpeed', 'isMuted', 'originalDuration', 'transitionToNext',
      'audioNormalizeGain', 'scale', 'positionX', 'aiScript', 'overlap', 'isDisabled', 'effective',
      '"id"', '"url"',
    ]) {
      expect(json).not.toContain(internalKey);
    }
  });
});
