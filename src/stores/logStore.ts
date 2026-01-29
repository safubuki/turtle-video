/**
 * ログストア - Zustand
 * 動作ログ・エラーログの記録・管理
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ログレベル
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

// ログカテゴリ
export type LogCategory = 'MEDIA' | 'RENDER' | 'AUDIO' | 'SYSTEM';

// ログエントリ
export interface LogEntry {
    id: string;
    timestamp: string;
    level: LogLevel;
    category: LogCategory;
    message: string;
    details?: Record<string, unknown>;
}

// ストレージキー
const LOG_STORAGE_KEY = 'turtle-video-logs';
const MAX_LOG_ENTRIES = 500;
const DUPLICATE_SUPPRESS_MS = 10000; // 同じ警告の抑制時間（10秒）

// ログID生成用カウンター
let logIdCounter = 0;

/**
 * sessionStorageからログを読み込み
 */
function loadLogsFromStorage(): LogEntry[] {
    try {
        const stored = sessionStorage.getItem(LOG_STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch {
        // 読み込み失敗時は空配列
    }
    return [];
}

/**
 * sessionStorageにログを保存
 */
function saveLogsToStorage(entries: LogEntry[]): void {
    try {
        sessionStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(entries));
    } catch {
        // 保存失敗時は何もしない
    }
}

/**
 * ログIDを生成
 */
function generateLogId(): string {
    logIdCounter++;
    return `log_${Date.now()}_${logIdCounter.toString().padStart(3, '0')}`;
}


interface LogState {
    entries: LogEntry[];
    hasError: boolean;
    lastLogKey: string; // 重複抑制用
    lastLogTime: number; // 重複抑制用

    // Actions
    log: (level: LogLevel, category: LogCategory, message: string, details?: Record<string, unknown>) => void;
    info: (category: LogCategory, message: string, details?: Record<string, unknown>) => void;
    warn: (category: LogCategory, message: string, details?: Record<string, unknown>) => void;
    error: (category: LogCategory, message: string, details?: Record<string, unknown>) => void;
    debug: (category: LogCategory, message: string, details?: Record<string, unknown>) => void;
    clearLogs: () => void;
    clearErrorFlag: () => void;
    exportLogs: () => string;
    getRecentErrors: () => LogEntry[];
}

export const useLogStore = create<LogState>()(
    devtools(
        (set, get) => ({
            entries: loadLogsFromStorage(),
            hasError: loadLogsFromStorage().some(e => e.level === 'ERROR'),
            lastLogKey: '',
            lastLogTime: 0,

            log: (level, category, message, details) => {
                const now = Date.now();
                const logKey = `${level}:${category}:${message}`;
                const { lastLogKey, lastLogTime, entries } = get();

                // 重複抑制: 同じログが短時間に連続する場合はスキップ
                if (logKey === lastLogKey && now - lastLogTime < DUPLICATE_SUPPRESS_MS) {
                    return;
                }

                const newEntry: LogEntry = {
                    id: generateLogId(),
                    timestamp: new Date().toISOString(),
                    level,
                    category,
                    message,
                    details,
                };

                // 最大件数を超えたら古いログを削除
                let newEntries = [...entries, newEntry];
                if (newEntries.length > MAX_LOG_ENTRIES) {
                    newEntries = newEntries.slice(newEntries.length - MAX_LOG_ENTRIES);
                }

                // ストレージに保存
                saveLogsToStorage(newEntries);

                set({
                    entries: newEntries,
                    hasError: level === 'ERROR' ? true : get().hasError,
                    lastLogKey: logKey,
                    lastLogTime: now,
                });
            },

            info: (category, message, details) => {
                get().log('INFO', category, message, details);
            },

            warn: (category, message, details) => {
                get().log('WARN', category, message, details);
            },

            error: (category, message, details) => {
                get().log('ERROR', category, message, details);
            },

            debug: (category, message, details) => {
                get().log('DEBUG', category, message, details);
            },

            clearLogs: () => {
                saveLogsToStorage([]);
                set({
                    entries: [],
                    hasError: false,
                    lastLogKey: '',
                    lastLogTime: 0,
                });
            },

            clearErrorFlag: () => {
                set({ hasError: false });
            },

            exportLogs: () => {
                const { entries } = get();
                return JSON.stringify(entries, null, 2);
            },

            getRecentErrors: () => {
                const { entries } = get();
                return entries.filter(e => e.level === 'ERROR').slice(-10);
            },
        }),
        { name: 'log-store' }
    )
);

export default useLogStore;
