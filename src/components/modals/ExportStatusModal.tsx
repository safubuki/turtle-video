/**
 * @file ExportStatusModal.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 動画ファイル作成中（リアルタイム映像・進捗・注意書き・中止）および
 * 作成完了後（ダウンロード・編集に戻る）を PC・スマホ共通で画面中央に表示する専用モーダル。
 *
 * - 背後の本番プレビュー Canvas は DOM 上に残したまま（移動・非表示にしない）、
 *   モーダル内の軽量モニター Canvas へ約 12fps で縮小コピー描画する。
 *   これにより WebCodecs / Safari MediaRecorder のエンコード品質・安定性へ一切影響を与えない。
 * - 書き出し中やダウンロード前の誤閉じを防ぐため、背景クリック・Escape キーでは閉じず、
 *   明示的な「中止」または「編集に戻る」ボタン操作でのみ編集画面へ復帰する。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader,
  X,
} from 'lucide-react';
import { useDisableBodyScroll } from '../../hooks/useDisableBodyScroll';
import type { ExportContentMode } from '../../types';

export type ExportModalPhase = 'preparing' | 'rendering' | 'finalizing';

/** モーダル内ライブモニターの最大長辺 px（縮小コピーで GPU 負荷を極小化） */
const LIVE_MONITOR_MAX_SIDE = 480;
/** ライブモニターの更新間隔 ms（約 12.5fps。エンコード負荷への影響を防ぐ） */
const LIVE_MONITOR_INTERVAL_MS = 80;

export interface ExportStatusModalProps {
  /** モーダルを表示するか（isProcessing || Boolean(exportUrl)） */
  isOpen: boolean;
  /** 現在の状態: 書き出し中か、完了（ダウンロード待ち）か */
  mode: 'processing' | 'complete';
  /** 書き出し対象（完成動画 / キャプションのみ） */
  contentMode: ExportContentMode;
  /** 書き出し中のフェーズ */
  exportPhase: ExportModalPhase;
  /** 書き出し進捗（0〜100） */
  progressPct: number;
  /** 経過秒数（3秒以上なら補助表示） */
  elapsedSec: number;
  /** 現在の処理見出し（例: 書き出し準備中... / 映像を書き出し中... / 保存ファイルを作成中...） */
  stageHeadline: string;
  /** 現在の詳細説明（例: 音声ミックスを作成中...） */
  statusDescription: string | null;
  /** 出力ファイルの拡張子（mp4 / webm 等） */
  exportExt: string | null;
  /** 出力サイズ表記（例: 1920×1080 (16:9)） */
  outputSizeLabel?: string | null;
  /** 動画の総尺表記（例: 0:39.44） */
  durationLabel?: string | null;
  /** 本番プレビュー Canvas への参照（書き出し中のみ軽量ミラー描画に使う） */
  previewCanvasRef?: RefObject<HTMLCanvasElement | null>;
  /** 出力キャンバスの幅（モニターのアスペクト比維持用） */
  canvasWidth?: number;
  /** 出力キャンバスの高さ（モニターのアスペクト比維持用） */
  canvasHeight?: number;
  /** 書き出し中のミニプレビュー表示を有効にするか（設定画面の「出力中のミニプレビュー」に連動） */
  showLivePreview?: boolean;
  /** ダウンロード実行 */
  onDownload: () => void;
  /** 書き出し中止 / 生成済み動画を解除して編集に戻る */
  onExitToEdit: () => void;
}

const ExportStatusModal: React.FC<ExportStatusModalProps> = ({
  isOpen,
  mode,
  contentMode,
  exportPhase,
  progressPct,
  elapsedSec,
  stageHeadline,
  statusDescription,
  exportExt,
  outputSizeLabel,
  durationLabel,
  previewCanvasRef,
  canvasWidth = 1280,
  canvasHeight = 720,
  showLivePreview = true,
  onDownload,
  onExitToEdit,
}) => {
  const monitorCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [confirmingExitWithoutDownload, setConfirmingExitWithoutDownload] = useState(false);

  useDisableBodyScroll(isOpen);

  // モーダルが閉じたときや次の書き出し開始時に、ダウンロード済み・確認状態を必ずリセットする
  useEffect(() => {
    if (!isOpen || mode !== 'complete') {
      setHasDownloaded(false);
      setConfirmingExitWithoutDownload(false);
    }
  }, [isOpen, mode]);

  const handleDownloadClick = () => {
    setHasDownloaded(true);
    setConfirmingExitWithoutDownload(false);
    onDownload();
  };

  const handleRequestExitFromComplete = () => {
    if (hasDownloaded) {
      onExitToEdit();
      return;
    }
    setConfirmingExitWithoutDownload(true);
  };

  const safeWidth = Number.isFinite(canvasWidth) && canvasWidth > 0 ? canvasWidth : 1280;
  const safeHeight = Number.isFinite(canvasHeight) && canvasHeight > 0 ? canvasHeight : 720;
  const monitorScale = Math.min(1, LIVE_MONITOR_MAX_SIDE / Math.max(safeWidth, safeHeight));
  const monitorWidth = Math.max(1, Math.round(safeWidth * monitorScale));
  const monitorHeight = Math.max(1, Math.round(safeHeight * monitorScale));

  // 書き出し中かつミニプレビュー有効時だけ、本番 Canvas の現在フレームを約 12.5fps で軽量コピーする。
  // 無効時は rAF・drawImage を一切走らせず、書き出し時の追加負荷を完全にゼロにする。
  useEffect(() => {
    if (!isOpen || mode !== 'processing' || !showLivePreview) return;
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return;
    }

    let rafId = 0;
    let lastDrawMs = 0;

    const copyFrame = () => {
      const target = monitorCanvasRef.current;
      const source = previewCanvasRef?.current;
      if (!target || !source || source.width <= 0 || source.height <= 0) return;
      const ctx = target.getContext('2d');
      if (!ctx) return;
      try {
        ctx.drawImage(source, 0, 0, target.width, target.height);
      } catch {
        // jsdom や未描画タイミングでの例外は無視する
      }
    };

    const tick = (now: number) => {
      if (lastDrawMs === 0 || now - lastDrawMs >= LIVE_MONITOR_INTERVAL_MS) {
        copyFrame();
        lastDrawMs = now;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    copyFrame();
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isOpen, mode, monitorHeight, monitorWidth, previewCanvasRef, showLivePreview]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const isCaptionLayer = contentMode === 'caption-layer';
  const clampedProgress = Math.max(0, Math.min(100, Number.isFinite(progressPct) ? progressPct : 0));
  const roundedProgress = exportPhase === 'finalizing' ? 100 : Math.round(clampedProgress);
  // 準備中は 0% のままにし、レンダリング開始から 0% → 100% へ素直に進むようにする
  const barWidthPercent =
    exportPhase === 'preparing'
      ? 0
      : exportPhase === 'finalizing'
        ? 100
        : clampedProgress;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-status-modal-title"
      data-testid="export-status-modal"
      className="fixed inset-0 z-[350] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div
        data-testid="export-status-modal-card"
        className={`w-full max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-gray-700/80 bg-gray-900 shadow-2xl shadow-black/75 ${
          mode === 'processing' && showLivePreview ? 'max-w-lg' : 'max-w-md'
        }`}
      >
        {mode === 'processing' ? (
          <>
            {/* ヘッダー: 書き出し中 */}
            <div className="flex items-center justify-between gap-3 border-b border-gray-800 bg-gray-850 px-4 py-3 sm:px-5 sm:py-3.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-400 animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.8)]"
                />
                <h2
                  id="export-status-modal-title"
                  className="truncate text-sm font-bold text-white md:text-base"
                >
                  {isCaptionLayer ? 'キャプション動画を書き出し中' : '動画ファイルを作成中'}
                </h2>
              </div>
              {elapsedSec >= 3 && (
                <span className="shrink-0 font-mono text-[11px] text-gray-400 tabular-nums">
                  経過 {elapsedSec}秒
                </span>
              )}
            </div>

            {/* 本文: リアルタイム映像モニター（設定ON時）＋専用進捗バー＋注意書き */}
            <div className="space-y-4 p-4 sm:p-5">
              {showLivePreview && (
                <div className="flex items-center justify-center overflow-hidden rounded-xl border border-gray-800 bg-black p-1">
                  <canvas
                    ref={monitorCanvasRef}
                    width={monitorWidth}
                    height={monitorHeight}
                    data-testid="export-modal-live-preview"
                    aria-label="書き出し中のプレビュー映像"
                    className="block max-h-[min(36vh,260px)] max-w-full w-auto h-auto rounded-lg object-contain"
                  />
                </div>
              )}

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Loader className="h-4 w-4 shrink-0 animate-spin text-blue-400" />
                    <span className="truncate text-sm font-semibold text-gray-100">
                      {stageHeadline}
                    </span>
                  </div>
                  <span
                    data-testid="export-modal-progress-percent"
                    className="shrink-0 font-mono text-base font-bold text-blue-300 tabular-nums"
                  >
                    {exportPhase === 'preparing' ? '0%' : `${roundedProgress}%`}
                  </span>
                </div>

                <div
                  role="progressbar"
                  aria-label="動画作成の進捗"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={exportPhase === 'preparing' ? 0 : roundedProgress}
                  className={`h-3 w-full overflow-hidden rounded-full bg-gray-800 ring-1 ring-white/10 ${
                    exportPhase === 'preparing' ? 'animate-pulse' : ''
                  }`}
                >
                  <div
                    className="h-full w-full origin-left rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-emerald-400 transition-transform duration-200"
                    style={{ transform: `scaleX(${barWidthPercent / 100})` }}
                  />
                </div>

                {(outputSizeLabel || durationLabel) && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-gray-400">
                    {outputSizeLabel && <span>出力サイズ: {outputSizeLabel}</span>}
                    {durationLabel && <span>長さ: {durationLabel}</span>}
                  </div>
                )}
              </div>

              {/* 画面維持の注意書き */}
              <div className="rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-rose-500/10 px-3.5 py-3 shadow-[0_6px_20px_rgba(251,146,60,0.12)]">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-amber-300/40 bg-amber-300/10">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-200" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-snug text-amber-100 md:text-sm">
                      動画作成中はこの画面のままお待ちください
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-amber-200/90 md:text-xs">
                      画面を切り替えると映像・音声が乱れます
                    </p>
                    {statusDescription && (
                      <p className="mt-1.5 text-[11px] leading-snug text-amber-100/90 md:text-xs">
                        {statusDescription}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* 中止ボタン */}
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={onExitToEdit}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-rose-500/50 bg-rose-950/40 px-6 text-sm font-semibold text-rose-200 transition hover:border-rose-400/70 hover:bg-rose-900/60 hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"
                >
                  <X className="h-4 w-4 shrink-0" />
                  中止
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* ヘッダー: 完成 */}
            <div className="flex items-center justify-between gap-3 border-b border-gray-800 bg-gray-850 px-5 py-3.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                <h2
                  id="export-status-modal-title"
                  className="truncate text-sm font-bold text-white md:text-base"
                >
                  {isCaptionLayer ? 'キャプション動画が完成しました' : '動画ファイルが完成しました'}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleRequestExitFromComplete}
                className="shrink-0 rounded-lg border border-gray-600/80 bg-gray-800/80 p-1.5 text-gray-200 transition hover:border-gray-500 hover:bg-gray-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                title="閉じて編集に戻る"
                aria-label="閉じる"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            {/* 本文: ダウンロード & 編集に戻る */}
            <div className="space-y-4 p-5">
              <div className="flex flex-col items-center text-center">
                <div className="mb-2.5 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.2)]">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium text-gray-100">
                  準備ができました。下のボタンから保存してください。
                </p>
                {(outputSizeLabel || durationLabel || exportExt) && (
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-mono text-gray-300">
                    {exportExt && (
                      <span className="rounded-md border border-gray-700 bg-gray-800 px-2 py-0.5 uppercase">
                        .{exportExt}
                      </span>
                    )}
                    {outputSizeLabel && (
                      <span className="rounded-md border border-gray-700 bg-gray-800 px-2 py-0.5">
                        {outputSizeLabel}
                      </span>
                    )}
                    {durationLabel && (
                      <span className="rounded-md border border-gray-700 bg-gray-800 px-2 py-0.5">
                        {durationLabel}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {exportExt === 'webm' && (
                <div className="flex items-start gap-2 rounded-xl border border-yellow-700/50 bg-yellow-900/30 p-3 text-xs text-yellow-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-bold">
                      {isCaptionLayer ? '透過形式について' : '重要: SNS投稿について'}
                    </p>
                    <p className="mt-0.5 leading-snug">
                      {isCaptionLayer
                        ? '透過キャプションは WebM で保存されます（MP4 / H.264 は非対応）。'
                        : 'お使いのブラウザはMP4出力に非対応のため、互換性の高いWebM形式で保存しました。'}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadClick}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-green-600 px-6 text-sm font-bold text-white shadow-lg shadow-green-600/25 transition hover:bg-green-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300/80"
                >
                  <Download className="h-4 w-4 shrink-0" /> ダウンロード (.{exportExt})
                </button>
                {confirmingExitWithoutDownload ? (
                  <div
                    data-testid="export-exit-confirm"
                    role="alert"
                    className="space-y-2.5 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3.5 text-center"
                  >
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-amber-100 md:text-sm">
                        まだ動画を保存していません。編集画面に戻りますか？
                      </p>
                      <p className="text-xs leading-relaxed text-amber-200/85">
                        編集内容はそのまま残りますが、この動画は作り直しになります。
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingExitWithoutDownload(false)}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-600 bg-gray-800 px-3 text-xs font-semibold text-gray-200 transition hover:bg-gray-700 hover:text-white md:text-sm"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={onExitToEdit}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 text-xs font-bold text-amber-100 transition hover:bg-amber-500/30 hover:text-white md:text-sm"
                      >
                        保存せずに戻る
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleRequestExitFromComplete}
                    className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-gray-600/80 bg-gray-800/90 px-6 text-sm font-semibold text-gray-200 transition hover:border-gray-400 hover:bg-gray-700 hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                  >
                    <ArrowLeft className="h-4 w-4 shrink-0" />
                    編集に戻る
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default React.memo(ExportStatusModal);
