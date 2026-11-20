/**
 * @file mediaColorSampler.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 「前の素材に合わせる／次の素材に合わせる」: つなぎ目の 2 コマ（前の最後と自分の最初、
 * または自分の最後と次の最初）を小さく読み取り、MKL 色転写（colorMatch.ts）で補正を求める。
 *
 * - プレビュー用の共有 video 要素は動かさない（再生・背景撮影と競合させない）。読み取り専用の
 *   video 要素を一時的に作り、終わったら必ず破棄する（同時デコード数を増やしたままにしない）。
 * - 合わせる相手のクリップに色合いの設定があれば、その「見えている色」（CPU 版の同じ式）を基準にする。
 *   A→B→C と順に合わせても、つなぎ目ごとに揃う。
 */
import type { MediaColorAdjust, MediaColorMatch, MediaItem } from '../types';
import { computeMklColorTransfer, computeRgbStats, estimateRgbStatsDistance } from './colorMatch';
import { decomposeColorTransfer } from './colorMatchDecompose';
import { applyMediaColorGradeToRgba, MEDIA_COLOR_MATCH_STRENGTH_DEFAULT, resolveMediaColorGrade } from './mediaColor';

/** 読み取る大きさ（長辺 px）。色の分布を取るだけなので小さくてよい */
export const COLOR_SAMPLE_LONG_SIDE = 192;
const VIDEO_LOAD_TIMEOUT_MS = 8000;
const VIDEO_SEEK_TIMEOUT_MS = 4000;
/** 終端ちょうどは黒や次のキーフレームになることがあるため、少し手前を読む */
const END_FRAME_MARGIN_SEC = 1 / 30;
const START_FRAME_MARGIN_SEC = 1 / 60;

type SampleItem = Pick<MediaItem, 'type' | 'url' | 'trimStart' | 'trimEnd' | 'originalDuration'>;

/** 読み取る元動画上の時刻（最後のコマ／最初のコマ） */
export function resolveColorSampleSourceTime(item: SampleItem, edge: 'start' | 'end'): number {
  const start = Number.isFinite(item.trimStart) ? Math.max(0, item.trimStart) : 0;
  const rawEnd = Number.isFinite(item.trimEnd) && item.trimEnd > start
    ? item.trimEnd
    : (Number.isFinite(item.originalDuration) && item.originalDuration > start ? item.originalDuration : start);
  if (edge === 'end') return Math.max(start, rawEnd - END_FRAME_MARGIN_SEC);
  return Math.min(rawEnd, start + START_FRAME_MARGIN_SEC);
}

export function resolveColorSampleSize(width: number, height: number): { width: number; height: number } {
  const longSide = Math.max(width, height, 1);
  const scale = Math.min(1, COLOR_SAMPLE_LONG_SIDE / longSide);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function readPixels(source: CanvasImageSource, width: number, height: number): Uint8ClampedArray | null {
  if (width <= 0 || height <= 0) return null;
  const size = resolveColorSampleSize(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, size.width, size.height);
  return ctx.getImageData(0, 0, size.width, size.height).data;
}

function waitForEvent(target: EventTarget, events: string[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      events.forEach((name) => target.removeEventListener(name, onOk));
      target.removeEventListener('error', onError);
      resolve(ok);
    };
    const onOk = () => finish(true);
    const onError = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    events.forEach((name) => target.addEventListener(name, onOk, { once: true }));
    target.addEventListener('error', onError, { once: true });
  });
}

function waitForPresentedFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 250);
    const rvfc = (video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    }).requestVideoFrameCallback;
    if (typeof rvfc === 'function') {
      rvfc.call(video, () => {
        clearTimeout(timer);
        resolve();
      });
      return;
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve();
      }));
    }
  });
}

async function sampleImagePixels(url: string): Promise<Uint8ClampedArray | null> {
  const img = new Image();
  const loaded = waitForEvent(img, ['load'], VIDEO_LOAD_TIMEOUT_MS);
  img.src = url;
  if (!(await loaded)) return null;
  return readPixels(img, img.naturalWidth, img.naturalHeight);
}

async function sampleVideoPixels(url: string, sourceTime: number): Promise<Uint8ClampedArray | null> {
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('playsinline', '');
  // 端末によっては DOM に無い video のコマを描けないため、見えない形で一時的に置く
  Object.assign(video.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '2px',
    height: '2px',
    opacity: '0.01',
    pointerEvents: 'none',
    zIndex: '-1000',
  });
  document.body?.appendChild(video);
  try {
    const loaded = waitForEvent(video, ['loadeddata'], VIDEO_LOAD_TIMEOUT_MS);
    video.src = url;
    try { video.load(); } catch { /* ignore */ }
    if (!(await loaded) && video.readyState < 2) return null;

    const target = Math.max(0, Math.min(sourceTime, Number.isFinite(video.duration) ? video.duration : sourceTime));
    if (Math.abs(video.currentTime - target) > 0.001) {
      const seeked = waitForEvent(video, ['seeked'], VIDEO_SEEK_TIMEOUT_MS);
      video.currentTime = target;
      if (!(await seeked)) return null;
    }
    await waitForPresentedFrame(video);
    if (video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) return null;
    return readPixels(video, video.videoWidth, video.videoHeight);
  } finally {
    // デコーダを確実に手放す
    try { video.pause(); } catch { /* ignore */ }
    video.removeAttribute('src');
    try { video.load(); } catch { /* ignore */ }
    video.parentNode?.removeChild(video);
  }
}

/** クリップの最初／最後のコマを小さく読み取る（RGBA 0〜255） */
export async function sampleClipEdgePixels(
  item: SampleItem,
  edge: 'start' | 'end',
): Promise<Uint8ClampedArray | null> {
  if (typeof document === 'undefined' || !item.url) return null;
  if (item.type === 'image') return sampleImagePixels(item.url);
  return sampleVideoPixels(item.url, resolveColorSampleSourceTime(item, edge));
}

export interface ClipColorMatchResult {
  /**
   * スライダーで表しきれない残りの補正（細かな色ずれ）。スライダーだけで表せたら null。
   */
  match: MediaColorMatch | null;
  /** スライダー（明るさ・コントラスト・彩度・色温度・色かぶり）へ入れる値。すべて 0 なら undefined */
  adjust: MediaColorAdjust | undefined;
  /** 合わせる前の色の差（0〜1 単位の目安） */
  distanceBefore: number;
}

export type ClipColorMatchFailure = 'sample-failed' | 'no-pixels';

/**
 * 2 つの画素列から「target 側を reference 側へ合わせる」補正を求める（純粋関数・テスト用）。
 * reference には相手のクリップの色設定を掛けた後の画素を渡す。
 *
 * MKL で求めた補正を、スライダーの値（見える・そこから手で詰められる）と、
 * 表しきれない残り（colorMatch）に分けて返す（colorMatchDecompose.ts）。
 */
export function computeColorMatchFromPixels(
  referencePixels: Uint8ClampedArray,
  targetPixels: Uint8ClampedArray,
): ClipColorMatchResult | null {
  const referenceStats = computeRgbStats(referencePixels);
  const targetStats = computeRgbStats(targetPixels);
  if (!referenceStats || !targetStats) return null;
  const transfer = computeMklColorTransfer(targetStats, referenceStats);
  const { adjust, residual } = decomposeColorTransfer(targetPixels, transfer);
  return {
    match: residual
      ? {
        matrix: residual.matrix.map((v) => Number(v.toFixed(6))),
        offset: residual.offset.map((v) => Number(v.toFixed(6))),
        strength: MEDIA_COLOR_MATCH_STRENGTH_DEFAULT,
      }
      : null,
    adjust,
    distanceBefore: estimateRgbStatsDistance(referenceStats, targetStats),
  };
}

/** どちらの隣の素材に合わせるか（前＝上のカード／次＝下のカード） */
export type ColorMatchDirection = 'previous' | 'next';

/**
 * つなぎ目のコマの組み合わせ。前に合わせるなら「前の最後」と「自分の最初」、
 * 次に合わせるなら「次の最初」と「自分の最後」を比べる。
 */
export function resolveColorMatchEdges(direction: ColorMatchDirection): {
  referenceEdge: 'start' | 'end';
  targetEdge: 'start' | 'end';
} {
  return direction === 'previous'
    ? { referenceEdge: 'end', targetEdge: 'start' }
    : { referenceEdge: 'start', targetEdge: 'end' };
}

/**
 * 隣の素材（前または次）とのつなぎ目で、このクリップの色合いを隣へ合わせる補正を求める。
 * 隣の素材に色合いの設定があれば、その「見えている色」を基準にする。
 */
export async function computeClipColorMatchToNeighbor(
  neighbor: SampleItem & Pick<MediaItem, 'colorAdjust' | 'colorMatch'>,
  target: SampleItem,
  direction: ColorMatchDirection,
): Promise<ClipColorMatchResult | ClipColorMatchFailure> {
  const { referenceEdge, targetEdge } = resolveColorMatchEdges(direction);
  // 同時デコード数を増やさないよう 1 本ずつ読む（Android はプレビュー用の video も動いている）
  const referencePixels = await sampleClipEdgePixels(neighbor, referenceEdge);
  if (!referencePixels) return 'sample-failed';
  const targetPixels = await sampleClipEdgePixels(target, targetEdge);
  if (!targetPixels) return 'sample-failed';
  applyMediaColorGradeToRgba(referencePixels, resolveMediaColorGrade(neighbor));
  return computeColorMatchFromPixels(referencePixels, targetPixels) ?? 'no-pixels';
}
