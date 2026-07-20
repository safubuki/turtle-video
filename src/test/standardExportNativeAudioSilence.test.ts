/**
 * standard エクスポート中の native 音声漏れ対策のテスト
 *
 * エクスポート中はライブの BGM/ナレーション/動画要素の音声を OfflineAudioContext で
 * 別途生成するため、WebAudio ソースノードを持たない（＝ソースノードでスピーカー出力を
 * 横取りできない）要素をそのまま再生すると、ファイルには入らずスピーカーから音が漏れる。
 * この回帰（エクスポート中に BGM が聞こえる）を防ぐため、キャプチャされない要素は
 * エクスポート中に必ず無音（muted + volume 0）になることを検証する。
 */
import { describe, expect, it } from 'vitest';
import { applyPreviewAudioOutputState } from '../flavors/standard/preview/usePreviewEngine';
import { getPreviewPlatformPolicy } from '../flavors/standard/preview/previewPlatform';

function createFakeMediaElement(tag: 'AUDIO' | 'VIDEO') {
  return {
    tagName: tag,
    muted: false,
    defaultMuted: false,
    volume: 1,
  } as unknown as HTMLMediaElement;
}

const pcPolicy = getPreviewPlatformPolicy({
  isIosSafari: false,
  isAndroid: false,
  audioContextMayInterrupt: false,
});

describe('standard export で captured されない native 音声を無音化する', () => {
  it('エクスポート中・WebAudioノード無しの BGM(audio) は muted + volume 0 になる', () => {
    const el = createFakeMediaElement('AUDIO');
    const mode = applyPreviewAudioOutputState(pcPolicy, el, {
      hasAudioNode: false,
      desiredVolume: 0.8,
      audibleSourceCount: 1,
      isExporting: true,
    });
    // 出力モードは webaudio（エクスポートは常に webaudio ルーティング）
    expect(mode).toBe('webaudio');
    expect(el.muted).toBe(true);
    expect(el.volume).toBe(0);
  });

  it('エクスポート中・WebAudioノード無しの動画要素も無音化する', () => {
    const el = createFakeMediaElement('VIDEO');
    applyPreviewAudioOutputState(pcPolicy, el, {
      hasAudioNode: false,
      desiredVolume: 1,
      audibleSourceCount: 1,
      isExporting: true,
    });
    expect(el.muted).toBe(true);
    expect(el.volume).toBe(0);
  });

  it('プレビュー中（非エクスポート）は従来どおり無音化しない', () => {
    const el = createFakeMediaElement('AUDIO');
    applyPreviewAudioOutputState(pcPolicy, el, {
      hasAudioNode: false,
      desiredVolume: 0.8,
      audibleSourceCount: 1,
      isExporting: false,
    });
    // プレビューは無音化ガードの対象外（既存挙動を維持）
    expect(el.muted).toBe(false);
  });
});
