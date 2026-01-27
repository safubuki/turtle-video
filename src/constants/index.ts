/**
 * タートルビデオ - 定数
 */
import type { VoiceOption } from '../types';

// キャンバス設定
export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;
export const FPS = 30;

// フェード設定
export const FADE_DURATION = 1.0; // 秒
export const AUDIO_FADE_DURATION = 2.0; // 秒

// スケール設定
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 3.0;
export const BLACK_BORDER_REMOVAL_SCALE = 1.025;

// 画像デフォルト設定
export const DEFAULT_IMAGE_DURATION = 5; // 秒
export const MIN_IMAGE_DURATION = 0.5; // 秒
export const MAX_IMAGE_DURATION = 60; // 秒

// ボリューム設定
export const DEFAULT_VIDEO_VOLUME = 1.0;
export const DEFAULT_BGM_VOLUME = 0.5;
export const DEFAULT_NARRATION_VOLUME = 1.0;

// 同期設定
export const VIDEO_SYNC_THRESHOLD = 0.8; // 秒 - 再生中の同期ズレ許容値
export const SEEK_SYNC_THRESHOLD = 0.01; // 秒 - シーク時の同期精度
export const AUDIO_SYNC_THRESHOLD = 0.5; // 秒 - オーディオの同期ズレ許容値
export const PRELOAD_TIME = 1.5; // 秒 - 次のメディアのプリロード開始時間

// API設定
export const GEMINI_SCRIPT_MODEL = 'gemini-2.5-flash-preview-09-2025';
export const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
export const TTS_SAMPLE_RATE = 24000;

// 利用可能なボイスリスト
export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'Aoede', label: '女性 (明るめ)', desc: '親しみやすい標準的な声' },
  { id: 'Kore', label: '女性 (落ち着いた)', desc: '穏やかで安心感のある声' },
  { id: 'Puck', label: '男性 (ハキハキ)', desc: 'クリアで聞き取りやすい声' },
  { id: 'Fenrir', label: '男性 (低音・渋め)', desc: '深みのある力強い声' },
  { id: 'Charon', label: '男性 (エネルギッシュ)', desc: '少し強めのしっかりした声' },
];

// エクスポート設定
export const EXPORT_VIDEO_BITRATE = 5000000; // 5Mbps
