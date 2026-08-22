/**
 * @file SettingsAccordionHeader.tsx
 * @description 設定アコーディオンの見出しを四角いカードとして統一表示する共通コンポーネント。
 * 閉じているときは「（開いて設定）」を補助文言として出し、開閉状態は矢印アイコンで示す。
 * 「キャプション 一括設定」「文字の縁・色」と同じ見た目・操作感へ全体を揃えるために使う。
 */
import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SettingsAccordionHeaderProps {
  /** 見出しに表示する設定名 */
  title: string;
  /** 展開中かどうか */
  isOpen: boolean;
  /** 見出し全体のクリックで開閉する */
  onToggle: () => void;
  /** 展開部の要素 id（aria-controls 用） */
  controlsId: string;
  /** ロック中などで操作できない場合 */
  disabled?: boolean;
  /** タイトル左に置く任意のアイコン */
  icon?: React.ReactNode;
}

/**
 * 設定アコーディオンの見出しボタン。
 * 呼び出し側はカード枠（border + rounded）を持つコンテナで本コンポーネントと展開部を包む。
 */
const SettingsAccordionHeader = React.memo<SettingsAccordionHeaderProps>(({
  title,
  isOpen,
  onToggle,
  controlsId,
  disabled = false,
  icon,
}) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={disabled}
    aria-expanded={isOpen}
    aria-controls={controlsId}
    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs text-gray-400 transition hover:bg-gray-800/45 hover:text-white disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-gray-400 md:text-sm"
  >
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold">
      {icon}
      <span className="whitespace-nowrap">{title}</span>
      {!isOpen && (
        <span
          aria-hidden="true"
          className="whitespace-nowrap text-[10px] font-normal text-gray-500 md:text-xs"
        >
          （開いて設定）
        </span>
      )}
    </span>
    {isOpen ? (
      <ChevronDown className="h-3 w-3 shrink-0" />
    ) : (
      <ChevronRight className="h-3 w-3 shrink-0" />
    )}
  </button>
));

SettingsAccordionHeader.displayName = 'SettingsAccordionHeader';

export default SettingsAccordionHeader;
