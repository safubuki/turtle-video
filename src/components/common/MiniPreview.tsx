import React, { useRef, useEffect, useCallback } from 'react';
import type { MediaItem } from '../../types';

interface MiniPreviewProps {
  item: MediaItem;
  mediaElement: HTMLVideoElement | HTMLImageElement | null;
}

const MINI_CANVAS_WIDTH = 96;
const MINI_CANVAS_HEIGHT = 54;
const ORIGINAL_WIDTH = 1280;

/**
 * ミニプレビューコンポーネント
 * トランスフォームパネル内に埋め込み表示
 */
const MiniPreview: React.FC<MiniPreviewProps> = ({ item, mediaElement }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !mediaElement) return;

    // 背景をクリア
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, MINI_CANVAS_WIDTH, MINI_CANVAS_HEIGHT);

    // スケール比率
    const scaleRatio = MINI_CANVAS_WIDTH / ORIGINAL_WIDTH;

    // トランスフォーム適用
    ctx.save();
    
    // 中心を基準にスケールと位置を適用
    const centerX = MINI_CANVAS_WIDTH / 2 + item.positionX * scaleRatio;
    const centerY = MINI_CANVAS_HEIGHT / 2 + item.positionY * scaleRatio;
    
    ctx.translate(centerX, centerY);
    ctx.scale(item.scale, item.scale);
    ctx.translate(-MINI_CANVAS_WIDTH / 2, -MINI_CANVAS_HEIGHT / 2);

    // メディアを描画
    try {
      if (item.type === 'video') {
        const video = mediaElement as HTMLVideoElement;
        if (video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, MINI_CANVAS_WIDTH, MINI_CANVAS_HEIGHT);
        }
      } else {
        ctx.drawImage(mediaElement, 0, 0, MINI_CANVAS_WIDTH, MINI_CANVAS_HEIGHT);
      }
    } catch {
      // 描画エラーは無視
    }

    ctx.restore();

    // 境界線を描画（プレビュー範囲を示す）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, MINI_CANVAS_WIDTH, MINI_CANVAS_HEIGHT);

    // 動画の場合は継続的に更新
    if (item.type === 'video') {
      animationRef.current = requestAnimationFrame(renderFrame);
    }
  }, [item, mediaElement]);

  useEffect(() => {
    renderFrame();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [renderFrame]);

  // スケールや位置が変わったら再描画
  useEffect(() => {
    renderFrame();
  }, [item.scale, item.positionX, item.positionY, renderFrame]);

  return (
    <div className="mt-2 rounded-lg overflow-hidden border border-gray-600">
      {/* プレビュー */}
      <div className="relative bg-black">
        <canvas
          ref={canvasRef}
          width={MINI_CANVAS_WIDTH}
          height={MINI_CANVAS_HEIGHT}
          className="block w-full"
        />
        
        {/* トランスフォーム情報オーバーレイ */}
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-[10px] text-gray-300 flex justify-between">
          <span>Scale: {(item.scale * 100).toFixed(0)}%</span>
          <span>X: {item.positionX} Y: {item.positionY}</span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(MiniPreview);
