import { describe, expect, it, vi } from 'vitest';
import { fetchGeminiWithRetry, isTransientGeminiStatus } from '../utils/geminiRetry';

describe('fetchGeminiWithRetry', () => {
  it('429と503を指数バックオフしてから成功レスポンスを返す', async () => {
    const responses = [
      new Response('rate limited', { status: 429 }),
      new Response('unavailable', { status: 503 }),
      new Response('ok', { status: 200 }),
    ];
    const request = vi.fn(async () => responses.shift() as Response);
    const sleep = vi.fn(async () => {});
    const onRetry = vi.fn();

    const response = await fetchGeminiWithRetry(request, {
      sleep,
      onRetry,
      random: () => 0,
    });

    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(sleep).toHaveBeenNthCalledWith(2, 2000);
    expect(onRetry).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        retryNumber: 1,
        status: 429,
      })
    );
  });

  it('一時的なfetch失敗も再試行する', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await fetchGeminiWithRetry(request, {
      sleep: async () => {},
      random: () => 0,
    });

    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('入力や認証に関する4xxは再試行しない', async () => {
    const request = vi.fn(async () => new Response('bad request', { status: 400 }));

    const response = await fetchGeminiWithRetry(request, {
      sleep: async () => {},
    });

    expect(response.status).toBe(400);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('再試行回数を超えた最後のレスポンスを呼び出し元へ返す', async () => {
    const request = vi.fn(async () => new Response('unavailable', { status: 503 }));

    const response = await fetchGeminiWithRetry(request, {
      maxRetries: 2,
      sleep: async () => {},
      random: () => 0,
    });

    expect(response.status).toBe(503);
    expect(request).toHaveBeenCalledTimes(3);
  });
});

describe('isTransientGeminiStatus', () => {
  it.each([408, 429, 500, 502, 503, 504])('%iは再試行対象', (status) => {
    expect(isTransientGeminiStatus(status)).toBe(true);
  });

  it.each([400, 401, 403, 404, 501])('%iは再試行しない', (status) => {
    expect(isTransientGeminiStatus(status)).toBe(false);
  });
});
