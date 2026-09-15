/**
 * @file audioPitchPreservedCapture.ts
 * @description 非等倍 export 用。プレビューと同じ HTMLMediaElement 経路
 * （playbackRate + preservesPitch=true）で動画音声をキャプチャし、
 * OfflineAudio に rate=1 で載せることで音程をプレビューに揃える。
 *
 * スローでは preservesPitch の処理遅延が先頭に残る。呼び出し側が decode+WSOLA
 * 参照で遅延を切る。こちらは play() 後から録音し、遅延分の末尾余裕を残す。
 *
 * ScriptProcessor の 4096 サンプル塊は、スローの overlap-add と重なると
 * 薄いデジタルエコーになる。Chromium では MediaStreamTrackProcessor、
 * 非対応時は AudioWorklet、最後に出力を無音化した ScriptProcessor へ倒す。
 */
import { resolveExportCaptureTailPaddingSec } from './audioTimeStretch';
import { applyVideoElementPlaybackRate } from './playbackSpeed';
import { getTrackProcessorConstructor } from './platform';

export interface PitchPreservedSpeedCaptureParams {
  file: File;
  url: string;
  /** 元動画上の開始秒 */
  trimStart: number;
  /** ソース上の有効尺（秒）= trimEnd - trimStart */
  sourceDurationSec: number;
  /** 1 以外の再生速度（スロー含む） */
  speed: number;
  audioContext: AudioContext;
  signal?: AbortSignal;
  onLog?: (level: 'info' | 'warn', message: string, details?: Record<string, unknown>) => void;
}

type CaptureMethod = 'track-processor' | 'audio-worklet' | 'script-processor';

const CAPTURE_WORKLET_NAME = 'turtle-video-pitch-capture';
const CAPTURE_WORKLET_SOURCE = `
class TurtlePitchCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = true;
    this.port.onmessage = (ev) => {
      if (ev.data === 'stop') this.active = false;
    };
  }
  process(inputs) {
    if (!this.active) return false;
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch0 = input[0];
    if (!ch0 || ch0.length === 0) return true;
    const l = new Float32Array(ch0);
    const r = input[1] ? new Float32Array(input[1]) : new Float32Array(ch0);
    this.port.postMessage({ l, r }, [l.buffer, r.buffer]);
    return true;
  }
}
registerProcessor('${CAPTURE_WORKLET_NAME}', TurtlePitchCaptureProcessor);
`;

const captureWorkletReady = new WeakMap<AudioContext, Promise<boolean>>();

function ensureCaptureWorklet(audioContext: AudioContext): Promise<boolean> {
  const existing = captureWorkletReady.get(audioContext);
  if (existing) return existing;
  const install = (async () => {
    if (!audioContext.audioWorklet) return false;
    const blob = new Blob([CAPTURE_WORKLET_SOURCE], { type: 'application/javascript' });
    const objectUrl = URL.createObjectURL(blob);
    try {
      await audioContext.audioWorklet.addModule(objectUrl);
      return true;
    } catch {
      // 同一 context へ二度登録すると失敗することがある。再利用を試みる。
      try {
        const node = new AudioWorkletNode(audioContext, CAPTURE_WORKLET_NAME);
        node.disconnect();
        return true;
      } catch {
        return false;
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  })();
  captureWorkletReady.set(audioContext, install);
  return install;
}

function silenceScriptProcessorOutput(ev: AudioProcessingEvent): void {
  for (let c = 0; c < ev.outputBuffer.numberOfChannels; c++) {
    ev.outputBuffer.getChannelData(c).fill(0);
  }
}

function attachOffscreenVideo(video: HTMLVideoElement): void {
  video.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:2px',
    'height:2px',
    'opacity:0.001',
    'pointer-events:none',
    'z-index:-100',
  ].join(';');
  document.body.appendChild(video);
}

/**
 * 壁時計で sourceDuration/speed 秒だけ再生し、ピッチ維持された PCM を AudioBuffer にする。
 * 失敗時は null（呼び出し側でフォールバック）。
 */
export async function capturePitchPreservedSpeedAudio(
  params: PitchPreservedSpeedCaptureParams,
): Promise<AudioBuffer | null> {
  const {
    file,
    url,
    trimStart,
    sourceDurationSec,
    speed,
    audioContext,
    signal,
    onLog,
  } = params;

  if (!(Math.abs(speed - 1) > 0.001) || !(sourceDurationSec > 0) || signal?.aborted) {
    return null;
  }

  const wallDurationSec = sourceDurationSec / speed;
  if (!(wallDurationSec > 0.05)) {
    return null;
  }
  const extraTailSec = resolveExportCaptureTailPaddingSec(speed);

  const log = (level: 'info' | 'warn', message: string, details?: Record<string, unknown>) => {
    onLog?.(level, message, details);
  };

  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch {
      /* ignore */
    }
  }

  const workletReady = await ensureCaptureWorklet(audioContext).catch(() => false);
  if (signal?.aborted) return null;

  return new Promise<AudioBuffer | null>((resolve) => {
    let settled = false;
    const safeResolve = (result: AudioBuffer | null) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(result);
    };

    const video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    // スピーカーへは出さない（WebAudio 経由で取る）。muted=true だと MediaElementSource が無音になる環境がある。
    video.muted = false;
    video.volume = 1;

    let sourceNode: MediaElementAudioSourceNode | null = null;
    let processor: ScriptProcessorNode | null = null;
    let workletNode: AudioWorkletNode | null = null;
    let streamDest: MediaStreamAudioDestinationNode | null = null;
    let silentSink: GainNode | null = null;
    let objectUrl: string | null = null;
    let trackReader: ReadableStreamDefaultReader<AudioData | VideoFrame> | null = null;
    let captureMethod: CaptureMethod = 'script-processor';
    const chunksL: Float32Array[] = [];
    const chunksR: Float32Array[] = [];
    let totalFrames = 0;
    let captureStartedAt = 0;
    let capturedSampleRate = audioContext.sampleRate;

    const appendStereo = (left: Float32Array, right: Float32Array) => {
      chunksL.push(left);
      chunksR.push(right);
      totalFrames += left.length;
    };

    const cleanup = () => {
      if (trackReader) {
        try { void trackReader.cancel(); } catch { /* ignore */ }
        trackReader = null;
      }
      if (processor) {
        processor.onaudioprocess = null;
        try { processor.disconnect(); } catch { /* ignore */ }
      }
      if (workletNode) {
        try { workletNode.port.postMessage('stop'); } catch { /* ignore */ }
        workletNode.port.onmessage = null;
        try { workletNode.disconnect(); } catch { /* ignore */ }
      }
      if (sourceNode) {
        try { sourceNode.disconnect(); } catch { /* ignore */ }
      }
      if (streamDest) {
        try {
          streamDest.stream.getAudioTracks().forEach((track) => track.stop());
          streamDest.disconnect();
        } catch { /* ignore */ }
      }
      if (silentSink) {
        try { silentSink.disconnect(); } catch { /* ignore */ }
      }
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch { /* ignore */ }
      try {
        video.remove();
      } catch { /* ignore */ }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    const onAbort = () => {
      log('info', 'pitch-preserved capture aborted');
      safeResolve(null);
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const timeoutMs = Math.max(15000, (wallDurationSec + extraTailSec + 8) * 1000);
    const timeoutId = window.setTimeout(() => {
      log('warn', 'pitch-preserved capture timeout', {
        wallDurationSec,
        totalFrames,
        captureMethod,
        capturedSec: totalFrames / capturedSampleRate,
      });
      finishFromCollected();
    }, timeoutMs);

    const maybeFinishByElapsed = () => {
      if (captureStartedAt <= 0) return;
      const elapsed = (performance.now() - captureStartedAt) / 1000;
      if (elapsed >= wallDurationSec + extraTailSec) {
        video.pause();
        finishFromCollected();
      }
    };

    const finishFromCollected = () => {
      if (totalFrames < capturedSampleRate * 0.05) {
        log('warn', 'pitch-preserved capture too short', { totalFrames, captureMethod });
        safeResolve(null);
        return;
      }
      try {
        const expectedFrames = Math.max(
          1,
          Math.floor(wallDurationSec * capturedSampleRate),
        );
        const extraFrames = Math.floor(extraTailSec * capturedSampleRate);
        const useFrames = Math.min(totalFrames, expectedFrames + extraFrames);
        const buffer = audioContext.createBuffer(2, useFrames, capturedSampleRate);
        const ch0 = buffer.getChannelData(0);
        const ch1 = buffer.getChannelData(1);
        let offset = 0;
        for (let i = 0; i < chunksL.length && offset < useFrames; i++) {
          const L = chunksL[i];
          const R = chunksR[i] ?? L;
          const n = Math.min(L.length, useFrames - offset);
          ch0.set(L.subarray(0, n), offset);
          ch1.set(R.subarray(0, n), offset);
          offset += n;
        }
        log('info', 'pitch-preserved capture done', {
          useFrames,
          durationSec: Math.round(buffer.duration * 1000) / 1000,
          speed,
          captureMethod,
          wallDurationSec: Math.round(wallDurationSec * 1000) / 1000,
        });
        safeResolve(buffer);
      } catch (e) {
        log('warn', 'pitch-preserved capture build failed', {
          error: e instanceof Error ? e.message : String(e),
          captureMethod,
        });
        safeResolve(null);
      }
    };

    const connectSilentSink = () => {
      silentSink = audioContext.createGain();
      silentSink.gain.value = 0;
      silentSink.connect(audioContext.destination);
    };

    const startScriptProcessorCapture = () => {
      captureMethod = 'script-processor';
      processor = audioContext.createScriptProcessor(1024, 2, 2);
      processor.onaudioprocess = (ev) => {
        silenceScriptProcessorOutput(ev);
        if (settled || captureStartedAt <= 0) return;
        const input = ev.inputBuffer;
        const L = new Float32Array(input.getChannelData(0));
        const R = input.numberOfChannels > 1
          ? new Float32Array(input.getChannelData(1))
          : new Float32Array(L);
        appendStereo(L, R);
        maybeFinishByElapsed();
      };
      sourceNode?.connect(processor);
      processor.connect(silentSink!);
    };

    const startWorkletCapture = (): boolean => {
      if (!workletReady) return false;
      try {
        workletNode = new AudioWorkletNode(audioContext, CAPTURE_WORKLET_NAME, {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        workletNode.port.onmessage = (ev: MessageEvent<{ l?: Float32Array; r?: Float32Array }>) => {
          if (settled || captureStartedAt <= 0) return;
          const L = ev.data?.l;
          if (!L || L.length === 0) return;
          const R = ev.data.r && ev.data.r.length === L.length ? ev.data.r : L;
          appendStereo(L, R);
          maybeFinishByElapsed();
        };
        sourceNode?.connect(workletNode);
        workletNode.connect(silentSink!);
        captureMethod = 'audio-worklet';
        return true;
      } catch {
        workletNode = null;
        return false;
      }
    };

    const startTrackProcessorCapture = (): boolean => {
      const TrackProcessor = getTrackProcessorConstructor();
      const audioTrack = streamDest?.stream.getAudioTracks()[0];
      if (!TrackProcessor || !audioTrack || audioTrack.readyState !== 'live') return false;
      try {
        const processorNode = new TrackProcessor({ track: audioTrack });
        trackReader = processorNode.readable.getReader();
        captureMethod = 'track-processor';
        const readLoop = async () => {
          while (!settled && trackReader) {
            const { value, done } = await trackReader.read();
            if (done || settled || !value) break;
            const data = value as AudioData;
            try {
              if (captureStartedAt > 0 && 'numberOfFrames' in data && data.numberOfFrames > 0) {
                capturedSampleRate = data.sampleRate || capturedSampleRate;
                const frames = data.numberOfFrames;
                const copyPlane = (planeIndex: number): Float32Array => {
                  const plane = new Float32Array(frames);
                  try {
                    data.copyTo(plane, { planeIndex, format: 'f32-planar' });
                  } catch {
                    data.copyTo(plane, { planeIndex });
                  }
                  return plane;
                };
                const L = copyPlane(0);
                const R = data.numberOfChannels > 1 ? copyPlane(1) : L;
                appendStereo(L, R);
                maybeFinishByElapsed();
              }
            } catch {
              /* 1 チャンク失敗は継続 */
            } finally {
              try { data.close(); } catch { /* ignore */ }
            }
          }
          if (!settled) finishFromCollected();
        };
        void readLoop();
        return true;
      } catch {
        trackReader = null;
        return false;
      }
    };

    const startCapture = async () => {
      try {
        attachOffscreenVideo(video);
        const mediaUrl = url || (objectUrl = URL.createObjectURL(file));
        video.src = mediaUrl;

        await new Promise<void>((res, rej) => {
          const onMeta = () => {
            video.removeEventListener('loadedmetadata', onMeta);
            video.removeEventListener('error', onErr);
            res();
          };
          const onErr = () => {
            video.removeEventListener('loadedmetadata', onMeta);
            video.removeEventListener('error', onErr);
            rej(new Error('video metadata load failed'));
          };
          if (video.readyState >= 1) {
            res();
            return;
          }
          video.addEventListener('loadedmetadata', onMeta);
          video.addEventListener('error', onErr);
        });

        if (signal?.aborted) {
          safeResolve(null);
          return;
        }

        applyVideoElementPlaybackRate(video, speed);

        const targetStart = Math.max(0, trimStart);
        if (Math.abs(video.currentTime - targetStart) > 0.02) {
          await new Promise<void>((res) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              res();
            };
            video.addEventListener('seeked', onSeeked);
            try {
              video.currentTime = targetStart;
            } catch {
              res();
            }
            window.setTimeout(res, 800);
          });
        }

        sourceNode = audioContext.createMediaElementSource(video);
        connectSilentSink();
        streamDest = audioContext.createMediaStreamDestination();
        sourceNode.connect(streamDest);
        sourceNode.connect(silentSink!);

        if (!startTrackProcessorCapture() && !startWorkletCapture()) {
          startScriptProcessorCapture();
        }

        await video.play();
        captureStartedAt = performance.now();
        log('info', 'pitch-preserved capture started', {
          speed,
          wallDurationSec: Math.round(wallDurationSec * 1000) / 1000,
          captureMethod,
        });

        // ended ではすぐ切らない。preservesPitch の遅延バッファを末尾余裕まで吐く。
        let sourceEndedAt = 0;
        const onEnded = () => {
          video.removeEventListener('ended', onEnded);
          if (sourceEndedAt === 0) sourceEndedAt = performance.now();
        };
        video.addEventListener('ended', onEnded);

        const endWatch = window.setInterval(() => {
          if (settled) {
            window.clearInterval(endWatch);
            return;
          }
          const sourceEnd = targetStart + sourceDurationSec - 0.03;
          if (video.currentTime >= sourceEnd || video.ended) {
            if (sourceEndedAt === 0) sourceEndedAt = performance.now();
            const afterEnd = (performance.now() - sourceEndedAt) / 1000;
            if (afterEnd >= extraTailSec) {
              window.clearInterval(endWatch);
              video.pause();
              finishFromCollected();
            }
          }
        }, 50);
      } catch (e) {
        log('warn', 'pitch-preserved capture start failed', {
          error: e instanceof Error ? e.message : String(e),
        });
        safeResolve(null);
      }
    };

    void startCapture();
  });
}
