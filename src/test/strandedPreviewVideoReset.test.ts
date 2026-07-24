/**
 * エクスポート後プレビュー黒フレーム点滅対策のテスト（Issue #209）。
 *
 * エクスポートで active video を終端まで再生すると、要素は ended（readyState 4・currentTime≒尺末）で残る。
 * 次のプレビュー開始で先頭へ巻き戻すと、Chrome では ended 由来の逆方向シークが settle せず、
 * preflight が「準備済み(readyState≥2)」と早期判定→ループ側が毎フレーム currentTime を再代入し続けて
 * シークが完了せず readyState が 1 へ落ち、約500msごとの黒フレーム点滅になる。
 * `shouldResetStrandedPreviewVideo` は、warmup で load() による decoder リセットが必要な状態
 * （メタデータ未取得 / ended / target を大きく超えた currentTime）を判定する。
 *
 * 再発（13-139）では readyState<=1+seeking 以外にも paused 残留や寸法 0 で
 * 「静止画のままスライダーだけ進む」ことがあり、拡張 stall 判定と awaited load() を追加した。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isActiveVideoUndrawableForStall,
  POST_EXPORT_DRAWABLE_FRAMES_TO_CLEAR_GUARD,
  resetSharedPreviewVideoElement,
  shouldRecoverDecodeStalledActiveVideo,
  shouldResetStrandedPreviewVideo,
  waitForSharedPreviewMediaRemount,
} from '../flavors/standard/preview/usePreviewEngine';

describe('shouldResetStrandedPreviewVideo', () => {
  it('readyState 0（メタデータ未取得）は load() リセット対象', () => {
    expect(
      shouldResetStrandedPreviewVideo({
        readyState: 0,
        ended: false,
        currentTime: 0,
        warmupTargetTime: 0,
      }),
    ).toBe(true);
  });

  it('ended（エクスポートで終端まで再生された取り残し）は load() リセット対象', () => {
    expect(
      shouldResetStrandedPreviewVideo({
        readyState: 4,
        ended: true,
        currentTime: 10.005,
        warmupTargetTime: 0,
      }),
    ).toBe(true);
  });

  it('ended フラグが無くても currentTime が target を大きく超えていればリセット対象', () => {
    expect(
      shouldResetStrandedPreviewVideo({
        readyState: 4,
        ended: false,
        currentTime: 9.8,
        warmupTargetTime: 0,
      }),
    ).toBe(true);
  });

  it('通常の warmup シーク幅（±0.2s 程度）ではリセットしない（既存挙動を維持）', () => {
    expect(
      shouldResetStrandedPreviewVideo({
        readyState: 4,
        ended: false,
        currentTime: 0.15,
        warmupTargetTime: 0,
      }),
    ).toBe(false);
  });

  it('健全な準備済み video（target 付近・非 ended）はリセットしない', () => {
    expect(
      shouldResetStrandedPreviewVideo({
        readyState: 2,
        ended: false,
        currentTime: 3.0,
        warmupTargetTime: 3.0,
      }),
    ).toBe(false);
  });

  it('trimStart 付きクリップでも target 基準で判定する', () => {
    // warmupTargetTime=5.0（trimStart 由来）付近の currentTime はリセットしない
    expect(
      shouldResetStrandedPreviewVideo({
        readyState: 2,
        ended: false,
        currentTime: 5.1,
        warmupTargetTime: 5.0,
      }),
    ).toBe(false);
    // 同じ target でも尺末まで取り残された位置はリセットする
    expect(
      shouldResetStrandedPreviewVideo({
        readyState: 4,
        ended: false,
        currentTime: 10.0,
        warmupTargetTime: 5.0,
      }),
    ).toBe(true);
  });
});

describe('isActiveVideoUndrawableForStall', () => {
  it('readyState 不足・seeking・寸法0 を描画不能とみなす', () => {
    expect(isActiveVideoUndrawableForStall({
      readyState: 1, seeking: false, videoWidth: 1280, videoHeight: 720,
    })).toBe(true);
    expect(isActiveVideoUndrawableForStall({
      readyState: 4, seeking: true, videoWidth: 1280, videoHeight: 720,
    })).toBe(true);
    expect(isActiveVideoUndrawableForStall({
      readyState: 4, seeking: false, videoWidth: 0, videoHeight: 0,
    })).toBe(true);
  });

  it('paused 単体は stall にしない（hard reset 直後の再 reset ループ防止）', () => {
    expect(isActiveVideoUndrawableForStall({
      readyState: 4, seeking: false, paused: true, videoWidth: 1280, videoHeight: 720,
    })).toBe(false);
  });

  it('描画可能（readyState>=2・非seeking・寸法あり）は false', () => {
    expect(isActiveVideoUndrawableForStall({
      readyState: 4, seeking: false, videoWidth: 1280, videoHeight: 720,
    })).toBe(false);
  });
});

describe('shouldRecoverDecodeStalledActiveVideo', () => {
  const base = {
    isActivePlaying: true,
    isExporting: false,
    isUserSeeking: false,
    hasError: false,
    readyState: 1,
    seeking: true,
    nowMs: 10_000,
    stallSinceMs: 9_000, // 1s 継続
    lastRecoverAtMs: 0,
  };

  it('readyState<=1 + seeking が猶予を超えて継続していれば recover 対象（後方互換）', () => {
    expect(shouldRecoverDecodeStalledActiveVideo(base)).toBe(true);
  });

  it('拡張条件: videoWidth/Height 0 も recover 対象', () => {
    expect(
      shouldRecoverDecodeStalledActiveVideo({
        ...base,
        readyState: 2,
        seeking: false,
        paused: false,
        videoWidth: 0,
        videoHeight: 0,
      }),
    ).toBe(true);
  });

  it('拡張条件でも描画可能なら recover しない', () => {
    expect(
      shouldRecoverDecodeStalledActiveVideo({
        ...base,
        readyState: 4,
        seeking: false,
        paused: false,
        videoWidth: 1280,
        videoHeight: 720,
      }),
    ).toBe(false);
  });

  it('readyState1+seeking（ログ実測の固着）は recover 対象', () => {
    expect(
      shouldRecoverDecodeStalledActiveVideo({
        ...base,
        readyState: 1,
        seeking: true,
        paused: false,
        videoWidth: 1280,
        videoHeight: 720,
        stallSinceMs: 9_000,
      }),
    ).toBe(true);
  });

  it('stall が猶予（300ms）未満なら recover しない（正常な短い seek を壊さない）', () => {
    expect(
      shouldRecoverDecodeStalledActiveVideo({ ...base, stallSinceMs: 9_900 }),
    ).toBe(false);
  });

  it('直近 recover から throttle 間隔（1200ms）内なら再 recover しない', () => {
    expect(
      shouldRecoverDecodeStalledActiveVideo({ ...base, lastRecoverAtMs: 9_500 }),
    ).toBe(false);
  });

  it('readyState>=2（描画可能）なら後方互換モードでは stall ではない', () => {
    expect(
      shouldRecoverDecodeStalledActiveVideo({ ...base, readyState: 2 }),
    ).toBe(false);
  });

  it('seeking でなければ後方互換モードでは stall ではない', () => {
    expect(
      shouldRecoverDecodeStalledActiveVideo({ ...base, seeking: false }),
    ).toBe(false);
  });

  it('stallSinceMs 未観測（null）なら recover しない', () => {
    expect(
      shouldRecoverDecodeStalledActiveVideo({ ...base, stallSinceMs: null }),
    ).toBe(false);
  });

  it('エクスポート中・ユーザーシーク中・エラー時・非再生時は対象外', () => {
    expect(shouldRecoverDecodeStalledActiveVideo({ ...base, isExporting: true })).toBe(false);
    expect(shouldRecoverDecodeStalledActiveVideo({ ...base, isUserSeeking: true })).toBe(false);
    expect(shouldRecoverDecodeStalledActiveVideo({ ...base, hasError: true })).toBe(false);
    expect(shouldRecoverDecodeStalledActiveVideo({ ...base, isActivePlaying: false })).toBe(false);
  });
});

describe('resetSharedPreviewVideoElement', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function createMockVideo(initial: {
    readyState?: number;
    currentTime?: number;
    videoWidth?: number;
    videoHeight?: number;
  } = {}) {
    let readyState = initial.readyState ?? 4;
    let currentTime = initial.currentTime ?? 10;
    let seeking = false;
    let srcAttr = '';
    const listeners = new Map<string, Set<() => void>>();
    const video = {
      paused: false,
      ended: true,
      muted: false,
      preload: 'auto',
      error: null as MediaError | null,
      videoWidth: initial.videoWidth ?? 1280,
      videoHeight: initial.videoHeight ?? 720,
      get currentSrc() {
        return srcAttr;
      },
      get src() {
        return srcAttr;
      },
      set src(v: string) {
        srcAttr = v;
      },
      getAttribute(name: string) {
        return name === 'src' ? (srcAttr || null) : null;
      },
      setAttribute(name: string, value: string) {
        if (name === 'src') srcAttr = value;
      },
      removeAttribute(name: string) {
        if (name === 'src') srcAttr = '';
      },
      get readyState() {
        return readyState;
      },
      set readyState(v: number) {
        readyState = v;
      },
      get currentTime() {
        return currentTime;
      },
      set currentTime(v: number) {
        currentTime = v;
        seeking = true;
        queueMicrotask(() => {
          seeking = false;
          readyState = Math.max(readyState, 2);
          listeners.get('seeked')?.forEach((fn) => fn());
        });
      },
      get seeking() {
        return seeking;
      },
      pause: vi.fn(() => {
        video.paused = true;
      }),
      play: vi.fn(async () => {
        video.paused = false;
      }),
      load: vi.fn(() => {
        readyState = 0;
        seeking = false;
        video.ended = false;
        queueMicrotask(() => {
          readyState = 1;
          listeners.get('loadedmetadata')?.forEach((fn) => fn());
          queueMicrotask(() => {
            readyState = 4;
            listeners.get('loadeddata')?.forEach((fn) => fn());
          });
        });
      }),
      addEventListener: vi.fn((type: string, fn: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      }),
      removeEventListener: vi.fn((type: string, fn: () => void) => {
        listeners.get(type)?.delete(fn);
      }),
    };
    return video as unknown as HTMLVideoElement & {
      pause: ReturnType<typeof vi.fn>;
      load: ReturnType<typeof vi.fn>;
      play: ReturnType<typeof vi.fn>;
      readyState: number;
      currentTime: number;
      seeking: boolean;
      paused: boolean;
      ended: boolean;
    };
  }

  it('load mode: load() 後に targetTime へ seek し ready を返す', async () => {
    const video = createMockVideo({ readyState: 4, currentTime: 12 });
    const result = await resetSharedPreviewVideoElement(video, 0.5, () => true, 2000, 'load');
    expect(video.pause).toHaveBeenCalled();
    expect(video.load).toHaveBeenCalled();
    expect(result).toBe('ready');
    expect(video.currentTime).toBeCloseTo(0.5, 2);
  });

  it('hard mode: src を再設定してから seek する', async () => {
    const video = createMockVideo({ readyState: 4, currentTime: 12 });
    (video as HTMLVideoElement).setAttribute('src', 'blob:test-video');
    const result = await resetSharedPreviewVideoElement(video, 0.2, () => true, 2000, 'hard');
    expect(video.load).toHaveBeenCalled();
    expect(result).toBe('ready');
    expect(video.currentTime).toBeCloseTo(0.2, 2);
  });

  it('shouldContinue が false なら cancelled', async () => {
    const video = createMockVideo({ readyState: 4, currentTime: 12 });
    let alive = true;
    const p = resetSharedPreviewVideoElement(video, 0, () => alive, 2000);
    alive = false;
    const result = await p;
    expect(result).toBe('cancelled');
  });

  it('timeout までに metadata が来なければ timeout', async () => {
    const video = createMockVideo({ readyState: 0, currentTime: 0 });
    // load しても readyState を上げない
    (video as { load: ReturnType<typeof vi.fn> }).load = vi.fn(() => {
      /* stuck */
    });
    const result = await resetSharedPreviewVideoElement(video, 0, () => true, 80);
    expect(result).toBe('timeout');
  });
});

describe('waitForSharedPreviewMediaRemount', () => {
  it('全 video が metadata を持てば ready を返し trimStart へ seek する', async () => {
    const el = {
      readyState: 1,
      error: null,
      currentTime: 9,
    } as HTMLVideoElement;
    const result = await waitForSharedPreviewMediaRemount({
      getVideoItems: () => [{ id: 'v1', trimStart: 1.5 }],
      getVideoElement: () => el,
      shouldContinue: () => true,
      timeoutMs: 200,
      pollMs: 10,
    });
    expect(result).toBe('ready');
    expect(el.currentTime).toBeCloseTo(1.5, 2);
  });

  it('video が揃わなければ timeout', async () => {
    const result = await waitForSharedPreviewMediaRemount({
      getVideoItems: () => [{ id: 'v1', trimStart: 0 }],
      getVideoElement: () => undefined,
      shouldContinue: () => true,
      timeoutMs: 80,
      pollMs: 10,
    });
    expect(result).toBe('timeout');
  });

  it('shouldContinue が false なら cancelled', async () => {
    let alive = true;
    const p = waitForSharedPreviewMediaRemount({
      getVideoItems: () => [{ id: 'v1' }],
      getVideoElement: () => undefined,
      shouldContinue: () => alive,
      timeoutMs: 500,
      pollMs: 10,
    });
    alive = false;
    await expect(p).resolves.toBe('cancelled');
  });
});

describe('POST_EXPORT_DRAWABLE_FRAMES_TO_CLEAR_GUARD', () => {
  it('偽 drawable で早期 clear しないよう十分な連続フレーム数を要求する', () => {
    // previewlog2: 8 フレーム(~80ms) clear 後に再 wedge したため 45 前後を維持
    expect(POST_EXPORT_DRAWABLE_FRAMES_TO_CLEAR_GUARD).toBeGreaterThanOrEqual(30);
  });
});
