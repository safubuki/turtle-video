/**
 * @file captionLayerOfflineEncode.ts
 * @description キャプションのみ（Issue #114）のオフライン WebCodecs エンコード。
 * ベース映像・音声を使わず、Canvas を frameIndex 駆動で encode する。
 */
import * as Mp4Muxer from 'mp4-muxer';
import { FPS, computeExportVideoBitrate } from '../../../constants';
import type { CaptionLayerVideoFormat } from '../../../types';
import { resolveCaptionLayerFormatDescriptor } from '../../../utils/captionLayerExport';
import { getExportFrameTiming, resolveExportDuration } from '../../../utils/exportTimeline';

/**
 * 文字・透明境界は通常映像より圧縮アーティファクトが目立つため、キャプション単独は
 * 通常 export の 2 倍を要求する。ブラウザ側が上限を持つ場合は MediaRecorder が調整する。
 */
export function computeCaptionLayerVideoBitrate(width: number, height: number): number {
  return computeExportVideoBitrate(width, height) * 2;
}

export interface CaptionLayerOfflineEncodeParams {
  canvas: HTMLCanvasElement;
  totalDurationSec: number;
  width: number;
  height: number;
  format: CaptionLayerVideoFormat;
  signal: AbortSignal;
  /** 指定時刻のキャプションレイヤーを canvas へ描く */
  renderAt: (timeSec: number) => void;
  onProgress?: (ratio: number) => void;
  /** 既定 FPS（constants.FPS） */
  fps?: number;
}

export interface CaptionLayerOfflineEncodeResult {
  url: string;
  ext: 'mp4' | 'webm';
  mimeType: string;
  blobSizeBytes: number;
  frameCount: number;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function waitForEncoderQueue(
  encoder: VideoEncoder,
  maxQueue: number,
  signal: AbortSignal
): Promise<void> {
  while (encoder.state === 'configured' && encoder.encodeQueueSize > maxQueue) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    await new Promise<void>((resolve) => {
      const prev = encoder.ondequeue;
      encoder.ondequeue = () => {
        encoder.ondequeue = prev;
        resolve();
      };
      // ondequeue が来ない環境向けの保険
      window.setTimeout(resolve, 8);
    });
  }
}

/**
 * 黒背景 / 白文字キー用 MP4 をオフライン encode する。
 * alpha-webm は別経路（未対応時は呼び出し側でフォールバック）。
 */
export async function encodeCaptionLayerMp4Offline(
  params: CaptionLayerOfflineEncodeParams
): Promise<CaptionLayerOfflineEncodeResult> {
  const {
    canvas,
    totalDurationSec,
    width,
    height,
    format,
    signal,
    renderAt,
    onProgress,
    fps = FPS,
  } = params;

  if (format === 'alpha-webm') {
    throw new Error('alpha-webm は encodeCaptionLayerMp4Offline では扱えません');
  }
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('WebCodecs に対応していないブラウザです');
  }

  const descriptor = resolveCaptionLayerFormatDescriptor(format);
  const exportDuration = resolveExportDuration(totalDurationSec, fps);
  const frameCount = exportDuration.frameCount;
  if (frameCount <= 0) {
    throw new Error('書き出し尺が無効です');
  }

  const bitrate = computeCaptionLayerVideoBitrate(width, height);
  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width,
      height,
    },
    firstTimestampBehavior: 'offset',
    fastStart: 'in-memory',
  });

  let encodeError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => {
      encodeError = e instanceof Error ? e : new Error(String(e));
    },
  });

  videoEncoder.configure({
    codec: 'avc1.4d002a',
    width,
    height,
    bitrate,
    framerate: fps,
  });

  const isKeyFrame = (index: number) => index === 0 || index % fps === 0;

  try {
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (encodeError) throw encodeError;

      await waitForEncoderQueue(videoEncoder, 8, signal);

      const frameTiming = getExportFrameTiming(exportDuration, fps, frameIndex);
      const timeSec = frameTiming.timestampUs / 1e6;
      renderAt(timeSec);

      const frame = new VideoFrame(canvas, {
        timestamp: frameTiming.timestampUs,
        duration: frameTiming.durationUs,
      });
      try {
        videoEncoder.encode(frame, { keyFrame: isKeyFrame(frameIndex) });
      } finally {
        frame.close();
      }

      if (frameIndex % Math.max(1, Math.floor(fps / 2)) === 0 || frameIndex === frameCount - 1) {
        onProgress?.((frameIndex + 1) / frameCount);
      }
    }

    await videoEncoder.flush();
    if (encodeError) throw encodeError;
    videoEncoder.close();
    muxer.finalize();

    const buffer = (muxer.target as Mp4Muxer.ArrayBufferTarget).buffer;
    const blob = new Blob([buffer], { type: descriptor.mimeType });
    const url = URL.createObjectURL(blob);
    return {
      url,
      ext: descriptor.ext,
      mimeType: descriptor.mimeType,
      blobSizeBytes: blob.size,
      frameCount,
    };
  } catch (error) {
    try {
      if (videoEncoder.state !== 'closed') {
        videoEncoder.close();
      }
    } catch {
      // ignore
    }
    if (isAbortError(error)) {
      throw error;
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * 透過 WebM を MediaRecorder + canvas.captureStream で試す。
 * 環境によっては alpha が落ちる。失敗時は throw し、呼び出し側で MP4 へフォールバックする。
 */
export async function encodeCaptionLayerAlphaWebmOffline(
  params: CaptionLayerOfflineEncodeParams
): Promise<CaptionLayerOfflineEncodeResult> {
  const { canvas, totalDurationSec, format, signal, renderAt, onProgress, fps = FPS } = params;

  if (format !== 'alpha-webm') {
    throw new Error('alpha-webm 以外は encodeCaptionLayerAlphaWebmOffline では扱えません');
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder に対応していないブラウザです');
  }

  const exportDuration = resolveExportDuration(totalDurationSec, fps);
  const frameCount = exportDuration.frameCount;
  if (frameCount <= 0) {
    throw new Error('書き出し尺が無効です');
  }

  const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  if (!mimeType) {
    throw new Error('WebM を MediaRecorder で記録できません');
  }

  // requestFrame がある環境では手動フレーム供給で CFR に近づける
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  // Chromium 系へ「動き」より細部保持を優先する映像であることを伝える。
  track.contentHint = 'detail';
  const chunks: BlobPart[] = [];

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: computeCaptionLayerVideoBitrate(canvas.width, canvas.height),
  });

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error('MediaRecorder でエラーが発生しました'));
  });

  const onAbort = () => {
    try {
      if (recorder.state === 'recording') recorder.stop();
    } catch {
      // ignore
    }
  };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    // 先頭フレームを描いてから start
    renderAt(0);
    track.requestFrame?.();
    recorder.start(200);

    const frameIntervalMs = 1000 / fps;
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const frameTiming = getExportFrameTiming(exportDuration, fps, frameIndex);
      renderAt(frameTiming.timestampUs / 1e6);
      track.requestFrame?.();
      onProgress?.((frameIndex + 1) / frameCount);
      // MediaRecorder は壁時計ベースのため、おおよそ実時間で供給する
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, frameIntervalMs);
      });
    }

    if (recorder.state === 'recording') {
      recorder.stop();
    }
    await stopped;

    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size <= 0) {
      throw new Error('透過 WebM の生成に失敗しました（空の Blob）');
    }
    const url = URL.createObjectURL(blob);
    return {
      url,
      ext: 'webm',
      mimeType: 'video/webm',
      blobSizeBytes: blob.size,
      frameCount,
    };
  } finally {
    signal.removeEventListener('abort', onAbort);
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore
      }
    });
  }
}

export async function encodeCaptionLayerVideoOffline(
  params: CaptionLayerOfflineEncodeParams
): Promise<CaptionLayerOfflineEncodeResult> {
  if (params.format === 'alpha-webm') {
    return encodeCaptionLayerAlphaWebmOffline(params);
  }
  return encodeCaptionLayerMp4Offline(params);
}
