/**
 * @file BgmClipList.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
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
  RefreshCw,
} from 'lucide-react';
import type { BgmClip } from '../../types';
import { resolveBgmClipsEffectivePlayback, useAudioStore } from '../../stores/audioStore';
import { formatNormalizeAdjustment } from '../../utils';
import { SwipeProtectedSlider } from '../SwipeProtectedSlider';
import NumericSliderField from '../common/NumericSliderField';
import SettingsAccordionHeader from '../common/SettingsAccordionHeader';

interface BgmClipListProps {
  audioSettingsPanel?: React.ReactNode;
  bulkVolumeEnabled?: boolean;
  clips: BgmClip[];
  isLocked: boolean;
  totalDuration: number;
  currentTime: number;
  formatTime: (seconds: number) => string;
  /** 編集操作の直前に呼ぶ（プレビューの明示一時停止など） */
  onBeforeEdit: (reason: string) => void;
  /**
   * 連続値スライダー（音量・開始位置・トリム・フェード長）の編集直前に呼ぶ。
   * ドラッグ中に毎目盛発火するため、プレビューを一時停止せず再生したまま反映する。
   */
  onBeforeContinuousEdit: (reason: string) => void;
}

const BgmClipList: React.FC<BgmClipListProps> = ({
  audioSettingsPanel,
  bulkVolumeEnabled = false,
  clips,
  isLocked,
  totalDuration,
  currentTime,
  formatTime,
  onBeforeEdit,
  onBeforeContinuousEdit,
}) => {
  const [openTrimMap, setOpenTrimMap] = useState<Record<string, boolean>>({});
  const [openFadeMap, setOpenFadeMap] = useState<Record<string, boolean>>({});

  const duplicateBgmClip = useAudioStore((s) => s.duplicateBgmClip);
  const updateBgmClipStartTime = useAudioStore((s) => s.updateBgmClipStartTime);
  const updateBgmClipVolume = useAudioStore((s) => s.updateBgmClipVolume);
  const toggleBgmClipMute = useAudioStore((s) => s.toggleBgmClipMute);
  const updateBgmClipTrim = useAudioStore((s) => s.updateBgmClipTrim);
  const setBgmClipEndTime = useAudioStore((s) => s.setBgmClipEndTime);
  const fitBgmClipToTimelineEnd = useAudioStore((s) => s.fitBgmClipToTimelineEnd);
  const toggleBgmClipFadeIn = useAudioStore((s) => s.toggleBgmClipFadeIn);
  const toggleBgmClipFadeOut = useAudioStore((s) => s.toggleBgmClipFadeOut);
  const updateBgmClipFadeInDuration = useAudioStore((s) => s.updateBgmClipFadeInDuration);
  const updateBgmClipFadeOutDuration = useAudioStore((s) => s.updateBgmClipFadeOutDuration);
  const moveBgmClip = useAudioStore((s) => s.moveBgmClip);
  const removeBgmClip = useAudioStore((s) => s.removeBgmClip);
  const bgmAutoAdjustToTimeline = useAudioStore((s) => s.bgmAutoAdjustToTimeline);
  const setBgmAutoAdjustToTimeline = useAudioStore((s) => s.setBgmAutoAdjustToTimeline);

  const withEdit = useCallback(
    <T extends unknown[]>(reason: string, fn: (...args: T) => void) =>
      (...args: T) => {
        onBeforeEdit(reason);
        fn(...args);
      },
    [onBeforeEdit],
  );

  /**
   * 連続値スライダー用。プレビューを止めずに反映するので、再生しながら調整できる。
   * ドラッグ中の毎目盛で pause + cancelAnimationFrame が走るとカクつくため withEdit と分ける。
   */
  const withContinuousEdit = useCallback(
    <T extends unknown[]>(reason: string, fn: (...args: T) => void) =>
      (...args: T) => {
        onBeforeContinuousEdit(reason);
        fn(...args);
      },
    [onBeforeContinuousEdit],
  );

  if (clips.length === 0) {
    return (
      <div className="p-3 space-y-3 min-w-0">
        {audioSettingsPanel}
        <div className="text-center py-6 text-gray-600 text-xs md:text-sm border-2 border-dashed border-gray-800 rounded">
          BGM はまだありません。「追加」で複数の曲を入れられます。
          <br />
          追加した曲は動画の長さに合わせて自動調整されます。
        </div>
      </div>
    );
  }

  // 自動調整 ON: 末尾 BGM を D へ合わせる / OFF: 設定どおり
  const effectiveById = resolveBgmClipsEffectivePlayback(clips, totalDuration, {
    autoAdjust: bgmAutoAdjustToTimeline,
  });

  return (
    <div className="p-3 space-y-3 max-h-96 lg:max-h-128 overflow-y-auto custom-scrollbar min-w-0">
      {audioSettingsPanel}
      <label
        className={`inline-flex items-center gap-2 text-[10px] md:text-xs select-none whitespace-nowrap ${
          isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer text-gray-300'
        }`}
        title={
          bgmAutoAdjustToTimeline
            ? '動画尺に合わせて末尾のBGMを自動で合わせます'
            : '設定した区間のまま再生します'
        }
      >
        <input
          type="checkbox"
          className="accent-purple-500 w-3.5 h-3.5 shrink-0"
          checked={bgmAutoAdjustToTimeline}
          disabled={isLocked}
          onChange={(e) => {
            onBeforeEdit('toggle-bgm-auto-adjust');
            setBgmAutoAdjustToTimeline(e.target.checked);
          }}
        />
        <span>動画尺に合わせて自動調整</span>
        <span
          className={`px-1.5 py-0.5 rounded border text-[9px] shrink-0 ${
            bgmAutoAdjustToTimeline
              ? 'border-emerald-600/50 bg-emerald-900/30 text-emerald-300'
              : 'border-gray-600 bg-gray-800 text-gray-400'
          }`}
        >
          {bgmAutoAdjustToTimeline ? 'ON' : 'OFF'}
        </span>
      </label>
      {clips.map((clip, index) => {
        const trimStart = Number.isFinite(clip.trimStart) ? Math.max(0, clip.trimStart) : 0;
        const trimEnd = Number.isFinite(clip.trimEnd)
          ? Math.max(trimStart, Math.min(clip.duration, clip.trimEnd))
          : clip.duration;
        const playableDuration = Math.max(0.05, trimEnd - trimStart);
        const timelineEnd = clip.startTime + playableDuration;
        const effective = effectiveById.get(clip.id)!;
        const canSetCurrentAsEnd = currentTime >= clip.startTime + 0.05;
        // 手動固定は「設定値」を書き換える操作。設定が既に末尾なら不要（有効区間の自動合わせとは別）。
        const isSettingsFittedToTimelineEnd = totalDuration > 0
          && Math.abs(timelineEnd - totalDuration) < 0.05;
        const isTrimOpen = openTrimMap[clip.id] ?? false;
        const isFadeOpen = openFadeMap[clip.id] ?? false;
        const fadeIn = clip.fadeIn ?? false;
        const fadeOut = clip.fadeOut ?? false;
        const fadeInDuration = clip.fadeInDuration ?? 2.0;
        const fadeOutDuration = clip.fadeOutDuration ?? 2.0;

        return (
          <div
            key={clip.id}
            className={`p-3 bg-purple-900/10 border border-purple-500/20 rounded-xl space-y-3 min-w-0 ${
              effective.isDisabled ? 'opacity-55' : ''
            }`}
          >
            {/* ヘッダー行 */}
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                <span className="text-xs text-gray-500 font-mono shrink-0">[{index + 1}]</span>
                <Music className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="text-xs md:text-sm text-purple-100 truncate min-w-0 flex-1" title={clip.file.name}>
                  {clip.file.name}
                </span>
                {effective.isDisabled && (
                  <span
                    className="shrink-0 text-[9px] md:text-[10px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-600 text-gray-400"
                    title="動画尺の外側のため再生されません"
                  >
                    無効
                  </span>
                )}
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

            {/* タイムライン上の再生区間 */}
            <div className="flex flex-col gap-1 text-[10px] md:text-xs bg-purple-900/20 border border-purple-500/20 rounded px-2 py-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-purple-300 shrink-0">♪ 再生区間:</span>
                {effective.isDisabled ? (
                  <span className="text-gray-400 font-mono">
                    設定 {formatTime(clip.startTime)} 〜 {formatTime(timelineEnd)}
                  </span>
                ) : effective.isClampedByTimeline || effective.isExtendedByTimeline ? (
                  <span className="text-purple-100 font-mono">
                    {formatTime(clip.startTime)} 〜 {formatTime(effective.effectiveTimelineEnd)}
                    <span className="text-gray-500 ml-1">
                      設定 {formatTime(timelineEnd)}
                    </span>
                  </span>
                ) : (
                  <span className="text-purple-100 font-mono">
                    {formatTime(clip.startTime)} 〜 {formatTime(effective.effectiveTimelineEnd)}
                  </span>
                )}
              </div>
              {effective.isDisabled && (
                <span className="text-amber-400/90">
                  動画尺の外側のため再生されません
                </span>
              )}
              {bgmAutoAdjustToTimeline
                && !effective.isDisabled
                && effective.isTailFitToTimeline
                && effective.isClampedByTimeline && (
                <span className="text-emerald-400/90">
                  動画末尾まで自動調整中
                </span>
              )}
              {bgmAutoAdjustToTimeline
                && !effective.isDisabled
                && effective.isTailFitToTimeline
                && effective.isExtendedByTimeline && (
                <span className="text-emerald-400/90">
                  動画末尾まで自動延長中
                </span>
              )}
              {!effective.isDisabled && effective.isClampedByTimeline && (
                !(bgmAutoAdjustToTimeline && effective.isTailFitToTimeline)
              ) && (
                <span className="text-amber-400/90">
                  有効区間は動画末尾まで
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[10px] md:text-xs">
              <span className="text-gray-500 mr-0.5">プレビュー位置を反映:</span>
              <button
                type="button"
                onClick={withEdit('set-bgm-clip-start-current', () => updateBgmClipStartTime(clip.id, currentTime))}
                disabled={isLocked}
                className="min-h-9 px-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 hover:border-purple-500/60 hover:text-purple-200 disabled:opacity-30 flex items-center gap-1 transition"
                title={`現在位置(${formatTime(currentTime)})を再生開始に設定`}
              >
                <MapPin className="w-3.5 h-3.5" /> 開始
              </button>
              <button
                type="button"
                onClick={withEdit('set-bgm-clip-end-current', () => setBgmClipEndTime(clip.id, currentTime))}
                disabled={isLocked || !canSetCurrentAsEnd}
                className="min-h-9 px-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 hover:border-purple-500/60 hover:text-purple-200 disabled:opacity-30 flex items-center gap-1 transition"
                title={canSetCurrentAsEnd
                  ? `現在位置(${formatTime(currentTime)})を再生終了に設定`
                  : '開始位置より後ろへプレビューを移動してください'}
              >
                <MapPin className="w-3.5 h-3.5" /> 終了
              </button>
              <button
                type="button"
                onClick={withEdit('fit-bgm-clip-to-timeline-end', () => fitBgmClipToTimelineEnd(clip.id, totalDuration))}
                disabled={isLocked || totalDuration <= 0 || isSettingsFittedToTimelineEnd}
                className="min-h-9 px-2.5 rounded-lg bg-purple-900/30 border border-purple-600/40 text-purple-200 hover:bg-purple-900/50 disabled:opacity-30 flex items-center gap-1 transition"
                title={
                  isSettingsFittedToTimelineEnd
                    ? '設定上の終了はすでに動画末尾です'
                    : '設定値を動画末尾へ書き換えます'
                }
              >
                設定を末尾に固定
              </button>
            </div>

            {/* 開始位置 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] md:text-xs text-gray-400">
                <span>開始位置: {formatTime(clip.startTime)}</span>
                <span>長さ: {formatTime(playableDuration)}</span>
              </div>
              <NumericSliderField
                ariaLabel="BGMの開始位置"
                min={0}
                max={Math.max(0, totalDuration)}
                step={0.1}
                value={clip.startTime}
                onChange={withContinuousEdit('update-bgm-clip-start', (val: number) => updateBgmClipStartTime(clip.id, val))}
                disabled={isLocked}
                unit="秒"
                sliderClassName="flex-1 min-w-0 accent-purple-500 h-1 bg-gray-700 rounded appearance-none disabled:opacity-50"
                inputClassName="w-16 md:w-20 focus:border-purple-500"
              />
            </div>

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
              <NumericSliderField
                ariaLabel="BGMの音量"
                min={0}
                max={2.5}
                step={0.05}
                value={clip.volume}
                onChange={withContinuousEdit('update-bgm-clip-volume', (val: number) => updateBgmClipVolume(clip.id, val))}
                disabled={isLocked || clip.isMuted || bulkVolumeEnabled}
                hideInput
                className="flex-1 min-w-0"
                sliderClassName={`flex-1 min-w-0 accent-purple-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${(isLocked || clip.isMuted || bulkVolumeEnabled) ? '' : 'cursor-pointer'}`}
              />
              <span className="text-[10px] md:text-xs text-gray-400 w-10 text-right shrink-0">{Math.round(clip.volume * 100)}%</span>
              <button
                onClick={withEdit('update-bgm-clip-volume', () => updateBgmClipVolume(clip.id, 1))}
                disabled={isLocked || bulkVolumeEnabled}
                className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition disabled:opacity-50"
                title="リセット"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
            {bulkVolumeEnabled && (
              <p className="text-[10px] leading-relaxed text-blue-300/80 px-1">一括音量設定中のため、ここでは変更できません。</p>
            )}
            {Math.abs((clip.audioNormalizeGain ?? 1) - 1) >= 0.02 && (
              <div
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] ${
                  (clip.audioNormalizeGain ?? 1) > 1
                    ? 'bg-emerald-500/15 text-emerald-200'
                    : 'bg-amber-500/15 text-amber-200'
                }`}
              >
                <span className="font-medium">音量揃え</span>
                <span>{formatNormalizeAdjustment(clip.audioNormalizeGain ?? 1)}</span>
              </div>
            )}

            {/* トリミング */}
            <div className="rounded-lg border border-gray-700/70 bg-gray-900/30">
              <SettingsAccordionHeader
                title="トリミング設定"
                isOpen={isTrimOpen}
                disabled={isLocked}
                controlsId={`bgm-trim-settings-${clip.id}`}
                onToggle={() => setOpenTrimMap((prev) => ({ ...prev, [clip.id]: !(prev[clip.id] ?? false) }))}
              />
            {isTrimOpen && (
              <div id={`bgm-trim-settings-${clip.id}`} className="px-2 pb-2 space-y-2 border-t border-gray-700/60 pt-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] md:text-xs text-gray-400">
                    <span>トリミング開始: {formatTime(trimStart)}</span>
                    <span>元音声: {formatTime(clip.duration)}</span>
                  </div>
                  <NumericSliderField
                    ariaLabel="BGMのトリミング開始"
                    min={0}
                    max={Math.max(0, clip.duration)}
                    step={0.1}
                    value={trimStart}
                    onChange={withContinuousEdit('update-bgm-clip-trim', (val: number) => updateBgmClipTrim(clip.id, 'start', val))}
                    disabled={isLocked}
                    unit="秒"
                    sliderClassName="flex-1 min-w-0 accent-purple-500 h-1 bg-gray-700 rounded appearance-none disabled:opacity-50"
                    inputClassName="w-16 md:w-20 focus:border-purple-500"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] md:text-xs text-gray-400">
                    <span>トリミング終了: {formatTime(trimEnd)}</span>
                    <span>範囲: {formatTime(playableDuration)}</span>
                  </div>
                  <NumericSliderField
                    ariaLabel="BGMのトリミング終了"
                    min={0}
                    max={Math.max(0, clip.duration)}
                    step={0.1}
                    value={trimEnd}
                    onChange={withContinuousEdit('update-bgm-clip-trim', (val: number) => updateBgmClipTrim(clip.id, 'end', val))}
                    disabled={isLocked}
                    unit="秒"
                    sliderClassName="flex-1 min-w-0 accent-purple-500 h-1 bg-gray-700 rounded appearance-none disabled:opacity-50"
                    inputClassName="w-16 md:w-20 focus:border-purple-500"
                  />
                </div>
              </div>
            )}
            </div>

            {/* フェード */}
            <div className="rounded-lg border border-gray-700/70 bg-gray-900/30">
              <SettingsAccordionHeader
                title="フェード設定"
                isOpen={isFadeOpen}
                disabled={isLocked}
                controlsId={`bgm-fade-settings-${clip.id}`}
                onToggle={() => setOpenFadeMap((prev) => ({ ...prev, [clip.id]: !(prev[clip.id] ?? false) }))}
              />
            {isFadeOpen && (
              <div
                id={`bgm-fade-settings-${clip.id}`}
                className="flex flex-col gap-2 text-[10px] md:text-xs border-t border-gray-700/60 pt-2 px-2 pb-2"
              >
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
                    onChange={withContinuousEdit('update-bgm-clip-fade-in-duration', (val: number) => {
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
                    onChange={withContinuousEdit('update-bgm-clip-fade-out-duration', (val: number) => {
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
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(BgmClipList);
