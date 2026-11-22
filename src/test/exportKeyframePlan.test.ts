import { describe, expect, it } from 'vitest';

import {
  computeExportCutFrameIndices,
  createExportKeyframeDecider,
  EXPORT_KEYFRAME_CUT_WINDOW_FRAMES,
  EXPORT_KEYFRAME_MIN_CUT_GAP_FRAMES,
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
  type TimelineItemLike,
} from '../utils/transitionTimeline';

const FPS = 30;

const item = (id: string, duration: number, transitionToNext: TimelineItemLike['transitionToNext'] = null): TimelineItemLike => ({
  id,
  type: 'video',
  duration,
  transitionToNext,
});

const totalOf = (items: TimelineItemLike[]) => {
  const ranges = computeTransitionTimelineRanges(items);
  return ranges[ranges.length - 1].end;
};

const keyframesOf = (decide: (i: number) => boolean, frameCount: number) =>
  Array.from({ length: frameCount }, (_, i) => i).filter(decide);

describe('computeExportCutFrameIndices', () => {
  it('各クリップが最初に描かれるフレームを、描画と同じ判定（findActive）で求める', () => {
    const items = [item('truck', 4.02), item('bike', 12), item('third', 5.5)];
    const total = totalOf(items);
    const alignment = resolveExportDuration(total, FPS);
    const cuts = computeExportCutFrameIndices(items, alignment, FPS);

    expect(cuts).toHaveLength(2);
    for (const cut of cuts) {
      const at = (i: number) => findActiveTimelineItemWithTransitions(
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

  it('ディゾルブでは重なりの始まりを切り替えとする（3.0 秒の直前コマ 2.99997 秒はまだ前のクリップ）', () => {
    const items = [item('a', 4, { type: 'dissolve', duration: 1 }), item('b', 4)];
    const alignment = resolveExportDuration(totalOf(items), FPS);
    expect(computeExportCutFrameIndices(items, alignment, FPS)).toEqual([91]);
  });

  it('クリップが 1 本なら切り替えはない', () => {
    const items = [item('a', 6)];
    expect(computeExportCutFrameIndices(items, resolveExportDuration(6, FPS), FPS)).toEqual([]);
  });
});

describe('createExportKeyframeDecider', () => {
  it('切り替えがなければ従来どおり 1 秒ごと', () => {
    const decide = createExportKeyframeDecider({ fps: FPS, cutFrameIndices: [] });
    expect(keyframesOf(decide, 100)).toEqual([0, 30, 60, 90]);
  });

  it('切り替えの 1 コマ前の定期キーフレームを省き、切り替えのコマをキーフレームにする（不具合の再現ケース）', () => {
    const decide = createExportKeyframeDecider({ fps: FPS, cutFrameIndices: [121] });
    expect(decide(120)).toBe(false);
    expect(decide(121)).toBe(true);
    expect(keyframesOf(decide, 160)).toEqual([0, 30, 60, 90, 121, 151]);
  });

  it('切り替えでキーフレーム間隔を数え直し、直後に定期キーフレームを重ねない', () => {
    const decide = createExportKeyframeDecider({ fps: FPS, cutFrameIndices: [115] });
    expect(keyframesOf(decide, 160)).toEqual([0, 30, 60, 90, 115, 145]);
  });

  it('詰まった切り替えにはキーフレームを重ねない', () => {
    const decide = createExportKeyframeDecider({
      fps: FPS,
      cutFrameIndices: [40, 40 + EXPORT_KEYFRAME_MIN_CUT_GAP_FRAMES - 1, 40 + EXPORT_KEYFRAME_MIN_CUT_GAP_FRAMES + 3],
    });
    expect(decide(40)).toBe(true);
    expect(decide(40 + EXPORT_KEYFRAME_MIN_CUT_GAP_FRAMES - 1)).toBe(false);
    expect(decide(40 + EXPORT_KEYFRAME_MIN_CUT_GAP_FRAMES + 3)).toBe(true);
  });

  it('どんな切り替え配置でもキーフレーム間隔は FPS + 窓幅 を超えない（シーク性を保つ）', () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const frameCount = 3000;
    for (let trial = 0; trial < 200; trial++) {
      const cuts: number[] = [];
      let cursor = 0;
      while (cursor < frameCount) {
        cursor += 1 + Math.floor(random() * 90);
        cuts.push(cursor);
      }
      const keys = keyframesOf(createExportKeyframeDecider({ fps: FPS, cutFrameIndices: cuts }), frameCount);
      expect(keys[0]).toBe(0);
      for (let i = 1; i < keys.length; i++) {
        expect(keys[i] - keys[i - 1]).toBeLessThanOrEqual(FPS + EXPORT_KEYFRAME_CUT_WINDOW_FRAMES);
      }
      expect(frameCount - 1 - keys[keys.length - 1]).toBeLessThanOrEqual(FPS + EXPORT_KEYFRAME_CUT_WINDOW_FRAMES);
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
