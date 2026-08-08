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
import {
  clampPreviewAudioGain,
  resolvePreviewAudioGain,
} from '../flavors/standard/preview/usePreviewAudioSession';
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

  /**
   * 経路ラッチ: 一度 WebAudio ノードを持った要素は native へ戻さない。
   *
   * createMediaElementSource() は同一要素に 1 回しか呼べない不可逆操作のため、
   * 100% を跨ぐ音量変更のたびに attach/detach を往復するとメディアパイプラインの
   * 再構成でデコードが止まり、プレビューがカクつく（音量を頻繁に変えたときだけ発生）。
   */
  describe('route latching (volume-change stutter regression)', () => {
    it('never returns to native once the element has a WebAudio node', () => {
      // 250% → 60% へ下げても webaudio を維持する（detach させない）
      expect(getPreviewAudioOutputMode(policy, {
        hasAudioNode: true,
        isExporting: false,
        audibleSourceCount: 1,
        desiredVolume: 0.6,
        baseVolume: 0.6,
        sourceType: 'video',
      })).toBe('webaudio');

      // ちょうど 100% でも webaudio のまま（境界での往復を防ぐ）
      expect(getPreviewAudioOutputMode(policy, {
        hasAudioNode: true,
        isExporting: false,
        audibleSourceCount: 1,
        desiredVolume: 1,
        baseVolume: 1,
        sourceType: 'video',
      })).toBe('webaudio');

      // ミュート（0%）でも webaudio のまま。gain=0 で表現する
      expect(getPreviewAudioOutputMode(policy, {
        hasAudioNode: true,
        isExporting: false,
        audibleSourceCount: 0,
        desiredVolume: 0,
        baseVolume: 0,
        sourceType: 'video',
      })).toBe('webaudio');
    });

    it('stays on webaudio across an aggressive 100%-crossing volume sweep', () => {
      // 100% → 250% で webaudio へ昇格したあと、100% を何度跨いでも経路が揺れないこと
      const sweep = [1.0, 2.5, 0.6, 1.8, 0.3, 2.0, 1.0];
      let hasAudioNode = false;

      for (const volume of sweep) {
        const mode = getPreviewAudioOutputMode(policy, {
          hasAudioNode,
          isExporting: false,
          audibleSourceCount: 1,
          desiredVolume: volume,
          baseVolume: volume,
          sourceType: 'video',
        });
        if (mode === 'webaudio') {
          hasAudioNode = true;
        }
        // 一度 webaudio になったら native へ戻らない
        expect(mode).toBe(hasAudioNode ? 'webaudio' : 'native');
      }

      expect(hasAudioNode).toBe(true);
    });

    it('still starts on native for videos that never exceed 100% (unchanged behavior)', () => {
      // 増幅を一度も使わないプロジェクトは従来どおり native のまま（ノードを作らない）
      const sweep = [1.0, 0.8, 0.5, 1.0, 0.2];
      for (const volume of sweep) {
        expect(getPreviewAudioOutputMode(policy, {
          hasAudioNode: false,
          isExporting: false,
          audibleSourceCount: 1,
          desiredVolume: volume,
          baseVolume: volume,
          sourceType: 'video',
        })).toBe('native');
      }
    });
  });

  /**
   * BGM / ナレーション（sourceType='audio'）が動画と同じカクつき問題を持たないことの確認。
   *
   * 音声トラックは音量に関係なく常に webaudio 経路のため、動画のような
   * native <-> webaudio の往復（createMediaElementSource の attach/detach）が構造的に起きない。
   * 音量をアグレッシブに変えても経路が揺れないことを回帰として固定する。
   */
  describe('BGM / narration are immune to volume-driven route churn', () => {
    it('always uses webaudio regardless of volume, node state, or source count', () => {
      const volumes = [0, 0.3, 0.6, 1.0, 1.8, 2.5];
      for (const volume of volumes) {
        for (const hasAudioNode of [false, true]) {
          for (const audibleSourceCount of [0, 1, 3]) {
            expect(getPreviewAudioOutputMode(policy, {
              hasAudioNode,
              isExporting: false,
              audibleSourceCount,
              desiredVolume: volume,
              baseVolume: volume,
              sourceType: 'audio',
            })).toBe('webaudio');
          }
        }
      }
    });

    it('never flips route across an aggressive 100%-crossing sweep', () => {
      // 動画で問題になったのと同じスイープを音声トラックに適用しても経路は一定
      const sweep = [1.0, 2.5, 0.6, 1.8, 0.3, 2.0, 1.0];
      const modes = sweep.map((volume) => getPreviewAudioOutputMode(policy, {
        hasAudioNode: true,
        isExporting: false,
        audibleSourceCount: 2,
        desiredVolume: volume,
        baseVolume: volume,
        sourceType: 'audio',
      }));

      expect(new Set(modes).size).toBe(1);
      expect(modes[0]).toBe('webaudio');
    });

    it('clamps gain to the 250% ceiling instead of switching routes', () => {
      // 増幅は経路切替ではなく gain で表現する。上限 250%、下限 0 でクランプされる。
      expect(clampPreviewAudioGain(2.5)).toBe(2.5);
      expect(clampPreviewAudioGain(9)).toBe(2.5);
      expect(clampPreviewAudioGain(-1)).toBe(0);
    });

    it('keeps amplified gain finite and clamped while fades are applied', () => {
      // 250% + フェード中でも NaN/Infinity や上限超えを出さない（gain 発振・無音化の防止）
      const base = 2.5;
      for (let t = 0; t <= 10; t += 0.5) {
        const gain = resolvePreviewAudioGain({
          baseVolume: base,
          time: t,
          startTime: 0,
          totalDuration: 10,
          fadeIn: true,
          fadeOut: true,
          fadeInDuration: 1,
          fadeOutDuration: 1,
        });
        expect(Number.isFinite(gain)).toBe(true);
        expect(gain).toBeGreaterThanOrEqual(0);
        expect(gain).toBeLessThanOrEqual(2.5);
      }
    });
  });
});
