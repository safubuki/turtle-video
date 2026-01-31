import { useState, useRef, useCallback } from 'react';
import { FPS, EXPORT_VIDEO_BITRATE } from '../constants';
import * as Mp4Muxer from 'mp4-muxer';

/**
 * useExport - 動画書き出しロジックを提供するフック
 * WebCodecs API + mp4-muxer を使用した標準MP4（非断片化）エクスポート機能
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
  // MediaRecorderは使用しないため削除し、代わりに停止用フラグ等を管理するRefなどを内部で持つが、
  // 外部インターフェースとしては startExport/cancel 等があればよい。
  // 互換性のため、recorderRef は一旦削除せず null を返すか、あるいは型定義を変更する。
  // ここではAPI互換性を保つため残すが、実体は使用しない。
  recorderRef: React.MutableRefObject<MediaRecorder | null>;

  // Methods
  startExport: (
    canvasRef: React.MutableRefObject<HTMLCanvasElement | null>,
    masterDestRef: React.MutableRefObject<MediaStreamAudioDestinationNode | null>,
    onRecordingStop: (url: string, ext: string) => void
  ) => void;
  stopExport: () => void; // 明示的な停止メソッドを追加
  clearExportUrl: () => void;
}

export function useExport(): UseExportReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportExt, setExportExt] = useState<string | null>(null);

  // 内部状態管理用
  const abortControllerRef = useRef<AbortController | null>(null);
  const videoReaderRef = useRef<ReadableStreamDefaultReader<VideoFrame> | null>(null);
  const audioReaderRef = useRef<ReadableStreamDefaultReader<AudioData> | null>(null);

  // 互換性維持のためのダミーRef（実際には使用しない）
  const recorderRef = useRef<MediaRecorder | null>(null);

  // エクスポート停止処理
  const stopExport = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Readerを強制キャンセルして待機状態を解除
    if (videoReaderRef.current) {
      videoReaderRef.current.cancel().catch(() => { });
      videoReaderRef.current = null;
    }
    if (audioReaderRef.current) {
      audioReaderRef.current.cancel().catch(() => { });
      audioReaderRef.current = null;
    }
    setIsProcessing(false);
  }, []);

  // エクスポート開始
  const startExport = useCallback(
    async (
      canvasRef: React.MutableRefObject<HTMLCanvasElement | null>,
      masterDestRef: React.MutableRefObject<MediaStreamAudioDestinationNode | null>,
      onRecordingStop: (url: string, ext: string) => void
    ) => {
      if (!canvasRef.current || !masterDestRef.current) return;

      setIsProcessing(true);
      setExportUrl(null);
      setExportExt(null);

      const canvas = canvasRef.current;
      const width = canvas.width;
      const height = canvas.height;
      const audioContext = masterDestRef.current.context;

      // 停止用シグナル
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const { signal } = controller;

      try {
        // 1. Muxerの初期化 (ArrayBufferTarget -> メモリ上に構築)
        const muxer = new Mp4Muxer.Muxer({
          target: new Mp4Muxer.ArrayBufferTarget(),
          video: {
            codec: 'avc', // H.264
            width,
            height,
          },
          audio: {
            codec: 'aac',
            sampleRate: audioContext.sampleRate,
            numberOfChannels: 2,
          },
          firstTimestampBehavior: 'offset',
          fastStart: 'in-memory',
        });

        // 2. VideoEncoder の設定
        const videoEncoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: (e) => console.error('VideoEncoder error:', e),
        });
        videoEncoder.configure({
          codec: 'avc1.4d002a', // Main Profile, Level 4.2 (widely supported)
          width,
          height,
          bitrate: EXPORT_VIDEO_BITRATE,
          framerate: FPS,
        });

        // 3. AudioEncoder の設定
        const audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (e) => console.error('AudioEncoder error:', e),
        });
        audioEncoder.configure({
          codec: 'mp4a.40.2', // AAC-LC
          sampleRate: audioContext.sampleRate,
          numberOfChannels: 2,
          bitrate: 128000,
        });

        // 4. ストリームの取得と処理
        // Canvasからの映像ストリーム
        const canvasStream = canvas.captureStream(FPS);
        const videoTrack = canvasStream.getVideoTracks()[0];
        // AudioDestinationNodeからの音声ストリーム
        const audioStream = masterDestRef.current.stream;
        const audioTrack = audioStream.getAudioTracks()[0];

        if (!videoTrack) throw new Error('No video track found');

        // TrackProcessorを使ってReadableStreamを取得
        const videoProcessor = new MediaStreamTrackProcessor({ track: videoTrack });
        const audioProcessor = new MediaStreamTrackProcessor({ track: audioTrack });

        const videoReader = videoProcessor.readable.getReader();
        const audioReader = audioProcessor.readable.getReader();

        // Refに保存して停止時にキャンセルできるようにする
        videoReaderRef.current = videoReader as ReadableStreamDefaultReader<VideoFrame>;
        audioReaderRef.current = audioReader as ReadableStreamDefaultReader<AudioData>;

        // 録画開始時刻
        // const startTime = document.timeline ? document.timeline.currentTime : performance.now();

        const isAbortError = (e: any) => {
          return (
            e?.name === 'AbortError' ||
            e?.message?.includes('Aborted') ||
            signal.aborted
          );
        };

        const processVideo = async () => {
          try {
            while (!signal.aborted) {
              const { done, value } = await videoReader.read();
              if (done) break;

              if (value) {
                const frame = value as VideoFrame;
                if (videoEncoder.state === 'configured') {
                  videoEncoder.encode(frame);
                }
                frame.close();
              }
            }
          } catch (e) {
            if (!isAbortError(e)) {
              console.error('Video processing error:', e);
            }
          }
        };

        const processAudio = async () => {
          try {
            while (!signal.aborted) {
              const { done, value } = await audioReader.read();
              if (done) break;

              if (value) {
                const data = value as AudioData;
                if (audioEncoder.state === 'configured') {
                  audioEncoder.encode(data);
                }
                data.close();
              }
            }
          } catch (e) {
            if (!isAbortError(e)) {
              console.error('Audio processing error:', e);
            }
          }
        };

        // 並列実行
        const processing = Promise.all([processVideo(), processAudio()]);

        // 停止を待つためのPromiseを作成
        // 実際のアプリでは「再生終了」などのイベントで stopExport が呼ばれることを想定するが、
        // 現状の useExport インターフェースだと MediaRecorder.onstop のようなコールバックフローになっている。
        // -> ここでは startExport を呼び出した側が、適切なタイミングで stopExport を呼ぶ必要がある。
        // しかし既存コードは `rec.start()` して終わりで、停止は別トリガー（恐らくPlayback制御側）が `rec.stop()` を呼ぶ？
        // いいえ、既存コードを見ると `rec.onstop` を定義しているだけで、誰が止めるかがここには書かれていません。
        // MediaRecorder のインスタンスを返していないので、外部から止める手段がない…？
        // -> いえ、`recorderRef.current` に入れているので、外部コンポーネントが `recorderRef.current.stop()` しているはずです。

        // 【重要】既存ロジックとの互換性
        // 外部コンポーネントは `recorderRef.current.stop()` を呼んで録画を止めようとします。
        // しかし今回は MediaRecorder を使いません。
        // そのため、recorderRef.current にダミーのオブジェクト（stopメソッドを持つ）を入れるハックが必要です。

        recorderRef.current = {
          stop: () => {
            // 停止シグナルを送る
            stopExport();
          },
          state: 'recording',
          // 他に必要なプロパティがあればダミー実装する
          start: () => { },
          pause: () => { },
          resume: () => { },
          requestData: () => { },
          stream: new MediaStream(),
          mimeType: 'video/mp4',
          ondataavailable: null,
          onerror: null,
          onpause: null,
          onresume: null,
          onstart: null,
          onstop: null,
          addEventListener: () => { },
          removeEventListener: () => { },
          dispatchEvent: () => true,
          audioBitsPerSecond: 128000,
          videoBitsPerSecond: EXPORT_VIDEO_BITRATE
        } as unknown as MediaRecorder;

        // 停止されるまで待機（processingは停止シグナルで終わる）
        await processing;

        // フラッシュ
        await videoEncoder.flush();
        await audioEncoder.flush();

        // Muxer終了
        muxer.finalize();

        // バッファ取得とBlob作成
        const { buffer } = muxer.target;
        const blob = new Blob([buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);

        if (buffer.byteLength > 0) {
          setExportUrl(url);
          setExportExt('mp4');
          onRecordingStop(url, 'mp4');
        } else {
          console.warn('Exported buffer is empty');
        }

      } catch (err) {
        const isAbort =
          signal.aborted ||
          (err as any)?.name === 'AbortError' ||
          (err as any)?.message?.includes('Aborted');

        if (!isAbort) {
          console.error('Export failed:', err);
        }
      } finally {
        // リソース解放などはGCに任せるが、明示的なcloseも可
        // controllerはstopExportでabort済み
        // ReaderのキャンセルもstopExportで実施済み
        setIsProcessing(false);
      }
    },
    [stopExport]
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
    startExport, // 既存I/F維持
    stopExport, // 新規追加（必要であれば使う）
    clearExportUrl,
  };
}

export default useExport;
