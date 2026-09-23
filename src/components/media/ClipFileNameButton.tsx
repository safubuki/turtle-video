/**
 * @file ClipFileNameButton.tsx
 * @description ファイル名のクリック・タップでカードを開閉する。PC ではホバーで全文も表示する。
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ClipFileNameButtonProps {
  name: string;
  isOpen?: boolean;
  /** ポインタの種類に関係なくカードを開閉する */
  onActivate?: () => void;
}

function usePrefersHover(): boolean {
  const [prefersHover, setPrefersHover] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setPrefersHover(mq.matches);
    update();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  return prefersHover;
}

function popupPosition(anchor: DOMRect): { top: number; left: number; maxWidth: number } {
  const margin = 8;
  const maxWidth = Math.min(320, window.innerWidth - margin * 2);
  let left = anchor.left;
  if (left + maxWidth > window.innerWidth - margin) {
    left = window.innerWidth - margin - maxWidth;
  }
  if (left < margin) left = margin;
  const top = anchor.bottom + 6;
  return { top, left, maxWidth };
}

const ClipFileNameButton: React.FC<ClipFileNameButtonProps> = ({ name, isOpen = false, onActivate }) => {
  const prefersHover = usePrefersHover();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, maxWidth: 320 });

  const show = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(popupPosition(rect));
    setOpen(true);
  };

  const hide = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-testid="clip-file-name"
        className="flex min-h-6 min-w-0 flex-1 items-center rounded-md px-1 py-0.5 text-left transition-colors duration-150 hover:bg-gray-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
        title={name}
        aria-label={`${name}のカードを${isOpen ? '閉じる' : '開く'}`}
        aria-describedby={open ? 'clip-file-name-popup' : undefined}
        onMouseEnter={() => {
          if (prefersHover) show();
        }}
        onMouseLeave={() => {
          if (prefersHover) hide();
        }}
        onFocus={() => {
          if (prefersHover) show();
        }}
        onBlur={() => {
          if (prefersHover) hide();
        }}
        onClick={() => {
          hide();
          onActivate?.();
        }}
      >
        <span className={`text-xs font-medium text-gray-300 md:text-sm ${isOpen ? 'line-clamp-2 break-all' : 'truncate'}`}>{name}</span>
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          id="clip-file-name-popup"
          role="tooltip"
          data-testid="clip-file-name-popup"
          className="pointer-events-none fixed z-[400] rounded-lg border border-gray-500/70 bg-gray-950 px-3 py-2 text-xs text-gray-100 shadow-xl break-all"
          style={{ top: position.top, left: position.left, maxWidth: position.maxWidth }}
        >
          {name}
        </div>,
        document.body,
      )}
    </>
  );
};

export default React.memo(ClipFileNameButton);
