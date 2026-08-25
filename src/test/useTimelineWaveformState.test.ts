import { describe, expect, it } from 'vitest';
import {
  buildLoadingTimelineWaveformData,
  type TimelineWaveformData,
} from '../hooks/useTimelineWaveform';

describe('useTimelineWaveform loading state', () => {
  it('連続する再生成要求でも最後に完成した波形を保持する', () => {
    const ready: TimelineWaveformData = {
      status: 'ready',
      peaks: new Float32Array([0.1, 0.5, 0.25]),
      silences: [{
        silenceStart: 1,
        silenceEnd: 2,
        duration: 1,
        center: 1.5,
      }],
      resolvedSilenceSource: 'video',
      duration: 8,
    };

    const firstLoading = buildLoadingTimelineWaveformData(ready);
    const secondLoading = buildLoadingTimelineWaveformData(ready);

    expect(firstLoading.status).toBe('loading');
    expect(secondLoading.status).toBe('loading');
    expect(secondLoading.peaks).toBe(ready.peaks);
    expect(secondLoading.silences).toBe(ready.silences);
    expect(secondLoading.duration).toBe(8);
  });

  it('初回解析だけは空の loading 状態から始める', () => {
    expect(buildLoadingTimelineWaveformData(null)).toMatchObject({
      status: 'loading',
      peaks: null,
      silences: [],
      duration: 0,
    });
  });
});
