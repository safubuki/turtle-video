import React, { useState, useRef, useEffect, useCallback } from 'react';

import type { MediaItem, AudioTrack } from '../types';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  FPS,
  VOICE_OPTIONS,
  GEMINI_API_BASE_URL,
  GEMINI_SCRIPT_MODEL,
  GEMINI_TTS_MODEL,
  TTS_SAMPLE_RATE,
  EXPORT_VIDEO_BITRATE,
  CAPTION_FADE_DURATION,
} from '../constants';

// Zustand Stores
import { useMediaStore, useAudioStore, useUIStore, useCaptionStore } from '../stores';

// コンポーネント
import Toast from './common/Toast';
import ErrorMessage from './common/ErrorMessage';
import MediaResourceLoader from './media/MediaResourceLoader';
import Header from './Header';
import ClipsSection from './sections/ClipsSection';
import BgmSection from './sections/BgmSection';
import NarrationSection from './sections/NarrationSection';
import CaptionSection from './sections/CaptionSection';
import PreviewSection from './sections/PreviewSection';
import AiModal from './modals/AiModal';
import SettingsModal, { getStoredApiKey } from './modals/SettingsModal';

// API キー取得関数（localStorage優先、フォールバックで環境変数）
const getApiKey = (): string => {
  const storedKey = getStoredApiKey();
  if (storedKey) return storedKey;
  return import.meta.env.VITE_GEMINI_API_KEY || '';
};

const TurtleVideo: React.FC = () => {
  // === Zustand Stores ===
  // Media Store
  const mediaItems = useMediaStore((s) => s.mediaItems);
  const totalDuration = useMediaStore((s) => s.totalDuration);
  const isClipsLocked = useMediaStore((s) => s.isClipsLocked);
  const addMediaItems = useMediaStore((s) => s.addMediaItems);
  const removeMediaItem = useMediaStore((s) => s.removeMediaItem);
  const moveMediaItem = useMediaStore((s) => s.moveMediaItem);
  const setVideoDuration = useMediaStore((s) => s.setVideoDuration);
  const updateVideoTrim = useMediaStore((s) => s.updateVideoTrim);
  const updateImageDuration = useMediaStore((s) => s.updateImageDuration);
  const updateScale = useMediaStore((s) => s.updateScale);
  const updatePosition = useMediaStore((s) => s.updatePosition);
  const resetTransform = useMediaStore((s) => s.resetTransform);
  const toggleTransformPanel = useMediaStore((s) => s.toggleTransformPanel);
  const updateVolume = useMediaStore((s) => s.updateVolume);
  const toggleMute = useMediaStore((s) => s.toggleMute);
  const toggleFadeIn = useMediaStore((s) => s.toggleFadeIn);
  const toggleFadeOut = useMediaStore((s) => s.toggleFadeOut);
  const toggleItemLock = useMediaStore((s) => s.toggleItemLock);
  const toggleClipsLock = useMediaStore((s) => s.toggleClipsLock);
  const clearAllMedia = useMediaStore((s) => s.clearAllMedia);

  // Audio Store
  const bgm = useAudioStore((s) => s.bgm);
  const isBgmLocked = useAudioStore((s) => s.isBgmLocked);
  const narration = useAudioStore((s) => s.narration);
  const isNarrationLocked = useAudioStore((s) => s.isNarrationLocked);
  const setBgm = useAudioStore((s) => s.setBgm);
  const updateBgmStartPoint = useAudioStore((s) => s.updateBgmStartPoint);
  const updateBgmDelay = useAudioStore((s) => s.updateBgmDelay);
  const updateBgmVolume = useAudioStore((s) => s.updateBgmVolume);
  const toggleBgmFadeIn = useAudioStore((s) => s.toggleBgmFadeIn);
  const toggleBgmFadeOut = useAudioStore((s) => s.toggleBgmFadeOut);
  const toggleBgmLock = useAudioStore((s) => s.toggleBgmLock);
  const removeBgm = useAudioStore((s) => s.removeBgm);
  const setNarration = useAudioStore((s) => s.setNarration);
  const updateNarrationStartPoint = useAudioStore((s) => s.updateNarrationStartPoint);
  const updateNarrationDelay = useAudioStore((s) => s.updateNarrationDelay);
  const updateNarrationVolume = useAudioStore((s) => s.updateNarrationVolume);
  const toggleNarrationFadeIn = useAudioStore((s) => s.toggleNarrationFadeIn);
  const toggleNarrationFadeOut = useAudioStore((s) => s.toggleNarrationFadeOut);
  const toggleNarrationLock = useAudioStore((s) => s.toggleNarrationLock);
  const removeNarration = useAudioStore((s) => s.removeNarration);
  const clearAllAudio = useAudioStore((s) => s.clearAllAudio);

  // UI Store
  const toastMessage = useUIStore((s) => s.toastMessage);
  const errorMsg = useUIStore((s) => s.errorMsg);
  const isPlaying = useUIStore((s) => s.isPlaying);
  const currentTime = useUIStore((s) => s.currentTime);
  const isProcessing = useUIStore((s) => s.isProcessing);
  const exportUrl = useUIStore((s) => s.exportUrl);
  const exportExt = useUIStore((s) => s.exportExt);
  const showAiModal = useUIStore((s) => s.showAiModal);
  const aiPrompt = useUIStore((s) => s.aiPrompt);
  const aiScript = useUIStore((s) => s.aiScript);
  const aiVoice = useUIStore((s) => s.aiVoice);
  const aiVoiceStyle = useUIStore((s) => s.aiVoiceStyle);
  const isAiLoading = useUIStore((s) => s.isAiLoading);
  const showToast = useUIStore((s) => s.showToast);
  const clearToast = useUIStore((s) => s.clearToast);
  const setError = useUIStore((s) => s.setError);
  const clearError = useUIStore((s) => s.clearError);
  const play = useUIStore((s) => s.play);
  const pause = useUIStore((s) => s.pause);
  const setCurrentTime = useUIStore((s) => s.setCurrentTime);
  const setProcessing = useUIStore((s) => s.setProcessing);
  const setExportUrl = useUIStore((s) => s.setExportUrl);
  const setExportExt = useUIStore((s) => s.setExportExt);
  const clearExport = useUIStore((s) => s.clearExport);
  const openAiModal = useUIStore((s) => s.openAiModal);
  const closeAiModal = useUIStore((s) => s.closeAiModal);
  const setAiPrompt = useUIStore((s) => s.setAiPrompt);
  const setAiScript = useUIStore((s) => s.setAiScript);
  const setAiVoice = useUIStore((s) => s.setAiVoice);
  const setAiVoiceStyle = useUIStore((s) => s.setAiVoiceStyle);
  const setAiLoading = useUIStore((s) => s.setAiLoading);
  const resetUI = useUIStore((s) => s.resetUI);

  // Caption Store
  const captions = useCaptionStore((s) => s.captions);
  const captionSettings = useCaptionStore((s) => s.settings);
  const isCaptionLocked = useCaptionStore((s) => s.isLocked);
  const addCaption = useCaptionStore((s) => s.addCaption);
  const updateCaption = useCaptionStore((s) => s.updateCaption);
  const removeCaption = useCaptionStore((s) => s.removeCaption);
  const setCaptionEnabled = useCaptionStore((s) => s.setEnabled);
  const setCaptionFontSize = useCaptionStore((s) => s.setFontSize);
  const setCaptionFontStyle = useCaptionStore((s) => s.setFontStyle);
  const setCaptionPosition = useCaptionStore((s) => s.setPosition);
  const toggleCaptionLock = useCaptionStore((s) => s.toggleLock);
  const resetCaptions = useCaptionStore((s) => s.resetCaptions);

  // === Local State ===
  const [reloadKey, setReloadKey] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  // Ref
  const mediaItemsRef = useRef<MediaItem[]>([]);
  const bgmRef = useRef<AudioTrack | null>(null);
  const narrationRef = useRef<AudioTrack | null>(null);
  const totalDurationRef = useRef(0);
  const currentTimeRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaElementsRef = useRef<Record<string, HTMLVideoElement | HTMLImageElement | HTMLAudioElement>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Audio Nodes
  const sourceNodesRef = useRef<Record<string, MediaElementAudioSourceNode>>({});
  const gainNodesRef = useRef<Record<string, GainNode>>({});

  const masterDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const reqIdRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const loopIdRef = useRef(0); // ループの世代を追跡
  const isPlayingRef = useRef(false); // 再生状態を即座に反映するRef
  const isSeekingRef = useRef(false); // シーク中フラグ
  const activeVideoIdRef = useRef<string | null>(null); // 現在再生中のビデオID
  const lastToggleTimeRef = useRef(0); // デバウンス用

  // --- Helper: renderFrame ---
  const renderFrame = useCallback(
    (time: number, isActivePlaying = false, _isExporting = false) => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const currentItems = mediaItemsRef.current;
        const currentBgm = bgmRef.current;
        const currentNarration = narrationRef.current;

        let t = 0;
        let activeId: string | null = null;
        let localTime = 0;
        let activeIndex = -1;

        for (let i = 0; i < currentItems.length; i++) {
          const item = currentItems[i];
          if (time >= t && time < t + item.duration) {
            activeId = item.id;
            activeIndex = i;
            localTime = time - t;
            break;
          }
          t += item.duration;
        }

        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Preload
        if (isActivePlaying && activeIndex !== -1 && activeIndex + 1 < currentItems.length) {
          const nextItem = currentItems[activeIndex + 1];
          if (nextItem.type === 'video') {
            const remainingTime = currentItems[activeIndex].duration - localTime;
            if (remainingTime < 1.5) {
              const nextElement = mediaElementsRef.current[nextItem.id] as HTMLVideoElement;
              if (nextElement && (nextElement.paused || nextElement.readyState < 2)) {
                const nextStart = nextItem.trimStart || 0;
                if (Math.abs(nextElement.currentTime - nextStart) > 0.1) {
                  nextElement.currentTime = nextStart;
                }
              }
            }
          }
        }

        Object.keys(mediaElementsRef.current).forEach((id) => {
          if (id === 'bgm' || id === 'narration') return;

          const element = mediaElementsRef.current[id];
          const gainNode = gainNodesRef.current[id];
          const conf = currentItems.find((v) => v.id === id);

          if (!element || !conf) return;

          if (id === activeId) {
            if (conf.type === 'video') {
              const videoEl = element as HTMLVideoElement;
              const targetTime = (conf.trimStart || 0) + localTime;

              // 動画がエラー状態または未読み込み状態の場合はリロードを試みる
              // これにより、シーク操作などで壊れた動画を回復できる
              if (videoEl.readyState === 0 && !videoEl.error) {
                try {
                  videoEl.load();
                } catch (e) {
                  /* ignore */
                }
              }

              // シーク中は何もしない
              if (!isSeekingRef.current) {
                if (isActivePlaying) {
                  // 再生中: 大きなズレがあれば補正
                  if (Math.abs(videoEl.currentTime - targetTime) > 0.5) {
                    videoEl.currentTime = targetTime;
                  }
                  // 一時停止していれば再生（ビデオ切り替え時など）
                  if (videoEl.paused && activeVideoIdRef.current === id) {
                    videoEl.play().catch(() => {});
                  }
                } else {
                  // 停止中: ビデオも停止状態にして位置を合わせる
                  if (!videoEl.paused) {
                    videoEl.pause();
                  }
                  if (Math.abs(videoEl.currentTime - targetTime) > 0.05) {
                    videoEl.currentTime = targetTime;
                  }
                }
              }
            }

            // 描画
            const isVideo = conf.type === 'video';
            const videoEl = element as HTMLVideoElement;
            const imgEl = element as HTMLImageElement;
            const isReady = isVideo ? videoEl.readyState >= 1 : imgEl.complete;

            if (isReady) {
              const elemW = isVideo ? videoEl.videoWidth : imgEl.naturalWidth;
              const elemH = isVideo ? videoEl.videoHeight : imgEl.naturalHeight;
              if (elemW && elemH) {
                const scaleFactor = conf.scale || 1.0;
                const userX = conf.positionX || 0;
                const userY = conf.positionY || 0;

                const baseScale = Math.min(CANVAS_WIDTH / elemW, CANVAS_HEIGHT / elemH);

                ctx.save();
                ctx.translate(CANVAS_WIDTH / 2 + userX, CANVAS_HEIGHT / 2 + userY);
                ctx.scale(baseScale * scaleFactor, baseScale * scaleFactor);

                let alpha = 1.0;
                if (conf.fadeIn && localTime < 1.0) alpha = localTime;
                else if (conf.fadeOut && localTime > conf.duration - 1.0)
                  alpha = conf.duration - localTime;

                ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
                ctx.drawImage(element as CanvasImageSource, -elemW / 2, -elemH / 2, elemW, elemH);
                ctx.restore();
                ctx.globalAlpha = 1.0;
              }
            }

            if (conf.type === 'video' && gainNode && audioCtxRef.current) {
              if (isActivePlaying) {
                let vol = conf.isMuted ? 0 : conf.volume;
                if (conf.fadeIn && localTime < 1.0) vol *= localTime;
                else if (conf.fadeOut && localTime > conf.duration - 1.0)
                  vol *= conf.duration - localTime;
                gainNode.gain.setTargetAtTime(vol, audioCtxRef.current.currentTime, 0.05);
              } else {
                gainNode.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.05);
              }
            }
          } else {
            if (conf.type === 'video') {
              const videoEl = element as HTMLVideoElement;
              if (!videoEl.paused) {
                videoEl.pause();
              }
            }
            if (conf.type === 'video' && gainNode && audioCtxRef.current) {
              gainNode.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.05);
            }
          }
        });

        // キャプション描画
        if (captionSettings.enabled && captions.length > 0) {
          const activeCaption = captions.find(
            (c) => time >= c.startTime && time < c.endTime
          );
          if (activeCaption) {
            // フォントサイズ
            const fontSizeMap = { small: 32, medium: 48, large: 64 };
            const fontSize = fontSizeMap[captionSettings.fontSize];
            
            // フォントファミリー（ゴシック体: sans-serif, 明朝体: serif）
            const fontFamilyMap = {
              gothic: 'sans-serif',
              mincho: '"游明朝", "Yu Mincho", "ヒラギノ明朝 ProN", "Hiragino Mincho ProN", serif',
            };
            const fontFamily = fontFamilyMap[captionSettings.fontStyle];
            
            // 位置（余白はフォントサイズに応じて調整）
            const padding = fontSize * 0.8; // フォントサイズの80%を余白として確保
            let y: number;
            if (captionSettings.position === 'top') {
              y = padding + fontSize / 2;
            } else if (captionSettings.position === 'center') {
              y = CANVAS_HEIGHT / 2;
            } else {
              y = CANVAS_HEIGHT - padding - fontSize / 2;
            }

            // フェードイン・フェードアウトのアルファ値計算
            const captionDuration = activeCaption.endTime - activeCaption.startTime;
            const captionLocalTime = time - activeCaption.startTime;
            
            // フェード時間を計算（短いキャプションの場合は調整）
            let effectiveFadeDuration = CAPTION_FADE_DURATION;
            if (activeCaption.fadeIn && activeCaption.fadeOut) {
              // 両方有効な場合、重複しないようにフェード時間を調整
              effectiveFadeDuration = Math.min(CAPTION_FADE_DURATION, captionDuration / 2);
            }
            
            // フェードイン・フェードアウトのアルファ値を個別に計算
            let fadeInAlpha = 1.0;
            let fadeOutAlpha = 1.0;
            
            if (activeCaption.fadeIn && captionLocalTime < effectiveFadeDuration) {
              fadeInAlpha = captionLocalTime / effectiveFadeDuration;
            }
            if (activeCaption.fadeOut && captionLocalTime > captionDuration - effectiveFadeDuration) {
              fadeOutAlpha = (captionDuration - captionLocalTime) / effectiveFadeDuration;
            }
            
            // 両方のアルファ値を乗算して最終的な透明度を計算
            const alpha = Math.max(0, Math.min(1, fadeInAlpha * fadeOutAlpha));

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = `bold ${fontSize}px ${fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // 縁取り
            ctx.strokeStyle = captionSettings.strokeColor;
            ctx.lineWidth = captionSettings.strokeWidth * 2;
            ctx.lineJoin = 'round';
            ctx.strokeText(activeCaption.text, CANVAS_WIDTH / 2, y);
            
            // 文字
            ctx.fillStyle = captionSettings.fontColor;
            ctx.fillText(activeCaption.text, CANVAS_WIDTH / 2, y);
            ctx.restore();
          }
        }

        // Audio Tracks
        const processAudioTrack = (track: AudioTrack | null, trackId: string) => {
          const element = mediaElementsRef.current[trackId] as HTMLAudioElement;
          const gainNode = gainNodesRef.current[trackId];

          if (track && element && gainNode && audioCtxRef.current) {
            if (isActivePlaying) {
              if (time < track.delay) {
                gainNode.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.01);
                if (!element.paused) element.pause();
              } else {
                let vol = track.volume;
                const trackTime = time - track.delay + track.startPoint;
                const playDuration = time - track.delay;

                if (trackTime <= track.duration) {
                  if (Math.abs(element.currentTime - trackTime) > 0.5) {
                    element.currentTime = trackTime;
                  }
                  if (element.paused) element.play().catch(() => {});

                  if (track.fadeIn && playDuration < 2.0) vol *= playDuration / 2.0;
                  if (track.fadeOut && time > totalDurationRef.current - 2.0)
                    vol *= Math.max(0, (totalDurationRef.current - time) / 2.0);
                  gainNode.gain.setTargetAtTime(vol, audioCtxRef.current.currentTime, 0.1);
                } else {
                  gainNode.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.1);
                  if (!element.paused) element.pause();
                }
              }
            } else {
              gainNode.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.1);
              if (!element.paused) element.pause();

              const trackTime = time - track.delay + track.startPoint;
              if (trackTime >= 0 && trackTime <= track.duration) {
                if (Math.abs(element.currentTime - trackTime) > 0.1) {
                  element.currentTime = trackTime;
                }
              }
            }
          }
        };

        processAudioTrack(currentBgm, 'bgm');
        processAudioTrack(currentNarration, 'narration');
      } catch (e) {
        console.error('Render Error:', e);
      }
    },
    [captions, captionSettings]
  );

  // --- State Sync ---
  useEffect(() => {
    mediaItemsRef.current = mediaItems;
    totalDurationRef.current = totalDuration;
    currentTimeRef.current = currentTime;

    if (mediaItems.length > 0 && !isPlaying && !isProcessing) {
      requestAnimationFrame(() => renderFrame(currentTime, false));
    }
  }, [mediaItems, totalDuration, reloadKey, currentTime, isPlaying, isProcessing, renderFrame]);

  useEffect(() => {
    bgmRef.current = bgm;
  }, [bgm]);

  useEffect(() => {
    narrationRef.current = narration;
  }, [narration]);

  // --- Cleanup on Unmount ---
  useEffect(() => {
    return () => {
      // Cancel animation frame
      if (reqIdRef.current) {
        cancelAnimationFrame(reqIdRef.current);
        reqIdRef.current = null;
      }

      // Stop and close AudioContext
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch (e) {
          console.error('Error closing AudioContext:', e);
        }
        audioCtxRef.current = null;
      }

      // Stop MediaRecorder
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch (e) {
          /* ignore */
        }
        recorderRef.current = null;
      }

      // Pause all media elements
      Object.values(mediaElementsRef.current).forEach((el) => {
        if (el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO')) {
          try {
            (el as HTMLMediaElement).pause();
          } catch (e) {
            /* ignore */
          }
        }
      });
    };
  }, []);

  // タブ復帰時の自動リフレッシュ
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestAnimationFrame(() => renderFrame(currentTimeRef.current, false));
        Object.values(mediaElementsRef.current).forEach((el) => {
          if (
            (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') &&
            (el as HTMLMediaElement).readyState < 2
          ) {
            try {
              (el as HTMLMediaElement).load();
            } catch (e) {
              /* ignore */
            }
          }
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [renderFrame]);

  // --- Audio Context ---
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      masterDestRef.current = ctx.createMediaStreamDestination();
    }
    return audioCtxRef.current;
  }, []);

  // --- Gemini API Helpers ---
  const pcmToWav = useCallback((pcmData: ArrayBuffer, sampleRate: number): ArrayBuffer => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = pcmData.byteLength;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (v: DataView, offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        v.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    const pcmView = new Uint8Array(pcmData);
    const wavView = new Uint8Array(buffer, 44);
    wavView.set(pcmView);

    return buffer;
  }, []);

  const generateScript = useCallback(async () => {
    if (!aiPrompt) return;
    const apiKey = getApiKey();
    if (!apiKey) {
      setError('APIキーが設定されていません。右上の歯車アイコンから設定してください。');
      return;
    }
    setAiLoading(true);
    try {
      const response = await fetch(
        `${GEMINI_API_BASE_URL}/${GEMINI_SCRIPT_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `以下のテーマで、短い動画用のナレーション原稿を日本語で作成してください。文字数は100文字以内で、自然な話し言葉にしてください。\n\nテーマ: ${aiPrompt}\n\n【重要】出力には挨拶や「原稿案:」などの見出しを含めず、ナレーションで読み上げるセリフのテキストのみを出力してください。`,
                  },
                ],
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        setAiScript(text.trim());
      } else {
        throw new Error('スクリプトの生成結果が空です');
      }
    } catch (e) {
      console.error('Script generation error:', e);
      if (e instanceof TypeError && e.message.includes('fetch')) {
        setError('ネットワークエラー: インターネット接続を確認してください');
      } else if (e instanceof Error) {
        setError(`スクリプト生成エラー: ${e.message}`);
      } else {
        setError('スクリプト生成に失敗しました');
      }
    } finally {
      setAiLoading(false);
    }
  }, [aiPrompt, setAiLoading, setAiScript, setError]);

  const generateSpeech = useCallback(async () => {
    if (!aiScript) return;
    const apiKey = getApiKey();
    if (!apiKey) {
      setError('APIキーが設定されていません。右上の歯車アイコンから設定してください。');
      return;
    }
    setAiLoading(true);
    try {
      // 声の調子が指定されている場合は、セリフの前に括弧書きで付与
      const scriptWithStyle = aiVoiceStyle.trim()
        ? `（${aiVoiceStyle.trim()}）${aiScript}`
        : aiScript;

      const response = await fetch(
        `${GEMINI_API_BASE_URL}/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: scriptWithStyle }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: aiVoice },
                },
              },
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;

      if (!inlineData) {
        throw new Error('音声データが取得できませんでした');
      }

      const binaryString = window.atob(inlineData.data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const wavBuffer = pcmToWav(bytes.buffer, TTS_SAMPLE_RATE);
      const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
      const blobUrl = URL.createObjectURL(wavBlob);

      const audio = new Audio(blobUrl);
      audio.onloadedmetadata = () => {
        const voiceLabel = VOICE_OPTIONS.find((v) => v.id === aiVoice)?.label || 'AI音声';
        setNarration({
          file: new File([wavBlob], `AIナレーション_${voiceLabel}.wav`, { type: 'audio/wav' }),
          url: blobUrl,
          blobUrl: blobUrl,
          startPoint: 0,
          delay: 0,
          volume: 1.0,
          fadeIn: false,
          fadeOut: false,
          duration: audio.duration,
          isAi: true,
        });
        closeAiModal();
        clearError();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        setError('生成された音声の読み込みに失敗しました');
        setAiLoading(false);
      };
    } catch (e) {
      console.error('Speech generation error:', e);
      if (e instanceof TypeError && e.message.includes('fetch')) {
        setError('ネットワークエラー: インターネット接続を確認してください');
      } else if (e instanceof Error) {
        setError(`音声生成エラー: ${e.message}`);
      } else {
        setError('音声生成に失敗しました');
      }
    } finally {
      setAiLoading(false);
    }
  }, [aiScript, aiVoice, aiVoiceStyle, pcmToWav, setNarration, closeAiModal, clearError, setError, setAiLoading]);

  // --- アップロード処理 ---
  const handleMediaUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      try {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        e.target.value = '';
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') ctx.resume().catch(console.error);
        clearExport();
        addMediaItems(files);
      } catch (err) {
        setError('メディアの読み込みエラー');
      }
    },
    [getAudioContext, clearExport, addMediaItems, setError]
  );

  // MediaResourceLoaderコールバック
  const handleMediaElementLoaded = useCallback(
    (id: string, element: HTMLVideoElement | HTMLImageElement | HTMLAudioElement) => {
      if (element.tagName === 'VIDEO') {
        const videoEl = element as HTMLVideoElement;
        const duration = videoEl.duration;
        if (!isNaN(duration) && duration !== Infinity) {
          setVideoDuration(id, duration);
        }
      }
    },
    [setVideoDuration]
  );

  const handleMediaRefAssign = useCallback(
    (id: string, element: HTMLVideoElement | HTMLImageElement | HTMLAudioElement | null) => {
      if (element) {
        mediaElementsRef.current[id] = element;

        if (element.tagName === 'VIDEO' || element.tagName === 'AUDIO') {
          try {
            const ctx = getAudioContext();
            if (!sourceNodesRef.current[id]) {
              const source = ctx.createMediaElementSource(element as HTMLMediaElement);
              const gain = ctx.createGain();
              source.connect(gain);
              gain.connect(ctx.destination);
              gain.gain.setValueAtTime(1, ctx.currentTime);
              sourceNodesRef.current[id] = source;
              gainNodesRef.current[id] = gain;
            }
          } catch (e) {
            /* ignore */
          }
        }
      } else {
        delete mediaElementsRef.current[id];
      }
    },
    [getAudioContext]
  );

  const handleSeeked = useCallback(() => {
    requestAnimationFrame(() => renderFrame(currentTimeRef.current, false));
  }, [renderFrame]);

  // --- Media Item Handlers (using Zustand store actions) ---
  const handleUpdateVideoTrim = useCallback(
    (id: string, type: 'start' | 'end', value: string) => {
      let val = parseFloat(value);
      if (isNaN(val)) val = 0;
      updateVideoTrim(id, type, val);

      // Seek video element
      const item = mediaItems.find((v) => v.id === id);
      if (item) {
        const el = mediaElementsRef.current[id] as HTMLVideoElement;
        if (el && el.tagName === 'VIDEO') {
          const newStart = type === 'start' ? Math.max(0, Math.min(val, item.trimEnd - 0.1)) : item.trimStart;
          const newEnd = type === 'end' ? Math.min(item.originalDuration, Math.max(val, item.trimStart + 0.1)) : item.trimEnd;
          const seekTime = type === 'start' ? newStart : Math.max(newStart, newEnd - 0.1);
          if (Number.isFinite(seekTime)) {
            el.currentTime = Math.max(0, Math.min(item.originalDuration, seekTime));
          }
        }
      }
    },
    [updateVideoTrim, mediaItems]
  );

  const handleUpdateImageDuration = useCallback((id: string, newDuration: string) => {
    let val = parseFloat(newDuration);
    if (isNaN(val) || val < 0.5) val = 0.5;
    updateImageDuration(id, val);
  }, [updateImageDuration]);

  const handleUpdateMediaScale = useCallback((id: string, value: string | number) => {
    let val = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(val)) val = 1.0;
    updateScale(id, val);
  }, [updateScale]);

  const handleUpdateMediaPosition = useCallback((id: string, axis: 'x' | 'y', value: string) => {
    let val = parseFloat(value);
    if (isNaN(val)) val = 0;
    updatePosition(id, axis, val);
  }, [updatePosition]);

  const handleResetMediaSetting = useCallback((id: string, type: 'scale' | 'x' | 'y') => {
    resetTransform(id, type);
  }, [resetTransform]);

  const handleMoveMedia = useCallback(
    (idx: number, dir: 'up' | 'down') => {
      moveMediaItem(idx, dir);
    },
    [moveMediaItem]
  );

  const handleRemoveMedia = useCallback((id: string) => {
    removeMediaItem(id);
    delete mediaElementsRef.current[id];
  }, [removeMediaItem]);

  const handleToggleTransformPanel = useCallback((id: string) => {
    toggleTransformPanel(id);
  }, [toggleTransformPanel]);

  // --- Audio Track Handlers ---
  const handleBgmUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    clearExport();
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      setBgm({
        file,
        url,
        startPoint: 0,
        delay: 0,
        volume: 0.5,
        fadeIn: false,
        fadeOut: false,
        duration: audio.duration,
        isAi: false,
      });
    };
  }, [setBgm, clearExport]);

  const handleNarrationUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    clearExport();
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      setNarration({
        file,
        url,
        startPoint: 0,
        delay: 0,
        volume: 1.0,
        fadeIn: false,
        fadeOut: false,
        duration: audio.duration,
        isAi: false,
      });
    };
  }, [setNarration, clearExport]);

  const handleUpdateTrackStart = useCallback(
    (type: 'bgm' | 'narration', val: string) => {
      const numVal = parseFloat(val);
      if (isNaN(numVal)) return;

      if (type === 'bgm') {
        updateBgmStartPoint(numVal);
      } else {
        updateNarrationStartPoint(numVal);
      }
    },
    [updateBgmStartPoint, updateNarrationStartPoint]
  );

  const handleUpdateTrackDelay = useCallback((type: 'bgm' | 'narration', val: string) => {
    const numVal = parseFloat(val);
    if (isNaN(numVal)) return;

    if (type === 'bgm') {
      updateBgmDelay(numVal);
    } else {
      updateNarrationDelay(numVal);
    }
  }, [updateBgmDelay, updateNarrationDelay]);

  const handleUpdateTrackVolume = useCallback((type: 'bgm' | 'narration', val: string) => {
    const numVal = parseFloat(val);
    if (isNaN(numVal)) return;

    if (type === 'bgm') {
      updateBgmVolume(numVal);
    } else {
      updateNarrationVolume(numVal);
    }
  }, [updateBgmVolume, updateNarrationVolume]);

  // --- コアエンジン ---
  const stopAll = useCallback(() => {
    // ループIDをインクリメントして古いループを無効化
    loopIdRef.current += 1;
    isPlayingRef.current = false;
    activeVideoIdRef.current = null;
    
    // アニメーションフレームをキャンセル
    if (reqIdRef.current) {
      cancelAnimationFrame(reqIdRef.current);
      reqIdRef.current = null;
    }

    // メディア要素を停止（シンプルにpauseを呼ぶ）
    Object.values(mediaElementsRef.current).forEach((el) => {
      if (el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO')) {
        try {
          (el as HTMLMediaElement).pause();
        } catch (e) {
          /* ignore */
        }
      }
    });

    const ctx = audioCtxRef.current;
    if (ctx) {
      Object.values(gainNodesRef.current).forEach((node) => {
        try {
          node.gain.cancelScheduledValues(ctx.currentTime);
        } catch (e) {
          /* ignore */
        }
      });
    }

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const handleClearAll = useCallback(() => {
    if (mediaItems.length === 0 && !bgm && !narration) return;
    stopAll();
    pause();
    setProcessing(false);
    Object.values(sourceNodesRef.current).forEach((n) => {
      try {
        n.disconnect();
      } catch (e) {
        /* ignore */
      }
    });
    Object.values(gainNodesRef.current).forEach((n) => {
      try {
        n.disconnect();
      } catch (e) {
        /* ignore */
      }
    });
    sourceNodesRef.current = {};
    gainNodesRef.current = {};

    mediaItemsRef.current = [];
    mediaElementsRef.current = {};
    bgmRef.current = null;
    narrationRef.current = null;

    // Zustand stores clear
    clearAllMedia();
    clearAllAudio();
    resetCaptions();
    resetUI();
    setReloadKey(0);
    
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }
    }
  }, [mediaItems, bgm, narration, stopAll, clearAllMedia, clearAllAudio, resetCaptions, resetUI]);

  const handleReloadResources = useCallback(
    (targetTime: number | null = null) => {
      stopAll();
      pause();
      setProcessing(false);
      
      // Properly disconnect all audio nodes before clearing them
      // This prevents Web Audio API corruption that can cause video blackout
      Object.values(sourceNodesRef.current).forEach((n) => {
        try {
          n.disconnect();
        } catch (e) {
          /* ignore */
        }
      });
      Object.values(gainNodesRef.current).forEach((n) => {
        try {
          n.disconnect();
        } catch (e) {
          /* ignore */
        }
      });
      
      setReloadKey((prev) => prev + 1);
      sourceNodesRef.current = {};
      gainNodesRef.current = {};
      showToast('リソースをリロードしました');

      const t = targetTime !== null ? targetTime : currentTime;
      setTimeout(() => {
        renderFrame(t, false);
      }, 500);
    },
    [currentTime, stopAll, pause, showToast, renderFrame]
  );

  const configureAudioRouting = useCallback((isExporting: boolean) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const dest = masterDestRef.current;
    const target = isExporting && dest ? dest : ctx.destination;

    Object.keys(gainNodesRef.current).forEach((id) => {
      const gain = gainNodesRef.current[id];
      try {
        gain.disconnect();
        gain.connect(target);
      } catch (e) {
        /* ignore */
      }
    });
  }, []);

  const loop = useCallback(
    (isExportMode: boolean, myLoopId: number) => {
      // このループが無効化されていたら終了
      if (myLoopId !== loopIdRef.current) {
        return;
      }
      
      if (mediaItemsRef.current.length === 0) {
        stopAll();
        return;
      }
      
      // 再生状態でなければ終了
      if (!isPlayingRef.current && !isExportMode) {
        return;
      }
      
      const now = Date.now();
      const elapsed = (now - startTimeRef.current) / 1000;

      if (elapsed >= totalDurationRef.current) {
        stopAll();
        if (!isExportMode) pause();
        return;
      }
      setCurrentTime(elapsed);
      renderFrame(elapsed, true, isExportMode);
      reqIdRef.current = requestAnimationFrame(() => loop(isExportMode, myLoopId));
    },
    [stopAll, pause, setCurrentTime, renderFrame]
  );

  const startEngine = useCallback(
    async (fromTime: number, isExportMode: boolean) => {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();

      // 既存のループとメディアを停止（これでloopIdRefがインクリメントされる）
      stopAll();
      
      // 新しいループIDを取得
      const myLoopId = loopIdRef.current;
      
      // 状態をリセットしてから新しい状態を設定
      if (isExportMode) {
        setProcessing(true);
      } else {
        setProcessing(false);
        isPlayingRef.current = true;
        play();
      }
      clearExport();

      configureAudioRouting(isExportMode);

      // メディア要素の準備
      Object.values(mediaElementsRef.current).forEach((el) => {
        if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
          const mediaEl = el as HTMLMediaElement;
          
          // readyStateが0の場合はloadを呼ぶ
          if (mediaEl.readyState === 0) {
            try {
              mediaEl.load();
            } catch (e) {
              /* ignore */
            }
          }
        }
      });

      if (isExportMode) {
        setCurrentTime(0);
        Object.values(mediaElementsRef.current).forEach((el) => {
          if (el.tagName === 'VIDEO') {
            try {
              (el as HTMLVideoElement).currentTime = 0;
            } catch (e) {
              /* ignore */
            }
          }
        });
        await new Promise((r) => setTimeout(r, 200));
        renderFrame(0, false, true);
        await new Promise((r) => setTimeout(r, 100));
      } else {
        // 通常再生モード: 開始位置でフレームを描画してビデオ位置を同期
        setCurrentTime(fromTime);
        currentTimeRef.current = fromTime;
        
        // 現在のアクティブなビデオを特定
        let t = 0;
        for (const item of mediaItemsRef.current) {
          if (fromTime >= t && fromTime < t + item.duration) {
            if (item.type === 'video') {
              const videoEl = mediaElementsRef.current[item.id] as HTMLVideoElement;
              if (videoEl) {
                const localTime = fromTime - t;
                const targetTime = (item.trimStart || 0) + localTime;
                videoEl.currentTime = targetTime;
                activeVideoIdRef.current = item.id;
                // 再生を開始
                videoEl.play().catch(() => {});
              }
            }
            break;
          }
          t += item.duration;
        }
        
        renderFrame(fromTime, false);
        
        // メディア要素のシーク完了を待つ
        await new Promise((r) => setTimeout(r, 50));
      }

      // awaitの間にstopAllが呼ばれていたら中止
      if (myLoopId !== loopIdRef.current) {
        return;
      }

      startTimeRef.current = Date.now() - fromTime * 1000;

      if (isExportMode && canvasRef.current && masterDestRef.current) {
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
          setExportUrl(URL.createObjectURL(blob));
          setExportExt(extension === 'mp4' ? 'mp4' : 'webm');
          setProcessing(false);
          pause();
        };
        recorderRef.current = rec;
        rec.start();
      }

      loop(isExportMode, myLoopId);
    },
    [getAudioContext, stopAll, setProcessing, play, clearExport, configureAudioRouting, setCurrentTime, setExportUrl, setExportExt, pause, renderFrame, loop]
  );

  const handleSeekChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const t = parseFloat(e.target.value);
      const wasPlaying = isPlayingRef.current;
      
      // シーク開始: 再生中ならまず停止
      if (wasPlaying) {
        isSeekingRef.current = true;
        // ループを停止
        if (reqIdRef.current) {
          cancelAnimationFrame(reqIdRef.current);
          reqIdRef.current = null;
        }
        // ビデオを一時停止
        Object.values(mediaElementsRef.current).forEach((el) => {
          if (el && el.tagName === 'VIDEO') {
            try { (el as HTMLVideoElement).pause(); } catch (e) { /* ignore */ }
          }
        });
      }
      
      setCurrentTime(t);
      currentTimeRef.current = t;

      // ビデオの位置を設定
      let accTime = 0;
      for (const item of mediaItemsRef.current) {
        if (t >= accTime && t < accTime + item.duration) {
          if (item.type === 'video') {
            const videoEl = mediaElementsRef.current[item.id] as HTMLVideoElement;
            if (videoEl) {
              const localTime = t - accTime;
              const targetTime = (item.trimStart || 0) + localTime;
              videoEl.currentTime = targetTime;
              activeVideoIdRef.current = item.id;
            }
          }
          break;
        }
        accTime += item.duration;
      }

      // フレームを描画
      renderFrame(t, false);

      // 再生中だった場合はシーク完了後に再開
      if (wasPlaying) {
        isSeekingRef.current = false;
        startTimeRef.current = Date.now() - t * 1000;
        
        // アクティブなビデオを再生
        if (activeVideoIdRef.current) {
          const videoEl = mediaElementsRef.current[activeVideoIdRef.current] as HTMLVideoElement;
          if (videoEl && videoEl.paused) {
            videoEl.play().catch(() => {});
          }
        }
        
        const currentLoopId = loopIdRef.current;
        reqIdRef.current = requestAnimationFrame(() => loop(false, currentLoopId));
      }
    },
    [setCurrentTime, renderFrame, loop]
  );

  const togglePlay = useCallback(() => {
    // デバウンス: 200ms以内の連続クリックを無視
    const now = Date.now();
    if (now - lastToggleTimeRef.current < 200) {
      return;
    }
    lastToggleTimeRef.current = now;
    
    if (isPlaying) {
      stopAll();
      pause();
    } else {
      let startT = currentTime;
      if (startT >= totalDuration - 0.1 || startT < 0) startT = 0;
      startEngine(startT, false);
    }
  }, [isPlaying, currentTime, totalDuration, stopAll, pause, startEngine]);

  const handleStop = useCallback(() => {
    stopAll();
    pause();
    setCurrentTime(0);
    handleReloadResources(0);
  }, [stopAll, pause, setCurrentTime, handleReloadResources]);

  const handleExport = useCallback(() => {
    startEngine(0, true);
  }, [startEngine]);

  const formatTime = useCallback((s: number): string => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans pb-24 select-none relative">
      <Toast message={toastMessage} onClose={clearToast} />

      {/* 隠しリソースローダー */}
      <MediaResourceLoader
        key={reloadKey}
        mediaItems={mediaItems}
        bgm={bgm}
        narration={narration}
        onElementLoaded={handleMediaElementLoaded}
        onRefAssign={handleMediaRefAssign}
        onSeeked={handleSeeked}
      />

      {/* AI Modal */}
      <AiModal
        isOpen={showAiModal}
        onClose={closeAiModal}
        aiPrompt={aiPrompt}
        aiScript={aiScript}
        aiVoice={aiVoice}
        aiVoiceStyle={aiVoiceStyle}
        isAiLoading={isAiLoading}
        voiceOptions={VOICE_OPTIONS}
        onPromptChange={setAiPrompt}
        onScriptChange={setAiScript}
        onVoiceChange={setAiVoice}
        onVoiceStyleChange={setAiVoiceStyle}
        onGenerateScript={generateScript}
        onGenerateSpeech={generateSpeech}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* Header */}
      <Header onOpenSettings={() => setShowSettings(true)} />

      <div className="max-w-md mx-auto p-4 space-y-6">
        <ErrorMessage message={errorMsg} onClose={clearError} />

        {/* 1. CLIPS */}
        <ClipsSection
          mediaItems={mediaItems}
          isClipsLocked={isClipsLocked}
          mediaElements={mediaElementsRef.current as Record<string, HTMLVideoElement | HTMLImageElement>}
          onToggleClipsLock={toggleClipsLock}
          onMediaUpload={handleMediaUpload}
          onMoveMedia={handleMoveMedia}
          onRemoveMedia={handleRemoveMedia}
          onToggleMediaLock={toggleItemLock}
          onToggleTransformPanel={handleToggleTransformPanel}
          onUpdateVideoTrim={handleUpdateVideoTrim}
          onUpdateImageDuration={handleUpdateImageDuration}
          onUpdateMediaScale={handleUpdateMediaScale}
          onUpdateMediaPosition={handleUpdateMediaPosition}
          onResetMediaSetting={handleResetMediaSetting}
          onUpdateMediaVolume={updateVolume}
          onToggleMediaMute={toggleMute}
          onToggleMediaFadeIn={toggleFadeIn}
          onToggleMediaFadeOut={toggleFadeOut}
        />

        {/* 2. BGM SETTINGS */}
        <BgmSection
          bgm={bgm}
          isBgmLocked={isBgmLocked}
          totalDuration={totalDuration}
          onToggleBgmLock={toggleBgmLock}
          onBgmUpload={handleBgmUpload}
          onRemoveBgm={removeBgm}
          onUpdateStartPoint={(val) => handleUpdateTrackStart('bgm', val)}
          onUpdateDelay={(val) => handleUpdateTrackDelay('bgm', val)}
          onUpdateVolume={(val) => handleUpdateTrackVolume('bgm', val)}
          onToggleFadeIn={toggleBgmFadeIn}
          onToggleFadeOut={toggleBgmFadeOut}
          formatTime={formatTime}
        />

        {/* 3. NARRATION SETTINGS */}
        <NarrationSection
          narration={narration}
          isNarrationLocked={isNarrationLocked}
          totalDuration={totalDuration}
          onToggleNarrationLock={toggleNarrationLock}
          onShowAiModal={openAiModal}
          onNarrationUpload={handleNarrationUpload}
          onRemoveNarration={removeNarration}
          onUpdateStartPoint={(val) => handleUpdateTrackStart('narration', val)}
          onUpdateDelay={(val) => handleUpdateTrackDelay('narration', val)}
          onUpdateVolume={(val) => handleUpdateTrackVolume('narration', val)}
          onToggleFadeIn={toggleNarrationFadeIn}
          onToggleFadeOut={toggleNarrationFadeOut}
          formatTime={formatTime}
        />

        {/* 4. CAPTIONS */}
        <CaptionSection
          captions={captions}
          settings={captionSettings}
          isLocked={isCaptionLocked}
          totalDuration={totalDuration}
          currentTime={currentTime}
          onToggleLock={toggleCaptionLock}
          onAddCaption={addCaption}
          onUpdateCaption={updateCaption}
          onRemoveCaption={removeCaption}
          onSetEnabled={setCaptionEnabled}
          onSetFontSize={setCaptionFontSize}
          onSetFontStyle={setCaptionFontStyle}
          onSetPosition={setCaptionPosition}
        />

        {/* 5. PREVIEW */}
        <PreviewSection
          mediaItems={mediaItems}
          bgm={bgm}
          narration={narration}
          canvasRef={canvasRef}
          currentTime={currentTime}
          totalDuration={totalDuration}
          isPlaying={isPlaying}
          isProcessing={isProcessing}
          exportUrl={exportUrl}
          exportExt={exportExt}
          onSeekChange={handleSeekChange}
          onTogglePlay={togglePlay}
          onStop={handleStop}
          onExport={handleExport}
          onClearAll={handleClearAll}
          onReloadResources={() => handleReloadResources()}
          formatTime={formatTime}
        />
      </div>
    </div>
  );
};

export default TurtleVideo;
