/**
 * @file useExport.ts
 * @author Turtle Village
 * @description WebCodecs APIとmp4-muxerを使用して、編集内容をMP4ファイルとして書き出すためのカスタムフック。
 */
import { useState, useRef, useCallback } from 'react';
import { FPS, EXPORT_VIDEO_BITRATE } from '../constants';
import * as Mp4Muxer from 'mp4-muxer';
import { useLogStore } from '../stores/logStore';

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
    onRecordingStop: (url: string, ext: string) => void,
    onRecordingError?: (message: string) => void,
    audioMixerNode?: AudioNode
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
    useLogStore.getState().info('RENDER', 'エクスポートを停止');
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
      onRecordingStop: (url: string, ext: string) => void,
      onRecordingError?: (message: string) => void,
      audioMixerNode?: AudioNode
    ) => {
      if (!canvasRef.current || !masterDestRef.current) {
        onRecordingError?.('エクスポートの初期化に失敗しました。');
        return;
      }

      useLogStore.getState().info('RENDER', 'エクスポートを開始', {
        width: canvasRef.current.width,
        height: canvasRef.current.height,
        fps: FPS,
        bitrate: EXPORT_VIDEO_BITRATE
      });
      setIsProcessing(true);
      setExportUrl(null);
      setExportExt(null);

      const canvas = canvasRef.current;
      const width = canvas.width;
      const height = canvas.height;
      const audioContext = masterDestRef.current.context;
      const audioTrack = masterDestRef.current.stream.getAudioTracks()[0] || null;
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const isIOS = /iP(hone|ad|od)/i.test(userAgent) ||
        (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isSafari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent);
      const isIosSafari = isIOS && isSafari;

      type TrackProcessorConstructor = new (init: { track: MediaStreamTrack }) => {
        readable: ReadableStream<VideoFrame | AudioData>;
      };
      const TrackProcessor = (
        window as typeof window & { MediaStreamTrackProcessor?: TrackProcessorConstructor }
      ).MediaStreamTrackProcessor;
      const canUseTrackProcessor = typeof TrackProcessor === 'function';
      const useManualCanvasFrames = isIosSafari || !canUseTrackProcessor;
      // iOS Safari では TrackProcessor での音声読み取りに問題があるため、
      // 音声キャプチャは常に ScriptProcessorNode を使用する
      const useScriptProcessorAudio = isIosSafari;
      const trackProcessorCtor = TrackProcessor as TrackProcessorConstructor | undefined;

      // 停止用シグナル
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const { signal } = controller;

      // ScriptProcessorNode用（iOS Safari音声キャプチャフォールバック）
      let scriptProcessorNode: ScriptProcessorNode | null = null;
      let scriptProcessorSource: MediaStreamAudioSourceNode | null = null;

      try {
        if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
          throw new Error('WebCodecsに対応していないブラウザです');
        }

        // 1. Muxerの初期化 (ArrayBufferTarget -> メモリ上に構築)
        // 音声は常にセットアップする（iOS Safariでは audioTrack が取得できないケースでも
        // ScriptProcessorNode 経由で音声データをキャプチャするため）
        const muxer = new Mp4Muxer.Muxer({
          target: new Mp4Muxer.ArrayBufferTarget(),
          video: {
            codec: 'avc', // H.264
            width,
            height,
            frameRate: FPS, // タイムスタンプをフレームレートに合わせて丸める（Teams互換性向上）
          },
          audio: {
            codec: 'aac' as const,
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

        // 3. AudioEncoder の設定（常に作成する）
        const audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (e) => {
            useLogStore.getState().error('RENDER', 'AudioEncoder エラー', { error: String(e) });
            console.error('AudioEncoder error:', e);
          },
        });
        audioEncoder.configure({
          codec: 'mp4a.40.2', // AAC-LC
          sampleRate: audioContext.sampleRate,
          numberOfChannels: 2,
          bitrate: 128000,
        });

        // 4. ストリームの取得と処理
        let videoReader: ReadableStreamDefaultReader<VideoFrame> | null = null;
        let audioReader: ReadableStreamDefaultReader<AudioData> | null = null;
        let canvasStream: MediaStream | null = null;

        if (!useManualCanvasFrames) {
          if (!trackProcessorCtor) {
            throw new Error('TrackProcessorの初期化に失敗しました');
          }
          canvasStream = canvas.captureStream(FPS);
          const videoTrack = canvasStream.getVideoTracks()[0];
          if (!videoTrack) throw new Error('No video track found');

          const videoProcessor = new trackProcessorCtor({ track: videoTrack });
          videoReader = videoProcessor.readable.getReader() as ReadableStreamDefaultReader<VideoFrame>;
          videoReaderRef.current = videoReader;
        } else {
          useLogStore.getState().info('RENDER', 'iOS Safari向けにCanvas直接キャプチャを使用');
        }

        if (audioTrack && !useScriptProcessorAudio && canUseTrackProcessor && trackProcessorCtor) {
          // TrackProcessor 経由の音声キャプチャ（PC/Android 向け）
          const audioProcessor = new trackProcessorCtor({ track: audioTrack });
          audioReader = audioProcessor.readable.getReader() as ReadableStreamDefaultReader<AudioData>;
          audioReaderRef.current = audioReader;
          useLogStore.getState().info('RENDER', 'TrackProcessor経由で音声をキャプチャ');
        } else {
          // ScriptProcessorNode 経由の音声キャプチャ
          // iOS Safari では常にこのパスを通る（TrackProcessor が利用可能でも masterDest.stream
          // 経由の読み取りに問題があるため）。非Safari でも TrackProcessor 非対応時のフォールバック。
          useLogStore.getState().info('RENDER', 'ScriptProcessorNode経由で音声をキャプチャ', {
            isIosSafari,
            canUseTrackProcessor,
            hasAudioTrack: !!audioTrack,
          });

          const audioCtx = audioContext as AudioContext;
          const bufferSize = 4096;
          scriptProcessorNode = audioCtx.createScriptProcessor(bufferSize, 2, 2);

          let audioTimestamp = 0;
          let capturedChunks = 0;

          // [iOS Safari対策] AudioNode直接接続
          // masterDest.stream経由だとデータが欠落する場合があるため、
          // audioMixerNodeが渡された場合は直接接続する
          if (isIosSafari && audioMixerNode) {
            useLogStore.getState().info('RENDER', 'MixerNodeから直接音声をキャプチャ');
            audioMixerNode.connect(scriptProcessorNode);
          } else {
            scriptProcessorSource = audioCtx.createMediaStreamSource(masterDestRef.current!.stream);
            scriptProcessorSource.connect(scriptProcessorNode);
          }
          scriptProcessorNode.connect(audioCtx.destination);

          scriptProcessorNode.onaudioprocess = (event: AudioProcessingEvent) => {
            if (signal.aborted || audioEncoder.state !== 'configured') return;

            const inputBuffer = event.inputBuffer;
            const numberOfFrames = inputBuffer.length;
            const numberOfChannels = inputBuffer.numberOfChannels;

            // インターリーブ f32 形式（Safari AudioEncoder との互換性が最も高い）
            const interleavedData = new Float32Array(numberOfFrames * 2);
            const ch0 = inputBuffer.getChannelData(0);
            const ch1 = numberOfChannels >= 2 ? inputBuffer.getChannelData(1) : ch0;
            for (let i = 0; i < numberOfFrames; i++) {
              interleavedData[i * 2] = ch0[i];
              interleavedData[i * 2 + 1] = ch1[i];
            }

            try {
              const audioData = new AudioData({
                format: 'f32' as AudioSampleFormat,
                sampleRate: audioCtx.sampleRate,
                numberOfFrames,
                numberOfChannels: 2,
                timestamp: audioTimestamp,
                data: interleavedData,
              });

              audioEncoder.encode(audioData);
              audioData.close();

              capturedChunks++;
              audioTimestamp += Math.round((numberOfFrames / audioCtx.sampleRate) * 1e6);

              // 初回キャプチャ成功をログ
              if (capturedChunks === 1) {
                useLogStore.getState().info('RENDER', 'ScriptProcessor 音声キャプチャ開始', {
                  sampleRate: audioCtx.sampleRate,
                  bufferSize: numberOfFrames,
                  channels: numberOfChannels,
                });
              }
            } catch (e) {
              // 初回エラーのみログ（連続エラーの抑制）
              if (capturedChunks === 0) {
                useLogStore.getState().error('RENDER', 'ScriptProcessor 音声キャプチャ失敗', {
                  error: e instanceof Error ? e.message : String(e),
                });
                console.error('ScriptProcessor audio capture error:', e);
              }
            }

            // 出力に極小値を設定してiOS Safariのノード最適化を防止
            // （完全ゼロだとSafariがonaudioprocess発火を停止する可能性がある）
            for (let ch = 0; ch < event.outputBuffer.numberOfChannels; ch++) {
              const output = event.outputBuffer.getChannelData(ch);
              for (let i = 0; i < output.length; i++) {
                output[i] = 1e-10;
              }
            }
          };
        }

        // 録画開始時刻
        // const startTime = document.timeline ? document.timeline.currentTime : performance.now();

        const isAbortError = (e: any) => {
          return (
            e?.name === 'AbortError' ||
            e?.message?.includes('Aborted') ||
            signal.aborted
          );
        };

        const processVideoWithTrackProcessor = async () => {
          let frameIndex = 0;
          const frameDuration = 1e6 / FPS; // 1フレームあたりの時間（マイクロ秒）

          try {
            while (!signal.aborted) {
              if (!videoReader) break;
              const { done, value } = await videoReader.read();
              if (done) break;

              if (value) {
                const originalFrame = value as VideoFrame;

                if (videoEncoder.state === 'configured') {
                  // [FIX] Teamsスロー再生対策
                  // オリジナルのtimestamp（実時間ベース）を使うと、レンダリング遅延（ジッター）が含まれ
                  // 結果としてVFR（可変フレームレート）となり、一部プレーヤーで再生時間が間延びする。
                  // そのため、強制的にCFR（固定フレームレート）としてタイムスタンプを書き換える。
                  const newTimestamp = Math.round(frameIndex * frameDuration);

                  // 新しいタイムスタンプでフレームを再作成
                  // copyToなどのコストを避けるため、VideoFrameコンストラクタでラップする
                  const newFrame = new VideoFrame(originalFrame, {
                    timestamp: newTimestamp,
                    duration: Math.round(frameDuration),
                  });

                  // エンコード
                  videoEncoder.encode(newFrame);

                  // クローズ
                  newFrame.close();
                }
                originalFrame.close();
                frameIndex++;
              }
            }
          } catch (e) {
            if (!isAbortError(e)) {
              console.error('Video processing error:', e);
            }
          }
        };

        const processVideoWithCanvasFrames = async () => {
          let frameIndex = 0;
          const frameDuration = 1e6 / FPS;
          const frameInterval = Math.max(1, Math.round(1000 / FPS));

          try {
            while (!signal.aborted) {
              if (videoEncoder.state === 'configured') {
                const frame = new VideoFrame(canvas, {
                  timestamp: Math.round(frameIndex * frameDuration),
                  duration: Math.round(frameDuration),
                });
                videoEncoder.encode(frame);
                frame.close();
                frameIndex++;
              }

              await new Promise<void>((resolve) => {
                const timeoutId = setTimeout(() => {
                  signal.removeEventListener('abort', onAbort);
                  resolve();
                }, frameInterval);
                const onAbort = () => {
                  clearTimeout(timeoutId);
                  signal.removeEventListener('abort', onAbort);
                  resolve();
                };
                signal.addEventListener('abort', onAbort, { once: true });
              });
            }
          } catch (e) {
            if (!isAbortError(e)) {
              console.error('Video processing error (canvas):', e);
            }
          }
        };

        const processAudio = async () => {
          if (!audioReader) return;

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

        // ScriptProcessorNode使用時はabortシグナル待機のみ（音声キャプチャはコールバックで非同期実行）
        const waitForAbort = async () => {
          await new Promise<void>((resolve) => {
            if (signal.aborted) { resolve(); return; }
            signal.addEventListener('abort', () => resolve(), { once: true });
          });
        };

        // 並列実行
        const processingTasks = [
          useManualCanvasFrames ? processVideoWithCanvasFrames() : processVideoWithTrackProcessor(),
          audioReader ? processAudio() : (scriptProcessorNode ? waitForAbort() : Promise.resolve()),
        ];
        const processing = Promise.all(processingTasks);

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

        // ScriptProcessorNodeのクリーンアップ（flush前に停止して新規データ送信を防止）
        if (scriptProcessorNode) {
          scriptProcessorNode.onaudioprocess = null;
          try { scriptProcessorNode.disconnect(); } catch (e) { /* ignore */ }
          scriptProcessorNode = null;
        }
        if (scriptProcessorSource) {
          try { scriptProcessorSource.disconnect(); } catch (e) { /* ignore */ }
          scriptProcessorSource = null;
        }

        // フラッシュ
        await videoEncoder.flush();
        await audioEncoder.flush();

        // Muxer終了
        muxer.finalize();

        // Canvasストリームを停止
        if (canvasStream) {
          canvasStream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch (e) {
              /* ignore */
            }
          });
        }

        // バッファ取得とBlob作成
        const { buffer } = muxer.target;

        if (buffer.byteLength > 0) {
          const blob = new Blob([buffer], { type: 'video/mp4' });
          const url = URL.createObjectURL(blob);
          useLogStore.getState().info('RENDER', 'エクスポート成功', {
            size: buffer.byteLength,
            sizeMB: (buffer.byteLength / 1024 / 1024).toFixed(2)
          });
          setExportUrl(url);
          setExportExt('mp4');
          onRecordingStop(url, 'mp4');
        } else {
          useLogStore.getState().warn('RENDER', 'エクスポートバッファが空');
          onRecordingError?.('エクスポートに失敗しました。書き出しデータが空です。');
        }

      } catch (err) {
        const isAbort =
          signal.aborted ||
          (err as any)?.name === 'AbortError' ||
          (err as any)?.message?.includes('Aborted');

        if (!isAbort) {
          useLogStore.getState().error('RENDER', 'エクスポート失敗', {
            error: err instanceof Error ? err.message : String(err)
          });
          console.error('Export failed:', err);
          onRecordingError?.(
            err instanceof Error ? `エクスポートに失敗しました: ${err.message}` : 'エクスポートに失敗しました'
          );
        } else {
          useLogStore.getState().info('RENDER', 'エクスポートが中断されました');
          onRecordingError?.('エクスポートが中断されました');
        }
      } finally {
        // ScriptProcessorNodeのクリーンアップ（エラー時の保険）
        if (scriptProcessorNode) {
          scriptProcessorNode.onaudioprocess = null;
          try { scriptProcessorNode.disconnect(); } catch (e) { /* ignore */ }
        }
        if (scriptProcessorSource) {
          try { scriptProcessorSource.disconnect(); } catch (e) { /* ignore */ }
        }
        // [iOS Safari対策] 直接接続したMixerNodeの切断
        if (isIosSafari && audioMixerNode && scriptProcessorNode) {
          try { audioMixerNode.disconnect(scriptProcessorNode); } catch (e) { /* ignore */ }
        }
        // リソース解放などはGCに任せるが、明示的なcloseも可
        // controllerはstopExportでabort済み
        // ReaderのキャンセルもstopExportで実施済み
        abortControllerRef.current = null;
        videoReaderRef.current = null;
        audioReaderRef.current = null;
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
