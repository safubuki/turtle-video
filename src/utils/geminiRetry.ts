/**
 * @file geminiRetry.ts
 * @description Gemini REST API の一時障害を、短い指数バックオフで再試行する。
 */

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_INITIAL_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 5000;
const DEFAULT_JITTER_MS = 250;

export interface GeminiRetryInfo {
  retryNumber: number;
  delayMs: number;
  status: number | null;
  error?: unknown;
}

interface GeminiFetchRetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  random?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  onRetry?: (info: GeminiRetryInfo) => void;
}

export function isTransientGeminiStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function parseRetryAfterMs(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, timestamp - nowMs);
}

function computeRetryDelayMs(
  response: Response | null,
  retryIndex: number,
  options: Required<
    Pick<GeminiFetchRetryOptions, 'initialDelayMs' | 'maxDelayMs' | 'jitterMs' | 'random'>
  >
): number {
  const retryAfterMs = parseRetryAfterMs(response?.headers.get('retry-after') ?? null, Date.now());
  if (retryAfterMs !== null) return Math.min(options.maxDelayMs, retryAfterMs);

  const exponentialDelay = options.initialDelayMs * 2 ** retryIndex;
  const jitter = Math.max(0, options.random()) * options.jitterMs;
  return Math.min(options.maxDelayMs, Math.round(exponentialDelay + jitter));
}

/**
 * Gemini の公式推奨に合わせ、429・408・主要 5xx・fetch の一時失敗だけを再試行する。
 * 400/401/403 など、入力や認証を直さない限り成功しないエラーは即座に返す。
 */
export async function fetchGeminiWithRetry(
  request: () => Promise<Response>,
  options: GeminiFetchRetryOptions = {}
): Promise<Response> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const delayOptions = {
    initialDelayMs: options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS,
    maxDelayMs: options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
    jitterMs: options.jitterMs ?? DEFAULT_JITTER_MS,
    random: options.random ?? Math.random,
  };
  const sleep =
    options.sleep ??
    ((delayMs: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, delayMs);
      }));

  for (let attempt = 0; ; attempt++) {
    let response: Response | null = null;
    try {
      response = await request();
      if (!isTransientGeminiStatus(response.status) || attempt >= maxRetries) {
        return response;
      }
    } catch (error) {
      const isTransientNetworkError = error instanceof TypeError;
      if (!isTransientNetworkError || attempt >= maxRetries) throw error;

      const delayMs = computeRetryDelayMs(null, attempt, delayOptions);
      options.onRetry?.({
        retryNumber: attempt + 1,
        delayMs,
        status: null,
        error,
      });
      await sleep(delayMs);
      continue;
    }

    const delayMs = computeRetryDelayMs(response, attempt, delayOptions);
    options.onRetry?.({
      retryNumber: attempt + 1,
      delayMs,
      status: response.status,
    });
    await sleep(delayMs);
  }
}
