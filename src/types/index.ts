/**
 * タートルビデオ - 型定義
 */

// ボイスID (定数と連動)
export type VoiceId = 'Aoede' | 'Kore' | 'Puck' | 'Fenrir' | 'Charon';

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
  type: 'video' | 'image';
  url: string;
  volume: number;
  isMuted: boolean;
  fadeIn: boolean;
  fadeOut: boolean;
  duration: number;
  originalDuration: number;
  trimStart: number;
  trimEnd: number;
  scale: number;
  positionX: number;
  positionY: number;
  isTransformOpen: boolean;
  isLocked: boolean;
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
  duration: number;
  isAi: boolean;
}

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
  narration: AudioTrack | null;
  onElementLoaded: (id: string, element: HTMLVideoElement | HTMLImageElement | HTMLAudioElement) => void;
  onRefAssign: (id: string, element: HTMLVideoElement | HTMLImageElement | HTMLAudioElement | null) => void;
  onSeeked: () => void;
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
}

// キャプション位置
export type CaptionPosition = 'top' | 'center' | 'bottom';

// キャプションサイズ
export type CaptionSize = 'small' | 'medium' | 'large';

// キャプションフォントスタイル
export type CaptionFontStyle = 'gothic' | 'mincho';

// キャプション設定
export interface CaptionSettings {
  enabled: boolean;
  fontSize: CaptionSize;
  fontStyle: CaptionFontStyle;
  fontColor: string;
  strokeColor: string;
  strokeWidth: number;
  position: CaptionPosition;
}
