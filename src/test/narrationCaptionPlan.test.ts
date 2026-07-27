import { describe, expect, it } from 'vitest';
import {
  buildNarrationCaptionPlan,
  mapNarrationSilencesToTimeline,
  normalizeNarrationCaptionText,
  snapNarrationCaptionPlanToSilences,
  splitNarrationCaptionText,
} from '../utils/narrationCaptionPlan';

describe('narrationCaptionPlan', () => {
  it('改行のない長文を複数の通常カードへ分割する', () => {
    const segments = splitNarrationCaptionText(
      'これは改行のない長いナレーションですが、聞きやすい位置で複数のキャプションへ自動的に分割できます。',
      18
    );

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.join('')).toBe(
      'これは改行のない長いナレーションですが、聞きやすい位置で複数のキャプションへ自動的に分割できます。'
    );
  });

  it('ナレーション区間全体を文字数比で重複なく配分する', () => {
    const plan = buildNarrationCaptionPlan({
      text: '最初の説明です。続いて大切なポイントを紹介します。最後に内容をまとめます。',
      startTime: 3.2,
      endTime: 11.7,
      maxGraphemes: 14,
    });

    expect(plan.length).toBeGreaterThan(1);
    expect(plan[0].startTime).toBe(3.2);
    expect(plan[plan.length - 1]?.endTime).toBe(11.7);
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].startTime).toBe(plan[i - 1].endTime);
      expect(plan[i].endTime).toBeGreaterThan(plan[i].startTime);
    }
  });

  it('短い音声では細かすぎるカードを結合する', () => {
    const plan = buildNarrationCaptionPlan({
      text: '一つ目。二つ目。三つ目。四つ目。',
      startTime: 0,
      endTime: 1,
      maxGraphemes: 5,
      minSegmentDurationSec: 0.6,
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]).toEqual({
      text: '一つ目。二つ目。三つ目。四つ目。',
      startTime: 0,
      endTime: 1,
    });
  });

  it('元原稿は保持しつつキャプション用の空白だけ正規化する', () => {
    const original = '  1行目。\n\n2行目。  ';
    expect(normalizeNarrationCaptionText(original)).toBe('1行目。 2行目。');
    expect(original).toBe('  1行目。\n\n2行目。  ');
  });

  it('長い無音では前後0.1秒の余韻を残し、中央だけ字幕を消す', () => {
    const plan = [
      { text: '最初', startTime: 2, endTime: 5 },
      { text: '中間', startTime: 5, endTime: 8 },
      { text: '最後', startTime: 8, endTime: 11 },
    ];

    const result = snapNarrationCaptionPlanToSilences({
      plan,
      silenceCandidates: [
        { time: 4.7, start: 4.6, end: 4.8, duration: 0.2 },
        { time: 5.1, start: 4.9, end: 5.3, duration: 0.4 },
        { time: 8.4, start: 8.25, end: 8.55, duration: 0.3 },
      ],
    });

    expect(result.snappedBoundaryCount).toBe(2);
    expect(result.silentGapCount).toBe(2);
    expect(result.plan).toEqual([
      { text: '最初', startTime: 2, endTime: 5 },
      { text: '中間', startTime: 5.2, endTime: 8.35 },
      { text: '最後', startTime: 8.45, endTime: 11 },
    ]);
    expect(result.plan[1].startTime - result.plan[0].endTime).toBeCloseTo(0.2);
    expect(result.plan[2].startTime - result.plan[1].endTime).toBeCloseTo(0.1);
    expect(result.plan.some((item) => item.startTime <= 5.1 && item.endTime > 5.1)).toBe(false);
  });

  it('0.3秒未満の短い無音では字幕を消さず、中央でカードを切り替える', () => {
    const plan = [
      { text: '前半', startTime: 0, endTime: 3 },
      { text: '後半', startTime: 3, endTime: 6 },
    ];

    const result = snapNarrationCaptionPlanToSilences({
      plan,
      silenceCandidates: [{ time: 3, start: 2.9, end: 3.1, duration: 0.2 }],
    });

    expect(result.snappedBoundaryCount).toBe(1);
    expect(result.silentGapCount).toBe(0);
    expect(result.plan).toEqual([
      { text: '前半', startTime: 0, endTime: 3 },
      { text: '後半', startTime: 3, endTime: 6 },
    ]);
  });

  it('遠すぎる無音候補は使わず文字数比の境界を維持する', () => {
    const plan = [
      { text: '前半', startTime: 0, endTime: 3 },
      { text: '後半', startTime: 3, endTime: 6 },
    ];

    const result = snapNarrationCaptionPlanToSilences({
      plan,
      silenceCandidates: [{ time: 4.5, duration: 0.8 }],
    });

    expect(result.snappedBoundaryCount).toBe(0);
    expect(result.plan).toEqual(plan);
  });

  it('前後カードの最小表示時間を壊す無音候補は採用しない', () => {
    const plan = [
      { text: '短い前半', startTime: 0, endTime: 0.7 },
      { text: '後半', startTime: 0.7, endTime: 2 },
    ];

    const result = snapNarrationCaptionPlanToSilences({
      plan,
      silenceCandidates: [{ time: 0.3, duration: 0.5 }],
      minSegmentDurationSec: 0.6,
    });

    expect(result.snappedBoundaryCount).toBe(0);
    expect(result.plan[0].endTime).toBe(0.7);
    expect(result.plan[1].startTime).toBe(0.7);
  });

  it('音源内の無音時刻をトリム後のタイムラインへ写像する', () => {
    const candidates = mapNarrationSilencesToTimeline({
      silenceCandidates: [
        { time: 1, start: 0.9, end: 1.1, duration: 0.2 },
        { time: 2.5, start: 2.2, end: 2.8, duration: 0.6 },
        { time: 5, start: 4.85, end: 5.15, duration: 0.3 },
      ],
      timelineStart: 10,
      trimStart: 1.5,
      trimEnd: 4,
    });

    expect(candidates).toEqual([
      {
        time: 11,
        start: 10.7,
        end: 11.3,
        duration: 0.6,
      },
    ]);
  });
});
