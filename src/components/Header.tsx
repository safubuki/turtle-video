import React from 'react';

/**
 * ヘッダーコンポーネント
 */
const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center justify-center shadow-lg">
      <div className="flex items-center gap-2">
        <div className="bg-green-600 p-1.5 rounded-lg">
          <span className="text-xl">🐢</span>
        </div>
        <h1 className="font-bold text-lg whitespace-nowrap">
          タートルビデオ{' '}
          <span className="text-xs bg-purple-600 px-1.5 py-0.5 rounded ml-1">AI</span>
        </h1>
      </div>
    </header>
  );
};

export default Header;
