/**
 * @file CaptionBulkAddModal.tsx
 * @author Turtle Village
 * @description 長文キャプション（歌詞・字幕）の一括入力/一括編集モーダル（standard フレーバー限定）。
 * - 1 行 = 1 キャプション。行頭の `[開始-終了]` 時間記法で行ごとの時間指定が可能。
 * - 既存キャプションがある場合は時間記法付きテキストをプリフィルし、
 *   編集して反映すると行順で既存キャプションへマージされる（個別スタイルは維持）。
 * - キャプション間の間隔（0/0.3/0.5秒）と 1 行あたりの表示秒数（0.5〜30秒）を調整できる。
 */
import React, { useMemo, useState } from 'react';
import { X, ListPlus, Minus, Plus, CircleHelp, Copy, Check } from 'lucide-react';
import type { Caption } from '../../types';
import { useDisableBodyScroll } from '../../hooks/useDisableBodyScroll';
import {
  BULK_CAPTION_DEFAULT_GAP_SEC,
  BULK_CAPTION_DURATION_MAX_SEC,
  BULK_CAPTION_DURATION_MIN_SEC,
  BULK_CAPTION_FIXED_DURATION_SEC,
  BULK_CAPTION_GAP_MAX_SEC,
  BULK_CAPTION_GAP_PRESETS_SEC,
  assignBulkCaptionIds,
  clampDuration,
  formatCaptionsAsBulkText,
  parseBulkCaptionInput,
  planBulkCaptions,
  type BulkCaptionAllocationMode,
} from '../../utils/captionBulkInput';

export interface BulkCaptionApplyItem {
  id?: string;
  text: string;
  startTime: number;
  endTime: number;
}

interface CaptionBulkAddModalProps {
  captions: Caption[];
  totalDuration: number;
  currentTime: number;
  formatTime: (seconds: number) => string;
  /** 反映（全置き換え）。id 付きは既存を更新、id なしは新規、含まれない既存は削除 */
  onApplyCaptions: (items: BulkCaptionApplyItem[]) => void;
  onClose: () => void;
}

/**
 * 外部 AI（動画/音声の音声解析ができるもの）に貼り付ける依頼プロンプト。
 * Turtle Video の時間記法で出力させることで、結果をそのまま一括入力に貼り付けられる。
 */
export const AI_CAPTION_ANALYSIS_PROMPT = `この動画（または音声）ファイルの音声を解析し、歌詞・ナレーション・セリフを聞き取って、発話タイミング付きの字幕データを作成してください。

出力形式（この形式の行だけを出力すること）:
[開始-終了] テキスト

ルール:
- 時間は 分:秒 形式で小数1桁まで（例: [00:03.0-00:07.5] こんにちは）
- 1行 = 1つの字幕。時間順に並べる
- 間奏や無音区間の行は作らない
- 説明文・前置き・コードブロック記号など、字幕行以外は一切出力しない

出力例:
[00:00.0-00:04.0] 明日はきっといい日になる
[00:04.2-00:08.0] 空を見上げて歩き出そう`;

const CaptionBulkAddModal: React.FC<CaptionBulkAddModalProps> = ({
  captions,
  totalDuration,
  currentTime,
  formatTime,
  onApplyCaptions,
  onClose,
}) => {
  useDisableBodyScroll(true);

  const isEditing = captions.length > 0;
  const [text, setText] = useState(() => (isEditing ? formatCaptionsAsBulkText(captions) : ''));
  const [mode, setMode] = useState<BulkCaptionAllocationMode>('even');
  const [fromCurrent, setFromCurrent] = useState(false);
  const [gapSec, setGapSec] = useState<number>(BULK_CAPTION_DEFAULT_GAP_SEC);
  const [fixedDuration, setFixedDuration] = useState<number>(BULK_CAPTION_FIXED_DURATION_SEC);
  const [showFormatHelp, setShowFormatHelp] = useState(false);
  const [isCustomGap, setIsCustomGap] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const handleCopyAiPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_CAPTION_ANALYSIS_PROMPT);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      // clipboard 不可の環境ではプロンプト全文をヘルプに表示済みのため黙って握りつぶす
    }
  };

  const lines = useMemo(() => parseBulkCaptionInput(text), [text]);
  const hasExplicitTimes = lines.some((line) => line.explicitStart !== undefined);
  const startTime = fromCurrent ? currentTime : 0;
  const plans = useMemo(
    () => planBulkCaptions(lines, mode, {
      startTime,
      totalDuration,
      fixedDurationSec: fixedDuration,
      gapSec,
    }),
    [lines, mode, startTime, totalDuration, fixedDuration, gapSec],
  );
  const droppedCount = lines.length - plans.length;

  const handleApply = () => {
    if (plans.length === 0) return;
    // 未編集行をアンカーに既存キャプションの id を引き継ぐ（個別スタイル維持）。
    // 単純な行番号マッチングだと行削除で以降のスタイルが 1 つ隣へずれる。
    onApplyCaptions(assignBulkCaptionIds(plans, captions));
    onClose();
  };

  const stepDuration = (delta: number) => {
    setFixedDuration((prev) => clampDuration(Math.round((prev + delta) * 2) / 2));
  };

  const segButtonClass = (selected: boolean) =>
    `flex-1 py-1.5 rounded-lg text-xs md:text-sm transition ${selected
      ? 'bg-yellow-500 text-gray-900 font-semibold'
      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    }`;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-[300] md:p-4">
      {/* 誤操作防止のため、モーダル外のクリック/ドロップでは閉じない（× かキャンセルで閉じる） */}
      <div className="bg-gray-900 rounded-t-2xl md:rounded-2xl border border-gray-700 w-full md:max-w-lg shadow-2xl max-h-[92vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
          <h2 className="text-sm md:text-base font-bold flex items-center gap-2 text-yellow-400">
            <ListPlus className="w-4 h-4" /> {isEditing ? 'キャプションをまとめて編集' : 'キャプションをまとめて入力'}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded-lg transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar">
          <div className="text-[10px] md:text-xs text-gray-400 flex items-start gap-1.5">
            <span>
              <span className="text-yellow-300">1 行が 1 キャプション</span>です（空行は無視）。
              {isEditing
                ? ' 行の追加・削除・文言や時間の変更がそのままキャプションに反映されます。'
                : ' 歌詞や字幕を貼り付けてください。'}
            </span>
            <button
              onClick={() => setShowFormatHelp((prev) => !prev)}
              className="p-0.5 rounded text-blue-300 hover:text-blue-200 shrink-0"
              title="時間指定フォーマットの説明"
            >
              <CircleHelp className="w-3.5 h-3.5" />
            </button>
          </div>

          {showFormatHelp && (
            <div className="text-[10px] md:text-xs text-gray-300 bg-gray-900 border border-amber-500/50 rounded-xl p-3 space-y-1.5 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-amber-200 font-semibold flex items-center gap-1">
                  <CircleHelp className="w-3.5 h-3.5" /> 時間指定と AI 連携の使い方
                </span>
                <button
                  onClick={() => setShowFormatHelp(false)}
                  className="p-1 rounded-lg border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 transition"
                  aria-label="ヘルプを閉じる"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-yellow-300 font-semibold">行ごとの時間指定（任意）</div>
              <div>
                行頭（または行末）に <code className="bg-gray-700 px-1 rounded">[開始-終了]</code> を付けると、その時間で配置されます:
              </div>
              <code className="block bg-gray-950 rounded px-2 py-1 text-emerald-300">
                [00:03.0-00:07.5] 明日はいい日になるさ
              </code>
              <div>
                時間は「分:秒」または「秒」。時間なしの行は前の行に続けて自動配置。
                本文中の記号（@ や [ ]）は自由に使えます。行末に付けることもできます。
              </div>
              <div>
                本文中の <code className="bg-gray-700 px-1 rounded">⏎</code> は「時分割カード」の行区切りです。
                1 枚のカード内で ⏎ 区切りの文が表示時間を分け合い、1 行ずつ順番に表示されます。
              </div>
              <div className="pt-1 border-t border-gray-700/60 space-y-1">
                <div className="text-yellow-300 font-semibold">AI に音声解析させて字幕を作る</div>
                <div>
                  動画/音声を扱える AI にファイルと下のプロンプトを渡すと、この形式で字幕が返ってくるので、
                  そのまま上の入力欄へ貼り付けられます。
                </div>
                <textarea
                  readOnly
                  value={AI_CAPTION_ANALYSIS_PROMPT}
                  rows={3}
                  className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-[9px] text-gray-400 resize-y focus:outline-none"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  onClick={handleCopyAiPrompt}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition ${promptCopied
                    ? 'bg-emerald-700 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    }`}
                >
                  {promptCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {promptCopied ? 'コピーしました' : 'プロンプトをコピー'}
                </button>
              </div>
            </div>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'例:\n夜空に浮かぶ\n小さな星たちが\n[00:10-00:15] そっと瞬いた'}
            rows={7}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 resize-y font-mono"
          />

          {/* 割付方法（時間記法がある行はそのまま使われる） */}
          <div className="space-y-2">
            <div className="text-[10px] md:text-xs text-gray-400">
              時間なしの行の割り付け
              {hasExplicitTimes && (
                <span className="text-gray-500 ml-1">（[時間] 付きの行はその時間を使用）</span>
              )}
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => setMode('even')} className={segButtonClass(mode === 'even')}>
                均等割り
              </button>
              <button onClick={() => setMode('fixed')} className={segButtonClass(mode === 'fixed')}>
                固定（{fixedDuration}秒/行）
              </button>
            </div>

            {/* 1 行あたりの表示時間（ステッパー + 直接入力） */}
            <div className="flex items-center gap-2 text-[10px] md:text-xs">
              <span className="text-gray-400 w-24 shrink-0 leading-tight">
                1行あたりの
                <br />
                表示時間
              </span>
              <button
                onClick={() => stepDuration(-0.5)}
                className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 flex items-center justify-center transition"
                aria-label="表示時間を0.5秒減らす"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="number"
                min={BULK_CAPTION_DURATION_MIN_SEC}
                max={BULK_CAPTION_DURATION_MAX_SEC}
                step={0.5}
                value={fixedDuration}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!Number.isNaN(val)) setFixedDuration(clampDuration(val));
                }}
                className="w-16 h-8 bg-gray-800 border border-gray-700 rounded-lg px-1 text-center text-sm focus:outline-none focus:border-yellow-500"
              />
              <span className="text-gray-500">秒</span>
              <button
                onClick={() => stepDuration(0.5)}
                className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 flex items-center justify-center transition"
                aria-label="表示時間を0.5秒増やす"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* キャプション間の間隔: なし / 200ms / カスタム */}
            <div className="flex items-center gap-2 text-[10px] md:text-xs">
              <span className="text-gray-400 w-24 shrink-0 leading-tight">
                キャプション
                <br />
                の間隔
              </span>
              <div className="flex gap-1.5 flex-1 items-center">
                {BULK_CAPTION_GAP_PRESETS_SEC.map((gap) => (
                  <button
                    key={gap}
                    onClick={() => {
                      setIsCustomGap(false);
                      setGapSec(gap);
                    }}
                    className={segButtonClass(!isCustomGap && gapSec === gap)}
                  >
                    {gap === 0 ? 'なし' : `${Math.round(gap * 1000)}ms`}
                  </button>
                ))}
                <button
                  onClick={() => setIsCustomGap(true)}
                  className={segButtonClass(isCustomGap)}
                >
                  カスタム
                </button>
                {isCustomGap && (
                  <>
                    <input
                      type="number"
                      min={0}
                      max={BULK_CAPTION_GAP_MAX_SEC}
                      step={0.1}
                      value={gapSec}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val)) {
                          setGapSec(Math.max(0, Math.min(BULK_CAPTION_GAP_MAX_SEC, val)));
                        }
                      }}
                      className="w-14 h-8 bg-gray-800 border border-gray-700 rounded-lg px-1 text-center text-sm focus:outline-none focus:border-yellow-500"
                    />
                    <span className="text-gray-500 shrink-0">秒</span>
                  </>
                )}
              </div>
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
                    ※ 動画の長さに収まらない {droppedCount} 行は反映されません
                  </span>
                )}
              </div>
              <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-1 bg-gray-800/50 rounded-lg p-2 border border-gray-700/50">
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

          {isEditing && (
            <p className="text-[10px] text-amber-400/90">
              ※ 反映すると現在の {captions.length} 件が上記の内容に置き換わります
              （同じ行位置のキャプションは個別スタイルを引き継ぎます）
            </p>
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
            onClick={handleApply}
            disabled={plans.length === 0}
            className="flex-1 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white text-xs md:text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {plans.length}件を{isEditing ? '反映' : '追加'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CaptionBulkAddModal;
