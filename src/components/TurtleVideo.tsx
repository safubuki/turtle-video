/**
 * @file TurtleVideo.tsx
 * @author Turtle Village
 * @description 動画編集アプリケーションのメインコンポーネント。タイムライン管理、再生制御、レンダリングループ、および各種セクションの統合を行う。
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import type { MediaItem, AudioTrack } from '../types';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  VOICE_OPTIONS,
  GEMINI_API_BASE_URL,
  GEMINI_SCRIPT_MODEL,
  GEMINI_TTS_MODEL,
  TTS_SAMPLE_RATE,
  SEEK_THROTTLE_MS,
} from '../constants';

// Hooks
import { useExport } from '../hooks/useExport';
import { usePreventUnload } from '../hooks/usePreventUnload';

// Utils
import { captureCanvasAsImage } from '../utils/canvas';

// Zustand Stores
import { useMediaStore, useAudioStore, useUIStore, useCaptionStore, useLogStore } from '../stores';

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
import SaveLoadModal from './modals/SaveLoadModal';

// API キー取得関数（localStorage優先、フォールバックで環境変数）
const getApiKey = (): string => {
  const storedKey = getStoredApiKey();
  if (storedKey) return storedKey;
  return import.meta.env.VITE_GEMINI_API_KEY || '';
};



const TurtleVideo: React.FC = () => {
  // 離脱防止フックを使用
  usePreventUnload();

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
  const updateFadeInDuration = useMediaStore((s) => s.updateFadeInDuration);
  const updateFadeOutDuration = useMediaStore((s) => s.updateFadeOutDuration);
  const toggleItemLock = useMediaStore((s) => s.toggleItemLock);
  const toggleClipsLock = useMediaStore((s) => s.toggleClipsLock);
  const clearAllMedia = useMediaStore((s) => s.clearAllMedia);

  // Audio Store
  const bgm = useAudioStore((s) => s.bgm);
  const isBgmLocked = useAudioStore((s) => s.isBgmLocked);

  const setBgm = useAudioStore((s) => s.setBgm);
  const updateBgmStartPoint = useAudioStore((s) => s.updateBgmStartPoint);
  const updateBgmDelay = useAudioStore((s) => s.updateBgmDelay);
  const updateBgmVolume = useAudioStore((s) => s.updateBgmVolume);
  const toggleBgmFadeIn = useAudioStore((s) => s.toggleBgmFadeIn);
  const toggleBgmFadeOut = useAudioStore((s) => s.toggleBgmFadeOut);
  const updateBgmFadeInDuration = useAudioStore((s) => s.updateBgmFadeInDuration);
  const updateBgmFadeOutDuration = useAudioStore((s) => s.updateBgmFadeOutDuration);
  const toggleBgmLock = useAudioStore((s) => s.toggleBgmLock);
  const removeBgm = useAudioStore((s) => s.removeBgm);

  const {
    narration,
    isNarrationLocked,
    setNarration,
    updateNarrationStartPoint,
    updateNarrationDelay,
    updateNarrationVolume,
    toggleNarrationFadeIn,
    toggleNarrationFadeOut,
    updateNarrationFadeInDuration,
    updateNarrationFadeOutDuration,
    toggleNarrationLock,
    removeNarration,
    clearAllAudio,
  } = useAudioStore();

  // UI Store
  const toastMessage = useUIStore((s) => s.toastMessage);
  const errorMsg = useUIStore((s) => s.errorMsg);
  const errorCount = useUIStore((s) => s.errorCount);
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

  const clearToast = useUIStore((s) => s.clearToast);
  const showToast = useUIStore((s) => s.showToast);
  const setError = useUIStore((s) => s.setError);
  const clearError = useUIStore((s) => s.clearError);
  const play = useUIStore((s) => s.play);
  const pause = useUIStore((s) => s.pause);
  const setCurrentTime = useUIStore((s) => s.setCurrentTime);
  const setProcessing = useUIStore((s) => s.setProcessing);

  const isLoading = useUIStore((s) => s.isLoading);
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
  const moveCaption = useCaptionStore((s) => s.moveCaption);
  const setCaptionEnabled = useCaptionStore((s) => s.setEnabled);
  const setCaptionFontSize = useCaptionStore((s) => s.setFontSize);
  const setCaptionFontStyle = useCaptionStore((s) => s.setFontStyle);
  const setCaptionPosition = useCaptionStore((s) => s.setPosition);
  const setCaptionBlur = useCaptionStore((s) => s.setBlur);
  const setBulkFadeIn = useCaptionStore((s) => s.setBulkFadeIn);
  const setBulkFadeOut = useCaptionStore((s) => s.setBulkFadeOut);
  const setBulkFadeInDuration = useCaptionStore((s) => s.setBulkFadeInDuration);
  const setBulkFadeOutDuration = useCaptionStore((s) => s.setBulkFadeOutDuration);
  const toggleCaptionLock = useCaptionStore((s) => s.toggleLock);
  const resetCaptions = useCaptionStore((s) => s.resetCaptions);

  // Log Store
  const logInfo = useLogStore((s) => s.info);
  const logWarn = useLogStore((s) => s.warn);
  const logError = useLogStore((s) => s.error);
  const logDebug = useLogStore((s) => s.debug);
  const updateMemoryStats = useLogStore((s) => s.updateMemoryStats);

  // === Local State ===
  const [reloadKey, setReloadKey] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showProjectManager, setShowProjectManager] = useState(false);

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
  const videoRecoveryAttemptsRef = useRef<Record<string, number>>({}); // ビデオリカバリー試行時刻を追跡
  const seekingVideosRef = useRef<Set<string>>(new Set()); // シーク中のビデオIDを追跡
  const lastSeekTimeRef = useRef(0); // 最後のシーク時刻（スロットリング用）
  const pendingSeekRef = useRef<number | null>(null); // 保留中のシーク位置
  const wasPlayingBeforeSeekRef = useRef(false); // シーク前の再生状態を保持
  const pendingSeekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 保留中のシーク処理用タイマー


  const playbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 再生開始待機用タイマー

  const isIosSafari = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    const isIOS =
      /iP(hone|ad|od)/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
    return isIOS && isSafari;
  }, []);

  // Hooks
  const { startExport: startWebCodecsExport, stopExport: stopWebCodecsExport } = useExport();

  // --- メモリ監視（10秒ごと） ---
  useEffect(() => {
    // 初回実行
    updateMemoryStats();

    const intervalId = setInterval(() => {
      updateMemoryStats();
    }, 10000); // 10秒ごと

    return () => clearInterval(intervalId);
  }, [updateMemoryStats]);

  // --- Helper: 非アクティブなビデオを開始位置にリセット ---
  const resetInactiveVideos = useCallback(() => {
    for (const item of mediaItemsRef.current) {
      if (item.type === 'video' && item.id !== activeVideoIdRef.current) {
        const videoEl = mediaElementsRef.current[item.id] as HTMLVideoElement;
        if (videoEl) {
          // 一時停止
          if (!videoEl.paused) {
            videoEl.pause();
          }
          // 開始位置にリセット
          const startTime = item.trimStart || 0;
          if (Math.abs(videoEl.currentTime - startTime) > 0.1) {
            videoEl.currentTime = startTime;
          }
        }
      }
    }
  }, []);

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

        // シーク終端対策: time が totalDuration 以上で activeId が見つからない場合、
        // 最後のクリップの最終フレームを表示する（黒画面防止）
        if (!activeId && currentItems.length > 0 && time >= totalDurationRef.current) {
          const lastItem = currentItems[currentItems.length - 1];
          activeId = lastItem.id;
          activeIndex = currentItems.length - 1;
          // 最終フレームを表示するため、duration からごく小さなオフセットを引く
          localTime = Math.max(0, lastItem.duration - 0.001);
        }

        // アクティブな動画が未準備の場合はキャンバスをクリアせず、
        // 直前フレームを保持してブラックアウトを防止
        let holdFrame = false;
        if (activeId && activeIndex !== -1) {
          const activeItem = currentItems[activeIndex];
          if (activeItem.type === 'video') {
            const activeEl = mediaElementsRef.current[activeId] as HTMLVideoElement | undefined;
            if (activeEl) {
              const targetTime = (activeItem.trimStart || 0) + localTime;
              const exportSyncThreshold = _isExporting && isIosSafari ? 1.2 : 0.5;
              const needsCorrection =
                _isExporting &&
                isActivePlaying &&
                !isSeekingRef.current &&
                !activeEl.seeking &&
                Math.abs(activeEl.currentTime - targetTime) > exportSyncThreshold;

              // readyState 0: 未ロード → クールダウン付きload()で復旧試行
              if (activeEl.readyState === 0 && !activeEl.error) {
                const now = Date.now();
                const lastAttempt = videoRecoveryAttemptsRef.current[activeId] || 0;
                if (now - lastAttempt > 2000) {
                  videoRecoveryAttemptsRef.current[activeId] = now;
                  try { activeEl.load(); } catch (e) { /* ignore */ }
                }
              }
              const hasFrame =
                activeEl.readyState >= 2 &&
                activeEl.videoWidth > 0 &&
                activeEl.videoHeight > 0 &&
                !activeEl.seeking;
              if (!hasFrame || needsCorrection) {
                holdFrame = true;
                // ブラックアウト防止発動をログ
                logInfo('RENDER', 'フレーム保持発動', {
                  videoId: activeId,
                  readyState: activeEl.readyState,
                  seeking: activeEl.seeking,
                  currentTime: t,
                  needsCorrection,
                });
              }
            }
          }
        }

        if (!holdFrame) {
          ctx.globalAlpha = 1.0;
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }

        // Preload: 次のビデオを事前に準備（3秒前から開始）
        if (isActivePlaying && activeIndex !== -1 && activeIndex + 1 < currentItems.length) {
          const nextItem = currentItems[activeIndex + 1];
          if (nextItem.type === 'video') {
            const remainingTime = currentItems[activeIndex].duration - localTime;
            if (remainingTime < 3.0) {
              const nextElement = mediaElementsRef.current[nextItem.id] as HTMLVideoElement;
              if (nextElement) {
                // readyState 0: ロード未開始 → load()で読み込みを開始
                if (nextElement.readyState === 0 && !nextElement.error) {
                  try { nextElement.load(); } catch (e) { /* ignore */ }
                }
                if (nextElement.paused || nextElement.readyState < 2) {
                  const nextStart = nextItem.trimStart || 0;
                  if (Math.abs(nextElement.currentTime - nextStart) > 0.1) {
                    nextElement.currentTime = nextStart;
                  }
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
            // --- アクティブなメディアの処理 ---
            if (conf.type === 'video') {
              const videoEl = element as HTMLVideoElement;
              const targetTime = (conf.trimStart || 0) + localTime;
              const isSwitchedVideo = isActivePlaying && activeVideoIdRef.current !== id;
              const syncThreshold = _isExporting
                ? (isIosSafari ? (isSwitchedVideo ? 0.05 : 1.2) : 0.5)
                : (isIosSafari ? 1.0 : 0.5);

              // アクティブなビデオIDを更新
              if (isActivePlaying && activeVideoIdRef.current !== id) {
                activeVideoIdRef.current = id;
              }

              // 動画が未読み込み状態の場合はリロードを試みる（クールダウン付き）
              if (videoEl.readyState === 0 && !videoEl.error) {
                const now = Date.now();
                const lastAttempt = videoRecoveryAttemptsRef.current[id] || 0;
                if (now - lastAttempt > 2000) {
                  videoRecoveryAttemptsRef.current[id] = now;
                  try { videoEl.load(); } catch (e) { /* ignore */ }
                }
              }

              // シーク中（スライダー操作中）の処理
              const isUserSeeking = isSeekingRef.current;
              const isVideoSeeking = videoEl.seeking;

              if (isActivePlaying && !isUserSeeking) {
                // 再生中かつユーザーがシーク操作していない場合
                // 大きなズレがあれば補正
                if (!isVideoSeeking && Math.abs(videoEl.currentTime - targetTime) > syncThreshold) {
                  videoEl.currentTime = targetTime;
                }
                // 一時停止していれば再生開始
                // readyState >= 1 (HAVE_METADATA) で play() を許可。
                // ブラウザはplay()呼び出しをトリガーにバッファリングを開始し、
                // データ準備完了後に再生する。readyState >= 2 を要求すると
                // paused→バッファ停滞→readyState上がらず のデッドロックが発生する。
                if (videoEl.paused && videoEl.readyState >= 1) {
                  videoEl.play().catch(() => { });
                }
              } else if (!isActivePlaying && !isUserSeeking) {
                // 停止中かつユーザーがシーク操作していない場合
                if (!videoEl.paused) {
                  videoEl.pause();
                }
              }
              // isUserSeeking中はビデオの再生/停止を変更しない（syncVideoToTimeに任せる）
            } else {
              // 画像がアクティブな場合、activeVideoIdRefをクリア
              if (isActivePlaying && activeVideoIdRef.current !== null) {
                activeVideoIdRef.current = null;
              }
            }

            // 描画
            const isVideo = conf.type === 'video';
            const videoEl = element as HTMLVideoElement;
            const imgEl = element as HTMLImageElement;
            // ビデオの場合: readyState >= 2（HAVE_CURRENT_DATA）を基本とし、
            // seeking中はフレームが不確定なため描画をスキップし、前フレームを保持
            const isVideoReady = isVideo
              ? videoEl.readyState >= 2 && !videoEl.seeking
              : false;
            const isReady = isVideo ? isVideoReady : imgEl.complete;

            if (isReady) {
              let elemW = isVideo ? videoEl.videoWidth : imgEl.naturalWidth;
              let elemH = isVideo ? videoEl.videoHeight : imgEl.naturalHeight;
              if (elemW && elemH) {
                const scaleFactor = conf.scale || 1.0;
                const userX = conf.positionX || 0;
                const userY = conf.positionY || 0;

                const baseScale = Math.min(CANVAS_WIDTH / elemW, CANVAS_HEIGHT / elemH);

                ctx.save();
                ctx.translate(CANVAS_WIDTH / 2 + userX, CANVAS_HEIGHT / 2 + userY);
                ctx.scale(baseScale * scaleFactor, baseScale * scaleFactor);

                let alpha = 1.0;
                const fadeInDur = conf.fadeInDuration || 1.0;
                const fadeOutDur = conf.fadeOutDuration || 1.0;

                if (conf.fadeIn && localTime < fadeInDur) {
                  alpha = localTime / fadeInDur;
                } else if (conf.fadeOut && localTime > conf.duration - fadeOutDur) {
                  const remaining = conf.duration - localTime;
                  alpha = remaining / fadeOutDur;
                }

                ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
                ctx.drawImage(element as CanvasImageSource, -elemW / 2, -elemH / 2, elemW, elemH);
                ctx.restore();
                ctx.globalAlpha = 1.0;
              }
            }

            if (conf.type === 'video' && gainNode && audioCtxRef.current) {
              if (isActivePlaying) {
                let vol = conf.isMuted ? 0 : conf.volume;
                const fadeInDur = conf.fadeInDuration || 1.0;
                const fadeOutDur = conf.fadeOutDuration || 1.0;

                if (conf.fadeIn && localTime < fadeInDur) {
                  vol *= localTime / fadeInDur;
                } else if (conf.fadeOut && localTime > conf.duration - fadeOutDur) {
                  const remaining = conf.duration - localTime;
                  vol *= remaining / fadeOutDur;
                }

                // 音量の急激な変化を防ぐ
                const currentGain = gainNode.gain.value;
                if (Math.abs(currentGain - vol) > 0.01) {
                  gainNode.gain.setTargetAtTime(vol, audioCtxRef.current.currentTime, 0.05);
                }
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

        // キャプション描画（複数同時表示対応）
        if (captionSettings.enabled && captions.length > 0) {
          const activeCaptions = captions.filter(
            (c) => time >= c.startTime && time < c.endTime
          );
          for (const activeCaption of activeCaptions) {
            // フォントサイズ（個別設定優先）
            const fontSizeMap = { small: 32, medium: 48, large: 64, xlarge: 80 };
            const effectiveFontSizeKey = activeCaption.overrideFontSize ?? captionSettings.fontSize;
            const fontSize = fontSizeMap[effectiveFontSizeKey];

            // フォントファミリー（個別設定優先）
            const fontFamilyMap = {
              gothic: 'sans-serif',
              mincho: '"游明朝", "Yu Mincho", "ヒラギノ明朝 ProN", "Hiragino Mincho ProN", serif',
            };
            const effectiveFontStyle = activeCaption.overrideFontStyle ?? captionSettings.fontStyle;
            const fontFamily = fontFamilyMap[effectiveFontStyle];

            // 位置（個別設定優先）
            const effectivePosition = activeCaption.overridePosition ?? captionSettings.position;
            const padding = 50; // 画面端からの固定マージン（サイズ依存を廃止し、大文字でも端に寄せる）
            let y: number;
            if (effectivePosition === 'top') {
              y = padding + fontSize / 2;
            } else if (effectivePosition === 'center') {
              y = CANVAS_HEIGHT / 2;
            } else {
              y = CANVAS_HEIGHT - padding - fontSize / 2;
            }

            // フェードイン・フェードアウトのアルファ値計算
            const captionDuration = activeCaption.endTime - activeCaption.startTime;
            const captionLocalTime = time - activeCaption.startTime;

            // フェード設定を取得（個別設定 > 一括設定）
            // overrideFadeIn/Out: 'on' | 'off' | undefined
            // undefined の場合は一括設定を参照
            const useFadeIn = activeCaption.overrideFadeIn !== undefined
              ? activeCaption.overrideFadeIn === 'on'
              : captionSettings.bulkFadeIn;
            const useFadeOut = activeCaption.overrideFadeOut !== undefined
              ? activeCaption.overrideFadeOut === 'on'
              : captionSettings.bulkFadeOut;

            // フェード時間を取得（個別設定 > 一括設定）
            const fadeInDur = activeCaption.overrideFadeIn === 'on' && activeCaption.overrideFadeInDuration !== undefined
              ? activeCaption.overrideFadeInDuration
              : (captionSettings.bulkFadeInDuration || 1.0);
            const fadeOutDur = activeCaption.overrideFadeOut === 'on' && activeCaption.overrideFadeOutDuration !== undefined
              ? activeCaption.overrideFadeOutDuration
              : (captionSettings.bulkFadeOutDuration || 1.0);

            // フェードイン・フェードアウトのアルファ値を個別に計算
            let fadeInAlpha = 1.0;
            let fadeOutAlpha = 1.0;

            if (useFadeIn && captionLocalTime < fadeInDur) {
              fadeInAlpha = captionLocalTime / fadeInDur;
            }
            if (useFadeOut && captionLocalTime > captionDuration - fadeOutDur) {
              const remaining = captionDuration - captionLocalTime;
              fadeOutAlpha = remaining / fadeOutDur;
            }

            // 両方のアルファ値を乗算して最終的な透明度を計算
            const alpha = Math.max(0, Math.min(1, fadeInAlpha * fadeOutAlpha));

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = `bold ${fontSize}px ${fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const blurStrength = Math.max(0, captionSettings.blur);
            const useNativeFilterBlur = blurStrength > 0 && !isIosSafari;

            // 通常ブラウザ: Canvas filter を使用
            // iOS Safari: text + filter が効かないケースがあるため下でフォールバック描画を行う
            ctx.filter = useNativeFilterBlur ? `blur(${blurStrength}px)` : 'none';

            if (isIosSafari && blurStrength > 0) {
              const baseAlpha = ctx.globalAlpha;
              const blurRings = Math.max(1, Math.round(blurStrength * 2));
              const sampleCount = 12;
              const centerX = CANVAS_WIDTH / 2;

              ctx.fillStyle = captionSettings.fontColor;
              for (let ring = 1; ring <= blurRings; ring++) {
                ctx.globalAlpha = baseAlpha * Math.min(0.2, 0.28 / ring);
                for (let i = 0; i < sampleCount; i++) {
                  const angle = (Math.PI * 2 * i) / sampleCount;
                  const offsetX = Math.cos(angle) * ring;
                  const offsetY = Math.sin(angle) * ring;
                  ctx.fillText(activeCaption.text, centerX + offsetX, y + offsetY);
                }
              }
              ctx.globalAlpha = baseAlpha;
            }

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
                  // シーク中は再生を開始しない（正確な位置からの再生を保証）
                  const needsSeek = Math.abs(element.currentTime - trackTime) > 0.5;

                  if (needsSeek) {
                    // シーク実行前に一時停止して位置を同期
                    if (!element.paused) {
                      element.pause();
                    }
                    element.currentTime = trackTime;
                  }

                  // シーク中でなく、readyStateが十分であれば再生開始
                  if (!element.seeking && element.readyState >= 2 && element.paused) {
                    element.play().catch(() => { });
                  }

                  const fadeInDur = track.fadeInDuration || 1.0;
                  const fadeOutDur = track.fadeOutDuration || 1.0;

                  if (track.fadeIn && playDuration < fadeInDur) {
                    vol *= playDuration / fadeInDur;
                  }
                  if (track.fadeOut && time > totalDurationRef.current - fadeOutDur) {
                    const remaining = totalDurationRef.current - time;
                    vol *= Math.max(0, remaining / fadeOutDur);
                  }

                  // シーク中は音量を0にして音飛びを防ぐ
                  if (element.seeking) {
                    vol = 0;
                  }

                  // 音量の急激な変化を防ぐ
                  const currentGain = gainNode.gain.value;
                  if (Math.abs(currentGain - vol) > 0.01) {
                    gainNode.gain.setTargetAtTime(vol, audioCtxRef.current.currentTime, 0.1);
                  }
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
    [captions, captionSettings, isIosSafari, logInfo]
  );

  // --- 状態同期: Zustandの状態をRefに同期 ---
  // 目的: renderFrame等の非同期処理で最新の状態を参照できるようにする
  useEffect(() => {
    mediaItemsRef.current = mediaItems;
    totalDurationRef.current = totalDuration;
  }, [mediaItems, totalDuration]);

  // --- 再描画トリガー: メディア構成変更時のみキャンバスを更新 ---
  // 目的: メディアの追加・削除・リロード時にプレビューを更新
  // 注意: currentTimeやisPlayingには依存しない（シーク時の過剰描画を防止）
  useEffect(() => {
    if (mediaItems.length > 0 && !isPlaying && !isProcessing) {
      // 少し遅延させてメディア要素の準備を待つ
      const timeoutId = setTimeout(() => {
        renderFrame(currentTimeRef.current, false);
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [mediaItems.length, reloadKey, isPlaying, isProcessing, renderFrame]);

  // --- BGM状態の同期 ---
  // 目的: BGMトラックの最新状態をRefに保持
  useEffect(() => {
    bgmRef.current = bgm;
  }, [bgm]);

  // --- ナレーション状態の同期 ---
  // 目的: ナレーショントラックの最新状態をRefに保持
  useEffect(() => {
    narrationRef.current = narration;
  }, [narration]);

  // --- コンポーネントアンマウント時のクリーンアップ ---
  // 目的: メモリリークを防止し、リソースを適切に解放
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
    const refreshAfterReturn = () => {
      if (document.visibilityState !== 'visible') return;

      const ctx = audioCtxRef.current;
      if (ctx) {
        const state = ctx.state as AudioContextState | 'interrupted';
        if (state !== 'running') {
          ctx.resume()
            .then(() => {
              logInfo('AUDIO', '可視復帰時にAudioContextを再開', { from: state, to: ctx.state });
            })
            .catch((err) => {
              logWarn('AUDIO', '可視復帰時のAudioContext再開に失敗（次のユーザー操作で再試行）', {
                state,
                error: err instanceof Error ? err.message : String(err),
              });
            });
        }
      }

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
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshAfterReturn();
      }
    };
    const handleWindowFocus = () => {
      refreshAfterReturn();
    };
    const handlePageShow = () => {
      refreshAfterReturn();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [renderFrame, logInfo, logWarn]);

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
      } else if (e instanceof Error) {
        // Quota/Limitエラーの判定
        const lowerMsg = e.message.toLowerCase();
        if (lowerMsg.includes('quota') || lowerMsg.includes('limit') || lowerMsg.includes('429')) {
          setError('スクリプト生成のリミットに達しました。しばらく待ってから再試行してください。');
        } else {
          setError(`スクリプト生成エラー: ${e.message}`);
        }
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
          fadeInDuration: 2.0,
          fadeOutDuration: 2.0,
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
        // Quota/Limitエラーの判定
        const lowerMsg = e.message.toLowerCase();
        if (lowerMsg.includes('quota') || lowerMsg.includes('limit') || lowerMsg.includes('429')) {
          setError('音声生成のリミットに達しました。しばらく待ってから再試行してください。');
        } else {
          setError(`音声生成エラー: ${e.message}`);
        }
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
        if ((ctx.state as AudioContextState | 'interrupted') !== 'running') {
          ctx.resume().catch(console.error);
        }
        clearExport();
        addMediaItems(files);
        // メディア追加をログ
        files.forEach(file => {
          logInfo('MEDIA', `メディア追加: ${file.name}`, {
            type: file.type.startsWith('video/') ? 'video' : 'image',
            fileName: file.name,
            fileSize: file.size
          });
        });
      } catch (err) {
        setError('メディアの読み込みエラー');
        logError('MEDIA', 'メディア読み込みエラー', { error: String(err) });
      }
    },
    [getAudioContext, clearExport, addMediaItems, setError, logInfo, logError]
  );

  const handleMediaElementLoaded = useCallback(
    (id: string, element: HTMLVideoElement | HTMLImageElement | HTMLAudioElement) => {
      if (element.tagName === 'VIDEO') {
        const videoEl = element as HTMLVideoElement;
        const duration = videoEl.duration;
        if (!isNaN(duration) && duration !== Infinity) {
          setVideoDuration(id, duration);
          // ビデオロード完了をログ
          logInfo('MEDIA', `ビデオロード完了: ${id.substring(0, 8)}...`, {
            duration: Math.round(duration * 10) / 10,
            readyState: videoEl.readyState,
            videoWidth: videoEl.videoWidth,
            videoHeight: videoEl.videoHeight
          });
        }
      }
    },
    [setVideoDuration, logInfo]
  );

  const handleMediaRefAssign = useCallback(
    (id: string, element: HTMLVideoElement | HTMLImageElement | HTMLAudioElement | null) => {
      if (element) {
        const prevElement = mediaElementsRef.current[id];
        mediaElementsRef.current[id] = element;

        if (element.tagName === 'VIDEO' || element.tagName === 'AUDIO') {
          // DOM 要素が差し替わった場合、古いノード参照を破棄して再作成する。
          if (prevElement && prevElement !== element) {
            if (sourceNodesRef.current[id]) {
              try {
                sourceNodesRef.current[id].disconnect();
              } catch {
                // ignore
              }
              delete sourceNodesRef.current[id];
            }
            if (gainNodesRef.current[id]) {
              try {
                gainNodesRef.current[id].disconnect();
              } catch {
                // ignore
              }
              delete gainNodesRef.current[id];
            }
          }

          let hasAudioNode = !!sourceNodesRef.current[id];
          if (!hasAudioNode) {
            try {
              const ctx = getAudioContext();
              // iOS Safariでは interrupted になることがあるため running 以外は復帰を試みる
              if ((ctx.state as AudioContextState | 'interrupted') !== 'running') {
                ctx.resume().catch(() => { });
              }
              const source = ctx.createMediaElementSource(element as HTMLMediaElement);
              const gain = ctx.createGain();
              source.connect(gain);
              gain.connect(ctx.destination);
              gain.gain.setValueAtTime(1, ctx.currentTime);
              sourceNodesRef.current[id] = source;
              gainNodesRef.current[id] = gain;
              hasAudioNode = true;
            } catch (e) {
              // MediaElementAudioSourceNodeの作成エラーはログに出力
              console.warn(`Audio node creation failed for ${id}:`, e);
            }
          }

          // iOS Safari では複数メディア同時再生時にネイティブ音声経路の競合が起きるため、
          // WebAudio 経路が確立できた要素のみネイティブ出力をミュートする。
          if (isIosSafari && hasAudioNode) {
            const mediaEl = element as HTMLMediaElement;
            mediaEl.defaultMuted = true;
            mediaEl.muted = true;
            mediaEl.volume = 1;
          }
        }
      } else {
        if (sourceNodesRef.current[id]) {
          try {
            sourceNodesRef.current[id].disconnect();
          } catch {
            // ignore
          }
          delete sourceNodesRef.current[id];
        }
        if (gainNodesRef.current[id]) {
          try {
            gainNodesRef.current[id].disconnect();
          } catch {
            // ignore
          }
          delete gainNodesRef.current[id];
        }
        delete mediaElementsRef.current[id];
      }
    },
    [getAudioContext, isIosSafari]
  );

  const handleSeeked = useCallback(() => {
    // ビデオのseekedイベントハンドラ
    // このハンドラはMediaResourceLoaderからすべてのビデオに対して共通で呼ばれるため、
    // 特定のビデオIDを知ることができない。
    // シーク中ビデオの追跡はrenderFrame内で各ビデオのseeking状態を監視して行う。
    requestAnimationFrame(() => renderFrame(currentTimeRef.current, false));
  }, [renderFrame]);

  // --- 動画トリミング更新ハンドラ ---
  // 目的: トリミングスライダー操作時に動画のカット位置を変更
  // 注意: 対象動画のみシークし、他の動画には影響しない
  const handleUpdateVideoTrim = useCallback(
    (id: string, type: 'start' | 'end', value: string) => {
      let val = parseFloat(value);
      if (isNaN(val)) val = 0;

      // ストアを更新
      updateVideoTrim(id, type, val);

      // 対象動画の再生位置をトリミング位置に合わせる
      const item = mediaItems.find((v) => v.id === id);
      if (item) {
        const el = mediaElementsRef.current[id] as HTMLVideoElement;
        if (el && el.tagName === 'VIDEO' && !el.seeking) {
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

  // --- 画像表示時間更新ハンドラ ---
  // 目的: 画像クリップの表示時間を変更
  const handleUpdateImageDuration = useCallback((id: string, newDuration: string) => {
    let val = parseFloat(newDuration);
    if (isNaN(val) || val < 0.5) val = 0.5;
    updateImageDuration(id, val);
  }, [updateImageDuration]);

  // --- スケール更新ハンドラ ---
  // 目的: メディアの拡大率を変更
  const handleUpdateMediaScale = useCallback((id: string, value: string | number) => {
    let val = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(val)) val = 1.0;
    updateScale(id, val);
  }, [updateScale]);

  // --- 位置更新ハンドラ ---
  // 目的: メディアの表示位置（X/Y座標）を変更
  const handleUpdateMediaPosition = useCallback((id: string, axis: 'x' | 'y', value: string) => {
    let val = parseFloat(value);
    if (isNaN(val)) val = 0;
    updatePosition(id, axis, val);
  }, [updatePosition]);

  // --- 設定リセットハンドラ ---
  // 目的: スケールまたは位置を初期値にリセット
  const handleResetMediaSetting = useCallback((id: string, type: 'scale' | 'x' | 'y') => {
    resetTransform(id, type);
  }, [resetTransform]);

  // --- メディア順序変更ハンドラ ---
  // 目的: クリップの再生順序を上下に移動
  const handleMoveMedia = useCallback(
    (idx: number, dir: 'up' | 'down') => {
      moveMediaItem(idx, dir);
    },
    [moveMediaItem]
  );

  // --- メディア削除ハンドラ ---
  // 目的: クリップを削除し、関連するオーディオノードを解放
  const handleRemoveMedia = useCallback((id: string) => {
    // オーディオノードを解放
    if (sourceNodesRef.current[id]) {
      try {
        sourceNodesRef.current[id].disconnect();
      } catch (e) {
        /* ignore */
      }
      delete sourceNodesRef.current[id];
    }
    if (gainNodesRef.current[id]) {
      try {
        gainNodesRef.current[id].disconnect();
      } catch (e) {
        /* ignore */
      }
      delete gainNodesRef.current[id];
    }

    removeMediaItem(id);
    delete mediaElementsRef.current[id];
  }, [removeMediaItem]);

  // --- トランスフォームパネル開閉ハンドラ ---
  // 目的: スケール・位置設定UIの表示/非表示を切り替え
  const handleToggleTransformPanel = useCallback((id: string) => {
    toggleTransformPanel(id);
  }, [toggleTransformPanel]);

  // ==========================================================
  // オーディオトラック（BGM・ナレーション）ハンドラ
  // ==========================================================

  // --- BGMアップロードハンドラ ---
  // 目的: BGMファイルを読み込みストアに設定
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
        volume: 1.0,
        fadeIn: false,
        fadeOut: false,
        fadeInDuration: 2.0,
        fadeOutDuration: 2.0,
        duration: audio.duration,
        isAi: false,
      });
    };
  }, [setBgm, clearExport]);

  // --- ナレーションアップロードハンドラ ---
  // 目的: ナレーションファイルを読み込みストアに設定
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
        fadeInDuration: 2.0,
        fadeOutDuration: 2.0,
        duration: audio.duration,
        isAi: false,
      });
    };
  }, [setNarration, clearExport]);

  // --- BGM/ナレーション開始位置更新ハンドラ ---
  // 目的: オーディオトラックの再生開始位置（ファイル内の位置）を変更
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

  // --- BGM/ナレーション遅延更新ハンドラ ---
  // 目的: オーディオトラックの開始遅延（動画開始からの秒数）を変更
  const handleUpdateTrackDelay = useCallback((type: 'bgm' | 'narration', val: string) => {
    const numVal = parseFloat(val);
    if (isNaN(numVal)) return;

    if (type === 'bgm') {
      updateBgmDelay(numVal);
    } else {
      updateNarrationDelay(numVal);
    }
  }, [updateBgmDelay, updateNarrationDelay]);

  // --- BGM/ナレーション音量更新ハンドラ ---
  // 目的: オーディオトラックの音量を変更
  const handleUpdateTrackVolume = useCallback((type: 'bgm' | 'narration', val: string) => {
    const numVal = parseFloat(val);
    if (isNaN(numVal)) return;

    if (type === 'bgm') {
      updateBgmVolume(numVal);
    } else {
      updateNarrationVolume(numVal);
    }
  }, [updateBgmVolume, updateNarrationVolume]);

  // ==========================================================
  // コアエンジン（再生制御・リソース管理）
  // ==========================================================

  // --- 全停止処理 ---
  // 目的: すべての再生を停止し、状態をリセット
  // 注意: ループID、シーク状態、アニメーションフレーム、メディア要素を全て解放
  const stopAll = useCallback(() => {
    logDebug('SYSTEM', 'stopAll呼び出し', { previousLoopId: loopIdRef.current, isPlayingRef: isPlayingRef.current });

    // ループIDをインクリメントして古いループを無効化
    loopIdRef.current += 1;
    isPlayingRef.current = false;
    activeVideoIdRef.current = null;

    // シーク関連の状態をリセット
    isSeekingRef.current = false;
    wasPlayingBeforeSeekRef.current = false;
    seekingVideosRef.current.clear();
    pendingSeekRef.current = null;

    // 保留中のシーク処理タイマーをクリア
    if (pendingSeekTimeoutRef.current) {
      clearTimeout(pendingSeekTimeoutRef.current);
      pendingSeekTimeoutRef.current = null;
    }

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
    // WebCodecsエクスポートの強制停止
    stopWebCodecsExport();
  }, [stopWebCodecsExport]);

  // --- Helper: 一時停止付きで関数を実行 ---
  // 目的: 編集操作時に必ず一時停止を実行してから元の処理を行う
  // 依存関係: stopAll (実行停止用), pause (UI更新用)
  const withPause = useCallback(<T extends any[]>(fn: (...args: T) => void) => {
    return (...args: T) => {
      stopAll();
      pause();
      fn(...args);
    };
  }, [stopAll, pause]);

  // --- 全クリア処理 ---
  // 目的: 全てのメディア・オーディオ・キャプションを削除し初期状態に戻す
  const handleClearAll = useCallback(() => {
    if (mediaItems.length === 0 && !bgm && !narration) return;

    // 確認ダイアログを表示
    const confirmed = window.confirm('すべてのメディア、BGM、ナレーションをクリアします。よろしいですか？');
    if (!confirmed) return;

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

  const configureAudioRouting = useCallback((isExporting: boolean) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const dest = masterDestRef.current;

    Object.keys(gainNodesRef.current).forEach((id) => {
      const gain = gainNodesRef.current[id];
      try {
        // 一旦すべての接続を解除
        gain.disconnect();

        if (isExporting && dest) {
          // エクスポート先（録音用ノード）へ接続（PC/Android の TrackProcessor 用）
          // iOS Safari では OfflineAudioContext で音声をプリレンダリングするため、
          // リアルタイムのオーディオルーティングは不要だが、
          // masterDest への接続は維持する（フォールバック用）
          gain.connect(dest);
        } else {
          // 通常再生時はスピーカーへ接続
          gain.connect(ctx.destination);
        }
      } catch (e) {
        /* ignore */
      }
    });
  }, []);

  // --- 再生ループ ---
  // 目的: 再生中にフレームを継続的に描画
  // 注意: loopIdを監視し、古いループは自動的に終了
  const loop = useCallback(
    (isExportMode: boolean, myLoopId: number) => {
      // このループが無効化されていたら終了
      if (myLoopId !== loopIdRef.current) {
        logDebug('RENDER', 'ループ終了（loopId不一致）', { myLoopId, currentLoopId: loopIdRef.current });
        return;
      }

      if (mediaItemsRef.current.length === 0) {
        logWarn('RENDER', 'ループ終了（メディアなし）', {});
        stopAll();
        return;
      }

      // 再生状態でなければ終了
      if (!isPlayingRef.current && !isExportMode) {
        logWarn('RENDER', 'ループ終了（再生状態でない）', { isPlayingRef: isPlayingRef.current, isExportMode });
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
      currentTimeRef.current = elapsed;
      renderFrame(elapsed, true, isExportMode);
      reqIdRef.current = requestAnimationFrame(() => loop(isExportMode, myLoopId));
    },
    [stopAll, pause, setCurrentTime, renderFrame, logDebug, logWarn]
  );

  // --- エンジン起動処理 ---
  // 目的: 再生またはエクスポートを開始
  // 処理: AudioContext復帰→メディア準備→ループ開始
  const startEngine = useCallback(
    async (fromTime: number, isExportMode: boolean) => {
      logInfo('AUDIO', 'エンジン起動開始', { fromTime, isExportMode });

      const ctx = getAudioContext();
      const stateBeforeResume = ctx.state as AudioContextState | 'interrupted';
      logDebug('AUDIO', 'AudioContext状態', { state: stateBeforeResume });
      if (stateBeforeResume !== 'running') {
        try {
          await ctx.resume();
        } catch (err) {
          logWarn('AUDIO', 'AudioContext再開に失敗（1回目）', {
            state: stateBeforeResume,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        const stateAfterFirstResume = ctx.state as AudioContextState | 'interrupted';
        if (stateAfterFirstResume !== 'running') {
          try {
            // iOS Safariの復帰直後は1回目resumeで復帰しないことがあるため再試行
            await ctx.resume();
          } catch (err) {
            logWarn('AUDIO', 'AudioContext再開に失敗（2回目）', {
              state: stateAfterFirstResume,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        logInfo('AUDIO', 'AudioContext再開処理後の状態', {
          before: stateBeforeResume,
          after: ctx.state,
        });
      }

      // iOS Safari では外部再生復帰後に state が running でも無音化する場合があるため、
      // ユーザー操作起点の再生開始時に一度 suspend/resume で音声経路を再初期化する。
      if (isIosSafari && !isExportMode) {
        try {
          if ((ctx.state as AudioContextState | 'interrupted') === 'running') {
            await ctx.suspend();
            await ctx.resume();
            logInfo('AUDIO', 'iOS Safari 音声経路を再初期化', { state: ctx.state });
          }
        } catch (err) {
          logWarn('AUDIO', 'iOS Safari 音声経路再初期化に失敗', {
            error: err instanceof Error ? err.message : String(err),
            state: ctx.state,
          });
        }
      }

      // 既存のループとメディアを停止（これでloopIdRefがインクリメントされる）
      stopAll();

      // 新しいループIDを取得
      const myLoopId = loopIdRef.current;
      logDebug('RENDER', 'ループID取得', { myLoopId });

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

        // エクスポート前にオーディオ要素のプリロードとシーク準備を行う
        // BGMとナレーションの開始位置（startPoint）へのシークを事前に完了させる
        const audioPreloadPromises: Promise<void>[] = [];

        const prepareAudioTrack = (track: AudioTrack | null, trackId: string): Promise<void> => {
          return new Promise((resolve) => {
            const element = mediaElementsRef.current[trackId] as HTMLAudioElement;
            if (!track || !element) {
              resolve();
              return;
            }

            // 開始位置にシーク
            const targetTime = track.startPoint;

            // readyStateが低い場合はロード待機
            if (element.readyState < 2) {
              const handleCanPlay = () => {
                element.removeEventListener('canplay', handleCanPlay);
                // シークが必要な場合
                if (targetTime > 0 && Math.abs(element.currentTime - targetTime) > 0.1) {
                  const handleSeeked = () => {
                    element.removeEventListener('seeked', handleSeeked);
                    logDebug('AUDIO', `${trackId}プリロード完了（シーク後）`, { targetTime, actualTime: element.currentTime });
                    resolve();
                  };
                  element.addEventListener('seeked', handleSeeked, { once: true });
                  element.currentTime = targetTime;
                } else {
                  logDebug('AUDIO', `${trackId}プリロード完了`, { targetTime });
                  resolve();
                }
              };
              element.addEventListener('canplay', handleCanPlay, { once: true });
              element.load();

              // タイムアウト保険（5秒）
              setTimeout(() => {
                element.removeEventListener('canplay', handleCanPlay);
                logWarn('AUDIO', `${trackId}プリロードタイムアウト`, { readyState: element.readyState });
                resolve();
              }, 5000);
            } else {
              // 既にロード済みの場合はシークのみ
              if (targetTime > 0 && Math.abs(element.currentTime - targetTime) > 0.1) {
                const handleSeeked = () => {
                  element.removeEventListener('seeked', handleSeeked);
                  logDebug('AUDIO', `${trackId}シーク完了`, { targetTime, actualTime: element.currentTime });
                  resolve();
                };
                element.addEventListener('seeked', handleSeeked, { once: true });
                element.currentTime = targetTime;

                // タイムアウト保険（2秒）
                setTimeout(() => {
                  element.removeEventListener('seeked', handleSeeked);
                  resolve();
                }, 2000);
              } else {
                resolve();
              }
            }
          });
        };

        // BGMとナレーションのプリロードを並列実行
        const currentBgm = bgmRef.current;
        const currentNarration = narrationRef.current;
        if (currentBgm) {
          audioPreloadPromises.push(prepareAudioTrack(currentBgm, 'bgm'));
        }
        if (currentNarration) {
          audioPreloadPromises.push(prepareAudioTrack(currentNarration, 'narration'));
        }

        // オーディオプリロード完了を待機
        if (audioPreloadPromises.length > 0) {
          logInfo('AUDIO', 'オーディオプリロード開始', { bgm: !!currentBgm, narration: !!currentNarration });
          await Promise.all(audioPreloadPromises);
          logInfo('AUDIO', 'オーディオプリロード完了');
        }

        // iOS Safari: エクスポート開始前に先頭フレームを確実に準備する。
        // これを行わないと、直前のプレビュー最終フレームが先頭に混入することがある。
        if (isIosSafari) {
          const firstItem = mediaItemsRef.current[0];
          if (firstItem?.type === 'video') {
            const firstVideo = mediaElementsRef.current[firstItem.id] as HTMLVideoElement | undefined;
            if (firstVideo) {
              const targetTime = firstItem.trimStart || 0;
              try {
                if (firstVideo.readyState === 0) {
                  firstVideo.load();
                }
                if (Math.abs(firstVideo.currentTime - targetTime) > 0.01) {
                  firstVideo.currentTime = targetTime;
                }
              } catch {
                // ignore
              }

              await new Promise<void>((resolve) => {
                let done = false;
                const finish = () => {
                  if (done) return;
                  done = true;
                  clearTimeout(timeoutId);
                  firstVideo.removeEventListener('loadeddata', onReady);
                  firstVideo.removeEventListener('canplay', onReady);
                  firstVideo.removeEventListener('seeked', onReady);
                  resolve();
                };
                const onReady = () => {
                  if (firstVideo.readyState >= 2 && !firstVideo.seeking) {
                    finish();
                  }
                };
                const timeoutId = setTimeout(finish, 1500);
                firstVideo.addEventListener('loadeddata', onReady);
                firstVideo.addEventListener('canplay', onReady);
                firstVideo.addEventListener('seeked', onReady);
                onReady();
              });
            }
          }
        }

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
                videoEl.play().catch(() => { });
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
        startWebCodecsExport(
          canvasRef,
          masterDestRef,
          (url, ext) => {
            setExportUrl(url);
            setExportExt(ext as 'mp4' | 'webm');
            setProcessing(false);
            pause();
            // エンジン停止（再生ループを止める）
            stopAll();
          },
          (message) => {
            setProcessing(false);
            pause();
            stopAll();
            setError(message);
          },
          {
            mediaItems: mediaItemsRef.current,
            bgm: bgmRef.current,
            narration: narrationRef.current,
            totalDuration: totalDurationRef.current,
            // 音声プリレンダリング完了後に再生ループを開始
            // iOS Safari ではリアルタイム音声抽出に数秒かかるため、
            // その完了を待ってからビデオキャプチャ用の再生を始める。
            // startTimeRef を再セットしないと、抽出に費やした時間分
            // elapsed が進んでしまいループが即座に終了する。
            onAudioPreRenderComplete: () => {
              startTimeRef.current = Date.now() - fromTime * 1000;
              loop(isExportMode, myLoopId);
            },
          }
        );
      } else {
        loop(isExportMode, myLoopId);
      }
    },
    [getAudioContext, stopAll, setProcessing, play, clearExport, configureAudioRouting, setCurrentTime, setExportUrl, setExportExt, pause, renderFrame, loop, setError, logWarn, isIosSafari]
  );

  // --- シークバー操作ハンドラ ---
  // 目的: ユーザーがシークバーをドラッグした時にプレビューを更新
  // 設計: スロットリングで過剰なビデオシークを防止し、カクつきを軽減
  const handleSeekChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const t = parseFloat(e.target.value);
      const now = Date.now();

      // シーク開始時の処理
      if (!isSeekingRef.current) {
        wasPlayingBeforeSeekRef.current = isPlayingRef.current;
        isSeekingRef.current = true;
        logDebug('RENDER', 'シーク開始', { fromTime: currentTimeRef.current, toTime: t });

        // 再生中なら一時停止
        if (isPlayingRef.current) {
          if (reqIdRef.current) {
            cancelAnimationFrame(reqIdRef.current);
            reqIdRef.current = null;
          }
          if (playbackTimeoutRef.current) {
            clearTimeout(playbackTimeoutRef.current);
            playbackTimeoutRef.current = null;
          }
          // 全ビデオを一時停止
          Object.values(mediaElementsRef.current).forEach((el) => {
            if (el && el.tagName === 'VIDEO') {
              try { (el as HTMLVideoElement).pause(); } catch (e) { /* ignore */ }
            }
          });
        }
      }

      // UI更新は常に即座に実行
      setCurrentTime(t);
      currentTimeRef.current = t;

      // スロットリング: ビデオシークは間隔を空けて実行
      const timeSinceLastSeek = now - lastSeekTimeRef.current;
      if (timeSinceLastSeek < SEEK_THROTTLE_MS) {
        // 保留中のシークを記録し、タイマーで後から処理
        pendingSeekRef.current = t;
        if (!pendingSeekTimeoutRef.current) {
          pendingSeekTimeoutRef.current = setTimeout(() => {
            pendingSeekTimeoutRef.current = null;
            if (pendingSeekRef.current !== null) {
              const pendingT = pendingSeekRef.current;
              pendingSeekRef.current = null;
              lastSeekTimeRef.current = Date.now();
              syncVideoToTime(pendingT);
              renderFrame(pendingT, false);
            }
          }, SEEK_THROTTLE_MS - timeSinceLastSeek);
        }
        // キャンバスだけは更新（画像の場合など）
        renderFrame(t, false);
        return;
      }

      lastSeekTimeRef.current = now;
      pendingSeekRef.current = null;
      if (pendingSeekTimeoutRef.current) {
        clearTimeout(pendingSeekTimeoutRef.current);
        pendingSeekTimeoutRef.current = null;
      }

      // ビデオ位置を同期してフレーム描画
      syncVideoToTime(t);
      renderFrame(t, false);
    },
    [setCurrentTime, renderFrame]
  );

  // --- ビデオ位置同期ヘルパー ---
  // 目的: 指定時刻に対応するビデオの再生位置を設定
  const syncVideoToTime = useCallback((t: number) => {
    let accTime = 0;
    for (const item of mediaItemsRef.current) {
      if (t >= accTime && t < accTime + item.duration) {
        if (item.type === 'video') {
          const videoEl = mediaElementsRef.current[item.id] as HTMLVideoElement;
          if (videoEl) {
            // readyState 0: 未ロード → load()でデータ取得を開始
            if (videoEl.readyState === 0 && !videoEl.error) {
              try { videoEl.load(); } catch (e) { /* ignore */ }
            }
            // シーク中でなければ位置を合わせる
            if (!videoEl.seeking && videoEl.readyState >= 1) {
              const localTime = t - accTime;
              const targetTime = (item.trimStart || 0) + localTime;
              // シーク時は少しのズレでも位置を合わせる（0.1秒しきい値）
              if (Math.abs(videoEl.currentTime - targetTime) > 0.1) {
                videoEl.currentTime = targetTime;
              }
            }
          }
          activeVideoIdRef.current = item.id;
        } else {
          activeVideoIdRef.current = null;
        }
        return;
      }
      accTime += item.duration;
    }

    // シーク終端対策: t が totalDuration 以上の場合、最後のクリップの最終フレームに同期
    const items = mediaItemsRef.current;
    if (items.length > 0 && t >= totalDurationRef.current) {
      const lastItem = items[items.length - 1];
      if (lastItem.type === 'video') {
        const videoEl = mediaElementsRef.current[lastItem.id] as HTMLVideoElement;
        if (videoEl) {
          if (videoEl.readyState === 0 && !videoEl.error) {
            try { videoEl.load(); } catch (e) { /* ignore */ }
          }
          if (!videoEl.seeking && videoEl.readyState >= 1) {
            const targetTime = (lastItem.trimStart || 0) + Math.max(0, lastItem.duration - 0.001);
            if (Math.abs(videoEl.currentTime - targetTime) > 0.1) {
              videoEl.currentTime = targetTime;
            }
          }
        }
        activeVideoIdRef.current = lastItem.id;
      } else {
        activeVideoIdRef.current = null;
      }
      return;
    }

    activeVideoIdRef.current = null;
  }, []);

  // --- シークバー操作完了ハンドラ ---
  // 目的: シークバーのドラッグ終了時に再生を再開（必要な場合）
  const handleSeekEnd = useCallback(() => {
    // 保留中のタイマーをクリア
    if (pendingSeekTimeoutRef.current) {
      clearTimeout(pendingSeekTimeoutRef.current);
      pendingSeekTimeoutRef.current = null;
    }

    // 再生待機タイムアウトをクリア
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }

    // シーク中フラグをクリア
    seekingVideosRef.current.clear();

    const t = currentTimeRef.current;
    const wasPlaying = wasPlayingBeforeSeekRef.current;

    // 保留中のシークがあれば最終処理
    if (pendingSeekRef.current !== null) {
      const pendingT = pendingSeekRef.current;
      pendingSeekRef.current = null;
      syncVideoToTime(pendingT);
    }

    // シーク状態を先にリセット（重要: 以降のrenderFrameで正しく動作させるため）
    isSeekingRef.current = false;
    wasPlayingBeforeSeekRef.current = false;

    // シーク前に再生中だった場合は再開
    if (wasPlaying) {
      // 再生再開のための内部関数
      const proceedWithPlayback = () => {
        startTimeRef.current = Date.now() - t * 1000;
        isPlayingRef.current = true;

        // アクティブなビデオを特定して再生開始
        let accTime = 0;
        for (const item of mediaItemsRef.current) {
          if (t >= accTime && t < accTime + item.duration) {
            if (item.type === 'video') {
              const videoEl = mediaElementsRef.current[item.id] as HTMLVideoElement;
              if (videoEl) {
                const localTime = t - accTime;
                const targetTime = (item.trimStart || 0) + localTime;

                // 位置を正確に設定
                if (Math.abs(videoEl.currentTime - targetTime) > 0.05) {
                  videoEl.currentTime = targetTime;
                }
                activeVideoIdRef.current = item.id;

                // 準備完了なら即再生、そうでなければ待機
                if (videoEl.readyState >= 2 && !videoEl.seeking) {
                  videoEl.play().catch(() => { });
                } else {
                  const playWhenReady = () => {
                    if (isPlayingRef.current && videoEl.paused) {
                      videoEl.play().catch(() => { });
                    }
                  };
                  // canplay (readyState >= 3) を使用。canplaythrough は長い動画で
                  // 発火しない場合があるため。
                  videoEl.addEventListener('canplay', playWhenReady, { once: true });
                  playbackTimeoutRef.current = setTimeout(() => {
                    playbackTimeoutRef.current = null;
                    // readyState >= 1 でplay()を許可（ブラウザがバッファリングを開始する）
                    if (isPlayingRef.current && videoEl.paused && videoEl.readyState >= 1) {
                      videoEl.play().catch(() => { });
                    }
                  }, 1000);
                }
              }
            } else {
              activeVideoIdRef.current = null;
            }
            break;
          }
          accTime += item.duration;
        }

        // 非アクティブなビデオをリセット
        resetInactiveVideos();

        // ループ再開
        const currentLoopId = loopIdRef.current;
        reqIdRef.current = requestAnimationFrame(() => loop(false, currentLoopId));
      };

      // アクティブビデオがシーク中の場合は完了を待つ
      let accTime = 0;
      for (const item of mediaItemsRef.current) {
        if (t >= accTime && t < accTime + item.duration) {
          if (item.type === 'video') {
            const videoEl = mediaElementsRef.current[item.id] as HTMLVideoElement;
            if (videoEl && videoEl.seeking) {
              // seekedイベントを待ってから再開
              const onSeeked = () => {
                videoEl.removeEventListener('seeked', onSeeked);
                if (playbackTimeoutRef.current) {
                  clearTimeout(playbackTimeoutRef.current);
                  playbackTimeoutRef.current = null;
                }
                proceedWithPlayback();
              };
              videoEl.addEventListener('seeked', onSeeked);
              // フォールバックタイムアウト（万が一イベントが発火しない場合）
              playbackTimeoutRef.current = setTimeout(() => {
                videoEl.removeEventListener('seeked', onSeeked);
                playbackTimeoutRef.current = null;
                proceedWithPlayback();
              }, 500);
              return;
            }
          }
          break;
        }
        accTime += item.duration;
      }

      // シーク中でなければ即座に再生開始
      proceedWithPlayback();
    } else {
      // 再生していなかった場合は現在位置でフレームを再描画
      renderFrame(t, false);
    }
  }, [renderFrame, loop, resetInactiveVideos, syncVideoToTime]);

  // --- 再生/一時停止トグル ---
  // 目的: 再生中なら停止、停止中なら再生を開始
  // 注意: 200msのデバウンスで連続クリックを防止
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

  // --- 停止ハンドラ ---
  // 目的: 再生を停止し、時刻を0にリセットしてリソースをリロード
  // --- 停止ハンドラ ---
  // 目的: 再生を停止し、時刻を0にリセット（リソースのリロードは行わない）
  // 改善: 以前はhandleReloadResourcesを呼んでいたが、DOM破棄により動画切り替え時にクラッシュするため
  //       安全な停止・巻き戻し処理に変更
  const handleStop = useCallback(() => {
    stopAll();
    pause();
    setCurrentTime(0);
    currentTimeRef.current = 0;

    // エクスポート後の保存ボタンをクリアして書き出しボタンに戻す
    clearExport();

    // [TV] 全メディアを安全に巻き戻し (DOM要素を維持したままリセット)
    // 各ビデオをtrimStart位置にリセット（0ではなく実際の開始位置へ）
    for (const item of mediaItemsRef.current) {
      const el = mediaElementsRef.current[item.id];
      if (el && el.tagName === 'VIDEO') {
        try {
          const videoEl = el as HTMLVideoElement;
          videoEl.pause();
          videoEl.currentTime = item.trimStart || 0;
        } catch (e) {
          /* ignore */
        }
      }
    }
    // BGM/ナレーションは0に戻す
    ['bgm', 'narration'].forEach((trackId) => {
      const el = mediaElementsRef.current[trackId];
      if (el && (el.tagName === 'AUDIO')) {
        try {
          const audioEl = el as HTMLAudioElement;
          audioEl.pause();
          audioEl.currentTime = 0;
        } catch (e) {
          /* ignore */
        }
      }
    });

    // 0秒時点を描画
    // 少し遅延させて確実にシーク反映させる
    requestAnimationFrame(() => renderFrame(0, false));
  }, [stopAll, pause, setCurrentTime, clearExport, renderFrame]);

  // --- Helper: 停止付きで関数を実行 ---
  // 目的: BGM/ナレーション追加時など、完全に停止して先頭に戻してから実行したい場合に使用
  const withStop = useCallback(<T extends any[]>(fn: (...args: T) => void) => {
    return (...args: T) => {
      handleStop();
      fn(...args);
    };
  }, [handleStop]);

  // --- エクスポート開始ハンドラ ---
  // 目的: 動画ファイルとして書き出しを開始
  const handleExport = useCallback(() => {
    startEngine(0, true);
  }, [startEngine]);

  // --- 時刻フォーマットヘルパー ---
  // 目的: 秒数を「分:秒」形式の文字列に変換
  const formatTime = useCallback((s: number): string => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }, []);

  // --- キャプチャハンドラ ---
  // 目的: プレビューの現在のフレームをPNG画像として保存
  // 再生中の場合は一時停止してからキャプチャする
  const handleCapture = useCallback(async () => {
    // メディアがない場合は何もしない
    if (mediaItems.length === 0) return;
    // エクスポート中はキャプチャ不可
    if (isProcessing) return;

    // 再生中の場合は一時停止
    const wasPlaying = isPlayingRef.current;
    if (wasPlaying) {
      stopAll();
      pause();
    }

    // Canvasからキャプチャ
    const canvas = canvasRef.current;
    if (!canvas) {
      showToast('キャプチャに失敗しました');
      return;
    }

    const timestamp = formatTime(currentTimeRef.current).replace(':', 'm') + 's';
    const filename = `turtle_capture_${timestamp}_${Date.now()}`;
    const success = await captureCanvasAsImage(canvas, filename);

    if (success) {
      showToast('キャプチャを保存しました');
    } else {
      showToast('キャプチャに失敗しました');
    }
  }, [mediaItems.length, isProcessing, stopAll, pause, showToast, formatTime]);

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

      {/* SaveLoad Modal */}
      <SaveLoadModal
        isOpen={showProjectManager}
        onClose={() => setShowProjectManager(false)}
        onToast={(msg, type) => {
          if (type === 'error') {
            setError(msg);
          } else {
            showToast(msg);
          }
        }}
      />

      {/* Header */}
      <Header
        onOpenSettings={() => setShowSettings(true)}
        onOpenProjectManager={() => setShowProjectManager(true)}
      />

      <div className="max-w-md md:max-w-3xl lg:max-w-6xl mx-auto p-4 lg:p-6">
        <ErrorMessage message={errorMsg} count={errorCount} onClose={clearError} />

        <div className="mt-4 lg:grid lg:grid-cols-[1fr_585px] lg:gap-8">
          {/* 左カラム: 編集コントロール（モバイルでは通常の縦並び） */}
          <div className="space-y-6">
            {/* 1. CLIPS */}
            <ClipsSection
              mediaItems={mediaItems}
              isClipsLocked={isClipsLocked}
              mediaElements={mediaElementsRef.current as Record<string, HTMLVideoElement | HTMLImageElement>}
              onToggleClipsLock={withPause(toggleClipsLock)}
              onMediaUpload={withPause(handleMediaUpload)}
              onMoveMedia={withPause(handleMoveMedia)}
              onRemoveMedia={withPause(handleRemoveMedia)}
              onToggleMediaLock={withPause(toggleItemLock)}
              onToggleTransformPanel={withPause(handleToggleTransformPanel)}
              onUpdateVideoTrim={withPause(handleUpdateVideoTrim)}
              onUpdateImageDuration={withPause(handleUpdateImageDuration)}
              onUpdateMediaScale={withPause(handleUpdateMediaScale)}
              onUpdateMediaPosition={withPause(handleUpdateMediaPosition)}
              onResetMediaSetting={withPause(handleResetMediaSetting)}
              onUpdateMediaVolume={withPause(updateVolume)}
              onToggleMediaMute={withPause(toggleMute)}
              onToggleMediaFadeIn={withPause(toggleFadeIn)}
              onToggleMediaFadeOut={withPause(toggleFadeOut)}
              onUpdateFadeInDuration={withPause(updateFadeInDuration)}
              onUpdateFadeOutDuration={withPause(updateFadeOutDuration)}
            />

            {/* 2. BGM SETTINGS */}
            <BgmSection
              bgm={bgm}
              isBgmLocked={isBgmLocked}
              totalDuration={totalDuration}
              onToggleBgmLock={withPause(toggleBgmLock)}
              onBgmUpload={withStop(handleBgmUpload)}
              onRemoveBgm={withPause(removeBgm)}
              onUpdateStartPoint={withPause((val) => handleUpdateTrackStart('bgm', val))}
              onUpdateDelay={withPause((val) => handleUpdateTrackDelay('bgm', val))}
              onUpdateVolume={withPause((val) => handleUpdateTrackVolume('bgm', val))}
              onToggleFadeIn={withPause(toggleBgmFadeIn)}
              onToggleFadeOut={withPause(toggleBgmFadeOut)}
              onUpdateFadeInDuration={withPause(updateBgmFadeInDuration)}
              onUpdateFadeOutDuration={withPause(updateBgmFadeOutDuration)}
              formatTime={formatTime}
            />

            {/* 3. NARRATION SETTINGS */}
            <NarrationSection
              narration={narration}
              isNarrationLocked={isNarrationLocked}
              totalDuration={totalDuration}
              onToggleNarrationLock={withPause(toggleNarrationLock)}
              onShowAiModal={withPause(openAiModal)}
              onNarrationUpload={withStop(handleNarrationUpload)}
              onRemoveNarration={withPause(removeNarration)}
              onUpdateStartPoint={withPause((val) => handleUpdateTrackStart('narration', val))}
              onUpdateDelay={withPause((val) => handleUpdateTrackDelay('narration', val))}
              onUpdateVolume={withPause((val) => handleUpdateTrackVolume('narration', val))}
              onToggleFadeIn={withPause(toggleNarrationFadeIn)}
              onToggleFadeOut={withPause(toggleNarrationFadeOut)}
              onUpdateFadeInDuration={withPause(updateNarrationFadeInDuration)}
              onUpdateFadeOutDuration={withPause(updateNarrationFadeOutDuration)}
              formatTime={formatTime}
            />

            {/* 4. CAPTIONS */}
            <CaptionSection
              captions={captions}
              settings={captionSettings}
              isLocked={isCaptionLocked}
              totalDuration={totalDuration}
              currentTime={currentTime}
              onToggleLock={withPause(toggleCaptionLock)}
              onAddCaption={withPause(addCaption)}
              onUpdateCaption={withPause(updateCaption)}
              onRemoveCaption={withPause(removeCaption)}
              onMoveCaption={withPause(moveCaption)}
              onSetEnabled={withPause(setCaptionEnabled)}
              onSetFontSize={withPause(setCaptionFontSize)}
              onSetFontStyle={withPause(setCaptionFontStyle)}
              onSetPosition={withPause(setCaptionPosition)}
              onSetBlur={withPause(setCaptionBlur)}
              onSetBulkFadeIn={withPause(setBulkFadeIn)}
              onSetBulkFadeOut={withPause(setBulkFadeOut)}
              onSetBulkFadeInDuration={withPause(setBulkFadeInDuration)}
              onSetBulkFadeOutDuration={withPause(setBulkFadeOutDuration)}
            />

          </div>

          {/* 右カラム: プレビュー（モバイルでは下部に表示、PCではスティッキーサイドバー） */}
          <div className="mt-6 lg:mt-0">
            <div className="lg:sticky lg:top-20">
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
                isLoading={isLoading}
                exportUrl={exportUrl}
                exportExt={exportExt}
                onSeekChange={handleSeekChange}
                onSeekEnd={handleSeekEnd}
                onTogglePlay={togglePlay}
                onStop={handleStop}
                onExport={handleExport}
                onClearAll={handleClearAll}
                onCapture={handleCapture}
                formatTime={formatTime}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TurtleVideo;
