/**
 * @file AiModal.tsx
 * @author Turtle Village
 * @description AIナレーションを生成するためのモーダルダイアログ。プロンプト入力、スクリプト生成、音声合成のフローを提供する。
 */
import React, { useEffect, useState } from 'react';
import { Sparkles, X, Loader, FileText, Mic, ChevronDown, CircleHelp, ExternalLink } from 'lucide-react';
import type { VoiceOption, VoiceId, NarrationScriptLength } from '../../types';
import { useDisableBodyScroll } from '../../hooks/useDisableBodyScroll';

interface AiModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiPrompt: string;
  aiScript: string;
  aiScriptLength: NarrationScriptLength;
  aiVoice: VoiceId;
  aiVoiceStyle: string;
  isAiLoading: boolean;
  voiceOptions: VoiceOption[];
  onPromptChange: (value: string) => void;
  onScriptChange: (value: string) => void;
  onScriptLengthChange: (value: NarrationScriptLength) => void;
  onVoiceChange: (value: VoiceId) => void;
  onVoiceStyleChange: (value: string) => void;
  onGenerateScript: () => void;
  onGenerateSpeech: () => void;
}

/**
 * AIナレーション生成モーダル
 */
const AiModal: React.FC<AiModalProps> = ({
  isOpen,
  onClose,
  aiPrompt,
  aiScript,
  aiScriptLength,
  aiVoice,
  aiVoiceStyle,
  isAiLoading,
  voiceOptions,
  onPromptChange,
  onScriptChange,
  onScriptLengthChange,
  onVoiceChange,
  onVoiceStyleChange,
  onGenerateScript,
  onGenerateSpeech,
}) => {
  // モーダル表示中は背景のスクロールを防止
  useDisableBodyScroll(isOpen);

  const tonePresets = [
    { id: 'standard', label: '標準', value: '' },
    { id: 'bright', label: '明るく', value: '明るく、親しみやすく' },
    { id: 'calm', label: '落ち着いて', value: '落ち着いて、ゆっくり丁寧に' },
  ] as const;

  const characterPresets = [
    { id: 'youthful', label: '若々しい', value: '若々しく、軽やかに' },
    { id: 'senior', label: '年配', value: '年配らしい深みのある調子で' },
    { id: 'anime', label: 'アニメ調', value: 'アニメ風に、抑揚をつけて' },
  ] as const;

  type TonePresetId = typeof tonePresets[number]['id'];
  type CharacterPresetId = typeof characterPresets[number]['id'];

  const cleanupStyleText = (text: string): string =>
    text
      .replace(/[。\s,、]{2,}/g, ' ')
      .replace(/^[。\s,、]+/, '')
      .replace(/[。\s,、]+$/, '')
      .trim();

  const removeStyleFragment = (text: string, fragment: string): string =>
    cleanupStyleText(text.replace(fragment, ' '));

  const buildVoiceStyle = (
    toneId: TonePresetId,
    characterIds: CharacterPresetId[],
    customText: string
  ): string => {
    const tone = tonePresets.find((item) => item.id === toneId)?.value.trim() ?? '';
    const characterValues = characterPresets
      .filter((item) => characterIds.includes(item.id))
      .map((item) => item.value.trim())
      .filter((value) => value.length > 0);
    const custom = customText.trim();
    const fragments = [tone, ...characterValues, custom].filter((value) => value.length > 0);
    return fragments.join('。');
  };

  const parseVoiceStyle = (
    value: string
  ): { toneId: TonePresetId; characterIds: CharacterPresetId[]; customText: string } => {
    const normalized = value.trim();
    if (!normalized) {
      return { toneId: 'standard', characterIds: [], customText: '' };
    }

    let remaining = normalized;
    let toneId: TonePresetId = 'standard';
    for (const preset of tonePresets) {
      if (!preset.value) {
        continue;
      }
      if (remaining.includes(preset.value)) {
        toneId = preset.id;
        remaining = removeStyleFragment(remaining, preset.value);
        break;
      }
    }

    const characterIds: CharacterPresetId[] = [];
    for (const preset of characterPresets) {
      if (remaining.includes(preset.value)) {
        characterIds.push(preset.id);
        remaining = removeStyleFragment(remaining, preset.value);
      }
    }

    return { toneId, characterIds, customText: cleanupStyleText(remaining) };
  };

  const [selectedTonePreset, setSelectedTonePreset] = useState<TonePresetId>('standard');
  const [selectedCharacterPresets, setSelectedCharacterPresets] = useState<CharacterPresetId[]>([]);
  const [customVoiceStyle, setCustomVoiceStyle] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const parsedVoiceStyle = parseVoiceStyle(aiVoiceStyle);
    setSelectedTonePreset(parsedVoiceStyle.toneId);
    setSelectedCharacterPresets(parsedVoiceStyle.characterIds);
    setCustomVoiceStyle(parsedVoiceStyle.customText);
  }, [aiVoiceStyle, isOpen]);

  const syncVoiceStyle = (
    toneId: TonePresetId,
    characterIds: CharacterPresetId[],
    customText: string
  ) => {
    onVoiceStyleChange(buildVoiceStyle(toneId, characterIds, customText));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-800 border border-gray-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-linear-to-r from-purple-900/50 to-blue-900/50">
          <h3 className="font-bold flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            <span>AIナレーションスタジオ</span>
            <button
              onClick={() => setShowHelp((prev) => !prev)}
              className="p-1 rounded-lg transition border border-blue-500/45 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200"
              title="このセクションの説明"
              aria-label="AIナレーションスタジオの説明"
            >
              <CircleHelp className="w-4 h-4" />
            </button>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 md:p-6 space-y-5 md:space-y-6 max-h-[78vh] overflow-y-auto">
          {showHelp && (
            <div className="rounded-xl border border-orange-400/45 bg-linear-to-br from-orange-500/18 via-amber-500/12 to-orange-500/6 p-3 md:p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-bold text-orange-100 flex items-center gap-1">
                  <CircleHelp className="w-4 h-4" /> AIナレーションスタジオの使い方
                </h4>
                <button
                  onClick={() => setShowHelp(false)}
                  className="p-1 rounded text-orange-200 hover:text-orange-100 hover:bg-orange-500/20 transition"
                  title="ヘルプを閉じる"
                  aria-label="ヘルプを閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs md:text-sm text-orange-50 leading-relaxed">
                先にAPI設定が必要です。右上の設定からGemini APIキーを登録してください。
              </p>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs md:text-sm text-orange-200 hover:text-orange-100 underline underline-offset-2"
              >
                APIキー取得（Google AI Studio）
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <ol className="list-decimal ml-4 space-y-1 text-xs md:text-sm text-orange-50 leading-relaxed">
                <li>STEP 1: テーマを入れて「AI原稿を作成」。テーマは任意で、長さも選べます。</li>
                <li>STEP 2: 原稿を直接編集。テーマなしでここから入力しても問題ありません。</li>
                <li>STEP 3: 声の選択と調子を決めて「AIナレーションを作成して追加」を押します。</li>
              </ol>
            </div>
          )}
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              Step 1: テーマ入力（任意）
            </label>
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="例: 京都旅行の動画"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            />
            <div className="text-xs text-gray-500">
              テーマを入れずに、Step 2へ直接入力して音声生成することもできます。
            </div>
            <fieldset className="space-y-2 pt-1">
              <legend className="text-xs font-bold text-gray-400 uppercase tracking-wider">文章の長さ</legend>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex flex-wrap gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                    <input
                      type="radio"
                      name="ai-script-length"
                      checked={aiScriptLength === 'short'}
                      onChange={() => onScriptLengthChange('short')}
                      className="accent-purple-500"
                    />
                    短め
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                    <input
                      type="radio"
                      name="ai-script-length"
                      checked={aiScriptLength === 'medium'}
                      onChange={() => onScriptLengthChange('medium')}
                      className="accent-purple-500"
                    />
                    中くらい
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                    <input
                      type="radio"
                      name="ai-script-length"
                      checked={aiScriptLength === 'long'}
                      onChange={() => onScriptLengthChange('long')}
                      className="accent-purple-500"
                    />
                    長め
                  </label>
                </div>
                <button
                  onClick={onGenerateScript}
                  disabled={isAiLoading || !aiPrompt.trim()}
                  className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1 disabled:opacity-50"
                >
                  {isAiLoading ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}{' '}
                  AI原稿を作成
                </button>
              </div>
            </fieldset>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              Step 2: 原稿編集（直接入力OK）
            </label>
            <textarea
              value={aiScript}
              onChange={(e) => onScriptChange(e.target.value)}
              placeholder="ここにそのままナレーション原稿を入力できます"
              className="w-full h-24 bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                Step 3: 声の設定
              </label>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 flex items-center gap-1">
                声の選択
              </label>
              <div className="relative">
                <select
                  value={aiVoice}
                  onChange={(e) => onVoiceChange(e.target.value as VoiceId)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 pr-10 text-sm appearance-none focus:outline-none focus:border-blue-500 text-gray-100"
                >
                  {voiceOptions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label} - {v.desc}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 absolute inset-y-0 right-3 my-auto text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 flex items-center gap-1">
                声の調子（オプション）
              </label>
              <fieldset className="space-y-2">
                <legend className="sr-only">話し方の雰囲気</legend>
                <div className="grid grid-cols-3 gap-2">
                  {tonePresets.map((preset) => (
                    <label
                      key={preset.id}
                      className={`rounded-md border px-2 py-2 text-center text-[11px] md:text-xs font-semibold cursor-pointer transition-colors ${
                        selectedTonePreset === preset.id
                          ? 'border-purple-500 bg-purple-500/20 text-white'
                          : 'border-gray-700 bg-gray-900/40 text-gray-200 hover:border-gray-500'
                      }`}
                    >
                      <input
                        type="radio"
                        name="voice-style-tone"
                        checked={selectedTonePreset === preset.id}
                        onChange={() => {
                          setSelectedTonePreset(preset.id);
                          syncVoiceStyle(preset.id, selectedCharacterPresets, customVoiceStyle);
                        }}
                        className="sr-only"
                      />
                      {preset.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="sr-only">話し方のキャラクター</legend>
                <div className="grid grid-cols-3 gap-2">
                  {characterPresets.map((preset) => {
                    const selected = selectedCharacterPresets.includes(preset.id);
                    return (
                      <label
                        key={preset.id}
                        className={`rounded-md border px-2 py-2 text-center text-[11px] md:text-xs font-semibold cursor-pointer transition-colors ${
                          selected
                            ? 'border-cyan-500 bg-cyan-500/20 text-white'
                            : 'border-gray-700 bg-gray-900/40 text-gray-200 hover:border-gray-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          name={`voice-style-character-${preset.id}`}
                          checked={selected}
                          onChange={() => {
                            const nextCharacterPresets = selected
                              ? selectedCharacterPresets.filter((id) => id !== preset.id)
                              : [...selectedCharacterPresets, preset.id];
                            setSelectedCharacterPresets(nextCharacterPresets);
                            syncVoiceStyle(selectedTonePreset, nextCharacterPresets, customVoiceStyle);
                          }}
                          className="sr-only"
                        />
                        {preset.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <input
                type="text"
                value={customVoiceStyle}
                onChange={(e) => {
                  const value = e.target.value;
                  setCustomVoiceStyle(value);
                  syncVoiceStyle(selectedTonePreset, selectedCharacterPresets, value);
                }}
                placeholder="追加ニュアンス（任意） 例: 少し低めで、ニュース番組のように"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 leading-relaxed">
                2段目は複数選択できます。自由入力は任意で追加できます。
              </p>
            </div>
          </div>
          <button
            onClick={onGenerateSpeech}
            disabled={isAiLoading || !aiScript.trim()}
            className="w-full bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all"
          >
            {isAiLoading ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : (
              <Mic className="w-5 h-5" />
            )}{' '}
            AIナレーションを作成して追加
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiModal;
