/**
 * @file CaptionSettingsModal.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description キャプション個別スタイル設定のモーダル。一括設定を上書き（Override）するためのUI。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import type {
  Caption,
  CaptionPosition,
  CaptionSettings,
  CaptionSize,
  CaptionFontStyle,
} from '../../types';
import { SwipeProtectedSlider } from '../SwipeProtectedSlider';
import NumericSliderField from '../common/NumericSliderField';
import CaptionColorField from '../common/CaptionColorField';
import CaptionFontSizeField from '../common/CaptionFontSizeField';
import CaptionFontStyleField from '../common/CaptionFontStyleField';
import CaptionPositionField from '../common/CaptionPositionField';
import CaptionMiniPreview, {
  PORTRAIT_MINI_PREVIEW_MAX_WIDTH_CLASS,
} from '../common/CaptionMiniPreview';
import SettingsAccordionHeader from '../common/SettingsAccordionHeader';
import { useDisableBodyScroll } from '../../hooks/useDisableBodyScroll';
import { usePlatformCapabilities } from '../../app/PlatformCapabilitiesContext';
import { getAppFlavorUiCapabilities } from '../../app/appFlavorUi';
import {
  getAvailableDropdownFontOptions,
  getAvailablePinnedFontOptions,
  getLocalFontFamilyFromValue,
} from '../../utils/captionFontCatalog';
import {
  CAPTION_BACKGROUND_DEFAULT,
  CAPTION_BACKGROUND_OPACITY_MAX,
  CAPTION_BACKGROUND_OPACITY_MIN,
  CAPTION_BACKGROUND_OPACITY_STEP,
  CAPTION_BACKGROUND_RADIUS_MAX,
  CAPTION_BACKGROUND_RADIUS_MIN,
  CAPTION_BACKGROUND_RADIUS_STEP,
  CAPTION_FONT_SIZE_PRESETS,
  CAPTION_STROKE_WIDTH_MAX,
  CAPTION_STROKE_WIDTH_MIN,
  CAPTION_STROKE_WIDTH_STEP,
  clampCaptionBackgroundOpacity,
  clampCaptionBackgroundRadius,
  clampCaptionBlur,
  clampCaptionStrokeWidth,
  clampCustomFontSize,
  clampPositionPercent,
  resolveCaptionBackgroundStyle,
  resolveCaptionBaseFontSize,
  resolveCaptionGlyphStyle,
  resolveCaptionPresetAsCustomPercent,
} from '../../utils/captionStyle';
import { useCanvasStore } from '../../stores/canvasStore';
import {
  SEQUENTIAL_GAP_MAX_SEC,
  clampSequentialGapSec,
  isSequentialCaption,
  resolveSequentialCaptionSegments,
} from '../../utils/captionTimeline';
import { queryLocalFontFamilies, supportsLocalFontAccess } from '../../utils/fontAvailability';
import type { CaptionFreeSnapshot } from '../../utils/canvas';
import {
  createClearedCaptionIndividualSettings,
  hasCaptionIndividualSettings,
} from '../../utils/captionIndividualSettings';

interface CaptionSettingsModalProps {
  caption: Caption;
  settings: CaptionSettings;
  /**
   * メインプレビューの canvas。
   * モーダルがプレビューを覆って見た目を確認できない問題への対策として、
   * 現在フレームへキャプションを重ねたミニプレビューをモーダル内に表示する。
   */
  previewCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  /**
   * キャプション抜きのプレビューフレーム（ミニプレビューの転写元）。
   * メインプレビューの canvas はキャプションが焼き込まれているため、
   * そのまま使うと設定中のキャプションと二重に表示される。
   */
  captionFreeSnapshotRef?: React.MutableRefObject<CaptionFreeSnapshot>;
  /** プレビューの現在位置（ミニプレビューの背景フレームの時刻表示に使う） */
  currentTime?: number;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Omit<Caption, 'id'>>) => void;
}

// フェードだけは「デフォルト/ON/OFF」の 3 状態を保つ（サイズ・字体・位置は
// 共有コンポーネント側で null = デフォルトとして扱う）
type FadeOption = 'default' | 'on' | 'off';

/**
 * キャプション個別設定モーダル
 */
const CaptionSettingsModal: React.FC<CaptionSettingsModalProps> = ({
  caption,
  settings,
  previewCanvasRef,
  captionFreeSnapshotRef,
  currentTime = 0,
  onClose,
  onUpdate,
}) => {
  // プリセット→カスタムの引き継ぎに使う（描画と同じ寸法基準にそろえる）
  const canvasWidth = useCanvasStore((state) => state.width);
  const canvasHeight = useCanvasStore((state) => state.height);
  const isPortraitProject = canvasHeight > canvasWidth;
  // モーダル表示中は背景のスクロールを防止
  // このコンポーネントは親で条件付きレンダリングされているため、
  // マウント時は常に表示状態なので true を渡す
  useDisableBodyScroll(true);

  // 現在の値を取得（undefined の場合は 'default' = 一括設定を継承）
  const currentFadeIn: FadeOption = caption.overrideFadeIn ?? 'default';
  const currentFadeOut: FadeOption = caption.overrideFadeOut ?? 'default';
  const currentFadeInDuration = caption.overrideFadeInDuration ?? 0.5;
  const currentFadeOutDuration = caption.overrideFadeOutDuration ?? 0.5;
  // 「デフォルト」選択中にカスタム編集を始めたときの初期 px は一括設定の実効値を使う
  const inheritedFontSizePx = settings.fontSizeCustom != null
    ? clampCustomFontSize(settings.fontSizeCustom)
    : CAPTION_FONT_SIZE_PRESETS[settings.fontSize] ?? CAPTION_FONT_SIZE_PRESETS.medium;
  const [showOutlineColorSettings, setShowOutlineColorSettings] = useState(false);
  const effectiveGlyphStyle = resolveCaptionGlyphStyle(caption, settings);
  const effectiveBackgroundStyle = resolveCaptionBackgroundStyle(caption, settings);
  const hasOutlineColorOverride = caption.overrideStrokeWidth != null
    || caption.overrideStrokeColor != null
    || caption.overrideFontColor != null;
  const hasBackgroundOverride = caption.overrideBackgroundEnabled != null
    || caption.overrideBackgroundColor != null
    || caption.overrideBackgroundOpacity != null
    || caption.overrideBackgroundRadius != null;

  // 時分割（複数行の順次表示）設定
  const isSequential = isSequentialCaption(caption);
  const sequentialFadeMode = caption.sequentialFadeMode ?? 'card';
  const sequentialGapSec = clampSequentialGapSec(caption.sequentialGapSec ?? 0);
  const SEQUENTIAL_GAP_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
    { value: 0, label: 'なし' },
    { value: 0.2, label: '200ms' },
  ];
  const isPresetSequentialGap = SEQUENTIAL_GAP_PRESETS.some((p) => p.value === sequentialGapSec);
  const [isCustomSequentialGap, setIsCustomSequentialGap] = useState(!isPresetSequentialGap);
  const hasIndividualSettings = hasCaptionIndividualSettings(caption);

  const handleClearIndividualSettings = () => {
    if (!hasIndividualSettings) return;
    onUpdate(caption.id, createClearedCaptionIndividualSettings());
    onClose();
  };

  // 拡張フォント（システムフォント）は standard フレーバー（Android/PC）限定
  const { isIosSafari } = usePlatformCapabilities();
  const uiCapabilities = getAppFlavorUiCapabilities(isIosSafari ? 'apple-safari' : 'standard');
  const supportsExtendedFonts = !isIosSafari;

  // 字体・サイズ・位置は一括設定と同じ共有コンポーネントを使う（丸ゴシック等の
  // 固定ボタンや実在フォントのドロップダウンが一括設定と必ず一致する）。
  const availablePinnedFonts = useMemo(() => getAvailablePinnedFontOptions(), []);
  const availableDropdownFonts = useMemo(() => getAvailableDropdownFontOptions(), []);

  // PC: Local Font Access API（Chromium 系）で端末の全フォントを追加読み込み（一括設定と同等）
  const [localFontFamilies, setLocalFontFamilies] = useState<string[]>([]);
  const [localFontsLoading, setLocalFontsLoading] = useState(false);
  const handleLoadLocalFonts = async () => {
    if (localFontsLoading) return;
    setLocalFontsLoading(true);
    try {
      setLocalFontFamilies(await queryLocalFontFamilies());
    } finally {
      setLocalFontsLoading(false);
    }
  };
  // 既に local: フォントが選択されている場合、モーダルを開いた時点で一覧を補完する
  useEffect(() => {
    let cancelled = false;
    if (getLocalFontFamilyFromValue(caption.overrideFontStyle ?? '') !== null && supportsLocalFontAccess()) {
      queryLocalFontFamilies().then((families) => {
        if (!cancelled) setLocalFontFamilies(families);
      }).catch(() => { /* 許可なしは無視 */ });
    }
    return () => { cancelled = true; };
    // モーダルを開いた初回のみ実行する
  }, []);

  // 更新ハンドラ（共有コンポーネントの null = 「デフォルト」= 一括設定を継承）
  const handleFontSizeChange = (value: CaptionSize | null) => {
    onUpdate(caption.id, {
      overrideFontSize: value ?? undefined,
      overrideFontSizeCustom: undefined,
    });
  };

  const handleCustomFontSizeChange = (value: number | null) => {
    onUpdate(caption.id, {
      overrideFontSizeCustom: value == null ? undefined : clampCustomFontSize(value),
      // カスタムを指定したらプリセットの override は外す（一括設定と同じ挙動）
      ...(value == null ? {} : { overrideFontSize: undefined }),
    });
  };

  const handleFontStyleChange = (value: CaptionFontStyle | null) => {
    onUpdate(caption.id, {
      overrideFontStyle: value ?? undefined,
    });
  };

  const handlePositionChange = (value: CaptionPosition | null) => {
    onUpdate(caption.id, {
      overridePosition: value ?? undefined,
      overridePositionCustom: undefined,
    });
  };

  const handlePositionCustomChange = (value: { x: number; y: number } | null) => {
    onUpdate(caption.id, {
      overridePositionCustom: value == null
        ? undefined
        : { x: clampPositionPercent(value.x), y: clampPositionPercent(value.y) },
      ...(value == null ? {} : { overridePosition: undefined }),
    });
  };

  const handleClearOutlineColorSettings = () => {
    onUpdate(caption.id, {
      overrideStrokeWidth: undefined,
      overrideStrokeColor: undefined,
      overrideFontColor: undefined,
    });
  };

  const handleFadeInChange = (value: FadeOption) => {
    onUpdate(caption.id, {
      overrideFadeIn: value === 'default' ? undefined : value,
      // デフォルトに戻す場合は時間もクリア
      ...(value === 'default' ? { overrideFadeInDuration: undefined } : {}),
    });
  };

  const handleFadeOutChange = (value: FadeOption) => {
    onUpdate(caption.id, {
      overrideFadeOut: value === 'default' ? undefined : value,
      // デフォルトに戻す場合は時間もクリア
      ...(value === 'default' ? { overrideFadeOutDuration: undefined } : {}),
    });
  };

  const handleFadeInDurationChange = (value: number) => {
    const steps = [0.5, 1.0, 2.0];
    onUpdate(caption.id, {
      overrideFadeInDuration: steps[value],
    });
  };

  const handleFadeOutDurationChange = (value: number) => {
    const steps = [0.5, 1.0, 2.0];
    onUpdate(caption.id, {
      overrideFadeOutDuration: steps[value],
    });
  };

  // セグメンテッドコントロールのスタイル（一括設定と同じ）
  const getButtonClass = (isSelected: boolean) =>
    `flex-1 py-1 rounded transition text-[10px] whitespace-nowrap ${isSelected
      ? 'bg-yellow-500 text-gray-900'
      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    }`;

  // --- ミニプレビュー用の値 ---
  // 目的はサイズ・位置・色の確認なので、実際の表示時間やフェードに影響されず
  // 常にフル不透明で 1 行目が出るよう、時刻を固定した複製を描く。
  // 時分割カードは 1 行目（先頭セグメント）を代表として表示する。
  const MINI_PREVIEW_TIME_SEC = 1;
  const miniPreviewTimeSec = MINI_PREVIEW_TIME_SEC;
  const miniPreviewCaption: Caption = useMemo(() => ({
    ...caption,
    startTime: 0,
    endTime: MINI_PREVIEW_TIME_SEC * 2,
    // フェードで薄くならないよう、ミニプレビューでは常に OFF 扱いにする
    overrideFadeIn: 'off',
    overrideFadeOut: 'off',
  }), [caption]);
  // 背景フレームはメインプレビューの canvas を都度転写する。
  // 現在位置が変わったときに描き直せるよう、時刻を再描画キーに含める。
  const miniPreviewRefreshKey = Math.round(currentTime * 100);

  const formatMiniPreviewTime = (sec: number): string => {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[300] p-4"
      onClick={onClose}
    >
      {/* PC は横広（max-w-2xl）にして、「既定」が増えた分のボタンを 1 段に収める。
          スマホは従来どおり画面幅いっぱいで、短縮ラベル + 均等配分により折り返さない。 */}
      <div
        className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm md:max-w-2xl shadow-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="caption-individual-settings-title"
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 id="caption-individual-settings-title" className="text-sm font-bold flex items-center gap-2">
            ⚙️ キャプション個別設定
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-700 rounded-lg transition"
            title="閉じる"
            aria-label="キャプション個別設定を閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ミニプレビュー: モーダルがメインプレビューを覆うため、ここで見た目を確認できるようにする。
            スクロールしてもサイズ・位置の変化を見失わないよう上部に固定する。 */}
        {previewCanvasRef && (
          <div className="px-4 pt-3 shrink-0">
            {/* 縦向きは端末を問わず画面高に応じて幅を抑え、ミニビュー全体が
                モーダルや設定欄を占有しすぎないようにする。128px を下限、176px を上限にする。 */}
            <div
              className={`mx-auto w-full ${isPortraitProject ? PORTRAIT_MINI_PREVIEW_MAX_WIDTH_CLASS : 'max-w-sm'}`}
              data-testid="caption-mini-preview-container"
            >
              <CaptionMiniPreview
                sourceCanvasRef={previewCanvasRef}
                captionFreeSnapshotRef={captionFreeSnapshotRef}
                captions={[miniPreviewCaption]}
                settings={settings}
                previewTimeSec={miniPreviewTimeSec}
                refreshKey={miniPreviewRefreshKey}
                caption={`プレビュー現在位置 ${formatMiniPreviewTime(currentTime)} の画面にこのキャプションを重ねた表示`}
              />
            </div>
          </div>
        )}

        {/* コンテンツ */}
        <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar">
          {/* ■ スタイル設定 */}
          <div className="space-y-2">
            <div className="text-[10px] text-yellow-400 font-bold">■ スタイル設定</div>
            {/* サイズ: 一括設定と同じ共有コンポーネント（先頭に「デフォルト」を追加） */}
            <CaptionFontSizeField
              fontSize={caption.overrideFontSize ?? null}
              fontSizeCustom={caption.overrideFontSizeCustom}
              supportsCustom={supportsExtendedFonts}
              allowDefaultOption
              compact
              inheritedFontSizePx={inheritedFontSizePx}
              ariaLabelPrefix="個別キャプション"
              idPrefix={`caption-individual-${caption.id}`}
              onSetFontSize={handleFontSizeChange}
              onSetFontSizeCustom={handleCustomFontSizeChange}
            />
            {/* 字体: 一括設定と同じ共有コンポーネント。
                以前はモーダル側で独自に組んでいたため丸ゴシック等の固定ボタンが
                欠落していた（Issue: 個別設定に丸ゴシックが無い）。共有化で常に一致する。 */}
            <CaptionFontStyleField
              fontStyle={caption.overrideFontStyle ?? null}
              supportsExtendedFonts={supportsExtendedFonts}
              allowDefaultOption
              compact
              pinnedFontOptions={availablePinnedFonts}
              dropdownFontOptions={availableDropdownFonts}
              localFontFamilies={localFontFamilies}
              localFontsLoading={localFontsLoading}
              idPrefix={`caption-individual-${caption.id}`}
              onSetFontStyle={handleFontStyleChange}
              onLoadLocalFonts={handleLoadLocalFonts}
            />
            {/* 文字の縁・色: 一括設定と同じ段階開示・操作順 */}
            {uiCapabilities.supportsCaptionOutlineAndColor && (
              <div className="rounded-lg border border-gray-700/70 bg-gray-900/30">
              <SettingsAccordionHeader
                title="文字の縁・色"
                isOpen={showOutlineColorSettings}
                controlsId="caption-individual-outline-color-settings"
                onToggle={() => setShowOutlineColorSettings((open) => !open)}
              />
              {showOutlineColorSettings && (
                <div id="caption-individual-outline-color-settings" className="space-y-2 border-t border-gray-700/60 px-2 pb-2 pt-2">
                  <div className="flex items-center gap-2 text-[10px]">
                    <label className="text-gray-400 w-16 shrink-0" htmlFor="caption-individual-stroke-width">
                      縁の幅:
                    </label>
                    <NumericSliderField
                      min={CAPTION_STROKE_WIDTH_MIN}
                      max={CAPTION_STROKE_WIDTH_MAX}
                      step={CAPTION_STROKE_WIDTH_STEP}
                      value={effectiveGlyphStyle.strokeWidth}
                      onChange={(value) => onUpdate(caption.id, {
                        overrideStrokeWidth: clampCaptionStrokeWidth(value),
                      })}
                      ariaLabel="個別キャプションの縁の幅"
                      inputId="caption-individual-stroke-width"
                      unit="px"
                      className="min-w-0 flex-1"
                      sliderClassName="min-w-0 flex-1 cursor-pointer accent-yellow-500 h-1 bg-gray-600 rounded appearance-none"
                      inputClassName="w-14 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/40"
                    />
                  </div>
                  <CaptionColorField
                    label="縁の色"
                    value={effectiveGlyphStyle.strokeColor}
                    fallback="#000000"
                    idPrefix="caption-individual"
                    ariaLabelPrefix="個別キャプション"
                    onChange={(color) => onUpdate(caption.id, { overrideStrokeColor: color })}
                  />
                  <CaptionColorField
                    label="文字本体"
                    value={effectiveGlyphStyle.fontColor}
                    fallback="#FFFFFF"
                    idPrefix="caption-individual"
                    ariaLabelPrefix="個別キャプション"
                    onChange={(color) => onUpdate(caption.id, { overrideFontColor: color })}
                  />
                  <p className="pl-[4.5rem] text-[9px] leading-relaxed text-gray-500">
                    変更した項目だけ、このカードの個別設定として一括設定より優先します。
                  </p>
                  {hasOutlineColorOverride && (
                    <button
                      type="button"
                      onClick={handleClearOutlineColorSettings}
                      className="text-[9px] text-gray-500 hover:text-yellow-400 transition"
                    >
                      文字の縁・色を一括設定に戻す
                    </button>
                  )}
                </div>
              )}
              </div>
            )}
            {/* 位置: 一括設定と同じ共有コンポーネント（先頭に「デフォルト」を追加） */}
            <CaptionPositionField
              position={caption.overridePosition ?? null}
              positionCustom={caption.overridePositionCustom}
              supportsCustom={supportsExtendedFonts}
              allowDefaultOption
              compact
              ariaLabelPrefix="個別キャプション"
              idPrefix={`caption-individual-${caption.id}`}
              onSetPosition={handlePositionChange}
              onSetPositionCustom={handlePositionCustomChange}
              resolvePresetAsCustom={() => {
                // 個別設定は「一括設定を継承」もあるため、実効プリセットを使う
                const effectivePosition = caption.overridePosition ?? settings.position;
                const captionScale = canvasHeight > 0 ? canvasHeight / 1080 : 1;
                return resolveCaptionPresetAsCustomPercent(effectivePosition, {
                  canvasWidth,
                  canvasHeight,
                  fontSize: resolveCaptionBaseFontSize(caption, settings) * captionScale,
                  padding: 50 * captionScale,
                });
              }}
            />
            {/* ぼかし: 未設定時は一括設定の値を表示し、変更時だけ個別上書き */}
            {uiCapabilities.supportsCaptionIndividualBlur && (
              <>
              <div className="flex items-center gap-2 text-[10px]">
              <span className="text-gray-400 w-16 shrink-0">ぼかし:</span>
              <NumericSliderField
                min={0}
                max={50}
                step={1}
                value={effectiveGlyphStyle.blur * 10}
                onChange={(value) => onUpdate(caption.id, {
                  overrideBlur: clampCaptionBlur(value / 10),
                })}
                ariaLabel="個別キャプションのぼかし"
                hideInput
                className="flex-1 min-w-0"
                sliderClassName="flex-1 min-w-0 cursor-pointer accent-yellow-500 h-1 bg-gray-600 rounded appearance-none"
              />
              <span className="w-8 text-right whitespace-nowrap text-gray-400 shrink-0">
                {effectiveGlyphStyle.blur.toFixed(1)}
              </span>
            </div>
            {caption.overrideBlur != null && (
              <button
                type="button"
                onClick={() => onUpdate(caption.id, { overrideBlur: undefined })}
                className="pl-16 text-[9px] text-gray-500 hover:text-yellow-400 transition"
              >
                ぼかしを一括設定に戻す
              </button>
            )}
              </>
            )}

            {/* 背景の帯: 一括設定と同じチェック + 詳細（未設定項目は一括を継承） */}
            {uiCapabilities.supportsCaptionBackground && (
              <div className="space-y-2 pt-2 border-t border-gray-700/50">
              <label className="flex items-center gap-1.5 text-[10px] text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={effectiveBackgroundStyle.backgroundEnabled}
                  onChange={(e) =>
                    onUpdate(caption.id, { overrideBackgroundEnabled: e.target.checked })
                  }
                  className="accent-yellow-500 rounded cursor-pointer"
                />
                <span className="font-semibold">キャプション背景の帯</span>
              </label>
              {effectiveBackgroundStyle.backgroundEnabled && (
                <div className="space-y-2">
                  <CaptionColorField
                    label="背景色"
                    value={effectiveBackgroundStyle.backgroundColor}
                    fallback={CAPTION_BACKGROUND_DEFAULT.backgroundColor}
                    idPrefix={`caption-individual-bg-${caption.id}`}
                    ariaLabelPrefix="個別キャプション"
                    onChange={(color) =>
                      onUpdate(caption.id, { overrideBackgroundColor: color })
                    }
                  />
                  <div className="flex items-center gap-2 text-[10px]">
                    <label
                      className="text-gray-400 w-16 shrink-0"
                      htmlFor={`caption-individual-bg-opacity-${caption.id}`}
                    >
                      濃さ:
                    </label>
                    {/* スライダーは 0–1、数値欄は % 表示のため、% 基準へ統一して扱う */}
                    <NumericSliderField
                      min={Math.round(CAPTION_BACKGROUND_OPACITY_MIN * 100)}
                      max={Math.round(CAPTION_BACKGROUND_OPACITY_MAX * 100)}
                      step={Math.round(CAPTION_BACKGROUND_OPACITY_STEP * 100)}
                      value={Math.round(effectiveBackgroundStyle.backgroundOpacity * 100)}
                      onChange={(value) =>
                        onUpdate(caption.id, {
                          overrideBackgroundOpacity: clampCaptionBackgroundOpacity(value / 100),
                        })
                      }
                      ariaLabel="個別キャプション背景の濃さ"
                      inputId={`caption-individual-bg-opacity-${caption.id}`}
                      unit="%"
                      className="min-w-0 flex-1"
                      sliderClassName="min-w-0 flex-1 cursor-pointer accent-yellow-500 h-1 bg-gray-600 rounded appearance-none"
                      inputClassName="w-14 focus:border-yellow-500"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <label
                      className="text-gray-400 w-16 shrink-0"
                      htmlFor={`caption-individual-bg-radius-${caption.id}`}
                    >
                      角丸:
                    </label>
                    <NumericSliderField
                      min={CAPTION_BACKGROUND_RADIUS_MIN}
                      max={CAPTION_BACKGROUND_RADIUS_MAX}
                      step={CAPTION_BACKGROUND_RADIUS_STEP}
                      value={effectiveBackgroundStyle.backgroundRadius}
                      onChange={(value) =>
                        onUpdate(caption.id, {
                          overrideBackgroundRadius: clampCaptionBackgroundRadius(value),
                        })
                      }
                      ariaLabel="個別キャプション背景の角丸"
                      inputId={`caption-individual-bg-radius-${caption.id}`}
                      unit="px"
                      className="min-w-0 flex-1"
                      sliderClassName="min-w-0 flex-1 cursor-pointer accent-yellow-500 h-1 bg-gray-600 rounded appearance-none"
                      inputClassName="w-14 focus:border-yellow-500"
                    />
                  </div>
                </div>
              )}
              {hasBackgroundOverride && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdate(caption.id, {
                      overrideBackgroundEnabled: undefined,
                      overrideBackgroundColor: undefined,
                      overrideBackgroundOpacity: undefined,
                      overrideBackgroundRadius: undefined,
                    })
                  }
                  className="text-[9px] text-gray-500 hover:text-yellow-400 transition"
                >
                  背景の帯を一括設定に戻す
                </button>
              )}
              </div>
            )}
          </div>

          {/* ■ フェード設定 */}
          <div className="space-y-2 pt-3 border-t border-gray-700">
            <div className="text-[10px] text-yellow-400 font-bold">■ フェード設定</div>
            {/* フェードイン */}
            <div className="flex items-center gap-2 text-[10px]">
              <label className="flex items-center gap-1 w-24 justify-start cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentFadeIn === 'on'}
                  onChange={(e) => handleFadeInChange(e.target.checked ? 'on' : 'off')}
                  className="accent-yellow-500 rounded cursor-pointer"
                />
                <span className="whitespace-nowrap">フェードイン</span>
              </label>
              <SwipeProtectedSlider
                min={0}
                max={2}
                step={1}
                value={currentFadeInDuration === 0.5 ? 0 : currentFadeInDuration === 1.0 ? 1 : 2}
                onChange={handleFadeInDurationChange}
                disabled={currentFadeIn !== 'on'}
                className={`flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 disabled:cursor-default disabled:bg-gray-800 disabled:accent-gray-700 ${currentFadeIn === 'on' ? 'cursor-pointer' : ''}`}
              />
              <span className={`w-8 text-right whitespace-nowrap ${currentFadeIn !== 'on' ? 'text-gray-600' : 'text-gray-400'}`}>{currentFadeInDuration}秒</span>
            </div>
            {/* フェードアウト */}
            <div className="flex items-center gap-2 text-[10px]">
              <label className="flex items-center gap-1 w-24 justify-start cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentFadeOut === 'on'}
                  onChange={(e) => handleFadeOutChange(e.target.checked ? 'on' : 'off')}
                  className="accent-yellow-500 rounded cursor-pointer"
                />
                <span className="whitespace-nowrap">フェードアウト</span>
              </label>
              <SwipeProtectedSlider
                min={0}
                max={2}
                step={1}
                value={currentFadeOutDuration === 0.5 ? 0 : currentFadeOutDuration === 1.0 ? 1 : 2}
                onChange={handleFadeOutDurationChange}
                disabled={currentFadeOut !== 'on'}
                className={`flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 disabled:cursor-default disabled:bg-gray-800 disabled:accent-gray-700 ${currentFadeOut === 'on' ? 'cursor-pointer' : ''}`}
              />
              <span className={`w-8 text-right whitespace-nowrap ${currentFadeOut !== 'on' ? 'text-gray-600' : 'text-gray-400'}`}>{currentFadeOutDuration}秒</span>
            </div>
            {/* デフォルトに戻すボタン */}
            {(currentFadeIn !== 'default' || currentFadeOut !== 'default') && (
              <button
                onClick={() => {
                  onUpdate(caption.id, {
                    overrideFadeIn: undefined,
                    overrideFadeOut: undefined,
                    overrideFadeInDuration: undefined,
                    overrideFadeOutDuration: undefined,
                  });
                }}
                className="text-[9px] text-gray-500 hover:text-yellow-400 transition"
              >
                フェード設定をデフォルトに戻す
              </button>
            )}
          </div>

          {/* ■ 時分割設定（複数行テキストのカードのみ） */}
          {isSequential && (
            <div className="space-y-2 pt-3 border-t border-gray-700">
              <div className="text-[10px] text-emerald-300 font-bold">
                ■ 時分割設定（{resolveSequentialCaptionSegments(caption).length}行を順番に表示）
              </div>
              {/* フェードの適用単位 */}
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-gray-400 w-16">フェード:</span>
                <div className="flex gap-1 flex-1">
                  <button
                    onClick={() => onUpdate(caption.id, { sequentialFadeMode: undefined })}
                    className={getButtonClass(sequentialFadeMode === 'card')}
                    title="カード全体でフェード（最初の行の頭でイン、最後の行の尻でアウト）"
                  >
                    カード全体
                  </button>
                  <button
                    onClick={() => onUpdate(caption.id, { sequentialFadeMode: 'line' })}
                    className={getButtonClass(sequentialFadeMode === 'line')}
                    title="行ごとにフェード（各行の表示開始でイン、表示終了でアウト）"
                  >
                    行ごと
                  </button>
                </div>
              </div>
              <p className="text-[9px] text-gray-500 pl-16">
                フェードの ON/OFF と時間は上のフェード設定（または一括設定）に従います
              </p>
              {/* 行の間隔 */}
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-gray-400 w-16">行の間隔:</span>
                <div className="flex gap-1 flex-1 items-center">
                  {SEQUENTIAL_GAP_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => {
                        setIsCustomSequentialGap(false);
                        onUpdate(caption.id, {
                          sequentialGapSec: preset.value === 0 ? undefined : preset.value,
                        });
                      }}
                      className={getButtonClass(!isCustomSequentialGap && sequentialGapSec === preset.value)}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setIsCustomSequentialGap(true)}
                    className={getButtonClass(isCustomSequentialGap)}
                  >
                    カスタム
                  </button>
                  {isCustomSequentialGap && (
                    <>
                      <input
                        type="number"
                        min={0}
                        max={SEQUENTIAL_GAP_MAX_SEC}
                        step={0.1}
                        value={sequentialGapSec}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!Number.isNaN(val)) {
                            onUpdate(caption.id, {
                              sequentialGapSec: clampSequentialGapSec(val) || undefined,
                            });
                          }
                        }}
                        className="w-14 bg-gray-700 border border-gray-600 rounded px-1 text-right focus:outline-none focus:border-yellow-500"
                      />
                      <span className="text-gray-500 shrink-0">秒</span>
                    </>
                  )}
                </div>
              </div>
              <p className="text-[9px] text-gray-500 pl-16">
                行と行の間に何も表示しない間隔を挟みます（表示時間内で自動調整）
              </p>
            </div>
          )}

          <p className="text-[9px] text-gray-500 pt-2">
            ※「デフォルト」選択時は一括設定の値に従います
          </p>

          <div className="pt-3 border-t border-gray-700">
            <button
              type="button"
              onClick={handleClearIndividualSettings}
              disabled={!hasIndividualSettings}
              className="w-full min-h-11 px-3 rounded-lg border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700 hover:border-yellow-500/60 disabled:opacity-40 disabled:hover:bg-gray-800 disabled:hover:border-gray-600 transition flex items-center justify-center gap-2 text-xs"
              title="本文と表示時間は残し、このキャプションだけ個別設定を初期化します"
            >
              <RotateCcw className="w-4 h-4" /> この個別設定をクリア
            </button>
            <p className="text-[9px] text-gray-500 text-center mt-1">
              本文と開始・終了時間は変更しません
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CaptionSettingsModal;
