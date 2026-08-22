/**
 * @file ClipAudioSettingsPanel.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 「音 一括設定」アコーディオン。
 * 一括ミュート・一括音量・音量揃えを、動画 / BGM / ナレーションで共通利用する。
 */
import React, { useMemo, useState } from 'react';
import type { VideoAudioNormalizeMode } from '../../types';
import SettingsAccordionHeader from '../common/SettingsAccordionHeader';
import NumericSliderField from '../common/NumericSliderField';
import {
  formatNormalizeAdjustment,
  MEDIA_VOLUME_MAX,
  MEDIA_VOLUME_MIN,
} from '../../utils';
import {
  useVideoAudioNormalize,
  type AudioNormalizeSource,
} from '../../hooks/useVideoAudioNormalize';

/** 音量揃えのファイル一覧で、スクロール前に見せる件数。 */
export const CLIP_AUDIO_NORMALIZE_VISIBLE_FILE_COUNT = 5;

const CLIP_AUDIO_NORMALIZE_FILE_LIST_CLASS =
  'space-y-1.5 overflow-y-auto overscroll-contain custom-scrollbar pr-0.5 max-h-[calc(5*2.125rem+4*0.375rem)]';

const HELP_TEXT_CLASS = 'text-[10px] leading-relaxed text-gray-500';

export type BulkAudioSettingsKind = 'video' | 'bgm' | 'narration';

const KIND_COPY: Record<
  BulkAudioSettingsKind,
  {
    muteHint: string;
    volumeHint: string;
    normalizeHint: string;
    compareHint: string;
    analyzing: string;
    analyzeError: string;
    fileFallback: string;
  }
> = {
  video: {
    muteHint: 'チェックを入れると、すべての動画をミュートします。動画がまだ無くても先に有効にでき、あとから追加した動画にもすぐ適用します。',
    volumeHint: 'チェックを入れると、すべての動画カードの音量を同じ値に揃えます。個別スライダーは無効になります。',
    normalizeHint: 'カードごとの音の大小を揃えます。動画を減らしても設定は残し、追加した動画にもそのまま適用します。',
    compareHint: '比較する動画が2本以上あるときに揃えます。',
    analyzing: '各動画の音量を解析しています…',
    analyzeError: '一部の動画を解析できませんでした。解析できたカードだけ揃えます。',
    fileFallback: '動画',
  },
  bgm: {
    muteHint: 'チェックを入れると、すべてのBGMをミュートします。曲がまだ無くても先に有効にでき、あとから追加したBGMにもすぐ適用します。',
    volumeHint: 'チェックを入れると、すべてのBGMの音量を同じ値に揃えます。個別スライダーは無効になります。',
    normalizeHint: '曲ごとの音の大小を揃えます。曲を減らしても設定は残し、追加したBGMにもそのまま適用します。',
    compareHint: '比較するBGMが2本以上あるときに揃えます。',
    analyzing: '各BGMの音量を解析しています…',
    analyzeError: '一部のBGMを解析できませんでした。解析できた曲だけ揃えます。',
    fileFallback: 'BGM',
  },
  narration: {
    muteHint: 'チェックを入れると、すべてのナレーションをミュートします。クリップがまだ無くても先に有効にでき、あとから追加したナレーションにもすぐ適用します。',
    volumeHint: 'チェックを入れると、すべてのナレーションの音量を同じ値に揃えます。個別スライダーは無効になります。',
    normalizeHint: 'クリップごとの音の大小を揃えます。クリップを減らしても設定は残し、追加したナレーションにもそのまま適用します。',
    compareHint: '比較するナレーションが2本以上あるときに揃えます。',
    analyzing: '各ナレーションの音量を解析しています…',
    analyzeError: '一部のナレーションを解析できませんでした。解析できたクリップだけ揃えます。',
    fileFallback: 'ナレーション',
  },
};

const NORMALIZE_MODE_OPTIONS: { value: VideoAudioNormalizeMode; label: string; description: string }[] = [
  {
    value: 'mean',
    label: '平均に揃える',
    description: '小さい音は上げ、大きい音は下げます。極端に小さい素材が多いと、全体が小さめに寄ります。',
  },
  {
    value: 'loudest',
    label: '最大に揃える',
    description: '小さい音だけ上げます。大きい音はそのままです。',
  },
];

export interface ClipAudioSettingsItem extends AudioNormalizeSource {
  audioNormalizeGain?: number;
}

export interface ClipAudioSettingsPanelProps {
  kind?: BulkAudioSettingsKind;
  items: ClipAudioSettingsItem[];
  isLocked: boolean;
  bulkMuted: boolean;
  bulkEnabled: boolean;
  bulkVolume: number;
  normalizeEnabled: boolean;
  normalizeMode: VideoAudioNormalizeMode;
  onToggleBulkMuted: (muted: boolean) => void;
  onToggleBulkEnabled: (enabled: boolean) => void;
  onBulkVolumeChange: (volume: number) => void;
  onToggleNormalizeEnabled: (enabled: boolean) => void;
  onChangeNormalizeMode: (mode: VideoAudioNormalizeMode) => void;
  onApplyNormalizeGains: (gains: Record<string, number>) => void;
  accordionId?: string;
}

const ClipAudioSettingsPanel: React.FC<ClipAudioSettingsPanelProps> = ({
  kind = 'video',
  items,
  isLocked,
  bulkMuted,
  bulkEnabled,
  bulkVolume,
  normalizeEnabled,
  normalizeMode,
  onToggleBulkMuted,
  onToggleBulkEnabled,
  onBulkVolumeChange,
  onToggleNormalizeEnabled,
  onChangeNormalizeMode,
  onApplyNormalizeGains,
  accordionId,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const copy = KIND_COPY[kind];
  const controlsId = accordionId ?? `bulk-audio-settings-${kind}`;
  const sources = useMemo(
    () => items.map((item) => ({
      id: item.id,
      file: item.file,
      url: item.url,
      trimStart: item.trimStart,
      trimEnd: item.trimEnd,
    })),
    [items],
  );
  const { status } = useVideoAudioNormalize({
    enabled: normalizeEnabled && sources.length > 0,
    items: sources,
    mode: normalizeMode,
    onApplyGains: onApplyNormalizeGains,
  });

  const volumePercent = Math.round(bulkVolume * 100);
  const hasItems = items.length > 0;
  const selectedMode = NORMALIZE_MODE_OPTIONS.find((option) => option.value === normalizeMode)
    ?? NORMALIZE_MODE_OPTIONS[0];

  return (
    <div className="min-w-0 rounded-lg border border-gray-700/70 bg-gray-900/30">
      <SettingsAccordionHeader
        title="音 一括設定"
        isOpen={isOpen}
        disabled={isLocked}
        controlsId={controlsId}
        onToggle={() => setIsOpen((open) => !open)}
      />
      {isOpen && (
        <div
          id={controlsId}
          className="space-y-3 border-t border-gray-700/60 px-2 pb-2 pt-2"
        >
          <div className="rounded-lg border border-gray-700/60 bg-black/20 p-2 space-y-2">
            <label
              className={`flex items-center gap-1.5 text-[11px] text-gray-200 ${isLocked ? 'opacity-50' : 'cursor-pointer'}`}
            >
              <input
                type="checkbox"
                checked={bulkMuted}
                disabled={isLocked}
                onChange={(event) => onToggleBulkMuted(event.target.checked)}
                className="rounded accent-red-500 w-3.5 h-3.5"
                aria-label="一括ミュート"
              />
              <span>一括ミュート</span>
            </label>
            <p className={HELP_TEXT_CLASS}>{copy.muteHint}</p>
          </div>

          <div className="rounded-lg border border-gray-700/60 bg-black/20 p-2 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-200">
              <label
                className={`flex items-center gap-1.5 min-w-0 flex-1 ${isLocked ? 'opacity-50' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={bulkEnabled}
                  disabled={isLocked}
                  onChange={(event) => onToggleBulkEnabled(event.target.checked)}
                  className="rounded accent-blue-500 w-3.5 h-3.5"
                  aria-label="一括音量設定"
                />
                <span>一括音量設定</span>
              </label>
              <span className="ml-auto font-mono text-[10px] text-gray-400">{volumePercent}%</span>
            </div>
            <NumericSliderField
              ariaLabel="一括音量"
              min={MEDIA_VOLUME_MIN}
              max={MEDIA_VOLUME_MAX}
              step={0.05}
              value={bulkVolume}
              disabled={isLocked || !hasItems || !bulkEnabled}
              onChange={onBulkVolumeChange}
              hideInput
              sliderClassName={`flex-1 min-w-0 accent-blue-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${isLocked || !hasItems || !bulkEnabled ? '' : 'cursor-pointer'}`}
            />
            <p className={HELP_TEXT_CLASS}>{copy.volumeHint}</p>
          </div>

          <div className="rounded-lg border border-gray-700/60 bg-black/20 p-2 space-y-2">
            <label
              className={`flex items-center gap-1.5 text-[11px] text-gray-200 ${isLocked ? 'opacity-50' : 'cursor-pointer'}`}
            >
              <input
                type="checkbox"
                checked={normalizeEnabled}
                disabled={isLocked}
                onChange={(event) => onToggleNormalizeEnabled(event.target.checked)}
                className="rounded accent-emerald-500 w-3.5 h-3.5"
                aria-label="音量を揃える"
              />
              <span>音量を揃える</span>
            </label>
            <p className={HELP_TEXT_CLASS}>{copy.normalizeHint}</p>
            {normalizeEnabled && (
              <div className="space-y-1.5" data-testid="clip-audio-normalize-list">
                <div className="grid grid-cols-2 gap-1" role="group" aria-label="音量の揃え方">
                  {NORMALIZE_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={isLocked}
                      aria-pressed={normalizeMode === option.value}
                      onClick={() => onChangeNormalizeMode(option.value)}
                      className={`min-h-8 rounded-lg border px-2 text-[10px] transition ${
                        normalizeMode === option.value
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className={HELP_TEXT_CLASS}>{selectedMode.description}</p>
                {status === 'loading' && (
                  <p className="text-[10px] leading-relaxed text-emerald-300">{copy.analyzing}</p>
                )}
                {status === 'error' && (
                  <p className="text-[10px] leading-relaxed text-amber-300">{copy.analyzeError}</p>
                )}
                {items.length < 2 && (
                  <p className={HELP_TEXT_CLASS}>{copy.compareHint}</p>
                )}
                {items.length > 0 && (
                  <div
                    data-testid="clip-audio-normalize-files"
                    className={CLIP_AUDIO_NORMALIZE_FILE_LIST_CLASS}
                    role="list"
                    aria-label="音量揃えの対象ファイル"
                  >
                    {items.map((item, index) => {
                      const gain = item.audioNormalizeGain ?? 1;
                      const label = formatNormalizeAdjustment(gain);
                      const isSilent = status === 'ready' && Math.abs(gain - 1) < 0.001 && items.length >= 2;
                      return (
                        <div
                          key={item.id}
                          role="listitem"
                          className="flex min-h-[2.125rem] items-center gap-2 rounded-md border border-gray-800 bg-gray-900/60 px-2 py-1.5"
                        >
                          <span className="truncate min-w-0 flex-1 text-[10px] text-gray-200">
                            {index + 1}. {item.file instanceof File ? item.file.name : copy.fileFallback}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                              label === '変更なし'
                                ? 'bg-gray-800 text-gray-400'
                                : gain > 1
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : 'bg-amber-500/15 text-amber-300'
                            }`}
                            title={isSilent ? '無音または解析不能のため変更なし' : '音量揃えによる補正'}
                          >
                            {`揃え ${label}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ClipAudioSettingsPanel);
