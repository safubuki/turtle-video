/**
 * @file useAiNarration.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description Gemini APIを使用してAIナレーション（スクリプト生成、音声合成）を行うためのカスタムフック。
 */
import { useState, useCallback } from 'react';
import type { AudioTrack } from '../types';
import {
  GEMINI_API_BASE_URL,
  GEMINI_SCRIPT_MODEL,
  GEMINI_SCRIPT_FALLBACK_MODELS,
  DEFAULT_NARRATION_TTS_ENGINE,
  VOICE_OPTIONS,
} from '../constants';
import {
  GEMINI_38_INTERACTIONS_URL,
  buildGemini38TtsRequest,
  readGemini38OutputAudio,
} from '../utils/gemini38Tts';
import { useLogStore } from '../stores/logStore';

// API キー (環境変数から取得)
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

/**
 * useAiNarration - AI ナレーション生成ロジックを提供するフック
 * Gemini API を使用したスクリプト生成と音声合成
 */
export interface UseAiNarrationReturn {
  // State
  showAiModal: boolean;
  setShowAiModal: React.Dispatch<React.SetStateAction<boolean>>;
  aiPrompt: string;
  setAiPrompt: React.Dispatch<React.SetStateAction<string>>;
  aiScript: string;
  setAiScript: React.Dispatch<React.SetStateAction<string>>;
  aiVoice: string;
  setAiVoice: React.Dispatch<React.SetStateAction<string>>;
  isAiLoading: boolean;

  // Methods
  generateScript: () => Promise<void>;
  generateSpeech: (onNarrationCreated: (narration: AudioTrack) => void) => Promise<void>;
  resetAiState: () => void;
}

export function useAiNarration(): UseAiNarrationReturn {
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiScript, setAiScript] = useState('');
  const [aiVoice, setAiVoice] = useState('Aoede');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // スクリプト生成
  const generateScript = useCallback(async () => {
    const trimmedPrompt = aiPrompt.trim();
    if (!trimmedPrompt) return;
    setIsAiLoading(true);
    useLogStore.getState().info('AUDIO', 'AIスクリプト生成を開始', { prompt: trimmedPrompt.substring(0, 50) });
    try {
      const modelsToTry = [GEMINI_SCRIPT_MODEL, ...GEMINI_SCRIPT_FALLBACK_MODELS]
        .filter((model, idx, arr) => arr.indexOf(model) === idx);

      const systemInstruction = [
        'あなたは日本語の動画ナレーション原稿を作るプロです。',
        '出力は読み上げる本文のみ、1段落、1つだけ返してください。',
        '挨拶・見出し・箇条書き・注釈・引用符・絵文字は禁止です。',
        'テーマに沿って、30秒前後の短尺動画で使える自然な口語文にしてください。',
        '文字数は60〜120文字を目安にし、聞き取りやすい短文中心にしてください。',
      ].join('\n');

      const userPrompt = [
        `テーマ: ${trimmedPrompt}`,
        '用途: 短い動画のナレーション',
        '出力: ナレーション本文のみ',
      ].join('\n');

      for (let i = 0; i < modelsToTry.length; i++) {
        const model = modelsToTry[i];
        const hasNextModel = i < modelsToTry.length - 1;

        const response = await fetch(`${GEMINI_API_BASE_URL}/${model}:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          referrerPolicy: 'no-referrer',
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            contents: [
              {
                parts: [{ text: userPrompt }],
              },
            ],
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({} as { error?: { message?: string } }));
          const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
          const isModelUnavailable = /no longer available|not found|404|model.+(available|found)/i.test(errorMessage);
          if (hasNextModel && isModelUnavailable) {
            useLogStore.getState().warn('AUDIO', 'スクリプト生成モデルをフォールバック', { model, errorMessage });
            continue;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        const parts: Array<{ text?: unknown; thought?: unknown }> = data.candidates?.[0]?.content?.parts ?? [];
        const text = parts
          .filter((part) => !part?.thought && typeof part?.text === 'string')
          .map((part) => part.text as string)
          .join('\n');
        if (text.trim()) {
          const normalized = text
            .replace(/\r?\n+/g, ' ')
            .replace(/^(原稿案|ナレーション|台本)\s*[:：]\s*/i, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
          useLogStore.getState().info('AUDIO', 'AIスクリプト生成成功', { scriptLength: normalized.length, model });
          setAiScript(normalized);
          return;
        }
      }

      throw new Error('スクリプトの生成結果が空です');
    } catch (e) {
      useLogStore.getState().error('AUDIO', 'AIスクリプト生成失敗', { error: e instanceof Error ? e.message : String(e) });
      console.error('スクリプト生成エラー:', e);
      throw new Error('スクリプト生成に失敗しました');
    } finally {
      setIsAiLoading(false);
    }
  }, [aiPrompt]);

  // 音声合成
  const generateSpeech = useCallback(
    async (onNarrationCreated: (narration: AudioTrack) => void) => {
      if (!aiScript) return;
      setIsAiLoading(true);
      useLogStore.getState().info('AUDIO', 'AI音声合成を開始', { voice: aiVoice, scriptLength: aiScript.length });
      try {
        const request = buildGemini38TtsRequest({
          engine: DEFAULT_NARRATION_TTS_ENGINE,
          script: aiScript,
          voice: aiVoice,
          tone: 'natural',
          pace: 'normal',
          styleDetail: '',
        });
        const response = await fetch(GEMINI_38_INTERACTIONS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          referrerPolicy: 'no-referrer',
          body: JSON.stringify(request),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const encodedAudio = readGemini38OutputAudio(await response.json());
        const binaryString = window.atob(encodedAudio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const wavBlob = new Blob([bytes.buffer], { type: 'audio/wav' });
        const blobUrl = URL.createObjectURL(wavBlob);

        const audio = new Audio(blobUrl);
        audio.onloadedmetadata = () => {
          const voiceLabel = VOICE_OPTIONS.find((v) => v.id === aiVoice)?.label || 'AI音声';
          useLogStore.getState().info('AUDIO', 'AI音声合成成功', { voice: aiVoice, duration: audio.duration });
          const narration: AudioTrack = {
            file: { name: `AIナレーション_${voiceLabel}.wav` },
            url: blobUrl,
            blobUrl: blobUrl,
            startPoint: 0,
            delay: 0,
            volume: 1.0,
            fadeIn: false,
            fadeOut: false,
            fadeInDuration: 2.0,
            fadeOutDuration: 2.0,
            duration: audio.duration,
            isAi: true,
          };
          onNarrationCreated(narration);
          setShowAiModal(false);
        };
      } catch (e) {
        useLogStore.getState().error('AUDIO', 'AI音声合成失敗', { error: e instanceof Error ? e.message : String(e) });
        console.error('音声生成エラー:', e);
        throw new Error('音声生成に失敗しました');
      } finally {
        setIsAiLoading(false);
      }
    },
    [aiScript, aiVoice]
  );

  // 状態リセット
  const resetAiState = useCallback(() => {
    setAiPrompt('');
    setAiScript('');
    setAiVoice('Aoede');
    setShowAiModal(false);
    setIsAiLoading(false);
  }, []);

  return {
    showAiModal,
    setShowAiModal,
    aiPrompt,
    setAiPrompt,
    aiScript,
    setAiScript,
    aiVoice,
    setAiVoice,
    isAiLoading,
    generateScript,
    generateSpeech,
    resetAiState,
  };
}

export default useAiNarration;
