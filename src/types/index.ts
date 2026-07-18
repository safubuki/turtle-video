/**
 * @file index.ts
 * @author Turtle Village
 * @description アプリケーション全体で使用される型定義（インターフェース、型エイリアス）。
 */

// ボイスID (定数と連動)
export type VoiceId = 'Aoede' | 'Kore' | 'Puck' | 'Fenrir' | 'Charon';
export type NarrationScriptLength = 'short' | 'medium' | 'long';

// ボイスオプション
export interface VoiceOption {
  id: VoiceId;
  label: string;
  desc: string;
}

// メディアアイテム (動画/画像)
export interface MediaItem {
  id: string;
  file: File;
  fileData?: ArrayBuffer;
  type: 'video' | 'image';
  url: string;
  volume: number;
  isMuted: boolean;
  fadeIn: boolean;
  fadeOut: boolean;
  fadeInDuration: number;   // フェードイン時間（秒）
  fadeOutDuration: number;  // フェードアウト時間（秒）
  duration: number;
  originalDuration: number;
  trimStart: number;
  trimEnd: number;
  scale: number;
  positionX: number;
  positionY: number;
  isTransformOpen: boolean;
  isLocked: boolean;
  // ソース動画の解像度（エクスポート用キャンバスサイズの動的決定に使用）
  sourceWidth?: number;
  sourceHeight?: number;
}

// オーディオトラック (BGM/ナレーション共通)
export interface AudioTrack {
  file: File | { name: string };
  url: string;
  blobUrl?: string;
  startPoint: number;
  delay: number;
  volume: number;
  fadeIn: boolean;
  fadeOut: boolean;
  fadeInDuration: number;   // フェードイン時間（秒）
  fadeOutDuration: number;  // フェードアウト時間（秒）
  duration: number;
  isAi: boolean;
}

export type NarrationSourceType = 'ai' | 'file';

export interface NarrationClip {
  id: string;
  sourceType: NarrationSourceType;
  file: File | { name: string };
  url: string;
  blobUrl?: string;
  startTime: number;
  volume: number;
  isMuted: boolean;
  trimStart: number;
  trimEnd: number;
  duration: number;
  isAiEditable: boolean;
  aiScript?: string;
  aiVoice?: VoiceId;
  aiVoiceStyle?: string;
  // クリップ範囲基準のフェード（任意・省略時 false）。
  // 主に BGM クリップ（BgmClip）で使用する。standard フレーバーの
  // preview / export エンジンのみが解釈する（iOS では無視される）。
  fadeIn?: boolean;
  fadeOut?: boolean;
  fadeInDuration?: number;
  fadeOutDuration?: number;
}

/**
 * BGM クリップ（複数 BGM 対応・standard フレーバー限定機能）。
 * タイムライン配置・トリム・音量の扱いは NarrationClip と完全に同形で、
 * 再生・書き出しパイプラインへはナレーション配列にマージされて流れる。
 * UI 上は BGM セクションで独立管理される。
 */
export type BgmClip = NarrationClip;

// メディア要素の参照型
export type MediaElementsRef = Record<string, HTMLVideoElement | HTMLImageElement | HTMLAudioElement>;

// オーディオノードの参照型
export type AudioNodesRef = Record<string, AudioNode>;
export type GainNodesRef = Record<string, GainNode>;
export type SourceNodesRef = Record<string, MediaElementAudioSourceNode>;

// トースト通知のProps
export interface ToastProps {
  message: string | null;
  onClose: () => void;
}

// MediaResourceLoaderのProps
export interface MediaResourceLoaderProps {
  mediaItems: MediaItem[];
  bgm: AudioTrack | null;
  narrations: NarrationClip[];
  onElementLoaded: (id: string, element: HTMLVideoElement | HTMLImageElement | HTMLAudioElement) => void;
  onRefAssign: (id: string, element: HTMLVideoElement | HTMLImageElement | HTMLAudioElement | null) => void;
  onSeeked: () => void;
  onVideoLoadedData: () => void;
}

// トラックタイプ
export type TrackType = 'bgm' | 'narration';

// エクスポート形式
export type ExportFormat = 'mp4' | 'webm';

// キャプション（字幕）
export interface Caption {
  id: string;
  text: string;
  startTime: number;  // 秒
  endTime: number;    // 秒
  fadeIn: boolean;
  fadeOut: boolean;
  fadeInDuration: number;   // フェードイン時間（秒）
  fadeOutDuration: number;  // フェードアウト時間（秒）
  // 個別スタイル設定（override）- undefinedの場合は一括設定を使用
  overridePosition?: CaptionPosition;   // 個別配置（デフォルト=undefined）
  overrideFontStyle?: CaptionFontStyle; // 個別字体（デフォルト=undefined）
  overrideFontSize?: CaptionSize;       // 個別サイズ（デフォルト=undefined）
  overrideFadeIn?: 'on' | 'off';        // 個別フェードイン（デフォルト=undefined）
  overrideFadeOut?: 'on' | 'off';       // 個別フェードアウト（デフォルト=undefined）
  overrideFadeInDuration?: number;      // 個別フェードイン時間（デフォルト=undefined）
  overrideFadeOutDuration?: number;     // 個別フェードアウト時間（デフォルト=undefined）
}

// キャプション位置
export type CaptionPosition = 'top' | 'center' | 'bottom';

// キャプションサイズ
export type CaptionSize = 'small' | 'medium' | 'large' | 'xlarge';

// キャプションフォントスタイル
// gothic / mincho が基本 2 択。それ以外はシステムフォント拡張（standard フレーバーの UI でのみ選択可能。
// カタログは utils/captionFontCatalog.ts が単一ソース）。
// `local:<ファミリ名>` は Local Font Access API（PC）で選んだ端末フォントを表す。
// 描画は resolveCaptionFontFamily() で全フレーバー共通に解決し、未知値は sans-serif へフォールバックする。
export type CaptionFontStyle =
  | 'gothic'
  | 'mincho'
  | 'rounded'
  | 'handwriting'
  | 'mono'
  | 'system'
  | (string & {});

// キャプション設定
export interface CaptionSettings {
  enabled: boolean;
  fontSize: CaptionSize;
  fontStyle: CaptionFontStyle;
  fontColor: string;
  strokeColor: string;
  strokeWidth: number;
  position: CaptionPosition;
  blur: number; // ぼかし強度（0〜5px、0=なし）
  // 一括フェード設定
  bulkFadeIn: boolean;
  bulkFadeOut: boolean;
  bulkFadeInDuration: number;
  bulkFadeOutDuration: number;
  // 一括カスタム値（standard フレーバー限定機能。null/未設定 = プリセット使用）
  fontSizeCustom?: number | null;                    // px @1080p 基準（24〜240）
  positionCustom?: { x: number; y: number } | null;  // % (0-100)、テキスト中心
}
