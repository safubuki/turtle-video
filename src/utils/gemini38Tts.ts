/**
 * Gemini 3.8 TTS の Interactions API 用リクエストと REST 応答契約。
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 * @see https://ai.google.dev/api/interactions-api
 */
import type { NarrationTtsEngine, NarrationTtsPace, NarrationTtsTone } from '../types';
import {
  convertInlineEventMarkersToTtsTags,
  parseDeliveryMarkup,
  stripInlineEventMarkers,
} from './narrationDelivery';

export const GEMINI_38_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

/** 保存データ等の音声エンジン指定を現行の Gemini 3.8 TTS へ正規化する（旧 'legacy' 等は既定へ移行） */
export function normalizeNarrationTtsEngine(engine: unknown): NarrationTtsEngine {
  return engine === 'gemini-3.8-flash-lite-tts' ? 'gemini-3.8-flash-lite-tts' : 'gemini-3.8-flash-tts';
}

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

/**
 * UI 上で 1 つだけ選べる「全体の雰囲気」統合プリセット（9種）。
 * 既存保存スキーマ（aiTtsTone + aiTtsStyleDetail）との完全互換を保ちつつ、
 * トーンと演出の重複設定を防ぎ、送信時は公式推奨の簡潔な英語 style へ変換する。
 */
export interface Gemini38AtmospherePreset {
  id: string;
  label: string;
  tone: NarrationTtsTone;
  /** 既定演出テキスト（tone のみで表す基本 5 種は空） */
  styleDetail: string;
  /** Gemini 3.8 TTS の speech_metadata.style へ送る英語表現 */
  styleEn: string;
}

/** 既存保存データ（旧プリセットの calm 等）を表示へフォールバックするための日本語名 */
export const TONE_FALLBACK_LABELS: Record<NarrationTtsTone, string> = {
  natural: '自然（標準）',
  warm: '温かく親しみ',
  calm: '落ち着き',
  energetic: '明るく元気',
  clear: 'ニュース・解説',
};

export const GEMINI_38_ATMOSPHERE_PRESETS: ReadonlyArray<Gemini38AtmospherePreset> = [
  // 1行目: 日常・実用ベース
  { id: 'natural', label: '自然（標準）', tone: 'natural', styleDetail: '', styleEn: '' },
  { id: 'energetic', label: '明るく元気', tone: 'energetic', styleDetail: '', styleEn: 'cheerful and energetic' },
  { id: 'warm', label: '温かく親しみ', tone: 'warm', styleDetail: '', styleEn: 'warm and friendly' },
  // 2行目: プロ・迫力・メリハリ系
  { id: 'clear', label: 'ニュース・解説', tone: 'clear', styleDetail: '', styleEn: 'clear and articulate' },
  {
    id: 'excited',
    label: '熱血・盛り上げ',
    tone: 'natural',
    styleDetail: '熱血・ハイテンションに',
    styleEn: 'enthusiastic, high-energy, excited delivery',
  },
  {
    id: 'documentary',
    label: '重厚・シリアス',
    tone: 'natural',
    styleDetail: 'ドキュメンタリー風の重厚な語りで',
    styleEn: 'deep, authoritative documentary narration',
  },
  // 3行目: エンタメ・感情・静寂表現系
  {
    id: 'comical',
    label: '楽しくコミカル',
    tone: 'natural',
    styleDetail: 'アニメ調でコミカルに',
    styleEn: 'playful, animated, comical delivery',
  },
  {
    id: 'poignant',
    label: '切なく・しんみり',
    tone: 'natural',
    styleDetail: '切なくしんみりとした語りで',
    styleEn: 'gentle, melancholic, and poignant tone',
  },
  {
    id: 'whisper',
    label: '静か・ささやき',
    tone: 'natural',
    styleDetail: '囁くように静かに（ASMR風）',
    styleEn: 'soft, intimate, whispered delivery',
  },
] as const;

/** 現在の tone + styleDetail が一致する統合雰囲気プリセット ID を返す（自由補足時は null） */
export function resolveActiveAtmospherePresetId(
  tone: NarrationTtsTone,
  styleDetail: string,
): string | null {
  const trimmed = styleDetail.trim();
  const matched = GEMINI_38_ATMOSPHERE_PRESETS.find(
    (preset) => preset.tone === tone && preset.styleDetail === trimmed,
  );
  return matched ? matched.id : null;
}

/**
 * 日本語の演出・話し方テキスト → Gemini 3.8 TTS が強く反応する簡潔な英語 style 表現。
 * 公式ガイドに従い、長文の演技メモではなく短く明確な話し方指示へ寄せる。
 */
const JA_STYLE_PHRASES: ReadonlyArray<{ pattern: RegExp; en: string }> = [
  { pattern: /ニュースキャスター|ニュース調|ニュース風|報道|端正/, en: 'composed broadcast news anchor, crisp articulation' },
  { pattern: /読み聞かせ|物語|朗読|昔話/, en: 'evocative storytelling, warm cinematic phrasing' },
  { pattern: /切なく|しんみり|悲しげ|悲しい|哀愁|憂い/, en: 'gentle, melancholic, and poignant tone' },
  { pattern: /囁く|ささや|ASMR|ひそひそ|ウィスパー/, en: 'soft, intimate, whispered delivery' },
  { pattern: /ドラマチック|感情豊か|劇的/, en: 'expressive, dramatic, emotionally rich delivery' },
  { pattern: /アニメ調|コミカル|ユーモア|おどけ|面白く/, en: 'playful, animated, comical delivery' },
  { pattern: /ドキュメンタリー|重厚|荘厳/, en: 'deep, authoritative documentary narration' },
  { pattern: /熱血|ハイテンション|興奮|実況|盛り上げ/, en: 'enthusiastic, high-energy, excited delivery' },
  { pattern: /相棒風|親身に|語りかける|フレンドリー|友人/, en: 'warm, conversational, friendly companion tone' },
  { pattern: /ホラー|不気味|怖い|怪談|サスペンス/, en: 'eerie, hushed, suspenseful tone' },
  { pattern: /丁寧|フォーマル|礼儀正/, en: 'polite, formal, articulate delivery' },
  { pattern: /クール|冷静|淡々|無機質/, en: 'cool, deadpan, composed delivery' },
  { pattern: /早口|スピーディ|テンポよく/, en: 'speaking rapidly' },
  { pattern: /ゆっくり|スロー|丁寧な間/, en: 'speaking slowly' },
];

function isMostlyAsciiText(value: string): boolean {
  const ascii = value.replace(/[^A-Za-z0-9]/g, '');
  const letters = value.replace(/[^A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]/g, '');
  if (!letters) return true;
  return ascii.length / Math.max(1, letters.length) >= 0.6;
}

/**
 * 自由入力またはプリセット由来の話し方補足（styleDetail）を、
 * Gemini 3.8 TTS の speech_metadata.style に適した表現へ正規化する。
 * - 英語中心の指定はそのまま尊重する
 * - 日本語プリセットや既知表現は簡潔な英語 style（最大2句）へ変換して効きを高める
 * - 辞書にない独自の日本語表現は原文をそのまま残す
 */
export function normalizeGemini38StyleDetail(detail: string): string {
  const trimmed = detail.trim();
  if (!trimmed) return '';
  if (isMostlyAsciiText(trimmed)) return trimmed;

  const exactPreset = GEMINI_38_ATMOSPHERE_PRESETS.find(
    (preset) => preset.styleDetail && preset.styleDetail === trimmed,
  );
  if (exactPreset) return exactPreset.styleEn;

  const matchedEn: string[] = [];
  for (const entry of JA_STYLE_PHRASES) {
    if (entry.pattern.test(trimmed) && !matchedEn.includes(entry.en)) {
      matchedEn.push(entry.en);
      if (matchedEn.length >= 2) break;
    }
  }
  if (matchedEn.length > 0) {
    return matchedEn.join(', ');
  }
  return trimmed;
}

/** 部分アクセントタグが全体の速度指示と競合するかどうか */
function isPaceOverrideTag(tag: string | null): boolean {
  return tag === 'fast' || tag === 'slow';
}

/** 部分アクセントタグが発声強度を大きく変えるため、全体の強めトーンを抑えるべきか */
function isDeliveryOverrideTag(tag: string | null): boolean {
  return tag === 'whispers' || tag === 'shouting';
}

export function buildGemini38TtsRequest(input: {
  engine: NarrationTtsEngine;
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

  const baseTone = TONE_STYLES[input.tone];
  const basePace = PACE_STYLES[input.pace];
  const normalizedDetail = normalizeGemini38StyleDetail(input.styleDetail);

  const content: Array<{
    type: 'text';
    text: string;
    annotations?: Array<{ type: 'speech_metadata'; style: string }>;
  }> = [];
  let leadingWhitespace = '';

  for (const segment of parseDeliveryMarkup(input.script)) {
    const convertedText = convertInlineEventMarkersToTtsTags(segment.text);
    if (!convertedText.trim()) {
      if (content.length > 0) content[content.length - 1].text += convertedText;
      else leadingWhitespace += convertedText;
      continue;
    }

    // 全体設定と部分アクセントの矛盾を防ぐ：
    // - 部分アクセントが早口/ゆっくりのときは全体速度を外す
    // - 部分アクセントがささやき/叫びのときは全体トーンの競合を避けて部分演出を優先する
    const segmentStyleParts = [
      isDeliveryOverrideTag(segment.toneTag) ? '' : baseTone,
      isPaceOverrideTag(segment.toneTag) ? '' : basePace,
      isDeliveryOverrideTag(segment.toneTag) ? '' : normalizedDetail,
      segment.toneTag ?? '',
    ].filter(Boolean);
    const style = segmentStyleParts.join(', ');

    content.push({
      type: 'text',
      text: leadingWhitespace + convertedText,
      ...(style ? { annotations: [{ type: 'speech_metadata', style }] } : {}),
    });
    leadingWhitespace = '';
  }

  const hasSpokenText = content.some((part) => stripInlineEventMarkers(part.text).trim().length > 0);
  if (content.length === 0 || !hasSpokenText) {
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
