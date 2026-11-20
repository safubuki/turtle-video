/**
 * @file CompactField.tsx
 * @description 数値スライダー欄を詰めて並べるための共通部品（動画・画像カード、BGM、ナレーション、キャプション）。
 *
 * 取り決め（13-302 / 13-304）:
 * - 見出しの行に「アイコン＋項目名」と、右端にリセット（くるくる）を置く。値は数値欄だけに出し、見出しに重ねない。
 * - リセットは＋ボタンの隣に置かない（連打中の押し間違い防止）。見た目は小さく、押せる範囲は 44px 相当を保つ。
 * - 横・縦のように対になる欄は、見出し 1 行＋1 文字ラベル（横／縦）の行を続けて並べる。
 */
import React from 'react';
import { RotateCcw, Volume2, VolumeX } from 'lucide-react';

/** 見た目は小さく（行の高さを伸ばさない）、押せる範囲は after 疑似要素で 44px 相当を保つ */
export const COMPACT_RESET_BUTTON_CLASS = "relative -my-1 flex h-7 w-7 shrink-0 items-center justify-center rounded hover:text-white after:absolute after:-inset-2 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-30";

/** 横・縦の 1 文字ラベル（同じ幅の空白ラベルで数値欄の左端をそろえられる） */
// w-3（12px）だと文字幅いっぱいで数値欄にくっついて見えるため、w-4 で左右に少し余白を持たせる
export const COMPACT_AXIS_LABEL_CLASS = 'w-4 shrink-0 text-center text-gray-400';

/** 横・縦の 2 行目（縦）に付ける上の余白。2px だと上下の数値欄がくっついて見えるため、行間を 6px にする */
export const COMPACT_AXIS_SECOND_ROW_CLASS = 'mt-1';

/** 横・縦ラベルと同じ幅を空けるための見えないラベル */
export const COMPACT_SPACER_LABEL = String.fromCharCode(0xa0);

export interface CompactFieldHeaderProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** 項目名のすぐ右に置く小さな補足（ボタンは置かない。押す物は info 側＝右寄せへ） */
  titleExtra?: React.ReactNode;
  /** 右寄せの補足（例: 元 10.0s → 表示 10.0s）。リセットの左に間を空けて置く */
  info?: React.ReactNode;
  onReset?: () => void;
  resetLabel?: string;
  resetTitle?: string;
  resetDisabled?: boolean;
  className?: string;
}

/** 欄の見出し行: [アイコン 項目名 (titleExtra)] ……… [info（補足・ミュート等）]  [↺] */
export const CompactFieldHeader: React.FC<CompactFieldHeaderProps> = ({
  icon,
  title,
  titleExtra,
  info,
  onReset,
  resetLabel,
  resetTitle,
  resetDisabled = false,
  className = '',
}) => (
  <div className={`flex min-h-7 items-center justify-between gap-2 text-[10px] text-gray-400 md:text-xs ${className}`}>
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="flex min-w-0 items-center gap-1">
        {icon}
        <span className="truncate">{title}</span>
      </span>
      {titleExtra}
    </div>
    {/* ミュートなどのボタンとリセットの押し間違いを避けるため、間を広めに空ける */}
    <div className="flex shrink-0 items-center gap-3">
      {info}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          disabled={resetDisabled}
          title={resetTitle ?? 'リセット'}
          aria-label={resetLabel}
          className={COMPACT_RESET_BUTTON_CLASS}
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
        </button>
      )}
    </div>
  </div>
);

/** 行の先頭に置くアイコンボタンの大きさ（ミュート） */
export const COMPACT_ROW_ICON_CLASS = 'flex h-9 w-9 shrink-0 items-center justify-center md:h-8 md:w-8';

export interface CompactMuteToggleProps {
  muted: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

/**
 * 数値欄（%）の左に置くアイコンだけのミュート切替。ミュート中は赤。
 * 見出しへ移すと項目名やリセットと紛れて分かりにくかったため、従来の位置・見た目に戻した（13-306）。
 * title は従来どおり「ミュート」／「ミュート解除」。
 */
export const CompactMuteToggle: React.FC<CompactMuteToggleProps> = ({ muted, disabled = false, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={disabled}
    title={muted ? 'ミュート解除' : 'ミュート'}
    aria-pressed={muted}
    className={`${COMPACT_ROW_ICON_CLASS} rounded border transition disabled:opacity-50 ${
      muted
        ? 'border-red-400/60 bg-red-500/20 text-red-300'
        : 'border-gray-500 bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
    }`}
  >
    {muted ? <VolumeX className="w-3.5 h-3.5" aria-hidden="true" /> : <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />}
  </button>
);
