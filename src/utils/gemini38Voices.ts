/** Gemini 3.8 TTS の追加音声を Voices API から取得する。 */
export interface Gemini38Voice {
  id: string;
  label: string;
  description: string;
  gender: 'female' | 'male' | 'neutral' | 'unknown';
  languageCode: string;
  persona: string;
  context: string;
  type: 'prebuilt' | 'prompted' | 'replicated';
}

type VoiceResponse = {
  voices?: Array<{
    id?: unknown;
    display_name?: unknown;
    description?: unknown;
    gender?: unknown;
    language_code?: unknown;
    persona?: unknown;
    context?: unknown;
    type?: unknown;
  }>;
  next_page_token?: unknown;
  error?: { message?: string };
};

export async function listGemini38Voices(apiKey: string, signal?: AbortSignal): Promise<Gemini38Voice[]> {
  const voices = new Map<string, Gemini38Voice>();
  const seenTokens = new Set<string>();
  let pageToken = '';

  do {
    const url = new URL('https://generativelanguage.googleapis.com/v1beta/voices');
    url.searchParams.set('page_size', '1000');
    if (pageToken) url.searchParams.set('page_token', pageToken);
    const response = await fetch(url, {
      headers: { 'x-goog-api-key': apiKey },
      referrerPolicy: 'no-referrer',
      signal,
    });
    const data = await response.json() as VoiceResponse;
    if (!response.ok) throw new Error(data.error?.message || `音声一覧の取得に失敗しました（HTTP ${response.status}）`);

    for (const voice of data.voices ?? []) {
      if (typeof voice.id !== 'string' || !voice.id) continue;
      const type = voice.type;
      if (type !== 'prebuilt' && type !== 'prompted' && type !== 'replicated') continue;
      const languageCode = typeof voice.language_code === 'string' ? voice.language_code : '';
      // 基本の30声は別管理。追加ライブラリは利用する2言語だけを保持する。
      if (!/^(ja|en)(-|$)/i.test(languageCode)) continue;
      voices.set(voice.id, {
        id: voice.id,
        label: typeof voice.display_name === 'string' && voice.display_name ? voice.display_name : voice.id,
        description: typeof voice.description === 'string' ? voice.description : '',
        gender: voice.gender === 'female' || voice.gender === 'male' || voice.gender === 'neutral' ? voice.gender : 'unknown',
        languageCode,
        persona: typeof voice.persona === 'string' ? voice.persona.trim() : '',
        context: typeof voice.context === 'string' ? voice.context.trim() : '',
        type,
      });
    }

    pageToken = typeof data.next_page_token === 'string' ? data.next_page_token : '';
    if (pageToken && seenTokens.has(pageToken)) throw new Error('音声一覧のページ情報が重複しました。');
    if (pageToken) seenTokens.add(pageToken);
  } while (pageToken);

  return [...voices.values()];
}
