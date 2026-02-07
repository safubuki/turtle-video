/**
 * @file ClipThumbnail.tsx
 * @author Turtle Village
 * @description メディアクリップのサムネイルを表示する軽量コンポーネント。
 * 画像はそのまま、動画は先頭フレームをキャプチャして表示する。
 */
import React, { useRef, useEffect, useState } from 'react';

interface ClipThumbnailProps {
  file: File;
  type: 'video' | 'image';
}

const THUMB_WIDTH = 48;
const THUMB_HEIGHT = 28;

/**
 * クリップサムネイルコンポーネント
 * ヘッダー付近にメディアの小さなプレビューを表示する
 */
const ClipThumbnail: React.FC<ClipThumbnailProps> = ({ file, type }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const url = URL.createObjectURL(file);
    urlRef.current = url;

    if (type === 'image') {
      const img = new Image();
      img.onload = () => {
        // アスペクト比を維持して描画
        const scale = Math.min(THUMB_WIDTH / img.naturalWidth, THUMB_HEIGHT / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
        ctx.drawImage(img, (THUMB_WIDTH - w) / 2, (THUMB_HEIGHT - h) / 2, w, h);
        setReady(true);
        URL.revokeObjectURL(url);
        urlRef.current = null;
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        urlRef.current = null;
      };
      img.src = url;
    } else {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'auto';
      video.playsInline = true;

      const drawFrame = () => {
        const scale = Math.min(THUMB_WIDTH / video.videoWidth, THUMB_HEIGHT / video.videoHeight);
        const w = video.videoWidth * scale;
        const h = video.videoHeight * scale;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
        try {
          ctx.drawImage(video, (THUMB_WIDTH - w) / 2, (THUMB_HEIGHT - h) / 2, w, h);
        } catch {
          // 描画エラーは無視
        }
        setReady(true);
        URL.revokeObjectURL(url);
        urlRef.current = null;
      };

      // メタデータ読み込み後、1秒地点にシークしてからキャプチャ
      video.onloadedmetadata = () => {
        // 動画の長さに応じてシーク位置を決定（1秒 or 動画長の10%の小さい方）
        const seekTime = Math.min(1, video.duration * 0.1);
        video.currentTime = seekTime;
      };

      video.onseeked = () => {
        drawFrame();
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        urlRef.current = null;
      };
      video.src = url;
    }

    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [file, type]);

  return (
    <canvas
      ref={canvasRef}
      width={THUMB_WIDTH}
      height={THUMB_HEIGHT}
      className={`rounded shrink-0 border border-gray-600/50 ${ready ? 'opacity-100' : 'opacity-0'}`}
      style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
    />
  );
};

export default React.memo(ClipThumbnail);
