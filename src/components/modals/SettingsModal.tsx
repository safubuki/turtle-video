/**
 * @file SettingsModal.tsx
 * @author Turtle Village
 * @description アプリケーションの設定（Gemini APIキーの管理）およびシステムログ、デバイスリソース情報の閲覧を行うモーダル。
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  X, Key, Eye, EyeOff, ExternalLink, CheckCircle, AlertCircle,
  FileText, Copy, Download, Trash2, CheckCircle2, Cpu, RefreshCw
} from 'lucide-react';
import { useLogStore, getSystemInfo } from '../../stores';
import type { LogEntry, SystemInfo } from '../../stores';

// アプリバージョン
import versionData from '../../../version.json';
export const APP_VERSION = versionData.version;

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

type TabType = 'apikey' | 'logs' | 'system';

/**
 * ログレベルに応じた色を返す
 */
function getLogLevelColor(level: string): string {
  switch (level) {
    case 'ERROR': return 'text-red-400';
    case 'WARN': return 'text-yellow-400';
    case 'INFO': return 'text-blue-400';
    case 'DEBUG': return 'text-gray-500';
    default: return 'text-gray-400';
  }
}

/**
 * ログレベルに応じた背景色を返す
 */
function getLogLevelBg(level: string): string {
  switch (level) {
    case 'ERROR': return 'bg-red-500/10';
    case 'WARN': return 'bg-yellow-500/10';
    case 'INFO': return 'bg-blue-500/10';
    case 'DEBUG': return 'bg-gray-500/10';
    default: return 'bg-gray-500/10';
  }
}

/**
 * 設定モーダルコンポーネント
 * APIキーの設定UI + ログ表示
 */
const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('apikey');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Log Store
  const entries = useLogStore((s) => s.entries);
  const hasError = useLogStore((s) => s.hasError);
  const clearLogs = useLogStore((s) => s.clearLogs);
  const clearErrorFlag = useLogStore((s) => s.clearErrorFlag);
  const exportLogs = useLogStore((s) => s.exportLogs);
  const memoryStats = useLogStore((s) => s.memoryStats);
  const updateMemoryStats = useLogStore((s) => s.updateMemoryStats);
  const clearMemoryStats = useLogStore((s) => s.clearMemoryStats);

  useEffect(() => {
    if (isOpen) {
      setApiKey(getStoredApiKey());
      setSaved(false);
      setShowKey(false);
      setCopied(false);
      // ログタブを開いたらエラーフラグをクリア
      if (activeTab === 'logs') {
        clearErrorFlag();
      }
    }
  }, [isOpen, activeTab, clearErrorFlag]);

  // ログが追加されたら自動スクロール
  useEffect(() => {
    if (logContainerRef.current && activeTab === 'logs') {
      logContainerRef.current.scrollTop = 0;
    }
  }, [entries, activeTab]);

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

  const handleCopyLogs = async () => {
    const logsJson = exportLogs();
    try {
      await navigator.clipboard.writeText(logsJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // フォールバック
      const textarea = document.createElement('textarea');
      textarea.value = logsJson;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExportLogs = () => {
    const content = exportLogs();
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'turtle-video-logs.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const timeStr = date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${timeStr}.${ms}`;
  };

  const errorCount = entries.filter(e => e.level === 'ERROR').length;
  const warnCount = entries.filter(e => e.level === 'WARN').length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[300] p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
          <h2 className="text-lg font-bold flex items-center gap-2">
            ⚙️ 設定
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-700 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* タブ */}
        <div className="flex border-b border-gray-700 shrink-0">
          <button
            onClick={() => setActiveTab('apikey')}
            className={`flex-1 py-3 px-2 text-xs font-bold flex items-center justify-center gap-1 transition ${activeTab === 'apikey'
              ? 'text-white border-b-2 border-blue-500 bg-gray-800/50'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/30'
              }`}
          >
            <Key className="w-4 h-4" />
            APIキー
          </button>
          <button
            onClick={() => { setActiveTab('logs'); clearErrorFlag(); }}
            className={`flex-1 py-3 px-2 text-xs font-bold flex items-center justify-center gap-1 transition ${activeTab === 'logs'
              ? 'text-white border-b-2 border-blue-500 bg-gray-800/50'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/30'
              }`}
          >
            <FileText className="w-4 h-4" />
            ログ
            {hasError && activeTab !== 'logs' && (
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>
          <button
            onClick={() => { setActiveTab('system'); setSystemInfo(getSystemInfo()); }}
            className={`flex-1 py-3 px-2 text-xs font-bold flex items-center justify-center gap-1 transition ${activeTab === 'system'
              ? 'text-white border-b-2 border-blue-500 bg-gray-800/50'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/30'
              }`}
          >
            <Cpu className="w-4 h-4" />
            システム
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === 'apikey' ? (
            /* APIキータブ */
            <div className="p-4 space-y-4 overflow-y-auto">
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

              {/* フッター */}
              <div className="flex gap-3 pt-2">
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
          ) : activeTab === 'logs' ? (
            /* ログタブ */
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* ステータス */}
              <div className="p-3 border-b border-gray-700 shrink-0">
                <div className={`flex items-center gap-3 p-3 rounded-lg ${errorCount > 0 ? 'bg-red-500/10 border border-red-500/30' :
                  'bg-green-500/10 border border-green-500/30'
                  }`}>
                  {errorCount > 0 ? (
                    <>
                      <AlertCircle className="w-5 h-5 text-red-400" />
                      <div>
                        <p className="font-bold text-red-400">エラー発生</p>
                        <p className="text-xs text-gray-400">
                          エラー: {errorCount}件 / ワーニング: {warnCount}件
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                      <div>
                        <p className="font-bold text-green-400">正常動作中</p>
                        <p className="text-xs text-gray-400">
                          ログ: {entries.length}件
                          {warnCount > 0 && <span className="text-yellow-400 ml-2">（ワーニングあり: {warnCount}件）</span>}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ログ一覧 */}
              <div
                ref={logContainerRef}
                className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs"
              >
                {entries.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    ログはまだありません
                  </div>
                ) : (
                  [...entries].reverse().map((entry: LogEntry) => (
                    <div
                      key={entry.id}
                      className={`p-2 rounded ${getLogLevelBg(entry.level)}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-gray-500 shrink-0">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                        <span className={`font-bold shrink-0 w-12 ${getLogLevelColor(entry.level)}`}>
                          {entry.level}
                        </span>
                        <span className="text-gray-400 shrink-0">
                          [{entry.category}]
                        </span>
                        <span className="text-gray-200 break-all">
                          {entry.message}
                        </span>
                      </div>
                      {entry.details && Object.keys(entry.details).length > 0 && (
                        <div className="mt-1 ml-[7.5rem] text-gray-500 break-all">
                          {JSON.stringify(entry.details)}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* アクションボタン */}
              <div className="p-3 border-t border-gray-700 flex gap-2 shrink-0">
                <button
                  onClick={handleCopyLogs}
                  disabled={entries.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm font-bold transition"
                >
                  {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'コピー完了' : 'コピー'}
                </button>
                <button
                  onClick={handleExportLogs}
                  disabled={entries.length === 0}
                  className="flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-3 rounded-lg text-sm font-bold transition"
                >
                  <Download className="w-4 h-4" />
                  JSON
                </button>
                <button
                  onClick={clearLogs}
                  disabled={entries.length === 0}
                  className="flex items-center justify-center gap-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-3 rounded-lg text-sm font-bold transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : activeTab === 'system' ? (
            /* システムタブ */
            <div className="p-4 space-y-4 overflow-y-auto">
              {/* 更新ボタン */}
              <div className="flex justify-end">
                <button
                  onClick={() => setSystemInfo(getSystemInfo())}
                  className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded-lg text-sm font-bold transition"
                >
                  <RefreshCw className="w-4 h-4" />
                  更新
                </button>
              </div>

              {systemInfo && (
                <>
                  {/* デバイス情報 */}
                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
                    <h3 className="font-bold text-sm flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-blue-400" />
                      デバイス情報
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-gray-400">デバイス</div>
                      <div className={systemInfo.isMobile ? 'text-yellow-400' : 'text-green-400'}>
                        {systemInfo.isMobile ? 'モバイル' : 'デスクトップ'}
                      </div>
                      <div className="text-gray-400">プラットフォーム</div>
                      <div className="text-gray-200">{systemInfo.platform}</div>
                      <div className="text-gray-400">CPUコア数</div>
                      <div className="text-gray-200">
                        {systemInfo.hardwareConcurrency ?? '不明'}
                      </div>
                      <div className="text-gray-400">デバイスメモリ</div>
                      <div className="text-gray-200">
                        {systemInfo.deviceMemory ? `${systemInfo.deviceMemory} GB` : '不明'}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      ※ブラウザAPIの制限により概算値（上限8GB）
                    </p>
                  </div>

                  {/* メモリ使用量（Chrome限定） */}
                  {systemInfo.jsHeapUsed !== null && (
                    <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <h3 className="font-bold text-sm">📊 JSヒープメモリ</h3>
                        <button
                          onClick={() => { updateMemoryStats(); setSystemInfo(getSystemInfo()); }}
                          className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition"
                        >
                          更新
                        </button>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">現在使用中</span>
                          <span className="text-gray-200">{memoryStats.currentHeapUsed ?? systemInfo.jsHeapUsed} MB</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${(systemInfo.jsHeapUsed / (systemInfo.jsHeapLimit || 1)) > 0.8
                              ? 'bg-red-500'
                              : (systemInfo.jsHeapUsed / (systemInfo.jsHeapLimit || 1)) > 0.5
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                              }`}
                            style={{
                              width: `${Math.min(100, (systemInfo.jsHeapUsed / (systemInfo.jsHeapLimit || 1)) * 100)}%`
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>0 MB</span>
                          <span>総量: {systemInfo.jsHeapTotal} MB</span>
                          <span>制限: {systemInfo.jsHeapLimit} MB</span>
                        </div>
                      </div>

                      {/* 最大使用量 */}
                      <div className="border-t border-gray-700 pt-3 mt-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">📈 最大使用量</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-orange-400">{memoryStats.maxHeapUsed} MB</span>
                            <button
                              onClick={clearMemoryStats}
                              className="text-xs bg-red-600/50 hover:bg-red-600 px-2 py-1 rounded transition"
                            >
                              クリア
                            </button>
                          </div>
                        </div>
                        {memoryStats.maxHeapRecordedAt && (
                          <p className="text-xs text-gray-500">
                            記録日時: {new Date(memoryStats.maxHeapRecordedAt).toLocaleString()}
                          </p>
                        )}
                        <p className="text-xs text-gray-500">
                          監視開始: {new Date(memoryStats.monitoringStartedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ユーザーエージェント */}
                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                    <h3 className="font-bold text-sm">🌐 ブラウザ情報</h3>
                    <p className="text-xs text-gray-400 break-all">{systemInfo.userAgent}</p>
                  </div>

                  {/* モバイル警告 */}
                  {systemInfo.isMobile && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                      <p className="text-sm text-yellow-400 font-bold">⚠️ モバイルデバイス</p>
                      <p className="text-xs text-gray-400 mt-1">
                        モバイルブラウザではビデオデコーダーの制限により、複数の動画を同時に処理すると
                        フリーズや黒画面が発生する場合があります。問題が発生した場合は、リロードボタン（🔄）を
                        お試しください。
                      </p>
                    </div>
                  )}
                </>
              )}

              {!systemInfo && (
                <div className="text-center text-gray-500 py-8">
                  「更新」ボタンを押してシステム情報を取得
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* バージョン情報 */}
        <div className="px-4 pb-3 text-center border-t border-gray-700 pt-3 shrink-0">
          <span className="text-xs text-gray-500">
            タートルビデオ v{APP_VERSION}
          </span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(SettingsModal);

