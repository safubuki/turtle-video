import { useState, useRef, useCallback } from 'react';
import { FPS, EXPORT_VIDEO_BITRATE } from '../constants';

/**
 * useExport - 動画書き出しロジックを提供するフック
 * MediaRecorder を使用した動画エクスポート機能
 */
export interface UseExportReturn {
  // State
  isProcessing: boolean;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  exportUrl: string | null;
  setExportUrl: React.Dispatch<React.SetStateAction<string | null>>;
  exportExt: string | null;
  setExportExt: React.Dispatch<React.SetStateAction<string | null>>;

  // Refs
  recorderRef: React.MutableRefObject<MediaRecorder | null>;

  // Methods
  startExport: (
    canvasRef: React.MutableRefObject<HTMLCanvasElement | null>,
    masterDestRef: React.MutableRefObject<MediaStreamAudioDestinationNode | null>,
    onRecordingStop: (url: string, ext: string) => void
  ) => void;
  clearExportUrl: () => void;
}

export function useExport(): UseExportReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportExt, setExportExt] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  // エクスポート開始
  const startExport = useCallback(
    (
      canvasRef: React.MutableRefObject<HTMLCanvasElement | null>,
      masterDestRef: React.MutableRefObject<MediaStreamAudioDestinationNode | null>,
      onRecordingStop: (url: string, ext: string) => void
    ) => {
      if (!canvasRef.current || !masterDestRef.current) return;

      const canvasStream = canvasRef.current.captureStream(FPS);
      const audioStream = masterDestRef.current.stream;
      const combined = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioStream.getAudioTracks(),
      ]);

      let mimeType = 'video/webm';
      let extension = 'webm';
      if (MediaRecorder.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')) {
        mimeType = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
        extension = 'mp4';
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
        extension = 'mp4';
      }

      const chunks: Blob[] = [];
      const rec = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: EXPORT_VIDEO_BITRATE });
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setExportUrl(url);
        setExportExt(extension);
        onRecordingStop(url, extension);
      };
      recorderRef.current = rec;
      rec.start();
    },
    []
  );

  // エクスポートURLクリア
  const clearExportUrl = useCallback(() => {
    if (exportUrl) {
      URL.revokeObjectURL(exportUrl);
    }
    setExportUrl(null);
    setExportExt(null);
  }, [exportUrl]);

  return {
    isProcessing,
    setIsProcessing,
    exportUrl,
    setExportUrl,
    exportExt,
    setExportExt,
    recorderRef,
    startExport,
    clearExportUrl,
  };
}

export default useExport;
