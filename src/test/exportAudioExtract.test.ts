import { describe, expect, it } from 'vitest';
import {
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
