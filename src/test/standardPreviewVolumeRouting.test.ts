/**
 * standard preview の音声ルーティング（音量増幅対応）のテスト
 *
 * HTMLMediaElement.volume は 1.0 が上限のため、100% 超（最大250%）の音量設定は
 * native 経路では反映できない。増幅が設定された動画だけ WebAudio 経路へ
 * ルーティングされることを検証する（100% 以下は従来どおり native で挙動不変）。
 */

import { describe, expect, it } from 'vitest';
import {
  getPreviewAudioOutputMode,
  getPreviewPlatformPolicy,
} from '../flavors/standard/preview/previewPlatform';
import { getStandardPreviewPlatformCapabilities } from '../flavors/standard/standardPreviewRuntime';

const policy = getPreviewPlatformPolicy(getStandardPreviewPlatformCapabilities({
  userAgent: 'test-agent',
  platform: 'test-platform',
  maxTouchPoints: 0,
  isAndroid: true,
  isIOS: false,
  isSafari: false,
  isIosSafari: false,
  supportsShowSaveFilePicker: false,
  supportsShowOpenFilePicker: false,
  supportsTrackProcessor: true,
  supportsMp4MediaRecorder: false,
  audioContextMayInterrupt: false,
  supportedMediaRecorderProfile: null,
  trackProcessorCtor: undefined,
}));

describe('standard preview volume routing', () => {
  it('keeps videos at or below 100% on the native route (unchanged behavior)', () => {
    expect(getPreviewAudioOutputMode(policy, {
      hasAudioNode: false,
      isExporting: false,
      audibleSourceCount: 1,
      desiredVolume: 1,
      sourceType: 'video',
    })).toBe('native');
    expect(getPreviewAudioOutputMode(policy, {
      hasAudioNode: false,
      isExporting: false,
      audibleSourceCount: 1,
      desiredVolume: 0.3,
      sourceType: 'video',
    })).toBe('native');
  });

  it('routes amplified (>100%) videos to webaudio so the gain can apply', () => {
    expect(getPreviewAudioOutputMode(policy, {
      hasAudioNode: false,
      isExporting: false,
      audibleSourceCount: 1,
      desiredVolume: 2.5,
      sourceType: 'video',
    })).toBe('webaudio');
    // ノード接続済みで単独音源でも、増幅中は webaudio を維持する
    expect(getPreviewAudioOutputMode(policy, {
      hasAudioNode: true,
      isExporting: false,
      audibleSourceCount: 1,
      desiredVolume: 1.5,
      sourceType: 'video',
    })).toBe('webaudio');
  });

  it('uses baseVolume (pre-fade) to keep the route stable during fades', () => {
    // フェード中で瞬間音量が 0.4 でも、基準音量が 200% なら webaudio を維持
    expect(getPreviewAudioOutputMode(policy, {
      hasAudioNode: true,
      isExporting: false,
      audibleSourceCount: 1,
      desiredVolume: 0.4,
      baseVolume: 2.0,
      sourceType: 'video',
    })).toBe('webaudio');
    // 基準音量 100% ならフェード中も native のまま
    expect(getPreviewAudioOutputMode(policy, {
      hasAudioNode: false,
      isExporting: false,
      audibleSourceCount: 1,
      desiredVolume: 0.4,
      baseVolume: 1.0,
      sourceType: 'video',
    })).toBe('native');
  });

  it('keeps BGM/narration (audio) on webaudio as before', () => {
    expect(getPreviewAudioOutputMode(policy, {
      hasAudioNode: true,
      isExporting: false,
      audibleSourceCount: 2,
      desiredVolume: 2.5,
      sourceType: 'audio',
    })).toBe('webaudio');
  });
});
