/**
 * @file CaptionBulkAddModal.tsx
 * @author Turtle Village
 * @description 長文キャプション（歌詞・字幕）の一括入力モーダル（standard フレーバー限定）。
 * 複数行テキストを 1 行 = 1 キャプションとして取り込み、均等割り / 固定秒で
 * 初期タイミングを自動割付する。追加前に割付結果を一覧でプレビューできる。
 */
import React, { useMemo, useState } from 'react';
import { X, ListPlus } from 'lucide-react';
import { useDisableBodyScroll } from '../../hooks/useDisableBodyScroll';
import {
  BULK_CAPTION_FIXED_DURATION_SEC,
  planBulkCaptions,
  splitCaptionLines,
  type BulkCaptionAllocationMode,
  type BulkCaptionPlan,
} from '../../utils/captionBulkInput';

interface CaptionBulkAddModalProps {
  totalDuration: number;
  currentTime: number;
  formatTime: (seconds: number) => string;
  onAddCaptions: (items: BulkCaptionPlan[]) => void;
  onClose: () => void;
}

const CaptionBulkAddModal: React.FC<CaptionBulkAddModalProps> = ({
  totalDuration,
  currentTime,
  formatTime,
  onAddCaptions,
  onClose,
}) => {
  useDisableBodyScroll(true);

  const [text, setText] = useState('');
  const [mode, setMode] = useState<BulkCaptionAllocationMode>('even');
  const [fromCurrent, setFromCurrent] = useState(false);

  const lines = useMemo(() => splitCaptionLines(text), [text]);
  const startTime = fromCurrent ? currentTime : 0;
  const plans = useMemo(
    () => planBulkCaptions(lines, mode, { startTime, totalDuration }),
    [lines, mode, startTime, totalDuration],
  );
  const droppedCount = lines.length - plans.length;

  const handleAdd = () => {
    if (plans.length === 0) return;
    onAddCaptions(plans);
    onClose();
  };

  const modeButtonClass = (selected: boolean) =>
    `flex-1 py-1.5 rounded-lg text-xs md:text-sm transition ${selected
      ? 'bg-yellow-500 text-gray-900 font-semibold'
      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    }`;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-[300] md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-t-2xl md:rounded-2xl border border-gray-700 w-full md:max-w-lg shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
          <h2 className="text-sm md:text-base font-bold flex items-center gap-2 text-yellow-400">
            <ListPlus className="w-4 h-4" /> キャプションをまとめて入力
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded-lg transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar">
          <p className="text-[10px] md:text-xs text-gray-400">
            歌詞や字幕を貼り付けてください。<span className="text-yellow-300">1 行が 1 キャプション</span>になります（空行は無視）。
            追加後は一覧やタイミング打ちで細かく調整できます。
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'例:\n夜空に浮かぶ\n小さな星たちが\nそっと瞬いた'}
            rows={6}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 resize-y"
          />

          {/* 割付方法 */}
          <div className="space-y-1.5">
            <div className="text-[10px] md:text-xs text-gray-400">タイミングの割り付け</div>
            <div className="flex gap-1.5">
              <button onClick={() => setMode('even')} className={modeButtonClass(mode === 'even')}>
                均等割り
              </button>
              <button onClick={() => setMode('fixed')} className={modeButtonClass(mode === 'fixed')}>
                {BULK_CAPTION_FIXED_DURATION_SEC}秒ずつ
              </button>
            </div>
            <label className="flex items-center gap-1.5 text-[10px] md:text-xs text-gray-300 cursor-pointer pt-0.5">
              <input
                type="checkbox"
                checked={fromCurrent}
                onChange={(e) => setFromCurrent(e.target.checked)}
                className="accent-yellow-500 rounded cursor-pointer"
              />
              <span>現在の再生位置（{formatTime(currentTime)}）から開始する</span>
            </label>
          </div>

          {/* プレビュー */}
          {plans.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] md:text-xs text-gray-400">
                割り付けプレビュー（{plans.length}件）
                {droppedCount > 0 && (
                  <span className="text-amber-400 ml-2">
                    ※ 動画の長さに収まらない {droppedCount} 行は追加されません
                  </span>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1 bg-gray-800/50 rounded-lg p-2 border border-gray-700/50">
                {plans.map((plan, index) => (
                  <div key={index} className="flex items-center gap-2 text-[10px] md:text-xs">
                    <span className="text-gray-500 font-mono w-6 shrink-0 text-right">{index + 1}</span>
                    <span className="text-gray-400 font-mono shrink-0">
                      {formatTime(plan.startTime)} - {formatTime(plan.endTime)}
                    </span>
                    <span className="text-gray-200 truncate">{plan.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex gap-2 p-4 border-t border-gray-700 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs md:text-sm transition"
          >
            キャンセル
          </button>
          <button
            onClick={handleAdd}
            disabled={plans.length === 0}
            className="flex-1 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white text-xs md:text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {plans.length}件を追加
          </button>
        </div>
      </div>
    </div>
  );
};

export default CaptionBulkAddModal;
