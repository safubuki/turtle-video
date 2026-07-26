import { describe, expect, it } from 'vitest';
import {
  alignExportDurationToFrameGrid,
  getExportFrameTiming,
  resolveExportCanvasFrameBurstCount,
  resolveNonIosExportTimelineTimeSec,
  resolveFrameDrivenExportTimeSec,
  shouldUseFrameDrivenExportPacing,
  resolveExportPlaybackTimeSec,
  resolveExportDuration,
  resolveExportResolutionVerdict,
  resolveExportVideoFrameBudget,
  evaluateFrameDrivenExportStall,
  resolveThrottledExportTimelineSec,
} from '../utils/exportTimeline';
import { isCaptionActiveAtTime } from '../utils/captionTimeline';
import type { Caption } from '../types';

describe('resolveExportDuration', () => {
  it('raw timeline duration を exportDuration として一本化する', () => {
    expect(resolveExportDuration(2, 30)).toEqual({
      exportDurationSec: 2,
      exportDurationUs: 2_000_000,
      rawDurationSec: 2,
      rawDurationUs: 2_000_000,
      frameCount: 60,
      alignedDurationSec: 2,
      alignedDurationUs: 2_000_000,
      nominalFrameDurationUs: Math.round(1e6 / 30),
    });
  });
});

describe('alignExportDurationToFrameGrid', () => {
  it('フレーム境界ちょうどの尺はそのまま維持する', () => {
    expect(alignExportDurationToFrameGrid(2, 30)).toEqual({
      rawDurationSec: 2,
      rawDurationUs: 2_000_000,
      frameCount: 60,
      alignedDurationSec: 2,
      alignedDurationUs: 2_000_000,
    });
  });

  it('フレーム境界に乗らない尺は切り上げて動画と音声の終端を一致させる', () => {
    const aligned = alignExportDurationToFrameGrid(10.01, 30);

    expect(aligned.rawDurationSec).toBe(10.01);
    expect(aligned.rawDurationUs).toBe(10_010_000);
    expect(aligned.frameCount).toBe(301);
    expect(aligned.alignedDurationSec).toBeCloseTo(301 / 30, 10);
    expect(aligned.alignedDurationUs).toBe(Math.round((301 / 30) * 1e6));
  });

  it('浮動小数の誤差で余計な1フレームを増やさない', () => {
    const aligned = alignExportDurationToFrameGrid(60 / 30 + 1e-12, 30);

    expect(aligned.frameCount).toBe(60);
    expect(aligned.alignedDurationSec).toBe(2);
  });

  it('不正な入力はゼロ尺として扱う', () => {
    expect(alignExportDurationToFrameGrid(-1, 30).frameCount).toBe(0);
    expect(alignExportDurationToFrameGrid(10, 0).alignedDurationSec).toBe(0);
  });

  it('最終フレームだけを短くして総尺を元のタイムラインへ一致させる', () => {
    const resolved = resolveExportDuration(10.01, 30);
    const lastFrameIndex = resolved.frameCount - 1;
    const penultimate = getExportFrameTiming(resolved, 30, lastFrameIndex - 1);
    const last = getExportFrameTiming(resolved, 30, lastFrameIndex);

    expect(penultimate.timestampUs + penultimate.durationUs).toBe(last.timestampUs);
    expect(last.timestampUs + last.durationUs).toBe(resolved.exportDurationUs);
    expect(last.durationUs).toBeLessThanOrEqual(Math.round(1e6 / 30));
    expect(last.durationUs).toBeGreaterThan(0);
  });
});

describe('resolveExportPlaybackTimeSec', () => {
  it('非 iOS export では描画済みフレーム時刻を優先する', () => {
    expect(
      resolveExportPlaybackTimeSec(1, 2 / 3, true),
    ).toBeCloseTo(2 / 3, 10);
  });

  it('描画済み時刻が不正な場合は currentTime へフォールバックする', () => {
    expect(resolveExportPlaybackTimeSec(1, Number.NaN, true)).toBe(1);
  });

  it('iOS export では従来どおり currentTime を使う', () => {
    expect(resolveExportPlaybackTimeSec(1.5, 1, false)).toBe(1.5);
  });

  it('負値は 0 秒へ正規化する', () => {
    expect(resolveExportPlaybackTimeSec(-1, Number.NaN, false)).toBe(0);
  });
});

describe('resolveNonIosExportTimelineTimeSec', () => {
  it('advances at most one frame beyond the last rendered frame', () => {
    expect(
      resolveNonIosExportTimelineTimeSec({
        elapsedSec: 0.101,
        lastRenderedPlaybackTimeSec: 1 / 30,
        fps: 30,
      }),
    ).toBeCloseTo(2 / 30, 10);
  });

  it('uses the snapped wall-clock time while it stays within one frame', () => {
    expect(
      resolveNonIosExportTimelineTimeSec({
        elapsedSec: 0.064,
        lastRenderedPlaybackTimeSec: 1 / 30,
        fps: 30,
      }),
    ).toBeCloseTo(1 / 30, 10);

    expect(
      resolveNonIosExportTimelineTimeSec({
        elapsedSec: 0.068,
        lastRenderedPlaybackTimeSec: 1 / 30,
        fps: 30,
      }),
    ).toBeCloseTo(2 / 30, 10);
  });

  it('does not move backward when the wall clock lags behind the rendered frame', () => {
    expect(
      resolveNonIosExportTimelineTimeSec({
        elapsedSec: 0.01,
        lastRenderedPlaybackTimeSec: 0.5,
        fps: 30,
      }),
    ).toBeCloseTo(0.5, 10);
  });
});

describe('resolveExportCanvasFrameBurstCount', () => {
  it('keeps the legacy single-frame limit when catch-up capacity is omitted', () => {
    expect(
      resolveExportCanvasFrameBurstCount({
        pendingFrameCount: 4,
      }),
    ).toBe(1);
  });

  it('catches up all pending CFR frames when the encoder queue has capacity', () => {
    expect(
      resolveExportCanvasFrameBurstCount({
        pendingFrameCount: 4,
        maxFramesPerPoll: 90,
      }),
    ).toBe(4);
  });

  it('limits catch-up to the remaining encoder queue capacity', () => {
    expect(
      resolveExportCanvasFrameBurstCount({
        pendingFrameCount: 12,
        maxFramesPerPoll: 3,
      }),
    ).toBe(3);
  });

  it('does not enqueue frames when the encoder queue is full', () => {
    expect(
      resolveExportCanvasFrameBurstCount({
        pendingFrameCount: 12,
        maxFramesPerPoll: 0,
      }),
    ).toBe(0);
  });

  it('keeps a 30fps timeline complete when 1080p load slows polling to 15fps', () => {
    const expectedFrames = Math.ceil(127.1 * 30);
    let encodedFrames = 0;

    // 添付された FHD 出力では約 15.2fps しか Canvas を取り込めず、旧実装は
    // ここで 1 枚ずつしか処理しないため残り約半分を末尾の黒 Canvas で埋めていた。
    for (let targetFrameCount = 1; targetFrameCount <= expectedFrames; targetFrameCount += 2) {
      encodedFrames += resolveExportCanvasFrameBurstCount({
        pendingFrameCount: targetFrameCount - encodedFrames,
        maxFramesPerPoll: 90,
      });
    }

    if (encodedFrames < expectedFrames) {
      encodedFrames += resolveExportCanvasFrameBurstCount({
        pendingFrameCount: expectedFrames - encodedFrames,
        maxFramesPerPoll: 90,
      });
    }

    expect(encodedFrames).toBe(expectedFrames);
  });

  it('returns zero when there is no pending frame', () => {
    expect(
      resolveExportCanvasFrameBurstCount({
        pendingFrameCount: 0,
      }),
    ).toBe(0);
  });

  it('normalizes invalid pending counts to zero', () => {
    expect(
      resolveExportCanvasFrameBurstCount({
        pendingFrameCount: Number.NaN,
      }),
    ).toBe(0);
  });
});

describe('resolveFrameDrivenExportTimeSec', () => {
  it('keeps image and caption timing tied to frames submitted to VideoEncoder', () => {
    expect(resolveFrameDrivenExportTimeSec({
      wallClockTimeSec: 7.5,
      submittedFrameCount: 195,
      fps: 30,
      enabled: true,
    })).toBe(6.5);

    expect(resolveFrameDrivenExportTimeSec({
      wallClockTimeSec: 9.2,
      submittedFrameCount: 225,
      fps: 30,
      enabled: true,
    })).toBe(7.5);
  });

  it('keeps the wall-clock path for video timelines and normal preview', () => {
    expect(resolveFrameDrivenExportTimeSec({
      wallClockTimeSec: 5.75,
      submittedFrameCount: 90,
      fps: 30,
      enabled: false,
    })).toBe(5.75);
  });

  it('normalizes invalid frame progress without advancing the export timeline', () => {
    expect(resolveFrameDrivenExportTimeSec({
      wallClockTimeSec: 5,
      submittedFrameCount: Number.NaN,
      fps: 30,
      enabled: true,
    })).toBe(0);
  });
});

describe('shouldUseFrameDrivenExportPacing', () => {
  it('enables frame-driven pacing for a full export made only from images', () => {
    expect(shouldUseFrameDrivenExportPacing({
      isExportMode: true,
      fromTimeSec: 0,
      mediaItemTypes: ['image', 'image'],
    })).toBe(true);
  });

  it('keeps video timelines on the existing wall-clock path', () => {
    expect(shouldUseFrameDrivenExportPacing({
      isExportMode: true,
      fromTimeSec: 0,
      mediaItemTypes: ['image', 'video'],
    })).toBe(false);
  });

  it('does not affect normal preview, partial starts, or empty timelines', () => {
    expect(shouldUseFrameDrivenExportPacing({
      isExportMode: false,
      fromTimeSec: 0,
      mediaItemTypes: ['image'],
    })).toBe(false);
    expect(shouldUseFrameDrivenExportPacing({
      isExportMode: true,
      fromTimeSec: 1,
      mediaItemTypes: ['image'],
    })).toBe(false);
    expect(shouldUseFrameDrivenExportPacing({
      isExportMode: true,
      fromTimeSec: 0,
      mediaItemTypes: [],
    })).toBe(false);
  });
});

describe('resolveExportResolutionVerdict', () => {
  it('一致する解像度は match（正常）', () => {
    expect(resolveExportResolutionVerdict({
      expectedWidth: 1920,
      expectedHeight: 1080,
      actualWidth: 1920,
      actualHeight: 1080,
    })).toBe('match');
    expect(resolveExportResolutionVerdict({
      expectedWidth: 1280,
      expectedHeight: 720,
      actualWidth: 1280,
      actualHeight: 720,
    })).toBe('match');
  });

  it('実解像度が明確に食い違う場合だけ mismatch（書き出し失敗）', () => {
    expect(resolveExportResolutionVerdict({
      expectedWidth: 1920,
      expectedHeight: 1080,
      actualWidth: 1280,
      actualHeight: 720,
    })).toBe('mismatch');
    expect(resolveExportResolutionVerdict({
      expectedWidth: 1920,
      expectedHeight: 1080,
      actualWidth: 1920,
      actualHeight: 1088,
    })).toBe('mismatch');
  });

  it('解像度を読み取れない場合は unverified（検証不能を理由に破棄しない）', () => {
    // 回帰: フルHD/HD/自動モード追加時、パーサーが解像度を返さないと
    // 完成した書き出しごと破棄され、エクスポートが全くできなくなっていた。
    expect(resolveExportResolutionVerdict({
      expectedWidth: 1920,
      expectedHeight: 1080,
      actualWidth: null,
      actualHeight: null,
    })).toBe('unverified');
    expect(resolveExportResolutionVerdict({
      expectedWidth: 1920,
      expectedHeight: 1080,
      actualWidth: 1920,
      actualHeight: null,
    })).toBe('unverified');
    expect(resolveExportResolutionVerdict({
      expectedWidth: 1920,
      expectedHeight: 1080,
      actualWidth: null,
      actualHeight: 1080,
    })).toBe('unverified');
  });
});

describe('resolveExportVideoFrameBudget', () => {
  const FPS = 30;

  it('尺未確定（expectedVideoFrames=null）なら null を返す', () => {
    expect(resolveExportVideoFrameBudget({
      expectedVideoFrames: null,
      forceToEnd: false,
      renderedFrameIndex: 10,
      renderedPlaybackTimeSec: null,
      fps: FPS,
    })).toBeNull();
  });

  it('描画済みフレーム番号 +1 までを投入上限にする', () => {
    expect(resolveExportVideoFrameBudget({
      expectedVideoFrames: 600,
      forceToEnd: false,
      renderedFrameIndex: 149,
      renderedPlaybackTimeSec: null,
      fps: FPS,
    })).toBe(150);
  });

  it('render loop が未描画（null）なら先頭フレームだけを許可する', () => {
    expect(resolveExportVideoFrameBudget({
      expectedVideoFrames: 600,
      forceToEnd: false,
      renderedFrameIndex: null,
      renderedPlaybackTimeSec: null,
      fps: FPS,
    })).toBe(1);
  });

  it('フレーム番号が無い場合のみ描画済み時刻から換算する', () => {
    expect(resolveExportVideoFrameBudget({
      expectedVideoFrames: 600,
      forceToEnd: false,
      renderedFrameIndex: null,
      renderedPlaybackTimeSec: 5,
      fps: FPS,
    })).toBe(151);
  });

  it('forceToEnd なら総フレーム数まで一括で許可する（末尾補完）', () => {
    expect(resolveExportVideoFrameBudget({
      expectedVideoFrames: 600,
      forceToEnd: true,
      renderedFrameIndex: 400,
      renderedPlaybackTimeSec: null,
      fps: FPS,
    })).toBe(600);
  });

  it('描画実績が総フレーム数を超えても総フレーム数で頭打ちにする', () => {
    expect(resolveExportVideoFrameBudget({
      expectedVideoFrames: 600,
      forceToEnd: false,
      renderedFrameIndex: 9999,
      renderedPlaybackTimeSec: null,
      fps: FPS,
    })).toBe(600);
  });

  it('負値・非有限の描画実績は未描画として扱う', () => {
    expect(resolveExportVideoFrameBudget({
      expectedVideoFrames: 600,
      forceToEnd: false,
      renderedFrameIndex: -1,
      renderedPlaybackTimeSec: null,
      fps: FPS,
    })).toBe(1);
    expect(resolveExportVideoFrameBudget({
      expectedVideoFrames: 600,
      forceToEnd: false,
      renderedFrameIndex: Number.NaN,
      renderedPlaybackTimeSec: null,
      fps: FPS,
    })).toBe(1);
  });

  it('【Issue #215 回帰】rAF が 30fps を割り込んでも映像が早期に総フレーム数へ到達しない', () => {
    // 20 秒 / 30fps = 600 フレームのプロジェクト。
    // render loop は rAF 上で 20fps しか回らないが、壁時計は 30fps 相当で進む。
    const expectedVideoFrames = 600;
    const totalDurationSec = 20;
    const renderedFps = 20;

    let submittedFrames = 0;
    let renderedFrameIndex: number | null = null;

    // 壁時計が総尺に達するまでの各ポーリングをシミュレートする。
    for (let tickMs = 0; tickMs < totalDurationSec * 1000; tickMs += 16) {
      const wallClockSec = tickMs / 1000;
      // render loop は 20fps でしか描画できない。
      const drawn = Math.floor(wallClockSec * renderedFps);
      renderedFrameIndex = drawn > 0 ? Math.min(drawn - 1, expectedVideoFrames - 1) : null;

      const budget = resolveExportVideoFrameBudget({
        expectedVideoFrames,
        forceToEnd: false,
        renderedFrameIndex,
        renderedPlaybackTimeSec: null,
        fps: FPS,
      });
      submittedFrames = Math.max(submittedFrames, Math.min(budget ?? 0, expectedVideoFrames));
    }

    // 壁時計基準の旧実装なら 600 フレームへ到達し、残り区間が黒画面になっていた。
    // 描画実績基準では描けた分（20fps × 約20秒 ≒ 399 フレーム）までしか投入しない。
    expect(submittedFrames).toBeLessThan(expectedVideoFrames);
    expect(submittedFrames).toBe(399);

    // 終端では forceToEnd で総尺へ揃うため、出力尺は 20 秒のまま維持される。
    expect(resolveExportVideoFrameBudget({
      expectedVideoFrames,
      forceToEnd: true,
      renderedFrameIndex,
      renderedPlaybackTimeSec: null,
      fps: FPS,
    })).toBe(expectedVideoFrames);
  });
});

describe('evaluateFrameDrivenExportStall', () => {
  it('投入数が進んだら advanced=true・停滞計測をリセットする', () => {
    const decision = evaluateFrameDrivenExportStall({
      enabled: true,
      submittedFrameCount: 5,
      lastObservedSubmittedFrameCount: 4,
      lastAdvanceAtMs: 1000,
      nowMs: 9999,
      stallTimeoutMs: 2000,
    });
    expect(decision.advanced).toBe(true);
    expect(decision.stalled).toBe(false);
    expect(decision.nextLastAdvanceAtMs).toBe(9999);
  });

  it('停滞が閾値未満なら stalled=false・最後に進んだ時刻を保持する', () => {
    const decision = evaluateFrameDrivenExportStall({
      enabled: true,
      submittedFrameCount: 3,
      lastObservedSubmittedFrameCount: 3,
      lastAdvanceAtMs: 1000,
      nowMs: 1000 + 1999,
      stallTimeoutMs: 2000,
    });
    expect(decision.advanced).toBe(false);
    expect(decision.stalled).toBe(false);
    expect(decision.nextLastAdvanceAtMs).toBe(1000);
  });

  it('停滞が閾値以上なら stalled=true（壁時計フォールバックの合図）', () => {
    // 回帰: 画像のみエクスポートで VideoEncoder への投入が停滞すると
    // タイムラインが 0 秒付近で止まり「書き出し準備中」から進まなくなっていた。
    const decision = evaluateFrameDrivenExportStall({
      enabled: true,
      submittedFrameCount: 1,
      lastObservedSubmittedFrameCount: 1,
      lastAdvanceAtMs: 1000,
      nowMs: 1000 + 2000,
      stallTimeoutMs: 2000,
    });
    expect(decision.stalled).toBe(true);
    expect(decision.nextLastAdvanceAtMs).toBe(1000);
  });

  it('無効時は常に stalled=false（フレーム駆動でない経路に干渉しない）', () => {
    const decision = evaluateFrameDrivenExportStall({
      enabled: false,
      submittedFrameCount: 0,
      lastObservedSubmittedFrameCount: 0,
      lastAdvanceAtMs: 0,
      nowMs: 999999,
      stallTimeoutMs: 2000,
    });
    expect(decision.stalled).toBe(false);
  });
});

describe('isCaptionActiveAtTime', () => {
  const caption: Caption = {
    id: 'cap-1',
    text: 'caption',
    startTime: 1.0,
    endTime: 2.0,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 0.5,
    fadeOutDuration: 0.5,
  };

  it('caption の開始を含み終了を含まない区間判定を行う', () => {
    expect(isCaptionActiveAtTime(caption, 0.999)).toBe(false);
    expect(isCaptionActiveAtTime(caption, 1.000)).toBe(true);
    expect(isCaptionActiveAtTime(caption, 1.033)).toBe(true);
    expect(isCaptionActiveAtTime(caption, 1.999)).toBe(true);
    expect(isCaptionActiveAtTime(caption, 2.000)).toBe(false);
  });

  it('export frame timestamp 由来の時刻でも同じ判定になる', () => {
    const alignment = resolveExportDuration(3, 30);

    const before = getExportFrameTiming(alignment, 30, 29).timestampUs / 1e6;
    const firstActiveFrameIndex = Array.from({ length: alignment.frameCount }).findIndex((_, frameIndex) => {
      const timeSec = getExportFrameTiming(alignment, 30, frameIndex).timestampUs / 1e6;
      return isCaptionActiveAtTime(caption, timeSec);
    });
    const firstInactiveAfterActiveFrameIndex = Array.from({ length: alignment.frameCount }).findIndex((_, frameIndex) => {
      if (frameIndex <= firstActiveFrameIndex) return false;
      const timeSec = getExportFrameTiming(alignment, 30, frameIndex).timestampUs / 1e6;
      return !isCaptionActiveAtTime(caption, timeSec);
    });

    const atStart = getExportFrameTiming(alignment, 30, firstActiveFrameIndex).timestampUs / 1e6;
    const nearEnd = getExportFrameTiming(alignment, 30, firstInactiveAfterActiveFrameIndex - 1).timestampUs / 1e6;
    const atEnd = getExportFrameTiming(alignment, 30, firstInactiveAfterActiveFrameIndex).timestampUs / 1e6;

    expect(isCaptionActiveAtTime(caption, before)).toBe(false);
    expect(firstActiveFrameIndex).toBeGreaterThan(0);
    expect(isCaptionActiveAtTime(caption, atStart)).toBe(true);
    expect(isCaptionActiveAtTime(caption, nearEnd)).toBe(true);
    expect(isCaptionActiveAtTime(caption, atEnd)).toBe(false);
  });
});

describe('resolveThrottledExportTimelineSec', () => {
  const FPS = 30;
  const FRAME_SEC = 1 / FPS;

  it('enabled=false なら壁時計をそのまま返す（プレビューや静止画フレーム駆動は不変）', () => {
    const result = resolveThrottledExportTimelineSec({
      wallClockElapsedSec: 5,
      lastTimelineSec: 1,
      fps: FPS,
      maxFramesPerTick: 1,
      enabled: false,
    });
    expect(result.timelineSec).toBe(5);
    expect(result.throttled).toBe(false);
    expect(result.deferredSec).toBe(0);
  });

  it('初回（前回時刻なし）は壁時計をそのまま使う', () => {
    const result = resolveThrottledExportTimelineSec({
      wallClockElapsedSec: 0,
      lastTimelineSec: null,
      fps: FPS,
      maxFramesPerTick: 1,
      enabled: true,
    });
    expect(result.timelineSec).toBe(0);
    expect(result.throttled).toBe(false);
  });

  it('描画が追いついている間は壁時計と一致する（正常時の挙動は変えない）', () => {
    // 前回 1.000s、壁時計 1.030s → 1 フレーム(0.0333s)以内なので減速不要
    const result = resolveThrottledExportTimelineSec({
      wallClockElapsedSec: 1.03,
      lastTimelineSec: 1.0,
      fps: FPS,
      maxFramesPerTick: 1,
      enabled: true,
    });
    expect(result.timelineSec).toBeCloseTo(1.03, 6);
    expect(result.throttled).toBe(false);
  });

  it('壁時計が先行したら 1 フレームぶんに制限する', () => {
    // rAF が遅れて壁時計は 1.20s まで飛んだが、前進は 1 フレームぶんに抑える
    const result = resolveThrottledExportTimelineSec({
      wallClockElapsedSec: 1.2,
      lastTimelineSec: 1.0,
      fps: FPS,
      maxFramesPerTick: 1,
      enabled: true,
    });
    expect(result.timelineSec).toBeCloseTo(1.0 + FRAME_SEC, 6);
    expect(result.throttled).toBe(true);
    expect(result.deferredSec).toBeCloseTo(1.2 - (1.0 + FRAME_SEC), 6);
  });

  it('maxFramesPerTick で許容する前進量を変えられる', () => {
    const result = resolveThrottledExportTimelineSec({
      wallClockElapsedSec: 5,
      lastTimelineSec: 1.0,
      fps: FPS,
      maxFramesPerTick: 3,
      enabled: true,
    });
    expect(result.timelineSec).toBeCloseTo(1.0 + 3 * FRAME_SEC, 6);
  });

  it('時刻を巻き戻さない（前回時刻より手前は返さない）', () => {
    const result = resolveThrottledExportTimelineSec({
      wallClockElapsedSec: 0.5,
      lastTimelineSec: 1.0,
      fps: FPS,
      maxFramesPerTick: 1,
      enabled: true,
    });
    // 壁時計が巻き戻っても timelineSec は上限計算に従う（進みすぎないことだけを保証する）
    expect(result.timelineSec).toBeLessThanOrEqual(1.0 + FRAME_SEC);
  });

  it('不正な入力でも壊れない', () => {
    const nan = resolveThrottledExportTimelineSec({
      wallClockElapsedSec: Number.NaN,
      lastTimelineSec: 1,
      fps: 0,
      maxFramesPerTick: 0,
      enabled: true,
    });
    expect(Number.isFinite(nan.timelineSec)).toBe(true);
  });

  it('【回帰】20.5fps しか描けない状況でも映像が早送りにならない', () => {
    // 実測ログの再現: 目標 30fps に対し rAF は 20.5fps しか回らない。
    // 壁時計のままだと 1 ティックで 1/20.5 秒進み、39.64 秒の素材が
    // 約 27 秒相当で尽きて以降が黒画面になる（報告された症状）。
    const totalDuration = 39.64;
    const actualRafFps = 20.5;
    const tickIntervalSec = 1 / actualRafFps;

    // --- 減速なし（現状の不具合） ---
    let wallClock = 0;
    let ticks = 0;
    while (wallClock < totalDuration) {
      wallClock += tickIntervalSec;
      ticks += 1;
    }
    // 描画機会は約 813 回しかないのに、タイムラインは 39.64 秒ぶん進んでしまう
    expect(ticks).toBeLessThan(totalDuration * 30);
    // → 1 ティックあたり 1/30 秒より大きく進む = 早送り
    expect(totalDuration / ticks).toBeGreaterThan(1 / 30);

    // --- 減速あり（本修正） ---
    let timeline: number | null = null;
    let throttledTicks = 0;
    let simulatedWallClock = 0;
    for (let i = 0; i < ticks; i++) {
      simulatedWallClock += tickIntervalSec;
      const result = resolveThrottledExportTimelineSec({
        wallClockElapsedSec: simulatedWallClock,
        lastTimelineSec: timeline,
        fps: 30,
        maxFramesPerTick: 1,
        enabled: true,
      });
      if (result.throttled) throttledTicks += 1;
      timeline = result.timelineSec;
    }

    // 減速が働き、同じティック数ではタイムラインが総尺へ到達しない
    // （＝映像が早送りされず、書き出しに実時間がかかるだけになる）
    expect(throttledTicks).toBeGreaterThan(0);
    expect(timeline).not.toBeNull();
    expect(timeline as number).toBeLessThan(totalDuration);
    // 1 ティックあたりの前進は 1 フレームぶんを超えない
    // （初回ティックだけは前回時刻が無く壁時計をそのまま採用するため、その 1 回ぶんを許容する）
    const firstTickSec = tickIntervalSec;
    expect(((timeline as number) - firstTickSec) / (ticks - 1)).toBeLessThanOrEqual(1 / 30 + 1e-9);

    // 減速なしなら 39.64 秒ぶん進んでいたのに対し、減速後は約 27 秒相当に留まる。
    // これは「素材が尽きて黒画面になっていたぶん」がそのまま抑えられたことを意味する。
    expect(timeline as number).toBeCloseTo(ticks / 30, 1);
  });

  it('【回帰】描画が十分速いときは減速が一度も働かない', () => {
    // 60fps で回れれば 30fps 目標には常に追いつくので、挙動は従来どおり
    let timeline: number | null = null;
    let throttledTicks = 0;
    let wallClock = 0;
    for (let i = 0; i < 600; i++) {
      wallClock += 1 / 60;
      const result = resolveThrottledExportTimelineSec({
        wallClockElapsedSec: wallClock,
        lastTimelineSec: timeline,
        fps: 30,
        maxFramesPerTick: 1,
        enabled: true,
      });
      if (result.throttled) throttledTicks += 1;
      timeline = result.timelineSec;
    }
    expect(throttledTicks).toBe(0);
    expect(timeline).toBeCloseTo(10, 5);
  });
});
