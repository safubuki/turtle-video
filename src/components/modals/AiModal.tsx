import React from 'react';
import { Sparkles, X, Loader, FileText, Mic, ChevronDown } from 'lucide-react';
import type { VoiceOption, VoiceId } from '../../types';

interface AiModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiPrompt: string;
  aiScript: string;
  aiVoice: VoiceId;
  isAiLoading: boolean;
  voiceOptions: VoiceOption[];
  onPromptChange: (value: string) => void;
  onScriptChange: (value: string) => void;
  onVoiceChange: (value: VoiceId) => void;
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
  aiVoice,
  isAiLoading,
  voiceOptions,
  onPromptChange,
  onScriptChange,
  onVoiceChange,
  onGenerateScript,
  onGenerateSpeech,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-800 border border-gray-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-linear-to-r from-purple-900/50 to-blue-900/50">
          <h3 className="font-bold flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5 text-yellow-400" /> AIナレーションスタジオ
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              Step 1: テーマ入力
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => onPromptChange(e.target.value)}
                placeholder="例: 京都旅行の動画"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              />
              <button
                onClick={onGenerateScript}
                disabled={isAiLoading || !aiPrompt}
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1 disabled:opacity-50"
              >
                {isAiLoading ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}{' '}
                作成
              </button>
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                Step 2: 原稿編集
              </label>
              <textarea
                value={aiScript}
                onChange={(e) => onScriptChange(e.target.value)}
                className="w-full h-24 bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
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
          </div>
          <button
            onClick={onGenerateSpeech}
            disabled={isAiLoading || !aiScript}
            className="w-full bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all"
          >
            {isAiLoading ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : (
              <Mic className="w-5 h-5" />
            )}{' '}
            音声を生成して追加
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiModal;
