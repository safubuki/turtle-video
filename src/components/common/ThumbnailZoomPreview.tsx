/**
 * @file ThumbnailZoomPreview.tsx
 * @description 小さいサムネイルを PC ではホバー、タッチ端末ではタップで拡大する。
 * クリップカード（13-200）と同じ操作感。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDisableBodyScroll } from '../../hooks/useDisableBodyScroll';

function usePrefersHoverPreview(): boolean {
  const [prefersHover, setPrefersHover] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
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

function resolveHoverPreviewPosition(
  anchor: DOMRect,
  width: number,
  height: number,
): { top: number; left: number } {
  const margin = 8;
  let left = anchor.left + anchor.width / 2 - width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

  let top = anchor.bottom + margin;
  if (top + height > window.innerHeight - margin) {
    top = anchor.top - height - margin;
  }
  top = Math.max(margin, top);

  return { top, left };
}

export interface ThumbnailZoomPreviewProps {
  src: string | null;
  alt: string;
  title: string;
  compactClassName: string;
  hoverWidth: number;
  hoverHeight: number;
  lightboxTitle: string;
  emptyLabel?: string;
  testIdPrefix?: string;
}

const ThumbnailZoomPreview: React.FC<ThumbnailZoomPreviewProps> = ({
  src,
  alt,
  title,
  compactClassName,
  hoverWidth,
  hoverHeight,
  lightboxTitle,
  emptyLabel = '未表示',
  testIdPrefix = 'thumbnail-zoom',
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [hoverPos, setHoverPos] = useState({ top: 0, left: 0 });
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const prefersHover = usePrefersHoverPreview();
  const canExpand = Boolean(src);
  const canUsePortal = typeof document !== 'undefined';

  useDisableBodyScroll(lightboxOpen);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  const openHoverPreview = useCallback(() => {
    if (!prefersHover || !src || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setHoverPos(resolveHoverPreviewPosition(rect, hoverWidth, hoverHeight));
    setHoverOpen(true);
  }, [hoverHeight, hoverWidth, prefersHover, src]);

  const closeHoverPreview = useCallback(() => {
    setHoverOpen(false);
  }, []);

  const handleTriggerClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (prefersHover) return;
      if (!src) return;
      setLightboxOpen(true);
    },
    [prefersHover, src],
  );

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLightbox();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeLightbox, lightboxOpen]);

  if (!src) {
    return (
      <div className={compactClassName} title={title}>
        <span className="px-1 text-center text-[9px] leading-tight text-gray-500">
          {emptyLabel}
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        onMouseEnter={openHoverPreview}
        onMouseLeave={closeHoverPreview}
        onFocus={openHoverPreview}
        onBlur={closeHoverPreview}
        disabled={!canExpand}
        aria-label={
          prefersHover
            ? `${alt}（マウスオーバーで拡大）`
            : `${alt}を拡大表示`
        }
        title={prefersHover ? 'マウスオーバーで拡大' : 'タップで拡大'}
        className={[
          compactClassName,
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70',
          prefersHover ? 'cursor-zoom-in' : 'cursor-pointer active:scale-95 transition-transform',
        ].join(' ')}
      >
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-contain"
          draggable={false}
        />
      </button>

      {canUsePortal
        && hoverOpen
        && prefersHover
        && createPortal(
          <div
            role="tooltip"
            data-testid={`${testIdPrefix}-hover-preview`}
            className="pointer-events-none fixed z-[400] overflow-hidden rounded-lg border border-gray-500/60 bg-gray-950 shadow-2xl shadow-black/60 ring-1 ring-white/10"
            style={{
              top: hoverPos.top,
              left: hoverPos.left,
              width: hoverWidth,
              height: hoverHeight,
            }}
          >
            <img
              src={src}
              alt=""
              className="h-full w-full object-contain bg-black"
              draggable={false}
            />
          </div>,
          document.body,
        )}

      {canUsePortal
        && lightboxOpen
        && createPortal(
          <div
            className="fixed inset-0 z-[500] flex items-center justify-center bg-black/75 p-4 md:p-8"
            role="dialog"
            aria-modal="true"
            aria-label={`${lightboxTitle}拡大表示`}
            data-testid={`${testIdPrefix}-lightbox`}
            onClick={closeLightbox}
          >
            <div
              className="relative max-h-[80vh] w-full max-w-lg rounded-xl border border-gray-600/70 bg-gray-950 p-3 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-300">{lightboxTitle}</span>
                <button
                  type="button"
                  onClick={closeLightbox}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-600/80 bg-gray-800/90 text-gray-200 transition hover:bg-gray-700"
                  aria-label="閉じる"
                  title="閉じる"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex max-h-[min(70vh,480px)] items-center justify-center overflow-hidden rounded-lg bg-black">
                <img
                  src={src}
                  alt=""
                  className="max-h-[min(70vh,480px)] w-full object-contain"
                  draggable={false}
                />
              </div>
              <p className="mt-2 text-center text-[10px] text-gray-500">
                背景をタップするか × で閉じます
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default React.memo(ThumbnailZoomPreview);
