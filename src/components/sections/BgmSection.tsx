import React, { useState, useCallback } from 'react';
import { Upload, Lock, Unlock, Music, Volume2, Timer, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import type { AudioTrack } from '../../types';
import { SwipeProtectedSlider } from '../SwipeProtectedSlider';

interface BgmSectionProps {
  bgm: AudioTrack | null;
  isBgmLocked: boolean;
  totalDuration: number;
  onToggleBgmLock: () => void;
  onBgmUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveBgm: () => void;
  onUpdateStartPoint: (value: string) => void;
  onUpdateDelay: (value: string) => void;
  onUpdateVolume: (value: string) => void;
  onToggleFadeIn: (checked: boolean) => void;
  onToggleFadeOut: (checked: boolean) => void;
  onUpdateFadeInDuration: (duration: number) => void;
  onUpdateFadeOutDuration: (duration: number) => void;
  formatTime: (seconds: number) => string;
}

/**
 * BGMセクションコンポーネント
 */
const BgmSection: React.FC<BgmSectionProps> = ({
  bgm,
  isBgmLocked,
  totalDuration,
  onToggleBgmLock,
  onBgmUpload,
  onRemoveBgm,
  onUpdateStartPoint,
  onUpdateDelay,
  onUpdateVolume,
  onToggleFadeIn,
  onToggleFadeOut,
  onUpdateFadeInDuration,
  onUpdateFadeOutDuration,
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
        <h2 className="font-bold flex items-center gap-2 text-purple-400">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="w-6 h-6 rounded-full bg-purple-500/10 flex items-center justify-center text-xs">
            2
          </span>{' '}
          BGM
          {bgm && <span className="text-[10px] text-purple-300 font-normal ml-2 truncate max-w-[100px]">✓ {bgm.file.name}</span>}
        </h2>
        <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onToggleBgmLock}
            className={`p-1.5 rounded transition ${isBgmLocked ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
          >
            {isBgmLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
          {!bgm ? (
            <label
              className={`cursor-pointer bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${isBgmLocked ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Upload className="w-3 h-3" /> 選択
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={onBgmUpload}
                disabled={isBgmLocked}
              />
            </label>
          ) : (
            <button
              onClick={onRemoveBgm}
              disabled={isBgmLocked}
              className="text-red-400 hover:text-red-300 text-xs px-2 disabled:opacity-50"
            >
              削除
            </button>
          )}
        </div>
      </div>
      {isOpen && bgm && (
        <div className="p-4 bg-purple-900/10 border border-purple-500/20 m-3 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-purple-200 text-xs font-medium truncate">
            <Music className="w-3 h-3 text-purple-400 shrink-0" /> {bgm.file.name}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>開始位置 (頭出し): {formatTime(bgm.startPoint)}</span>
              <span>長さ: {formatTime(bgm.duration)}</span>
            </div>
            <div className="flex items-center gap-2">
              <SwipeProtectedSlider
                min={0}
                max={bgm.duration}
                step={0.1}
                value={bgm.startPoint}
                onChange={handleStartPointChange}
                disabled={isBgmLocked}
                className="flex-1 accent-purple-500 h-1 bg-gray-700 rounded appearance-none cursor-pointer disabled:opacity-50"
              />
              <input
                type="number"
                min="0"
                max={bgm.duration}
                step="0.1"
                value={bgm.startPoint}
                onChange={(e) => onUpdateStartPoint(e.target.value)}
                disabled={isBgmLocked}
                className="w-16 bg-gray-700 border border-gray-600 rounded px-1 text-[10px] text-right focus:outline-none focus:border-purple-500 disabled:opacity-50"
              />
              <span className="text-[10px] text-gray-500">秒</span>
            </div>
          </div>
          <div className="bg-purple-900/30 p-2 rounded border border-purple-500/30 space-y-1">
            <div className="flex items-center gap-2 text-[10px] text-purple-200">
              <Timer className="w-3 h-3" />
              <span>開始タイミング (遅延): {formatTime(bgm.delay || 0)}</span>
            </div>
            <div className="flex items-center gap-2">
              <SwipeProtectedSlider
                min={0}
                max={totalDuration}
                step={0.5}
                value={bgm.delay || 0}
                onChange={handleDelayChange}
                disabled={isBgmLocked}
                className="flex-1 accent-purple-400 h-1 bg-gray-700 rounded appearance-none cursor-pointer disabled:opacity-50"
              />
              <input
                type="number"
                min="0"
                max={totalDuration}
                step="0.5"
                value={bgm.delay || 0}
                onChange={(e) => onUpdateDelay(e.target.value)}
                disabled={isBgmLocked}
                className="w-16 bg-gray-700 border border-gray-600 rounded px-1 text-[10px] text-right focus:outline-none focus:border-purple-400 disabled:opacity-50"
              />
              <span className="text-[10px] text-gray-500">秒</span>
            </div>
          </div>
          {/* 音量コントロール */}
          <div className="bg-gray-800/50 p-2 rounded-lg flex items-center gap-2">
            <Volume2 className="w-3 h-3 text-gray-400" />
            <SwipeProtectedSlider
              min={0}
              max={2.0}
              step={0.05}
              value={bgm.volume}
              onChange={handleVolumeChange}
              disabled={isBgmLocked}
              className={`flex-1 accent-purple-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${isBgmLocked ? '' : 'cursor-pointer'}`}
            />
            <span className="text-[10px] text-gray-400 w-10 text-right">{Math.round(bgm.volume * 100)}%</span>
            <button
              onClick={() => onUpdateVolume('1')}
              disabled={isBgmLocked}
              className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition disabled:opacity-50"
              title="リセット"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {/* フェード設定 - レイアウト改善 */}
          <div className="flex flex-col gap-2 mt-2 text-[10px]">
            {/* フェードイン */}
            <div className="flex items-center gap-2">
              <label
                className={`flex items-center gap-1 w-20 justify-start ${isBgmLocked ? 'opacity-50' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={bgm.fadeIn}
                  onChange={(e) => onToggleFadeIn(e.target.checked)}
                  disabled={isBgmLocked}
                  className="accent-purple-500 rounded cursor-pointer disabled:opacity-50 disabled:cursor-default"
                />
                <span className="whitespace-nowrap">フェードイン</span>
              </label>
              <input
                type="range"
                min={0}
                max={2}
                step={1}
                value={bgm.fadeInDuration === 0.5 ? 0 : bgm.fadeInDuration === 1.0 ? 1 : 2}
                onChange={(e) => {
                  const steps = [0.5, 1.0, 2.0];
                  onUpdateFadeInDuration(steps[parseInt(e.target.value)]);
                }}
                disabled={isBgmLocked || !bgm.fadeIn}
                className={`flex-1 accent-purple-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-30 disabled:cursor-default ${isBgmLocked || !bgm.fadeIn ? '' : 'cursor-pointer'}`}
              />
              <span className="text-gray-400 w-8 text-right whitespace-nowrap">{bgm.fadeInDuration}秒</span>
            </div>

            {/* フェードアウト */}
            <div className="flex items-center gap-2">
              <label
                className={`flex items-center gap-1 w-20 justify-start ${isBgmLocked ? 'opacity-50' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={bgm.fadeOut}
                  onChange={(e) => onToggleFadeOut(e.target.checked)}
                  disabled={isBgmLocked}
                  className="accent-purple-500 rounded cursor-pointer disabled:opacity-50 disabled:cursor-default"
                />
                <span className="whitespace-nowrap">フェードアウト</span>
              </label>
              <input
                type="range"
                min={0}
                max={2}
                step={1}
                value={bgm.fadeOutDuration === 0.5 ? 0 : bgm.fadeOutDuration === 1.0 ? 1 : 2}
                onChange={(e) => {
                  const steps = [0.5, 1.0, 2.0];
                  onUpdateFadeOutDuration(steps[parseInt(e.target.value)]);
                }}
                disabled={isBgmLocked || !bgm.fadeOut}
                className={`flex-1 accent-purple-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-30 disabled:cursor-default ${isBgmLocked || !bgm.fadeOut ? '' : 'cursor-pointer'}`}
              />
              <span className="text-gray-400 w-8 text-right whitespace-nowrap">{bgm.fadeOutDuration}秒</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default React.memo(BgmSection);
