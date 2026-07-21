import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNarrationWaveform } from '../hooks/useNarrationWaveform';
import type { NarrationClip } from '../types';

const originalAudioContext = window.AudioContext;
const originalWebkitAudioContext = (
  window as typeof window & { webkitAudioContext?: typeof AudioContext }
).webkitAudioContext;

function createClip(id: string): NarrationClip {
  return {
    id,
    sourceType: 'file',
    file: { name: `${id}.wav` },
    url: `blob:${id}`,
    blobUrl: `blob:${id}`,
    startTime: 0,
    volume: 1,
    isMuted: false,
    trimStart: 0,
    trimEnd: 1,
    duration: 1,
    isAiEditable: false,
  };
}

function createDecodedBuffer(duration: number): AudioBuffer {
  const pcm = new Float32Array(100);
  pcm.fill(0.5);
  return {
    numberOfChannels: 1,
    sampleRate: 100,
    duration,
    getChannelData: () => pcm,
  } as unknown as AudioBuffer;
}

describe('useNarrationWaveform', () => {
  afterEach(() => {
    window.AudioContext = originalAudioContext;
    (
      window as typeof window & { webkitAudioContext?: typeof AudioContext }
    ).webkitAudioContext = originalWebkitAudioContext;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ignores a stale decode result after switching clips', async () => {
    const decodeResolvers: Array<(value: AudioBuffer) => void> = [];
    const decodeAudioData = vi.fn(
      () => new Promise<AudioBuffer>((resolve) => decodeResolvers.push(resolve)),
    );
    class ControlledAudioContext {
      decodeAudioData = decodeAudioData;
    }
    window.AudioContext = ControlledAudioContext as unknown as typeof AudioContext;
    (
      window as typeof window & { webkitAudioContext?: typeof AudioContext }
    ).webkitAudioContext = ControlledAudioContext as unknown as typeof AudioContext;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    vi.stubGlobal('fetch', fetchMock);

    const clipA = createClip('waveform-race-a');
    const clipB = createClip('waveform-race-b');
    const { result, rerender } = renderHook(
      ({ clip }) => useNarrationWaveform(clip, true),
      { initialProps: { clip: clipA } },
    );

    await waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(1));
    rerender({ clip: clipB });
    await waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(2));

    await act(async () => {
      decodeResolvers[1](createDecodedBuffer(2));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.decodedDuration).toBe(2));

    await act(async () => {
      decodeResolvers[0](createDecodedBuffer(1));
      await Promise.resolve();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.decodedDuration).toBe(2);
  });
});
