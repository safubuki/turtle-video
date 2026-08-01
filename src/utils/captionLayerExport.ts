/**
 * @file captionLayerExport.ts
 * @description キャプション単独出力（Issue #114）の形式解決・既定値・ファイル名の純ロジック。
 */
import type {
  CaptionLayerVideoFormat,
  CaptionSubtitleFormat,
  ExportContentMode,
  ExportOutputOptions,
} from '../types';

/** セッション既定の書き出しオプション */
export const DEFAULT_EXPORT_OUTPUT_OPTIONS: ExportOutputOptions = {
  contentMode: 'composite',
  captionLayerFormat: 'black-matte-mp4',
  includeSubtitles: true,
  subtitleFormats: ['srt', 'vtt'],
};

export type CaptionLayerMatte = 'black' | 'transparent' | 'luminance-key';

export interface CaptionLayerFormatDescriptor {
  format: CaptionLayerVideoFormat;
  matte: CaptionLayerMatte;
  /** コンテナ拡張子 */
  ext: 'mp4' | 'webm';
  mimeType: string;
  /** 文字色を白に強制するか（ルミナンスキー用） */
  forceWhiteGlyphs: boolean;
  label: string;
  description: string;
}

const FORMAT_DESCRIPTORS: Record<CaptionLayerVideoFormat, CaptionLayerFormatDescriptor> = {
  'black-matte-mp4': {
    format: 'black-matte-mp4',
    matte: 'black',
    ext: 'mp4',
    mimeType: 'video/mp4',
    forceWhiteGlyphs: false,
    label: '黒背景 MP4',
    description: '黒背景の通常キャプション。加算・スクリーン合成向けです。',
  },
  'luminance-key-mp4': {
    format: 'luminance-key-mp4',
    matte: 'luminance-key',
    ext: 'mp4',
    mimeType: 'video/mp4',
    forceWhiteGlyphs: true,
    label: '白文字キー用 MP4',
    description: '黒背景に白文字。ルミナンスキー合成に使えます。',
  },
  'alpha-webm': {
    format: 'alpha-webm',
    matte: 'transparent',
    ext: 'webm',
    mimeType: 'video/webm',
    forceWhiteGlyphs: false,
    label: '透過 WebM',
    description: '背景透過の WebM。別の動画に重ねて合成できます。',
  },
};

export function resolveCaptionLayerFormatDescriptor(
  format: CaptionLayerVideoFormat,
): CaptionLayerFormatDescriptor {
  return FORMAT_DESCRIPTORS[format] ?? FORMAT_DESCRIPTORS['black-matte-mp4'];
}

export function isExportContentMode(value: unknown): value is ExportContentMode {
  return value === 'composite' || value === 'caption-layer';
}

export function isCaptionLayerVideoFormat(value: unknown): value is CaptionLayerVideoFormat {
  return (
    value === 'black-matte-mp4'
    || value === 'luminance-key-mp4'
    || value === 'alpha-webm'
  );
}

export function normalizeExportOutputOptions(
  partial?: Partial<ExportOutputOptions> | null,
): ExportOutputOptions {
  const contentMode = isExportContentMode(partial?.contentMode)
    ? partial!.contentMode
    : DEFAULT_EXPORT_OUTPUT_OPTIONS.contentMode;
  const captionLayerFormat = isCaptionLayerVideoFormat(partial?.captionLayerFormat)
    ? partial!.captionLayerFormat
    : DEFAULT_EXPORT_OUTPUT_OPTIONS.captionLayerFormat;
  const includeSubtitles =
    typeof partial?.includeSubtitles === 'boolean'
      ? partial.includeSubtitles
      : DEFAULT_EXPORT_OUTPUT_OPTIONS.includeSubtitles;
  const rawFormats = Array.isArray(partial?.subtitleFormats)
    ? partial!.subtitleFormats
    : DEFAULT_EXPORT_OUTPUT_OPTIONS.subtitleFormats;
  const subtitleFormats = rawFormats.filter(
    (f): f is CaptionSubtitleFormat => f === 'srt' || f === 'vtt',
  );
  return {
    contentMode,
    captionLayerFormat,
    includeSubtitles,
    subtitleFormats:
      subtitleFormats.length > 0
        ? subtitleFormats
        : [...DEFAULT_EXPORT_OUTPUT_OPTIONS.subtitleFormats],
  };
}

/** ダウンロード用の動画ファイル名 */
export function buildCaptionLayerVideoFileName(
  format: CaptionLayerVideoFormat,
  timestampMs: number = Date.now(),
): string {
  const desc = resolveCaptionLayerFormatDescriptor(format);
  const tag =
    format === 'luminance-key-mp4'
      ? 'caption_key'
      : format === 'alpha-webm'
        ? 'caption_alpha'
        : 'caption_layer';
  return `turtle_${tag}_${timestampMs}.${desc.ext}`;
}

export function buildCaptionSubtitleFileName(
  format: CaptionSubtitleFormat,
  timestampMs: number = Date.now(),
): string {
  return `turtle_captions_${timestampMs}.${format}`;
}

/**
 * alpha-webm が使えそうか（ヒューリスティック）。
 * 実際の encode 失敗時は呼び出し側で黒背景へフォールバックする。
 */
export function canAttemptAlphaWebmExport(
  win: { VideoEncoder?: unknown; MediaRecorder?: unknown } = typeof window !== 'undefined' ? window : {},
): boolean {
  return typeof win.VideoEncoder === 'function' || typeof win.MediaRecorder === 'function';
}

/**
 * 選択形式が実行時に使えないとき、安全な代替形式を返す。
 */
export function resolveCaptionLayerFormatWithFallback(
  preferred: CaptionLayerVideoFormat,
  capabilities: { canAlphaWebm: boolean },
): { format: CaptionLayerVideoFormat; fellBack: boolean } {
  if (preferred === 'alpha-webm' && !capabilities.canAlphaWebm) {
    return { format: 'black-matte-mp4', fellBack: true };
  }
  return { format: preferred, fellBack: false };
}
