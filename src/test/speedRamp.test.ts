/**
 * @file speedRamp.test.ts
 * @description 速度のなめらか接続（スピードランプ）の純ロジック・store 同期の契約テスト
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildVideoSpeedRamp,
  computeTimelineDurationFromSource,
  normalizeSpeedRampDuration,
  resolveExportTimelineWallDivisorForItem,
  resolveItemPlaybackSpeedAtLocalTime,
  resolveSpeedRampFromSpeed,
  resolveVideoCatchUpState,
  resolveVideoElementPlaybackRateForContext,
  resolveVideoLocalTimeAtSourceOffset,
  resolveVideoPlaybackSpeedAtLocalTime,
  resolveVideoSourceOffsetAtLocalTime,
  resolveVideoSourceTime,
  resolveVideoSpeedRampForItem,
  syncVideoSpeedRampItems,
  type VideoSpeedRamp,
} from '../utils/playbackSpeed';
import { resolveVideoSplitSourceTime } from '../utils/media';
import { wsolaTimeStretchChannelMapped } from '../utils/audioTimeStretch';
import { useMediaStore } from '../stores/mediaStore';
import type { MediaItem } from '../types';

function ramp(from: number, to: number, durationSec = 1, source = 10): VideoSpeedRamp {
  const r = buildVideoSpeedRamp({ fromSpeed: from, toSpeed: to, durationSec, sourceClipDuration: source });
  if (!r) throw new Error('ramp expected');
  return r;
}

function video(id: string, overrides: Partial<MediaItem> = {}): MediaItem {
  const trimStart = overrides.trimStart ?? 0;
  const trimEnd = overrides.trimEnd ?? 10;
  const speed = overrides.playbackSpeed ?? 1;
  return {
    id,
    file: new File(['x'], `${id}.mp4`, { type: 'video/mp4' }),
    type: 'video',
    url: `blob:${id}`,
    volume: 1,
    isMuted: false,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 1,
    fadeOutDuration: 1,
    duration: (trimEnd - trimStart) / speed,
    originalDuration: 20,
    trimStart,
    trimEnd,
    scale: 1,
    positionX: 0,
    positionY: 0,
    rotation: 0,
    blur: 0,
    isTransformOpen: false,
    isLocked: false,
    playbackSpeed: speed,
    ...overrides,
  };
}

function image(id: string): MediaItem {
  return { ...video(id), type: 'image', duration: 3, trimStart: 0, trimEnd: 0, originalDuration: 0 };
}

describe('buildVideoSpeedRamp（段の作り方）', () => {
  it('1 倍 → 0.8 倍を、両端を除いた中間の速さで単調に下げていく', () => {
    const r = ramp(1, 0.8);
    expect(r.fromSpeed).toBe(1);
    expect(r.toSpeed).toBe(0.8);
    expect(r.steps.length).toBeGreaterThanOrEqual(2);
    const speeds = r.steps.map((step) => step.speed);
    for (const s of speeds) {
      expect(s).toBeLessThan(1);
      expect(s).toBeGreaterThan(0.8);
    }
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeLessThan(speeds[i - 1]);
    // 隣り合う速さ（両端を含む）の比は 4〜5% 程度に収まり、段差として目立たない
    const chain = [1, ...speeds, 0.8];
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i - 1] / chain[i]).toBeLessThan(1.05);
    }
    expect(r.timelineDuration).toBeCloseTo(1, 9);
  });

  it('スロー → 等倍・倍速方向にも作れる（逆向きは単調に上げる）', () => {
    const up = ramp(0.8, 1);
    const speeds = up.steps.map((step) => step.speed);
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeGreaterThan(speeds[i - 1]);
    const fast = ramp(1, 4, 2);
    expect(fast.steps[fast.steps.length - 1].speed).toBeLessThan(4);
    expect(fast.steps.length).toBeLessThanOrEqual(12);
  });

  it('同じ速さ（差 0.05 未満）・ソース尺 0 は作らない', () => {
    expect(buildVideoSpeedRamp({ fromSpeed: 1, toSpeed: 1, durationSec: 1, sourceClipDuration: 10 })).toBeNull();
    expect(buildVideoSpeedRamp({ fromSpeed: 1, toSpeed: 0.8, durationSec: 1, sourceClipDuration: 0 })).toBeNull();
  });

  it('段の 1 つは 0.1 秒より短くしない（rate の切り替えを詰めすぎない）', () => {
    const r = ramp(1, 0.5, 0.5);
    expect(r.timelineDuration / r.steps.length).toBeGreaterThanOrEqual(0.1 - 1e-9);
  });

  it('クリップが短いときはクリップ全体を段に充て、ソース尺を超えない', () => {
    const r = ramp(1, 0.8, 2, 0.6);
    expect(r.sourceDuration).toBeCloseTo(0.6, 9);
    expect(r.timelineDuration).toBeLessThan(2);
    expect(computeTimelineDurationFromSource(0.6, 0.8, r)).toBeCloseTo(r.timelineDuration, 9);
  });

  it('かける時間は 0.5 / 1 / 2 秒へ丸め、不正値は 1 秒', () => {
    expect(normalizeSpeedRampDuration(0.5)).toBe(0.5);
    expect(normalizeSpeedRampDuration(1.2)).toBe(1);
    expect(normalizeSpeedRampDuration(3)).toBe(2);
    expect(normalizeSpeedRampDuration(undefined)).toBe(1);
    expect(normalizeSpeedRampDuration(-1)).toBe(1);
  });
});

describe('なめらか接続のタイムライン ↔ ソース対応', () => {
  const r = ramp(1, 0.8);

  it('段の境目・段の終わりでソース位置が連続する（映像が飛ばない）', () => {
    const eps = 1e-6;
    const boundaries = [...r.steps.slice(1).map((s) => s.timelineStart), r.timelineDuration];
    for (const t of boundaries) {
      const before = resolveVideoSourceOffsetAtLocalTime(t - eps, 0.8, r);
      const after = resolveVideoSourceOffsetAtLocalTime(t + eps, 0.8, r);
      expect(Math.abs(after - before)).toBeLessThan(1e-5);
    }
  });

  it('速さは 1 → 段 → 0.8 と移り、段の後は設定速度', () => {
    expect(resolveVideoPlaybackSpeedAtLocalTime(0, 0.8, r)).toBe(r.steps[0].speed);
    expect(resolveVideoPlaybackSpeedAtLocalTime(r.timelineDuration + 0.01, 0.8, r)).toBe(0.8);
    expect(resolveVideoPlaybackSpeedAtLocalTime(5, 0.8, null)).toBe(0.8);
  });

  it('逆変換で元に戻る', () => {
    for (const t of [0, 0.05, 0.31, 0.77, 0.999, 1.5, 4]) {
      const src = resolveVideoSourceOffsetAtLocalTime(t, 0.8, r);
      expect(resolveVideoLocalTimeAtSourceOffset(src, 0.8, r)).toBeCloseTo(t, 9);
    }
  });

  it('タイムライン尺 = 段の区間 + 残りを設定速度で割った尺（1→0.8・1 秒なら単純な割り算より短い）', () => {
    const linear = computeTimelineDurationFromSource(10, 0.8);
    const withRamp = computeTimelineDurationFromSource(10, 0.8, r);
    expect(linear).toBeCloseTo(12.5, 9);
    expect(withRamp).toBeCloseTo(r.timelineDuration + (10 - r.sourceDuration) / 0.8, 9);
    expect(withRamp).toBeLessThan(linear);
    // 終端のソース位置がちょうど trimEnd になる
    expect(resolveVideoSourceTime({ trimStart: 3, localTime: withRamp, playbackSpeed: 0.8, speedRamp: r }))
      .toBeCloseTo(13, 9);
  });

  it('なめらか接続なし（speedRamp 未指定）は従来の計算と完全一致', () => {
    expect(resolveVideoSourceTime({ trimStart: 2, localTime: 3, playbackSpeed: 2 })).toBe(8);
    expect(resolveVideoSourceTime({ trimStart: 2, localTime: 3, playbackSpeed: 2, speedRamp: null })).toBe(8);
  });
});

describe('実行時の速さ（rate・追従補正・export 壁時計）', () => {
  it('段の速さを 0.1 刻みに丸めずに rate へ渡す', () => {
    expect(resolveVideoElementPlaybackRateForContext(false, 0.9667)).toBeCloseTo(0.9667, 4);
    expect(resolveVideoElementPlaybackRateForContext(true, 0.9667)).toBeCloseTo(0.9667, 4);
    // export の倍速段は従来どおり rate=1（壁時計 dilation 側で速さを表す）
    expect(resolveVideoElementPlaybackRateForContext(true, 1.37)).toBe(1);
    expect(resolveVideoCatchUpState({
      isExporting: false,
      playbackSpeed: 0.9667,
      videoCurrentTime: 1,
      targetSourceTime: 1,
      canCatchUp: true,
    }).rate).toBeCloseTo(0.9667, 4);
  });

  it('export 壁時計の割り算は、倍速の段ではその段の速さ・スローの段では 1', () => {
    const items = syncVideoSpeedRampItems([
      video('a', { playbackSpeed: 1 }),
      video('b', { playbackSpeed: 2, speedRampIn: true }),
    ]);
    const b = items[1];
    const r = resolveVideoSpeedRampForItem(b)!;
    expect(r).not.toBeNull();
    const divisor = resolveExportTimelineWallDivisorForItem(b, 0.01);
    expect(divisor).toBeCloseTo(r.steps[0].speed, 6);
    expect(divisor).toBeGreaterThan(1);
    expect(divisor).toBeLessThan(2);
    expect(resolveExportTimelineWallDivisorForItem(b, 3)).toBe(2);
    // localTime 未指定は従来どおり設定速度
    expect(resolveExportTimelineWallDivisorForItem(b)).toBe(2);
    expect(resolveItemPlaybackSpeedAtLocalTime(image('i'), 0)).toBe(1);
  });
});

describe('resolveSpeedRampFromSpeed / syncVideoSpeedRampItems（並びからの取り直し）', () => {
  it('直前が動画で速さが違うときだけ、直前の速さを開始速度にする', () => {
    expect(resolveSpeedRampFromSpeed([video('a'), video('b', { playbackSpeed: 0.8 })], 1)).toBe(1);
    expect(resolveSpeedRampFromSpeed([video('b', { playbackSpeed: 0.8 })], 0)).toBeUndefined();
    expect(resolveSpeedRampFromSpeed([image('i'), video('b', { playbackSpeed: 0.8 })], 1)).toBeUndefined();
    expect(resolveSpeedRampFromSpeed([video('a', { playbackSpeed: 0.8 }), video('b', { playbackSpeed: 0.8 })], 1))
      .toBeUndefined();
    const pair = { layout: 'side-by-side', divider: 'straight', fit: 'cover', lineColor: 'white' } as never;
    expect(resolveSpeedRampFromSpeed([video('a', { splitCompareToNext: pair }), video('b', { playbackSpeed: 0.8 })], 1))
      .toBeUndefined();
  });

  it('なめらか接続を使っていない並びは同じ配列を返す（従来の尺に触らない）', () => {
    const items = [video('a'), video('b', { playbackSpeed: 0.8 })];
    expect(syncVideoSpeedRampItems(items)).toBe(items);
  });

  it('ON のカードは開始速度と尺を取り直し、前のカードは変えない', () => {
    const items = [video('a'), video('b', { playbackSpeed: 0.8, speedRampIn: true, speedRampDuration: 1 })];
    const synced = syncVideoSpeedRampItems(items);
    expect(synced[0]).toBe(items[0]);
    expect(synced[1].speedRampFromSpeed).toBe(1);
    expect(synced[1].duration).toBeLessThan(12.5);
    // 2 回目は変化なし
    expect(syncVideoSpeedRampItems(synced)).toBe(synced);
  });

  it('開始速度が無くなった（直前が画像になった）ら派生値を消して従来の尺へ戻す', () => {
    const synced = syncVideoSpeedRampItems([
      video('a'),
      video('b', { playbackSpeed: 0.8, speedRampIn: true }),
    ]);
    const reordered = syncVideoSpeedRampItems([image('i'), synced[1]]);
    expect(reordered[1].speedRampFromSpeed).toBeUndefined();
    expect(reordered[1].duration).toBeCloseTo(12.5, 9);
  });

  it('分割位置はなめらか接続の段を含めて換算する', () => {
    const [, b] = syncVideoSpeedRampItems([
      video('a'),
      video('b', { playbackSpeed: 0.8, speedRampIn: true, trimStart: 2, trimEnd: 12 }),
    ]);
    const r = resolveVideoSpeedRampForItem(b)!;
    const local = 3;
    expect(resolveVideoSplitSourceTime(b, local)).toBeCloseTo(
      2 + r.sourceDuration + (local - r.timelineDuration) * 0.8,
      9,
    );
  });
});

describe('mediaStore のなめらか接続', () => {
  beforeEach(() => {
    useMediaStore.setState({ mediaItems: [], totalDuration: 0, isClipsLocked: false });
  });

  function setItems(items: MediaItem[]) {
    useMediaStore.setState({ mediaItems: items, totalDuration: items.reduce((s, i) => s + i.duration, 0) });
  }

  it('ON にすると尺と総尺が段の分だけ変わり、OFF で元に戻る', () => {
    setItems([video('a'), video('b', { playbackSpeed: 0.8 })]);
    const before = useMediaStore.getState().totalDuration;
    expect(before).toBeCloseTo(22.5, 9);

    useMediaStore.getState().updateVideoSpeedRampIn('b', true);
    let state = useMediaStore.getState();
    const b = state.mediaItems[1];
    expect(b.speedRampIn).toBe(true);
    expect(b.speedRampFromSpeed).toBe(1);
    expect(b.duration).toBeLessThan(12.5);
    expect(state.totalDuration).toBeCloseTo(10 + b.duration, 9);

    useMediaStore.getState().updateVideoSpeedRampIn('b', false);
    state = useMediaStore.getState();
    expect(state.mediaItems[1].speedRampFromSpeed).toBeUndefined();
    expect(state.mediaItems[1].duration).toBeCloseTo(12.5, 9);
    expect(state.totalDuration).toBeCloseTo(before, 9);
  });

  it('前のカードの速度を変えると、後ろのカードの開始速度と尺も追従する', () => {
    setItems([video('a'), video('b', { playbackSpeed: 0.8 })]);
    useMediaStore.getState().updateVideoSpeedRampIn('b', true);
    const durationFrom1 = useMediaStore.getState().mediaItems[1].duration;

    useMediaStore.getState().updateVideoPlaybackSpeed('a', 2);
    const b = useMediaStore.getState().mediaItems[1];
    expect(b.speedRampFromSpeed).toBe(2);
    expect(b.duration).not.toBeCloseTo(durationFrom1, 6);

    // 前を同じ速さにすると段は無くなる
    useMediaStore.getState().updateVideoPlaybackSpeed('a', 0.8);
    const same = useMediaStore.getState().mediaItems[1];
    expect(same.speedRampFromSpeed).toBeUndefined();
    expect(same.duration).toBeCloseTo(12.5, 9);
  });

  it('前のカードを消すと先頭になり、なめらか接続は効かなくなる', () => {
    setItems([video('a'), video('b', { playbackSpeed: 0.8 })]);
    useMediaStore.getState().updateVideoSpeedRampIn('b', true);
    useMediaStore.getState().removeMediaItem('a');
    const [b] = useMediaStore.getState().mediaItems;
    expect(b.speedRampIn).toBe(true);
    expect(b.speedRampFromSpeed).toBeUndefined();
    expect(b.duration).toBeCloseTo(12.5, 9);
    expect(useMediaStore.getState().totalDuration).toBeCloseTo(12.5, 9);
  });

  it('保存読込（restoreFromSave）でも並びから取り直す', () => {
    useMediaStore.getState().restoreFromSave(
      [video('a'), video('b', { playbackSpeed: 0.8, speedRampIn: true, speedRampDuration: 2 })],
      false,
    );
    const state = useMediaStore.getState();
    expect(state.mediaItems[1].speedRampFromSpeed).toBe(1);
    expect(state.mediaItems[1].duration).toBeLessThan(12.5);
    expect(state.totalDuration).toBeCloseTo(10 + state.mediaItems[1].duration, 9);
  });

  it('分割は前半の終わり = 後半の始まり（同じ瞬間を重ねず・すき間も作らない）', () => {
    setItems([video('a', { trimStart: 0, trimEnd: 15.04, originalDuration: 15.04 })]);
    useMediaStore.getState().splitMediaItem('a', 13.383333);
    const [first, second] = useMediaStore.getState().mediaItems;
    // 1/100 秒へ丸めない（丸めると前半と後半で 1 コマ重なったり、すき間ができたりする）
    expect(first.trimEnd).toBe(13.383333);
    expect(second.trimStart).toBe(first.trimEnd);
    expect(first.duration + second.duration).toBeCloseTo(15.04, 9);
    expect(useMediaStore.getState().totalDuration).toBeCloseTo(15.04, 9);
  });

  it('分割の後半はなめらか接続を持たず、前半は保つ', () => {
    setItems([video('a'), video('b', { playbackSpeed: 0.8 })]);
    useMediaStore.getState().updateVideoSpeedRampIn('b', true);
    const b = useMediaStore.getState().mediaItems[1];
    useMediaStore.getState().splitMediaItem('b', b.duration / 2);
    const [, first, second] = useMediaStore.getState().mediaItems;
    expect(first.speedRampIn).toBe(true);
    expect(first.speedRampFromSpeed).toBe(1);
    expect(second.speedRampIn).toBeUndefined();
    expect(second.speedRampFromSpeed).toBeUndefined();
    // 分割前後で総尺は変わらない（同じ映像を同じ速さで流す）
    expect(useMediaStore.getState().totalDuration).toBeCloseTo(10 + b.duration, 6);
  });
});

describe('wsolaTimeStretchChannelMapped（なめらか接続の音声伸縮）', () => {
  it('指定した長さで出力し、途中に無音の隙間を作らない', () => {
    const sr = 8000;
    const input = new Float32Array(sr * 3);
    for (let i = 0; i < input.length; i++) input[i] = Math.sin((2 * Math.PI * 220 * i) / sr) * 0.5;
    const r = ramp(1, 0.8, 1, 3);
    const outSec = computeTimelineDurationFromSource(3, 0.8, r);
    const outLen = Math.round(outSec * sr);
    const out = wsolaTimeStretchChannelMapped(
      input,
      outLen,
      (o) => resolveVideoSourceOffsetAtLocalTime(o / sr, 0.8, r) * sr,
      512,
    );
    expect(out.length).toBe(outLen);
    // 20ms ごとの RMS が末尾以外で落ち込まない（段の境目で途切れない）
    const win = Math.floor(sr * 0.02);
    for (let start = 0; start + win < outLen - 512; start += win) {
      let sum = 0;
      for (let i = start; i < start + win; i++) sum += out[i] * out[i];
      expect(Math.sqrt(sum / win)).toBeGreaterThan(0.2);
    }
  });
});
