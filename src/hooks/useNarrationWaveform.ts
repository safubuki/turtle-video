/**
 * @file useNarrationWaveform.ts
 * @author Turtle Village
 * @description ナレーションクリップの音声をデコードし、静的波形ピークと無音分割候補を返すフック。
 *
 * standard フレーバー（Android/PC）専用。iOS Safari では decodeAudioData が失敗しうるため、
 * 呼び出し側（NarrationWaveform / NarrationSection）が isIosSafari のとき本フックを使わない。
 * デコード失敗時は status='error' を返し、UI は波形を隠して従来のスライダーだけを残す。
 *
 * デコード結果はモジュールレベルで clip id + ソース識別子をキーにキャッシュし、
 * 再オープンや再レンダリングで毎回デコードし直さない。AudioContext は専用の 1 個を遅延生成し、
 * 再生用の AudioContext（useAudioContext）とは分離する（再生の resume/suspend に干渉しないため）。
 */
import { useEffect, useRef, useState } from 'react';
import type { NarrationClip } from '../types';
import {
  computeWaveformPeaks,
  detectSilenceSplitPoints,
  mixToMono,
  type SilenceSplitPoint,
} from '../utils/audioWaveform';
import { useLogStore } from '../stores/logStore';

export type NarrationWaveformStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface NarrationWaveformData {
  status: NarrationWaveformStatus;
  /** 波形描画用ピーク（バケット単位の最大絶対振幅）。ready 以外では null */
  peaks: Float32Array | null;
  /** 無音分割候補（時刻昇順）。ready 以外では空配列 */
  splitPoints: SilenceSplitPoint[];
  /** デコードで得た音源の実長さ（秒）。clip.duration とほぼ一致する想定 */
  decodedDuration: number;
}

/** 描画バケット数（波形の横解像度）。過剰に細かくしても視認性は上がらないため固定 */
const WAVEFORM_BUCKET_COUNT = 320;

interface CachedWaveform {
  peaks: Float32Array;
  splitPoints: SilenceSplitPoint[];
  decodedDuration: number;
}

const waveformCache = new Map<string, CachedWaveform>();

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

/**
 * クリップの音声ソースから ArrayBuffer を取得する。
 * File 実体があればそれを優先し、無ければ blobUrl / url を fetch する。
 */
async function loadClipArrayBuffer(clip: NarrationClip): Promise<ArrayBuffer | null> {
  if (clip.file instanceof File) {
    return clip.file.arrayBuffer();
  }
  const src = clip.blobUrl || clip.url;
  if (!src) return null;
  const res = await fetch(src);
  if (!res.ok) return null;
  return res.arrayBuffer();
}

/**
 * キャッシュキー。同じソースなら再デコードしないよう、id とファイル識別子（サイズ/更新時刻/長さ）を混ぜる。
 * AI 再生成やファイル差し替えでキーが変わるようにする。
 */
function buildCacheKey(clip: NarrationClip): string {
  const size = clip.file instanceof File ? clip.file.size : 0;
  const modified = clip.file instanceof File ? clip.file.lastModified : 0;
  const src = clip.blobUrl || clip.url || '';
  return `${clip.id}::${size}::${modified}::${Math.round(clip.duration * 1000)}::${src}`;
}

/**
 * ナレーションクリップの波形と分割候補を返す。
 * @param clip - 対象クリップ
 * @param enabled - false のときはデコードしない（パネルを閉じている / iOS など）
 */
export function useNarrationWaveform(
  clip: NarrationClip,
  enabled: boolean,
): NarrationWaveformData {
  const [data, setData] = useState<NarrationWaveformData>({
    status: 'idle',
    peaks: null,
    splitPoints: [],
    decodedDuration: 0,
  });

  // 最新の enabled/clip をエフェクト内から参照するための ref は使わず、
  // cacheKey を依存にして「ソースが変わったときだけ」再デコードする。
  const cacheKey = buildCacheKey(clip);
  const abortRef = useRef<boolean>(false);

  useEffect(() => {
    abortRef.current = false;

    if (!enabled) {
      setData({ status: 'idle', peaks: null, splitPoints: [], decodedDuration: 0 });
      return;
    }

    const cached = waveformCache.get(cacheKey);
    if (cached) {
      setData({
        status: 'ready',
        peaks: cached.peaks,
        splitPoints: cached.splitPoints,
        decodedDuration: cached.decodedDuration,
      });
      return;
    }

    setData({ status: 'loading', peaks: null, splitPoints: [], decodedDuration: 0 });

    (async () => {
      try {
        const ctx = getDecodeContext();
        if (!ctx) throw new Error('AudioContext unavailable');

        const arrayBuffer = await loadClipArrayBuffer(clip);
        if (abortRef.current) return;
        if (!arrayBuffer) throw new Error('audio source unavailable');

        // decodeAudioData は渡した ArrayBuffer を detach するため slice(0) でコピーを渡す
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        if (abortRef.current) return;

        const channels: Float32Array[] = [];
        for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
          channels.push(audioBuffer.getChannelData(c));
        }
        const pcm = mixToMono(channels, audioBuffer.sampleRate);
        const peaks = computeWaveformPeaks(pcm, WAVEFORM_BUCKET_COUNT);
        const splitPoints = detectSilenceSplitPoints(pcm);

        const result: CachedWaveform = {
          peaks,
          splitPoints,
          decodedDuration: audioBuffer.duration,
        };
        waveformCache.set(cacheKey, result);

        if (abortRef.current) return;
        setData({
          status: 'ready',
          peaks,
          splitPoints,
          decodedDuration: audioBuffer.duration,
        });
      } catch (error) {
        if (abortRef.current) return;
        useLogStore.getState().warn('AUDIO', 'ナレーション波形のデコードに失敗', {
          clipId: clip.id,
          error: error instanceof Error ? error.message : String(error),
        });
        setData({ status: 'error', peaks: null, splitPoints: [], decodedDuration: 0 });
      }
    })();

    return () => {
      abortRef.current = true;
    };
    // clip はソースが変わると cacheKey も変わるため、cacheKey / enabled のみを依存にする
    // （この構成ではソース識別子 = cacheKey が clip の実質的な依存を代表する）。
  }, [cacheKey, enabled]);

  return data;
}
