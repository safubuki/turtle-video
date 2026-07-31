/**
 * timelineWaveform.ts の純ロジックテスト（Issue #217）。
 *
 * 固定する不変条件:
 * - クリップがタイムライン座標へ正しく配置される（開始位置・トリム・音量・フェード）
 * - 波形ピークの長さ = bucketCount（＝描画幅と時間軸の対応が壊れない）
 * - 無音区間がタイムライン座標で返り、既存の時分割と同じ判定ルールを使う
 * - 無音検出の対象を絞れる（BGM が鳴っていてもナレーションの「間」を拾える）
 * - 無音境界ナビゲーションが現在位置から前後の境界へ正しく動く
 */
import { describe, it, expect } from 'vitest';
import {
  buildTimelineWaveform,
  composeTimelinePcm,
  detectTimelineSilences,
  collectSeekBoundaries,
  findAdjacentSilenceBoundary,
  resolveSilenceSource,
  TIMELINE_WAVEFORM_SAMPLE_RATE,
  type TimelinePlacement,
  type TimelineSilenceRegion,
} from '../utils/timelineWaveform';
import type { MonoPcm } from '../utils/audioWaveform';

const RATE = 8000;

/** 指定区間だけ振幅 amp のサイン波、それ以外は無音の PCM を作る */
function buildPcm(
  segments: Array<{ from: number; to: number; amp: number }>,
  totalSec: number,
  sampleRate = RATE,
): MonoPcm {
  const total = Math.round(totalSec * sampleRate);
  const samples = new Float32Array(total);
  for (const seg of segments) {
    const start = Math.round(seg.from * sampleRate);
    const end = Math.round(seg.to * sampleRate);
    for (let i = start; i < end && i < total; i++) {
      samples[i] = seg.amp * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }
  }
  return { samples, sampleRate };
}

/** 一定振幅（DC）の PCM。配置・音量の検証を振幅の比較だけで行うために使う */
function buildConstantPcm(value: number, totalSec: number, sampleRate = RATE): MonoPcm {
  const samples = new Float32Array(Math.round(totalSec * sampleRate));
  samples.fill(value);
  return { samples, sampleRate };
}

function placement(overrides: Partial<TimelinePlacement> = {}): TimelinePlacement {
  return {
    id: 'clip-1',
    kind: 'narration',
    pcm: buildConstantPcm(1, 4),
    timelineStart: 0,
    sourceStart: 0,
    sourceEnd: 4,
    volume: 1,
    ...overrides,
  };
}

/** 指定秒の合成後サンプル値 */
function sampleAt(pcm: MonoPcm, sec: number): number {
  const index = Math.round(sec * pcm.sampleRate);
  return (pcm.samples as Float32Array)[index] ?? 0;
}

describe('composeTimelinePcm', () => {
  it('タイムライン全長ぶんのバッファを返す', () => {
    const mixed = composeTimelinePcm([placement()], 10, RATE);
    expect(mixed.sampleRate).toBe(RATE);
    expect(mixed.samples.length).toBe(10 * RATE);
  });

  it('timelineStart の位置へ配置し、その前後は無音のままにする', () => {
    const mixed = composeTimelinePcm(
      [placement({ pcm: buildConstantPcm(1, 2), sourceEnd: 2, timelineStart: 3 })],
      10,
      RATE,
    );
    expect(sampleAt(mixed, 1)).toBe(0);
    expect(sampleAt(mixed, 4)).toBeCloseTo(1, 5);
    expect(sampleAt(mixed, 6)).toBe(0);
  });

  it('sourceStart / sourceEnd のトリムを反映する', () => {
    // 音源は 0-1 秒だけ音があり、1-4 秒は無音。sourceStart=1 なら配置後は無音になる。
    const pcm = buildConstantPcm(0, 4);
    (pcm.samples as Float32Array).fill(1, 0, RATE);

    const trimmedToSilence = composeTimelinePcm(
      [placement({ pcm, sourceStart: 1, sourceEnd: 3, timelineStart: 0 })],
      5,
      RATE,
    );
    expect(sampleAt(trimmedToSilence, 0.5)).toBe(0);

    const trimmedToAudio = composeTimelinePcm(
      [placement({ pcm, sourceStart: 0, sourceEnd: 1, timelineStart: 0 })],
      5,
      RATE,
    );
    expect(sampleAt(trimmedToAudio, 0.5)).toBeCloseTo(1, 5);
  });

  it('音量を掛ける（0 のクリップは合成されない）', () => {
    const half = composeTimelinePcm([placement({ volume: 0.5 })], 5, RATE);
    expect(sampleAt(half, 1)).toBeCloseTo(0.5, 5);

    const muted = composeTimelinePcm([placement({ volume: 0 })], 5, RATE);
    expect(sampleAt(muted, 1)).toBe(0);
  });

  it('フェードイン・フェードアウトを反映する', () => {
    const mixed = composeTimelinePcm(
      [placement({ pcm: buildConstantPcm(1, 4), sourceEnd: 4, fadeInSec: 1, fadeOutSec: 1 })],
      4,
      RATE,
    );
    // フェードイン途中（0.5秒）は約半分、中央は等倍、フェードアウト途中（3.5秒）は約半分
    expect(sampleAt(mixed, 0.5)).toBeCloseTo(0.5, 1);
    expect(sampleAt(mixed, 2)).toBeCloseTo(1, 5);
    expect(sampleAt(mixed, 3.5)).toBeCloseTo(0.5, 1);
  });

  it('重なったクリップを加算合成する', () => {
    const mixed = composeTimelinePcm(
      [
        placement({ id: 'a', pcm: buildConstantPcm(0.3, 4), sourceEnd: 4 }),
        placement({ id: 'b', pcm: buildConstantPcm(0.4, 4), sourceEnd: 4 }),
      ],
      4,
      RATE,
    );
    expect(sampleAt(mixed, 1)).toBeCloseTo(0.7, 5);
  });

  it('タイムライン外へはみ出すクリップを切り詰める', () => {
    const mixed = composeTimelinePcm(
      [placement({ pcm: buildConstantPcm(1, 10), sourceEnd: 10, timelineStart: 1 })],
      3,
      RATE,
    );
    expect(mixed.samples.length).toBe(3 * RATE);
    expect(sampleAt(mixed, 2.5)).toBeCloseTo(1, 5);
  });

  it('タイムライン全長 0 や配置なしでも例外を投げない', () => {
    expect(composeTimelinePcm([], 0, RATE).samples).toHaveLength(0);
    expect(composeTimelinePcm([], 5, RATE).samples).toHaveLength(5 * RATE);
    expect(composeTimelinePcm([placement()], Number.NaN, RATE).samples).toHaveLength(0);
  });

  it('サンプルレートが違う音源をリサンプルして配置する', () => {
    const mixed = composeTimelinePcm(
      [placement({ pcm: buildConstantPcm(1, 2, 44100), sourceEnd: 2, timelineStart: 1 })],
      5,
      RATE,
    );
    expect(sampleAt(mixed, 0.5)).toBe(0);
    expect(sampleAt(mixed, 2)).toBeCloseTo(1, 5);
    expect(sampleAt(mixed, 4)).toBe(0);
  });
});

describe('detectTimelineSilences', () => {
  it('無音区間を silenceStart / silenceEnd 付きで返す', () => {
    // 0.0-0.8 音 / 0.8-1.2 無音 / 1.2-2.0 音
    const pcm = buildPcm([
      { from: 0, to: 0.8, amp: 0.6 },
      { from: 1.2, to: 2.0, amp: 0.6 },
    ], 2);

    const silences = detectTimelineSilences(pcm);
    const gap = silences.find((s) => s.center > 0.85 && s.center < 1.15);
    expect(gap).toBeDefined();
    expect(gap!.silenceStart).toBeGreaterThan(0.7);
    expect(gap!.silenceEnd).toBeLessThan(1.3);
    expect(gap!.silenceEnd).toBeGreaterThan(gap!.silenceStart);
    expect(gap!.duration).toBeCloseTo(gap!.silenceEnd - gap!.silenceStart, 5);
    expect(gap!.center).toBeCloseTo((gap!.silenceStart + gap!.silenceEnd) / 2, 5);
  });

  it('完全無音・空バッファでは何も返さない', () => {
    expect(detectTimelineSilences({ samples: new Float32Array(RATE), sampleRate: RATE })).toEqual([]);
    expect(detectTimelineSilences({ samples: new Float32Array(0), sampleRate: RATE })).toEqual([]);
  });
});

describe('buildTimelineWaveform', () => {
  const narrationPcm = buildPcm([
    { from: 0, to: 0.8, amp: 0.6 },
    { from: 1.6, to: 2.4, amp: 0.6 },
  ], 3);
  const bgmPcm = buildPcm([{ from: 0, to: 3, amp: 0.5 }], 3);

  const narrationPlacement = placement({
    id: 'narration-1',
    kind: 'narration',
    pcm: narrationPcm,
    sourceEnd: 3,
  });
  const bgmPlacement = placement({
    id: 'bgmclip_1',
    kind: 'bgm',
    pcm: bgmPcm,
    sourceEnd: 3,
  });

  it('ピークの本数は bucketCount と一致する（描画幅と時間軸の対応を保つ）', () => {
    const result = buildTimelineWaveform([narrationPlacement], 3, { bucketCount: 200 });
    expect(result.peaks).toHaveLength(200);
    expect(result.duration).toBe(3);
  });

  it('BGM が鳴っていてもナレーション基準なら「間」を検出できる', () => {
    const result = buildTimelineWaveform([narrationPlacement, bgmPlacement], 3, {
      bucketCount: 128,
      silenceSource: 'narration',
    });
    expect(result.silenceSource).toBe('narration');
    expect(result.silences.length).toBeGreaterThanOrEqual(1);
    const gap = result.silences.find((s) => s.center > 0.85 && s.center < 1.55);
    expect(gap).toBeDefined();

    // 同じ素材でも全体音声基準なら BGM に埋もれて検出されない
    const allResult = buildTimelineWaveform([narrationPlacement, bgmPlacement], 3, {
      bucketCount: 128,
      silenceSource: 'all',
    });
    expect(allResult.silences).toHaveLength(0);
  });

  it('ナレーションが無ければ動画音声を基準に無音区間を検出する', () => {
    // 動画だけのプロジェクト（BGM もナレーションも無い）。
    // 動画音声にも「間」があるので、そこを拾えること。
    const videoPlacement = placement({
      id: 'media-1',
      kind: 'video',
      pcm: narrationPcm,
      sourceEnd: 3,
    });

    const result = buildTimelineWaveform([videoPlacement], 3, {
      bucketCount: 64,
      silenceSource: 'narration',
    });
    expect(result.silenceSource).toBe('video');
    expect(result.silences.length).toBeGreaterThanOrEqual(1);
  });

  it('動画だけのプロジェクトでも波形（peaks）が作られる', () => {
    const videoPlacement = placement({
      id: 'media-1',
      kind: 'video',
      pcm: buildPcm([{ from: 0, to: 3, amp: 0.6 }], 3),
      sourceEnd: 3,
    });

    const result = buildTimelineWaveform([videoPlacement], 3, { bucketCount: 64 });
    expect(result.peaks).toHaveLength(64);
    expect(Array.from(result.peaks).some((v) => v > 0.1)).toBe(true);
  });

  it('BGM しか無ければ BGM を基準にする', () => {
    const result = buildTimelineWaveform([bgmPlacement], 3, {
      bucketCount: 64,
      silenceSource: 'narration',
    });
    expect(result.silenceSource).toBe('bgm');
  });

  it('動画音声も全体波形へ含まれる', () => {
    const videoPlacement = placement({
      id: 'media-1',
      kind: 'video',
      pcm: buildPcm([{ from: 0, to: 3, amp: 0.6 }], 3),
      sourceEnd: 3,
    });

    const narrationOnly = buildTimelineWaveform([narrationPlacement], 3, { bucketCount: 64 });
    const withVideo = buildTimelineWaveform([narrationPlacement, videoPlacement], 3, {
      bucketCount: 64,
    });
    // ナレーションの無音区間にあたるバケットが、動画音声を足すと 0 でなくなる
    const silentBucket = Math.floor((1.2 / 3) * 64);
    expect(narrationOnly.peaks[silentBucket]).toBeCloseTo(0, 5);
    expect(withVideo.peaks[silentBucket]).toBeGreaterThan(0.1);
  });

  it('全体波形には BGM も含まれる（最終的に再生される音声を反映する）', () => {
    const narrationOnly = buildTimelineWaveform([narrationPlacement], 3, { bucketCount: 64 });
    const withBgm = buildTimelineWaveform([narrationPlacement, bgmPlacement], 3, {
      bucketCount: 64,
    });
    // ナレーションの無音区間にあたるバケットが、BGM を足すと 0 でなくなる
    const silentBucket = Math.floor((1.2 / 3) * 64);
    expect(narrationOnly.peaks[silentBucket]).toBeCloseTo(0, 5);
    expect(withBgm.peaks[silentBucket]).toBeGreaterThan(0.1);
  });

  it('プロジェクト尺が変わると時間軸も変わる', () => {
    const short = buildTimelineWaveform([narrationPlacement], 3, { bucketCount: 64 });
    const long = buildTimelineWaveform([narrationPlacement], 6, { bucketCount: 64 });
    expect(short.duration).toBe(3);
    expect(long.duration).toBe(6);
    // 同じ素材でも尺が倍になれば、音のある部分は左半分へ寄る
    expect(long.peaks[40]).toBeCloseTo(0, 5);
    expect(short.peaks[40]).toBeGreaterThan(0.1);
  });

  it('既定サンプルレートで動作する', () => {
    const result = buildTimelineWaveform([narrationPlacement], 3, { bucketCount: 32 });
    expect(TIMELINE_WAVEFORM_SAMPLE_RATE).toBeGreaterThan(0);
    expect(result.peaks).toHaveLength(32);
  });
});

describe('resolveSilenceSource', () => {
  const narration = placement({ id: 'n', kind: 'narration' });
  const video = placement({ id: 'v', kind: 'video' });
  const bgm = placement({ id: 'b', kind: 'bgm' });

  it('希望する対象があればそれを使う', () => {
    expect(resolveSilenceSource([narration, video, bgm], 'narration')).toBe('narration');
    expect(resolveSilenceSource([narration, video, bgm], 'video')).toBe('video');
    expect(resolveSilenceSource([narration, video, bgm], 'bgm')).toBe('bgm');
  });

  it('ナレーションが無ければ動画音声 → BGM の順に落ちる', () => {
    expect(resolveSilenceSource([video, bgm], 'narration')).toBe('video');
    expect(resolveSilenceSource([bgm], 'narration')).toBe('bgm');
  });

  it('動画音声を希望しても無ければ BGM へ落ちる（ナレーションへは戻らない）', () => {
    // 優先順の「後ろ」だけを辿るので、明示指定より前の対象へは戻さない
    expect(resolveSilenceSource([narration, bgm], 'video')).toBe('bgm');
  });

  it('配置が無ければ all を返す', () => {
    expect(resolveSilenceSource([], 'narration')).toBe('all');
  });

  it('all は配置があるかぎりそのまま使う', () => {
    expect(resolveSilenceSource([bgm], 'all')).toBe('all');
  });
});

describe('collectSeekBoundaries', () => {
  const silences: TimelineSilenceRegion[] = [
    { silenceStart: 1, silenceEnd: 2, duration: 1, center: 1.5 },
    { silenceStart: 5, silenceEnd: 6, duration: 1, center: 5.5 },
  ];

  it('動画の先頭（0秒）と末尾を候補へ含める', () => {
    expect(collectSeekBoundaries(silences, 10)).toEqual([0, 1, 2, 5, 6, 10]);
  });

  it('無音区間が無くても先頭と末尾へは移動できる', () => {
    expect(collectSeekBoundaries([], 10)).toEqual([0, 10]);
  });

  it('端に接した無音区間で重複した候補を作らない', () => {
    // 0秒から始まる無音区間は「先頭」と同じ位置なので 1 つにまとめる
    const atEdges: TimelineSilenceRegion[] = [
      { silenceStart: 0, silenceEnd: 0.5, duration: 0.5, center: 0.25 },
      { silenceStart: 9.5, silenceEnd: 10, duration: 0.5, center: 9.75 },
    ];
    expect(collectSeekBoundaries(atEdges, 10)).toEqual([0, 0.5, 9.5, 10]);
  });

  it('タイムライン外の候補を切り捨てる', () => {
    const outside: TimelineSilenceRegion[] = [
      { silenceStart: 8, silenceEnd: 12, duration: 4, center: 10 },
    ];
    expect(collectSeekBoundaries(outside, 10)).toEqual([0, 8, 10]);
  });

  it('全長が 0 なら候補を作らない', () => {
    expect(collectSeekBoundaries([], 0)).toEqual([]);
  });
});

describe('findAdjacentSilenceBoundary', () => {
  const silences: TimelineSilenceRegion[] = [
    { silenceStart: 1, silenceEnd: 2, duration: 1, center: 1.5 },
    { silenceStart: 5, silenceEnd: 6, duration: 1, center: 5.5 },
  ];

  it('後ろ方向の最も近い境界を返す', () => {
    expect(findAdjacentSilenceBoundary(silences, 0, 'next', 10)).toBe(1);
    expect(findAdjacentSilenceBoundary(silences, 1.5, 'next', 10)).toBe(2);
    expect(findAdjacentSilenceBoundary(silences, 3, 'next', 10)).toBe(5);
  });

  it('前方向の最も近い境界を返す', () => {
    expect(findAdjacentSilenceBoundary(silences, 7, 'prev', 10)).toBe(6);
    expect(findAdjacentSilenceBoundary(silences, 5.5, 'prev', 10)).toBe(5);
    expect(findAdjacentSilenceBoundary(silences, 3, 'prev', 10)).toBe(2);
  });

  it('動画の先頭（0秒）へ戻れる', () => {
    // 1つ目のキャプションを動画の先頭から始めたいケース
    expect(findAdjacentSilenceBoundary(silences, 0.5, 'prev', 10)).toBe(0);
    expect(findAdjacentSilenceBoundary(silences, 1, 'prev', 10)).toBe(0);
  });

  it('動画の末尾へ進める', () => {
    expect(findAdjacentSilenceBoundary(silences, 7, 'next', 10)).toBe(10);
  });

  it('無音区間が無くても先頭・末尾へ移動できる', () => {
    expect(findAdjacentSilenceBoundary([], 5, 'prev', 10)).toBe(0);
    expect(findAdjacentSilenceBoundary([], 5, 'next', 10)).toBe(10);
  });

  it('端では null を返す（それ以上動かない）', () => {
    expect(findAdjacentSilenceBoundary(silences, 0, 'prev', 10)).toBeNull();
    expect(findAdjacentSilenceBoundary(silences, 10, 'next', 10)).toBeNull();
    expect(findAdjacentSilenceBoundary([], 1, 'next', 0)).toBeNull();
  });

  it('現在位置と同じ境界では足踏みしない', () => {
    // ちょうど境界上に居るとき、同じ位置を返さず次の境界へ進む
    expect(findAdjacentSilenceBoundary(silences, 2, 'next', 10)).toBe(5);
    expect(findAdjacentSilenceBoundary(silences, 5, 'prev', 10)).toBe(2);
  });

  it('comfortable では長い無音を前後 0.1 秒の余白位置へずらす', () => {
    // silence 1〜2 / 5〜6 → 1.1, 1.9 / 5.1, 5.9
    expect(collectSeekBoundaries(silences, 10, 0.05, 'comfortable')).toEqual([
      0, 1.1, 1.9, 5.1, 5.9, 10,
    ]);
    expect(findAdjacentSilenceBoundary(silences, 0, 'next', 10, 0.05, 'comfortable')).toBe(1.1);
    expect(findAdjacentSilenceBoundary(silences, 1.5, 'next', 10, 0.05, 'comfortable')).toBe(1.9);
    expect(findAdjacentSilenceBoundary(silences, 3, 'next', 10, 0.05, 'comfortable')).toBe(5.1);
  });

  it('comfortable では短い無音を中央 1 点だけにし、間を空けない', () => {
    const short: TimelineSilenceRegion[] = [
      { silenceStart: 2.9, silenceEnd: 3.1, duration: 0.2, center: 3 },
    ];
    expect(collectSeekBoundaries(short, 10, 0.05, 'comfortable')).toEqual([0, 3, 10]);
    expect(findAdjacentSilenceBoundary(short, 0, 'next', 10, 0.05, 'comfortable')).toBe(3);
    // exact では開始・終了の 2 点
    expect(collectSeekBoundaries(short, 10, 0.05, 'exact')).toEqual([0, 2.9, 3.1, 10]);
  });
});
