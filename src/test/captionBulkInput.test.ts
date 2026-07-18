/**
 * captionBulkInput（一括キャプション割付）のテスト
 */

import { describe, expect, it } from 'vitest';
import {
  BULK_CAPTION_FIXED_DURATION_SEC,
  formatCaptionsAsBulkText,
  parseBulkCaptionInput,
  parseTimeNotation,
  planBulkCaptions,
  splitCaptionLines,
} from '../utils/captionBulkInput';

describe('splitCaptionLines', () => {
  it('splits lines, trims whitespace, and drops empty lines', () => {
    expect(splitCaptionLines('a\r\n  b  \n\n\nc\n')).toEqual(['a', 'b', 'c']);
    expect(splitCaptionLines('   \n\n')).toEqual([]);
  });
});

describe('planBulkCaptions', () => {
  it('distributes evenly from startTime to the end of the video', () => {
    const plans = planBulkCaptions(['1', '2', '3', '4'], 'even', {
      startTime: 10,
      totalDuration: 30,
    });
    expect(plans).toHaveLength(4);
    expect(plans[0]).toMatchObject({ startTime: 10, endTime: 15 });
    expect(plans[1]).toMatchObject({ startTime: 15, endTime: 20 });
    // 最終行の終了は必ず動画末尾
    expect(plans[3].endTime).toBe(30);
    // 連続配置（隙間なし）
    for (let i = 1; i < plans.length; i += 1) {
      expect(plans[i].startTime).toBeCloseTo(plans[i - 1].endTime);
    }
  });

  it('places fixed-duration captions sequentially and clips at the video end', () => {
    const plans = planBulkCaptions(['a', 'b', 'c'], 'fixed', {
      startTime: 0,
      totalDuration: 7,
    });
    expect(plans[0]).toMatchObject({ startTime: 0, endTime: BULK_CAPTION_FIXED_DURATION_SEC });
    expect(plans[1]).toMatchObject({ startTime: 3, endTime: 6 });
    // 3 行目は残り 1 秒に押し込まれる
    expect(plans[2].startTime).toBe(6);
    expect(plans[2].endTime).toBe(7);
  });

  it('drops lines that no longer fit within the video', () => {
    const plans = planBulkCaptions(['a', 'b', 'c', 'd'], 'fixed', {
      startTime: 0,
      totalDuration: 6.2,
    });
    // 0-3, 3-6, 6-6.2(<0.2 で打ち切り) → 2〜3件
    expect(plans.length).toBeLessThan(4);
    expect(plans[plans.length - 1].endTime).toBeLessThanOrEqual(6.2);
  });

  it('falls back to fixed mode when the remaining time is too short for even split', () => {
    const plans = planBulkCaptions(['a', 'b', 'c'], 'even', {
      startTime: 0,
      totalDuration: 1,
    });
    // 均等割り不可 → 固定秒扱い（末尾クリップ）
    expect(plans.length).toBeGreaterThanOrEqual(1);
    expect(plans[0].startTime).toBe(0);
    expect(plans[plans.length - 1].endTime).toBeLessThanOrEqual(1);
  });

  it('works without a video (totalDuration = 0) using fixed slots', () => {
    const plans = planBulkCaptions(['a', 'b'], 'fixed', {
      startTime: 0,
      totalDuration: 0,
    });
    expect(plans).toEqual([
      { text: 'a', startTime: 0, endTime: 3 },
      { text: 'b', startTime: 3, endTime: 6 },
    ]);
  });

  it('returns empty for no lines', () => {
    expect(planBulkCaptions([], 'even', { startTime: 0, totalDuration: 10 })).toEqual([]);
  });
});

describe('parseTimeNotation', () => {
  it('parses seconds, MM:SS and MM:SS.s formats', () => {
    expect(parseTimeNotation('63.5')).toBeCloseTo(63.5);
    expect(parseTimeNotation('01:03')).toBe(63);
    expect(parseTimeNotation('01:03.5')).toBeCloseTo(63.5);
    expect(parseTimeNotation('1:00:00')).toBe(3600);
  });

  it('rejects invalid formats', () => {
    expect(parseTimeNotation('abc')).toBeNull();
    expect(parseTimeNotation('1:2:3:4')).toBeNull();
    expect(parseTimeNotation('')).toBeNull();
  });
});

describe('parseBulkCaptionInput (time notation)', () => {
  it('parses leading [start-end] notation', () => {
    const lines = parseBulkCaptionInput('[00:03.0-00:07.5] 明日はいい日になるさ');
    expect(lines).toEqual([
      { text: '明日はいい日になるさ', explicitStart: 3, explicitEnd: 7.5 },
    ]);
  });

  it('does not misinterpret symbols in the body text', () => {
    // 本文中の @ や [ ] は時間指定として扱わない
    expect(parseBulkCaptionInput('恋は@（アットマーク）')).toEqual([
      { text: '恋は@（アットマーク）' },
    ]);
    expect(parseBulkCaptionInput('[サビ] ここから盛り上がる')).toEqual([
      { text: '[サビ] ここから盛り上がる' },
    ]);
    // 開始 >= 終了は無効 → 行全体を本文扱い
    expect(parseBulkCaptionInput('[00:10-00:05] 逆転')).toEqual([
      { text: '[00:10-00:05] 逆転' },
    ]);
  });

  it('round-trips through formatCaptionsAsBulkText', () => {
    const captions = [
      { text: '一行目', startTime: 0, endTime: 3.5 },
      { text: '二行目 [注釈]', startTime: 3.8, endTime: 70.2 },
    ];
    const text = formatCaptionsAsBulkText(captions);
    const parsed = parseBulkCaptionInput(text);
    expect(parsed).toEqual([
      { text: '一行目', explicitStart: 0, explicitEnd: 3.5 },
      { text: '二行目 [注釈]', explicitStart: 3.8, explicitEnd: 70.2 },
    ]);
  });
});

describe('planBulkCaptions (gap & explicit times)', () => {
  it('inserts the selected gap between fixed-duration captions', () => {
    const plans = planBulkCaptions(['a', 'b'], 'fixed', {
      startTime: 0,
      totalDuration: 60,
      fixedDurationSec: 3,
      gapSec: 0.3,
    });
    expect(plans[0]).toMatchObject({ startTime: 0, endTime: 3 });
    expect(plans[1]).toMatchObject({ startTime: 3.3, endTime: 6.3 });
  });

  it('inserts the gap in even mode and keeps the last end at the video end', () => {
    const plans = planBulkCaptions(['a', 'b'], 'even', {
      startTime: 0,
      totalDuration: 10,
      gapSec: 0.5,
    });
    // slot = (10 - 0.5) / 2 = 4.75 → 丸めて 4.8
    expect(plans[0].startTime).toBe(0);
    expect(plans[0].endTime).toBeCloseTo(4.8, 1);
    expect(plans[1].startTime).toBeCloseTo(5.3, 1);
    expect(plans[1].endTime).toBe(10);
  });

  it('uses explicit times as-is and continues auto lines after them', () => {
    const lines = parseBulkCaptionInput('自動1\n[00:10-00:15] 明示\n自動2');
    const plans = planBulkCaptions(lines, 'even', {
      startTime: 0,
      totalDuration: 60,
      fixedDurationSec: 3,
      gapSec: 0.5,
    });
    // 明示時間が混在 → even は使わず逐次配置
    expect(plans[0]).toMatchObject({ startTime: 0, endTime: 3 });
    expect(plans[1]).toMatchObject({ startTime: 10, endTime: 15 });
    expect(plans[2]).toMatchObject({ startTime: 15.5, endTime: 18.5 });
  });

  it('respects the custom fixed duration', () => {
    const plans = planBulkCaptions(['a'], 'fixed', {
      startTime: 0,
      totalDuration: 60,
      fixedDurationSec: 5,
    });
    expect(plans[0]).toMatchObject({ startTime: 0, endTime: 5 });
  });
});
