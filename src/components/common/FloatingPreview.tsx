/**
 * @file FloatingPreview.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 既存のプレビューCanvasと再生操作を共有するモバイル用追従パネル。
 */
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader, Pause, Play, RotateCcw, RotateCw, Square, X } from 'lucide-react';
import { formatTimeCentiseconds } from '../../utils/format';
import PreviewSeekSlider from './PreviewSeekSlider';

interface FloatingPreviewProps {
  canvasHostRef: React.RefObject<HTMLDivElement | null>;
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  isLoading: boolean;
  bottomOffset: number;
  focusOnMount: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onSeekBy: (seconds: number) => void;
  onSeekChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
  onClose: () => void;
}

const BUTTON =
  'h-11 min-w-11 rounded-xl border border-gray-600 bg-gray-800 text-gray-100 flex items-center justify-center gap-1 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300';

/** 表示と操作だけ。映像／音声要素や独自の描画時計は持たない。 */
const FloatingPreview: React.FC<FloatingPreviewProps> = ({
  canvasHostRef,
  currentTime,
  totalDuration,
  isPlaying,
  isLoading,
  bottomOffset,
  focusOnMount,
  onTogglePlay,
  onStop,
  onSeekBy,
  onSeekChange,
  onSeekStart,
  onSeekEnd,
  onClose,
}) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    // スクロールによる自動復元時は、編集欄のフォーカスを維持する。
    if (focusOnMount) closeRef.current?.focus({ preventScroll: true });
  }, [focusOnMount]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [onClose]);

  return createPortal(
    <aside
      className="floating-preview-panel rounded-2xl border-2 border-blue-400/50 bg-gray-900 shadow-2xl"
      style={{ '--floating-preview-offset': `${bottomOffset}px` } as React.CSSProperties}
      aria-label="ミニプレビュー"
    >
      <div className="floating-preview-content">
        <div>
          <div className="flex items-center justify-between pl-3 pr-1 border-b border-gray-700">
            <span className="text-sm font-semibold text-blue-200">ミニプレビュー</span>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="h-11 w-11 flex items-center justify-center rounded-xl text-gray-200 focus-visible:outline-2 focus-visible:outline-blue-300"
              aria-label="ミニプレビューを閉じる"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div
            className="floating-preview-frame relative bg-black"
            ref={canvasHostRef}
            data-testid="floating-preview-canvas"
          >
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Loader className="h-6 w-6 animate-spin text-white" />
              </div>
            )}
          </div>
        </div>
        <div className="p-2">
          <div className="flex justify-between text-xs font-mono text-gray-300">
            <span>{formatTimeCentiseconds(currentTime)}</span>
            <span>{formatTimeCentiseconds(totalDuration)}</span>
          </div>
          <PreviewSeekSlider
            currentTime={currentTime}
            totalDuration={totalDuration}
            disabled={isLoading}
            onSeekChange={onSeekChange}
            onSeekStart={onSeekStart}
            onSeekEnd={onSeekEnd}
            finishOnUnmount
            ariaLabel="ミニプレビュー位置"
            className="block w-full h-11 text-blue-300"
          />
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              className={BUTTON}
              onClick={() => onSeekBy(-5)}
              disabled={isLoading || currentTime <= 0}
              aria-label="5秒戻る"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="text-xs">5</span>
            </button>
            <button
              type="button"
              className={BUTTON}
              onClick={onTogglePlay}
              disabled={isLoading}
              aria-label={isPlaying ? 'ミニプレビューを一時停止' : 'ミニプレビューを再生'}
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <button
              type="button"
              className={BUTTON}
              onClick={onStop}
              disabled={isLoading}
              aria-label="ミニプレビューを停止"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
            <button
              type="button"
              className={BUTTON}
              onClick={() => onSeekBy(5)}
              disabled={isLoading || currentTime >= totalDuration}
              aria-label="5秒進む"
            >
              <span className="text-xs">5</span>
              <RotateCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>,
    document.body
  );
};

export default React.memo(FloatingPreview);
