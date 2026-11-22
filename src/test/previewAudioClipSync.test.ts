import { describe, expect, it } from 'vitest';

import {
  createPreviewAudioClipSyncState,
  notePreviewAudioClipSeekIssued,
  observePreviewAudioClipSync,
  PREVIEW_AUDIO_CLIP_MAX_PLAY_START_WAIT_MS,
  PREVIEW_AUDIO_CLIP_MAX_SEEK_LEAD_SEC,
  PREVIEW_AUDIO_CLIP_PREROLL_SEC,
  resetPreviewAudioClipSyncPending,
  resolvePreviewAudioClipPrerollSeek,
  resolvePreviewAudioClipSyncDecision,
  type PreviewAudioClipElementState,
} from '../flavors/standard/preview/previewAudioClipSync';

function el(overrides: Partial<PreviewAudioClipElementState> = {}): PreviewAudioClipElementState {
  return {
    currentTime: 0,
    paused: true,
    seeking: false,
    ended: false,
    readyState: 4,
    ...overrides,
  };
}

/**
 * シーク・再生開始に時間がかかる <audio> 要素の模擬。
 * シーク中は currentTime がシーク先を返し、進行中のシークへ新しいシークを重ねると
 * 完了がその時点から数え直しになる（実機で連続シークが終わらない状態に相当）。
 */
class SlowMediaElement implements PreviewAudioClipElementState {
  paused = true;
  ended = false;
  readyState = 4;
  private position = 0;
  private seekTarget: number | null = null;
  private seekDoneAtMs = 0;
  private playStartsAtMs = 0;

  constructor(
    private readonly seekLatencyMs: number,
    private readonly playLatencyMs: number,
    initialTime = 0,
  ) {
    this.position = initialTime;
  }

  get seeking(): boolean {
    return this.seekTarget !== null;
  }

  get currentTime(): number {
    return this.seekTarget ?? this.position;
  }

  seek(target: number, nowMs: number): void {
    this.seekTarget = target;
    this.seekDoneAtMs = nowMs + this.seekLatencyMs;
  }

  play(nowMs: number): void {
    if (!this.paused) return;
    this.paused = false;
    this.playStartsAtMs = nowMs + this.playLatencyMs;
  }

  pause(): void {
    this.paused = true;
  }

  /** 1 フレーム分の時間を進める */
  tick(nowMs: number, dtSec: number): void {
    if (this.seekTarget !== null && nowMs >= this.seekDoneAtMs) {
      this.position = this.seekTarget;
      this.seekTarget = null;
      // 実機は再生中のシーク完了後、そのまま再生を続ける。開始待ちを数え直す。
      this.playStartsAtMs = Math.max(this.playStartsAtMs, nowMs + this.playLatencyMs);
    }
    if (!this.paused && this.seekTarget === null && nowMs >= this.playStartsAtMs) {
      this.position += dtSec;
    }
  }

  /** 実際に音が出ている（再生が進んでいる）か */
  isProducingAudio(nowMs: number): boolean {
    return !this.paused && this.seekTarget === null && nowMs >= this.playStartsAtMs;
  }
}

interface SimulationResult {
  /** 区間内で実際に音が出ていたフレームの割合 */
  audibleRatio: number;
  /** 音が出ていたフレームのうち、タイムラインとのずれの最大値（秒） */
  maxAudibleDriftSec: number;
  seekCount: number;
}

const FRAME_MS = 1000 / 60;

/**
 * BGM クリップ（startTime から trimStart の音源を playable 秒鳴らす）を、
 * timelineStart から再生したときのフレームループを模擬する。
 */
function simulate(options: {
  algorithm: 'legacy' | 'sync';
  seekLatencyMs: number;
  playLatencyMs: number;
  clipStartSec: number;
  trimStart: number;
  playableSec: number;
  timelineStartSec: number;
  initialElementTime?: number;
}): SimulationResult {
  const element = new SlowMediaElement(options.seekLatencyMs, options.playLatencyMs, options.initialElementTime ?? 0);
  const state = createPreviewAudioClipSyncState();
  const endSec = options.clipStartSec + options.playableSec;
  let inRangeFrames = 0;
  let audibleFrames = 0;
  let maxAudibleDriftSec = 0;
  let seekCount = 0;
  const seek = (target: number, nowMs: number) => {
    element.seek(target, nowMs);
    seekCount += 1;
  };

  for (let nowMs = 0; ; nowMs += FRAME_MS) {
    const time = options.timelineStartSec + nowMs / 1000;
    if (time > endSec + 0.2) break;
    element.tick(nowMs, FRAME_MS / 1000);

    const clipTime = time - options.clipStartSec;
    const sourceTime = options.trimStart + clipTime;
    const inRange = clipTime >= 0 && clipTime <= options.playableSec;

    if (options.algorithm === 'legacy') {
      // 修正前の standard preview の追従（0.5 秒超のずれで pause → seek → seeked 後に play）
      if (!inRange) {
        element.pause();
      } else {
        if (Math.abs(element.currentTime - sourceTime) > 0.5) {
          element.pause();
          seek(sourceTime, nowMs);
        }
        if (!element.seeking && element.readyState >= 2 && element.paused) {
          element.play(nowMs);
        }
      }
    } else {
      observePreviewAudioClipSync(state, element, nowMs);
      if (!inRange) {
        element.pause();
        const preroll = resolvePreviewAudioClipPrerollSeek({
          timeUntilStartSec: options.clipStartSec - time,
          trimStart: options.trimStart,
          element,
        });
        if (preroll !== null) {
          seek(preroll, nowMs);
          notePreviewAudioClipSeekIssued(state, nowMs);
        }
      } else {
        const decision = resolvePreviewAudioClipSyncDecision(state, {
          nowMs,
          element,
          targetSourceTime: sourceTime,
          endSourceTime: options.trimStart + options.playableSec,
          hold: false,
        });
        if (decision.pause) element.pause();
        if (decision.seekTo !== null) seek(decision.seekTo, nowMs);
        if (decision.play) element.play(nowMs);
      }
    }

    if (inRange) {
      inRangeFrames += 1;
      if (element.isProducingAudio(nowMs)) {
        audibleFrames += 1;
        maxAudibleDriftSec = Math.max(maxAudibleDriftSec, Math.abs(element.currentTime - sourceTime));
      }
    }
  }

  return {
    audibleRatio: inRangeFrames > 0 ? audibleFrames / inRangeFrames : 0,
    maxAudibleDriftSec,
    seekCount,
  };
}

describe('previewAudioClipSync: シークが遅い要素でも区間全体が無音にならない', () => {
  const slowCase = {
    seekLatencyMs: 600,
    playLatencyMs: 0,
    clipStartSec: 4,
    trimStart: 2.8,
    playableSec: 1.9,
    timelineStartSec: 0,
    initialElementTime: 0,
  };

  it('（前提の確認）修正前の追従ではシーク中に次のシークが重なり続け、区間全体が無音になる', () => {
    const result = simulate({ ...slowCase, algorithm: 'legacy' });
    expect(result.audibleRatio).toBe(0);
    expect(result.seekCount).toBeGreaterThan(2);
  });

  it('頭出しにより区間の頭から鳴り、シークは 1 回だけで済む', () => {
    const result = simulate({ ...slowCase, algorithm: 'sync' });
    expect(result.audibleRatio).toBeGreaterThan(0.95);
    expect(result.maxAudibleDriftSec).toBeLessThan(0.05);
    expect(result.seekCount).toBe(1);
  });

  it('区間の途中から再生しても、シークを重ねずに鳴り始める', () => {
    const legacy = simulate({ ...slowCase, algorithm: 'legacy', timelineStartSec: 4.2, playableSec: 4 });
    const result = simulate({ ...slowCase, algorithm: 'sync', timelineStartSec: 4.2, playableSec: 4 });
    expect(legacy.audibleRatio).toBe(0);
    expect(result.audibleRatio).toBeGreaterThan(0.6);
    expect(result.maxAudibleDriftSec).toBeLessThanOrEqual(0.5 + 1e-6);
  });

  it('シーク＋再生開始の遅れが合計 0.5 秒を超えても、区間内で鳴る', () => {
    const result = simulate({
      ...slowCase,
      algorithm: 'sync',
      seekLatencyMs: 400,
      playLatencyMs: 350,
      timelineStartSec: 4.2,
      playableSec: 4,
    });
    expect(result.audibleRatio).toBeGreaterThan(0.5);
  });

  it('シークが速い環境では従来どおり区間の頭から鳴る', () => {
    const result = simulate({ ...slowCase, algorithm: 'sync', seekLatencyMs: 30, playLatencyMs: 20 });
    expect(result.audibleRatio).toBeGreaterThan(0.95);
  });
});

describe('resolvePreviewAudioClipSyncDecision', () => {
  it('シーク中はずれが大きくても新しいシークを重ねず、音を止めて完了を待つ', () => {
    const state = createPreviewAudioClipSyncState();
    const decision = resolvePreviewAudioClipSyncDecision(state, {
      nowMs: 1000,
      element: el({ currentTime: 2.8, seeking: true }),
      targetSourceTime: 4,
      endSourceTime: 10,
      hold: false,
    });
    expect(decision).toEqual({ seekTo: null, play: false, pause: false, audible: false });
  });

  it('ずれが 0.5 秒を超えたら、シーク＋再生開始の所要時間ぶん先へシークする', () => {
    const state = createPreviewAudioClipSyncState();
    state.seekLatencySec = 0.6;
    state.playLatencySec = 0.1;
    const decision = resolvePreviewAudioClipSyncDecision(state, {
      nowMs: 1000,
      element: el({ currentTime: 0, paused: false }),
      targetSourceTime: 3,
      endSourceTime: 10,
      hold: false,
    });
    expect(decision.seekTo).toBeCloseTo(3.7, 5);
    expect(decision.pause).toBe(true);
    expect(decision.audible).toBe(false);
    expect(state.seekIssuedAtMs).toBe(1000);
  });

  it('先回り量は上限で打ち切り、区間の終端は越えない', () => {
    const state = createPreviewAudioClipSyncState();
    state.seekLatencySec = 3;
    state.playLatencySec = 1;
    const far = resolvePreviewAudioClipSyncDecision(state, {
      nowMs: 0,
      element: el({ currentTime: 0 }),
      targetSourceTime: 3,
      endSourceTime: 20,
      hold: false,
    });
    expect(far.seekTo).toBeCloseTo(3 + PREVIEW_AUDIO_CLIP_MAX_SEEK_LEAD_SEC, 5);

    const nearEnd = resolvePreviewAudioClipSyncDecision(createPreviewAudioClipSyncState(), {
      nowMs: 0,
      element: el({ currentTime: 0 }),
      targetSourceTime: 4.6,
      endSourceTime: 4.7,
      hold: false,
    });
    expect(nearEnd.seekTo).toBeCloseTo(4.65, 5);
  });

  it('先回りシークが早く終わったら、タイムラインが追いつくまで鳴らさずに待つ', () => {
    const state = createPreviewAudioClipSyncState();
    state.playLatencySec = 0.05;
    const early = resolvePreviewAudioClipSyncDecision(state, {
      nowMs: 0,
      element: el({ currentTime: 3.5 }),
      targetSourceTime: 3.2,
      endSourceTime: 10,
      hold: false,
    });
    expect(early).toEqual({ seekTo: null, play: false, pause: false, audible: false });

    const caughtUp = resolvePreviewAudioClipSyncDecision(state, {
      nowMs: 300,
      element: el({ currentTime: 3.5 }),
      targetSourceTime: 3.47,
      endSourceTime: 10,
      hold: false,
    });
    expect(caughtUp.play).toBe(true);
    expect(caughtUp.audible).toBe(true);
    expect(state.playRequestedAtMs).toBe(300);
  });

  it('play() 後に進み始めるまでは、ずれて見えても再シークしない', () => {
    const state = createPreviewAudioClipSyncState();
    state.playRequestedAtMs = 1000;
    state.playRequestedFromSec = 3;
    const element = el({ currentTime: 3, paused: false });
    observePreviewAudioClipSync(state, element, 1400);
    const decision = resolvePreviewAudioClipSyncDecision(state, {
      nowMs: 1400,
      element,
      targetSourceTime: 3.6,
      endSourceTime: 10,
      hold: false,
    });
    expect(decision.seekTo).toBeNull();
    expect(decision.audible).toBe(true);

    // 上限を過ぎても進まなければ、通常のずれ判定へ戻る
    const timeoutAt = 1000 + PREVIEW_AUDIO_CLIP_MAX_PLAY_START_WAIT_MS;
    observePreviewAudioClipSync(state, element, timeoutAt);
    const resync = resolvePreviewAudioClipSyncDecision(state, {
      nowMs: timeoutAt,
      element,
      targetSourceTime: 4.5,
      endSourceTime: 10,
      hold: false,
    });
    expect(resync.seekTo).not.toBeNull();
  });

  it('終端で止まった要素には play() しない（先頭から鳴り直すため）', () => {
    const decision = resolvePreviewAudioClipSyncDecision(createPreviewAudioClipSyncState(), {
      nowMs: 0,
      element: el({ currentTime: 12, ended: true }),
      targetSourceTime: 12,
      endSourceTime: 12,
      hold: false,
    });
    expect(decision.play).toBe(false);
    expect(decision.audible).toBe(false);
  });

  it('readyState が足りない間は play() しない', () => {
    const decision = resolvePreviewAudioClipSyncDecision(createPreviewAudioClipSyncState(), {
      nowMs: 0,
      element: el({ currentTime: 3, readyState: 1 }),
      targetSourceTime: 3,
      endSourceTime: 10,
      hold: false,
    });
    expect(decision.play).toBe(false);
  });

  it('hold 中は再生中の要素を止め、シークもしない', () => {
    const decision = resolvePreviewAudioClipSyncDecision(createPreviewAudioClipSyncState(), {
      nowMs: 0,
      element: el({ currentTime: 0, paused: false }),
      targetSourceTime: 5,
      endSourceTime: 10,
      hold: true,
    });
    expect(decision).toEqual({ seekTo: null, play: false, pause: true, audible: false });
  });

  it('再生中でずれが小さければ何もしない', () => {
    const decision = resolvePreviewAudioClipSyncDecision(createPreviewAudioClipSyncState(), {
      nowMs: 0,
      element: el({ currentTime: 3.2, paused: false }),
      targetSourceTime: 3.4,
      endSourceTime: 10,
      hold: false,
    });
    expect(decision).toEqual({ seekTo: null, play: false, pause: false, audible: true });
  });
});

describe('observePreviewAudioClipSync / resetPreviewAudioClipSyncPending', () => {
  it('発行したシークの完了で所要時間を学習し、遅くなった環境にはすぐ合わせる', () => {
    const state = createPreviewAudioClipSyncState();
    notePreviewAudioClipSeekIssued(state, 1000);
    observePreviewAudioClipSync(state, el({ seeking: true }), 1300);
    expect(state.seekIssuedAtMs).toBe(1000);
    observePreviewAudioClipSync(state, el({ seeking: false }), 1700);
    expect(state.seekIssuedAtMs).toBeNull();
    expect(state.seekLatencySec).toBeCloseTo(0.7, 5);
  });

  it('速くなったときは推定値をゆっくり下げる', () => {
    const state = createPreviewAudioClipSyncState();
    state.seekLatencySec = 0.8;
    notePreviewAudioClipSeekIssued(state, 0);
    observePreviewAudioClipSync(state, el(), 100);
    expect(state.seekLatencySec).toBeCloseTo(0.45, 5);
  });

  it('play() 後に currentTime が進んだら再生開始の所要時間を学習する', () => {
    const state = createPreviewAudioClipSyncState();
    state.playRequestedAtMs = 0;
    state.playRequestedFromSec = 2;
    observePreviewAudioClipSync(state, el({ currentTime: 2.05, paused: false }), 300);
    expect(state.playRequestedAtMs).toBeNull();
    expect(state.playLatencySec).toBeCloseTo(0.3, 5);
  });

  it('play() が止められたら待機をやめる', () => {
    const state = createPreviewAudioClipSyncState();
    state.playRequestedAtMs = 0;
    observePreviewAudioClipSync(state, el({ paused: true }), 100);
    expect(state.playRequestedAtMs).toBeNull();
  });

  it('停止中のリセット後は、放置時間を所要時間として学習しない', () => {
    const state = createPreviewAudioClipSyncState();
    const before = state.seekLatencySec;
    notePreviewAudioClipSeekIssued(state, 0);
    resetPreviewAudioClipSyncPending(state);
    observePreviewAudioClipSync(state, el(), 60_000);
    expect(state.seekLatencySec).toBe(before);
  });
});

describe('resolvePreviewAudioClipPrerollSeek', () => {
  it('区間開始の直前に、止まっている要素を区間の頭へシークする', () => {
    expect(resolvePreviewAudioClipPrerollSeek({
      timeUntilStartSec: 1,
      trimStart: 2.8,
      element: el({ currentTime: 0 }),
    })).toBe(2.8);
  });

  it('開始まで遠い・開始済み・頭出し済み・シーク中・再生中・未読込なら何もしない', () => {
    const base = { trimStart: 2.8 };
    expect(resolvePreviewAudioClipPrerollSeek({ ...base, timeUntilStartSec: PREVIEW_AUDIO_CLIP_PREROLL_SEC + 0.1, element: el() })).toBeNull();
    expect(resolvePreviewAudioClipPrerollSeek({ ...base, timeUntilStartSec: 0, element: el() })).toBeNull();
    expect(resolvePreviewAudioClipPrerollSeek({ ...base, timeUntilStartSec: -1, element: el() })).toBeNull();
    expect(resolvePreviewAudioClipPrerollSeek({ ...base, timeUntilStartSec: 1, element: el({ currentTime: 2.82 }) })).toBeNull();
    expect(resolvePreviewAudioClipPrerollSeek({ ...base, timeUntilStartSec: 1, element: el({ seeking: true }) })).toBeNull();
    expect(resolvePreviewAudioClipPrerollSeek({ ...base, timeUntilStartSec: 1, element: el({ paused: false }) })).toBeNull();
    expect(resolvePreviewAudioClipPrerollSeek({ ...base, timeUntilStartSec: 1, element: el({ readyState: 0 }) })).toBeNull();
  });
});
