/**
 * @file index.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description アプリケーション全体で使用される型定義（インターフェース、型エイリアス）。
 */

/**
 * Gemini TTS / Google AI Studio の prebuilt voice 名。
 * 公式ドキュメント（speech-generation#voices）の 30 声と一致させる。
 * @see https://ai.google.dev/gemini-api/docs/speech-generation#voices
 */
export type VoiceId =
  | 'Zephyr'
  | 'Puck'
  | 'Charon'
  | 'Kore'
  | 'Fenrir'
  | 'Leda'
  | 'Orus'
  | 'Aoede'
  | 'Callirrhoe'
  | 'Autonoe'
  | 'Enceladus'
  | 'Iapetus'
  | 'Umbriel'
  | 'Algieba'
  | 'Despina'
  | 'Erinome'
  | 'Algenib'
  | 'Rasalgethi'
  | 'Laomedeia'
  | 'Achernar'
  | 'Alnilam'
  | 'Schedar'
  | 'Gacrux'
  | 'Pulcherrima'
  | 'Achird'
  | 'Zubenelgenubi'
  | 'Vindemiatrix'
  | 'Sadachbia'
  | 'Sadaltager'
  | 'Sulafat';
export type NarrationScriptLength = 'short' | 'medium' | 'long';

/**
 * 声の性別ラベル。
 * Google Cloud Gemini-TTS の Voice options 表（Female / Male）に準拠。
 * @see https://docs.cloud.google.com/text-to-speech/docs/gemini-tts#voice_options
 */
export type VoiceGender = 'female' | 'male';

/** 声一覧の性別絞り込み（UI 用） */
export type VoiceGenderFilter = 'all' | VoiceGender;

// ボイスオプション（公式に公開されている項目のみ）
export interface VoiceOption {
  id: VoiceId;
  /** 表示名（公式 voice_name と同じ） */
  label: string;
  /**
   * 公式 trait の表示用。
   * 英語 trait（Bright 等）の日本語訳 + 原文。
   * @see https://ai.google.dev/gemini-api/docs/speech-generation#voices
   */
  desc: string;
  /** 性別（Cloud TTS 公式表） */
  gender: VoiceGender;
  /** 公式英語 trait（Bright 等） */
  traitEn: string;
}

// クリップ間トランジション（standard フレーバー限定機能。
// タイムライン長は変えず、境界の見た目だけを変える。詳細は utils/clipTransitions.ts）
export type ClipTransitionType = 'dissolve' | 'fade-black' | 'fade-white';
export interface ClipTransition {
  type: ClipTransitionType;
  duration: number; // 秒（0.5 / 1 / 2）
}

/** 動画カードの再生速度（早送り。スローは第1版対象外） */
export type VideoPlaybackSpeed = 1 | 2 | 4 | 8;

/** 倍速バッジの表示言語（既定は日本語「N倍速」） */
export type SpeedBadgeLabelStyle = 'ja' | 'en';

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
  /**
   * タイムライン上の表示尺（秒）。
   * 動画は (trimEnd - trimStart) / playbackSpeed。画像はユーザー指定の表示時間。
   */
  duration: number;
  originalDuration: number;
  trimStart: number;
  trimEnd: number;
  scale: number;
  positionX: number;
  positionY: number;
  /** 90度単位の時計回り回転（0 / 90 / 180 / 270）。未定義は 0 とみなす（旧データ後方互換） */
  rotation?: number;
  /** クリップ単位のぼかし強度（0〜30px @1080p基準）。未定義は 0（ぼかしなし） */
  blur?: number;
  isTransformOpen: boolean;
  isLocked: boolean;
  // ソース動画の解像度（エクスポート用キャンバスサイズの動的決定に使用）
  sourceWidth?: number;
  sourceHeight?: number;
  // 次のクリップへのトランジション（standard 限定・任意。最後のクリップでは無視）
  transitionToNext?: ClipTransition | null;
  /**
   * 動画サムネイルの設定モード（動画のみ。旧データは auto 扱い）
   * - auto: 有効開始位置から 0.2 秒後（短い場合は中央）
   * - manual: ユーザーが指定した元動画上の時刻
   */
  thumbnailMode?: 'auto' | 'manual';
  /** サムネイル取得位置（元動画上の秒。trim 後の相対時刻ではない） */
  thumbnailSourceTime?: number;
  /**
   * 動画の再生速度（1/2/4/8）。画像は未使用。旧データ・未定義は 1。
   * @see Docs/specs/2026-08-01_video-playback-speed.md
   */
  playbackSpeed?: VideoPlaybackSpeed;
  /** プレビュー/書き出しに倍速バッジを出すか（speed>1 のときのみ実際に描画） */
  showSpeedBadge?: boolean;
  /**
   * バッジ文言: `ja` = 「2倍速」、`en` = 「2x」。未定義は ja。
   */
  speedBadgeLabelStyle?: SpeedBadgeLabelStyle;
  /** バッジ中心の水平位置（0–100%）。未定義は右上寄り既定 */
  speedBadgePositionX?: number;
  /** バッジ中心の垂直位置（0–100%）。未定義は右上寄り既定 */
  speedBadgePositionY?: number;
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
  /** 全体の話し方ニュアンス（旧。場面指定 aiNarrationScene と併用可） */
  aiVoiceStyle?: string;
  /**
   * ナレーション全体の場面・状況（例: 静かなスタジオで操作を説明している）。
   * TTS の監督指示として使う。未設定は空。
   */
  aiNarrationScene?: string;
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

/**
 * 書き出しの内容モード（Issue #114）。
 * - composite: 従来どおりベース映像へキャプションを焼き込む
 * - caption-layer: キャプション + 動画タイトルのみ。ベース映像なし
 */
export type ExportContentMode = 'composite' | 'caption-layer';

/**
 * キャプションのみ書き出しの映像形式。
 * - black-matte-mp4: 黒背景 + 通常スタイル（既定・互換重視）
 * - luminance-key-mp4: 黒背景 + 白文字強制（他ソフトのルミナンスキー用）
 * - alpha-webm: 透過 WebM（対応ブラウザのみ）
 */
export type CaptionLayerVideoFormat =
  | 'black-matte-mp4'
  | 'luminance-key-mp4'
  | 'alpha-webm';

/** 字幕ファイル形式（汎用規格） */
export type CaptionSubtitleFormat = 'srt' | 'vtt';

/**
 * 書き出し出力オプション（Issue #114）。
 * プロジェクト保存対象ではなく、セッション中の UI 選択。
 */
export interface ExportOutputOptions {
  contentMode: ExportContentMode;
  captionLayerFormat: CaptionLayerVideoFormat;
  /** 動画と一緒に字幕ファイル（SRT/VTT）も生成するか */
  includeSubtitles: boolean;
  subtitleFormats: CaptionSubtitleFormat[];
}

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
  overrideFontColor?: string;           // 個別文字本体色（デフォルト=undefined）
  overrideStrokeColor?: string;         // 個別縁色（デフォルト=undefined）
  overrideStrokeWidth?: number;         // 個別縁幅 px @1080p 基準（デフォルト=undefined）
  overrideBlur?: number;                // 個別ぼかし 0〜5px（デフォルト=undefined）
  /**
   * 個別の背景帯。undefined の項目は一括設定（CaptionSettings.background*）を継承。
   * enabled だけ true/false を指定し、色・濃さ・角丸は未設定のまま継承できる。
   */
  overrideBackgroundEnabled?: boolean;
  overrideBackgroundColor?: string;
  overrideBackgroundOpacity?: number;
  overrideBackgroundRadius?: number;
  overrideFadeIn?: 'on' | 'off';        // 個別フェードイン（デフォルト=undefined）
  overrideFadeOut?: 'on' | 'off';       // 個別フェードアウト（デフォルト=undefined）
  overrideFadeInDuration?: number;      // 個別フェードイン時間（デフォルト=undefined）
  overrideFadeOutDuration?: number;     // 個別フェードアウト時間（デフォルト=undefined）
  // 個別カスタム値（standard フレーバー限定。一括設定の fontSizeCustom / positionCustom と同等）
  overrideFontSizeCustom?: number;                  // px @1080p 基準（24〜240）。プリセット override より優先
  overridePositionCustom?: { x: number; y: number }; // % (0-100)、テキスト中心。プリセット override より優先
  // 時分割表示（text が複数行のとき）の任意設定（standard フレーバー限定）
  sequentialFadeMode?: 'card' | 'line'; // フェード適用単位: card=カード全体（既定）/ line=行ごと
  sequentialGapSec?: number;            // 行間の無表示間隔（秒、0〜5。既定 0）
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

/**
 * 動画タイトル設定（Issue #211）。
 *
 * 通常キャプション（Caption[]）とは**完全に別管理**する 1 件だけの設定。
 * キャプション一覧・時分割カード・まとめて入力・タイミング打ち・一括シフトの
 * 対象には含めない（混在させない）。
 *
 * 既定は「中央・通常キャプションより大きめ」。描画は preview / export 共通の
 * renderFrame が担当し、スタイル解決は utils/videoTitle.ts に集約する。
 */
export interface VideoTitleSettings {
  /** タイトルを描画するか（文字列が空のときは enabled でも描画しない） */
  enabled: boolean;
  /** タイトル文字列（改行は複数行として中央揃えで描画する。時分割はしない） */
  text: string;
  /** 表示開始（秒） */
  startTime: number;
  /** 表示終了（秒） */
  endTime: number;
  fontStyle: CaptionFontStyle;
  fontColor: string;
  strokeColor: string;
  /** 縁幅 px @1080p 基準 */
  strokeWidth: number;
  /**
   * 文字サイズのプリセット（小/中/大/特大）。キャプションと同じ体系。
   * `fontSizeCustom` が設定されている場合はそちらが優先される。
   */
  fontSize: CaptionSize;
  /**
   * カスタム文字サイズ px @1080p 基準（24〜240）。
   * null/未設定でプリセットを使う。キャプションの `fontSizeCustom` と同じ扱い。
   */
  fontSizeCustom?: number | null;
  /** プリセット位置（上/中央/下）。positionCustom が設定されている場合は無視される */
  position: CaptionPosition;
  /** カスタム位置 %（0-100・テキスト中心）。null/未設定でプリセットを使う */
  positionCustom?: { x: number; y: number } | null;
  /** 背景の帯の設定。タイトルは映像に重なるため視認性確保用 */
  backgroundEnabled: boolean;
  backgroundColor: string;
  /** 背景の帯の不透明度（0〜1） */
  backgroundOpacity: number;
  /** 背景の帯の角丸半径 px @1080p 基準（0=角丸なし） */
  backgroundRadius: number;
  /**
   * ぼかし強度（0〜5px @1080p 基準、0=なし）。
   * 通常キャプションの `CaptionSettings.blur` と同じ範囲・単位。
   */
  blur: number;
  fadeIn: boolean;
  fadeOut: boolean;
  fadeInDuration: number;
  fadeOutDuration: number;
}

/** ウォーターマーク画像の切り抜き形状（Issue #210） */
export type WatermarkMask = 'rectangle' | 'rounded' | 'circle';

/**
 * プロジェクト時間軸に属するウォーターマーク（Issue #210）。
 *
 * MediaItem のカード配列とは独立した 1 件のオーバーレイとして管理し、
 * preview / export 共通の renderFrame で最前面へ描画する。
 */
export interface WatermarkOverlay {
  file: File | null;
  /** 選択中画像の Object URL。保存時は永続化せず fileData から再生成する */
  url: string | null;
  /** false にしても画像と各調整値は保持する */
  enabled: boolean;
  /** プロジェクト時間軸上の表示開始・終了（秒） */
  startTime: number;
  endTime: number;
  /** 画像中心の位置（Canvas に対する %） */
  positionX: number;
  positionY: number;
  /** 読み込んだ画像の自然サイズを 1 とする表示倍率 */
  size: number;
  /** 不透明度（0〜1） */
  opacity: number;
  /** 時計回りの回転角（度） */
  rotation: number;
  mask: WatermarkMask;
  /** 画像領域に対するマスクの大きさ（%）。100 で画像外周と一致する */
  maskSize: number;
  /** マスク境界のぼかし幅 px @1080p 基準 */
  feather: number;
  /** 表示範囲先頭からのフェードイン（動画・画像クリップと同じ仕組み） */
  fadeIn: boolean;
  fadeOut: boolean;
  fadeInDuration: number;
  fadeOutDuration: number;
}

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
  /**
   * キャプション背景の帯（動画タイトルの背景帯と同じ考え方）。
   * 既定は OFF。ON のとき文字幅に合わせて半透明の帯を敷く。
   */
  backgroundEnabled: boolean;
  backgroundColor: string;
  /** 背景の帯の不透明度（0〜1） */
  backgroundOpacity: number;
  /** 背景の帯の角丸半径 px @1080p 基準（0=角丸なし） */
  backgroundRadius: number;
  // 一括フェード設定
  bulkFadeIn: boolean;
  bulkFadeOut: boolean;
  bulkFadeInDuration: number;
  bulkFadeOutDuration: number;
  // 一括カスタム値（standard フレーバー限定機能。null/未設定 = プリセット使用）
  fontSizeCustom?: number | null;                    // px @1080p 基準（24〜240）
  positionCustom?: { x: number; y: number } | null;  // % (0-100)、テキスト中心
}
