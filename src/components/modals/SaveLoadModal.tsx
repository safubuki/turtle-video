/**
 * @file SaveLoadModal.tsx
 * @author Turtle Village
 * @description 保存・読み込み・削除機能を提供するモーダル。
 */

import { useEffect, useState } from 'react';
import { X, Save, FolderOpen, Trash2, Clock, AlertTriangle } from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { useMediaStore } from '../../stores/mediaStore';
import { useAudioStore } from '../../stores/audioStore';
import { useCaptionStore } from '../../stores/captionStore';
import type { SaveSlot } from '../../utils/indexedDB';

interface SaveLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (message: string, type?: 'success' | 'error') => void;
}

type ModalMode = 'menu' | 'confirmLoad' | 'confirmDelete' | 'selectSlot';

/**
 * 日時を読みやすい形式にフォーマット
 */
function formatDateTime(isoString: string | null): string {
  if (!isoString) return '---';
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // 1分未満
  if (diff < 60 * 1000) {
    return 'たった今';
  }
  // 1時間未満
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes}分前`;
  }
  // 24時間未満
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours}時間前`;
  }
  // それ以上
  return date.toLocaleDateString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SaveLoadModal({ isOpen, onClose, onToast }: SaveLoadModalProps) {
  const [mode, setMode] = useState<ModalMode>('menu');
  const [selectedSlot, setSelectedSlot] = useState<SaveSlot | null>(null);
  
  // プロジェクトストア
  const {
    isSaving,
    isLoading,
    lastAutoSave,
    lastManualSave,
    saveProjectManual,
    loadProjectFromSlot,
    deleteAllSaves,
    refreshSaveInfo,
  } = useProjectStore();
  
  // 各ストアからデータを取得
  const mediaItems = useMediaStore((s) => s.mediaItems);
  const isClipsLocked = useMediaStore((s) => s.isLocked);
  const bgm = useAudioStore((s) => s.bgm);
  const isBgmLocked = useAudioStore((s) => s.isBgmLocked);
  const narration = useAudioStore((s) => s.narration);
  const isNarrationLocked = useAudioStore((s) => s.isNarrationLocked);
  const captions = useCaptionStore((s) => s.captions);
  const captionSettings = useCaptionStore((s) => s.captionSettings);
  const isCaptionsLocked = useCaptionStore((s) => s.isLocked);
  
  // ストアへの復元用アクション
  const restoreMediaItems = useMediaStore((s) => s.restoreFromSave);
  const restoreAudio = useAudioStore((s) => s.restoreFromSave);
  const restoreCaptions = useCaptionStore((s) => s.restoreFromSave);
  
  // 現在編集中のデータがあるかどうか
  const hasCurrentData = mediaItems.length > 0 || bgm !== null || narration !== null || captions.length > 0;
  
  // 保存データがあるかどうか
  const hasAutoSave = lastAutoSave !== null;
  const hasManualSave = lastManualSave !== null;
  const hasSaveData = hasAutoSave || hasManualSave;
  
  // 初回表示時に保存情報を更新
  useEffect(() => {
    if (isOpen) {
      refreshSaveInfo();
      setMode('menu');
      setSelectedSlot(null);
    }
  }, [isOpen, refreshSaveInfo]);
  
  // 手動保存
  const handleSave = async () => {
    try {
      await saveProjectManual(
        mediaItems,
        isClipsLocked,
        bgm,
        isBgmLocked,
        narration,
        isNarrationLocked,
        captions,
        captionSettings,
        isCaptionsLocked
      );
      onToast('保存しました', 'success');
      onClose();
    } catch (error) {
      onToast('保存に失敗しました', 'error');
    }
  };
  
  // 読み込みスロット選択
  const handleLoadClick = () => {
    if (hasAutoSave && hasManualSave) {
      // 両方ある場合はスロット選択
      setMode('selectSlot');
    } else if (hasAutoSave) {
      // 自動保存のみ
      setSelectedSlot('auto');
      if (hasCurrentData) {
        setMode('confirmLoad');
      } else {
        handleLoadConfirm('auto');
      }
    } else if (hasManualSave) {
      // 手動保存のみ
      setSelectedSlot('manual');
      if (hasCurrentData) {
        setMode('confirmLoad');
      } else {
        handleLoadConfirm('manual');
      }
    }
  };
  
  // スロット選択後
  const handleSlotSelect = (slot: SaveSlot) => {
    setSelectedSlot(slot);
    if (hasCurrentData) {
      setMode('confirmLoad');
    } else {
      handleLoadConfirm(slot);
    }
  };
  
  // 読み込み確定
  const handleLoadConfirm = async (slot: SaveSlot) => {
    try {
      const data = await loadProjectFromSlot(slot);
      if (data) {
        // 各ストアに復元
        restoreMediaItems(data.mediaItems, data.isClipsLocked);
        restoreAudio(data.bgm, data.isBgmLocked, data.narration, data.isNarrationLocked);
        restoreCaptions(data.captions, data.captionSettings, data.isCaptionsLocked);
        onToast('読み込みました', 'success');
      } else {
        onToast('保存データが見つかりません', 'error');
      }
      onClose();
    } catch (error) {
      onToast('読み込みに失敗しました', 'error');
    }
  };
  
  // 削除確認
  const handleDeleteClick = () => {
    setMode('confirmDelete');
  };
  
  // 削除確定
  const handleDeleteConfirm = async () => {
    try {
      await deleteAllSaves();
      onToast('削除しました', 'success');
      onClose();
    } catch (error) {
      onToast('削除に失敗しました', 'error');
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative w-[90%] max-w-md bg-gray-900 rounded-2xl border border-gray-700 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">
            {mode === 'menu' && 'プロジェクト管理'}
            {mode === 'selectSlot' && 'どちらを読み込みますか？'}
            {mode === 'confirmLoad' && '読み込み確認'}
            {mode === 'confirmDelete' && '削除確認'}
          </h2>
          <button
            className="p-1 text-gray-400 hover:text-white transition-colors"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        
        {/* メインメニュー */}
        {mode === 'menu' && (
          <div className="space-y-4">
            {/* 保存情報 */}
            <div className="bg-gray-800 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400 flex items-center gap-1">
                  <Clock size={14} />
                  自動保存
                </span>
                <span className={hasAutoSave ? 'text-white' : 'text-gray-500'}>
                  {formatDateTime(lastAutoSave)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400 flex items-center gap-1">
                  <Save size={14} />
                  手動保存
                </span>
                <span className={hasManualSave ? 'text-white' : 'text-gray-500'}>
                  {formatDateTime(lastManualSave)}
                </span>
              </div>
            </div>
            
            {/* ボタン */}
            <div className="space-y-3">
              <button
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleSave}
                disabled={isSaving || !hasCurrentData}
              >
                <Save size={18} />
                {isSaving ? '保存中...' : '手動保存'}
              </button>
              
              <button
                className="w-full flex items-center justify-center gap-2 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleLoadClick}
                disabled={isLoading || !hasSaveData}
              >
                <FolderOpen size={18} />
                {isLoading ? '読み込み中...' : '読み込み'}
              </button>
              
              <button
                className="w-full flex items-center justify-center gap-2 py-3 bg-gray-800 hover:bg-red-600/20 text-gray-400 hover:text-red-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleDeleteClick}
                disabled={!hasSaveData}
              >
                <Trash2 size={18} />
                保存データを削除
              </button>
            </div>
          </div>
        )}
        
        {/* スロット選択 */}
        {mode === 'selectSlot' && (
          <div className="space-y-4">
            <div className="space-y-3">
              {hasAutoSave && (
                <button
                  className="w-full flex items-center justify-between py-3 px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  onClick={() => handleSlotSelect('auto')}
                >
                  <span className="flex items-center gap-2">
                    <Clock size={18} className="text-blue-400" />
                    自動保存
                  </span>
                  <span className="text-sm text-gray-400">
                    {formatDateTime(lastAutoSave)}
                  </span>
                </button>
              )}
              
              {hasManualSave && (
                <button
                  className="w-full flex items-center justify-between py-3 px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  onClick={() => handleSlotSelect('manual')}
                >
                  <span className="flex items-center gap-2">
                    <Save size={18} className="text-green-400" />
                    手動保存
                  </span>
                  <span className="text-sm text-gray-400">
                    {formatDateTime(lastManualSave)}
                  </span>
                </button>
              )}
            </div>
            
            <button
              className="w-full py-2 text-gray-400 hover:text-white transition-colors"
              onClick={() => setMode('menu')}
            >
              戻る
            </button>
          </div>
        )}
        
        {/* 読み込み確認 */}
        {mode === 'confirmLoad' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
              <AlertTriangle size={20} className="text-yellow-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-200">
                現在編集中のデータは失われます。よろしいですか？
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                onClick={() => setMode('menu')}
              >
                キャンセル
              </button>
              <button
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                onClick={() => selectedSlot && handleLoadConfirm(selectedSlot)}
                disabled={isLoading}
              >
                {isLoading ? '読み込み中...' : '読み込む'}
              </button>
            </div>
          </div>
        )}
        
        {/* 削除確認 */}
        {mode === 'confirmDelete' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-900/30 border border-red-700/50 rounded-lg">
              <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-200">
                自動保存と手動保存の両方のデータを削除します。この操作は取り消せません。
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                onClick={() => setMode('menu')}
              >
                キャンセル
              </button>
              <button
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                onClick={handleDeleteConfirm}
              >
                削除する
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
