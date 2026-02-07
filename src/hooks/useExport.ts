/**
 * @file useExport.ts
 * @author Turtle Village
 * @description WebCodecs APIとmp4-muxerを使用して、編集内容をMP4ファイルとして書き出すためのカスタムフック。
 */
import { useState, useRef, useCallback } from 'react';
import { FPS, EXPORT_VIDEO_BITRATE } from '../constants';
import * as Mp4Muxer from 'mp4-muxer';
import type { MediaItem, AudioTrack } from '../types';
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
    audioSources?: ExportAudioSources  // iOS Safari: OfflineAudioContext用音声ソース
  ) => void;
  stopExport: () => void; // 明示的な停止メソッドを追加
  clearExportUrl: () => void;
}

/**
 * エクスポート用の音声ソース情報。
 * iOS Safari の OfflineAudioContext プリレンダリングに使用。
 */
export interface ExportAudioSources {
  mediaItems: MediaItem[];
  bgm: AudioTrack | null;
  narration: AudioTrack | null;
  totalDuration: number;
}

/**
 * OfflineAudioContext を使用して全音声をオフラインでミックスダウンする。
 * iOS Safari のリアルタイム音声キャプチャ問題（MediaStreamAudioDestinationNode / ScriptProcessorNode
 * 経由でデータがドロップされる）を完全に回避する。
 */
async function offlineRenderAudio(
  sources: ExportAudioSources,
  mainCtx: BaseAudioContext,
  sampleRate: number,
  signal: AbortSignal,
): Promise<AudioBuffer | null> {
  const { mediaItems, bgm, narration, totalDuration } = sources;
  if (totalDuration <= 0) return null;

  const log = useLogStore.getState();
  const numberOfChannels = 2;
  const length = Math.ceil((totalDuration + 0.5) * sampleRate); // +0.5s safety margin

  log.info('RENDER', 'OfflineAudioContext 音声プリレンダリング開始', {
    totalDuration: Math.round(totalDuration * 100) / 100,
    sampleRate,
    estimatedSizeMB: Math.round((length * numberOfChannels * 4) / 1024 / 1024 * 10) / 10,
  });

  const offlineCtx = new OfflineAudioContext(numberOfChannels, length, sampleRate);

  // Helper: ファイルから音声をデコード
  // メインAudioContextを使用して decodeAudioData を呼ぶ（iOS Safariではコンテナ形式の
  // デコード互換性がメインコンテキストの方が高い。OfflineAudioContext上での
  // decodeAudioDataはビデオコンテナ(MP4等)のオーディオ抽出に失敗する場合がある）
  async function decodeAudio(file: File | { name: string }, url: string): Promise<AudioBuffer | null> {
    const fileName = file instanceof File ? file.name : (file as { name: string }).name;
    try {
      let arrayBuffer: ArrayBuffer;
      if (file instanceof File) {
        arrayBuffer = await file.arrayBuffer();
        log.info('RENDER', `[DIAG-DECODE] File.arrayBuffer 取得成功`, {
          fileName,
          arrayBufferSize: arrayBuffer.byteLength,
          arrayBufferSizeKB: Math.round(arrayBuffer.byteLength / 1024),
        });
      } else {
        const response = await fetch(url);
        if (!response.ok) {
          log.warn('RENDER', `[DIAG-DECODE] fetch 失敗`, {
            fileName,
            status: response.status,
            statusText: response.statusText,
          });
          return null;
        }
        arrayBuffer = await response.arrayBuffer();
        log.info('RENDER', `[DIAG-DECODE] fetch + arrayBuffer 取得成功`, {
          fileName,
          arrayBufferSize: arrayBuffer.byteLength,
          arrayBufferSizeKB: Math.round(arrayBuffer.byteLength / 1024),
        });
      }

      if (arrayBuffer.byteLength === 0) {
        log.warn('RENDER', `[DIAG-DECODE] ArrayBuffer が空です`, { fileName });
        return null;
      }

      // decodeAudioData は渡されたバッファを detach するため、コピーを渡す
      // メインctxで再生時に動作実績のある decodeAudioData を使用
      log.info('RENDER', `[DIAG-DECODE] decodeAudioData 呼び出し開始`, {
        fileName,
        usingContext: (mainCtx as any).constructor?.name || 'unknown',
        contextState: (mainCtx as any).state || 'N/A',
        bufferSize: arrayBuffer.byteLength,
      });
      const decoded = await mainCtx.decodeAudioData(arrayBuffer.slice(0));
      log.info('RENDER', `[DIAG-DECODE] 音声デコード成功`, {
        fileName,
        duration: Math.round(decoded.duration * 100) / 100,
        channels: decoded.numberOfChannels,
        sampleRate: decoded.sampleRate,
        length: decoded.length,
      });
      return decoded;
    } catch (e) {
      log.warn('RENDER', `[DIAG-DECODE] 音声デコード失敗`, {
        fileName,
        error: e instanceof Error ? e.message : String(e),
        errorName: e instanceof Error ? e.name : 'unknown',
      });
      return null;
    }
  }

  let scheduledSources = 0;

  // 1. ビデオクリップの音声
  let timelinePosition = 0;
  for (const item of mediaItems) {
    if (signal.aborted) return null;

    if (item.type === 'video' && !item.isMuted && item.volume > 0) {
      const audioBuffer = await decodeAudio(item.file, item.url);
      if (audioBuffer) {
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        const gain = offlineCtx.createGain();
        source.connect(gain);
        gain.connect(offlineCtx.destination);

        const vol = item.volume;
        const clipStart = timelinePosition;
        const clipEnd = clipStart + item.duration;

        // フェード時間のクランプ（重なった場合に按分）
        let fadeInDur = item.fadeIn ? (item.fadeInDuration || 1.0) : 0;
        let fadeOutDur = item.fadeOut ? (item.fadeOutDuration || 1.0) : 0;
        if (fadeInDur + fadeOutDur > item.duration) {
          const ratio = item.duration / (fadeInDur + fadeOutDur);
          fadeInDur *= ratio;
          fadeOutDur *= ratio;
        }

        // ゲインエンベロープ設定
        gain.gain.setValueAtTime(0, 0);
        if (fadeInDur > 0) {
          gain.gain.setValueAtTime(0, clipStart);
          gain.gain.linearRampToValueAtTime(vol, clipStart + fadeInDur);
        } else {
          gain.gain.setValueAtTime(vol, clipStart);
        }
        if (fadeOutDur > 0) {
          gain.gain.setValueAtTime(vol, clipEnd - fadeOutDur);
          gain.gain.linearRampToValueAtTime(0, clipEnd);
        }

        source.start(clipStart, item.trimStart, item.duration);
        scheduledSources++;

        // [DIAG-SCHED] クリップスケジュール詳細
        log.info('RENDER', `[DIAG-SCHED] クリップ音声スケジュール`, {
          fileName: item.file instanceof File ? item.file.name : '(not File)',
          clipStart: Math.round(clipStart * 100) / 100,
          clipEnd: Math.round(clipEnd * 100) / 100,
          trimStart: item.trimStart,
          duration: Math.round(item.duration * 100) / 100,
          volume: vol,
          bufferDuration: Math.round(audioBuffer.duration * 100) / 100,
          bufferSampleRate: audioBuffer.sampleRate,
          scheduledSources,
        });
      }
    } else {
      // [DIAG-SCHED] スキップ理由もログ
      log.info('RENDER', `[DIAG-SCHED] クリップスキップ`, {
        type: item.type,
        isMuted: item.isMuted,
        volume: item.volume,
        timelinePosition: Math.round(timelinePosition * 100) / 100,
      });
    }
    timelinePosition += item.duration;
  }

  // Helper: BGM/ナレーションのスケジューリング
  async function scheduleAudioTrack(track: AudioTrack, label: string): Promise<void> {
    if (signal.aborted) return;
    const audioBuffer = await decodeAudio(track.file, track.url);
    if (!audioBuffer) return;

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    const gain = offlineCtx.createGain();
    source.connect(gain);
    gain.connect(offlineCtx.destination);

    const vol = track.volume;
    const trackStart = Math.max(0, track.delay);
    const sourceOffset = track.startPoint;
    const availableDuration = track.duration - track.startPoint;
    const availableTimeline = totalDuration - trackStart;
    const playDuration = Math.min(availableDuration, availableTimeline);
    if (playDuration <= 0) return;

    const fadeInDur = track.fadeIn ? (track.fadeInDuration || 1.0) : 0;
    const fadeOutDur = track.fadeOut ? (track.fadeOutDuration || 1.0) : 0;

    // ゲインエンベロープ
    gain.gain.setValueAtTime(0, 0);
    if (fadeInDur > 0) {
      gain.gain.setValueAtTime(0, trackStart);
      gain.gain.linearRampToValueAtTime(vol, trackStart + fadeInDur);
    } else {
      gain.gain.setValueAtTime(vol, trackStart);
    }
    if (fadeOutDur > 0) {
      // BGM/ナレーションのフェードアウトはプロジェクト終端からの相対位置
      const fadeOutStart = Math.max(trackStart + fadeInDur, totalDuration - fadeOutDur);
      gain.gain.setValueAtTime(vol, fadeOutStart);
      gain.gain.linearRampToValueAtTime(0, totalDuration);
    }

    source.start(trackStart, sourceOffset, playDuration);
    scheduledSources++;
    log.info('RENDER', `${label}音声スケジュール完了`, {
      start: trackStart, offset: sourceOffset, duration: Math.round(playDuration * 10) / 10,
    });
  }

  // 2. BGM
  if (bgm) await scheduleAudioTrack(bgm, 'BGM');
  // 3. ナレーション
  if (narration) await scheduleAudioTrack(narration, 'ナレーション');

  if (signal.aborted) return null;

  log.info('RENDER', 'OfflineAudioContext レンダリング実行', { scheduledSources });

  try {
    const renderedBuffer = await offlineCtx.startRendering();

    // 診断: レンダリング結果の振幅チェック（iOS Safari でデコード失敗時にゼロバッファになる）
    let maxAmplitude = 0;
    let nonZeroSamples = 0;
    for (let ch = 0; ch < renderedBuffer.numberOfChannels; ch++) {
      const data = renderedBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i += 100) { // 100サンプル毎にチェック（パフォーマンス考慮）
        const abs = Math.abs(data[i]);
        if (abs > 1e-10) nonZeroSamples++;
        if (abs > maxAmplitude) maxAmplitude = abs;
      }
    }

    log.info('RENDER', 'OfflineAudioContext レンダリング完了', {
      duration: Math.round(renderedBuffer.duration * 100) / 100,
      length: renderedBuffer.length,
      channels: renderedBuffer.numberOfChannels,
      maxAmplitude: Math.round(maxAmplitude * 10000) / 10000,
      nonZeroSamples,
    });

    if (maxAmplitude < 1e-8) {
      log.warn('RENDER', '⚠️ レンダリング結果がほぼ無音です。音声デコードまたはミキシングに問題がある可能性があります');
    }

    return renderedBuffer;
  } catch (e) {
    log.error('RENDER', 'OfflineAudioContext レンダリング失敗', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * プリレンダリング済み AudioBuffer を AudioEncoder にチャンク分割して供給する。
 * f32-planar 形式を使用（AudioBuffer のネイティブ形式であり、
 * iOS Safari の AudioEncoder との互換性が高い）。
 */
function feedPreRenderedAudio(
  renderedAudio: AudioBuffer,
  audioEncoder: AudioEncoder,
  signal: AbortSignal,
): number {
  const log = useLogStore.getState();
  const chunkSize = 4096;
  let audioOffset = 0;
  const totalSamples = renderedAudio.length;
  let audioTimestamp = 0;
  let encodedChunks = 0;
  const ch0 = renderedAudio.getChannelData(0);
  const ch1 = renderedAudio.numberOfChannels >= 2
    ? renderedAudio.getChannelData(1) : ch0;

  // 診断: 入力データの振幅チェック
  let inputMaxAmp = 0;
  for (let i = 0; i < ch0.length; i += 1000) {
    const a = Math.abs(ch0[i]);
    if (a > inputMaxAmp) inputMaxAmp = a;
    if (ch1 !== ch0) {
      const b = Math.abs(ch1[i]);
      if (b > inputMaxAmp) inputMaxAmp = b;
    }
  }
  log.info('RENDER', 'feedPreRenderedAudio 入力診断', {
    totalSamples,
    inputMaxAmplitude: Math.round(inputMaxAmp * 10000) / 10000,
    sampleRate: renderedAudio.sampleRate,
    channels: renderedAudio.numberOfChannels,
  });

  while (audioOffset < totalSamples && !signal.aborted) {
    const framesToProcess = Math.min(chunkSize, totalSamples - audioOffset);

    // f32-planar 形式: [ch0全サンプル, ch1全サンプル] の順に配置
    // AudioBuffer.getChannelData() が返すプレーナー形式をそのまま活用
    const planarData = new Float32Array(framesToProcess * 2);
    planarData.set(ch0.subarray(audioOffset, audioOffset + framesToProcess), 0);
    planarData.set(ch1.subarray(audioOffset, audioOffset + framesToProcess), framesToProcess);

    if (audioEncoder.state === 'configured') {
      try {
        const audioData = new AudioData({
          format: 'f32-planar' as AudioSampleFormat,
          sampleRate: renderedAudio.sampleRate,
          numberOfFrames: framesToProcess,
          numberOfChannels: 2,
          timestamp: audioTimestamp,
          data: planarData,
        });
        audioEncoder.encode(audioData);
        audioData.close();
        encodedChunks++;
      } catch (e) {
        // 初回エラーのみログ
        if (encodedChunks === 0) {
          log.error('RENDER', 'AudioData/Encode 失敗', {
            error: e instanceof Error ? e.message : String(e),
            format: 'f32-planar',
            framesToProcess,
            timestamp: audioTimestamp,
          });
        }
      }
    }

    audioOffset += framesToProcess;
    audioTimestamp += Math.round((framesToProcess / renderedAudio.sampleRate) * 1e6);
  }

  log.info('RENDER', 'プリレンダリング音声エンコード完了', {
    totalChunks: Math.ceil(totalSamples / chunkSize),
    encodedChunks,
    totalSamples,
    format: 'f32-planar',
    encodeQueueSize: audioEncoder.encodeQueueSize,
  });

  return encodedChunks;
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
      audioSources?: ExportAudioSources
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

      // ============================================================
      // [DIAG-1] プラットフォーム検出・入力情報の診断ログ
      // ============================================================
      useLogStore.getState().info('RENDER', '[DIAG-1] プラットフォーム・入力診断', {
        isIOS,
        isSafari,
        isIosSafari,
        userAgent: userAgent.substring(0, 120),
        platform: typeof navigator !== 'undefined' ? navigator.platform : 'N/A',
        maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints : -1,
        hasAudioTrack: !!audioTrack,
        audioContextState: (audioContext as AudioContext).state,
        audioContextSampleRate: audioContext.sampleRate,
        hasAudioSources: !!audioSources,
        audioSourcesDetail: audioSources ? {
          mediaItemCount: audioSources.mediaItems.length,
          videoItemCount: audioSources.mediaItems.filter(i => i.type === 'video').length,
          hasBgm: !!audioSources.bgm,
          hasNarration: !!audioSources.narration,
          totalDuration: Math.round(audioSources.totalDuration * 100) / 100,
        } : null,
      });

      // [DIAG-1b] 全MediaItemの詳細一覧
      if (audioSources && isIosSafari) {
        audioSources.mediaItems.forEach((item, idx) => {
          useLogStore.getState().info('RENDER', `[DIAG-1b] MediaItem[${idx}]`, {
            type: item.type,
            name: item.file instanceof File ? item.file.name : '(not File)',
            hasFile: item.file instanceof File,
            hasUrl: !!item.url,
            duration: Math.round(item.duration * 100) / 100,
            volume: item.volume,
            isMuted: item.isMuted,
            trimStart: item.trimStart,
            fadeIn: item.fadeIn,
            fadeOut: item.fadeOut,
          });
        });
      }

      type TrackProcessorConstructor = new (init: { track: MediaStreamTrack }) => {
        readable: ReadableStream<VideoFrame | AudioData>;
      };
      const TrackProcessor = (
        window as typeof window & { MediaStreamTrackProcessor?: TrackProcessorConstructor }
      ).MediaStreamTrackProcessor;
      const canUseTrackProcessor = typeof TrackProcessor === 'function';
      const useManualCanvasFrames = isIosSafari || !canUseTrackProcessor;
      // iOS Safari では OfflineAudioContext でプリレンダリングするため、
      // TrackProcessor / ScriptProcessor は基本的に不要。
      // OfflineAudioContext 失敗時のフォールバックとして ScriptProcessor を使用。
      const useScriptProcessorAudio = isIosSafari;
      const trackProcessorCtor = TrackProcessor as TrackProcessorConstructor | undefined;

      // 停止用シグナル
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const { signal } = controller;

      // ScriptProcessorNode用（OfflineAudioContext失敗時のフォールバック）
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
        let audioEncoderOutputChunks = 0;
        let audioEncoderOutputBytes = 0;
        const audioEncoder = new AudioEncoder({
          output: (chunk, meta) => {
            audioEncoderOutputChunks++;
            audioEncoderOutputBytes += chunk.byteLength;
            // [DIAG-ENC-OUT] 初回出力とその後10チャンクごとにログ
            if (audioEncoderOutputChunks === 1) {
              useLogStore.getState().info('RENDER', '[DIAG-ENC-OUT] AudioEncoder 初回出力チャンク', {
                chunkByteLength: chunk.byteLength,
                chunkType: chunk.type,
                chunkTimestamp: chunk.timestamp,
                chunkDuration: chunk.duration,
                hasMeta: !!meta,
                metaDecoderConfig: meta?.decoderConfig ? {
                  codec: meta.decoderConfig.codec,
                  sampleRate: meta.decoderConfig.sampleRate,
                  numberOfChannels: meta.decoderConfig.numberOfChannels,
                } : null,
              });
            } else if (audioEncoderOutputChunks % 50 === 0) {
              useLogStore.getState().info('RENDER', `[DIAG-ENC-OUT] AudioEncoder 出力中 (${audioEncoderOutputChunks}チャンク)`, {
                totalBytes: audioEncoderOutputBytes,
              });
            }
            muxer.addAudioChunk(chunk, meta);
          },
          error: (e) => {
            useLogStore.getState().error('RENDER', 'AudioEncoder エラー', { error: String(e) });
            console.error('AudioEncoder error:', e);
          },
        });
        const audioEncoderConfig = {
          codec: 'mp4a.40.2' as const, // AAC-LC
          sampleRate: audioContext.sampleRate,
          numberOfChannels: 2 as const,
          bitrate: 128000,
        };
        audioEncoder.configure(audioEncoderConfig);

        // ============================================================
        // [DIAG-2] AudioEncoder 設定完了後の状態確認
        // ============================================================
        useLogStore.getState().info('RENDER', '[DIAG-2] AudioEncoder 設定完了', {
          state: audioEncoder.state,
          codec: audioEncoderConfig.codec,
          sampleRate: audioEncoderConfig.sampleRate,
          numberOfChannels: audioEncoderConfig.numberOfChannels,
          bitrate: audioEncoderConfig.bitrate,
        });

        // === iOS Safari: OfflineAudioContext による音声プリレンダリング ===
        let offlineAudioDone = false;
        if (isIosSafari && audioSources) {
          // [DIAG-3] OfflineAudioContext パス開始
          useLogStore.getState().info('RENDER', '[DIAG-3] iOS Safari: OfflineAudioContext パス開始', {
            totalDuration: audioSources.totalDuration,
            sampleRate: audioContext.sampleRate,
            audioEncoderState: audioEncoder.state,
          });
          try {
            const renderedAudio = await offlineRenderAudio(
              audioSources,
              audioContext,  // メインAudioContextでデコード（iOS Safari互換性向上）
              audioContext.sampleRate,
              signal,
            );
            if (renderedAudio && !signal.aborted) {
              // [DIAG-4] feedPreRenderedAudio 呼び出し前の AudioEncoder 状態
              useLogStore.getState().info('RENDER', '[DIAG-4] feed開始前 AudioEncoder状態', {
                state: audioEncoder.state,
                queueSize: audioEncoder.encodeQueueSize,
                outputChunksSoFar: audioEncoderOutputChunks,
              });
              const encodedChunks = feedPreRenderedAudio(renderedAudio, audioEncoder, signal);
              // [DIAG-5] feed完了後の AudioEncoder 状態
              useLogStore.getState().info('RENDER', '[DIAG-5] feed完了後 AudioEncoder状態', {
                state: audioEncoder.state,
                queueSize: audioEncoder.encodeQueueSize,
                outputChunksAfterFeed: audioEncoderOutputChunks,
                encodedInputChunks: encodedChunks,
              });
              offlineAudioDone = true;
              useLogStore.getState().info('RENDER', '[DIAG-5b] iOS Safari: 音声プリレンダリング＆エンコード完了', {
                encodedChunks,
                audioEncoderOutputChunks,
                audioEncoderOutputBytes,
                offlineAudioDone,
              });
            } else if (!signal.aborted) {
              useLogStore.getState().warn('RENDER', 'OfflineAudioContext失敗、ScriptProcessorにフォールバック');
            }
          } catch (e) {
            useLogStore.getState().warn('RENDER', 'OfflineAudioContext例外、ScriptProcessorにフォールバック', {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // ============================================================
        // [DIAG-6] オフラインレンダリング後のパス分岐判断
        // ============================================================
        useLogStore.getState().info('RENDER', '[DIAG-6] 音声パス判断結果', {
          offlineAudioDone,
          isIosSafari,
          hasAudioSources: !!audioSources,
          audioEncoderOutputChunks,
          audioEncoderOutputBytes,
          willUseScriptProcessor: !offlineAudioDone && isIosSafari,
          willUseTrackProcessor: !isIosSafari && !!audioTrack && canUseTrackProcessor,
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
        } else if (!offlineAudioDone) {
          // ScriptProcessorNode 経由の音声キャプチャ（フォールバック）
          // iOS Safari で OfflineAudioContext が失敗した場合、または非Safari で TrackProcessor 非対応時。
          useLogStore.getState().info('RENDER', 'ScriptProcessorNode経由で音声をキャプチャ（フォールバック）', {
            isIosSafari,
            canUseTrackProcessor,
            hasAudioTrack: !!audioTrack,
          });

          const audioCtx = audioContext as AudioContext;
          const bufferSize = 4096;
          scriptProcessorNode = audioCtx.createScriptProcessor(bufferSize, 2, 2);

          let audioTimestamp = 0;
          let capturedChunks = 0;

          scriptProcessorSource = audioCtx.createMediaStreamSource(masterDestRef.current!.stream);
          scriptProcessorSource.connect(scriptProcessorNode);
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

        // ============================================================
        // [DIAG-7] フラッシュ前の最終状態
        // ============================================================
        useLogStore.getState().info('RENDER', '[DIAG-7] エンコーダー flush 開始', {
          audioEncoderOutputChunks,
          audioEncoderOutputBytes,
          audioEncoderState: audioEncoder.state,
          audioEncoderQueueSize: audioEncoder.encodeQueueSize,
          videoEncoderState: videoEncoder.state,
          videoEncoderQueueSize: videoEncoder.encodeQueueSize,
          offlineAudioDone,
        });
        await videoEncoder.flush();
        useLogStore.getState().info('RENDER', '[DIAG-7b] VideoEncoder flush 完了');
        try {
          await audioEncoder.flush();
          useLogStore.getState().info('RENDER', '[DIAG-7c] AudioEncoder flush 完了', {
            outputChunksAfterFlush: audioEncoderOutputChunks,
            outputBytesAfterFlush: audioEncoderOutputBytes,
          });
        } catch (flushErr) {
          useLogStore.getState().error('RENDER', '[DIAG-7c] AudioEncoder flush 失敗', {
            error: flushErr instanceof Error ? flushErr.message : String(flushErr),
            audioEncoderState: audioEncoder.state,
          });
        }

        // ============================================================
        // [DIAG-8] Muxer finalize
        // ============================================================
        muxer.finalize();
        useLogStore.getState().info('RENDER', '[DIAG-8] Muxer finalize 完了', {
          bufferByteLength: muxer.target.buffer.byteLength,
          audioEncoderOutputChunks,
          audioEncoderOutputBytes,
        });

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
          // ============================================================
          // [DIAG-9] エクスポート最終結果
          // ============================================================
          useLogStore.getState().info('RENDER', '[DIAG-9] エクスポート完了 最終結果', {
            fileSizeBytes: buffer.byteLength,
            fileSizeMB: (buffer.byteLength / 1024 / 1024).toFixed(2),
            audioEncoderOutputChunks,
            audioEncoderOutputBytes,
            audioDataPresent: audioEncoderOutputChunks > 0,
            offlineAudioDone,
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
