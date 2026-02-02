/**
 * @file PreviewSection.tsx
 * @author Turtle Village
 * @description 編集中の動画をリアルタイムでプレビュー再生、シーク、およびファイルへの書き出しを行うセクションコンポーネント。
 */
import React, { RefObject } from 'react';
import {
  Play,
  Pause,
  Square,
  Download,
  Loader,
  RotateCcw,
  MonitorPlay,
  AlertCircle,

} from 'lucide-react';
import type { MediaItem, AudioTrack } from '../../types';

interface PreviewSectionProps {
  mediaItems: MediaItem[];
  bgm: AudioTrack | null;
  narration: AudioTrack | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  isProcessing: boolean;
  isLoading: boolean;  // リソース読み込み中フラグ
  exportUrl: string | null;
  exportExt: string | null;
  onSeekChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSeekEnd: () => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onExport: () => void;
  onClearAll: () => void;

  formatTime: (seconds: number) => string;
}

/**
 * プレビューセクションコンポーネント
 */
const PreviewSection: React.FC<PreviewSectionProps> = ({
  mediaItems,
  bgm,
  narration,
  canvasRef,
  currentTime,
  totalDuration,
  isPlaying,
  isProcessing,
  isLoading,
  exportUrl,
  exportExt,
  onSeekChange,
  onSeekEnd,
  onTogglePlay,
  onStop,
  onExport,
  onClearAll,

  formatTime,
}) => {
  return (
    <section className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden shadow-xl">
      <div className="p-3 border-b border-gray-800 bg-gray-850 flex items-center justify-between">
        <h2 className="font-bold flex items-center gap-2 text-green-400">
          <span className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center text-xs">
            5
          </span>{' '}
          プレビュー
        </h2>
        <div className="flex items-center gap-2">

          {isProcessing && (
            <span className="text-[10px] text-green-400 font-mono animate-pulse bg-green-900/30 px-2 py-0.5 rounded">
              REC ●
            </span>
          )}
        </div>
      </div>
      <div className="relative aspect-video bg-black w-full group">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="w-full h-full object-contain"
        />
        {mediaItems.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <MonitorPlay className="w-12 h-12 text-gray-800" />
          </div>
        )}
        {/* ローディングオーバーレイ */}
        {isLoading && mediaItems.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <div className="flex flex-col items-center gap-2">
              <Loader className="w-8 h-8 text-blue-400 animate-spin" />
              <span className="text-xs text-gray-300">読み込み中...</span>
            </div>
          </div>
        )}
        {!isPlaying && !isProcessing && !isLoading && mediaItems.length > 0 && (
          <button
            onClick={onTogglePlay}
            className="absolute inset-0 m-auto w-14 h-14 bg-white/20 hover:bg-white/30 backdrop-blur rounded-full flex items-center justify-center text-white transition-transform active:scale-95"
          >
            <Play className="w-6 h-6 fill-current ml-1" />
          </button>
        )}
      </div>
      <div className="p-4 bg-gray-900 border-t border-gray-800">
        <div className="flex justify-between text-[10px] font-mono text-gray-400 mb-2">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
        <div className="relative h-8 w-full select-none">
          <div className="absolute top-3 w-full h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className="flex w-full h-full opacity-60">
              {mediaItems.map((v, i) => (
                <div
                  key={v.id}
                  style={{ width: `${(v.duration / totalDuration) * 100}%` }}
                  className={
                    v.type === 'image'
                      ? 'bg-yellow-600'
                      : i % 2 === 0
                        ? 'bg-blue-600'
                        : 'bg-blue-500'
                  }
                />
              ))}
            </div>
          </div>
          <input
            type="range"
            min="0"
            max={totalDuration || 0.1}
            step="0.1"
            value={currentTime}
            onChange={onSeekChange}
            onMouseUp={onSeekEnd}
            onTouchEnd={onSeekEnd}
            className="absolute top-0 w-full h-full opacity-0 cursor-pointer z-10"
            disabled={mediaItems.length === 0 || isProcessing}
          />
          <div
            className="absolute top-1.5 w-5 h-5 bg-white shadow-lg rounded-full pointer-events-none z-0 border-2 border-gray-200"
            style={{ left: `calc(${(currentTime / (totalDuration || 1)) * 100}% - 10px)` }}
          />
        </div>
        <div className="mt-4 flex justify-center gap-4 border-b border-gray-800 pb-6">
          <button
            onClick={onStop}
            disabled={mediaItems.length === 0 || isLoading}
            className="p-3 rounded-full bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition shadow-lg disabled:opacity-50"
          >
            <Square className="w-5 h-5 fill-current" />
          </button>
          <button
            onClick={onTogglePlay}
            disabled={mediaItems.length === 0 || isLoading}
            className={`p-3 rounded-full transition shadow-lg ${isLoading ? 'bg-gray-700 text-gray-400 cursor-wait' : isPlaying ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
          >
            {isLoading ? <Loader className="w-5 h-5 animate-spin" /> : isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>
        </div>
        <div className="mt-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={onClearAll}
              disabled={mediaItems.length === 0 && !bgm && !narration}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-red-900/20 hover:text-red-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-4 h-4" /> 一括クリア
            </button>
            {exportUrl ? (
              <a
                href={exportUrl}
                download={`turtle_video_${Date.now()}.${exportExt}`}
                className="bg-green-600 hover:bg-green-500 text-white px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 animate-bounce-short shadow-lg"
              >
                <Download className="w-4 h-4" /> 保存 (.{exportExt})
              </a>
            ) : (
              <button
                onClick={onExport}
                disabled={isProcessing || mediaItems.length === 0}
                className={`flex-1 max-w-xs flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold shadow-lg transition ${isProcessing ? 'bg-gray-700 text-gray-400 cursor-wait' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'}`}
              >
                {isProcessing ? (
                  <Loader className="animate-spin w-4 h-4" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isProcessing ? '書き出し中...' : '書き出す'}
              </button>
            )}
          </div>
          {exportUrl && exportExt === 'webm' && (
            <div className="bg-yellow-900/30 border border-yellow-700/50 p-3 rounded-lg flex items-start gap-2 text-xs text-yellow-200">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">重要: SNS投稿について</p>
                <p>
                  お使いのブラウザはMP4出力に非対応のため、互換性の高いWebM形式で保存しました。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default React.memo(PreviewSection);
