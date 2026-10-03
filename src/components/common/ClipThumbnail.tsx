/**
 * @file ClipThumbnail.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description メディアクリップのサムネイルを表示する軽量コンポーネント。
 * 画像と動画の取得済みフレームへ、プレビューと同じ出力比率・倍率・位置・回転を反映する。
 * 動画は指定時刻（未指定時は先頭付近ヒューリスティック）のフレームをキャプチャする。
 * PC はホバーで拡大プレビュー、タッチ端末はタップでライトボックス表示する。
 */
import React, { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { usePlatformCapabilities } from '../../app/PlatformCapabilitiesContext';
import { useDisableBodyScroll } from '../../hooks/useDisableBodyScroll';
import { buildThumbnailSeekCandidates, isCanvasEffectivelyBlank, validateScale } from '../../utils/media';
import { resolveMediaBaseScale, useCanvasStore } from '../../stores/canvasStore';
import { normalizeRotation, resolveRotatedFitDimensions } from '../../utils/canvas';

interface ClipThumbnailProps {
  file: File;
  type: 'video' | 'image';
  /** 素材の拡大縮小倍率。プレビューと同じ配置倍率へ掛ける。 */
  scale?: number;
  /** プレビューと同じプロジェクト座標（px）の位置と回転。 */
  positionX?: number;
  positionY?: number;
  rotation?: number;
  /**
   * 元動画上のサムネイル取得時刻（秒）。
   * 未指定時は従来どおり duration ベースの先頭/中央ヒューリスティック。
   */
  sourceTime?: number;
  /** 有効トリム開始（元動画秒）。再試行候補の下限 */
  rangeStart?: number;
  /** 有効トリム終了（元動画秒）。再試行候補の上限 */
  rangeEnd?: number;
  /**
   * card はカード共通ヘッダーの3行に跨る表示。
   * compact / prominent は既存の小型 / 2行用サイズ。
   */
  displaySize?: 'compact' | 'prominent' | 'card';
}

/** 開いたカード上の表示サイズ（見た目は従来どおり小さく） */
const DISPLAY_WIDTH = 48;
const DISPLAY_HEIGHT = 28;
/** 閉じたカードで2行（タイトルと時刻）を覆う表示サイズ。比率は 48:28 のまま */
const PROMINENT_DISPLAY_WIDTH = 96;
const PROMINENT_DISPLAY_HEIGHT = 56;
/** 3行ヘッダーの外枠。出力の向きによらずレイアウトは保つ。 */
const CARD_DISPLAY_WIDTH = 104;
const CARD_DISPLAY_HEIGHT = 61;
/**
 * 素材フレーム取得の最大寸法。素材本来の比率でこの領域へ収める。
 * 表示 canvas は長辺336でプロジェクト比率を保ち、CSSで既存の外枠へ収める。
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
/** トリムスライダーの連続入力をまとめ、途中のデコードを開始しないための待ち時間。 */
const THUMBNAIL_REFRESH_DEBOUNCE_MS = 160;
/** 再生マークのまま残したとき、見える状態で自動再取得する回数 */
const THUMBNAIL_AUTO_RETRY_LIMIT = 3;
/** 同時デコード数。1本だと後ろのカードが遅く、全部同時だと起動直後に失敗しやすい */
const THUMBNAIL_CAPTURE_CONCURRENCY = 2;

let activeThumbnailCaptures = 0;
const thumbnailCaptureWaiters: Array<() => void> = [];

function enqueueThumbnailCapture(task: () => Promise<void>): { cancel: () => void } {
  let cancelled = false;
  let started = false;
  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    activeThumbnailCaptures = Math.max(0, activeThumbnailCaptures - 1);
    const next = thumbnailCaptureWaiters.shift();
    if (next) next();
  };

  const start = () => {
    if (cancelled || started) return;
    started = true;
    activeThumbnailCaptures += 1;
    task().then(release, release);
  };

  if (activeThumbnailCaptures < THUMBNAIL_CAPTURE_CONCURRENCY) {
    start();
  } else {
    thumbnailCaptureWaiters.push(start);
  }

  return {
    cancel: () => {
      cancelled = true;
      const index = thumbnailCaptureWaiters.indexOf(start);
      if (index >= 0) {
        thumbnailCaptureWaiters.splice(index, 1);
        return;
      }
      if (started) release();
    },
  };
}

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
  scale = 1,
  positionX = 0,
  positionY = 0,
  rotation = 0,
  sourceTime,
  rangeStart,
  rangeEnd,
  displaySize = 'compact',
}) => {
  const displayWidth = displaySize === 'card' ? CARD_DISPLAY_WIDTH
    : displaySize === 'prominent' ? PROMINENT_DISPLAY_WIDTH : DISPLAY_WIDTH;
  const displayHeight = displaySize === 'card' ? CARD_DISPLAY_HEIGHT
    : displaySize === 'prominent' ? PROMINENT_DISPLAY_HEIGHT : DISPLAY_HEIGHT;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const capturedFrameRef = useRef<{
    canvas: HTMLCanvasElement;
    isMediaFrame: boolean;
    sourceWidth: number;
    sourceHeight: number;
  } | null>(null);
  const projectCanvasWidth = useCanvasStore((state) => state.width);
  const projectCanvasHeight = useCanvasStore((state) => state.height);
  // 表示枠の大きさは保ち、内部の構図はプロジェクトの出力比率で描く。
  const thumbnailRatio = CAPTURE_WIDTH / Math.max(projectCanvasWidth, projectCanvasHeight);
  const thumbnailWidth = Math.max(1, Math.round(projectCanvasWidth * thumbnailRatio));
  const thumbnailHeight = Math.max(1, Math.round(projectCanvasHeight * thumbnailRatio));
  const transformRef = useRef({ scale, positionX, positionY, rotation, projectCanvasWidth, projectCanvasHeight });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [hoverPos, setHoverPos] = useState({ top: 0, left: 0 });
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const urlRef = useRef<string | null>(null);
  const [captureRequest, setCaptureRequest] = useState(() => ({
    file,
    type,
    sourceTime,
    rangeStart,
    rangeEnd,
  }));
  const [captureGeneration, setCaptureGeneration] = useState(0);
  const failedCaptureRef = useRef(false);
  const autoRetryCountRef = useRef(0);
  const retryTimerRef = useRef(0);
  const { isIosSafari } = usePlatformCapabilities();
  const prefersHover = usePrefersHoverPreview();

  useDisableBodyScroll(lightboxOpen);

  // 等倍の取得結果を保持し、倍率だけの変更ではデコーダや Object URL を作り直さない。
  const drawThumbnail = useCallback(() => {
    const frame = capturedFrameRef.current;
    const displayCanvas = canvasRef.current;
    if (!frame || !displayCanvas) return;
    const displayCtx = displayCanvas.getContext('2d');
    if (!displayCtx) return;

    const width = displayCanvas.width;
    const height = displayCanvas.height;
    displayCtx.fillStyle = '#000000';
    displayCtx.fillRect(0, 0, width, height);
    if (frame.isMediaFrame) {
      const transform = transformRef.current;
      const rotationDeg = normalizeRotation(transform.rotation);
      const fitDims = resolveRotatedFitDimensions(frame.sourceWidth, frame.sourceHeight, rotationDeg);
      const baseScale = resolveMediaBaseScale({
        canvasWidth: width,
        canvasHeight: height,
        elementWidth: fitDims.width,
        elementHeight: fitDims.height,
        mode: height > width ? 'cover' : 'contain',
      });
      const renderScale = baseScale * validateScale(transform.scale);
      const previewRatio = width / transform.projectCanvasWidth;
      displayCtx.save();
      displayCtx.translate(width / 2 + transform.positionX * previewRatio, height / 2 + transform.positionY * previewRatio);
      if (rotationDeg !== 0) displayCtx.rotate((rotationDeg * Math.PI) / 180);
      displayCtx.scale(renderScale, renderScale);
      displayCtx.drawImage(frame.canvas, -frame.sourceWidth / 2, -frame.sourceHeight / 2, frame.sourceWidth, frame.sourceHeight);
      displayCtx.restore();
    } else {
      // 取得失敗の代替アイコンは、素材の変形によらず全体を表示する。
      const fit = Math.min(width / frame.canvas.width, height / frame.canvas.height);
      const iconWidth = frame.canvas.width * fit;
      const iconHeight = frame.canvas.height * fit;
      displayCtx.drawImage(frame.canvas, (width - iconWidth) / 2, (height - iconHeight) / 2, iconWidth, iconHeight);
    }
    try {
      setPreviewSrc(displayCanvas.toDataURL('image/jpeg', 0.88));
    } catch {
      setPreviewSrc(null);
    }
    setReady(true);
  }, []);

  useLayoutEffect(() => {
    // デコード中の変形・向き変更も、完了時に最新の値を使う。
    transformRef.current = { scale, positionX, positionY, rotation, projectCanvasWidth, projectCanvasHeight };
    drawThumbnail();
  }, [scale, positionX, positionY, rotation, projectCanvasWidth, projectCanvasHeight, drawThumbnail]);

  // トリム操作中は同じ File の sourceTime/range が高頻度で変わる。
  // 操作が一段落してから 1 回だけ再キャプチャし、デコーダ生成の連打を避ける。
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCaptureRequest((previous) => {
        if (
          previous.file === file
          && previous.type === type
          && previous.sourceTime === sourceTime
          && previous.rangeStart === rangeStart
          && previous.rangeEnd === rangeEnd
        ) {
          return previous;
        }
        return { file, type, sourceTime, rangeStart, rangeEnd };
      });
    }, THUMBNAIL_REFRESH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [file, type, sourceTime, rangeStart, rangeEnd]);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  /**
   * 閉じた瞬間にカーソルがサムネイル上にあるときだけ、その場での拡大を止める。
   * 乗っていなければ、レイアウト後に抑制を外し、あとから載せたときに拡大する。
   */
  const suppressHoverRef = useRef(false);
  const enteredWhileSuppressedRef = useRef(false);
  const prevDisplaySizeRef = useRef(displaySize);
  if (displaySize === 'prominent' && prevDisplaySizeRef.current !== 'prominent') {
    suppressHoverRef.current = true;
    enteredWhileSuppressedRef.current = false;
  } else if (displaySize !== 'prominent') {
    suppressHoverRef.current = false;
    enteredWhileSuppressedRef.current = false;
  }
  prevDisplaySizeRef.current = displaySize;

  useLayoutEffect(() => {
    if (displaySize !== 'prominent' || !suppressHoverRef.current) return;
    setHoverOpen(false);
    let innerFrame = 0;
    const outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => {
        if (!suppressHoverRef.current) return;
        const hovered = triggerRef.current?.matches(':hover') ?? false;
        if (!hovered && !enteredWhileSuppressedRef.current) {
          suppressHoverRef.current = false;
        }
      });
    });
    return () => {
      window.cancelAnimationFrame(outerFrame);
      window.cancelAnimationFrame(innerFrame);
    };
  }, [displaySize]);

  const openHoverPreview = useCallback(() => {
    if (suppressHoverRef.current) {
      enteredWhileSuppressedRef.current = true;
      return;
    }
    if (!prefersHover || !previewSrc || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setHoverPos(resolveHoverPreviewPosition(rect));
    setHoverOpen(true);
  }, [prefersHover, previewSrc]);

  const closeHoverPreview = useCallback(() => {
    setHoverOpen(false);
  }, []);

  const handleThumbnailMouseLeave = useCallback(() => {
    suppressHoverRef.current = false;
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
    const retryIfStillFailed = () => {
      if (!failedCaptureRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setCaptureGeneration((current) => current + 1);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') retryIfStillFailed();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', retryIfStillFailed);
    window.addEventListener('pageshow', retryIfStillFailed);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', retryIfStillFailed);
      window.removeEventListener('pageshow', retryIfStillFailed);
      window.clearTimeout(retryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const displayCanvas = canvasRef.current;
    if (!displayCanvas) return;

    const canvas = document.createElement('canvas');
    canvas.width = CAPTURE_WIDTH;
    canvas.height = CAPTURE_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { file, type, sourceTime, rangeStart, rangeEnd } = captureRequest;

    let cancelled = false;
    let detachQueue = () => {};
    let activeVideo: HTMLVideoElement | null = null;
    let sourceDimensions = { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT };

    const noteCaptureSuccess = () => {
      failedCaptureRef.current = false;
      autoRetryCountRef.current = 0;
      window.clearTimeout(retryTimerRef.current);
    };

    const noteCaptureFailure = () => {
      if (cancelled) return;
      failedCaptureRef.current = true;
      const exhausted = autoRetryCountRef.current >= THUMBNAIL_AUTO_RETRY_LIMIT;
      if (exhausted) {
        drawVideoFallback();
        finishReady(false);
        return;
      }
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      autoRetryCountRef.current += 1;
      window.clearTimeout(retryTimerRef.current);
      const delayMs = 200 * autoRetryCountRef.current;
      retryTimerRef.current = window.setTimeout(() => {
        if (!failedCaptureRef.current) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        setCaptureGeneration((current) => current + 1);
      }, delayMs);
    };

    const finishReady = (isMediaFrame = true) => {
      if (cancelled) return;
      // 裏側で完成したフレームを表示用キャンバスへ一度に反映する。
      // キャプチャ途中の黒塗りや未デコードフレームを画面へ露出させない。
      capturedFrameRef.current = {
        canvas,
        isMediaFrame,
        sourceWidth: sourceDimensions.width,
        sourceHeight: sourceDimensions.height,
      };
      drawThumbnail();
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

    const captureMediaFrame = (
      source: CanvasImageSource,
      sourceWidth: number,
      sourceHeight: number
    ): boolean => {
      if (sourceWidth <= 0 || sourceHeight <= 0) return false;

      const scale = Math.min(CAPTURE_WIDTH / sourceWidth, CAPTURE_HEIGHT / sourceHeight);
      // 黒帯を含む専用枠をキャッシュすると、後段の出力比率でズームがずれる。
      // 素材全体だけを保持し、出力枠への fit は表示時に行う。
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      sourceDimensions = { width: sourceWidth, height: sourceHeight };

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      try {
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
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
      if (!captureMediaFrame(source, sourceWidth, sourceHeight)) return false;
      // 黒（未デコード）なら失敗扱い。候補時刻へフォールバックする。
      if (isCanvasEffectivelyBlank(canvas)) return false;
      return true;
    };

    const drawVideoFallback = () => {
      canvas.width = CAPTURE_WIDTH;
      canvas.height = CAPTURE_HEIGHT;
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
      canvas.width = CAPTURE_WIDTH;
      canvas.height = CAPTURE_HEIGHT;
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
        finishReady(ok);
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

          const loadedMetadata = video.readyState >= 1 || await waitForEvent(video, 'loadedmetadata', 1500);
          if (!loadedMetadata || cancelled) {
            detachCaptureVideo?.();
            detachActiveVideo = null;
            activeVideo = null;
            if (attempt < VIDEO_CAPTURE_FULL_RETRY) {
              await wait(120);
              continue;
            }
            if (!cancelled) noteCaptureFailure();
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
            if (!cancelled) {
              noteCaptureSuccess();
              finishReady();
            }
            revokeUrl();
            return;
          }

          // 全候補失敗: 短い待ちのあと要素を作り直して再試行（同時デコード競合向け）
          if (attempt < VIDEO_CAPTURE_FULL_RETRY) {
            await wait(150 + attempt * 100);
          }
        }

        if (!cancelled) noteCaptureFailure();
        revokeUrl();
      };

      const queued = enqueueThumbnailCapture(loadVideoThumbnail);
      detachQueue = queued.cancel;
    }

    return () => {
      cancelled = true;
      detachQueue();
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
  }, [captureRequest, captureGeneration, isIosSafari, drawThumbnail]);

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
        onMouseLeave={handleThumbnailMouseLeave}
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
        data-thumbnail-size={displaySize}
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
          width={thumbnailWidth}
          height={thumbnailHeight}
          className={`block rounded ${ready ? 'opacity-100' : 'opacity-0'}`}
          style={{ width: displayWidth, height: displayHeight, objectFit: 'contain' }}
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
