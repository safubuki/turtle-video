import { afterEach, describe, expect, it, vi } from 'vitest';
import { listGemini38Voices } from '../utils/gemini38Voices';

afterEach(() => vi.unstubAllGlobals());

describe('Gemini 3.8 音声ライブラリ', () => {
  it('全ページの追加音声 ID を取得し、重複を除いて返す', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          voices: [
            { id: 'Aoede', type: 'prebuilt', display_name: 'Aoede' },
            { id: 'NewVoice', type: 'prebuilt', display_name: '新しい声', gender: 'female', language_code: 'ja-JP', description: '穏やか', persona: '教師', context: '教育' },
            { id: 'FrenchVoice', type: 'prebuilt', display_name: 'フランス語の声', language_code: 'fr-FR' },
          ],
          next_page_token: 'next',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [
          { id: 'NewVoice', type: 'prebuilt', display_name: '新しい声', gender: 'female', language_code: 'ja-JP', persona: '教師', context: '教育' },
          { id: 'voice_custom', type: 'prompted', display_name: '自作の声', language_code: 'en-GB', persona: 'Narrator', context: 'Audiobook' },
        ] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await listGemini38Voices('test-key');

    expect(result.map((voice) => voice.id)).toEqual(['NewVoice', 'voice_custom']);
    expect(result[0]).toMatchObject({ languageCode: 'ja-JP', persona: '教師', context: '教育' });
    expect(result[1]).toMatchObject({ languageCode: 'en-GB', persona: 'Narrator', context: 'Audiobook' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-key');
    expect(String(fetchMock.mock.calls[1][0])).toContain('page_token=next');
  });

  it('API エラーを表示用メッセージとして返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'API key denied' } }),
    }));
    await expect(listGemini38Voices('test-key')).rejects.toThrow('API key denied');
  });
});
