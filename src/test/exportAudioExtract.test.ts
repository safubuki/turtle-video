import { describe, expect, it } from 'vitest';
import {
  estimateCapturePrerollSec,
  resolveCapturePrerollAlignment,
  resolveExportAudioBufferOffsetSec,
  resolveExportClipAudioExtractRange,
  shouldPreferRangeAudioExtract,
} from '../utils/exportAudioExtract';

describe('resolveExportClipAudioExtractRange', () => {
  it('トリム済み動画は開始と必要尺だけを返す', () => {
    expect(resolveExportClipAudioExtractRange({
      originalDuration: 40,
      trimStart: 5,
      trimEnd: 12,
      duration: 7,
    })).toEqual({
      startSec: 5,
      durationSec: 7,
      originalDurationSec: 40,
    });
  });
});

describe('shouldPreferRangeAudioExtract', () => {
  it('長い素材を短く切ったときは区間抽出を優先する', () => {
    expect(shouldPreferRangeAudioExtract({
      originalDurationSec: 40,
      neededDurationSec: 7,
    })).toBe(true);
  });

  it('ほぼ全尺を使うときは全ファイル decode を維持する', () => {
    expect(shouldPreferRangeAudioExtract({
      originalDurationSec: 40,
      neededDurationSec: 38,
    })).toBe(false);
    expect(shouldPreferRangeAudioExtract({
      originalDurationSec: 7,
      neededDurationSec: 7,
    })).toBe(false);
  });
});

describe('resolveExportAudioBufferOffsetSec', () => {
  it('区間抽出済みなら trimStart を足さない', () => {
    expect(resolveExportAudioBufferOffsetSec({
      trimStart: 5,
      usedRangeExtract: true,
    })).toBe(0);
  });

  it('全ファイル decode なら trimStart から再生する', () => {
    expect(resolveExportAudioBufferOffsetSec({
      trimStart: 5,
      usedRangeExtract: false,
    })).toBe(5);
  });
});

describe('estimateCapturePrerollSec（<video> 抽出の先頭無音）', () => {
  it('録音秒数と再生位置の差の中央値を返す（開始 5 秒・再生前に 0.3 秒録音）', () => {
    const observations = [
      { capturedSec: 0.385, mediaTimeSec: 5.085 },
      { capturedSec: 0.47, mediaTimeSec: 5.17 },
      { capturedSec: 0.555, mediaTimeSec: 5.31 }, // currentTime の更新が先行した外れ値
      { capturedSec: 0.64, mediaTimeSec: 5.34 },
      { capturedSec: 0.725, mediaTimeSec: 5.425 },
    ];
    expect(estimateCapturePrerollSec(observations, 5)).toBeCloseTo(0.3, 6);
  });

  it('開始 0 秒（全体抽出）でも同じ基準で求める', () => {
    expect(estimateCapturePrerollSec([{ capturedSec: 0.9, mediaTimeSec: 0.4 }], 0)).toBeCloseTo(0.5, 6);
  });

  it('観測なし・非有限値のみ・極端な値は null（補正しない）', () => {
    expect(estimateCapturePrerollSec([], 0)).toBeNull();
    expect(estimateCapturePrerollSec([{ capturedSec: Number.NaN, mediaTimeSec: 1 }], 0)).toBeNull();
    expect(estimateCapturePrerollSec([{ capturedSec: 20, mediaTimeSec: 1 }], 0)).toBeNull();
  });
});

describe('resolveCapturePrerollAlignment', () => {
  it('先頭無音ぶんを捨てる', () => {
    expect(resolveCapturePrerollAlignment(0.25, 48000, 96000)).toEqual({ dropFrames: 12000, padFrames: 0 });
  });

  it('録音より多くは捨てない', () => {
    expect(resolveCapturePrerollAlignment(3, 48000, 4096)).toEqual({ dropFrames: 4096, padFrames: 0 });
  });

  it('再生位置が抽出開始より後ろから始まったら無音を足す（上限 0.5 秒）', () => {
    expect(resolveCapturePrerollAlignment(-0.1, 48000, 96000)).toEqual({ dropFrames: 0, padFrames: 4800 });
    expect(resolveCapturePrerollAlignment(-2, 48000, 96000)).toEqual({ dropFrames: 0, padFrames: 24000 });
  });

  it('推定なしなら従来どおり何もしない', () => {
    expect(resolveCapturePrerollAlignment(null, 48000, 96000)).toEqual({ dropFrames: 0, padFrames: 0 });
  });
});
