/**
 * exportDiagnostics.ts の純ロジックテスト（Issue #215 の再発調査用の計測）。
 *
 * この診断の目的は「完了時の総フレーム数はどの異常経路でも尺と一致してしまう」ため、
 * ログだけでは区別できない原因を数字で切り分けること。
 * 各 verdict が想定どおりの入力で出ることを固定する。
 */
import { describe, it, expect } from 'vitest';
import {
  createRenderedFrameTracker,
  diagnoseExportFrameFlow,
  type ExportFrameFlowSnapshot,
} from '../utils/exportDiagnostics';

const FPS = 30;

/** 20秒 / 30fps = 600 フレームの正常な書き出しを基準にする */
function baseSnapshot(overrides: Partial<ExportFrameFlowSnapshot> = {}): ExportFrameFlowSnapshot {
  return {
    submittedFrames: 600,
    distinctRenderedFrames: 600,
    tailFilledFrames: 0,
    backpressureDroppedFrames: 0,
    expectedVideoFrames: 600,
    lastRenderedFrameIndex: 599,
    elapsedWallClockSec: 20,
    totalDurationSec: 20,
    fps: FPS,
    ...overrides,
  };
}

describe('diagnoseExportFrameFlow', () => {
  it('描画と投入が一致していれば healthy', () => {
    const result = diagnoseExportFrameFlow(baseSnapshot());
    expect(result.verdict).toBe('healthy');
    expect(result.duplicateSubmissions).toBe(0);
    expect(result.estimatedFrozenSec).toBe(0);
    expect(result.effectiveRenderFps).toBeCloseTo(30, 1);
    expect(result.renderCoverageRatio).toBeCloseTo(1, 5);
  });

  it('描画が追いつかず複製投入した場合は duplicate-submission', () => {
    // 600 枚投入したが実際に描けたのは 400 枚 → 200 枚が同じ画の使い回し
    const result = diagnoseExportFrameFlow(
      baseSnapshot({ distinctRenderedFrames: 400 }),
    );
    expect(result.verdict).toBe('duplicate-submission');
    expect(result.duplicateSubmissions).toBe(200);
    // 200 枚 / 30fps ≒ 6.7 秒ぶん映像が止まって見える
    expect(result.estimatedFrozenSec).toBeCloseTo(6.67, 1);
    expect(result.renderCoverageRatio).toBeCloseTo(0.667, 2);
    expect(result.summary).toContain('複製投入');
  });

  it('終端まで描かず末尾補完した場合は tail-filled', () => {
    // 末尾補完は「描いていない」ので distinct も減る
    const result = diagnoseExportFrameFlow(
      baseSnapshot({ distinctRenderedFrames: 450, tailFilledFrames: 150 }),
    );
    expect(result.verdict).toBe('tail-filled');
    expect(result.summary).toContain('末尾を複製');
  });

  it('末尾補完が丸め誤差程度なら異常扱いしない', () => {
    const result = diagnoseExportFrameFlow(
      baseSnapshot({ distinctRenderedFrames: 599, tailFilledFrames: 1 }),
    );
    expect(result.verdict).toBe('healthy');
  });

  it('エンコーダー飽和で落とした場合は encoder-backpressure', () => {
    const result = diagnoseExportFrameFlow(
      baseSnapshot({ backpressureDroppedFrames: 12 }),
    );
    expect(result.verdict).toBe('encoder-backpressure');
    expect(result.summary).toContain('エンコーダー');
  });

  it('投入数が期待フレーム数に届かない場合は short-video-track（最優先）', () => {
    // 映像トラックそのものが短い＝最も重い異常なので他より優先する
    const result = diagnoseExportFrameFlow(
      baseSnapshot({
        submittedFrames: 500,
        distinctRenderedFrames: 300,
        tailFilledFrames: 50,
        backpressureDroppedFrames: 5,
      }),
    );
    expect(result.verdict).toBe('short-video-track');
  });

  it('重複より末尾補完を優先して報告する', () => {
    // どちらの条件も満たす入力では、後半が完全に静止する tail-filled を先に出す
    const result = diagnoseExportFrameFlow(
      baseSnapshot({ distinctRenderedFrames: 300, tailFilledFrames: 300 }),
    );
    expect(result.verdict).toBe('tail-filled');
  });

  it('期待フレーム数が未確定でも例外を投げない', () => {
    const result = diagnoseExportFrameFlow(
      baseSnapshot({ expectedVideoFrames: null }),
    );
    expect(result.renderCoverageRatio).toBeNull();
    expect(result.verdict).toBe('healthy');
  });

  it('実時間 0・フレーム 0 でも壊れない', () => {
    const result = diagnoseExportFrameFlow(
      baseSnapshot({
        submittedFrames: 0,
        distinctRenderedFrames: 0,
        expectedVideoFrames: 0,
        elapsedWallClockSec: 0,
      }),
    );
    expect(result.effectiveRenderFps).toBe(0);
    expect(result.duplicateSubmissions).toBe(0);
    expect(Number.isFinite(result.estimatedFrozenSec)).toBe(true);
  });

  it('不正な値（NaN / 負数）を安全側へ丸める', () => {
    const result = diagnoseExportFrameFlow(
      baseSnapshot({
        submittedFrames: Number.NaN,
        distinctRenderedFrames: -10,
        fps: 0,
      }),
    );
    expect(result.duplicateSubmissions).toBe(0);
    expect(Number.isFinite(result.estimatedFrozenSec)).toBe(true);
  });
});

describe('createRenderedFrameTracker', () => {
  it('連番で描いたフレームを数える', () => {
    const tracker = createRenderedFrameTracker();
    tracker.note(0);
    tracker.note(1);
    tracker.note(2);

    expect(tracker.getDistinctCount()).toBe(3);
    expect(tracker.getLastIndex()).toBe(2);
    expect(tracker.getSkipCount()).toBe(0);
    expect(tracker.getSkippedFrames()).toBe(0);
  });

  it('同じフレーム番号の再描画は重複として数えない', () => {
    // rAF が回っても時刻が進まなければ同じ番号が来る。映像としては 1 枚ぶん。
    const tracker = createRenderedFrameTracker();
    tracker.note(5);
    tracker.note(5);
    tracker.note(5);

    expect(tracker.getDistinctCount()).toBe(1);
    expect(tracker.getLastIndex()).toBe(5);
  });

  it('描画が飛んだ回数と飛んだ枚数を記録する', () => {
    // 0 → 5 は 1〜4 の 4 枚が一度も描かれていない
    const tracker = createRenderedFrameTracker();
    tracker.note(0);
    tracker.note(5);
    tracker.note(6);
    tracker.note(10);

    expect(tracker.getDistinctCount()).toBe(4);
    expect(tracker.getSkipCount()).toBe(2);
    expect(tracker.getSkippedFrames()).toBe(4 + 3);
  });

  it('巻き戻りは無視する', () => {
    const tracker = createRenderedFrameTracker();
    tracker.note(10);
    tracker.note(3);

    expect(tracker.getDistinctCount()).toBe(1);
    expect(tracker.getLastIndex()).toBe(10);
  });

  it('不正な値を無視する', () => {
    const tracker = createRenderedFrameTracker();
    tracker.note(Number.NaN);
    tracker.note(-1);
    tracker.note(Number.POSITIVE_INFINITY);

    expect(tracker.getDistinctCount()).toBe(0);
    expect(tracker.getLastIndex()).toBeNull();
  });

  it('reset で初期状態へ戻る', () => {
    const tracker = createRenderedFrameTracker();
    tracker.note(0);
    tracker.note(3);
    tracker.reset();

    expect(tracker.getDistinctCount()).toBe(0);
    expect(tracker.getLastIndex()).toBeNull();
    expect(tracker.getSkipCount()).toBe(0);
    expect(tracker.getSkippedFrames()).toBe(0);
  });

  it('【回帰】連番でも「1回の描画で複数フレーム進んだ」ケースを検出する', () => {
    // 実測ログで誤診した状況の再現。壁時計ペーシングでは rAF 1 回につき
    // 複数フレームぶん時刻が進むため、番号は 0,2,4,... と連番風に増えるが
    // 実際の描画は 1 回ずつしかない。旧実装は skipCount で拾おうとしたが、
    // 番号が飛んでも「飛び」として数えるだけで「複製投入」は見抜けなかった。
    const tracker = createRenderedFrameTracker();
    // 1190 フレームぶんの時刻を 812 回の描画で消化した状況
    let index = 0;
    for (let call = 0; call < 812; call++) {
      tracker.note(index);
      index += Math.round(1190 / 812);
    }

    // 実際の描画回数は 812 回しかない
    expect(tracker.getRenderCallCount()).toBe(812);

    const diagnosis = diagnoseExportFrameFlow({
      submittedFrames: 1190,
      distinctRenderedFrames: tracker.getDistinctCount(),
      renderCallCount: tracker.getRenderCallCount(),
      tailFilledFrames: 0,
      backpressureDroppedFrames: 0,
      expectedVideoFrames: 1190,
      lastRenderedFrameIndex: tracker.getLastIndex(),
      elapsedWallClockSec: 40,
      totalDurationSec: 39.64,
      fps: FPS,
    });

    // renderCallCount を使うので「正常」とは判定しない
    expect(diagnosis.verdict).toBe('duplicate-submission');
    expect(diagnosis.duplicateSubmissions).toBe(1190 - 812);
    // 約 12.6 秒ぶんが同じ画の使い回し（報告された「24秒付近で終わる」と整合）
    expect(diagnosis.estimatedFrozenSec).toBeCloseTo(12.6, 0);
  });

  it('renderCallCount を渡さない旧経路では distinctRenderedFrames を使う', () => {
    const result = diagnoseExportFrameFlow(baseSnapshot({ renderCallCount: undefined }));
    expect(result.verdict).toBe('healthy');
  });

  it('書き出し1回ぶんの流れを再現できる（rAF が落ちたケース）', () => {
    // 30fps 目標で 2 フレームに 1 回しか描けなかった状況
    const tracker = createRenderedFrameTracker();
    for (let i = 0; i < 600; i += 2) {
      tracker.note(i);
    }

    expect(tracker.getDistinctCount()).toBe(300);
    expect(tracker.getSkippedFrames()).toBe(299);

    // このとき 600 枚投入していれば、300 枚が複製＝約10秒ぶん映像が止まる
    const diagnosis = diagnoseExportFrameFlow({
      submittedFrames: 600,
      distinctRenderedFrames: tracker.getDistinctCount(),
      tailFilledFrames: 0,
      backpressureDroppedFrames: 0,
      expectedVideoFrames: 600,
      lastRenderedFrameIndex: tracker.getLastIndex(),
      elapsedWallClockSec: 20,
      totalDurationSec: 20,
      fps: FPS,
    });
    expect(diagnosis.verdict).toBe('duplicate-submission');
    expect(diagnosis.estimatedFrozenSec).toBeCloseTo(10, 1);
  });
});
