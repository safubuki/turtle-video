import { describe, expect, it } from 'vitest';
import {
  buildGemini38TtsRequest,
  normalizeGemini38StyleDetail,
  normalizeNarrationTtsEngine,
  readGemini38OutputAudio,
} from '../utils/gemini38Tts';

describe('Gemini 3.8 TTS Interactions API', () => {
  it('原稿をそのまま送り、声・雰囲気・速さを speech_metadata に設定する', () => {
    const request = buildGemini38TtsRequest({
      engine: 'gemini-3.8-flash-tts',
      script: 'こんにちは。',
      voice: 'Aoede',
      tone: 'warm',
      pace: 'slow',
      styleDetail: 'gentle intonation',
    });

    expect(request.model).toBe('gemini-3.8-flash-tts');
    expect(request.store).toBe(false);
    expect(request.response_format).toEqual({ type: 'audio', mime_type: 'audio/wav' });
    expect(request.generation_config.speech_config).toEqual([{ voice: 'Aoede' }]);
    expect(request.input[0].content).toEqual([{
      type: 'text',
      text: 'こんにちは。',
      annotations: [{
        type: 'speech_metadata',
        style: 'warm and friendly, speaking slowly, gentle intonation',
      }],
    }]);
  });

  it('原稿の区間別語り口を本文に混ぜず、区間ごとの style に変換する', () => {
    const request = buildGemini38TtsRequest({
      engine: 'gemini-3.8-flash-lite-tts',
      script: '最初。《明るく》こんにちは《/》 最後。',
      voice: 'Kore',
      tone: 'natural',
      pace: 'normal',
      styleDetail: '',
    });

    const content = request.input[0].content;
    expect(content.map((part) => part.text).join('')).toBe('最初。こんにちは 最後。');
    expect(content[1].annotations).toEqual([{ type: 'speech_metadata', style: 'bright' }]);
    expect(content[0].annotations).toBeUndefined();
    expect(request.model).toBe('gemini-3.8-flash-lite-tts');
    expect(request.generation_config.speech_config).toEqual([{ voice: 'Kore' }]);
  });

  it('日本語の雰囲気プリセットや自由演出を公式推奨の簡潔な英語 style へ変換する', () => {
    expect(normalizeGemini38StyleDetail('熱血・ハイテンションに'))
      .toBe('enthusiastic, high-energy, excited delivery');
    expect(normalizeGemini38StyleDetail('ドキュメンタリー風の重厚な語りで'))
      .toBe('deep, authoritative documentary narration');
    expect(normalizeGemini38StyleDetail('ニュースキャスター風に端正に'))
      .toBe('composed broadcast news anchor, crisp articulation');
    expect(normalizeGemini38StyleDetail('切なくしんみりとした語りで'))
      .toBe('gentle, melancholic, and poignant tone');
    expect(normalizeGemini38StyleDetail('アニメ調でコミカルに'))
      .toBe('playful, animated, comical delivery');

    const request = buildGemini38TtsRequest({
      engine: 'gemini-3.8-flash-tts',
      script: '今日のニュースです。',
      voice: 'Charon',
      tone: 'natural',
      pace: 'normal',
      styleDetail: 'ドキュメンタリー風の重厚な語りで',
    });
    expect(request.input[0].content[0].annotations?.[0].style)
      .toBe('deep, authoritative documentary narration');
  });

  it('全体設定と部分アクセントが矛盾する場合は部分アクセントを優先し、瞬間タグを英語タグへ変換する', () => {
    const request = buildGemini38TtsRequest({
      engine: 'gemini-3.8-flash-tts',
      script: '普通に話す。【少し間】《早口で》急いで伝える！《/》《ささやき》内緒だよ。【ため息】《/》最後は笑う【笑い】',
      voice: 'Leda',
      tone: 'energetic',
      pace: 'slow',
      styleDetail: '',
    });

    const content = request.input[0].content;
    // 通常区間: 全体設定（energetic + slow）＋【少し間】→ <short pause>
    expect(content[0].text).toContain('<short pause>');
    expect(content[0].annotations?.[0].style).toBe('cheerful and energetic, speaking slowly');

    // 早口区間: 全体の speaking slowly は除外されて fast が優先される
    expect(content[1].annotations?.[0].style).toBe('cheerful and energetic, fast');

    // ささやき区間: 全体の energetic と衝突を避けて whispers を優先し、【ため息】→ <sigh>
    expect(content[2].text).toContain('<sigh>');
    expect(content[2].annotations?.[0].style).toBe('speaking slowly, whispers');

    // 末尾区間: 【笑い】→ <laugh>
    expect(content[3].text).toContain('<laugh>');
  });

  it('Voices API の追加音声 ID をそのまま音声生成へ渡す', () => {
    const request = buildGemini38TtsRequest({
      engine: 'gemini-3.8-flash-tts',
      script: 'こんにちは。',
      voice: 'voice_custom',
      tone: 'natural',
      pace: 'normal',
      styleDetail: '',
    });
    expect(request.generation_config.speech_config).toEqual([{ voice: 'voice_custom' }]);
  });

  it('音声のない応答をエラーとして扱う', () => {
    expect(readGemini38OutputAudio({
      steps: [{ type: 'model_output', content: [{ type: 'audio', data: 'UklGRg==', mime_type: 'audio/wav' }] }],
    })).toBe('UklGRg==');
    expect(() => readGemini38OutputAudio({ error: { message: '音声がありません' } }))
      .toThrow('音声がありません');
    expect(() => readGemini38OutputAudio({})).toThrow('音声データを取得できませんでした');
  });

  it('保存データに不正なモデルや空の声・瞬間タグのみの原稿があれば生成リクエストを作らない', () => {
    const input = {
      engine: 'gemini-3.8-flash-tts' as const,
      script: 'こんにちは。',
      voice: 'Kore',
      tone: 'natural' as const,
      pace: 'normal' as const,
      styleDetail: '',
    };
    expect(() => buildGemini38TtsRequest({ ...input, engine: 'legacy' as typeof input.engine }))
      .toThrow('モデル指定が正しくありません');
    expect(() => buildGemini38TtsRequest({ ...input, voice: '  ' }))
      .toThrow('声を選択してください');
    expect(() => buildGemini38TtsRequest({ ...input, script: '【少し間】【ため息】' }))
      .toThrow('読み上げる原稿が空です');
  });

  it('normalizeNarrationTtsEngine は旧 legacy 指定を既定の Gemini 3.8 Flash TTS へ移行する', () => {
    expect(normalizeNarrationTtsEngine('legacy')).toBe('gemini-3.8-flash-tts');
    expect(normalizeNarrationTtsEngine(undefined)).toBe('gemini-3.8-flash-tts');
    expect(normalizeNarrationTtsEngine('gemini-3.8-flash-lite-tts')).toBe('gemini-3.8-flash-lite-tts');
  });

  it('API の最終音声を優先して読み取る', () => {
    expect(readGemini38OutputAudio({
      output_audio: { data: 'final-wav' },
      steps: [{ type: 'model_output', content: [{ type: 'audio', data: 'earlier-audio' }] }],
    })).toBe('final-wav');
  });
});
