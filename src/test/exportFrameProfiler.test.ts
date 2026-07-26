/**
 * exportFrameProfiler.ts の純ロジックテスト。
 *
 * 「プレビューは滑らかなのに書き出しだけ 20fps へ落ちる」原因を切り分けるための計測。
 * 各ボトルネック分類が想定どおりの入力で出ることを固定する。
 */
import { describe, it, expect } from 'vitest';
import {
  classifyExportBottleneck,
  createExportFrameProfiler,
} from '../utils/exportFrameProfiler';

/** 手動で進められる時計。計測ロジックを実時間に依存させずに検証する。 */
function createFakeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0;
  return {
    now: () => t,
    advance: (ms: number) => { t += ms; },
  };
}

describe('createExportFrameProfiler', () => {
  it('描画時間を区間ごとに積算する', () => {
    const clock = createFakeClock();
    const profiler = createExportFrameProfiler(clock.now);

    const end1 = profiler.begin('draw');
    clock.advance(10);
    end1();

    const end2 = profiler.begin('draw');
    clock.advance(30);
    end2();

    const s = profiler.summarize(clock.now());
    expect(s.draw.count).toBe(2);
    expect(s.draw.totalMs).toBe(40);
    expect(s.draw.maxMs).toBe(30);
  });

  it('描画とエンコードを別々に集計する', () => {
    const clock = createFakeClock();
    const profiler = createExportFrameProfiler(clock.now);

    const d = profiler.begin('draw');
    clock.advance(20);
    d();

    const e = profiler.begin('encode');
    clock.advance(5);
    e();

    const s = profiler.summarize(clock.now());
    expect(s.draw.totalMs).toBe(20);
    expect(s.encode.totalMs).toBe(5);
  });

  it('rAF の間隔から実効 fps を求める', () => {
    const clock = createFakeClock();
    const profiler = createExportFrameProfiler(clock.now);

    // 50ms 間隔 = 20fps
    for (let i = 0; i < 5; i++) {
      profiler.noteTick(clock.now());
      clock.advance(50);
    }

    const s = profiler.summarize(clock.now());
    expect(s.effectiveFps).toBeCloseTo(20, 1);
    expect(s.tickGap.maxMs).toBe(50);
  });

  it('描画・エンコード以外の時間を other として算出する', () => {
    const clock = createFakeClock();
    const profiler = createExportFrameProfiler(clock.now);

    // 100ms のうち描画 20ms・エンコード 10ms → other 70%
    const d = profiler.begin('draw');
    clock.advance(20);
    d();
    const e = profiler.begin('encode');
    clock.advance(10);
    e();
    clock.advance(70);

    const s = profiler.summarize(clock.now());
    expect(s.drawRatio).toBeCloseTo(0.2, 2);
    expect(s.encodeRatio).toBeCloseTo(0.1, 2);
    expect(s.otherRatio).toBeCloseTo(0.7, 2);
  });

  it('reset で集計をやり直せる', () => {
    const clock = createFakeClock();
    const profiler = createExportFrameProfiler(clock.now);

    const d = profiler.begin('draw');
    clock.advance(50);
    d();
    profiler.noteTick(clock.now());

    profiler.reset(clock.now());
    const s = profiler.summarize(clock.now());
    expect(s.draw.count).toBe(0);
    expect(s.draw.totalMs).toBe(0);
    expect(s.tickGap.count).toBe(0);
  });

  it('計測が空でも壊れない', () => {
    const clock = createFakeClock();
    const profiler = createExportFrameProfiler(clock.now);
    const s = profiler.summarize(clock.now());
    expect(s.effectiveFps).toBe(0);
    expect(Number.isFinite(s.drawRatio)).toBe(true);
    expect(Number.isFinite(s.otherRatio)).toBe(true);
  });
});

describe('classifyExportBottleneck', () => {
  const clock = createFakeClock();
  const base = createExportFrameProfiler(clock.now).summarize(0);

  it('目標 fps の 9 割以上出ていれば healthy', () => {
    expect(classifyExportBottleneck({ ...base, effectiveFps: 29 }, 30)).toBe('healthy');
    expect(classifyExportBottleneck({ ...base, effectiveFps: 27 }, 30)).toBe('healthy');
  });

  it('描画が支配的なら draw-bound', () => {
    expect(classifyExportBottleneck(
      { ...base, effectiveFps: 20, drawRatio: 0.7, encodeRatio: 0.1, otherRatio: 0.2 },
      30,
    )).toBe('draw-bound');
  });

  it('エンコードが支配的なら encode-bound', () => {
    expect(classifyExportBottleneck(
      { ...base, effectiveFps: 20, drawRatio: 0.1, encodeRatio: 0.6, otherRatio: 0.3 },
      30,
    )).toBe('encode-bound');
  });

  it('どちらも軽いのに fps が出ないなら raf-starved', () => {
    // 実測ログの想定パターン: 描画もエンコードも軽いのに 20fps しか出ない
    expect(classifyExportBottleneck(
      { ...base, effectiveFps: 20.3, drawRatio: 0.15, encodeRatio: 0.05, otherRatio: 0.8 },
      30,
    )).toBe('raf-starved');
  });

  it('目標 fps が不正でも既定値で判定する', () => {
    expect(classifyExportBottleneck({ ...base, effectiveFps: 29 }, 0)).toBe('healthy');
  });
});
