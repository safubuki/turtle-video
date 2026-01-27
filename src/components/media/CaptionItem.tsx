import React, { useState } from 'react';
import { Trash2, Edit2, Check, X, MapPin } from 'lucide-react';
import type { Caption } from '../../types';

interface CaptionItemProps {
  caption: Caption;
  index: number;
  totalDuration: number;
  currentTime: number;
  isLocked: boolean;
  onUpdate: (id: string, updates: Partial<Omit<Caption, 'id'>>) => void;
  onRemove: (id: string) => void;
}

/**
 * キャプションアイテムコンポーネント
 */
const CaptionItem: React.FC<CaptionItemProps> = ({
  caption,
  index,
  totalDuration,
  currentTime,
  isLocked,
  onUpdate,
  onRemove,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(caption.text);

  const handleSave = () => {
    if (editText.trim()) {
      onUpdate(caption.id, { text: editText.trim() });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditText(caption.text);
    setIsEditing(false);
  };

  // 現在時刻がこのキャプションの範囲内かどうか
  const isActive = currentTime >= caption.startTime && currentTime < caption.endTime;

  return (
    <div
      className={`p-3 rounded-lg border transition ${
        isActive
          ? 'bg-yellow-900/30 border-yellow-500/50'
          : 'bg-gray-800/50 border-gray-700/50'
      }`}
    >
      {/* ヘッダー: 番号とアクション */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 font-mono">[{index + 1}]</span>
        <div className="flex gap-1">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              disabled={isLocked}
              className="p-1 text-gray-400 hover:text-white transition disabled:opacity-50"
              title="編集"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          ) : (
            <>
              <button
                onClick={handleSave}
                className="p-1 text-green-400 hover:text-green-300 transition"
                title="保存"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={handleCancel}
                className="p-1 text-gray-400 hover:text-white transition"
                title="キャンセル"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          )}
          <button
            onClick={() => onRemove(caption.id)}
            disabled={isLocked}
            className="p-1 text-red-400 hover:text-red-300 transition disabled:opacity-50"
            title="削除"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* テキスト */}
      {isEditing ? (
        <input
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
          className="w-full bg-gray-700 border border-yellow-500 rounded px-2 py-1 text-sm text-white focus:outline-none mb-2"
          autoFocus
        />
      ) : (
        <p className="text-sm text-white mb-2 truncate" title={caption.text}>
          "{caption.text}"
        </p>
      )}

      {/* 時間設定 */}
      <div className="space-y-2">
        {/* 開始時間 */}
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-gray-400 w-8 shrink-0">開始:</span>
          <input
            type="range"
            min={0}
            max={totalDuration || 60}
            step={0.1}
            value={caption.startTime}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val) && val >= 0 && val < caption.endTime) {
                onUpdate(caption.id, { startTime: val });
              }
            }}
            disabled={isLocked}
            className="flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
          />
          <button
            onClick={() => {
              const val = Math.round(currentTime * 10) / 10;
              if (val >= 0 && val < caption.endTime) {
                onUpdate(caption.id, { startTime: val });
              }
            }}
            disabled={isLocked}
            className="p-1 text-gray-400 hover:text-yellow-400 disabled:opacity-50 disabled:hover:text-gray-400"
            title="現在位置を開始時間に設定"
          >
            <MapPin size={12} />
          </button>
          <input
            type="number"
            min={0}
            max={caption.endTime - 0.1}
            step={0.1}
            value={caption.startTime}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val) && val >= 0 && val < caption.endTime) {
                onUpdate(caption.id, { startTime: val });
              }
            }}
            disabled={isLocked}
            className="w-12 bg-gray-700 border border-gray-600 rounded px-1 text-right text-white focus:outline-none focus:border-yellow-500 disabled:opacity-50"
          />
          <span className="text-gray-500">秒</span>
        </div>

        {/* 終了時間 */}
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-gray-400 w-8 shrink-0">終了:</span>
          <input
            type="range"
            min={0}
            max={totalDuration || 60}
            step={0.1}
            value={caption.endTime}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val) && val > caption.startTime) {
                onUpdate(caption.id, { endTime: val });
              }
            }}
            disabled={isLocked}
            className="flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50"
          />
          <button
            onClick={() => {
              const val = Math.round(currentTime * 10) / 10;
              if (val > caption.startTime) {
                onUpdate(caption.id, { endTime: val });
              }
            }}
            disabled={isLocked}
            className="p-1 text-gray-400 hover:text-yellow-400 disabled:opacity-50 disabled:hover:text-gray-400"
            title="現在位置を終了時間に設定"
          >
            <MapPin size={12} />
          </button>
          <input
            type="number"
            min={caption.startTime + 0.1}
            max={totalDuration || 9999}
            step={0.1}
            value={caption.endTime}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val) && val > caption.startTime) {
                onUpdate(caption.id, { endTime: val });
              }
            }}
            disabled={isLocked}
            className="w-12 bg-gray-700 border border-gray-600 rounded px-1 text-right text-white focus:outline-none focus:border-yellow-500 disabled:opacity-50"
          />
          <span className="text-gray-500">秒</span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CaptionItem);
