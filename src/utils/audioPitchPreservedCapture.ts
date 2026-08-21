/**
 * @file audioPitchPreservedCapture.ts
 * @description 倍速 export 用。プレビューと同じ HTMLMediaElement 経路
 * （playbackRate + preservesPitch=true）で動画音声をキャプチャし、
 * OfflineAudio に rate=1 で載せることで音程をプレビューに揃える。
 *
 * AudioBufferSourceNode.playbackRate や簡易 WSOLA ではプレビューと聴感が一致しなかった。
 */

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
    let silentSink: GainNode | null = null;
    let objectUrl: string | null = null;
    const chunksL: Float32Array[] = [];
    const chunksR: Float32Array[] = [];
    let totalFrames = 0;
    let captureStartedAt = 0;

    const cleanup = () => {
      if (processor) {
        processor.onaudioprocess = null;
        try { processor.disconnect(); } catch { /* ignore */ }
      }
      if (sourceNode) {
        try { sourceNode.disconnect(); } catch { /* ignore */ }
      }
      if (silentSink) {
        try { silentSink.disconnect(); } catch { /* ignore */ }
      }
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
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

    // 壁時計キャプチャ時間 + 余裕
    const timeoutMs = Math.max(15000, (wallDurationSec + 8) * 1000);
    const timeoutId = window.setTimeout(() => {
      log('warn', 'pitch-preserved capture timeout', {
        wallDurationSec,
        totalFrames,
        capturedSec: totalFrames / audioContext.sampleRate,
      });
      finishFromCollected();
    }, timeoutMs);

    const finishFromCollected = () => {
      if (totalFrames < audioContext.sampleRate * 0.05) {
        log('warn', 'pitch-preserved capture too short', { totalFrames });
        safeResolve(null);
        return;
      }
      try {
        // 期待尺に合わせて切り詰め（余った無音を減らす）
        const expectedFrames = Math.max(
          1,
          Math.floor(wallDurationSec * audioContext.sampleRate),
        );
        const useFrames = Math.min(totalFrames, expectedFrames + Math.floor(audioContext.sampleRate * 0.05));
        const buffer = audioContext.createBuffer(2, useFrames, audioContext.sampleRate);
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
          wallDurationSec: Math.round(wallDurationSec * 1000) / 1000,
        });
        safeResolve(buffer);
      } catch (e) {
        log('warn', 'pitch-preserved capture build failed', {
          error: e instanceof Error ? e.message : String(e),
        });
        safeResolve(null);
      }
    };

    const startCapture = async () => {
      try {
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

        // プレビューと同じ音程維持（ブラウザ接頭辞差異に対応）
        try {
          const media = video as HTMLMediaElement & {
            preservesPitch?: boolean;
            mozPreservesPitch?: boolean;
            webkitPreservesPitch?: boolean;
          };
          media.preservesPitch = true;
          if ('mozPreservesPitch' in media) media.mozPreservesPitch = true;
          if ('webkitPreservesPitch' in media) media.webkitPreservesPitch = true;
        } catch { /* ignore */ }
        video.playbackRate = speed;

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
            // seek が来ない環境向け
            window.setTimeout(res, 800);
          });
        }

        sourceNode = audioContext.createMediaElementSource(video);
        processor = audioContext.createScriptProcessor(4096, 2, 2);
        silentSink = audioContext.createGain();
        silentSink.gain.value = 0;

        processor.onaudioprocess = (ev) => {
          if (settled) return;
          const input = ev.inputBuffer;
          const L = new Float32Array(input.getChannelData(0));
          const R = input.numberOfChannels > 1
            ? new Float32Array(input.getChannelData(1))
            : new Float32Array(L);
          chunksL.push(L);
          chunksR.push(R);
          totalFrames += L.length;

          // 壁時計ベースで十分取れたら終了
          if (captureStartedAt > 0) {
            const elapsed = (performance.now() - captureStartedAt) / 1000;
            if (elapsed >= wallDurationSec + 0.08) {
              video.pause();
              finishFromCollected();
            }
          }
        };

        sourceNode.connect(processor);
        processor.connect(silentSink);
        silentSink.connect(audioContext.destination);

        captureStartedAt = performance.now();
        await video.play();

        // ended / ソース終端
        const onEnded = () => {
          video.removeEventListener('ended', onEnded);
          if (!settled) finishFromCollected();
        };
        video.addEventListener('ended', onEnded);

        // ソース上の終端監視（playbackRate 込み）
        const endWatch = window.setInterval(() => {
          if (settled) {
            window.clearInterval(endWatch);
            return;
          }
          const sourceEnd = targetStart + sourceDurationSec - 0.03;
          if (video.currentTime >= sourceEnd || video.ended) {
            window.clearInterval(endWatch);
            video.pause();
            finishFromCollected();
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
