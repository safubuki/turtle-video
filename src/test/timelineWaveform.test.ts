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
  detectTimelineClippingRegions,
  planClippingFixUpdates,
  resolveClippingFixScales,
  resolveMaximizeVolumeScale,
  planVolumeMaximizeUpdates,
  composeTimelinePcm,
  detectTimelineSilences,
  collectSeekBoundaries,
  findAdjacentSilenceBoundary,
  resolveSilenceSource,
  resolveTimelinePlayheadPercent,
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

  it('playbackSpeed=2 ではソース全内容をタイムライン半分の尺へ圧縮して貼る', () => {
    // 0-2s にだけ音がある 4s 音源を、speed=2 で貼ると timeline 0-1s に 0-2s 分が入る
    const pcm = buildConstantPcm(0, 4);
    (pcm.samples as Float32Array).fill(1, 0, 2 * RATE);

    const mixed = composeTimelinePcm(
      [placement({
        pcm,
        sourceStart: 0,
        sourceEnd: 4,
        timelineStart: 0,
        playbackSpeed: 2,
      })],
      4,
      RATE,
    );
    // timeline 0.5s → source 1.0s（音あり）
    expect(sampleAt(mixed, 0.5)).toBeCloseTo(1, 5);
    // timeline 1.5s はクリップ外（timeline 尺は 4/2=2s までだが、1.5 は source 3s 相当＝無音）
    expect(sampleAt(mixed, 1.5)).toBe(0);
    // timeline 2.5s は配置終端より後ろ
    expect(sampleAt(mixed, 2.5)).toBe(0);
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

  /**
   * エンドロール区間の BGM フェードを波形にも反映する。
   * 反映しないと「徐々に消す設定なのに波形が細くならない」食い違いになる。
   */
  describe('エンドロール区間の BGM フェード', () => {
    const bgmPlacement = () => ({
      id: 'bgm-1',
      kind: 'bgm' as const,
      pcm: { samples: new Float32Array(RATE * 10).fill(1), sampleRate: RATE },
      timelineStart: 0,
      sourceStart: 0,
      sourceEnd: 10,
      volume: 1,
    });

    /** 指定秒あたりの振幅（絶対値）を取る */
    const amplitudeAt = (mixed: { samples: ArrayLike<number> }, sec: number) =>
      Math.abs(mixed.samples[Math.floor(sec * RATE)] ?? 0);

    it('フェード指定なしなら従来どおり減衰しない', () => {
      const mixed = composeTimelinePcm([bgmPlacement()], 10, RATE);
      expect(amplitudeAt(mixed, 5)).toBeCloseTo(1, 3);
      expect(amplitudeAt(mixed, 9.5)).toBeCloseTo(1, 3);
    });

    it('本編は等倍のまま、エンドロール区間だけ 0 へ向かって減衰する', () => {
      // 本編 5 秒 + エンドロール 5 秒（fadeStart = 5、全長 10）
      const mixed = composeTimelinePcm([bgmPlacement()], 10, RATE, { fadeStartSec: 5 });

      // 本編中は減衰しない
      expect(amplitudeAt(mixed, 2)).toBeCloseTo(1, 3);
      expect(amplitudeAt(mixed, 5)).toBeCloseTo(1, 2);
      // エンドロール区間は線形に落ちる
      expect(amplitudeAt(mixed, 7.5)).toBeCloseTo(0.5, 1);
      expect(amplitudeAt(mixed, 9.9)).toBeLessThan(0.1);
    });

    it('null / 範囲外の指定は無視する（設定解除・エンドロール削除時）', () => {
      const off = composeTimelinePcm([bgmPlacement()], 10, RATE, null);
      expect(amplitudeAt(off, 9.5)).toBeCloseTo(1, 3);

      // fadeStart が全長以上（エンドロールが実質無い）
      const outOfRange = composeTimelinePcm([bgmPlacement()], 10, RATE, { fadeStartSec: 10 });
      expect(amplitudeAt(outOfRange, 9.5)).toBeCloseTo(1, 3);
    });

    it('ナレーションには掛からない（BGM だけが対象）', () => {
      const narration = {
        ...bgmPlacement(),
        id: 'narration-1',
        kind: 'narration' as const,
      };
      const mixed = composeTimelinePcm([narration], 10, RATE, { fadeStartSec: 5 });
      expect(amplitudeAt(mixed, 9.5)).toBeCloseTo(1, 3);
    });
  });
});

describe('resolveTimelinePlayheadPercent', () => {
  it('シークバーと波形で同じ百分率を返す', () => {
    expect(resolveTimelinePlayheadPercent(0, 20)).toBe(0);
    expect(resolveTimelinePlayheadPercent(5, 20)).toBe(25);
    expect(resolveTimelinePlayheadPercent(15, 20)).toBe(75);
    expect(resolveTimelinePlayheadPercent(20, 20)).toBe(100);
  });

  it('後半でも線形のまま（ネイティブ range の端インセットを入れない）', () => {
    expect(resolveTimelinePlayheadPercent(18, 20)).toBe(90);
    expect(resolveTimelinePlayheadPercent(19.8, 20)).toBeCloseTo(99, 5);
  });

  it('不正値やゼロ尺は 0 に倒す', () => {
    expect(resolveTimelinePlayheadPercent(5, 0)).toBe(0);
    expect(resolveTimelinePlayheadPercent(Number.NaN, 10)).toBe(0);
    expect(resolveTimelinePlayheadPercent(5, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('detectTimelineClippingRegions（音割れの可能性がある区間）', () => {
  it('上限付近のバケットを区間にし、0.5 秒以内の隙間はまとめる', () => {
    // 10 秒・10 バケット（1 バケット 1 秒）
    const peaks = new Float32Array([0.2, 0.99, 1.2, 0.3, 0.3, 0.3, 1.0, 0.1, 0.1, 0.1]);
    expect(detectTimelineClippingRegions(peaks, 10)).toEqual([
      { start: 1, end: 3 },
      { start: 6, end: 7 },
    ]);
  });

  it('上限に届かなければ空・長さ 0 も空', () => {
    expect(detectTimelineClippingRegions(new Float32Array([0.5, 0.97]), 2)).toEqual([]);
    expect(detectTimelineClippingRegions(new Float32Array([1.5]), 0)).toEqual([]);
    expect(detectTimelineClippingRegions(new Float32Array([]), 10)).toEqual([]);
  });
});

describe('resolveClippingFixScales（音割れの自動調整）', () => {
  it('音割れ区間で重なっている素材を同じ割合で下げ、合成後の最大振幅を目標以下にする', () => {
    // 0〜4 秒: 動画 0.6×1.5=0.9 と BGM 0.5×1=0.5 が重なり、合成 1.4 で音割れ
    const video = placement({ id: 'v', kind: 'video', pcm: buildConstantPcm(0.6, 4), volume: 1.5 });
    const bgm = placement({ id: 'b', kind: 'bgm', pcm: buildConstantPcm(0.5, 4), volume: 1 });
    const fixes = resolveClippingFixScales([video, bgm], 4);
    expect(fixes.map((f) => f.id).sort()).toEqual(['b', 'v']);
    const scaleOf = (id: string) => fixes.find((f) => f.id === id)!.scale;
    // 同じ割合で下げる（バランスを保つ）
    expect(scaleOf('v')).toBeCloseTo(scaleOf('b'), 6);
    const fixed = composeTimelinePcm([
      { ...video, volume: video.volume * scaleOf('v') },
      { ...bgm, volume: bgm.volume * scaleOf('b') },
    ], 4);
    expect(Math.max(...Array.from(fixed.samples as Float32Array, Math.abs))).toBeLessThanOrEqual(0.9701);
  });

  it('音割れ区間で鳴っていない素材とロック中の素材は変えない', () => {
    // 動画は 0〜2 秒だけ大きい。ナレーションは 3〜4 秒（重ならない）
    const video = placement({ id: 'v', kind: 'video', pcm: buildConstantPcm(0.8, 2), sourceEnd: 2, volume: 2 });
    const narration = placement({ id: 'n', kind: 'narration', pcm: buildConstantPcm(0.5, 1), sourceEnd: 1, timelineStart: 3 });
    const fixes = resolveClippingFixScales([video, narration], 4);
    expect(fixes.map((f) => f.id)).toEqual(['v']);
    expect(fixes[0].scale).toBeCloseTo(0.97 / 1.6, 4);
    expect(resolveClippingFixScales([video, narration], 4, { fixedIds: new Set(['v']) })).toEqual([]);
  });

  it('音割れ箇所が複数あっても倍率を掛け合わせず、一番大きく下げる必要がある箇所に合わせる（ぎりぎりで止める）', () => {
    // 0〜1 秒: 振幅 0.6、2〜3 秒: 振幅 0.5、4〜5 秒: 振幅 0.55。音量 300% で 3 か所とも音割れ
    const pcm = buildPcm([
      { from: 0, to: 1, amp: 0.6 },
      { from: 2, to: 3, amp: 0.5 },
      { from: 4, to: 5, amp: 0.55 },
    ], 5);
    const peak = Math.max(...Array.from(pcm.samples as Float32Array, Math.abs));
    const fixes = resolveClippingFixScales([placement({ id: 'v', kind: 'video', pcm, sourceEnd: 5, volume: 3 })], 5);
    // 最大振幅 0.6 の箇所だけで決まる: 3 × scale × 0.6 = 0.97
    expect(fixes[0].scale).toBeCloseTo(0.97 / (3 * peak), 4);
    expect(3 * fixes[0].scale).toBeGreaterThan(1.6); // 300% → 約 162%（掛け合わせると 100% 未満まで下がっていた）
  });

  it('音割れが無ければ何も変えない', () => {
    expect(resolveClippingFixScales([placement({ pcm: buildConstantPcm(0.5, 4) })], 4)).toEqual([]);
  });
});

describe('planClippingFixUpdates（一括音量設定との連携）', () => {
  it('ナレーションの一括音量設定が ON のときは個別更新せず一括音量を最小倍率へ下げ、チェックを外さない', () => {
    const plan = planClippingFixUpdates({
      scales: [
        { id: 'n1', kind: 'narration', scale: 0.8 },
        { id: 'n2', kind: 'narration', scale: 0.9 },
      ],
      videos: [],
      bgms: [],
      narrations: [
        { id: 'n1', volume: 1.2 },
        { id: 'n2', volume: 1.2 },
      ],
      bulk: {
        video: { enabled: false, volume: 1, hasLockedVideo: false },
        bgm: { enabled: false, volume: 1 },
        narration: { enabled: true, volume: 1.2 },
      },
    });

    expect(plan.itemUpdates).toEqual([]);
    expect(plan.bulkUpdates).toEqual([{ kind: 'narration', from: 1.2, to: 0.96 }]);
    expect(plan.changes).toEqual(['ナレーション一括 120%→96%']);
  });

  it('一括音量設定が ON の種別は一括更新、OFF の種別は個別更新として両方正しく処理する', () => {
    const plan = planClippingFixUpdates({
      scales: [
        { id: 'v1', kind: 'video', scale: 0.7 },
        { id: 'b1', kind: 'bgm', scale: 0.8 },
        { id: 'n1', kind: 'narration', scale: 0.85 },
      ],
      videos: [{ id: 'v1', volume: 1.5 }],
      bgms: [{ id: 'b1', volume: 1 }],
      narrations: [{ id: 'n1', volume: 1.2 }],
      bulk: {
        video: { enabled: false, volume: 1, hasLockedVideo: false },
        bgm: { enabled: true, volume: 1 },
        narration: { enabled: true, volume: 1.2 },
      },
    });

    expect(plan.itemUpdates).toEqual([{ id: 'v1', kind: 'video', index: 0, from: 1.5, to: 1.05 }]);
    expect(plan.bulkUpdates).toEqual([
      { kind: 'bgm', from: 1, to: 0.8 },
      { kind: 'narration', from: 1.2, to: 1.02 },
    ]);
    expect(plan.changes).toEqual(['動画1 150%→105%', 'BGM一括 100%→80%', 'ナレーション一括 120%→102%']);
  });

  it('動画に個別ロッククリップが混在する場合は一括更新を避けて未ロックのみ個別更新する', () => {
    const plan = planClippingFixUpdates({
      scales: [{ id: 'v1', kind: 'video', scale: 0.8 }],
      videos: [
        { id: 'v1', volume: 1.5 },
        { id: 'v2', volume: 1.5 },
      ],
      bgms: [],
      narrations: [],
      bulk: {
        video: { enabled: true, volume: 1.5, hasLockedVideo: true },
        bgm: { enabled: false, volume: 1 },
        narration: { enabled: false, volume: 1 },
      },
    });

    expect(plan.bulkUpdates).toEqual([]);
    expect(plan.itemUpdates).toEqual([{ id: 'v1', kind: 'video', index: 0, from: 1.5, to: 1.2 }]);
  });
});

describe('resolveMaximizeVolumeScale（音割れしない最大まで上げる）', () => {
  const peakOf = (placements: TimelinePlacement[], total: number) =>
    Math.max(...Array.from(composeTimelinePcm(placements, total).samples as Float32Array, Math.abs));

  it('他の音はそのままに、その種類だけを合成の最大振幅が 0.97 になるまで上げる', () => {
    // BGM 0.3 と ナレーション 0.2×音量1（重なる）。ナレーションだけ上げる: 0.3 + 0.2s = 0.97 → s = 3.35 だが
    // 音量は 300% まで。ナレーション音量 0.5 なら 0.1s → s = 6.7 だが上限 3/0.5 = 6。ここでは 0.4×音量1 で 1.675
    const bgm = placement({ id: 'b', kind: 'bgm', pcm: buildConstantPcm(0.3, 4), volume: 1 });
    const narration = placement({ id: 'n', kind: 'narration', pcm: buildConstantPcm(0.4, 4), volume: 1 });
    const scale = resolveMaximizeVolumeScale([bgm, narration], 4, 'narration')!;
    expect(scale).toBeCloseTo((0.97 - 0.3) / 0.4, 4);
    const raised = { ...narration, volume: narration.volume * scale };
    expect(peakOf([bgm, raised], 4)).toBeLessThanOrEqual(0.9701);
    expect(peakOf([bgm, raised], 4)).toBeGreaterThan(0.96);
  });

  it('音量上限（300%）で頭打ちになるときは、それ以上の倍率を返さない', () => {
    const narration = placement({ id: 'n', kind: 'narration', pcm: buildConstantPcm(0.1, 4), volume: 1 });
    expect(resolveMaximizeVolumeScale([narration], 4, 'narration')).toBeCloseTo(3, 6);
  });

  it('今が上げすぎなら 1 未満（音割れしないぎりぎりまで下げる）', () => {
    const video = placement({ id: 'v', kind: 'video', pcm: buildConstantPcm(0.8, 4), volume: 1.5 });
    expect(resolveMaximizeVolumeScale([video], 4, 'video')).toBeCloseTo(0.97 / 1.2, 4);
  });

  it('他の音だけで上限を超えている箇所は条件に入れない（その種類では直せないため）', () => {
    // 0〜2 秒: BGM だけで 1.2（ナレーションなし）。2〜4 秒: BGM 0.3 ＋ ナレーション 0.2
    const bgmPcm = buildPcm([], 4);
    for (let i = 0; i < bgmPcm.samples.length; i++) (bgmPcm.samples as Float32Array)[i] = i < 2 * RATE ? 1.2 : 0.3;
    const bgm = placement({ id: 'b', kind: 'bgm', pcm: bgmPcm, volume: 1 });
    const narration = placement({
      id: 'n', kind: 'narration', pcm: buildConstantPcm(0.4, 2), sourceEnd: 2, timelineStart: 2, volume: 1,
    });
    expect(resolveMaximizeVolumeScale([bgm, narration], 4, 'narration')).toBeCloseTo((0.97 - 0.3) / 0.4, 4);
  });

  it('対象がロック中・ミュート（音量 0）・存在しないときは null', () => {
    const narration = placement({ id: 'n', kind: 'narration', pcm: buildConstantPcm(0.2, 4) });
    expect(resolveMaximizeVolumeScale([narration], 4, 'narration', { fixedIds: new Set(['n']) })).toBeNull();
    expect(resolveMaximizeVolumeScale([{ ...narration, volume: 0 }], 4, 'narration')).toBeNull();
    expect(resolveMaximizeVolumeScale([narration], 4, 'bgm')).toBeNull();
  });
});

describe('planVolumeMaximizeUpdates', () => {
  it('一括音量 ON なら一括音量だけを、上限 300% で切り捨てて変える', () => {
    const plan = planVolumeMaximizeUpdates({
      label: 'BGM', scale: 1.678, items: [{ id: 'a', volume: 1 }], bulk: { enabled: true, volume: 1 },
    });
    expect(plan.bulkUpdate).toEqual({ from: 1, to: 1.67 });
    expect(plan.itemUpdates).toEqual([]);
    expect(planVolumeMaximizeUpdates({
      label: 'BGM', scale: 5, items: [], bulk: { enabled: true, volume: 1 },
    }).bulkUpdate?.to).toBe(3);
  });

  it('一括音量 OFF なら各素材を同じ割合で変え、ロック中・ミュートは変えない', () => {
    const plan = planVolumeMaximizeUpdates({
      label: 'ナレーション',
      scale: 1.5,
      items: [{ id: 'a', volume: 1 }, { id: 'b', volume: 0 }, { id: 'c', volume: 0.8 }, { id: 'd', volume: 2.5 }],
      fixedIds: new Set(['c']),
      bulk: { enabled: false, volume: 1 },
    });
    expect(plan.itemUpdates).toEqual([
      { id: 'a', index: 0, from: 1, to: 1.5 },
      { id: 'd', index: 3, from: 2.5, to: 3 },
    ]);
    expect(plan.changes).toEqual(['ナレーション1 100%→150%', 'ナレーション4 250%→300%']);
  });

  it('変化が 1% 未満なら何もしない（すでにぎりぎり）', () => {
    const plan = planVolumeMaximizeUpdates({
      label: '動画', scale: 1.004, items: [{ id: 'a', volume: 1 }], bulk: { enabled: false, volume: 1 },
    });
    expect(plan.changes).toEqual([]);
  });
});
