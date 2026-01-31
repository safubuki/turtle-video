import React, { useState } from 'react';
import {
  Lock,
  Unlock,
  Plus,
  ChevronDown,
  ChevronRight,
  Type,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { Caption, CaptionSettings, CaptionPosition, CaptionSize, CaptionFontStyle } from '../../types';
import CaptionItem from '../media/CaptionItem';

interface CaptionSectionProps {
  captions: Caption[];
  settings: CaptionSettings;
  isLocked: boolean;
  totalDuration: number;
  currentTime: number;
  onToggleLock: () => void;
  onAddCaption: (text: string, startTime: number, endTime: number) => void;
  onUpdateCaption: (id: string, updates: Partial<Omit<Caption, 'id'>>) => void;
  onRemoveCaption: (id: string) => void;
  onSetEnabled: (enabled: boolean) => void;
  onSetFontSize: (size: CaptionSize) => void;
  onSetFontStyle: (style: CaptionFontStyle) => void;
  onSetPosition: (position: CaptionPosition) => void;
  onSetBulkFadeIn: (enabled: boolean) => void;
  onSetBulkFadeOut: (enabled: boolean) => void;
  onSetBulkFadeInDuration: (duration: number) => void;
  onSetBulkFadeOutDuration: (duration: number) => void;
}

/**
 * キャプションセクションコンポーネント
 */
const CaptionSection: React.FC<CaptionSectionProps> = ({
  captions,
  settings,
  isLocked,
  totalDuration,
  currentTime,
  onToggleLock,
  onAddCaption,
  onUpdateCaption,
  onRemoveCaption,
  onSetEnabled,
  onSetFontSize,
  onSetFontStyle,
  onSetPosition,
  onSetBulkFadeIn,
  onSetBulkFadeOut,
  onSetBulkFadeInDuration,
  onSetBulkFadeOutDuration,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [showStyleSettings, setShowStyleSettings] = useState(false);
  const [newText, setNewText] = useState('');

  const handleAddCaption = () => {
    if (!newText.trim()) return;

    // 現在のスライドバー位置（currentTime）から開始
    let startTime = currentTime;

    // 境界値チェック: startTimeがtotalDurationを超えないようにする
    if (startTime >= totalDuration) {
      // 動画の終わりに達している場合、最後の3秒前から開始
      startTime = Math.max(0, totalDuration - 3);
    }

    // endTimeは3秒後、ただしtotalDurationを超えない
    const endTime = Math.min(startTime + 3, totalDuration);

    // startTimeとendTimeが同じ（または逆転）にならないようにする
    if (endTime <= startTime) {
      return; // 追加できる余地がない
    }

    onAddCaption(newText.trim(), startTime, endTime);
    setNewText('');
  };

  const fontSizeOptions: { value: CaptionSize; label: string }[] = [
    { value: 'small', label: '小' },
    { value: 'medium', label: '中' },
    { value: 'large', label: '大' },
  ];

  const fontStyleOptions: { value: CaptionFontStyle; label: string }[] = [
    { value: 'gothic', label: 'ゴシック' },
    { value: 'mincho', label: '明朝' },
  ];

  const positionOptions: { value: CaptionPosition; label: string }[] = [
    { value: 'top', label: '上部' },
    { value: 'center', label: '中央' },
    { value: 'bottom', label: '下部' },
  ];

  return (
    <section className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden shadow-xl">
      {/* ヘッダー */}
      <div
        className="p-4 bg-gray-850 border-b border-gray-800 flex justify-between items-center cursor-pointer hover:bg-gray-800/50 transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h2 className="font-bold flex items-center gap-2 text-yellow-400">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="w-6 h-6 rounded-full bg-yellow-500/10 flex items-center justify-center text-xs">
            4
          </span>{' '}
          キャプション
          {captions.length > 0 && (
            <span className="text-[10px] text-yellow-300 font-normal ml-2">
              ({captions.length}件)
            </span>
          )}
        </h2>
        <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
          {/* 表示/非表示トグル */}
          <button
            onClick={() => onSetEnabled(!settings.enabled)}
            className={`p-1.5 rounded transition ${settings.enabled
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-gray-700 text-gray-400 hover:text-white'
              }`}
            title={settings.enabled ? 'キャプションを非表示' : 'キャプションを表示'}
          >
            {settings.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          {/* ロック */}
          <button
            onClick={onToggleLock}
            className={`p-1.5 rounded transition ${isLocked
              ? 'bg-red-500/20 text-red-400'
              : 'bg-gray-700 text-gray-400 hover:text-white'
              }`}
          >
            {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* コンテンツ */}
      {isOpen && (
        <div className="p-3 space-y-3">
          {/* スタイル/フェード一括設定 */}
          <div className="bg-gray-800/50 rounded-lg border border-gray-700/50">
            <button
              onClick={() => setShowStyleSettings(!showStyleSettings)}
              className="w-full p-2 flex items-center justify-between text-xs text-gray-400 hover:text-white transition"
            >
              <div className="flex items-center gap-2">
                <Type className="w-3 h-3" />
                <span>スタイル/フェード一括設定</span>
              </div>
              {showStyleSettings ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
            {showStyleSettings && (
              <div className="px-3 pb-3 space-y-3">
                {/* ■ スタイル設定 */}
                <div className="space-y-2">
                  <div className="text-[10px] text-yellow-400 font-bold border-b border-gray-700/50 pb-1">■ スタイル設定</div>
                  {/* 文字サイズ */}
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-gray-400 w-16">サイズ:</span>
                    <div className="flex gap-1">
                      {fontSizeOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => onSetFontSize(opt.value)}
                          disabled={isLocked}
                          className={`px-2 py-1 rounded transition ${settings.fontSize === opt.value
                            ? 'bg-yellow-500 text-gray-900'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            } disabled:opacity-50`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 字体 */}
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-gray-400 w-16">字体:</span>
                    <div className="flex gap-1">
                      {fontStyleOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => onSetFontStyle(opt.value)}
                          disabled={isLocked}
                          className={`px-2 py-1 rounded transition ${settings.fontStyle === opt.value
                            ? 'bg-yellow-500 text-gray-900'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            } disabled:opacity-50`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 位置 */}
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-gray-400 w-16">位置:</span>
                    <div className="flex gap-1">
                      {positionOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => onSetPosition(opt.value)}
                          disabled={isLocked}
                          className={`px-2 py-1 rounded transition ${settings.position === opt.value
                            ? 'bg-yellow-500 text-gray-900'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            } disabled:opacity-50`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {/* ■ フェード一括設定 */}
                <div className="space-y-2">
                  <div className="text-[10px] text-yellow-400 font-bold border-b border-gray-700/50 pb-1">■ フェード一括設定（個別ON優先）</div>
                  {/* フェード設定 - 1行表示 */}
                  <div className="flex items-center gap-2 text-[10px]">
                    {/* フェードイン */}
                    <label className={`flex items-center gap-1 cursor-pointer ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                      <input
                        type="checkbox"
                        checked={settings.bulkFadeIn}
                        onChange={(e) => onSetBulkFadeIn(e.target.checked)}
                        disabled={isLocked}
                        className="rounded accent-yellow-500 w-3 h-3"
                      />
                      <span>フェードイン</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={1}
                      value={settings.bulkFadeInDuration === 0.5 ? 0 : settings.bulkFadeInDuration === 1.0 ? 1 : 2}
                      onChange={(e) => {
                        const steps = [0.5, 1.0, 2.0];
                        onSetBulkFadeInDuration(steps[parseInt(e.target.value)]);
                      }}
                      disabled={isLocked || !settings.bulkFadeIn}
                      className="w-16 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
                    />
                    <span className="text-gray-400 w-8">{settings.bulkFadeInDuration}秒</span>
                    {/* フェードアウト */}
                    <label className={`flex items-center gap-1 cursor-pointer ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                      <input
                        type="checkbox"
                        checked={settings.bulkFadeOut}
                        onChange={(e) => onSetBulkFadeOut(e.target.checked)}
                        disabled={isLocked}
                        className="rounded accent-yellow-500 w-3 h-3"
                      />
                      <span>フェードアウト</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={1}
                      value={settings.bulkFadeOutDuration === 0.5 ? 0 : settings.bulkFadeOutDuration === 1.0 ? 1 : 2}
                      onChange={(e) => {
                        const steps = [0.5, 1.0, 2.0];
                        onSetBulkFadeOutDuration(steps[parseInt(e.target.value)]);
                      }}
                      disabled={isLocked || !settings.bulkFadeOut}
                      className="w-16 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
                    />
                    <span className="text-gray-400 w-8">{settings.bulkFadeOutDuration}秒</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 新規キャプション追加 */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddCaption();
              }}
              placeholder="キャプションテキストを入力..."
              disabled={isLocked}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 disabled:opacity-50"
            />
            <button
              onClick={handleAddCaption}
              disabled={isLocked || !newText.trim()}
              className="bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3 h-3" /> 追加
            </button>
          </div>

          {/* キャプション一覧 */}
          <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
            {captions.length === 0 ? (
              <div className="text-center py-4 text-gray-600 text-xs border-2 border-dashed border-gray-800 rounded">
                キャプションがありません
              </div>
            ) : (
              captions.map((caption, index) => (
                <CaptionItem
                  key={caption.id}
                  caption={caption}
                  index={index}
                  totalDuration={totalDuration}
                  currentTime={currentTime}
                  isLocked={isLocked}
                  onUpdate={onUpdateCaption}
                  onRemove={onRemoveCaption}
                />
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default React.memo(CaptionSection);
