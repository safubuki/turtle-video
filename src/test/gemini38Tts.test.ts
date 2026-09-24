import { describe, expect, it } from 'vitest';
import { buildGemini38TtsRequest, readGemini38OutputAudio } from '../utils/gemini38Tts';

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
    expect(request.response_format).toEqual({ type: 'audio' });
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
});
