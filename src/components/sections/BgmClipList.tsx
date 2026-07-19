/**
 * @file BgmClipList.tsx
 * @author Turtle Village
 * @description 複数 BGM クリップの一覧・編集 UI（standard フレーバー限定）。
 * 配置・トリム・音量・フェードの操作感はナレーションクリップと同等に揃える。
 * ストア操作は useAudioStore を直接使用し、編集前に onBeforeEdit（プレビュー一時停止）を呼ぶ。
 */
import React, { useCallback, useState } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Music,
  MapPin,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import type { BgmClip } from '../../types';
import { useAudioStore } from '../../stores/audioStore';
import { SwipeProtectedSlider } from '../SwipeProtectedSlider';

interface BgmClipListProps {
  clips: BgmClip[];
  isLocked: boolean;
  totalDuration: number;
  currentTime: number;
  formatTime: (seconds: number) => string;
  /** 編集操作の直前に呼ぶ（プレビューの明示一時停止など） */
  onBeforeEdit: (reason: string) => void;
}

const BgmClipList: React.FC<BgmClipListProps> = ({
  clips,
  isLocked,
  totalDuration,
  currentTime,
  formatTime,
  onBeforeEdit,
}) => {
  const [openTrimMap, setOpenTrimMap] = useState<Record<string, boolean>>({});
  const [openFadeMap, setOpenFadeMap] = useState<Record<string, boolean>>({});

  const duplicateBgmClip = useAudioStore((s) => s.duplicateBgmClip);
  const updateBgmClipStartTime = useAudioStore((s) => s.updateBgmClipStartTime);
  const updateBgmClipVolume = useAudioStore((s) => s.updateBgmClipVolume);
  const toggleBgmClipMute = useAudioStore((s) => s.toggleBgmClipMute);
  const updateBgmClipTrim = useAudioStore((s) => s.updateBgmClipTrim);
  const toggleBgmClipFadeIn = useAudioStore((s) => s.toggleBgmClipFadeIn);
  const toggleBgmClipFadeOut = useAudioStore((s) => s.toggleBgmClipFadeOut);
  const updateBgmClipFadeInDuration = useAudioStore((s) => s.updateBgmClipFadeInDuration);
  const updateBgmClipFadeOutDuration = useAudioStore((s) => s.updateBgmClipFadeOutDuration);
  const moveBgmClip = useAudioStore((s) => s.moveBgmClip);
  const removeBgmClip = useAudioStore((s) => s.removeBgmClip);

  const withEdit = useCallback(
    <T extends unknown[]>(reason: string, fn: (...args: T) => void) =>
      (...args: T) => {
        onBeforeEdit(reason);
        fn(...args);
      },
    [onBeforeEdit],
  );

  if (clips.length === 0) {
    return (
      <div className="text-center py-6 mx-3 mb-3 text-gray-600 text-xs md:text-sm border-2 border-dashed border-gray-800 rounded">
        BGM はまだありません。「追加」で複数の曲を入れられます。
        <br />
        追加した曲は動画の長さに合わせて自動調整されます。
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 max-h-96 lg:max-h-128 overflow-y-auto custom-scrollbar">
      {clips.map((clip, index) => {
        const trimStart = Number.isFinite(clip.trimStart) ? Math.max(0, clip.trimStart) : 0;
        const trimEnd = Number.isFinite(clip.trimEnd)
          ? Math.max(trimStart, Math.min(clip.duration, clip.trimEnd))
          : clip.duration;
        const playableDuration = Math.max(0.05, trimEnd - trimStart);
        const isTrimOpen = openTrimMap[clip.id] ?? false;
        const isFadeOpen = openFadeMap[clip.id] ?? false;
        const fadeIn = clip.fadeIn ?? false;
        const fadeOut = clip.fadeOut ?? false;
        const fadeInDuration = clip.fadeInDuration ?? 2.0;
        const fadeOutDuration = clip.fadeOutDuration ?? 2.0;

        return (
          <div key={clip.id} className="p-3 bg-purple-900/10 border border-purple-500/20 rounded-xl space-y-3">
            {/* ヘッダー行 */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-gray-500 font-mono shrink-0">[{index + 1}]</span>
                <Music className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="text-xs md:text-sm text-purple-100 truncate" title={clip.file.name}>
                  {clip.file.name}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={withEdit('move-bgm-clip', () => moveBgmClip(clip.id, 'up'))}
                  disabled={index === 0 || isLocked}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 text-gray-300 disabled:opacity-30 text-[10px] transition"
                  title="上へ移動"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={withEdit('move-bgm-clip', () => moveBgmClip(clip.id, 'down'))}
                  disabled={index === clips.length - 1 || isLocked}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 text-gray-300 disabled:opacity-30 text-[10px] transition"
                  title="下へ移動"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={withEdit('duplicate-bgm-clip', () => duplicateBgmClip(clip.id))}
                  disabled={isLocked || !(clip.file instanceof File)}
                  className="px-2 py-1 bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 rounded border border-blue-800/50 disabled:opacity-30 text-[10px] transition"
                  title="このBGMをコピー（トリム後の末尾に続けて配置）"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={withEdit('remove-bgm-clip', () => removeBgmClip(clip.id))}
                  disabled={isLocked}
                  className="px-2 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded border border-red-800/50 disabled:opacity-30 text-[10px] transition"
                  title="削除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* タイムライン上の再生区間（この曲がどこからどこまで鳴るか） */}
            <div className="flex items-center gap-1.5 text-[10px] md:text-xs bg-purple-900/20 border border-purple-500/20 rounded px-2 py-1">
              <span className="text-purple-300 shrink-0">♪ 再生区間:</span>
              <span className="text-purple-100 font-mono">
                {formatTime(clip.startTime)} 〜 {formatTime(clip.startTime + playableDuration)}
              </span>
              {totalDuration > 0 && clip.startTime + playableDuration > totalDuration + 0.05 && (
                <span className="text-amber-400 ml-auto shrink-0" title="動画の末尾を超えた部分は書き出されません">
                  ⚠ 動画末尾超え
                </span>
              )}
            </div>

            {/* 開始位置 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] md:text-xs text-gray-400">
                <span>開始位置: {formatTime(clip.startTime)}</span>
                <span>長さ: {formatTime(playableDuration)}</span>
              </div>
              <div className="flex items-center gap-2">
                <SwipeProtectedSlider
                  min={0}
                  max={Math.max(0, totalDuration)}
                  step={0.1}
                  value={clip.startTime}
                  onChange={withEdit('update-bgm-clip-start', (val: number) => updateBgmClipStartTime(clip.id, val))}
                  disabled={isLocked}
                  className="flex-1 accent-purple-500 h-1 bg-gray-700 rounded appearance-none disabled:opacity-50"
                />
                <button
                  onClick={withEdit('set-bgm-clip-start-current', () => updateBgmClipStartTime(clip.id, currentTime))}
                  disabled={isLocked}
                  className="p-1 text-gray-400 hover:text-purple-300 disabled:opacity-30"
                  title={`現在位置(${formatTime(currentTime)})を開始位置に設定`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  min="0"
                  max={Math.max(0, totalDuration)}
                  step="0.1"
                  value={Math.round(clip.startTime * 10) / 10}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (Number.isNaN(val)) return;
                    onBeforeEdit('update-bgm-clip-start');
                    updateBgmClipStartTime(clip.id, val);
                  }}
                  disabled={isLocked}
                  className="w-16 md:w-20 bg-gray-700 border border-gray-600 rounded px-1 text-[10px] md:text-xs text-right focus:outline-none focus:border-purple-500 disabled:opacity-50"
                />
                <span className="text-[10px] md:text-xs text-gray-500">秒</span>
              </div>
            </div>

            {/* トリミング */}
            <button
              onClick={() => setOpenTrimMap((prev) => ({ ...prev, [clip.id]: !(prev[clip.id] ?? false) }))}
              disabled={isLocked}
              className="text-xs md:text-sm flex items-center gap-1 text-gray-400 hover:text-white disabled:opacity-50"
            >
              {isTrimOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span>トリミング設定</span>
            </button>
            {isTrimOpen && (
              <div className="px-2 mb-1 space-y-2 border-t border-gray-700/50 pt-2 mt-1 bg-gray-900/30 rounded p-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] md:text-xs text-gray-400">
                    <span>トリミング開始: {formatTime(trimStart)}</span>
                    <span>元音声: {formatTime(clip.duration)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <SwipeProtectedSlider
                      min={0}
                      max={Math.max(0, clip.duration)}
                      step={0.1}
                      value={trimStart}
                      onChange={withEdit('update-bgm-clip-trim', (val: number) => updateBgmClipTrim(clip.id, 'start', val))}
                      disabled={isLocked}
                      className="flex-1 accent-purple-500 h-1 bg-gray-700 rounded appearance-none disabled:opacity-50"
                    />
                    <input
                      type="number"
                      min="0"
                      max={Math.max(0, trimEnd - 0.05)}
                      step="0.1"
                      value={Math.round(trimStart * 10) / 10}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (Number.isNaN(val)) return;
                        onBeforeEdit('update-bgm-clip-trim');
                        updateBgmClipTrim(clip.id, 'start', val);
                      }}
                      disabled={isLocked}
                      className="w-16 md:w-20 bg-gray-700 border border-gray-600 rounded px-1 text-[10px] md:text-xs text-right focus:outline-none focus:border-purple-500 disabled:opacity-50"
                    />
                    <span className="text-[10px] md:text-xs text-gray-500">秒</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] md:text-xs text-gray-400">
                    <span>トリミング終了: {formatTime(trimEnd)}</span>
                    <span>範囲: {formatTime(playableDuration)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <SwipeProtectedSlider
                      min={0}
                      max={Math.max(0, clip.duration)}
                      step={0.1}
                      value={trimEnd}
                      onChange={withEdit('update-bgm-clip-trim', (val: number) => updateBgmClipTrim(clip.id, 'end', val))}
                      disabled={isLocked}
                      className="flex-1 accent-purple-500 h-1 bg-gray-700 rounded appearance-none disabled:opacity-50"
                    />
                    <input
                      type="number"
                      min={Math.min(Math.max(0, trimStart + 0.05), Math.max(0, clip.duration))}
                      max={Math.max(0, clip.duration)}
                      step="0.1"
                      value={Math.round(trimEnd * 10) / 10}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (Number.isNaN(val)) return;
                        onBeforeEdit('update-bgm-clip-trim');
                        updateBgmClipTrim(clip.id, 'end', val);
                      }}
                      disabled={isLocked}
                      className="w-16 md:w-20 bg-gray-700 border border-gray-600 rounded px-1 text-[10px] md:text-xs text-right focus:outline-none focus:border-purple-500 disabled:opacity-50"
                    />
                    <span className="text-[10px] md:text-xs text-gray-500">秒</span>
                  </div>
                </div>
              </div>
            )}

            {/* 音量 */}
            <div className="bg-gray-800/50 p-2 rounded-lg flex items-center gap-2">
              <button
                onClick={withEdit('toggle-bgm-clip-mute', () => toggleBgmClipMute(clip.id))}
                disabled={isLocked}
                className={`p-1 rounded transition ${clip.isMuted ? 'bg-red-500/20 text-red-300' : 'text-gray-400 hover:text-white'} disabled:opacity-50`}
                title={clip.isMuted ? 'ミュート解除' : 'ミュート'}
              >
                {clip.isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
              <SwipeProtectedSlider
                min={0}
                max={2.5}
                step={0.05}
                value={clip.volume}
                onChange={withEdit('update-bgm-clip-volume', (val: number) => updateBgmClipVolume(clip.id, val))}
                disabled={isLocked || clip.isMuted}
                className={`flex-1 accent-purple-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${(isLocked || clip.isMuted) ? '' : 'cursor-pointer'}`}
              />
              <span className="text-[10px] md:text-xs text-gray-400 w-10 text-right">{Math.round(clip.volume * 100)}%</span>
              <button
                onClick={withEdit('update-bgm-clip-volume', () => updateBgmClipVolume(clip.id, 1))}
                disabled={isLocked}
                className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition disabled:opacity-50"
                title="リセット"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            {/* フェード */}
            <button
              onClick={() => setOpenFadeMap((prev) => ({ ...prev, [clip.id]: !(prev[clip.id] ?? false) }))}
              disabled={isLocked}
              className="text-xs md:text-sm flex items-center gap-1 text-gray-400 hover:text-white disabled:opacity-50"
            >
              {isFadeOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span>フェード設定</span>
            </button>
            {isFadeOpen && (
              <div className="flex flex-col gap-2 text-[10px] md:text-xs border-t border-gray-700/50 pt-2 px-2 bg-gray-900/30 rounded p-2">
                <div className="flex items-center gap-2">
                  <label className={`flex items-center gap-1 w-24 justify-start ${isLocked ? 'opacity-50' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={fadeIn}
                      onChange={(e) => {
                        onBeforeEdit('toggle-bgm-clip-fade-in');
                        toggleBgmClipFadeIn(clip.id, e.target.checked);
                      }}
                      disabled={isLocked}
                      className="accent-purple-500 rounded cursor-pointer disabled:opacity-50 disabled:cursor-default"
                    />
                    <span className="whitespace-nowrap">フェードイン</span>
                  </label>
                  <SwipeProtectedSlider
                    min={0}
                    max={2}
                    step={1}
                    value={fadeInDuration === 0.5 ? 0 : fadeInDuration === 1.0 ? 1 : 2}
                    onChange={withEdit('update-bgm-clip-fade-in-duration', (val: number) => {
                      const steps = [0.5, 1.0, 2.0];
                      updateBgmClipFadeInDuration(clip.id, steps[val]);
                    })}
                    disabled={isLocked || !fadeIn}
                    className={`flex-1 accent-purple-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 disabled:cursor-default disabled:bg-gray-800 disabled:accent-gray-700 ${isLocked || !fadeIn ? '' : 'cursor-pointer'}`}
                  />
                  <span className={`w-8 text-right whitespace-nowrap ${isLocked || !fadeIn ? 'text-gray-600' : 'text-gray-400'}`}>{fadeInDuration}秒</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className={`flex items-center gap-1 w-24 justify-start ${isLocked ? 'opacity-50' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={fadeOut}
                      onChange={(e) => {
                        onBeforeEdit('toggle-bgm-clip-fade-out');
                        toggleBgmClipFadeOut(clip.id, e.target.checked);
                      }}
                      disabled={isLocked}
                      className="accent-purple-500 rounded cursor-pointer disabled:opacity-50 disabled:cursor-default"
                    />
                    <span className="whitespace-nowrap">フェードアウト</span>
                  </label>
                  <SwipeProtectedSlider
                    min={0}
                    max={2}
                    step={1}
                    value={fadeOutDuration === 0.5 ? 0 : fadeOutDuration === 1.0 ? 1 : 2}
                    onChange={withEdit('update-bgm-clip-fade-out-duration', (val: number) => {
                      const steps = [0.5, 1.0, 2.0];
                      updateBgmClipFadeOutDuration(clip.id, steps[val]);
                    })}
                    disabled={isLocked || !fadeOut}
                    className={`flex-1 accent-purple-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 disabled:cursor-default disabled:bg-gray-800 disabled:accent-gray-700 ${isLocked || !fadeOut ? '' : 'cursor-pointer'}`}
                  />
                  <span className={`w-8 text-right whitespace-nowrap ${isLocked || !fadeOut ? 'text-gray-600' : 'text-gray-400'}`}>{fadeOutDuration}秒</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(BgmClipList);
