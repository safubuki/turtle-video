import React, { useState, useEffect } from 'react';
import { X, Key, Eye, EyeOff, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const API_KEY_STORAGE_KEY = 'turtle-video-gemini-api-key';

/**
 * APIキーをlocalStorageから取得
 */
export function getStoredApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * APIキーをlocalStorageに保存
 */
export function setStoredApiKey(key: string): void {
  try {
    if (key) {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch {
    // localStorage が使えない環境では何もしない
  }
}

/**
 * 設定モーダルコンポーネント
 * APIキーの設定UI
 */
const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiKey(getStoredApiKey());
      setSaved(false);
      setShowKey(false);
    }
  }, [isOpen]);

  const handleSave = () => {
    setStoredApiKey(apiKey.trim());
    setSaved(true);
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  const handleClear = () => {
    setApiKey('');
    setStoredApiKey('');
    setSaved(false);
  };

  const maskApiKey = (key: string): string => {
    if (!key) return '';
    if (key.length <= 8) return '●'.repeat(key.length);
    return key.slice(0, 4) + '●'.repeat(key.length - 8) + key.slice(-4);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[300] p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg shadow-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Key className="w-5 h-5 text-yellow-500" />
            設定
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-700 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-4 space-y-4">
          {/* 説明 */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <h3 className="font-bold text-blue-400 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              AIナレーション機能について
            </h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              AIナレーション機能を使用するには、Google Gemini APIキーが必要です。
              以下の手順でAPIキーを取得してください：
            </p>
            <ol className="text-sm text-gray-300 mt-2 space-y-1 list-decimal list-inside">
              <li>下のリンクからGoogle AI Studioにアクセス</li>
              <li>Googleアカウントでログイン</li>
              <li>「Get API Key」をクリックしてキーを発行</li>
              <li>発行されたキーをコピーして下に貼り付け</li>
            </ol>
          </div>

          {/* AI Studio リンク */}
          <a
            href="https://aistudio.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white py-3 px-4 rounded-lg font-bold transition shadow-lg"
          >
            <ExternalLink className="w-4 h-4" />
            Google AI Studio でAPIキーを取得
          </a>

          {/* APIキー入力 */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-gray-300">
              Gemini APIキー
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={showKey ? apiKey : (apiKey ? maskApiKey(apiKey) : '')}
                onChange={(e) => {
                  if (showKey) {
                    setApiKey(e.target.value);
                    setSaved(false);
                  }
                }}
                onFocus={() => setShowKey(true)}
                placeholder="AIza..."
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 pr-12 text-sm font-mono focus:outline-none focus:border-blue-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition"
              >
                {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              ※ APIキーはブラウザのローカルストレージに保存されます
            </p>
          </div>

          {/* 保存成功メッセージ */}
          {saved && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 flex items-center gap-2 text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-bold">保存しました！</span>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex gap-3 p-4 border-t border-gray-700">
          <button
            onClick={handleClear}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-lg font-bold transition"
          >
            クリア
          </button>
          <button
            onClick={handleSave}
            disabled={!apiKey.trim()}
            className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-bold transition shadow-lg"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(SettingsModal);
