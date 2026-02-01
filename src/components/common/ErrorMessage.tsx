/**
 * @file ErrorMessage.tsx
 * @author Turtle Village
 * @description アプリケーション内で発生したエラーメッセージをユーザーに通知するための表示コンポーネント。
 */
import React from 'react';
import { Trash2 } from 'lucide-react';

interface ErrorMessageProps {
  message: string | null;
  onClose: () => void;
}

/**
 * エラーメッセージ表示コンポーネント
 */
const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div className="bg-red-500/10 border border-red-500/50 p-3 rounded text-sm text-red-200 flex justify-between items-center">
      <span>{message}</span>
      <button onClick={onClose}>
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
};

export default React.memo(ErrorMessage);
