/**
 * @file useFloatingPreview.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description モバイル画面と通常映像の可視性に応じ、追従プレビューの利用を制御する。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** 通常映像の位置だけを監視する。再生時計・描画・タイマーは追加しない。 */
export function useFloatingPreview(
  normalPreviewRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  bottomObstructionRef?: RefObject<HTMLDivElement | null>,
  bottomObstructionActive = false
) {
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1023px)').matches
  );
  const [normalPreviewVisible, setNormalPreviewVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(document.visibilityState !== 'hidden');
  const [requestedOpen, setRequestedOpen] = useState(false);
  const focusOnOpenRef = useRef(false);
  const [bottomOffset, setBottomOffset] = useState(0);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setNormalPreviewVisible(true);
    if (!isMobile || !enabled || typeof IntersectionObserver === 'undefined') return;
    const target = normalPreviewRef.current;
    if (!target) return;
    let disposed = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!disposed && entry) {
          setNormalPreviewVisible(entry.isIntersecting && entry.intersectionRatio > 0);
        }
      },
      { rootMargin: '-64px 0px 0px 0px', threshold: 0 }
    );
    observer.observe(target);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [enabled, isMobile, normalPreviewRef]);

  useEffect(() => {
    if (!isMobile || !enabled) return;
    const update = () => setPageVisible(document.visibilityState !== 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [enabled, isMobile]);

  const eligible = isMobile && enabled && pageVisible;
  const available = eligible && !normalPreviewVisible;
  useLayoutEffect(() => {
    const element = bottomObstructionRef?.current;
    if (!available || !bottomObstructionActive || !element) {
      setBottomOffset(0);
      return;
    }
    let disposed = false;
    const measure = () => {
      if (!disposed) setBottomOffset(element.getBoundingClientRect().height);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [available, bottomObstructionActive, bottomObstructionRef]);
  useEffect(() => {
    // 通常映像が見えている間だけは、開いていた意図を保持して一時非表示にする。
    if (!eligible) setRequestedOpen(false);
    if (!available) focusOnOpenRef.current = false;
  }, [available, eligible]);
  const open = useCallback(() => {
    if (available) {
      focusOnOpenRef.current = true;
      setRequestedOpen(true);
    }
  }, [available]);
  const close = useCallback(() => {
    focusOnOpenRef.current = false;
    setRequestedOpen(false);
  }, []);

  return {
    available,
    isOpen: available && requestedOpen,
    focusOnOpen: focusOnOpenRef.current,
    bottomOffset,
    open,
    close,
  };
}
