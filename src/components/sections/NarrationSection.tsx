import React, { useState, useCallback } from 'react';
import { Upload, Lock, Unlock, Mic, Sparkles, Save, Volume2, Timer, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import type { AudioTrack } from '../../types';
import { SwipeProtectedSlider } from '../SwipeProtectedSlider';

interface NarrationSectionProps {
  narration: AudioTrack | null;
  isNarrationLocked: boolean;
  totalDuration: number;
  onToggleNarrationLock: () => void;
  onShowAiModal: () => void;
  onNarrationUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveNarration: () => void;
  onUpdateStartPoint: (value: string) => void;
  onUpdateDelay: (value: string) => void;
  onUpdateVolume: (value: string) => void;
  onToggleFadeIn: (checked: boolean) => void;
  onToggleFadeOut: (checked: boolean) => void;
  formatTime: (seconds: number) => string;
}

/**
 * ナレーションセクションコンポーネント
 */
const NarrationSection: React.FC<NarrationSectionProps> = ({
  narration,
  isNarrationLocked,
  totalDuration,
  onToggleNarrationLock,
  onShowAiModal,
  onNarrationUpload,
  onRemoveNarration,
  onUpdateStartPoint,
  onUpdateDelay,
  onUpdateVolume,
  onToggleFadeIn,
  onToggleFadeOut,
  formatTime,
}) => {
  const [isOpen, setIsOpen] = useState(true);

  // スワイプ保護用ハンドラ
  const handleStartPointChange = useCallback(
    (val: number) => onUpdateStartPoint(String(val)),
    [onUpdateStartPoint]
  );
  const handleDelayChange = useCallback(
    (val: number) => onUpdateDelay(String(val)),
    [onUpdateDelay]
  );
  const handleVolumeChange = useCallback(
    (val: number) => onUpdateVolume(String(val)),
    [onUpdateVolume]
  );

  return (
    <section className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden shadow-xl">
      <div
        className="p-4 bg-gray-850 border-b border-gray-800 flex justify-between items-center cursor-pointer hover:bg-gray-800/50 transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h2 className="font-bold flex items-center gap-2 text-indigo-400">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center text-xs">
            3
          </span>{' '}
          ナレーション
          {narration && <span className="text-[10px] text-indigo-300 font-normal ml-2 truncate max-w-[100px]">✓ {narration.file.name}</span>}
        </h2>
        <div className="flex gap-2 shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onToggleNarrationLock}
            className={`p-1.5 rounded transition ${isNarrationLocked ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
          >
            {isNarrationLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
          <button
            onClick={onShowAiModal}
            disabled={isNarrationLocked}
            className={`bg-linear-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-lg ${isNarrationLocked ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <Sparkles className="w-3 h-3" /> AI
          </button>
          {!narration ? (
            <label
              className={`cursor-pointer bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${isNarrationLocked ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Upload className="w-3 h-3" /> 選択
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={onNarrationUpload}
                disabled={isNarrationLocked}
              />
            </label>
          ) : (
            <button
              onClick={onRemoveNarration}
              disabled={isNarrationLocked}
              className="text-red-400 hover:text-red-300 text-xs px-2 disabled:opacity-50"
            >
              削除
            </button>
          )}
        </div>
      </div>
      {isOpen && narration && (
        <div className="p-4 bg-indigo-900/10 border border-indigo-500/20 m-3 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-200 text-xs font-medium truncate">
              <Mic className="w-3 h-3 text-indigo-400 shrink-0" /> {narration.file.name}
            </div>
            {narration.blobUrl && (
              <a
                href={narration.blobUrl}
                download={narration.file.name}
                className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded text-[10px] font-bold transition"
              >
                <Save className="w-3 h-3" /> 保存
              </a>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>開始位置 (頭出し): {formatTime(narration.startPoint)}</span>
              <span>長さ: {formatTime(narration.duration)}</span>
            </div>
            <div className="flex items-center gap-2">
              <SwipeProtectedSlider
                min={0}
                max={narration.duration}
                step={0.1}
                value={narration.startPoint}
                onChange={handleStartPointChange}
                disabled={isNarrationLocked}
                className="flex-1 accent-indigo-500 h-1 bg-gray-700 rounded appearance-none cursor-pointer disabled:opacity-50"
              />
              <input
                type="number"
                min="0"
                max={narration.duration}
                step="0.1"
                value={narration.startPoint}
                onChange={(e) => onUpdateStartPoint(e.target.value)}
                disabled={isNarrationLocked}
                className="w-16 bg-gray-700 border border-gray-600 rounded px-1 text-[10px] text-right focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              />
              <span className="text-[10px] text-gray-500">秒</span>
            </div>
          </div>
          <div className="bg-indigo-900/30 p-2 rounded border border-indigo-500/30 space-y-1">
            <div className="flex items-center gap-2 text-[10px] text-indigo-200">
              <Timer className="w-3 h-3" />
              <span>開始タイミング (遅延): {formatTime(narration.delay || 0)}</span>
            </div>
            <div className="flex items-center gap-2">
              <SwipeProtectedSlider
                min={0}
                max={totalDuration}
                step={0.1}
                value={narration.delay || 0}
                onChange={handleDelayChange}
                disabled={isNarrationLocked}
                className="flex-1 accent-indigo-400 h-1 bg-gray-700 rounded appearance-none cursor-pointer disabled:opacity-50"
              />
              <input
                type="number"
                min="0"
                max={totalDuration}
                step="0.1"
                value={narration.delay || 0}
                onChange={(e) => onUpdateDelay(e.target.value)}
                disabled={isNarrationLocked}
                className="w-16 bg-gray-700 border border-gray-600 rounded px-1 text-[10px] text-right focus:outline-none focus:border-indigo-400 disabled:opacity-50"
              />
              <span className="text-[10px] text-gray-500">秒</span>
            </div>
          </div>
          <div className="bg-gray-800/50 p-2 rounded-lg space-y-1">
            <div className="flex items-center gap-2">
              <Volume2 className="w-3 h-3 text-gray-400" />
              <SwipeProtectedSlider
                min={0}
                max={2.5}
                step={0.1}
                value={narration.volume}
                onChange={handleVolumeChange}
                disabled={isNarrationLocked}
                className="flex-1 accent-indigo-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
              />
              <span className="text-[10px] text-gray-400 w-10 text-right">{Math.round(narration.volume * 100)}%</span>
              <button
                onClick={() => onUpdateVolume('1')}
                disabled={isNarrationLocked}
                className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition disabled:opacity-50"
                title="標準音量に戻す"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
            {/* 標準位置ラベル */}
            <div className="relative h-3 ml-5 mr-20 text-[8px]">
              <span className="absolute left-[40%] -translate-x-1/2 text-gray-500">標準</span>
            </div>
          </div>
          <div className="flex gap-3 text-[10px]">
            <label
              className={`flex items-center gap-1 cursor-pointer ${isNarrationLocked ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <input
                type="checkbox"
                checked={narration.fadeIn}
                onChange={(e) => onToggleFadeIn(e.target.checked)}
                disabled={isNarrationLocked}
                className="accent-indigo-500 rounded"
              />{' '}
              フェードイン
            </label>
            <label
              className={`flex items-center gap-1 cursor-pointer ${isNarrationLocked ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <input
                type="checkbox"
                checked={narration.fadeOut}
                onChange={(e) => onToggleFadeOut(e.target.checked)}
                disabled={isNarrationLocked}
                className="accent-indigo-500 rounded"
              />{' '}
              フェードアウト
            </label>
          </div>
        </div>
      )}
    </section>
  );
};

export default React.memo(NarrationSection);
