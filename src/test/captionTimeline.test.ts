/**
 * captionTimeline（時分割キャプション＝複数行の順次表示）のテスト
 */

import { describe, expect, it } from 'vitest';
import {
  isCaptionActiveAtTime,
  isSequentialCaption,
  resolveCaptionDisplayText,
  resolveSequentialCaptionSegments,
  splitSequentialCaptionLines,
} from '../utils/captionTimeline';
import type { Caption } from '../types';

const makeCaption = (overrides: Partial<Caption>): Caption => ({
  id: 'c1',
  text: 'テスト',
  startTime: 0,
  endTime: 10,
  fadeIn: false,
  fadeOut: false,
  fadeInDuration: 0.5,
  fadeOutDuration: 0.5,
  ...overrides,
});

describe('isCaptionActiveAtTime', () => {
  it('is active in [startTime, endTime)', () => {
    const caption = makeCaption({ startTime: 2, endTime: 5 });
    expect(isCaptionActiveAtTime(caption, 2)).toBe(true);
    expect(isCaptionActiveAtTime(caption, 4.99)).toBe(true);
    expect(isCaptionActiveAtTime(caption, 5)).toBe(false);
  });
});

describe('splitSequentialCaptionLines / isSequentialCaption', () => {
  it('splits on newlines and drops empty lines', () => {
    expect(splitSequentialCaptionLines('a\n\n  b  \nc')).toEqual(['a', 'b', 'c']);
  });

  it('detects sequential captions only for 2+ lines', () => {
    expect(isSequentialCaption({ text: '一行だけ' })).toBe(false);
    expect(isSequentialCaption({ text: '一行目\n二行目' })).toBe(true);
    expect(isSequentialCaption({ text: '一行目\n\n' })).toBe(false);
  });
});

describe('resolveSequentialCaptionSegments', () => {
  it('returns the whole card as one segment for single-line text', () => {
    const segments = resolveSequentialCaptionSegments(makeCaption({ text: 'こんにちは', startTime: 1, endTime: 4 }));
    expect(segments).toEqual([{ text: 'こんにちは', startTime: 1, endTime: 4 }]);
  });

  it('allocates time proportionally to character count without gaps', () => {
    // 4文字 / 8文字 / 4文字 → 12秒を 3 : 6 : 3 で配分
    const caption = makeCaption({ text: 'あいうえ\nかきくけこさしす\nたちつて', startTime: 0, endTime: 12 });
    const segments = resolveSequentialCaptionSegments(caption);
    expect(segments).toHaveLength(3);
    expect(segments[0].startTime).toBe(0);
    expect(segments[0].endTime).toBeCloseTo(3);
    expect(segments[1].startTime).toBeCloseTo(3);
    expect(segments[1].endTime).toBeCloseTo(9);
    expect(segments[2].startTime).toBeCloseTo(9);
    // 最終行の終了は必ずカードの終了時刻
    expect(segments[2].endTime).toBe(12);
  });

  it('respects the card offset (startTime > 0)', () => {
    const caption = makeCaption({ text: 'ああ\nいい', startTime: 10, endTime: 14 });
    const segments = resolveSequentialCaptionSegments(caption);
    expect(segments[0]).toMatchObject({ startTime: 10, endTime: 12 });
    expect(segments[1]).toMatchObject({ startTime: 12, endTime: 14 });
  });
});

describe('resolveCaptionDisplayText', () => {
  const caption = makeCaption({
    text: 'この工場では\n最先端の生産設備で\n効率的に開発をしています',
    startTime: 0,
    endTime: 12,
  });

  it('returns the line whose segment contains the time', () => {
    expect(resolveCaptionDisplayText(caption, 0)).toBe('この工場では');
    expect(resolveCaptionDisplayText(caption, 6)).toBe('最先端の生産設備で');
    expect(resolveCaptionDisplayText(caption, 11.9)).toBe('効率的に開発をしています');
  });

  it('clamps out-of-range times to the first/last line', () => {
    expect(resolveCaptionDisplayText(caption, -1)).toBe('この工場では');
    expect(resolveCaptionDisplayText(caption, 99)).toBe('効率的に開発をしています');
  });

  it('returns single-line text as-is', () => {
    expect(resolveCaptionDisplayText(makeCaption({ text: 'そのまま' }), 5)).toBe('そのまま');
  });
});
