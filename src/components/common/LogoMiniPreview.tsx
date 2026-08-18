/**
 * @file LogoMiniPreview.tsx
 * @description ウォーターマーク／エンドロールの見た目を、その場で確認するミニビュー。
 * メインプレビューへ移動せずに位置・倍率・マスク・透過度を確認できるようにする。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { EndrollOverlay, WatermarkOverlay } from '../../types';
import type { CaptionFreeSnapshot } from '../../utils/canvas';
import { drawEndrollFrame } from '../../utils/endrollOverlay';
import { drawLogoImageFrame } from '../../utils/watermarkOverlay';

interface LogoMiniPreviewProps {
  /** メインプレビューの背景フレーム（フォールバック）。 */
  sourceCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** キャプション・ロゴ描画前のフレーム。これを優先して二重描画を防ぐ。 */
  captionFreeSnapshotRef?: React.MutableRefObject<CaptionFreeSnapshot>;
  overlay: WatermarkOverlay | EndrollOverlay;
  mode: 'watermark' | 'endroll';
  canvasWidth: number;
  canvasHeight: number;
  /** プレビューの現在位置が変わったときに背景を取り直すためのキー。 */
  refreshKey?: number;
}

const MINI_LONG_SIDE = 320;

const LogoMiniPreview: React.FC<LogoMiniPreviewProps> = ({
  sourceCanvasRef,
  captionFreeSnapshotRef,
  overlay,
  mode,
  canvasWidth,
  canvasHeight,
  refreshKey = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  const isPortrait = canvasHeight > canvasWidth;
  const width = isPortrait
    ? Math.max(1, Math.round(MINI_LONG_SIDE * (canvasWidth / canvasHeight)))
    : MINI_LONG_SIDE;
  const height = isPortrait
    ? MINI_LONG_SIDE
    : Math.max(1, Math.round(MINI_LONG_SIDE * (canvasHeight / canvasWidth)));

  useEffect(() => {
    if (!overlay.url) {
      setImage(null);
      return;
    }

    const nextImage = new Image();
    nextImage.onload = () => setImage(nextImage);
    nextImage.onerror = () => setImage(null);
    nextImage.src = overlay.url;

    return () => {
      nextImage.onload = null;
      nextImage.onerror = null;
    };
  }, [overlay.url]);

  const renderMiniFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasWidth <= 0 || canvasHeight <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let compositionCanvas = compositionCanvasRef.current;
    if (!compositionCanvas) {
      compositionCanvas = document.createElement('canvas');
      compositionCanvasRef.current = compositionCanvas;
    }
    if (compositionCanvas.width !== canvasWidth) compositionCanvas.width = canvasWidth;
    if (compositionCanvas.height !== canvasHeight) compositionCanvas.height = canvasHeight;

    const compositionCtx = compositionCanvas.getContext('2d');
    if (!compositionCtx) return;

    compositionCtx.setTransform(1, 0, 0, 1, 0, 0);
    compositionCtx.globalAlpha = 1;
    compositionCtx.filter = 'none';
    compositionCtx.fillStyle = mode === 'endroll' ? '#000000' : '#111827';
    compositionCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (mode === 'endroll') {
      // 無効中でも調整結果を確認できるよう、ミニビュー内だけ有効扱いにする。
      const endroll = overlay as EndrollOverlay;
      const previewEndroll = endroll.enabled ? endroll : { ...endroll, enabled: true };
      drawEndrollFrame(compositionCtx, previewEndroll, image, previewEndroll.durationSec / 2);
    } else {
      // キャプション・ロゴ描画前のスナップショットを優先する。
      // メイン canvas を直接使うと、現在のロゴが設定中のロゴと二重になるため。
      const snapshot = captionFreeSnapshotRef?.current;
      const source = snapshot?.hasFrame && snapshot.canvas ? snapshot.canvas : null;
      if (source && source.width > 0 && source.height > 0) {
        try {
          compositionCtx.drawImage(source, 0, 0, canvasWidth, canvasHeight);
        } catch {
          // 背景フレームがまだ転写できない場合は、マット色のまま表示する。
        }
      } else {
        // 初回描画前だけはメイン canvas を背景に使う。ロゴの重複を避けるため、
        // この場合はロゴを重ねず次のフレームでスナップショットへ切り替える。
        const fallback = sourceCanvasRef.current;
        if (fallback && fallback.width > 0 && fallback.height > 0) {
          try {
            compositionCtx.drawImage(fallback, 0, 0, canvasWidth, canvasHeight);
          } catch {
            // 背景フレームがまだ転写できない場合は、マット色のまま表示する。
          }
        }
      }

      if (source && image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
        drawLogoImageFrame(compositionCtx, overlay, image, 1);
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    try {
      ctx.drawImage(compositionCanvas, 0, 0, width, height);
    } catch {
      // 描画できないブラウザ状態では、黒背景を表示したままにする。
    }
  }, [
    canvasHeight,
    canvasWidth,
    captionFreeSnapshotRef,
    height,
    image,
    mode,
    overlay,
    sourceCanvasRef,
    width,
  ]);

  useEffect(() => {
    renderMiniFrame();
  }, [renderMiniFrame, refreshKey, width, height]);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-600/70 bg-black">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block h-auto w-full"
        aria-label={`${mode === 'endroll' ? 'エンドロール' : 'ウォーターマーク'}のミニプレビュー`}
        role="img"
      />
      <div className="bg-black/70 px-2 py-1 text-center text-[9px] text-gray-300">
        {mode === 'endroll' ? 'エンドロールの見た目を確認' : '現在のプレビュー画面に重ねて表示'}
      </div>
    </div>
  );
};

export default React.memo(LogoMiniPreview);
