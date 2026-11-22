/**
 * @file Header.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description アプリケーションのグローバルヘッダー。タイトル表示、エクスポートボタン、設定モーダルへのアクセスを提供する。
 */
import React from 'react';
import { Settings, FolderOpen, CircleHelp, Eraser } from 'lucide-react';

interface HeaderProps {
  onOpenSettings?: () => void;
  onOpenProjectManager?: () => void;
  onOpenAppHelp?: () => void;
  onClearAll?: () => void;
  clearAllDisabled?: boolean;
}

/**
 * ヘッダーコンポーネント
 */
const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onOpenProjectManager,
  onOpenAppHelp,
  onClearAll,
  clearAllDisabled = false,
}) => {
  return (
    <header className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-3 py-3 sm:px-4 lg:px-8 lg:py-4 shadow-lg">
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-2 sm:gap-2.5 lg:gap-3.5">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-600/95 ring-1 ring-emerald-300/35 shadow-[0_0_0_2px_rgba(2,6,23,0.65)] sm:h-10 sm:w-10 lg:h-12 lg:w-12">
            <img
              src={`${import.meta.env.BASE_URL}turtle_icon.png`}
              alt="タートルビデオ"
              className="h-7 w-7 rounded-full object-cover sm:h-8 sm:w-8 lg:h-9 lg:w-9"
            />
          </div>
          <h1 className="font-bold text-base sm:text-lg lg:text-xl whitespace-nowrap leading-none">
            タートルビデオ
          </h1>
        </div>
        <div className="flex items-center gap-1 ml-2 sm:ml-2.5 lg:ml-10">
          {onOpenProjectManager && (
            <button
              type="button"
              onClick={onOpenProjectManager}
              className="p-1.5 lg:p-2 hover:bg-gray-700 rounded-lg transition text-gray-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
              title="保存・読み込み"
              aria-label="保存・読み込み"
            >
              <FolderOpen className="w-5 h-5 lg:w-6 lg:h-6" />
            </button>
          )}
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-1.5 lg:p-2 hover:bg-gray-700 rounded-lg transition text-gray-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
              title="設定"
              aria-label="設定"
            >
              <Settings className="w-5 h-5 lg:w-6 lg:h-6" />
            </button>
          )}
          {onOpenAppHelp && (
            <button
              type="button"
              onClick={onOpenAppHelp}
              className="p-1.5 lg:p-2 rounded-lg transition border border-blue-500/45 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
              title="このアプリの説明"
              aria-label="このアプリの説明"
            >
              <CircleHelp className="w-5 h-5 lg:w-6 lg:h-6" />
            </button>
          )}
          {onClearAll && (
            <>
              <span aria-hidden="true" className="mx-0.5 lg:mx-1.5 h-5 lg:h-6 w-px bg-gray-700/80" />
              <button
                type="button"
                onClick={onClearAll}
                disabled={clearAllDisabled}
                className="p-1.5 lg:p-2 rounded-lg transition border border-rose-500/45 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-rose-500/10 disabled:hover:text-rose-300"
                title="一括クリア（現在編集中の内容を初期化・保存データは削除されません）"
                aria-label="一括クリア"
              >
                <Eraser className="w-5 h-5 lg:w-6 lg:h-6" />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default React.memo(Header);
