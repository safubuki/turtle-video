/**
 * @file FileDropOverlay.tsx
 * @description セクションへファイルをドラッグしている間だけ重ねる「ここにドロップ」表示。
 * 親は `relative` にしておくこと。pointer-events を持たないので、下の要素の dragleave を乱さない。
 */
import React from 'react';
import { Lock, Upload } from 'lucide-react';

export interface FileDropOverlayProps {
  active: boolean;
  disabled?: boolean;
  /** 例: 「動画・画像を追加」 */
  label: string;
  /** 例: 「動画・画像ファイル」 */
  hint: string;
  /** セクションの色に合わせる（枠と文字） */
  tone: 'blue' | 'purple' | 'indigo';
  testId?: string;
}

const TONE_CLASS: Record<FileDropOverlayProps['tone'], string> = {
  blue: 'border-blue-400/80 bg-blue-500/15 text-blue-100',
  purple: 'border-purple-400/80 bg-purple-500/15 text-purple-100',
  indigo: 'border-indigo-400/80 bg-indigo-500/15 text-indigo-100',
};

const FileDropOverlay: React.FC<FileDropOverlayProps> = ({ active, disabled = false, label, hint, tone, testId }) => {
  if (!active) return null;
  const toneClass = disabled ? 'border-red-400/70 bg-red-500/10 text-red-100' : TONE_CLASS[tone];
  return (
    <div
      data-testid={testId}
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed backdrop-blur-[2px] ${toneClass}`}
    >
      <div className="flex items-center gap-2 rounded-lg bg-gray-950/80 px-3 py-1.5 text-xs md:text-sm font-semibold shadow-lg">
        {disabled ? <Lock className="h-4 w-4 shrink-0" /> : <Upload className="h-4 w-4 shrink-0" />}
        {disabled ? (
          <span>ロック中のため追加できません</span>
        ) : (
          <span>
            ドロップして{label}
            <span className="ml-1.5 font-normal opacity-80">（{hint}）</span>
          </span>
        )}
      </div>
    </div>
  );
};

export default React.memo(FileDropOverlay);
