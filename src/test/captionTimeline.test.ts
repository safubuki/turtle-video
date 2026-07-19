/**
 * captionTimeline（時分割キャプション＝複数行の順次表示）のテスト
 */

import { describe, expect, it } from 'vitest';
import {
  clampSequentialGapSec,
  isCaptionActiveAtTime,
  isSequentialCaption,
  resolveCaptionDisplaySegment,
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

describe('sequential gap (sequentialGapSec)', () => {
  it('inserts gaps between lines and keeps the card start/end', () => {
    // 2文字ずつ 3 行、12 秒、間隔 1 秒 → usable 10 秒を等分（約3.33秒ずつ）
    const caption = makeCaption({
      text: 'ああ\nいい\nうう',
      startTime: 0,
      endTime: 12,
      sequentialGapSec: 1,
    });
    const segments = resolveSequentialCaptionSegments(caption);
    expect(segments).toHaveLength(3);
    expect(segments[0].startTime).toBe(0);
    expect(segments[0].endTime).toBeCloseTo(10 / 3);
    // 2 行目は 1 秒のギャップ後に開始
    expect(segments[1].startTime).toBeCloseTo(10 / 3 + 1);
    expect(segments[2].endTime).toBe(12);
  });

  it('returns null (nothing to draw) during a gap and the line during its segment', () => {
    const caption = makeCaption({
      text: 'ああ\nいい',
      startTime: 0,
      endTime: 10,
      sequentialGapSec: 2,
    });
    // usable 8 秒を 4:4 で分配 → [0,4) 表示 / [4,6) ギャップ / [6,10) 表示
    expect(resolveCaptionDisplayText(caption, 1)).toBe('ああ');
    expect(resolveCaptionDisplayText(caption, 5)).toBeNull();
    expect(resolveCaptionDisplayText(caption, 7)).toBe('いい');
  });

  it('shrinks the gap automatically when the card is too short', () => {
    const caption = makeCaption({
      text: 'ああ\nいい',
      startTime: 0,
      endTime: 0.5,
      sequentialGapSec: 5,
    });
    const segments = resolveSequentialCaptionSegments(caption);
    // 最低表示時間 0.1 秒 ×2 を確保できる範囲まで間隔を縮める
    expect(segments[0].endTime).toBeGreaterThan(segments[0].startTime);
    expect(segments[1].endTime).toBe(0.5);
    expect(segments[1].startTime).toBeLessThan(0.5);
  });

  it('clamps the gap into [0, 5]', () => {
    expect(clampSequentialGapSec(-1)).toBe(0);
    expect(clampSequentialGapSec(99)).toBe(5);
    expect(clampSequentialGapSec(Number.NaN)).toBe(0);
  });
});

describe('resolveCaptionDisplaySegment', () => {
  it('marks sequential segments and exposes the segment range for per-line fades', () => {
    const caption = makeCaption({ text: 'ああ\nいい', startTime: 0, endTime: 10 });
    const segment = resolveCaptionDisplaySegment(caption, 7);
    expect(segment).toMatchObject({ text: 'いい', isSequential: true });
    expect(segment?.startTime).toBeCloseTo(5);
    expect(segment?.endTime).toBe(10);
  });

  it('returns the whole card as non-sequential for single-line text', () => {
    const segment = resolveCaptionDisplaySegment(makeCaption({ text: '一行', startTime: 2, endTime: 6 }), 3);
    expect(segment).toEqual({ text: '一行', startTime: 2, endTime: 6, isSequential: false });
  });
});
