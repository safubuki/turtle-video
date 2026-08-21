/**
 * @file useVideoAudioNormalize.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 音量揃え用に、各素材のトリム区間 RMS を測ってゲインをストアへ書く。
 *
 * standard 限定。decodeAudioData が失敗したらそのカードはゲイン 1 のまま残す。
 * 再生用 AudioContext とは別の専用コンテキストを使う。
 */
import { useEffect, useRef, useState } from 'react';

import { mixToMono } from '../utils/audioWaveform';
import {
  computeEqualizeGains,
  computeRmsForTimeRange,
  normalizeVideoAudioNormalizeMode,
  type LoudnessSample,
  type VideoAudioNormalizeMode,
} from '../utils/videoAudioLoudness';
import { useLogStore } from '../stores/logStore';

export type VideoAudioNormalizeStatus = 'idle' | 'loading' | 'ready' | 'error';

const rmsCache = new Map<string, number>();
const rmsPromiseCache = new Map<string, Promise<number>>();

let decodeContext: AudioContext | null = null;
function getDecodeContext(): AudioContext | null {
  if (decodeContext) return decodeContext;
  const AC =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    decodeContext = new AC();
    return decodeContext;
  } catch {
    return null;
  }
}

export interface AudioNormalizeSource {
  id: string;
  file: File | { name: string };
  url?: string;
  trimStart?: number;
  trimEnd?: number;
}

function resolveTrimRange(item: AudioNormalizeSource): { trimStart: number; trimEnd: number } {
  const trimStart = typeof item.trimStart === 'number' && Number.isFinite(item.trimStart)
    ? item.trimStart
    : 0;
  const trimEnd = typeof item.trimEnd === 'number' && Number.isFinite(item.trimEnd)
    ? item.trimEnd
    : 0;
  return { trimStart, trimEnd };
}

function buildCacheKey(item: AudioNormalizeSource): string {
  const size = item.file instanceof File ? item.file.size : 0;
  const modified = item.file instanceof File ? item.file.lastModified : 0;
  const { trimStart, trimEnd } = resolveTrimRange(item);
  return `${item.id}::${size}::${modified}::${Math.round(trimStart * 1000)}::${Math.round(trimEnd * 1000)}::${item.url ?? ''}`;
}

async function loadItemArrayBuffer(item: AudioNormalizeSource): Promise<ArrayBuffer | null> {
  if (item.file instanceof File) {
    return item.file.arrayBuffer();
  }
  if (!item.url) return null;
  const res = await fetch(item.url);
  if (!res.ok) return null;
  return res.arrayBuffer();
}

async function measureItemRms(item: AudioNormalizeSource): Promise<number> {
  const cacheKey = buildCacheKey(item);
  const cached = rmsCache.get(cacheKey);
  if (cached != null) return cached;
  const pending = rmsPromiseCache.get(cacheKey);
  if (pending) return pending;

  const promise = (async () => {
    const ctx = getDecodeContext();
    if (!ctx) throw new Error('AudioContext unavailable');
    const arrayBuffer = await loadItemArrayBuffer(item);
    if (!arrayBuffer) throw new Error('audio source unavailable');
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channels: Float32Array[] = [];
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
      channels.push(audioBuffer.getChannelData(c));
    }
    const pcm = mixToMono(channels, audioBuffer.sampleRate);
    const { trimStart, trimEnd } = resolveTrimRange(item);
    const rms = computeRmsForTimeRange(
      pcm.samples,
      pcm.sampleRate,
      trimStart,
      trimEnd > trimStart ? trimEnd : undefined,
    );
    rmsCache.set(cacheKey, rms);
    return rms;
  })();

  rmsPromiseCache.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    rmsPromiseCache.delete(cacheKey);
  }
}

export function useVideoAudioNormalize(params: {
  enabled: boolean;
  items: AudioNormalizeSource[];
  mode?: VideoAudioNormalizeMode;
  onApplyGains: (gains: Record<string, number>) => void;
}): { status: VideoAudioNormalizeStatus } {
  const { enabled, items, mode, onApplyGains } = params;
  const resolvedMode = normalizeVideoAudioNormalizeMode(mode);
  const [status, setStatus] = useState<VideoAudioNormalizeStatus>('idle');
  const onApplyGainsRef = useRef(onApplyGains);
  onApplyGainsRef.current = onApplyGains;

  const signature = items
    .map((item) => [item.id, buildCacheKey(item)].join(':'))
    .join('|');

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setStatus('idle');
      return;
    }
    if (items.length === 0) {
      setStatus('idle');
      onApplyGainsRef.current({});
      return;
    }

    setStatus('loading');
    (async () => {
      const samples: LoudnessSample[] = [];
      for (const item of items) {
        let rms = 0;
        try {
          rms = await measureItemRms(item);
        } catch (error) {
          useLogStore.getState().warn('MEDIA', '音量の解析に失敗したため音量揃えの対象外にします', {
            id: item.id,
            fileName: item.file instanceof File ? item.file.name : undefined,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        if (cancelled) return;
        samples.push({ id: item.id, rms, participating: true });
      }
      if (cancelled) return;
      onApplyGainsRef.current(computeEqualizeGains(samples, resolvedMode));
      setStatus('ready');
    })().catch((error) => {
      if (cancelled) return;
      useLogStore.getState().warn('MEDIA', '音量揃えに失敗しました', {
        error: error instanceof Error ? error.message : String(error),
      });
      setStatus('error');
    });

    return () => {
      cancelled = true;
    };
    // items は signature から再構成できるため依存は enabled / mode / signature に閉じる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, resolvedMode, signature]);

  return { status };
}
