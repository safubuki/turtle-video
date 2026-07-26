/**
 * @file useTimelineWaveform.ts
 * @author Turtle Village
 * @description プレビューのシークバー直下に出す「プロジェクト全体の音量波形」と
 * 「タイムライン座標の無音区間」を生成するフック（Issue #217）。
 *
 * 音声クリップ（ナレーション + BGM クリップ）に加えて、動画クリップに含まれる音声も
 * デコードしてモノラル PCM にし、有効再生区間・音量・フェードを反映してタイムラインへ合成する。
 * 動画だけのプロジェクトでも波形が出る（音声トラックを持たない動画は静かにスキップされる）。
 * デコード結果はソース識別子でモジュールレベルにキャッシュするため、
 * 開始位置・トリム・音量の変更では再デコードせず合成だけをやり直す。
 *
 * 生成は非同期で行い、途中はプレビュー操作を妨げない（status を返すだけで UI をブロックしない）。
 * iOS Safari では decodeAudioData が不安定なため呼び出し側が enabled=false にして無効化する。
 * デコード失敗クリップは静かにスキップし、残りのクリップだけで波形を出す。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem, NarrationClip } from '../types';
import { computeTransitionTimelineRanges } from '../utils/transitionTimeline';
import { mixToMono } from '../utils/audioWaveform';
import {
  buildTimelineWaveform,
  TIMELINE_WAVEFORM_SAMPLE_RATE,
  type SilenceSourceTarget,
  type TimelinePlacement,
  type TimelineSilenceRegion,
} from '../utils/timelineWaveform';
import { resolvePipelineClipEffectivePlayback, isBgmClipId } from '../stores/audioStore';
import { useLogStore } from '../stores/logStore';

export type TimelineWaveformStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TimelineWaveformData {
  status: TimelineWaveformStatus;
  /** 描画用ピーク（バケット単位の最大絶対振幅）。ready 以外では null */
  peaks: Float32Array | null;
  /** 無音区間（タイムライン座標・時刻昇順）。ready 以外では空配列 */
  silences: TimelineSilenceRegion[];
  /** 無音検出に実際に使われた対象（対象が空だと 'all' へフォールバックする） */
  resolvedSilenceSource: SilenceSourceTarget;
  /** 波形の基準にしたタイムライン長（秒） */
  duration: number;
}

/** 描画バケット数（波形の横解像度）。ナレーション波形と同じ考え方で固定する。 */
const TIMELINE_BUCKET_COUNT = 480;

/** 合成をまとめるデバウンス（ms）。スライダー操作中の連続再計算を防ぐ。 */
const REBUILD_DEBOUNCE_MS = 220;

const IDLE_DATA: TimelineWaveformData = {
  status: 'idle',
  peaks: null,
  silences: [],
  resolvedSilenceSource: 'all',
  duration: 0,
};

interface DecodedSource {
  samples: Float32Array;
  sampleRate: number;
}

/** デコード済み PCM のキャッシュ（キー: ソース識別子）。合成のやり直しでは再デコードしない。 */
const decodedCache = new Map<string, DecodedSource>();
/** 進行中のデコード。同じソースを同時に複数回デコードしないよう共有する。 */
const inflightDecodes = new Map<string, Promise<DecodedSource | null>>();
/** デコードに失敗したソース（毎回リトライして無駄に重くしないため記録する）。 */
const failedSources = new Set<string>();

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
 * デコード対象を音声クリップ／動画クリップの違いから切り離した最小の記述。
 * 動画クリップも音声トラックを持つため、同じ経路でデコードできるようにする。
 */
interface DecodableSource {
  /** ログ用の識別子 */
  id: string;
  /** 音源ファイル（無ければ url から fetch する） */
  file: File | { name: string } | null;
  /** file が無いときに fetch するアドレス */
  url: string;
  /** 音源の長さ（キャッシュキーの一部。ソース差し替えの検出に使う） */
  duration: number;
}

/**
 * 「音源としての同一性」を表すキー。
 * 開始位置 / トリム / 音量は含めない（配置の変更で再デコードしないため）。
 */
function buildSourceKey(source: DecodableSource): string {
  const size = source.file instanceof File ? source.file.size : 0;
  const modified = source.file instanceof File ? source.file.lastModified : 0;
  return `${source.id}::${size}::${modified}::${Math.round(source.duration * 1000)}::${source.url}`;
}

function toAudioSource(clip: NarrationClip): DecodableSource {
  return {
    id: clip.id,
    file: clip.file,
    url: clip.blobUrl || clip.url || '',
    duration: clip.duration,
  };
}

/**
 * 動画クリップを音源として扱う。decodeAudioData は MP4/WebM コンテナから
 * 音声トラックを取り出せるため、音声ファイルと同じ経路でデコードできる。
 * 音声トラックを持たない動画はデコードが失敗し、呼び出し側で静かにスキップされる。
 *
 * duration には originalDuration（元動画の長さ）を使う。trim を変えても
 * 同じ音源としてキャッシュを再利用するため（duration は trim 後の長さで変動する）。
 */
function toVideoSource(item: MediaItem): DecodableSource {
  return {
    id: item.id,
    file: item.file,
    url: item.url || '',
    duration: item.originalDuration || item.duration,
  };
}

async function loadArrayBuffer(source: DecodableSource): Promise<ArrayBuffer | null> {
  if (source.file instanceof File) {
    return source.file.arrayBuffer();
  }
  if (!source.url) return null;
  const res = await fetch(source.url);
  if (!res.ok) return null;
  return res.arrayBuffer();
}

/**
 * 音源をデコードして、合成用サンプルレートへ落としたモノラル PCM を返す。
 * 表示・無音検出にしか使わないため、デコード直後にダウンサンプルしてメモリを抑える。
 */
async function decodeClipSource(source: DecodableSource): Promise<DecodedSource | null> {
  const ctx = getDecodeContext();
  if (!ctx) return null;

  const arrayBuffer = await loadArrayBuffer(source);
  if (!arrayBuffer) return null;

  // decodeAudioData は渡した ArrayBuffer を detach するため slice(0) でコピーを渡す
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

  const channels: Float32Array[] = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }
  const mono = mixToMono(channels, audioBuffer.sampleRate);
  return downsample(mono.samples as Float32Array, mono.sampleRate, TIMELINE_WAVEFORM_SAMPLE_RATE);
}

/**
 * ピーク保持のダウンサンプル。単純な間引きだと短い破裂音が消えるため、
 * 出力 1 サンプルにつき対応区間の絶対値最大を（符号を保って）採用する。
 * 無音検出は RMS ベースなので、ピーク保持でも「間」の判定は保たれる。
 */
function downsample(
  samples: Float32Array,
  sourceRate: number,
  targetRate: number,
): DecodedSource {
  if (!(sourceRate > 0) || samples.length === 0) {
    return { samples: new Float32Array(0), sampleRate: targetRate };
  }
  if (sourceRate <= targetRate) {
    return { samples, sampleRate: sourceRate };
  }

  const ratio = sourceRate / targetRate;
  const outLength = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let peak = 0;
    let peakAbs = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(samples[j]);
      if (abs > peakAbs) {
        peakAbs = abs;
        peak = samples[j];
      }
    }
    out[i] = peak;
  }
  return { samples: out, sampleRate: targetRate };
}

/**
 * 同じソースの同時デコードを 1 本にまとめ、成功結果をキャッシュする。
 *
 * 失敗は「音声トラックを持たない動画」でも普通に起きる（想定内）。
 * その場合もキーを記録して再試行しないようにし、ログは info に留める。
 */
async function getDecodedSource(
  source: DecodableSource,
  key: string,
): Promise<DecodedSource | null> {
  const cached = decodedCache.get(key);
  if (cached) return cached;
  if (failedSources.has(key)) return null;

  const inflight = inflightDecodes.get(key);
  if (inflight) return inflight;

  const promise = decodeClipSource(source)
    .then((decoded) => {
      if (decoded) decodedCache.set(key, decoded);
      else failedSources.add(key);
      return decoded;
    })
    .catch((error: unknown) => {
      failedSources.add(key);
      // 音声を持たない動画では正常に起こるため、警告ではなく情報として残す。
      useLogStore.getState().info('AUDIO', 'タイムライン波形: 音声をデコードできず除外', {
        clipId: source.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    })
    .finally(() => {
      inflightDecodes.delete(key);
    });

  inflightDecodes.set(key, promise);
  return promise;
}

/**
 * プレビュー全体の波形と無音区間を返す。
 *
 * 波形には「最終的に再生される音声」をすべて反映する:
 * ナレーション / BGM クリップ / 動画クリップの音声。
 * 動画しか無いプロジェクトでも、その動画に音声があれば波形が出る。
 *
 * @param clips - プレビュー/書き出しへ流れる音声クリップ（ナレーション + BGM クリップ）
 * @param mediaItems - 動画・画像クリップ（音声を持つ動画だけが波形へ寄与する）
 * @param totalDuration - プロジェクト全体の長さ（秒）
 * @param enabled - false のときは何もしない（iOS Safari / 素材ゼロ / 書き出し中など）
 * @param silenceSource - 無音検出の対象（既定はナレーション。対象が無ければ自動で他へ落ちる）
 */
export function useTimelineWaveform(
  clips: NarrationClip[],
  mediaItems: MediaItem[],
  totalDuration: number,
  enabled: boolean,
  silenceSource: SilenceSourceTarget = 'narration',
): TimelineWaveformData {
  const [data, setData] = useState<TimelineWaveformData>(IDLE_DATA);
  // 再生成が走っている間も直前の波形を出し続けるための保持（チラつき防止）。
  const lastReadyRef = useRef<TimelineWaveformData | null>(null);

  /** 音声を持ちうる動画クリップだけを、タイムライン配置とともに取り出す。 */
  const videoSources = useMemo(() => {
    // トランジションのオーバーラップを考慮した配置（プレビュー本体と同じ規約）
    const ranges = computeTransitionTimelineRanges(mediaItems);
    return mediaItems
      .map((item, index) => ({ item, range: ranges[index] }))
      .filter(({ item, range }) => item.type === 'video' && range && item.duration > 0);
  }, [mediaItems]);

  /**
   * 合成に必要な情報だけを取り出した署名。
   * これが変わったときだけ波形を作り直す（無関係な再レンダリングでは走らせない）。
   */
  const placementSignature = useMemo(() => {
    const audioParts = clips.map((clip) => {
      const effective = resolvePipelineClipEffectivePlayback(clip, clips, totalDuration);
      return [
        buildSourceKey(toAudioSource(clip)),
        effective.startTime.toFixed(3),
        effective.trimStart.toFixed(3),
        effective.effectiveTrimEnd.toFixed(3),
        clip.isMuted ? 0 : clip.volume,
        clip.fadeIn ? (clip.fadeInDuration ?? 0) : 0,
        clip.fadeOut ? (clip.fadeOutDuration ?? 0) : 0,
      ].join('|');
    });

    const videoParts = videoSources.map(({ item, range }) => [
      buildSourceKey(toVideoSource(item)),
      range.start.toFixed(3),
      item.trimStart.toFixed(3),
      item.trimEnd.toFixed(3),
      item.isMuted ? 0 : item.volume,
      item.fadeIn ? item.fadeInDuration : 0,
      item.fadeOut ? item.fadeOutDuration : 0,
    ].join('|'));

    return `${totalDuration.toFixed(3)}::${silenceSource}::${audioParts.join('##')}::${videoParts.join('##')}`;
  }, [clips, videoSources, totalDuration, silenceSource]);

  useEffect(() => {
    let cancelled = false;

    const hasSources = clips.length > 0 || videoSources.length > 0;
    if (!enabled || !hasSources || !(totalDuration > 0)) {
      lastReadyRef.current = null;
      setData(IDLE_DATA);
      return;
    }

    // 直前の波形があるうちは表示を残したまま loading を示す（プレビュー操作は妨げない）。
    setData((prev) =>
      prev.status === 'ready' ? { ...prev, status: 'loading' } : { ...IDLE_DATA, status: 'loading' },
    );

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const [decodedAudio, decodedVideo] = await Promise.all([
            Promise.all(
              clips.map(async (clip) => ({
                clip,
                decoded: await getDecodedSource(toAudioSource(clip), buildSourceKey(toAudioSource(clip))),
              })),
            ),
            Promise.all(
              videoSources.map(async ({ item, range }) => ({
                item,
                range,
                decoded: await getDecodedSource(toVideoSource(item), buildSourceKey(toVideoSource(item))),
              })),
            ),
          ]);
          if (cancelled) return;

          const placements: TimelinePlacement[] = [];
          for (const { clip, decoded } of decodedAudio) {
            if (!decoded || decoded.samples.length === 0) continue;
            const effective = resolvePipelineClipEffectivePlayback(clip, clips, totalDuration);
            if (effective.isDisabled || !(effective.effectivePlayableDuration > 0)) continue;

            placements.push({
              id: clip.id,
              kind: isBgmClipId(clip.id) ? 'bgm' : 'narration',
              pcm: { samples: decoded.samples, sampleRate: decoded.sampleRate },
              timelineStart: effective.startTime,
              sourceStart: effective.trimStart,
              sourceEnd: effective.effectiveTrimEnd,
              volume: clip.isMuted ? 0 : Math.max(0, clip.volume),
              fadeInSec: clip.fadeIn ? Math.max(0, clip.fadeInDuration ?? 0) : 0,
              fadeOutSec: clip.fadeOut ? Math.max(0, clip.fadeOutDuration ?? 0) : 0,
            });
          }

          // 動画音声。トリムは元動画上の [trimStart, trimEnd]、
          // タイムライン位置はトランジション考慮済みの range.start を使う。
          for (const { item, range, decoded } of decodedVideo) {
            if (!decoded || decoded.samples.length === 0) continue;

            placements.push({
              id: item.id,
              kind: 'video',
              pcm: { samples: decoded.samples, sampleRate: decoded.sampleRate },
              timelineStart: range.start,
              sourceStart: Math.max(0, item.trimStart),
              sourceEnd: Math.max(item.trimStart, item.trimEnd),
              volume: item.isMuted ? 0 : Math.max(0, item.volume),
              fadeInSec: item.fadeIn ? Math.max(0, item.fadeInDuration) : 0,
              fadeOutSec: item.fadeOut ? Math.max(0, item.fadeOutDuration) : 0,
            });
          }

          if (placements.length === 0) {
            // 音声を持つ素材がひとつも無い（無音のプロジェクト）。
            // 波形を出す意味がないので、UI 側で静かに非表示にする。
            lastReadyRef.current = null;
            setData({ ...IDLE_DATA, status: 'error' });
            return;
          }

          const result = buildTimelineWaveform(placements, totalDuration, {
            bucketCount: TIMELINE_BUCKET_COUNT,
            silenceSource,
          });
          if (cancelled) return;

          const next: TimelineWaveformData = {
            status: 'ready',
            peaks: result.peaks,
            silences: result.silences,
            resolvedSilenceSource: result.silenceSource,
            duration: result.duration,
          };
          lastReadyRef.current = next;
          setData(next);
        } catch (error) {
          if (cancelled) return;
          useLogStore.getState().warn('AUDIO', 'タイムライン波形の生成に失敗', {
            error: error instanceof Error ? error.message : String(error),
          });
          lastReadyRef.current = null;
          setData({ ...IDLE_DATA, status: 'error' });
        }
      })();
    }, REBUILD_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // placementSignature が合成に必要な入力すべてを代表する（配列参照の同一性には依存しない）。
    // clips / videoSources / totalDuration / silenceSource は placementSignature 経由で
    // 反映されるため依存配列へ直接入れない（無関係な再レンダリングで再合成しないため）。
  }, [placementSignature, enabled]);

  return data;
}
