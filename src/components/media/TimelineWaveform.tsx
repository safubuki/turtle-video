/**
 * @file TimelineWaveform.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description プレビューのシークバー直下に、プロジェクト全体の音量波形と無音区間を表示し、
 * 波形上のクリック／タップでシーク、無音区間の境界へのジャンプを行うコンポーネント（Issue #217）。
 *
 * 時間軸はシークバーと完全に一致させる：
 * 幅 100% のコンテナを左右パディングなしで使い、時刻 t の横位置を常に `t / totalDuration * 幅` で決める。
 * シークバー側も同じ規約（`(currentTime / totalDuration) * 100%`）なので、
 * 画面幅が変わっても両者の左端・右端・現在位置は上下で一直線に揃う。
 *
 * 無音検出は既存のナレーション時分割と同じロジック（detectSilenceSplitPoints）を共有する。
 * この段階ではキャプション時間を自動変更しない（現在位置を動かすだけ）。
 *
 * 波形データ（useTimelineWaveform の結果）は呼び出し側から受け取る。
 * キャプションのタイミング打ちバーにも同じ無音区間で移動するボタンがあり、
 * 両者が同じ検出結果を使う必要があるため、フックは TurtleVideo 側で 1 度だけ呼ぶ。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsLeft, ChevronsRight, AudioLines } from 'lucide-react';
import type { TimelineWaveformData } from '../../hooks/useTimelineWaveform';
import {
  findAdjacentSilenceBoundary,
  type SilenceSourceTarget,
} from '../../utils/timelineWaveform';

interface TimelineWaveformProps {
  /** 波形データ（TurtleVideo が useTimelineWaveform で生成したもの） */
  waveform: TimelineWaveformData;
  /** プロジェクト全体の長さ（秒）。シークバーの max と同じ値を渡すこと */
  totalDuration: number;
  /** 現在の再生位置（秒） */
  currentTime: number;
  /** 波形の表示を有効にするか（iOS Safari や素材ゼロのときは false） */
  enabled: boolean;
  /** 操作を受け付けないか（書き出し中など） */
  disabled: boolean;
  /** 波形上の位置へシークする */
  onSeek: (time: number) => void;
}

const WAVE_HEIGHT = 48;

export const SILENCE_SOURCE_LABEL: Record<SilenceSourceTarget, string> = {
  narration: 'ナレーション',
  bgm: 'BGM',
  video: '動画音声',
  all: '全体音声',
};

const NAV_BUTTON_CLASS =
  'flex min-h-8 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2 text-[10px] text-gray-200 transition hover:border-amber-500/60 hover:text-amber-100 disabled:opacity-30 disabled:hover:border-gray-700 disabled:hover:text-gray-200 md:text-xs';

const TimelineWaveform: React.FC<TimelineWaveformProps> = ({
  waveform,
  totalDuration,
  currentTime,
  enabled,
  disabled,
  onSeek,
}) => {
  const { status, peaks, silences, resolvedSilenceSource } = waveform;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // コンテナ幅を監視する。シークバーと同じ親幅から算出するため、
  // 画面幅の変更やスマートフォン表示でも両者の横位置がずれない。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [status]);

  const duration = totalDuration > 0 ? totalDuration : 0;

  const timeToX = useCallback(
    (time: number): number => {
      if (duration <= 0 || width <= 0) return 0;
      return (Math.max(0, Math.min(duration, time)) / duration) * width;
    },
    [duration, width],
  );

  // 波形本体と無音区間の帯を描画する。現在位置マーカーは DOM 側に置き、
  // 再生中に canvas 全体を描き直さずに済むようにする（長尺でも軽い）。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || width <= 0 || duration <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(WAVE_HEIGHT * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, WAVE_HEIGHT);

    const mid = WAVE_HEIGHT / 2;

    // 背景
    ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
    ctx.fillRect(0, 0, width, WAVE_HEIGHT);

    // 無音区間の帯（音のある区間と見分けられるようにする）
    ctx.fillStyle = 'rgba(251, 191, 36, 0.14)';
    for (const region of silences) {
      const x = timeToX(region.silenceStart);
      const w = Math.max(1, timeToX(region.silenceEnd) - x);
      ctx.fillRect(x, 0, w, WAVE_HEIGHT);
    }

    // 無音区間の境界線（開始・終了位置を明示する）
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
    ctx.lineWidth = 1;
    for (const region of silences) {
      for (const t of [region.silenceStart, region.silenceEnd]) {
        const x = Math.round(timeToX(t)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, WAVE_HEIGHT);
        ctx.stroke();
      }
    }

    // 波形の棒（振幅は sqrt で小音量も視認できるようにする）
    const bucketCount = peaks.length;
    const barWidth = width / bucketCount;
    ctx.fillStyle = 'rgba(96, 165, 250, 0.9)';
    for (let b = 0; b < bucketCount; b++) {
      const amp = Math.min(1, Math.sqrt(peaks[b]));
      const h = Math.max(0.5, amp * (mid - 1));
      ctx.fillRect(b * barWidth, mid - h, Math.max(0.5, barWidth - 0.3), h * 2);
    }

    // 中心線
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, mid + 0.5);
    ctx.lineTo(width, mid + 0.5);
    ctx.stroke();
  }, [peaks, silences, width, duration, timeToX]);

  /** 波形上の x 座標を時刻へ変換してシークする（シークバーと同じ 0〜幅 の対応）。 */
  const seekFromClientX = useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el || duration <= 0) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(ratio * duration);
    },
    [duration, onSeek],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      seekFromClientX(e.clientX);
    },
    [disabled, seekFromClientX],
  );

  // 移動候補には無音区間の開始・終了に加えて、動画の先頭（0秒）・末尾が含まれる。
  const prevBoundary = useMemo(
    () => findAdjacentSilenceBoundary(silences, currentTime, 'prev', duration),
    [silences, currentTime, duration],
  );
  const nextBoundary = useMemo(
    () => findAdjacentSilenceBoundary(silences, currentTime, 'next', duration),
    [silences, currentTime, duration],
  );

  if (!enabled) return null;

  // 素材が無い / デコード不能（対応外コーデック等）。
  // 従来どおりシークバーだけで操作できるので、静かに何も出さない。
  if (status === 'error' || (status === 'idle' && !peaks)) return null;

  if (!peaks) {
    return (
      <div className="mt-1 py-1 text-center text-[10px] text-gray-500">音量波形を解析中…</div>
    );
  }

  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const hasSilences = silences.length > 0;

  return (
    <div className="mt-1.5 space-y-1.5">
      {/* 波形。シークバーと同じ親幅・左右パディングなしで、時間軸を完全に一致させる。 */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        role="presentation"
        className={`relative w-full select-none overflow-hidden rounded ${
          disabled ? 'cursor-default opacity-60' : 'cursor-pointer'
        }`}
        style={{ height: WAVE_HEIGHT }}
        title="波形をタップするとその位置へ移動します"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full"
          style={{ height: WAVE_HEIGHT }}
        />
        {/* 現在位置マーカー。シークバーのつまみと同じ百分率なので上下で一直線に揃う。 */}
        <div
          className="pointer-events-none absolute top-0 z-10 h-full w-px bg-white/90 shadow-[0_0_4px_rgba(255,255,255,0.7)]"
          style={{ left: `${currentPercent}%` }}
        />
        {status === 'loading' && (
          <div className="pointer-events-none absolute right-1 top-1 rounded bg-gray-900/80 px-1.5 py-0.5 text-[9px] text-gray-300">
            解析中…
          </div>
        )}
      </div>

      {/* 無音区間ナビゲーション。移動はプレビュー位置だけを変え、キャプション時間は変更しない。 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-[10px] text-gray-400 md:text-xs">
          <AudioLines className="h-3.5 w-3.5 text-blue-300" />
          無音区間
          <span className="text-gray-500">
            （{SILENCE_SOURCE_LABEL[resolvedSilenceSource]}基準・{silences.length}件）
          </span>
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => prevBoundary !== null && onSeek(prevBoundary)}
            disabled={disabled || prevBoundary === null}
            className={NAV_BUTTON_CLASS}
            title="前の無音区間の境界（動画の先頭を含む）へ移動"
            aria-label="無音区間：前へ"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
            無音区間：前へ
          </button>
          <button
            type="button"
            onClick={() => nextBoundary !== null && onSeek(nextBoundary)}
            disabled={disabled || nextBoundary === null}
            className={NAV_BUTTON_CLASS}
            title="次の無音区間の境界（動画の末尾を含む）へ移動"
            aria-label="無音区間：次へ"
          >
            無音区間：次へ
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {!hasSilences && status === 'ready' && (
          <span className="text-[10px] text-gray-500">
            無音区間は検出されていません（先頭・末尾へは移動できます）
          </span>
        )}
      </div>
    </div>
  );
};

export default React.memo(TimelineWaveform);
