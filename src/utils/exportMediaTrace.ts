/**
 * @file exportMediaTrace.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 書き出し中の共有 <video> の状態変化を記録する診断用トレース（ログモード「詳細」のときだけ使う）。
 *
 * 書き出し映像でクリップが途中で冒頭へ戻る等の症状は、エンジンのログに現れない経路で
 * 再生位置が動かされていることがある。誰がいつ動かしたかを特定するため、
 * - メディアイベント（seeking / ended / pause / play / emptied / loadstart / ratechange）
 * - 再生位置の大きな書き換え（呼び出し元のスタック付き）
 * をタイムライン時刻と一緒に記録する。書き出しが終わったら必ず detach する。
 */

export const EXPORT_MEDIA_TRACE_EVENTS = [
  'seeking',
  'ended',
  'pause',
  'play',
  'emptied',
  'loadstart',
  'ratechange',
] as const;

/** これ以上の再生位置の書き換えだけ呼び出し元を記録する（通常の小さな補正は除く） */
export const EXPORT_MEDIA_TRACE_SEEK_STACK_MIN_SEC = 0.25;
/** 1 回の書き出しで記録する件数の上限（ログの 500 件上限を食い潰さない） */
export const EXPORT_MEDIA_TRACE_MAX_ENTRIES = 200;

export interface ExportMediaTraceOptions {
  elements: Array<{ id: string; element: HTMLVideoElement }>;
  getTimelineSec: () => number;
  log: (message: string, details: Record<string, unknown>) => void;
  maxEntries?: number;
}

function round3(value: number): number | null {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

/** スタックから先頭（Error 行とトレース自身）を除いた数行を返す */
export function summarizeCallerStack(stack: string | undefined, maxLines = 6): string[] {
  if (!stack) return [];
  return stack
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.includes('exportMediaTrace'))
    .slice(0, maxLines);
}

/**
 * トレースを開始し、解除関数を返す。解除すると要素へ加えた変更をすべて元に戻す。
 */
export function attachExportMediaTrace(options: ExportMediaTraceOptions): () => void {
  const maxEntries = options.maxEntries ?? EXPORT_MEDIA_TRACE_MAX_ENTRIES;
  let count = 0;
  const cleanups: Array<() => void> = [];
  const currentTimeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');

  const emit = (message: string, details: Record<string, unknown>) => {
    if (count >= maxEntries) return;
    count += 1;
    const timelineMs = Math.round(options.getTimelineSec() * 1000);
    // 同じメッセージの連続はログ側で間引かれるため、時刻を含めて区別する。
    options.log(`${message}@${timelineMs}`, { timelineMs, ...details });
  };

  for (const { id, element } of options.elements) {
    for (const type of EXPORT_MEDIA_TRACE_EVENTS) {
      const listener = () => {
        emit(`export.media.${type}`, {
          videoId: id,
          currentTime: round3(element.currentTime),
          paused: element.paused,
          ended: element.ended,
          readyState: element.readyState,
          playbackRate: element.playbackRate,
        });
      };
      element.addEventListener(type, listener);
      cleanups.push(() => element.removeEventListener(type, listener));
    }

    // 再生位置の書き換え元を知るため、この要素だけ currentTime の setter を包む。
    if (currentTimeDescriptor?.get && currentTimeDescriptor.set) {
      const { get, set } = currentTimeDescriptor;
      try {
        Object.defineProperty(element, 'currentTime', {
          configurable: true,
          enumerable: currentTimeDescriptor.enumerable,
          get() {
            return get.call(this);
          },
          set(value: number) {
            const before = get.call(this) as number;
            if (
              Number.isFinite(value)
              && Number.isFinite(before)
              && Math.abs(value - before) >= EXPORT_MEDIA_TRACE_SEEK_STACK_MIN_SEC
            ) {
              emit('export.media.seekCall', {
                videoId: id,
                from: round3(before),
                to: round3(value),
                caller: summarizeCallerStack(new Error().stack),
              });
            }
            set.call(this, value);
          },
        });
        cleanups.push(() => {
          // インスタンスに加えた定義を消し、プロトタイプの currentTime へ戻す。
          delete (element as unknown as Record<string, unknown>).currentTime;
        });
      } catch {
        /* 定義できない環境ではイベントだけ記録する */
      }
    }
  }

  return () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      try {
        cleanup?.();
      } catch {
        /* ignore */
      }
    }
  };
}
