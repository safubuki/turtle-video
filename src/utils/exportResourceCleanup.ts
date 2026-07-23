/**
 * WebCodecs / MediaStream は GC 任せにすると、書き出し完了後もハードウェア資源を
 * 保持し続けることがある。標準・Safari 両エンジンで同じ解放規約を使うための
 * 小さな共通ヘルパー。
 */

type CloseableCodec = {
  state?: string;
  close: () => void;
};

type FlushableCodec = {
  flush: () => Promise<void>;
};

type CancellableReader = {
  cancel: () => Promise<unknown>;
};

export function closeExportCodec(codec: CloseableCodec | null | undefined): boolean {
  if (!codec || codec.state === 'closed') return false;
  try {
    codec.close();
    return true;
  } catch {
    return false;
  }
}

export async function flushExportCodecWithTimeout(
  codec: FlushableCodec,
  codecName: string,
  timeoutMs = 30_000,
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      codec.flush(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${codecName} の終了処理がタイムアウトしました`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

export function cancelExportReader(
  reader: CancellableReader | null | undefined,
): boolean {
  if (!reader) return false;
  try {
    void reader.cancel().catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

export function stopExportMediaStream(
  stream: MediaStream | null | undefined,
): number {
  if (!stream) return 0;
  let stopped = 0;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
      stopped += 1;
    } catch {
      // 既に終了済みの track は無視する。
    }
  });
  return stopped;
}
