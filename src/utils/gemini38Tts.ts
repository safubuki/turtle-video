/**
 * Gemini 3.8 TTS の Interactions API 用リクエストと REST 応答契約。
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 * @see https://ai.google.dev/api/interactions-api
 */
import type { NarrationTtsEngine, NarrationTtsPace, NarrationTtsTone } from '../types';
import { parseDeliveryMarkup } from './narrationDelivery';

export const GEMINI_38_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const TONE_STYLES: Record<NarrationTtsTone, string> = {
  natural: '',
  warm: 'warm and friendly',
  calm: 'calm and relaxed',
  energetic: 'cheerful and energetic',
  clear: 'clear and articulate',
};

const PACE_STYLES: Record<NarrationTtsPace, string> = {
  normal: '',
  slow: 'speaking slowly',
  fast: 'speaking rapidly',
};

export function buildGemini38TtsRequest(input: {
  engine: Exclude<NarrationTtsEngine, 'legacy'>;
  script: string;
  voice: string;
  tone: NarrationTtsTone;
  pace: NarrationTtsPace;
  styleDetail: string;
}) {
  if (input.engine !== 'gemini-3.8-flash-tts' && input.engine !== 'gemini-3.8-flash-lite-tts') {
    throw new Error('Gemini 3.8 TTS のモデル指定が正しくありません。');
  }
  if (typeof input.voice !== 'string' || !input.voice.trim()) {
    throw new Error('Gemini 3.8 TTS の声を選択してください。');
  }
  const baseStyle = [TONE_STYLES[input.tone], PACE_STYLES[input.pace], input.styleDetail.trim()]
    .filter(Boolean);
  const content: Array<{
    type: 'text';
    text: string;
    annotations?: Array<{ type: 'speech_metadata'; style: string }>;
  }> = [];
  let leadingWhitespace = '';
  for (const segment of parseDeliveryMarkup(input.script)) {
    if (!segment.text.trim()) {
      if (content.length > 0) content[content.length - 1].text += segment.text;
      else leadingWhitespace += segment.text;
      continue;
    }
    const style = [...baseStyle, segment.toneTag].filter(Boolean).join(', ');
    content.push({
      type: 'text',
      text: leadingWhitespace + segment.text,
      ...(style ? { annotations: [{ type: 'speech_metadata', style }] } : {}),
    });
    leadingWhitespace = '';
  }

  if (content.length === 0) {
    throw new Error('読み上げる原稿が空です。');
  }

  return {
    model: input.engine,
    store: false,
    input: [{ type: 'user_input' as const, content }],
    response_format: { type: 'audio' as const, mime_type: 'audio/wav' as const },
    generation_config: { speech_config: [{ voice: input.voice }] },
  };
}

export function readGemini38OutputAudio(response: unknown): string {
  const data = response as {
    output_audio?: { data?: unknown };
    outputAudio?: { data?: unknown };
    steps?: Array<{ type?: string; content?: Array<{ type?: string; data?: unknown }> }>;
    error?: { message?: string };
  } | null;
  const audioContent = data?.steps
    ?.filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((content) => content.type === 'audio' && typeof content.data === 'string')
    .pop();
  const encoded = [data?.output_audio?.data, data?.outputAudio?.data, audioContent?.data]
    .find((value): value is string => typeof value === 'string' && value.length > 0);
  if (typeof encoded !== 'string' || !encoded) {
    throw new Error(data?.error?.message || '音声データを取得できませんでした。');
  }
  return encoded;
}
