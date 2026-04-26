import { useLogStore } from '../../../stores/logStore';
import type { IosSafariMediaRecorderStrategyContext } from '../../../hooks/export-strategies/types';
import {
  createMediaRecorderProbeResult,
  markMediaRecorderProbeFailure,
  markMediaRecorderProbeSuccess,
} from './mediaRecorderProbe';

type RequestFrameCapableTrack = MediaStreamTrack & {
  requestFrame?: () => void;
};

export async function runIosSafariMediaRecorderStrategy(
  context: IosSafariMediaRecorderStrategyContext,
): Promise<boolean> {
  const {
    canvas,
    masterDest,
    audioContext,
    signal,
    audioSources,
    preRenderedAudio,
    callbacks,
    state,
    refs,
    exportConfig,
    supportedMediaRecorderProfile,
  } = context;

  const log = useLogStore.getState();
  const exportSessionId = context.diagnostics?.exportSessionId;
  const profile = supportedMediaRecorderProfile;
  let probe = createMediaRecorderProbeResult(profile);
  if (!profile) {
    log.warn('RENDER', 'iOS Safari: MediaRecorder profile unavailable, fallback to WebCodecs', {
      exportSessionId,
      probe,
    });
    return false;
  }

  const canvasStream = canvas.captureStream(exportConfig.fps);
  const canvasVideoTrack = canvasStream.getVideoTracks()[0] as RequestFrameCapableTrack | undefined;
  const sourceAudioStream = preRenderedAudio?.stream ?? masterDest.stream;
  const sourceAudioTracks = sourceAudioStream.getAudioTracks();
  const liveAudioTracks = sourceAudioTracks.filter((track) => track.readyState === 'live');

  if (liveAudioTracks.length === 0) {
    log.warn('RENDER', 'iOS Safari: no live audio track for MediaRecorder, fallback to WebCodecs', {
      exportSessionId,
      probe,
      sourceTrackCount: sourceAudioTracks.length,
      sourceTrackStates: sourceAudioTracks.map((track) => track.readyState),
      hasPreRenderedAudio: !!preRenderedAudio,
    });
    canvasStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore
      }
    });
    return false;
  }

  const recorderAudioTracks = preRenderedAudio
    ? liveAudioTracks
    : liveAudioTracks.map((track) => track.clone());

  let keepAliveOscillator: OscillatorNode | null = null;
  let keepAliveGain: GainNode | null = null;
  let framePumpTimer: ReturnType<typeof setInterval> | null = null;
  let abortStopTimer: ReturnType<typeof setTimeout> | null = null;

  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...recorderAudioTracks,
  ]);

  if (canvasVideoTrack && typeof canvasVideoTrack.requestFrame === 'function') {
    const frameIntervalMs = Math.max(16, Math.round(1000 / exportConfig.fps));
    framePumpTimer = setInterval(() => {
      try {
        canvasVideoTrack.requestFrame?.();
      } catch {
        // ignore
      }
    }, frameIntervalMs);
  }

  if (!preRenderedAudio) {
    try {
      keepAliveOscillator = audioContext.createOscillator();
      keepAliveGain = audioContext.createGain();
      keepAliveOscillator.frequency.value = 440;
      keepAliveGain.gain.value = 0.00001;
      keepAliveOscillator.connect(keepAliveGain);
      keepAliveGain.connect(masterDest);
      keepAliveOscillator.start();
    } catch (err) {
      keepAliveOscillator = null;
      keepAliveGain = null;
      log.warn('RENDER', 'iOS Safari: failed to create keep-alive audio node', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const cleanupStreams = () => {
    canvasStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore
      }
    });

    recorderAudioTracks.forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore
      }
    });

    if (framePumpTimer) {
      clearInterval(framePumpTimer);
      framePumpTimer = null;
    }

    if (abortStopTimer) {
      clearTimeout(abortStopTimer);
      abortStopTimer = null;
    }

    if (keepAliveOscillator) {
      try {
        keepAliveOscillator.stop();
      } catch {
        // ignore
      }
      try {
        keepAliveOscillator.disconnect();
      } catch {
        // ignore
      }
      keepAliveOscillator = null;
    }

    if (keepAliveGain) {
      try {
        keepAliveGain.disconnect();
      } catch {
        // ignore
      }
      keepAliveGain = null;
    }

    preRenderedAudio?.cleanup();
  };

  const recorderOptions: MediaRecorderOptions = {
    videoBitsPerSecond: exportConfig.videoBitrate,
    audioBitsPerSecond: 128000,
  };
  if (profile.mimeType) {
    recorderOptions.mimeType = profile.mimeType;
  }

  log.info('RENDER', 'iOS Safari: starting MediaRecorder export strategy', {
    exportSessionId,
    mimeType: profile.mimeType || '(default)',
    extension: profile.extension,
    sourceAudioTrackCount: sourceAudioTracks.length,
    sourceAudioTrackStates: sourceAudioTracks.map((track) => track.readyState),
    recorderAudioTrackCount: recorderAudioTracks.length,
    hasCanvasFramePump: !!framePumpTimer,
    hasPreRenderedAudio: !!preRenderedAudio,
  });

  let startedSuccessfully = false;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const chunks: Blob[] = [];
    let recorder: MediaRecorder | null = null;
    let pausedByVisibility = false;
    let visibilityListenersAttached = false;

    const finishResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const handleRecorderVisibilityChange = () => {
      if (!recorder || recorder.state === 'inactive' || typeof document === 'undefined') {
        return;
      }

      const isVisible = document.visibilityState === 'visible';
      if (!isVisible) {
        if (recorder.state === 'recording') {
          try {
            recorder.pause();
            pausedByVisibility = true;
            log.info('RENDER', 'iOS Safari: paused MediaRecorder while page hidden');
          } catch (err) {
            log.warn('RENDER', 'iOS Safari: failed to pause MediaRecorder while hidden', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        return;
      }

      if (pausedByVisibility && recorder.state === 'paused') {
        try {
          recorder.resume();
          pausedByVisibility = false;
          log.info('RENDER', 'iOS Safari: resumed MediaRecorder after visibility return');
        } catch (err) {
          log.warn('RENDER', 'iOS Safari: failed to resume MediaRecorder after visibility return', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      try {
        canvasVideoTrack?.requestFrame?.();
      } catch {
        // ignore
      }
    };

    const removeVisibilityListeners = () => {
      if (!visibilityListenersAttached || typeof document === 'undefined') {
        return;
      }
      document.removeEventListener('visibilitychange', handleRecorderVisibilityChange);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleRecorderVisibilityChange);
        window.removeEventListener('pageshow', handleRecorderVisibilityChange);
      }
      visibilityListenersAttached = false;
    };

    const addVisibilityListeners = () => {
      if (visibilityListenersAttached || typeof document === 'undefined') {
        return;
      }
      document.addEventListener('visibilitychange', handleRecorderVisibilityChange);
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', handleRecorderVisibilityChange);
        window.addEventListener('pageshow', handleRecorderVisibilityChange);
      }
      visibilityListenersAttached = true;
    };

    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
      removeVisibilityListeners();
      cleanupStreams();
    };

    const onAbort = () => {
      if (!recorder || recorder.state === 'inactive') {
        return;
      }

      try {
        canvasVideoTrack?.requestFrame?.();
      } catch {
        // ignore
      }

      try {
        recorder.requestData();
      } catch {
        // ignore
      }

      if (!abortStopTimer) {
        abortStopTimer = setTimeout(() => {
          abortStopTimer = null;
          if (recorder && recorder.state !== 'inactive') {
            try {
              recorder.stop();
            } catch {
              // ignore
            }
          }
        }, 180);
      }
    };

    try {
      recorder = new MediaRecorder(combined, recorderOptions);
      probe = markMediaRecorderProbeSuccess(probe, 'constructor');
      probe = {
        ...probe,
        requestDataSupported: typeof recorder.requestData === 'function',
      };
      refs.recorderRef.current = recorder;
    } catch (err) {
      cleanup();
      refs.recorderRef.current = null;
      probe = markMediaRecorderProbeFailure(probe, 'constructor', err);
      log.warn('RENDER', 'iOS Safari: failed to construct MediaRecorder, fallback to WebCodecs', {
        exportSessionId,
        probe,
        error: err instanceof Error ? err.message : String(err),
      });
      finishResolve();
      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });
    addVisibilityListeners();

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = () => {
      cleanup();
      finishReject(new Error('MediaRecorder recording failed'));
    };

    recorder.onstop = () => {
      cleanup();
      refs.recorderRef.current = null;

      if (chunks.length === 0) {
        finishReject(new Error('MediaRecorder produced no output data'));
        return;
      }

      const blob = new Blob(chunks, { type: profile.mimeType || 'video/mp4' });
      const url = URL.createObjectURL(blob);
      state.setExportUrl(url);
      state.setExportExt(profile.extension);

      log.info('RENDER', 'iOS Safari: MediaRecorder export completed', {
        exportSessionId,
        probe,
        chunks: chunks.length,
        blobSizeBytes: blob.size,
        extension: profile.extension,
      });

      callbacks.onRecordingStop(url, profile.extension);
      finishResolve();
    };

    try {
      recorder.start(250);
      probe = markMediaRecorderProbeSuccess(probe, 'start');
      try {
        canvasVideoTrack?.requestFrame?.();
      } catch {
        // ignore
      }
      preRenderedAudio?.startPlayback();
      startedSuccessfully = true;
      log.info('RENDER', 'iOS Safari: MediaRecorder export ready', {
        exportSessionId,
        probe,
      });
      audioSources?.onAudioPreRenderComplete?.();
      handleRecorderVisibilityChange();
    } catch (err) {
      cleanup();
      refs.recorderRef.current = null;
      probe = markMediaRecorderProbeFailure(probe, 'start', err);
      log.warn('RENDER', 'iOS Safari: failed to start MediaRecorder, fallback to WebCodecs', {
        exportSessionId,
        probe,
        error: err instanceof Error ? err.message : String(err),
      });
      finishResolve();
    }
  });

  return startedSuccessfully;
}