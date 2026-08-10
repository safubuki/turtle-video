/**
 * @file webCodecsEncoderLifecycle.ts
 * @description WebCodecs encoder を終了経路に依存せず安全に解放する純ロジック。
 */

export interface ClosableWebCodecsEncoder {
  readonly state: 'configured' | 'unconfigured' | 'closed';
  close(): void;
}

export interface FlushableWebCodecsEncoder {
  flush(): Promise<void>;
}

export type WebCodecsEncoderCloseOutcome =
  | { status: 'closed' }
  | { status: 'already-closed' }
  | { status: 'missing' }
  | { status: 'failed'; error: string };

export interface OwnedWebCodecsEncoders {
  exportSessionId: string;
  videoEncoder: ClosableWebCodecsEncoder | null;
  audioEncoder: ClosableWebCodecsEncoder | null;
}

export type OwnedWebCodecsEncodersReleaseResult =
  | { status: 'no-active'; active: null }
  | { status: 'owner-mismatch'; active: OwnedWebCodecsEncoders }
  | {
      status: 'released';
      active: null;
      exportSessionId: string;
      videoResult: WebCodecsEncoderCloseOutcome;
      audioResult: WebCodecsEncoderCloseOutcome;
    };

function createWebCodecsAbortError(): DOMException {
  return new DOMException('WebCodecs encoder flush was aborted', 'AbortError');
}

/**
 * プリレンダリング済み音声を映像タイムラインの開始前に完全排出する。
 *
 * AudioEncoder の output callback と Canvas / VideoEncoder を同時に走らせると、
 * main thread と codec 資源の競合で HTMLVideoElement のデコード画面だけが止まることがある。
 * AbortSignal を race させ、キャンセル時は flush の完了を待ち続けない。
 */
export async function flushPreRenderedAudioBeforeVideo(
  encoder: FlushableWebCodecsEncoder,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) throw createWebCodecsAbortError();

  let rejectOnAbort: ((reason?: unknown) => void) | null = null;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = reject;
  });
  const onAbort = () => rejectOnAbort?.(createWebCodecsAbortError());
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    await Promise.race([Promise.resolve().then(() => encoder.flush()), abortPromise]);
    if (signal.aborted) throw createWebCodecsAbortError();
  } finally {
    signal.removeEventListener('abort', onAbort);
    rejectOnAbort = null;
  }
}

/**
 * VideoEncoder / AudioEncoder を冪等に close する。
 *
 * WebCodecs の codec system resources は GC のタイミングへ委ねず明示解放する。
 * close 済みや、一部ブラウザで close が例外になる場合も cleanup 自体は継続する。
 */
export function closeWebCodecsEncoderSafely(
  encoder: ClosableWebCodecsEncoder | null | undefined
): WebCodecsEncoderCloseOutcome {
  if (!encoder) return { status: 'missing' };

  try {
    if (encoder.state === 'closed') {
      return { status: 'already-closed' };
    }
    encoder.close();
    return { status: 'closed' };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 1 export セッションが所有する video/audio encoder をまとめて解放する。
 * expectedSessionId を指定した場合、古い finally から新しいセッションを閉じることを防ぐ。
 */
export function releaseOwnedWebCodecsEncoders(
  active: OwnedWebCodecsEncoders | null,
  expectedSessionId?: string
): OwnedWebCodecsEncodersReleaseResult {
  if (!active) return { status: 'no-active', active: null };
  if (expectedSessionId && active.exportSessionId !== expectedSessionId) {
    return { status: 'owner-mismatch', active };
  }

  return {
    status: 'released',
    active: null,
    exportSessionId: active.exportSessionId,
    videoResult: closeWebCodecsEncoderSafely(active.videoEncoder),
    audioResult: closeWebCodecsEncoderSafely(active.audioEncoder),
  };
}
