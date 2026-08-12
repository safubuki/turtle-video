/**
 * @file ClipThumbnail.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description メディアクリップのサムネイルを表示する軽量コンポーネント。
 * 画像はそのまま、動画は指定時刻（未指定時は先頭付近ヒューリスティック）のフレームをキャプチャして表示する。
 * PC はホバーで拡大プレビュー、タッチ端末はタップでライトボックス表示する。
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { usePlatformCapabilities } from '../../app/PlatformCapabilitiesContext';
import { useDisableBodyScroll } from '../../hooks/useDisableBodyScroll';
import { buildThumbnailSeekCandidates, isCanvasEffectivelyBlank } from '../../utils/media';

interface ClipThumbnailProps {
  file: File;
  type: 'video' | 'image';
  /**
   * 元動画上のサムネイル取得時刻（秒）。
   * 未指定時は従来どおり duration ベースの先頭/中央ヒューリスティック。
   */
  sourceTime?: number;
  /** 有効トリム開始（元動画秒）。再試行候補の下限 */
  rangeStart?: number;
  /** 有効トリム終了（元動画秒）。再試行候補の上限 */
  rangeEnd?: number;
}

/** カード上の表示サイズ（見た目は従来どおり小さく） */
const DISPLAY_WIDTH = 48;
const DISPLAY_HEIGHT = 28;
/**
 * 内部キャプチャ解像度。拡大表示時に何が写っているか判別できる水準。
 * 表示は CSS で DISPLAY に縮小するため、カードレイアウトは変わらない。
 * アスペクトは 48:28（=12:7）を維持。
 */
const CAPTURE_WIDTH = 336;
const CAPTURE_HEIGHT = 196;
/** ホバー浮き出しプレビュー（キャプチャに近いサイズ） */
const HOVER_PREVIEW_WIDTH = 320;
const HOVER_PREVIEW_HEIGHT = 187;
const VIDEO_FRAME_WAIT_MS = 120;
const VIDEO_DRAW_RETRY_COUNT = 6;
const VIDEO_DIMENSION_WAIT_MS = 1200;
const VIDEO_CAPTURE_FULL_RETRY = 1;
const IOS_THUMBNAIL_MIN_PREPARE_MS = 180;
const IOS_THUMBNAIL_MAX_PREPARE_MS = 900;
const NON_IOS_THUMBNAIL_MAX_PREPARE_MS = 800;
const IOS_THUMBNAIL_PRIME_PLAY_MS = 220;

/** 精密ポインタ + ホバー可能 → PC 向けホバー拡大。それ以外はタップでライトボックス。 */
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
    // Safari 旧系
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  return prefersHover;
}

function resolveHoverPreviewPosition(anchor: DOMRect): { top: number; left: number } {
  const margin = 8;
  let left = anchor.left + anchor.width / 2 - HOVER_PREVIEW_WIDTH / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - HOVER_PREVIEW_WIDTH - margin));

  let top = anchor.bottom + margin;
  if (top + HOVER_PREVIEW_HEIGHT > window.innerHeight - margin) {
    top = anchor.top - HOVER_PREVIEW_HEIGHT - margin;
  }
  top = Math.max(margin, top);

  return { top, left };
}

type FrameAwareVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (...args: unknown[]) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * クリップサムネイルコンポーネント
 * ヘッダー付近にメディアの小さなプレビューを表示する
 */
const ClipThumbnail: React.FC<ClipThumbnailProps> = ({
  file,
  type,
  sourceTime,
  rangeStart,
  rangeEnd,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [hoverPos, setHoverPos] = useState({ top: 0, left: 0 });
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const urlRef = useRef<string | null>(null);
  const { isIosSafari } = usePlatformCapabilities();
  const prefersHover = usePrefersHoverPreview();

  useDisableBodyScroll(lightboxOpen);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  const openHoverPreview = useCallback(() => {
    if (!prefersHover || !previewSrc || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setHoverPos(resolveHoverPreviewPosition(rect));
    setHoverOpen(true);
  }, [prefersHover, previewSrc]);

  const closeHoverPreview = useCallback(() => {
    setHoverOpen(false);
  }, []);

  const handleTriggerClick = useCallback(
    (event: React.MouseEvent | React.KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      // ホバー可能な PC はマウスオーバーで十分。タップ/クリックはタッチ端末向け。
      if (prefersHover) return;
      if (!previewSrc) return;
      setLightboxOpen(true);
    },
    [prefersHover, previewSrc]
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
  }, [lightboxOpen, closeLightbox]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setReady(false);
    setPreviewSrc(null);
    setHoverOpen(false);
    setLightboxOpen(false);

    let cancelled = false;
    let activeVideo: HTMLVideoElement | null = null;

    const finishReady = () => {
      if (cancelled) return;
      try {
        // 再デコードせず、高解像度キャプチャ済みキャンバスから拡大用スナップショットを取る
        setPreviewSrc(canvas.toDataURL('image/jpeg', 0.88));
      } catch {
        setPreviewSrc(null);
      }
      setReady(true);
    };
    let detachActiveVideo: (() => void) | null = null;
    const timeoutIds = new Set<number>();
    const intervalIds = new Set<number>();

    const registerTimeout = (id: number): number => {
      timeoutIds.add(id);
      return id;
    };

    const registerInterval = (id: number): number => {
      intervalIds.add(id);
      return id;
    };

    const clearAllTimeouts = () => {
      timeoutIds.forEach((id) => window.clearTimeout(id));
      timeoutIds.clear();
    };

    const clearAllIntervals = () => {
      intervalIds.forEach((id) => window.clearInterval(id));
      intervalIds.clear();
    };

    const url = URL.createObjectURL(file);
    urlRef.current = url;

    const revokeUrl = () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };

    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        const timeoutId = registerTimeout(window.setTimeout(() => {
          timeoutIds.delete(timeoutId);
          resolve();
        }, ms));
      });

    const waitForVideoReady = (video: HTMLVideoElement): Promise<void> =>
      new Promise((resolve) => {
        if (cancelled) {
          resolve();
          return;
        }

        const startedAt = Date.now();
        const minPrepareMs = isIosSafari ? IOS_THUMBNAIL_MIN_PREPARE_MS : 0;
        const maxPrepareMs = isIosSafari ? IOS_THUMBNAIL_MAX_PREPARE_MS : NON_IOS_THUMBNAIL_MAX_PREPARE_MS;
        let settled = false;
        let pollId = 0;
        let timeoutId = 0;

        const finish = () => {
          if (settled) return;
          settled = true;
          video.removeEventListener('seeked', onReady);
          video.removeEventListener('loadeddata', onReady);
          video.removeEventListener('canplay', onReady);
          video.removeEventListener('error', onReady);
          if (pollId) {
            window.clearInterval(pollId);
            intervalIds.delete(pollId);
          }
          if (timeoutId) {
            window.clearTimeout(timeoutId);
            timeoutIds.delete(timeoutId);
          }
          resolve();
        };

        const maybeReady = () => {
          if (cancelled) {
            finish();
            return;
          }
          const elapsed = Date.now() - startedAt;
          const hasFrame = video.readyState >= 2 && !video.seeking && video.videoWidth > 0 && video.videoHeight > 0;
          if (!hasFrame && elapsed < maxPrepareMs) return;
          if (elapsed < minPrepareMs) return;
          finish();
        };

        const onReady = () => {
          maybeReady();
        };

        video.addEventListener('seeked', onReady);
        video.addEventListener('loadeddata', onReady);
        video.addEventListener('canplay', onReady);
        video.addEventListener('error', onReady);
        pollId = registerInterval(window.setInterval(maybeReady, 40));
        timeoutId = registerTimeout(window.setTimeout(maybeReady, maxPrepareMs + 50));
        maybeReady();
      });

    const waitForEvent = (
      target: EventTarget,
      eventName: string,
      timeoutMs: number
    ): Promise<boolean> =>
      new Promise((resolve) => {
        if (cancelled) {
          resolve(false);
          return;
        }

        let settled = false;
        const onEvent = () => finish(true);
        const finish = (result: boolean) => {
          if (settled) return;
          settled = true;
          target.removeEventListener(eventName, onEvent as EventListener);
          window.clearTimeout(timeoutId);
          timeoutIds.delete(timeoutId);
          resolve(result);
        };

        const timeoutId = registerTimeout(window.setTimeout(() => finish(false), timeoutMs));
        target.addEventListener(eventName, onEvent as EventListener, { once: true });
      });

    const drawCentered = (
      source: CanvasImageSource,
      sourceWidth: number,
      sourceHeight: number
    ): boolean => {
      if (sourceWidth <= 0 || sourceHeight <= 0) return false;

      const scale = Math.min(CAPTURE_WIDTH / sourceWidth, CAPTURE_HEIGHT / sourceHeight);
      const w = sourceWidth * scale;
      const h = sourceHeight * scale;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);

      try {
        ctx.drawImage(source, (CAPTURE_WIDTH - w) / 2, (CAPTURE_HEIGHT - h) / 2, w, h);
        return true;
      } catch {
        return false;
      }
    };

    /**
     * 描画成功かつ中身がほぼ黒でないときだけ true。
     * シーク未完了の黒フレームを「成功」と誤認すると、カード上でサムネが消えたように見える。
     */
    const tryDrawMediaFrame = (
      source: CanvasImageSource,
      sourceWidth: number,
      sourceHeight: number
    ): boolean => {
      if (!drawCentered(source, sourceWidth, sourceHeight)) return false;
      // 黒（未デコード）なら失敗扱い。候補時刻へフォールバックする。
      if (isCanvasEffectivelyBlank(canvas)) return false;
      return true;
    };

    const drawVideoFallback = () => {
      // キャプチャ解像度に合わせた簡易再生アイコン（座標は 48x28 基準をスケール）
      const sx = CAPTURE_WIDTH / DISPLAY_WIDTH;
      const sy = CAPTURE_HEIGHT / DISPLAY_HEIGHT;
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
      ctx.fillStyle = '#9ca3af';
      ctx.beginPath();
      ctx.moveTo(19 * sx, 8 * sy);
      ctx.lineTo(19 * sx, 20 * sy);
      ctx.lineTo(30 * sx, 14 * sy);
      ctx.closePath();
      ctx.fill();
    };

    const drawImageFallback = () => {
      // 動画フォールバックと同系統の単色＋簡易アイコン（jsdom でも安全な API のみ）
      const sx = CAPTURE_WIDTH / DISPLAY_WIDTH;
      const sy = CAPTURE_HEIGHT / DISPLAY_HEIGHT;
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(14 * sx, 9 * sy, 20 * sx, 12 * sy);
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(16 * sx, 11 * sy, 16 * sx, 8 * sy);
    };

    const waitForDecodedFrame = async (video: FrameAwareVideo): Promise<void> => {
      if (cancelled) return;

      if (typeof video.requestVideoFrameCallback === 'function') {
        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            timeoutIds.delete(timeoutId);
            resolve();
          };

          const callbackId = video.requestVideoFrameCallback?.(() => finish());
          const timeoutId = registerTimeout(window.setTimeout(() => {
            if (typeof callbackId === 'number' && typeof video.cancelVideoFrameCallback === 'function') {
              video.cancelVideoFrameCallback(callbackId);
            }
            finish();
          }, VIDEO_FRAME_WAIT_MS));
        });
        return;
      }

      await wait(VIDEO_FRAME_WAIT_MS);
    };

    /**
     * デコード寸法が 0 のままだと drawImage が空になる。
     * metadata はあるが current frame 未取得の動画で起きやすい。
     */
    const waitForVideoDimensions = async (video: HTMLVideoElement): Promise<boolean> => {
      if (video.videoWidth > 0 && video.videoHeight > 0) return true;

      const startedAt = Date.now();
      while (!cancelled && Date.now() - startedAt < VIDEO_DIMENSION_WAIT_MS) {
        if (video.videoWidth > 0 && video.videoHeight > 0) return true;
        await wait(40);
      }
      return video.videoWidth > 0 && video.videoHeight > 0;
    };

    /**
     * 全環境で一時的に DOM へ置く。
     * display:none 相当の offscreen 要素ではフレームが取れないブラウザがある
     * （iOS は既知、Chromium でも稀に videoWidth=0 / 黒フレームになる）。
     */
    const attachVideoForFrameCapture = (video: HTMLVideoElement): (() => void) | null => {
      if (typeof document === 'undefined' || !document.body) return null;

      video.setAttribute('aria-hidden', 'true');
      Object.assign(video.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        // キャプチャ解像度相当のサイズでデコードし、拡大時の画質を確保
        width: `${CAPTURE_WIDTH}px`,
        height: `${CAPTURE_HEIGHT}px`,
        opacity: '0.01',
        pointerEvents: 'none',
        zIndex: '-1000',
        visibility: 'visible',
      });

      document.body.appendChild(video);

      return () => {
        if (video.parentNode) {
          video.parentNode.removeChild(video);
        }
      };
    };

    const primeVideoFrameForCapture = async (video: FrameAwareVideo, seekTime: number): Promise<void> => {
      if (!isIosSafari || cancelled) return;

      const playingPromise = waitForEvent(video, 'playing', IOS_THUMBNAIL_PRIME_PLAY_MS);
      const timeUpdatePromise = waitForEvent(video, 'timeupdate', IOS_THUMBNAIL_PRIME_PLAY_MS);
      try {
        const playResult = video.play();
        if (playResult && typeof (playResult as Promise<void>).catch === 'function') {
          void (playResult as Promise<void>).catch(() => {});
        }
      } catch {
        return;
      }

      await Promise.race([
        playingPromise,
        timeUpdatePromise,
        waitForDecodedFrame(video),
        wait(IOS_THUMBNAIL_PRIME_PLAY_MS),
      ]);

      try {
        video.pause();
      } catch {
        // ignore
      }

      if (cancelled) return;

      if (Math.abs(video.currentTime - seekTime) > 0.08) {
        await seekVideo(video, seekTime);
        await waitForVideoReady(video);
      }

      await waitForDecodedFrame(video);
    };

    const seekVideo = async (video: HTMLVideoElement, time: number): Promise<void> => {
      if (cancelled) return;

      const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
      const needsSeek = Math.abs(video.currentTime - safeTime) > 0.03;
      if (!needsSeek) return;

      const seekPromise = waitForEvent(video, 'seeked', 1500);
      try {
        video.currentTime = safeTime;
        await seekPromise;
      } catch {
        // シーク失敗時は次の候補時刻へフォールバック
      }
    };

    const buildSeekCandidates = (duration: number): number[] => {
      // 明示時刻がある場合は有効範囲内の再試行列（開始+0.2/0.3/0.5 等）を使う
      if (sourceTime != null && Number.isFinite(sourceTime)) {
        const start = rangeStart != null && Number.isFinite(rangeStart) ? Math.max(0, rangeStart) : 0;
        const end = rangeEnd != null && Number.isFinite(rangeEnd) && rangeEnd > start
          ? rangeEnd
          : (Number.isFinite(duration) && duration > 0 ? duration : start + 1);
        return buildThumbnailSeekCandidates({
          primarySourceTime: sourceTime,
          sourceTrimStart: start,
          sourceTrimEnd: end,
          mediaDuration: duration,
        });
      }

      // 後方互換: 未指定時は先頭付近 → 0 → 中央
      if (!Number.isFinite(duration) || duration <= 0) return [0];

      const maxSeek = Math.max(0, duration - 0.05);
      const head = Math.min(1, duration * 0.1, maxSeek);
      const middle = Math.min(duration * 0.5, maxSeek);

      return Array.from(new Set([head, 0, middle].map((value) => Math.max(0, value))));
    };

    const captureFromVideoElement = async (video: FrameAwareVideo): Promise<boolean> => {
      const seekCandidates = buildSeekCandidates(video.duration);

      for (const seekTime of seekCandidates) {
        if (cancelled) return false;

        await seekVideo(video, seekTime);
        await waitForVideoReady(video);
        await waitForVideoDimensions(video);
        await waitForDecodedFrame(video);
        await primeVideoFrameForCapture(video, seekTime);

        for (let retry = 0; retry < VIDEO_DRAW_RETRY_COUNT; retry++) {
          if (cancelled) return false;
          if (tryDrawMediaFrame(video, video.videoWidth, video.videoHeight)) {
            return true;
          }
          await wait(60 + retry * 20);
          await waitForDecodedFrame(video);
        }
      }

      return false;
    };

    if (type === 'image') {
      const finishImage = (ok: boolean) => {
        if (cancelled) return;
        if (!ok) drawImageFallback();
        finishReady();
        revokeUrl();
      };

      const tryDrawImageSource = (source: CanvasImageSource, width: number, height: number): boolean => {
        if (width <= 0 || height <= 0) return false;
        return tryDrawMediaFrame(source, width, height);
      };

      const loadWithImageElement = (): Promise<boolean> =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            if (cancelled) {
              resolve(false);
              return;
            }
            resolve(tryDrawImageSource(img, img.naturalWidth, img.naturalHeight));
          };
          img.onerror = () => resolve(false);
          img.src = url;
        });

      const loadWithImageBitmap = async (): Promise<boolean> => {
        if (typeof createImageBitmap !== 'function') return false;
        try {
          const bitmap = await createImageBitmap(file);
          if (cancelled) {
            bitmap.close();
            return false;
          }
          const ok = tryDrawImageSource(bitmap, bitmap.width, bitmap.height);
          bitmap.close();
          return ok;
        } catch {
          return false;
        }
      };

      void (async () => {
        let captured = await loadWithImageElement();
        if (!captured && !cancelled) {
          captured = await loadWithImageBitmap();
        }
        finishImage(captured);
      })();
    } else {
      const loadVideoThumbnail = async () => {
        for (let attempt = 0; attempt <= VIDEO_CAPTURE_FULL_RETRY; attempt++) {
          if (cancelled) return;

          const video = document.createElement('video') as FrameAwareVideo;
          activeVideo = video;
          video.muted = true;
          video.defaultMuted = true;
          video.preload = 'auto';
          video.playsInline = true;
          video.setAttribute('playsinline', '');
          video.setAttribute('webkit-playsinline', '');
          video.src = url;
          const detachCaptureVideo = attachVideoForFrameCapture(video);
          detachActiveVideo = detachCaptureVideo;

          try {
            video.load();
          } catch {
            // ignore
          }

          const loadedMetadata = video.readyState >= 1 || await waitForEvent(video, 'loadedmetadata', 4000);
          if (!loadedMetadata || cancelled) {
            detachCaptureVideo?.();
            detachActiveVideo = null;
            activeVideo = null;
            if (attempt < VIDEO_CAPTURE_FULL_RETRY) {
              await wait(120);
              continue;
            }
            if (!cancelled) {
              drawVideoFallback();
              finishReady();
            }
            revokeUrl();
            return;
          }

          // metadata 直後は寸法 0 のことがあるので先に待つ
          await waitForVideoDimensions(video);
          const captured = await captureFromVideoElement(video);

          try {
            video.pause();
          } catch {
            // ignore
          }
          detachCaptureVideo?.();
          detachActiveVideo = null;
          activeVideo = null;

          if (captured || cancelled) {
            if (!cancelled) finishReady();
            revokeUrl();
            return;
          }

          // 全候補失敗: 短い待ちのあと要素を作り直して再試行（同時デコード競合向け）
          if (attempt < VIDEO_CAPTURE_FULL_RETRY) {
            await wait(150 + attempt * 100);
          }
        }

        if (!cancelled) {
          drawVideoFallback();
          finishReady();
        }
        revokeUrl();
      };

      void loadVideoThumbnail();
    }

    return () => {
      cancelled = true;
      clearAllTimeouts();
      clearAllIntervals();
      try {
        activeVideo?.pause();
      } catch {
        // ignore
      }
      detachActiveVideo?.();
      activeVideo = null;
      detachActiveVideo = null;
      revokeUrl();
    };
    // sourceTime / 範囲変更で再生成。古い非同期結果は cancelled で破棄
  }, [file, type, isIosSafari, sourceTime, rangeStart, rangeEnd]);

  const canExpand = ready && Boolean(previewSrc);
  const canUsePortal = typeof document !== 'undefined' && Boolean(document.body);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        // 親カードのクリックや並べ替えと干渉しない
        onClick={handleTriggerClick}
        onMouseEnter={openHoverPreview}
        onMouseLeave={closeHoverPreview}
        onFocus={openHoverPreview}
        onBlur={closeHoverPreview}
        disabled={!canExpand}
        aria-label={
          prefersHover
            ? 'サムネイル（マウスオーバーで拡大）'
            : 'サムネイルを拡大表示'
        }
        title={
          canExpand
            ? prefersHover
              ? 'マウスオーバーで拡大'
              : 'タップで拡大'
            : undefined
        }
        className={[
          // p-1/-m-1 でタップ領域を広げつつカードヘッダーのレイアウトを崩さない
          'relative -m-1 shrink-0 rounded border border-gray-600/50 bg-black p-1',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70',
          canExpand
            ? prefersHover
              ? 'cursor-zoom-in'
              : 'cursor-pointer active:scale-95 transition-transform'
            : 'cursor-default opacity-80',
        ].join(' ')}
      >
        <canvas
          ref={canvasRef}
          width={CAPTURE_WIDTH}
          height={CAPTURE_HEIGHT}
          className={`block rounded ${ready ? 'opacity-100' : 'opacity-0'}`}
          style={{ width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT }}
          aria-hidden
        />
      </button>

      {canUsePortal
        && hoverOpen
        && prefersHover
        && previewSrc
        && createPortal(
          <div
            role="tooltip"
            data-testid="clip-thumbnail-hover-preview"
            className="pointer-events-none fixed z-[400] overflow-hidden rounded-lg border border-gray-500/60 bg-gray-950 shadow-2xl shadow-black/60 ring-1 ring-white/10"
            style={{
              top: hoverPos.top,
              left: hoverPos.left,
              width: HOVER_PREVIEW_WIDTH,
              height: HOVER_PREVIEW_HEIGHT,
            }}
          >
            <img
              src={previewSrc}
              alt=""
              className="h-full w-full object-contain bg-black"
              draggable={false}
            />
          </div>,
          document.body
        )}

      {canUsePortal
        && lightboxOpen
        && previewSrc
        && createPortal(
          <div
            className="fixed inset-0 z-[500] flex items-center justify-center bg-black/75 p-4 md:p-8"
            role="dialog"
            aria-modal="true"
            aria-label="サムネイル拡大表示"
            data-testid="clip-thumbnail-lightbox"
            onClick={closeLightbox}
          >
            <div
              className="relative max-h-[80vh] w-full max-w-lg rounded-xl border border-gray-600/70 bg-gray-950 p-3 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-300">
                  {type === 'video' ? '動画サムネイル' : '画像サムネイル'}
                </span>
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
                  src={previewSrc}
                  alt=""
                  className="max-h-[min(70vh,480px)] w-full object-contain"
                  style={{ imageRendering: 'auto' }}
                  draggable={false}
                />
              </div>
              <p className="mt-2 text-center text-[10px] text-gray-500">
                背景をタップするか × で閉じます
              </p>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default React.memo(ClipThumbnail);
