import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
  AudioTrack,
  Caption,
  CaptionSettings,
  ExportOutputOptions,
  MediaItem,
  NarrationClip,
  VideoTitleSettings,
} from '../../types';
import type { MediaRecorderProfile, PlatformCapabilities } from '../../utils/platform';
import type { ExportFrameProfileSummary } from '../../utils/exportFrameProfiler';

export type ExportStrategyId = 'ios-safari-mediarecorder' | 'webcodecs-mp4';
export const EXPORT_PREPARATION_STEP_ORDER = [
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
] as const;
export type ExportPreparationStep = (typeof EXPORT_PREPARATION_STEP_ORDER)[number];
export const EXPORT_PREPARATION_TOTAL_STEPS = EXPORT_PREPARATION_STEP_ORDER.length;
export const EXPORT_PREPARATION_STEP_LABELS: Record<ExportPreparationStep, string> = {
  1: '書き出し初期化',
  2: 'メディア情報確認',
  3: '動画音声の解析',
  4: 'BGM音声の解析',
  5: 'ナレーション音声の解析',
  6: '音声ミックス準備',
  7: '音声ミックス生成',
  8: '映像エンコード準備',
  9: '映像生成中',
  10: 'ファイル最終化',
};

export interface ExportSessionDiagnostics {
  exportSessionId: string;
}

export interface ExportAudioSourceResolution {
  strategy: 'decode-audio-data' | 'media-element';
  reason: string;
  mimeType: string | null;
  extension: string | null;
}

export type ResolveExportAudioSource = (input: {
  fileName: string;
  mimeType: string | null;
}) => ExportAudioSourceResolution;

export interface ExportStrategyResolutionInput {
  isIosSafari: boolean;
  supportedMediaRecorderProfile: MediaRecorderProfile | null;
}

export type ResolveExportStrategyOrder = (
  input: ExportStrategyResolutionInput,
) => ExportStrategyId[];

/**
 * エクスポート用の音声ソース情報。
 * iOS Safari の OfflineAudioContext プリレンダリングに使用。
 */
export interface ExportAudioSources {
  mediaItems: MediaItem[];
  bgm: AudioTrack | null;
  narrations: NarrationClip[];
  /** standard 複合動画の出力 FPS。未指定時は従来の 30fps。 */
  fps?: number;
  /** 出力全体の長さ（クリップ + エンドロール） */
  totalDuration: number;
  /**
   * クリップだけの長さ（エンドロールを含まない）。
   * エンドロール区間の BGM フェードアウト開始点として使う。
   * 未指定・エンドロール無効時は totalDuration と同値として扱う。
   */
  clipsDuration?: number;
  /** エンドロール区間で BGM を徐々に消すか（エンドロール設定のオプション） */
  endrollBgmFadeOut?: boolean;
  onPreparationStepChange?: (step: ExportPreparationStep) => void;
  /**
   * 音声プリレンダリング完了時に呼ばれるコールバック。
   * iOS Safari では音声抽出にリアルタイムで動画再生が必要なため、
   * エクスポート用の再生ループ（loop）はこのコールバック後に開始する。
   * 音声プリレンダリングが不要な環境（PC/Android）では即座に呼ばれる。
   */
  onAudioPreRenderComplete?: () => void;
  /**
   * エクスポート再生ループの現在時刻（秒）を返す。
   * 映像フレーム供給数をタイムライン進行に追従させるために使用する。
   */
  getPlaybackTimeSec?: () => number;
  /**
   * render loop が「実際に Canvas へ描画した」最後のフレーム番号を返す（未描画なら null）。
   *
   * 【Issue #215】export の描画は rAF 上で走るため、1080p や初回書き出しでは
   * 30fps を割り込むことがある。一方 getPlaybackTimeSec の壁時計は減速しないため、
   * 時刻だけを基準にすると「まだ描いていない時刻の分」まで同じ Canvas を複製投入し、
   * 映像トラックだけが総フレーム数へ早く到達して残りが黒画面になる。
   * 描画済みフレーム番号を基準にすることで描画と投入を 1:1 に保つ。
   */
  getRenderedVideoFrameIndex?: () => number | null;
  /**
   * render loop の描画実績を返す（Issue #215 の再発調査用の計測）。
   *
   * 完了時のフレーム総数はどの異常経路でも一致してしまうため、
   * 「実際に描かれた相異なるフレーム数」を投入数と別に取得して原因を切り分ける。
   * 投入数との差が「同じ画の複製投入」＝映像が止まって見える量になる。
   */
  getRenderedFrameStats?: () => {
    /** 実際に描かれた相異なるフレーム番号の数 */
    distinctRenderedFrames: number;
    /** 最後に描いたフレーム番号（未描画なら null） */
    lastRenderedFrameIndex: number | null;
    /** 描画が連番で進まなかった回数（＝描画が飛んだ回数） */
    renderSkipCount: number;
    /** 一度も描かれなかったフレームの総数 */
    skippedFrames: number;
    /**
     * 実際に描画が走った回数。番号が連番でも 1 回の rAF で複数フレームぶん
     * 時刻が進めば描画回数はそのぶん少なくなる（＝残りは複製投入）。
     */
    renderCallCount?: number;
  };
  /**
   * エクスポート 1 フレームの内訳（描画 / エンコード / その他）の実測値を返す。
   * 「プレビューは滑らかなのに書き出しだけ 20fps へ落ちる」原因の切り分けに使う。
   */
  getFrameProfile?: () => ExportFrameProfileSummary;
  /**
   * VideoEncoder への投入時間の計測を開始する。戻り値を呼ぶと終了として集計される。
   * 描画側（render loop）と同じプロファイラへ積算される。
   */
  beginEncodeMeasure?: () => () => void;
  /**
   * VideoEncoder へ正常投入した映像フレーム数を通知する。
   * 静止画のみの standard export で、各 Canvas 描画とエンコード投入を1対1に同期するために使う。
   */
  onVideoFrameSubmitted?: (submittedFrameCount: number) => void;
  /**
   * VideoEncoder の待ち行列が上限へ達し、動画を含むリアルタイム export の
   * タイムラインも一緒に待機させる必要があることを通知する。
   *
   * `true` の間は共有 <video> と壁時計タイムラインを停止し、`false` で
   * 待機時間を壁時計の基準から除外して再開する。
   */
  onVideoEncoderBackpressureChange?: (paused: boolean) => void;
  /**
   * プロジェクトポスター（JPEG data URL）。
   * - MP4 の cover art（moov/udta/meta/ilst/covr）へ埋め込み
   * - 先頭キーフレームの差し替え（シェルが映像先頭を読む場合向け）
   * 未設定時は埋め込み・差し替えしない。
   */
  coverArtJpegDataUrl?: string | null;
}

export interface ExportCallbacks {
  onRecordingStop: (url: string, ext: string, result?: ExportRecordingResult) => void;
  onRecordingError?: (message: string) => void;
}

export interface ExportRecordingResult {
  source: 'media-recorder' | 'webcodecs';
  blobSizeBytes?: number;
  signalAborted?: boolean;
}

export interface ExportStateSetters {
  setExportUrl: Dispatch<SetStateAction<string | null>>;
  setExportExt: Dispatch<SetStateAction<string | null>>;
}

export interface ExportRecorderRefs {
  recorderRef: MutableRefObject<MediaRecorder | null>;
}

export interface PreRenderedRecorderAudioSource {
  stream: MediaStream;
  startPlayback: () => void;
  cleanup: () => void;
}

export interface IosSafariMediaRecorderStrategyContext {
  canvas: HTMLCanvasElement;
  masterDest: MediaStreamAudioDestinationNode;
  audioContext: AudioContext;
  signal: AbortSignal;
  audioSources?: ExportAudioSources;
  preRenderedAudio?: PreRenderedRecorderAudioSource | null;
  callbacks: ExportCallbacks;
  state: ExportStateSetters;
  refs: ExportRecorderRefs;
  exportConfig: {
    fps: number;
    videoBitrate: number;
  };
  supportedMediaRecorderProfile: MediaRecorderProfile | null;
  diagnostics?: ExportSessionDiagnostics;
}

export type MediaRecorderExportStrategyRunner = (
  context: IosSafariMediaRecorderStrategyContext,
) => Promise<boolean>;

export type ExportCancelReason = 'none' | 'user' | 'superseded' | 'unmount' | 'error';
export type ExportStopReason = Exclude<ExportCancelReason, 'none' | 'error'>;

/**
 * useExport - 動画書き出しフックの公開インターフェース。
 * standard / apple-safari 両フレーバーのエクスポートエンジンはこの契約を満たす。
 * ここを変更すると両フレーバーに影響するため、変更時は両エンジンの整合を確認すること。
 */
/**
 * キャプションのみ書き出し（Issue #114）に必要な描画入力。
 * composite 経路では不要。startExport の第 6 引数 options で渡す。
 */
export interface CaptionLayerExportInput {
  totalDurationSec: number;
  captions: Caption[];
  captionSettings: CaptionSettings;
  videoTitle: VideoTitleSettings;
  exportWidth: number;
  exportHeight: number;
  /** 準備ステップ表示を UI へ伝える（任意） */
  onPreparationStepChange?: (step: ExportPreparationStep) => void;
  /** 0〜1 の進捗（映像生成中） */
  onProgress?: (ratio: number) => void;
}

export interface StartExportOptions {
  output?: ExportOutputOptions;
  captionLayer?: CaptionLayerExportInput;
}

export interface UseExportReturn {
  // State
  isProcessing: boolean;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  exportUrl: string | null;
  setExportUrl: Dispatch<SetStateAction<string | null>>;
  exportExt: string | null;
  setExportExt: Dispatch<SetStateAction<string | null>>;

  // Refs
  // MediaRecorderは使用しないため削除し、代わりに停止用フラグ等を管理するRefなどを内部で持つが、
  // 外部インターフェースとしては startExport/cancel 等があればよい。
  // ここではAPI互換性を保つため残すが、実体は使用しない。
  recorderRef: MutableRefObject<MediaRecorder | null>;

  // Methods
  startExport: (
    canvasRef: MutableRefObject<HTMLCanvasElement | null>,
    masterDestRef: MutableRefObject<MediaStreamAudioDestinationNode | null>,
    onRecordingStop: (url: string, ext: string) => void,
    onRecordingError?: (message: string) => void,
    audioSources?: ExportAudioSources,  // iOS Safari: OfflineAudioContext用音声ソース
    options?: StartExportOptions,
  ) => void;
  completeExport: () => void; // 正常終了要求（abortせずにflush/finalizeへ進める）
  stopExport: (options?: { silent?: boolean; reason?: ExportStopReason }) => void; // 明示的な停止メソッドを追加
  clearExportUrl: () => void;
}

export interface UseExportRuntimeConfig {
  getPlatformCapabilities: () => PlatformCapabilities;
  resolveExportStrategyOrder: ResolveExportStrategyOrder;
  resolveExportAudioSource?: ResolveExportAudioSource;
  runMediaRecorderStrategy?: MediaRecorderExportStrategyRunner;
}

const AUDIO_TRACK_MIN_VOLUME = 0;
const AUDIO_TRACK_MAX_VOLUME = 2.5;

/** 音量クランプは両フレーバー共通のドメインルール（プラットフォーム依存なし） */
export function clampAudioTrackVolume(volume: number): number {
  return Math.max(AUDIO_TRACK_MIN_VOLUME, Math.min(AUDIO_TRACK_MAX_VOLUME, volume));
}
