import { describe, expect, it } from 'vitest';
import {
  resolveExportStrategyOrder,
  resolveWebCodecsAudioCaptureStrategy,
  shouldUseOfflineAudioPreRender,
  shouldWarmupOfflineAudioFallback,
} from '../hooks/export-strategies/exportStrategyResolver';

describe('resolveExportStrategyOrder', () => {
  it('iOS Safari かつ MediaRecorder MP4 が使える場合は iOS 戦略を優先する', () => {
    expect(
      resolveExportStrategyOrder({
        isIosSafari: true,
        supportedMediaRecorderProfile: {
          mimeType: 'video/mp4',
          extension: 'mp4',
        },
      })
    ).toEqual(['ios-safari-mediarecorder', 'webcodecs-mp4']);
  });

  it('iOS Safari でも MediaRecorder が使えない場合は WebCodecs のみ返す', () => {
    expect(
      resolveExportStrategyOrder({
        isIosSafari: true,
        supportedMediaRecorderProfile: null,
      })
    ).toEqual(['webcodecs-mp4']);
  });

  it('非 iOS Safari では WebCodecs を既定戦略にする', () => {
    expect(
      resolveExportStrategyOrder({
        isIosSafari: false,
        supportedMediaRecorderProfile: {
          mimeType: 'video/mp4',
          extension: 'mp4',
        },
      })
    ).toEqual(['webcodecs-mp4']);
  });
});

describe('resolveWebCodecsAudioCaptureStrategy', () => {
  it('オフライン音声が完了していれば追加の音声キャプチャを行わない', () => {
    expect(
      resolveWebCodecsAudioCaptureStrategy({
        offlineAudioDone: true,
        isIosSafari: false,
        hasLiveAudioTrack: true,
        canUseTrackProcessor: true,
      })
    ).toBe('pre-rendered');
  });

  it('非 iOS かつ TrackProcessor 対応時は TrackProcessor を選ぶ', () => {
    expect(
      resolveWebCodecsAudioCaptureStrategy({
        offlineAudioDone: false,
        isIosSafari: false,
        hasLiveAudioTrack: true,
        canUseTrackProcessor: true,
      })
    ).toBe('track-processor');
  });
  it('非 iOS でも audio track が live でなければ TrackProcessor を選ばない', () => {
    expect(
      resolveWebCodecsAudioCaptureStrategy({
        offlineAudioDone: false,
        isIosSafari: false,
        hasLiveAudioTrack: false,
        canUseTrackProcessor: true,
      })
    ).toBe('script-processor');
  });

  it('iOS Safari では ScriptProcessor フォールバックを維持する', () => {
    expect(
      resolveWebCodecsAudioCaptureStrategy({
        offlineAudioDone: false,
        isIosSafari: true,
        hasLiveAudioTrack: true,
        canUseTrackProcessor: true,
      })
    ).toBe('script-processor');
  });

  it('非 iOS でも音声トラックまたは TrackProcessor が無ければ ScriptProcessor を選ぶ', () => {
    expect(
      resolveWebCodecsAudioCaptureStrategy({
        offlineAudioDone: false,
        isIosSafari: false,
        hasLiveAudioTrack: false,
        canUseTrackProcessor: true,
      })
    ).toBe('script-processor');
  });
});

describe('shouldUseOfflineAudioPreRender', () => {
  it('iOS Safari かつ音声ソースありのときは OfflineAudioContext を使う', () => {
    expect(
      shouldUseOfflineAudioPreRender({
        hasAudioSources: true,
        isIosSafari: true,
      })
    ).toBe(true);
  });

  it('iOS Safari では live でない track でも事前プリレンダリングを維持する', () => {
    expect(
      shouldUseOfflineAudioPreRender({
        hasAudioSources: true,
        isIosSafari: true,
      })
    ).toBe(true);
  });

  it('非iOS では live track が無くても事前プリレンダリングしない', () => {
    expect(
      shouldUseOfflineAudioPreRender({
        hasAudioSources: true,
        isIosSafari: false,
      })
    ).toBe(false);
  });

  it('非iOS では TrackProcessor が無くても事前プリレンダリングしない', () => {
    expect(
      shouldUseOfflineAudioPreRender({
        hasAudioSources: true,
        isIosSafari: false,
      })
    ).toBe(false);
  });

  it('非iOS で音声トラックと TrackProcessor がそろっていても事前プリレンダリングしない', () => {
    expect(
      shouldUseOfflineAudioPreRender({
        hasAudioSources: true,
        isIosSafari: false,
      })
    ).toBe(false);
  });

  it('iOS Safari でも音声ソースが無ければ OfflineAudioContext を使わない', () => {
    expect(
      shouldUseOfflineAudioPreRender({
        hasAudioSources: false,
        isIosSafari: true,
      })
    ).toBe(false);
  });

  it('非iOS でも音声ソースが無ければ OfflineAudioContext を使わない', () => {
    expect(
      shouldUseOfflineAudioPreRender({
        hasAudioSources: false,
        isIosSafari: false,
      })
    ).toBe(false);
  });
});

describe('shouldWarmupOfflineAudioFallback', () => {
  it('非iOS かつ音声ソースありのときは裏でフォールバック準備を始める', () => {
    expect(
      shouldWarmupOfflineAudioFallback({
        hasAudioSources: true,
        isIosSafari: false,
      })
    ).toBe(true);
  });

  it('iOS Safari では warmup ではなく事前プリレンダリング側で扱う', () => {
    expect(
      shouldWarmupOfflineAudioFallback({
        hasAudioSources: true,
        isIosSafari: true,
      })
    ).toBe(false);
  });

  it('音声ソースが無ければ warmup しない', () => {
    expect(
      shouldWarmupOfflineAudioFallback({
        hasAudioSources: false,
        isIosSafari: false,
      })
    ).toBe(false);
  });
});
