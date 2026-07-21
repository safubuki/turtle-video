/**
 * @file NarrationWaveform.tsx
 * @author Turtle Village
 * @description ナレーション音声の静的な音量波形を表示し、トリム範囲を ⇔ カーソルで可視化し、
 * 無音区間（文の区切り）の自動検出候補をタップして「トリム開始/終了」に反映できるコンポーネント。
 *
 * standard フレーバー（Android/PC）専用。呼び出し側が enabled を制御する（パネル開時のみ true）。
 * デコード失敗時（status='error'）は波形を出さず、従来のスライダー UI だけが残る（本コンポーネントは何も描かない）。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NarrationClip } from '../../types';
import { useNarrationWaveform } from '../../hooks/useNarrationWaveform';
import type { SilenceSplitPoint } from '../../utils/audioWaveform';

interface NarrationWaveformProps {
  clip: NarrationClip;
  /** 波形計算・描画を有効にするか（トリムパネルが開いているときだけ true にする） */
  enabled: boolean;
  disabled: boolean;
  trimStart: number;
  trimEnd: number;
  /** 音源内の絶対秒数でトリム開始を設定する */
  onSetTrimStart: (value: number) => void;
  /** 音源内の絶対秒数でトリム終了を設定する */
  onSetTrimEnd: (value: number) => void;
  formatTime: (seconds: number) => string;
}

const WAVE_HEIGHT = 72;

const NarrationWaveform: React.FC<NarrationWaveformProps> = ({
  clip,
  enabled,
  disabled,
  trimStart,
  trimEnd,
  onSetTrimStart,
  onSetTrimEnd,
  formatTime,
}) => {
  const { status, peaks, splitPoints, decodedDuration } = useNarrationWaveform(clip, enabled);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [selectedCandidate, setSelectedCandidate] = useState<SilenceSplitPoint | null>(null);

  // 波形の基準にする長さ。デコード長を優先し、無ければクリップ長。
  const duration = decodedDuration > 0 ? decodedDuration : Math.max(0, clip.duration);

  // コンテナ幅を監視（レスポンシブに canvas を再描画）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [status]);

  const timeToX = useCallback(
    (time: number): number => {
      if (duration <= 0 || width <= 0) return 0;
      return (Math.max(0, Math.min(duration, time)) / duration) * width;
    },
    [duration, width],
  );

  // 波形とトリム範囲・カーソルを Canvas に描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || status !== 'ready' || !peaks || width <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(WAVE_HEIGHT * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, WAVE_HEIGHT);

    const mid = WAVE_HEIGHT / 2;
    const startX = timeToX(trimStart);
    const endX = timeToX(trimEnd);

    // トリム範囲の外（カット部分）は暗く、内側はハイライト背景
    ctx.fillStyle = 'rgba(30, 27, 75, 0.35)';
    ctx.fillRect(0, 0, width, WAVE_HEIGHT);
    ctx.fillStyle = 'rgba(99, 102, 241, 0.12)';
    ctx.fillRect(startX, 0, Math.max(0, endX - startX), WAVE_HEIGHT);

    // 波形の棒。トリム範囲内はインディゴ、外はグレーで「使わない部分」を示す。
    const bucketCount = peaks.length;
    const barWidth = width / bucketCount;
    for (let b = 0; b < bucketCount; b++) {
      const x = b * barWidth;
      const centerTime = ((b + 0.5) / bucketCount) * duration;
      const inTrim = centerTime >= trimStart && centerTime <= trimEnd;
      // 振幅を見やすく（sqrt で小音量も視認可能に）
      const amp = Math.min(1, Math.sqrt(peaks[b]));
      const h = Math.max(1, amp * (mid - 2));
      ctx.fillStyle = inTrim ? 'rgba(129, 140, 248, 0.95)' : 'rgba(100, 116, 139, 0.5)';
      ctx.fillRect(x, mid - h, Math.max(0.5, barWidth - 0.5), h * 2);
    }

    // 無音候補の縦線（薄いアンバー）
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
    ctx.lineWidth = 1;
    for (const sp of splitPoints) {
      const x = timeToX(sp.time);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WAVE_HEIGHT);
      ctx.stroke();
    }

    // トリム開始/終了カーソル（⇔ の縦線）
    const drawCursor = (x: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WAVE_HEIGHT);
      ctx.stroke();
    };
    drawCursor(startX, 'rgba(52, 211, 153, 0.95)');
    drawCursor(endX, 'rgba(248, 113, 113, 0.95)');
  }, [status, peaks, splitPoints, width, duration, trimStart, trimEnd, timeToX]);

  const candidatePercents = useMemo(
    () =>
      splitPoints.map((sp) => ({
        sp,
        percent: duration > 0 ? (sp.time / duration) * 100 : 0,
      })),
    [splitPoints, duration],
  );

  if (!enabled) return null;

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="text-[10px] text-gray-500 py-2 text-center">音量波形を解析中…</div>
    );
  }

  // デコード不可（対応外コーデック等）。従来のスライダーだけで操作できるので静かに何も出さない。
  if (status === 'error' || !peaks) {
    return null;
  }

  const startPercent = duration > 0 ? (trimStart / duration) * 100 : 0;
  const endPercent = duration > 0 ? (trimEnd / duration) * 100 : 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400/70" />
          無音の区切り（{splitPoints.length}件）をタップで反映
        </span>
        <span className="text-gray-500">音量波形</span>
      </div>

      <div ref={containerRef} className="relative w-full select-none" style={{ height: WAVE_HEIGHT }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full rounded"
          style={{ height: WAVE_HEIGHT }}
        />

        {/* トリム範囲の ⇔ ラベル（開始・終了） */}
        <div
          className="pointer-events-none absolute -top-0.5 z-10 -translate-x-1/2 text-[9px] font-mono text-emerald-300"
          style={{ left: `${startPercent}%` }}
        >
          ⇤
        </div>
        <div
          className="pointer-events-none absolute -top-0.5 z-10 -translate-x-1/2 text-[9px] font-mono text-red-300"
          style={{ left: `${endPercent}%` }}
        >
          ⇥
        </div>

        {/* 無音候補のクリック可能マーカー（縦線の当たり判定を広げる透明ボタン） */}
        {!disabled &&
          candidatePercents.map(({ sp, percent }, idx) => (
            <button
              key={`${idx}-${sp.time.toFixed(3)}`}
              type="button"
              onClick={() => setSelectedCandidate((cur) => (cur === sp ? null : sp))}
              className="absolute top-0 z-20 h-full w-3 -translate-x-1/2 cursor-pointer bg-transparent"
              style={{ left: `${percent}%` }}
              title={`無音: ${formatTime(sp.time)}（間 ${sp.duration.toFixed(2)}秒）`}
              aria-label={`無音区切り ${formatTime(sp.time)} を選択`}
            />
          ))}
      </div>

      {/* 選択した候補を開始/終了どちらへ反映するか選ぶ小パネル */}
      {selectedCandidate && !disabled && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] md:text-xs">
          <span className="text-amber-200">
            区切り {formatTime(selectedCandidate.time)}
          </span>
          <span className="text-gray-400">をトリム</span>
          <button
            type="button"
            onClick={() => {
              onSetTrimStart(selectedCandidate.time);
              setSelectedCandidate(null);
            }}
            className="min-h-8 px-2 rounded-md bg-emerald-700/70 hover:bg-emerald-600 text-white transition"
          >
            開始に
          </button>
          <button
            type="button"
            onClick={() => {
              onSetTrimEnd(selectedCandidate.time);
              setSelectedCandidate(null);
            }}
            className="min-h-8 px-2 rounded-md bg-red-700/60 hover:bg-red-600 text-white transition"
          >
            終了に
          </button>
          <button
            type="button"
            onClick={() => setSelectedCandidate(null)}
            className="ml-auto text-gray-400 hover:text-white transition"
            aria-label="選択を閉じる"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default React.memo(NarrationWaveform);
