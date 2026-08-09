/**
 * @file format.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 時間表示、ファイルサイズ、パーセンテージなどの数値フォーマット変換を行うユーティリティ関数群。
 */

/**
 * 秒数を "分:秒" 形式にフォーマット
 * @param seconds - 秒数
 * @returns フォーマットされた時間文字列 (例: "1:30")
 */
export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * 秒数を "分:秒.ミリ秒" 形式にフォーマット（詳細表示用）
 * @param seconds - 秒数
 * @returns フォーマットされた時間文字列 (例: "1:30.5")
 */
export function formatTimeDetailed(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00.0';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}

/**
 * 秒数を "分:秒.1/100秒" 形式にフォーマット（プレビューの現在位置表示用）。
 *
 * プレビューは 1 秒未満の移動が頻繁に起きる（再生・スライダー操作・
 * キャプションのタイミング打ち・無音区間ジャンプ）。`formatTime` の
 * 「分:秒」表示だと 3.00〜3.99 秒がすべて `0:03` に潰れてしまい、
 * 「スライダーを動かしたのに数字が変わらない」という違和感につながる。
 * ここでは 1/100 秒まで出して、実際の位置と表示を一致させる。
 *
 * 切り捨て（floor）で統一する。四捨五入すると 3.999 秒が `0:04.00` となり、
 * 総尺 4 秒の動画で「終端に達していないのに終端の表示」になるため。
 *
 * @param seconds - 秒数
 * @returns フォーマットされた時間文字列 (例: "1:30.05")
 */
export function formatTimeCentiseconds(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '0:00.00';

  // 浮動小数の誤差で 1/100 秒がひとつ下に出るのを防ぐ（例: 3.07 が 3.06 に見える）。
  // ただし 0.9999 のような値は round で 1000 になり cs=100（3 桁）へ溢れるため、
  // **全体を 1/100 秒へ量子化してから**分・秒・1/100 秒へ分解する。
  // 溢れを放置すると "0:00.100" のように桁が増え、秒の繰り上がりも失われる。
  const totalCs = Math.floor(Math.round(seconds * 1000) / 10);
  const m = Math.floor(totalCs / 6000);
  const s = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

/**
 * パーセンテージをフォーマット
 * @param value - 0〜1の値
 * @returns パーセンテージ文字列 (例: "50%")
 */
export function formatPercent(value: number): string {
  if (isNaN(value)) return '0%';
  return `${Math.round(value * 100)}%`;
}

/**
 * ファイルサイズをフォーマット
 * @param bytes - バイト数
 * @returns フォーマットされたサイズ (例: "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * 数値を安全にパース（NaN対策）
 * @param value - パースする値
 * @param defaultValue - デフォルト値
 * @param min - 最小値
 * @param max - 最大値
 * @returns パースされた数値
 */
export function safeParseFloat(
  value: string | number,
  defaultValue: number = 0,
  min?: number,
  max?: number
): number {
  let num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) num = defaultValue;
  if (min !== undefined) num = Math.max(min, num);
  if (max !== undefined) num = Math.min(max, num);
  return num;
}
