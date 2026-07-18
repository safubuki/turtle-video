/**
 * captionBulkInput（一括キャプション割付）のテスト
 */

import { describe, expect, it } from 'vitest';
import {
  BULK_CAPTION_FIXED_DURATION_SEC,
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
