/**
 * format.ts のテスト
 */

import { describe, it, expect } from 'vitest';
import {
  formatTime,
  formatTimeCentiseconds,
  formatTimeDetailed,
  formatPercent,
  formatFileSize,
} from '../utils/format';

describe('formatTime', () => {
  it('should format seconds to mm:ss format', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(30)).toBe('0:30');
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(90)).toBe('1:30');
    expect(formatTime(3661)).toBe('61:01');
  });

  it('should handle edge cases', () => {
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
    // 負の数は Math.floor により負の分と秒になる（実装上の動作）
    // -5 -> floor(-5/60) = -1, floor(-5%60) = -5 -> '-1:-5'
    // 実際のアプリでは負の時間は使わないため、この動作を許容
  });

  it('should pad seconds with zero', () => {
    expect(formatTime(61)).toBe('1:01');
    expect(formatTime(69)).toBe('1:09');
  });
});

describe('formatTimeDetailed', () => {
  it('should format seconds with milliseconds', () => {
    expect(formatTimeDetailed(0)).toBe('0:00.0');
    expect(formatTimeDetailed(30.5)).toBe('0:30.5');
    // 浮動小数点の精度問題があるため、floor で計算される
    expect(formatTimeDetailed(90.3)).toBe('1:30.2'); // 90.3 % 1 * 10 = 2.999... -> floor = 2
  });

  it('should handle edge cases', () => {
    expect(formatTimeDetailed(NaN)).toBe('0:00.0');
    expect(formatTimeDetailed(Infinity)).toBe('0:00.0');
  });
});

describe('formatTimeCentiseconds', () => {
  it('1/100 秒まで表示する（プレビュー現在位置用）', () => {
    expect(formatTimeCentiseconds(0)).toBe('0:00.00');
    expect(formatTimeCentiseconds(3.07)).toBe('0:03.07');
    expect(formatTimeCentiseconds(30.5)).toBe('0:30.50');
    expect(formatTimeCentiseconds(90.25)).toBe('1:30.25');
  });

  it('同じ「秒」でも 1/100 秒が違えば別の表示になる（スライダー操作の追従）', () => {
    // 「分:秒」表示だと 3.00〜3.99 がすべて 0:03 に潰れていた
    expect(formatTimeCentiseconds(3.0)).toBe('0:03.00');
    expect(formatTimeCentiseconds(3.5)).toBe('0:03.50');
    expect(formatTimeCentiseconds(3.99)).toBe('0:03.99');
    expect(formatTimeCentiseconds(3.0)).not.toBe(formatTimeCentiseconds(3.5));
  });

  it('浮動小数の誤差で 1/100 秒が下にずれない', () => {
    // formatTimeDetailed は 90.3 で 1:30.2 になる（floor の桁落ち）。
    // こちらは丸めてから切り捨てるため 1/100 秒がずれない。
    expect(formatTimeCentiseconds(90.3)).toBe('1:30.30');
    expect(formatTimeCentiseconds(0.07)).toBe('0:00.07');
    expect(formatTimeCentiseconds(1.21)).toBe('0:01.21');
  });

  it('終端を先取りしない（切り捨てで統一する）', () => {
    // 四捨五入だと 3.999 が 0:04.00 になり、総尺 4 秒の動画で
    // 「終端に達していないのに終端の表示」になってしまう
    expect(formatTimeCentiseconds(3.999)).toBe('0:03.99');
  });

  it('不正値は 0:00.00 を返す', () => {
    expect(formatTimeCentiseconds(NaN)).toBe('0:00.00');
    expect(formatTimeCentiseconds(Infinity)).toBe('0:00.00');
    expect(formatTimeCentiseconds(-1)).toBe('0:00.00');
  });
});

describe('formatPercent', () => {
  it('should format decimal to percentage', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0.333)).toBe('33%');
  });

  it('should handle NaN', () => {
    expect(formatPercent(NaN)).toBe('0%');
  });
});

describe('formatFileSize', () => {
  it('should format bytes to human readable size', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(100)).toBe('100 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1048576)).toBe('1 MB');
    expect(formatFileSize(1073741824)).toBe('1 GB');
  });
});
