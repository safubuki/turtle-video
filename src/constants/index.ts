/**
 * @file index.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description アプリケーション全体で使用される定数定義（キャンバスサイズ、デフォルト値、API設定など）。
 */
import type { VoiceGenderFilter, VoiceOption } from '../types';

// キャンバス設定
// プレビュー描画は軽量に保つため 1280×720 を上限とする。
// 書き出し時のみソース動画の解像度に応じて 1920×1080 まで動的に拡大する。
export const MAX_CANVAS_WIDTH = 1920;
export const MAX_CANVAS_HEIGHT = 1080;
export const MAX_PREVIEW_CANVAS_WIDTH = 1280;
export const MAX_PREVIEW_CANVAS_HEIGHT = 720;
export const DEFAULT_CANVAS_WIDTH = MAX_PREVIEW_CANVAS_WIDTH;
export const DEFAULT_CANVAS_HEIGHT = MAX_PREVIEW_CANVAS_HEIGHT;
export const CANVAS_WIDTH = MAX_PREVIEW_CANVAS_WIDTH;
export const CANVAS_HEIGHT = MAX_PREVIEW_CANVAS_HEIGHT;
export const FPS = 30;

// フェード設定
export const FADE_DURATION = 1.0; // 秒
export const AUDIO_FADE_DURATION = 2.0; // 秒
export const CAPTION_FADE_DURATION = 0.5; // 秒

// フェード時間オプション
export const FADE_DURATION_OPTIONS = [0.5, 1.0, 2.0];
export const DEFAULT_FADE_DURATION = 1.0;

// 音量増幅設定
export const MAX_VOLUME = 1.5;                    // 150%まで増幅可能
export const STANDARD_VOLUME_POSITION = 0.75;     // 3/4位置 = 100%

// スケール設定
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 4.0;
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
export const SEEK_THROTTLE_MS = 50; // ミリ秒 - シーク操作のスロットリング間隔

// API設定
export const GEMINI_SCRIPT_MODEL = 'gemini-2.5-flash';
export const GEMINI_SCRIPT_FALLBACK_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash'];
export const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
export const TTS_SAMPLE_RATE = 24000;

/**
 * Gemini TTS / Google AI Studio の prebuilt ボイス一覧（公式 30 声）。
 *
 * 公式に公開されている項目のみを保持する:
 * - voice_name / trait: https://ai.google.dev/gemini-api/docs/speech-generation#voices
 * - gender (Female/Male): https://docs.cloud.google.com/text-to-speech/docs/gemini-tts#voice_options
 *
 * 年齢層・詳細な利用シーン説明など、公式にない推測は載せない。
 */
export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'Zephyr', label: 'Zephyr', gender: 'female', traitEn: 'Bright', desc: '明るい（Bright）' },
  { id: 'Puck', label: 'Puck', gender: 'male', traitEn: 'Upbeat', desc: '陽気・元気（Upbeat）' },
  { id: 'Charon', label: 'Charon', gender: 'male', traitEn: 'Informative', desc: '説明向き（Informative）' },
  { id: 'Kore', label: 'Kore', gender: 'female', traitEn: 'Firm', desc: 'しっかり（Firm）' },
  { id: 'Fenrir', label: 'Fenrir', gender: 'male', traitEn: 'Excitable', desc: '活発（Excitable）' },
  { id: 'Leda', label: 'Leda', gender: 'female', traitEn: 'Youthful', desc: '若々しい（Youthful）' },
  { id: 'Orus', label: 'Orus', gender: 'male', traitEn: 'Firm', desc: 'しっかり（Firm）' },
  { id: 'Aoede', label: 'Aoede', gender: 'female', traitEn: 'Breezy', desc: '軽やか（Breezy）' },
  { id: 'Callirrhoe', label: 'Callirrhoe', gender: 'female', traitEn: 'Easy-going', desc: 'くつろいだ（Easy-going）' },
  { id: 'Autonoe', label: 'Autonoe', gender: 'female', traitEn: 'Bright', desc: '明るい（Bright）' },
  { id: 'Enceladus', label: 'Enceladus', gender: 'male', traitEn: 'Breathy', desc: '息づかいのある（Breathy）' },
  { id: 'Iapetus', label: 'Iapetus', gender: 'male', traitEn: 'Clear', desc: '明瞭（Clear）' },
  { id: 'Umbriel', label: 'Umbriel', gender: 'male', traitEn: 'Easy-going', desc: 'くつろいだ（Easy-going）' },
  { id: 'Algieba', label: 'Algieba', gender: 'male', traitEn: 'Smooth', desc: 'なめらか（Smooth）' },
  { id: 'Despina', label: 'Despina', gender: 'female', traitEn: 'Smooth', desc: 'なめらか（Smooth）' },
  { id: 'Erinome', label: 'Erinome', gender: 'female', traitEn: 'Clear', desc: '明瞭（Clear）' },
  { id: 'Algenib', label: 'Algenib', gender: 'male', traitEn: 'Gravelly', desc: 'しゃがれた（Gravelly）' },
  { id: 'Rasalgethi', label: 'Rasalgethi', gender: 'male', traitEn: 'Informative', desc: '説明向き（Informative）' },
  { id: 'Laomedeia', label: 'Laomedeia', gender: 'female', traitEn: 'Upbeat', desc: '陽気・元気（Upbeat）' },
  { id: 'Achernar', label: 'Achernar', gender: 'female', traitEn: 'Soft', desc: 'やわらかい（Soft）' },
  { id: 'Alnilam', label: 'Alnilam', gender: 'male', traitEn: 'Firm', desc: 'しっかり（Firm）' },
  { id: 'Schedar', label: 'Schedar', gender: 'male', traitEn: 'Even', desc: '均等・落ち着き（Even）' },
  { id: 'Gacrux', label: 'Gacrux', gender: 'female', traitEn: 'Mature', desc: '大人っぽい（Mature）' },
  { id: 'Pulcherrima', label: 'Pulcherrima', gender: 'female', traitEn: 'Forward', desc: '前向き（Forward）' },
  { id: 'Achird', label: 'Achird', gender: 'male', traitEn: 'Friendly', desc: '親しみやすい（Friendly）' },
  { id: 'Zubenelgenubi', label: 'Zubenelgenubi', gender: 'male', traitEn: 'Casual', desc: 'くだけた（Casual）' },
  { id: 'Vindemiatrix', label: 'Vindemiatrix', gender: 'female', traitEn: 'Gentle', desc: 'やさしい（Gentle）' },
  { id: 'Sadachbia', label: 'Sadachbia', gender: 'male', traitEn: 'Lively', desc: '生き生き（Lively）' },
  { id: 'Sadaltager', label: 'Sadaltager', gender: 'male', traitEn: 'Knowledgeable', desc: '知的（Knowledgeable）' },
  { id: 'Sulafat', label: 'Sulafat', gender: 'female', traitEn: 'Warm', desc: 'あたたかい（Warm）' },
];

/** 既定ボイス（既存プロジェクト互換のため Aoede を維持） */
export const DEFAULT_VOICE_ID: VoiceOption['id'] = 'Aoede';

/** 公式 voice_name として有効か */
export function isVoiceId(value: string | null | undefined): value is VoiceOption['id'] {
  if (!value) return false;
  return VOICE_OPTIONS.some((v) => v.id === value);
}

export function getVoiceOption(id: string | null | undefined): VoiceOption | undefined {
  if (!id) return undefined;
  return VOICE_OPTIONS.find((v) => v.id === id);
}

/** 性別フィルタで声一覧を絞り込む */
export function filterVoiceOptions(
  options: readonly VoiceOption[],
  filter: VoiceGenderFilter,
): VoiceOption[] {
  if (filter === 'all') return [...options];
  return options.filter((v) => v.gender === filter);
}

/**
 * セレクト用の一覧。
 * 現在選択中の声がフィルタ外でも先頭に残し、選択が消えないようにする。
 */
export function resolveVoiceSelectOptions(
  options: readonly VoiceOption[],
  filter: VoiceGenderFilter,
  selectedId: string | null | undefined,
): VoiceOption[] {
  const filtered = filterVoiceOptions(options, filter);
  const selected = options.find((v) => v.id === selectedId);
  if (!selected || filtered.some((v) => v.id === selected.id)) {
    return filtered;
  }
  return [selected, ...filtered];
}

/** セレクト1行の表示文言（性別 + 公式 voice_name + 公式 trait） */
export function formatVoiceOptionLabel(option: VoiceOption): string {
  const genderJa = option.gender === 'female' ? '女性' : '男性';
  return `【${genderJa}】${option.label} — ${option.desc}`;
}

// エクスポート設定
// 1080p で 12 Mbps を目安に、実際のキャンバス解像度に比例した
// ビットレートを計算する（最低 6 Mbps、上限 12 Mbps）。
export const EXPORT_VIDEO_BITRATE = 12_000_000; // 12 Mbps (1920x1080 時の上限)
export const EXPORT_VIDEO_BITRATE_MIN = 6_000_000; // 6 Mbps (低解像度時の下限)

/**
 * 与えられた解像度に応じてエクスポート用のビデオビットレートを算出する。
 *
 * 1920×1080 を基準に、画素数の比に応じて線形にスケーリングする。
 * 圧縮アーティファクトを抑えるため、最低でも 6 Mbps は確保する。
 */
export function computeExportVideoBitrate(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return EXPORT_VIDEO_BITRATE;
  }
  const targetPixels = MAX_CANVAS_WIDTH * MAX_CANVAS_HEIGHT;
  const actualPixels = width * height;
  const ratio = Math.min(1, actualPixels / targetPixels);
  const bitrate = Math.round(EXPORT_VIDEO_BITRATE * ratio);
  return Math.max(EXPORT_VIDEO_BITRATE_MIN, bitrate);
}
