/**
 * @file Header.tsx
 * @author Turtle Village
 * @description アプリケーションのグローバルヘッダー。タイトル表示、エクスポートボタン、設定モーダルへのアクセスを提供する。
 */
import React from 'react';
import { Settings, FolderOpen } from 'lucide-react';

interface HeaderProps {
  onOpenSettings?: () => void;
  onOpenProjectManager?: () => void;
}

/**
 * ヘッダーコンポーネント
 */
const Header: React.FC<HeaderProps> = ({ onOpenSettings, onOpenProjectManager }) => {
  return (
    <header className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3 lg:px-8 lg:py-4 flex items-center justify-center shadow-lg">
      <div className="flex items-center gap-2 lg:gap-3">
        <div className="bg-green-600 p-1.5 lg:p-2 rounded-lg">
          <img src={`${import.meta.env.BASE_URL}turtle_icon.png`} alt="タートルビデオ" className="w-6 h-6 lg:w-7 lg:h-7" />
        </div>
        <h1 className="font-bold text-lg lg:text-xl whitespace-nowrap">
          タートルビデオ{' '}
          <span className="text-xs lg:text-sm bg-purple-600 px-1.5 py-0.5 rounded ml-1">AI</span>
        </h1>
        {onOpenProjectManager && (
          <button
            onClick={onOpenProjectManager}
            className="ml-auto p-1.5 lg:p-2 hover:bg-gray-700 rounded-lg transition text-gray-400 hover:text-white"
            title="保存・読み込み"
          >
            <FolderOpen className="w-5 h-5 lg:w-6 lg:h-6" />
          </button>
        )}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="p-1.5 lg:p-2 hover:bg-gray-700 rounded-lg transition text-gray-400 hover:text-white"
            title="設定"
          >
            <Settings className="w-5 h-5 lg:w-6 lg:h-6" />
          </button>
        )}
      </div>
    </header>
  );
};

export default React.memo(Header);
