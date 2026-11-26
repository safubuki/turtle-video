import { describe, expect, it } from 'vitest';

import {
  computeExportCutFrameIndices,
  computeExportKeyframeAvoidRanges,
  createExportKeyframeDecider,
  EXPORT_KEYFRAME_AVOID_PRE_MARGIN_FRAMES,
  EXPORT_KEYFRAME_INTERVAL_SECONDS,
  EXPORT_KEYFRAME_MAX_INTERVAL_SECONDS,
  EXPORT_KEYFRAME_MIN_CUT_GAP_FRAMES,
  type ExportKeyframePlanItem,
} from '../flavors/standard/export/exportKeyframePlan';
import {
  computeExportVideoBitrate,
  computeStandardExportVideoBitrate,
  STANDARD_EXPORT_VIDEO_BITRATE_MIN,
} from '../constants';
import { getExportFrameTiming, resolveExportDuration } from '../utils/exportTimeline';
import {
  computeTransitionTimelineRanges,
  findActiveTimelineItemWithTransitions,
} from '../utils/transitionTimeline';

const FPS = 30;

const item = (
  id: string,
  duration: number,
  extra: Partial<ExportKeyframePlanItem> = {},
): ExportKeyframePlanItem => ({
  id,
  type: 'video',
  duration,
  transitionToNext: null,
  ...extra,
});

const totalOf = (items: ExportKeyframePlanItem[]) => {
  const ranges = computeTransitionTimelineRanges(items);
  return Math.max(...ranges.map((r) => r.end));
};

const keyframesOf = (decide: (i: number) => boolean, frameCount: number) =>
  Array.from({ length: frameCount }, (_, i) => i).filter(decide);

describe('computeExportCutFrameIndices', () => {
  it('ハードカットでは各クリップが最初に描かれるフレームを、描画と同じ判定（findActive）で求める', () => {
    const items = [item('truck', 4.02), item('bike', 12), item('third', 5.5)];
    const total = totalOf(items);
    const alignment = resolveExportDuration(total, FPS);
    const cuts = computeExportCutFrameIndices(items, alignment, FPS);

    expect(cuts).toHaveLength(2);
    for (const cut of cuts) {
      const at = (i: number) =>
        findActiveTimelineItemWithTransitions(
          items,
          getExportFrameTiming(alignment, FPS, i).timestampUs / 1e6,
          total,
        )?.id;
      // カットのコマで初めて別のクリップへ切り替わる
      expect(at(cut)).not.toBe(at(cut - 1));
    }
    // 4.02 秒の切り替えは 4.00 秒（120）ではなく 4.033 秒（121）のコマ
    expect(cuts[0]).toBe(121);
  });

  it('ディゾルブの開始コマでは強制キーフレームを打たない（重なり開始直後のレート崩れを防ぐ）', () => {
    const items = [item('a', 4, { transitionToNext: { type: 'dissolve', duration: 1 } }), item('b', 4)];
    const alignment = resolveExportDuration(totalOf(items), FPS);
    expect(computeExportCutFrameIndices(items, alignment, FPS)).toEqual([]);
  });

  it('フェード(黒/白)トランジションの中央境界はカットキーフレームとして扱う', () => {
    const items = [
      item('a', 4, { transitionToNext: { type: 'fade-black', duration: 1 } }),
      item('b', 4),
    ];
    const alignment = resolveExportDuration(totalOf(items), FPS);
    // 120 コマ目は 3.99996 秒（< 4.0 秒）のため、4.0 秒境界の最初のコマは 121
    expect(computeExportCutFrameIndices(items, alignment, FPS)).toEqual([121]);
  });

  it('2画面比較の partner は head と同時開始のためカットを増やさない', () => {
    const items = [
      item('left', 4, {
        splitCompareToNext: {
          layout: 'horizontal',
          divider: 'straight',
          fit: 'cover',
          lineColor: 'white',
          fadeIn: false,
          fadeOut: false,
          fadeInDuration: 1,
          fadeOutDuration: 1,
        },
      }),
      item('right', 5),
      item('next', 4),
    ];
    const alignment = resolveExportDuration(totalOf(items), FPS);
    // left/right のペアは 0〜5秒、next の開始（>= 5.0秒）の最初のコマ 151 だけがカット
    expect(computeExportCutFrameIndices(items, alignment, FPS)).toEqual([151]);
  });

  it('クリップが 1 本なら切り替えはない', () => {
    const items = [item('a', 6)];
    expect(computeExportCutFrameIndices(items, resolveExportDuration(6, FPS), FPS)).toEqual([]);
  });
});

describe('computeExportKeyframeAvoidRanges', () => {
  it('10秒動画の末尾1秒フェードアウト（9.0〜10.0秒）を直前マージン込みで回避区間にする', () => {
    const items = [item('turtle', 10, { fadeOut: true, fadeOutDuration: 1 })];
    const alignment = resolveExportDuration(totalOf(items), FPS);
    const avoid = computeExportKeyframeAvoidRanges(items, alignment, FPS);

    // 9.0 秒以上の最初のコマは 271（270 は 8.99991 秒）
    expect(avoid).toEqual([
      {
        startFrame: 271 - EXPORT_KEYFRAME_AVOID_PRE_MARGIN_FRAMES,
        endFrame: 299,
      },
    ]);
  });

  it('ディゾルブとフェードイン・フェードアウトの回避区間を抽出して統合する', () => {
    const items = [
      item('a', 4, {
        fadeIn: true,
        fadeInDuration: 1,
        transitionToNext: { type: 'dissolve', duration: 1 },
      }),
      item('b', 4, { fadeOut: true, fadeOutDuration: 1 }),
    ];
    const alignment = resolveExportDuration(totalOf(items), FPS);
    const avoid = computeExportKeyframeAvoidRanges(items, alignment, FPS);

    // nominalFrameDurationUs=33333 のため:
    // - fadeIn 0..1s: 1..30（frame 30 = 0.99999s < 1.0s）
    // - dissolve 3..4s: start 91 - margin .. end 120（frame 120 = 3.99996s < 4.0s）
    // - fadeOut 6..7s: start 181 - margin .. end 209
    expect(avoid).toHaveLength(3);
    expect(avoid[0]).toEqual({ startFrame: 1, endFrame: 30 });
    expect(avoid[1]).toEqual({
      startFrame: 91 - EXPORT_KEYFRAME_AVOID_PRE_MARGIN_FRAMES,
      endFrame: 120,
    });
    expect(avoid[2]).toEqual({
      startFrame: 181 - EXPORT_KEYFRAME_AVOID_PRE_MARGIN_FRAMES,
      endFrame: 209,
    });
  });

  it('2画面比較ペアはペア共通のフェード設定を回避区間へ反映する', () => {
    const items = [
      item('left', 4, {
        fadeOut: false,
        splitCompareToNext: {
          layout: 'horizontal',
          divider: 'straight',
          fit: 'cover',
          lineColor: 'white',
          fadeIn: false,
          fadeOut: true,
          fadeInDuration: 1,
          fadeOutDuration: 1,
        },
      }),
      item('right', 6, { fadeOut: false }),
    ];
    const alignment = resolveExportDuration(totalOf(items), FPS);
    const avoid = computeExportKeyframeAvoidRanges(items, alignment, FPS);

    // ペア尺 6 秒の末尾 1 秒（5.0〜6.0秒 = 151..179）が回避区間になる
    expect(avoid).toEqual([
      {
        startFrame: 151 - EXPORT_KEYFRAME_AVOID_PRE_MARGIN_FRAMES,
        endFrame: 179,
      },
    ]);
  });
});

describe('createExportKeyframeDecider', () => {
  it('切り替えや回避区間がなければ既定の 2 秒ごと（60コマ）になる', () => {
    const decide = createExportKeyframeDecider({ fps: FPS, cutFrameIndices: [] });
    expect(keyframesOf(decide, 190)).toEqual([0, 60, 120, 180]);
  });

  it('切り替えの 1 コマ前の定期キーフレームを省き、切り替えのコマをキーフレームにする（13-330 再現ケース）', () => {
    const decide = createExportKeyframeDecider({ fps: FPS, cutFrameIndices: [121] });
    expect(decide(120)).toBe(false);
    expect(decide(121)).toBe(true);
    expect(keyframesOf(decide, 200)).toEqual([0, 60, 121, 181]);
  });

  it('10秒動画の末尾1秒フェードアウト開始（9.00秒 = 270）にキーフレームを入れない', () => {
    const items = [item('turtle', 10, { fadeOut: true, fadeOutDuration: 1 })];
    const alignment = resolveExportDuration(totalOf(items), FPS);
    const cuts = computeExportCutFrameIndices(items, alignment, FPS);
    const avoid = computeExportKeyframeAvoidRanges(items, alignment, FPS);
    const decide = createExportKeyframeDecider({
      fps: FPS,
      cutFrameIndices: cuts,
      avoidRanges: avoid,
    });
    const keys = keyframesOf(decide, alignment.frameCount);

    expect(keys).toEqual([0, 60, 120, 180, 240]);
    expect(keys.some((k) => k >= 260 && k <= 299)).toBe(false);
  });

  it('フェードアウト開始が定期キーフレーム予定位置と重なるときは先送りして回避する', () => {
    // 10秒動画の末尾2秒フェードアウト（8.0〜10.0秒 = 240..299）。定期予定の 240 を先送りする
    const items = [item('turtle', 10, { fadeOut: true, fadeOutDuration: 2 })];
    const alignment = resolveExportDuration(totalOf(items), FPS);
    const avoid = computeExportKeyframeAvoidRanges(items, alignment, FPS);
    const decide = createExportKeyframeDecider({
      fps: FPS,
      cutFrameIndices: [],
      avoidRanges: avoid,
    });
    const keys = keyframesOf(decide, alignment.frameCount);

    expect(keys).toEqual([0, 60, 120, 180]);
    expect(keys.some((k) => k >= 230 && k <= 299)).toBe(false);
  });

  it('回避区間が終わった直後に、先送りした定期キーフレームを打つ', () => {
    // 4秒(120)でディゾルブ(3〜4秒 = 90..119, 回避 80..119) -> 60の次の定期120は回避直後の120に入る
    const items = [
      item('a', 4, { transitionToNext: { type: 'dissolve', duration: 1 } }),
      item('b', 4),
    ];
    const alignment = resolveExportDuration(totalOf(items), FPS);
    const cuts = computeExportCutFrameIndices(items, alignment, FPS);
    const avoid = computeExportKeyframeAvoidRanges(items, alignment, FPS);
    const decide = createExportKeyframeDecider({
      fps: FPS,
      cutFrameIndices: cuts,
      avoidRanges: avoid,
    });
    const keys = keyframesOf(decide, alignment.frameCount);

    // ディゾルブ中（91..120）にはキーフレームが一切入らず、終了直後の 121 に入る
    expect(keys.some((k) => k >= 91 && k <= 120)).toBe(false);
    expect(keys).toContain(121);
  });

  it('長い回避区間でもシーク性の上限（4秒 = 120コマ）を超えない', () => {
    const decide = createExportKeyframeDecider({
      fps: FPS,
      cutFrameIndices: [],
      avoidRanges: [{ startFrame: 30, endFrame: 300 }],
    });
    const keys = keyframesOf(decide, 300);
    const maxGap = FPS * EXPORT_KEYFRAME_MAX_INTERVAL_SECONDS;
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i] - keys[i - 1]).toBeLessThanOrEqual(maxGap);
    }
    expect(keys).toEqual([0, 120, 240]);
  });

  it('詰まった切り替えにはキーフレームを重ねない', () => {
    const decide = createExportKeyframeDecider({
      fps: FPS,
      cutFrameIndices: [
        40,
        40 + EXPORT_KEYFRAME_MIN_CUT_GAP_FRAMES - 1,
        40 + EXPORT_KEYFRAME_MIN_CUT_GAP_FRAMES + 3,
      ],
    });
    expect(decide(40)).toBe(true);
    expect(decide(40 + EXPORT_KEYFRAME_MIN_CUT_GAP_FRAMES - 1)).toBe(false);
    expect(decide(40 + EXPORT_KEYFRAME_MIN_CUT_GAP_FRAMES + 3)).toBe(true);
  });

  it('どんな切り替え・回避配置でもキーフレーム間隔は最大間隔（4秒）を超えない', () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const frameCount = 3000;
    const maxGap = FPS * EXPORT_KEYFRAME_MAX_INTERVAL_SECONDS;
    expect(EXPORT_KEYFRAME_INTERVAL_SECONDS).toBe(2);
    for (let trial = 0; trial < 200; trial++) {
      const cuts: number[] = [];
      const avoids: Array<{ startFrame: number; endFrame: number }> = [];
      let cursor = 0;
      while (cursor < frameCount) {
        cursor += 1 + Math.floor(random() * 140);
        if (random() < 0.5) {
          cuts.push(cursor);
        } else {
          avoids.push({ startFrame: cursor, endFrame: cursor + 20 + Math.floor(random() * 60) });
        }
      }
      const keys = keyframesOf(
        createExportKeyframeDecider({ fps: FPS, cutFrameIndices: cuts, avoidRanges: avoids }),
        frameCount,
      );
      expect(keys[0]).toBe(0);
      for (let i = 1; i < keys.length; i++) {
        expect(keys[i] - keys[i - 1]).toBeLessThanOrEqual(maxGap);
      }
      expect(frameCount - 1 - keys[keys.length - 1]).toBeLessThanOrEqual(maxGap);
    }
  });
});

describe('computeStandardExportVideoBitrate', () => {
  it('720p は 10 Mbps へ底上げし、1080p は従来どおり 12 Mbps', () => {
    expect(computeStandardExportVideoBitrate(1280, 720)).toBe(STANDARD_EXPORT_VIDEO_BITRATE_MIN);
    expect(computeStandardExportVideoBitrate(720, 1280)).toBe(STANDARD_EXPORT_VIDEO_BITRATE_MIN);
    expect(computeStandardExportVideoBitrate(1920, 1080)).toBe(12_000_000);
    expect(computeStandardExportVideoBitrate(0, 0)).toBe(12_000_000);
  });

  it('共有の computeExportVideoBitrate（iOS Safari・キャプションレイヤー用）は変えない', () => {
    expect(computeExportVideoBitrate(1280, 720)).toBe(6_000_000);
    expect(computeExportVideoBitrate(1920, 1080)).toBe(12_000_000);
  });
});
