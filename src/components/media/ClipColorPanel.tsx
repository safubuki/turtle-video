/**
 * @file ClipColorPanel.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 動画・画像カードの「色合い」欄。前／次の素材に色を合わせる（MKL 色転写・AI 不使用）と、
 * 明るさ・コントラスト・彩度・色温度・色かぶりの調整。自動で合わせた結果はスライダーの値として入り
 * （colorMatchDecompose.ts）、表しきれない残りだけ「細かな色ずれの補正」として下に出す。
 * 自動合わせは場面の違う素材では色が大きく変わるため、手動調整の下に注意書き付きで置き、
 * 合わせた直後は「合わせる前に戻す」を出す。
 *
 * スライダーの溝そのものを「左端〜右端でどう変わるか」のカラーバーにする（index.css の
 * `.color-grade-slider--*`）。両端の小さな説明文字は読めないため置かない。
 */
import React, { useCallback, useState } from 'react';
import { ArrowDown, ArrowUp, Contrast, Droplet, Info, Loader2, Palette, Sun, Thermometer, Undo2, WandSparkles } from 'lucide-react';
import type { MediaColorAdjust, MediaColorMatch, MediaItem } from '../../types';
import NumericSliderField from '../common/NumericSliderField';
import { CompactFieldHeader } from '../common/CompactField';
import {
  MEDIA_COLOR_ADJUST_MAX,
  MEDIA_COLOR_ADJUST_MIN,
  hasMediaColorSettings,
  normalizeMediaColorMatch,
  resolveMediaColorAdjust,
  type MediaColorAdjustKey,
} from '../../utils/mediaColor';
import type { ColorMatchDirection } from '../../utils/mediaColorSampler';

/** -100〜100 の数値欄の幅（符号＋3 桁） */
const COLOR_INPUT_WIDTH_CHARS = 4;

interface AdjustRowDefinition {
  key: MediaColorAdjustKey;
  title: string;
  icon: React.ReactNode;
  /** 溝のカラーバー（index.css の .color-grade-slider--*）。Tailwind が拾えるよう完全なクラス名で書く */
  trackClassName: string;
}

const ADJUST_ROWS: AdjustRowDefinition[] = [
  { key: 'brightness', title: '明るさ', icon: <Sun className="w-3 h-3" aria-hidden="true" />, trackClassName: 'color-grade-slider--brightness' },
  { key: 'contrast', title: 'コントラスト', icon: <Contrast className="w-3 h-3" aria-hidden="true" />, trackClassName: 'color-grade-slider--contrast' },
  { key: 'saturation', title: '彩度', icon: <Droplet className="w-3 h-3" aria-hidden="true" />, trackClassName: 'color-grade-slider--saturation' },
  { key: 'temperature', title: '色温度', icon: <Thermometer className="w-3 h-3" aria-hidden="true" />, trackClassName: 'color-grade-slider--temperature' },
  { key: 'tint', title: '色かぶり', icon: <Palette className="w-3 h-3" aria-hidden="true" />, trackClassName: 'color-grade-slider--tint' },
];

const sliderClass = (trackClassName: string) =>
  `color-grade-slider ${trackClassName} flex-1 min-w-0 h-5 appearance-none bg-transparent disabled:opacity-50`;

const MATCH_BUTTON_CLASS = 'flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-blue-500/35 bg-blue-950/50 px-2.5 py-1.5 text-xs font-medium text-blue-100 transition-colors motion-reduce:transition-none hover:border-blue-400/55 hover:bg-blue-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 disabled:cursor-default disabled:border-gray-700/80 disabled:bg-gray-900/30 disabled:text-gray-500 md:text-sm';

/** 自動で合わせる直前の色合い（「合わせる前に戻す」用） */
export interface ColorSnapshot {
  adjust: MediaColorAdjust | undefined;
  match: MediaColorMatch | null;
}

export interface ClipColorPanelProps {
  item: MediaItem;
  isDisabled: boolean;
  onUpdateAdjust: (patch: Partial<MediaColorAdjust>) => void;
  /**
   * 前（上）の素材に色を合わせる。先頭カードなど相手が無いときは未指定。
   * 合わせた結果を入れたら true を返す（「合わせる前に戻す」を出す）
   */
  onMatchPrevious?: () => Promise<boolean | void> | boolean | void;
  /** 次（下）の素材に色を合わせる。最後のカードなど相手が無いときは未指定 */
  onMatchNext?: () => Promise<boolean | void> | boolean | void;
  /** 合わせる前の色合いへ戻す（自動で合わせた直後だけ使う） */
  onRestore?: (snapshot: ColorSnapshot) => void;
  onUpdateMatchStrength: (strength: number) => void;
  onClearMatch: () => void;
  onReset: () => void;
  /** 全体の色合い一括設定が有効かつ適用中のとき true（重ね掛け中であることを案内する） */
  isGlobalColorActive?: boolean;
}

const ClipColorPanel: React.FC<ClipColorPanelProps> = ({
  item,
  isDisabled,
  onUpdateAdjust,
  onMatchPrevious,
  onMatchNext,
  onRestore,
  onUpdateMatchStrength,
  onClearMatch,
  onReset,
  isGlobalColorActive = false,
}) => {
  const [matchingDirection, setMatchingDirection] = useState<ColorMatchDirection | null>(null);
  /** 自動で合わせる直前の色合い。合わせた直後だけ持ち、戻すか欄を閉じると消える */
  const [undoSnapshot, setUndoSnapshot] = useState<ColorSnapshot | null>(null);
  const adjust = resolveMediaColorAdjust(item.colorAdjust);
  const match = normalizeMediaColorMatch(item.colorMatch);
  const hasSettings = hasMediaColorSettings(item);
  const hasNeighbor = Boolean(onMatchPrevious || onMatchNext);

  const handleMatch = useCallback(async (direction: ColorMatchDirection) => {
    const run = direction === 'previous' ? onMatchPrevious : onMatchNext;
    if (!run || matchingDirection) return;
    const before: ColorSnapshot = {
      adjust: item.colorAdjust,
      match: normalizeMediaColorMatch(item.colorMatch),
    };
    setMatchingDirection(direction);
    try {
      const applied = await run();
      // 合わせ直したときも、最初に押す前の状態へ戻せるようにする
      if (applied === true) setUndoSnapshot((current) => current ?? before);
    } finally {
      setMatchingDirection(null);
    }
  }, [item.colorAdjust, item.colorMatch, matchingDirection, onMatchNext, onMatchPrevious]);

  const handleUndo = useCallback(() => {
    if (!undoSnapshot || !onRestore) return;
    onRestore(undoSnapshot);
    setUndoSnapshot(null);
  }, [onRestore, undoSnapshot]);

  const handleResetAll = useCallback(() => {
    setUndoSnapshot(null);
    onReset();
  }, [onReset]);

  const renderMatchButton = (direction: ColorMatchDirection) => {
    const isPrevious = direction === 'previous';
    const available = Boolean(isPrevious ? onMatchPrevious : onMatchNext);
    const isBusy = matchingDirection === direction;
    const label = isPrevious ? '前の素材に合わせる' : '次の素材に合わせる';
    const Icon = isPrevious ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => { void handleMatch(direction); }}
        disabled={isDisabled || !available || matchingDirection !== null}
        title={available
          ? (isPrevious
            ? '前（上）の素材の最後のコマに、この素材の最初のコマの色合いを近づけます'
            : '次（下）の素材の最初のコマに、この素材の最後のコマの色合いを近づけます')
          : (isPrevious ? '前の素材がありません' : '次の素材がありません')}
        className={MATCH_BUTTON_CLASS}
      >
        {isBusy
          ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          : <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
        <span className="truncate">{isBusy ? '合わせています…' : label}</span>
      </button>
    );
  };

  return (
    <div className="space-y-2" data-testid={`clip-color-panel-${item.id}`}>
      {isGlobalColorActive && (
        <p
          className="flex items-start gap-1.5 rounded-md border border-blue-500/25 bg-blue-950/35 px-2 py-1 text-[10px] leading-relaxed text-blue-200/90 md:text-xs"
          data-testid={`clip-color-global-notice-${item.id}`}
        >
          <Info className="mt-0.5 h-3 w-3 shrink-0 text-blue-300/90" aria-hidden="true" />
          <span>全体の色合いが適用中です。ここでの個別調整の上から重ねて掛かります。</span>
        </p>
      )}
      {/* 手動調整（見出し＋スライダーの 2 行を詰めて並べる） */}
      <div className="space-y-1">
        {ADJUST_ROWS.map((row) => (
          <div key={row.key} className="flex flex-col">
            <CompactFieldHeader
              icon={row.icon}
              title={row.title}
              onReset={() => onUpdateAdjust({ [row.key]: 0 })}
              resetDisabled={isDisabled || adjust[row.key] === 0}
              resetLabel={`${row.title}をリセット`}
              resetTitle="0へ戻す"
            />
            <NumericSliderField
              ariaLabel={row.title}
              min={MEDIA_COLOR_ADJUST_MIN}
              max={MEDIA_COLOR_ADJUST_MAX}
              step={1}
              value={adjust[row.key]}
              onChange={(value) => onUpdateAdjust({ [row.key]: value })}
              disabled={isDisabled}
              inputWidthChars={COLOR_INPUT_WIDTH_CHARS}
              sliderClassName={sliderClass(row.trackClassName)}
            />
          </div>
        ))}
      </div>

      {/* 自動で合わせたうち、スライダーで表しきれなかった残り（暗い所だけ青い、など）。無いときは出さない */}
      {match && (
        <div className="flex flex-col border-t border-gray-700/50 pt-1">
          <CompactFieldHeader
            icon={<WandSparkles className="w-3 h-3" aria-hidden="true" />}
            title="細かな色ずれの補正"
            onReset={onClearMatch}
            resetDisabled={isDisabled}
            resetLabel="細かな色ずれの補正を外す"
            resetTitle="外す"
          />
          <NumericSliderField
            ariaLabel="細かな色ずれの補正"
            min={0}
            max={100}
            step={1}
            value={match.strength}
            onChange={onUpdateMatchStrength}
            disabled={isDisabled}
            unit="%"
            inputWidthChars={COLOR_INPUT_WIDTH_CHARS}
            sliderClassName={sliderClass('color-grade-slider--strength')}
          />
          <p className="px-1 text-[10px] leading-relaxed text-gray-400 md:text-xs">
            上のスライダーだけでは表しきれない色のずれ（暗い所だけ青い など）を補います。
          </p>
        </div>
      )}

      {/*
        隣の素材に自動で合わせる。場面が違う素材では大きく色が変わるため、手動調整の下に置き、
        向いている場面の案内と注意点・「合わせる前に戻す」を落ち着いたトーンで添える
      */}
      <div className="space-y-2 rounded-lg border border-gray-700/60 bg-gray-900/40 p-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-200 md:text-xs">
          <WandSparkles className="h-3.5 w-3.5 shrink-0 text-blue-300/90" aria-hidden="true" />
          <span>隣の素材に自動で合わせる</span>
        </div>
        {hasNeighbor ? (
          <div className="space-y-1 text-[10px] leading-relaxed md:text-xs">
            <p className="text-gray-300">
              分割した動画など、同じ場面の続きでつなぎ目の色をそろえます。
            </p>
            <p className="flex items-start gap-1 text-gray-400">
              <Info className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" aria-hidden="true" />
              <span>場面や写っている物が違う素材では、色が大きく変わることがあります。</span>
            </p>
          </div>
        ) : (
          <p className="text-[10px] leading-relaxed text-gray-400 md:text-xs">
            素材が 2 つ以上あるときに使えます。
          </p>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          {renderMatchButton('previous')}
          {renderMatchButton('next')}
        </div>
        {undoSnapshot && onRestore && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-gray-700/60 bg-gray-800/50 px-2 py-1.5">
            <span className="text-[10px] leading-snug text-gray-300 md:text-xs">
              結果は上のスライダーに入りました。
            </span>
            <button
              type="button"
              onClick={handleUndo}
              disabled={isDisabled || matchingDirection !== null}
              className="flex shrink-0 items-center gap-1 rounded-md border border-gray-600 bg-gray-700/80 px-2 py-1 text-[10px] font-medium text-gray-100 transition-colors motion-reduce:transition-none hover:bg-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 disabled:opacity-50 md:text-xs"
            >
              <Undo2 className="h-3 w-3" aria-hidden="true" />
              合わせる前に戻す
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleResetAll}
          disabled={isDisabled || !hasSettings}
          className="rounded px-1 py-0.5 text-[10px] text-gray-400 underline-offset-2 transition-colors motion-reduce:transition-none hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 disabled:opacity-40 md:text-xs"
        >
          色合いをすべて元に戻す
        </button>
      </div>
    </div>
  );
};

export default React.memo(ClipColorPanel);
