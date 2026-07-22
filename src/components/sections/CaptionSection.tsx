/**
 * @file CaptionSection.tsx
 * @author Turtle Village
 * @description テキストキャプションの追加、編集、削除を行うセクション。タイムライン上での表示タイミングやスタイル（サイズ、位置）の設定UIを提供する。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Lock,
  Unlock,
  CircleHelp,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Type,
  Eye,
  EyeOff,
  ListPlus,
  Timer,
  X,
  Play,
  Pause,
  Minus,
  ArrowLeftRight,
  Crosshair,
} from 'lucide-react';
import type {
  Caption,
  CaptionSettings,
  CaptionPosition,
  CaptionSize,
  CaptionFontStyle,
} from '../../types';
import CaptionItem from '../media/CaptionItem';
import { SwipeProtectedSlider } from '../SwipeProtectedSlider';
import { usePlatformCapabilities } from '../../app/PlatformCapabilitiesContext';
import {
  BASIC_CAPTION_FONT_OPTIONS,
  createLocalFontValue,
  getAvailableDropdownFontOptions,
  getAvailablePinnedFontOptions,
  getLocalFontFamilyFromValue,
  isExtendedCaptionFontStyle,
  resolveCaptionFontFamily,
} from '../../utils/captionFontCatalog';
import { queryLocalFontFamilies, supportsLocalFontAccess } from '../../utils/fontAvailability';
import {
  CAPTION_FONT_SIZE_CUSTOM_MAX,
  CAPTION_FONT_SIZE_CUSTOM_MIN,
  CAPTION_FONT_SIZE_PRESETS,
  CAPTION_POSITION_CUSTOM_DEFAULT,
  CAPTION_STROKE_WIDTH_MAX,
  CAPTION_STROKE_WIDTH_MIN,
  CAPTION_STROKE_WIDTH_STEP,
  clampCaptionStrokeWidth,
  clampCustomFontSize,
  clampPositionPercent,
} from '../../utils/captionStyle';
import CaptionBulkAddModal, { type BulkCaptionApplyItem } from '../modals/CaptionBulkAddModal';
import CaptionColorField from '../common/CaptionColorField';

interface CaptionSectionProps {
  captions: Caption[];
  settings: CaptionSettings;
  isLocked: boolean;
  totalDuration: number;
  currentTime: number;
  onToggleLock: () => void;
  onAddCaption: (text: string, startTime: number, endTime: number) => void;
  onUpdateCaption: (id: string, updates: Partial<Omit<Caption, 'id'>>) => void;
  onRemoveCaption: (id: string) => void;
  onMoveCaption: (id: string, direction: 'up' | 'down') => void;
  onSetEnabled: (enabled: boolean) => void;
  onSetFontSize: (size: CaptionSize) => void;
  onSetFontStyle: (style: CaptionFontStyle) => void;
  onSetFontColor: (color: string) => void;
  onSetStrokeColor: (color: string) => void;
  onSetStrokeWidth: (width: number) => void;
  onSetPosition: (position: CaptionPosition) => void;
  onSetBlur: (blur: number) => void;
  onSetFontSizeCustom: (value: number | null) => void;
  onSetPositionCustom: (value: { x: number; y: number } | null) => void;
  onSetBulkFadeIn: (enabled: boolean) => void;
  onSetBulkFadeOut: (enabled: boolean) => void;
  onSetBulkFadeInDuration: (duration: number) => void;
  onSetBulkFadeOutDuration: (duration: number) => void;
  onOpenHelp: () => void;
  // 一括入力・タイミング打ち（standard フレーバー限定）
  formatTime: (seconds: number) => string;
  /** まとめて入力/編集の反映（全置き換え・行順マージ） */
  onApplyCaptions: (items: BulkCaptionApplyItem[]) => void;
  /** キャプションの一括時間シフト（一覧の fromIndex 番目のカード以降を deltaSec ずらす） */
  onShiftCaptions: (deltaSec: number, fromIndex?: number) => void;
  /** タイミング打ちの微調整用プレビュー操作 */
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeekBy: (deltaSec: number) => void;
  /** プレビューを一時停止せずにキャプションを更新する（タイミング打ち用） */
  onUpdateCaptionLive: (id: string, updates: Partial<Omit<Caption, 'id'>>) => void;
}

/**
 * キャプションセクションコンポーネント
 */
const CaptionSection: React.FC<CaptionSectionProps> = ({
  captions,
  settings,
  isLocked,
  totalDuration,
  currentTime,
  onToggleLock,
  onAddCaption,
  onUpdateCaption,
  onRemoveCaption,
  onMoveCaption,
  onSetEnabled,
  onSetFontSize,
  onSetFontStyle,
  onSetFontColor,
  onSetStrokeColor,
  onSetStrokeWidth,
  onSetPosition,
  onSetBlur,
  onSetFontSizeCustom,
  onSetPositionCustom,
  onSetBulkFadeIn,
  onSetBulkFadeOut,
  onSetBulkFadeInDuration,
  onSetBulkFadeOutDuration,
  onOpenHelp,
  formatTime,
  onApplyCaptions,
  onShiftCaptions,
  onUpdateCaptionLive,
  isPlaying,
  onTogglePlay,
  onSeekBy,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [showStyleSettings, setShowStyleSettings] = useState(false);
  const [showOutlineColorSettings, setShowOutlineColorSettings] = useState(false);
  const [newText, setNewText] = useState('');
  // 拡張機能（システムフォント/一括入力/タイミング打ち/カスタム値）は standard フレーバー（Android/PC）限定
  const { isIosSafari } = usePlatformCapabilities();
  const supportsExtendedFonts = !isIosSafari;
  const supportsBulkInput = !isIosSafari;
  const [showBulkModal, setShowBulkModal] = useState(false);

  // フォント: 固定（ゴシック/明朝 + 実在すれば丸ゴシック）+ 実在フォントのみのドロップダウン
  const availablePinnedFonts = useMemo(() => getAvailablePinnedFontOptions(), []);
  const availableDropdownFonts = useMemo(() => getAvailableDropdownFontOptions(), []);
  // Local Font Access API（PC の Chromium 系のみ）で読み込んだ端末フォント
  const [localFontFamilies, setLocalFontFamilies] = useState<string[]>([]);
  const [localFontsLoading, setLocalFontsLoading] = useState(false);
  const canLoadLocalFonts = supportsExtendedFonts && supportsLocalFontAccess();
  const handleLoadLocalFonts = async () => {
    if (localFontsLoading) return;
    setLocalFontsLoading(true);
    try {
      setLocalFontFamilies(await queryLocalFontFamilies());
    } finally {
      setLocalFontsLoading(false);
    }
  };

  const selectedLocalFamily = getLocalFontFamilyFromValue(settings.fontStyle);
  const isPinnedFontSelected =
    availablePinnedFonts.some((o) => o.value === settings.fontStyle) ||
    BASIC_CAPTION_FONT_OPTIONS.some((o) => o.value === settings.fontStyle);
  const isDropdownFontSelected =
    !isPinnedFontSelected && isExtendedCaptionFontStyle(settings.fontStyle);
  const dropdownFontValue = isDropdownFontSelected ? settings.fontStyle : '';
  // 復元データ等で「選択中だが一覧に無い」値も表示できるよう補完する
  const dropdownHasSelected =
    !dropdownFontValue ||
    availableDropdownFonts.some((o) => o.value === dropdownFontValue) ||
    (selectedLocalFamily !== null && localFontFamilies.includes(selectedLocalFamily));

  // カスタムサイズ/位置（standard 限定）
  const isCustomFontSize = settings.fontSizeCustom != null;
  const isCustomPosition = settings.positionCustom != null;
  const customPosition = settings.positionCustom ?? CAPTION_POSITION_CUSTOM_DEFAULT;

  // === 一括シフト（映像の差し込み/削除後の時間調整・カード基準） ===
  const [shiftAmount, setShiftAmount] = useState(1.0);
  // -1 = 全部、それ以外 = そのカード以降（そのカードを含む）
  const [shiftFromIndex, setShiftFromIndex] = useState(-1);
  const [shiftAlignmentFeedback, setShiftAlignmentFeedback] = useState('');
  const normalizedShiftFromIndex =
    shiftFromIndex >= 0 && shiftFromIndex < captions.length ? shiftFromIndex : 0;
  const shiftAnchorCaption = captions[normalizedShiftFromIndex];
  const shiftAlignmentTarget = Number.isFinite(currentTime)
    ? Math.max(0, Math.round(currentTime * 10) / 10)
    : 0;
  const shiftAlignmentDelta = shiftAnchorCaption
    ? Math.round((shiftAlignmentTarget - shiftAnchorCaption.startTime) * 10) / 10
    : 0;
  const isShiftAlignmentCurrent = Math.abs(shiftAlignmentDelta) < 0.05;
  const formatShiftPosition = (seconds: number) => {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds * 10) / 10) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const secondsInMinute = (safeSeconds % 60).toFixed(1).padStart(4, '0');
    return `${minutes}:${secondsInMinute}`;
  };
  const formatSignedShift = (seconds: number) =>
    `${seconds >= 0 ? '+' : '−'}${Math.abs(seconds).toFixed(1)}秒`;
  useEffect(() => {
    setShiftAlignmentFeedback('');
  }, [normalizedShiftFromIndex, shiftAlignmentTarget]);
  const stepShiftAmount = (delta: number) => {
    setShiftAmount((prev) => Math.max(0.5, Math.min(600, Math.round((prev + delta) * 2) / 2)));
  };
  // −/＋ の長押しで加速（400ms 後から 100ms 間隔で 1 秒ずつ）
  const shiftHoldTimerRef = useRef<number | null>(null);
  const shiftHoldIntervalRef = useRef<number | null>(null);
  const stopShiftHold = () => {
    if (shiftHoldTimerRef.current !== null) {
      window.clearTimeout(shiftHoldTimerRef.current);
      shiftHoldTimerRef.current = null;
    }
    if (shiftHoldIntervalRef.current !== null) {
      window.clearInterval(shiftHoldIntervalRef.current);
      shiftHoldIntervalRef.current = null;
    }
  };
  const startShiftHold = (direction: 1 | -1) => {
    stopShiftHold();
    stepShiftAmount(direction * 0.5);
    shiftHoldTimerRef.current = window.setTimeout(() => {
      shiftHoldIntervalRef.current = window.setInterval(() => {
        stepShiftAmount(direction * 1);
      }, 100);
    }, 400);
  };
  // 長押し中にアンマウントされてもタイマー/インターバルを確実に解除する
  useEffect(
    () => () => {
      if (shiftHoldTimerRef.current !== null) {
        window.clearTimeout(shiftHoldTimerRef.current);
        shiftHoldTimerRef.current = null;
      }
      if (shiftHoldIntervalRef.current !== null) {
        window.clearInterval(shiftHoldIntervalRef.current);
        shiftHoldIntervalRef.current = null;
      }
    },
    []
  );
  const applyShift = (direction: 1 | -1) => {
    const delta = Math.abs(shiftAmount) * direction;
    if (delta === 0) return;
    setShiftAlignmentFeedback('');
    onShiftCaptions(delta, normalizedShiftFromIndex);
  };
  const alignShiftStartToCurrentTime = () => {
    if (!shiftAnchorCaption || isShiftAlignmentCurrent) return;
    const delta = shiftAlignmentDelta;
    onShiftCaptions(delta, normalizedShiftFromIndex);
    setShiftAlignmentFeedback(
      `対象の先頭を ${formatShiftPosition(shiftAlignmentTarget)} に合わせました（${formatSignedShift(delta)}）`
    );
  };

  // === タイミング打ち v3 ===
  // モード:
  //   alternate（交互）: ワンボタンで 開始→終了→開始… と切り替えながら確定（歌詞・間のある説明向け）
  //   chain（連続）: 終了＝次の開始を同時確定（間の無い連続字幕向け）
  const [stampActive, setStampActive] = useState(false);
  const [stampIndex, setStampIndex] = useState(0);
  const [stampMode, setStampMode] = useState<'alternate' | 'chain'>('alternate');
  const [stampPhase, setStampPhase] = useState<'start' | 'end'>('start');
  // 連続モードのキャプション間隔（終了位置 + 間隔 = 次の開始位置）
  const [stampGapSec, setStampGapSec] = useState(0.2);
  const [isStampGapCustom, setIsStampGapCustom] = useState(false);
  const stampTarget = stampActive ? captions[stampIndex] : undefined;

  // 現在のプレビュー位置にかかっている（または直後の）キャプションから開始する
  const startStampMode = () => {
    const idx = captions.findIndex((c) => c.endTime > currentTime + 0.05);
    setStampIndex(idx >= 0 ? idx : Math.max(0, captions.length - 1));
    setStampPhase(stampMode === 'alternate' ? 'start' : 'end');
    setStampActive(true);
  };

  const moveStampTarget = (delta: number) => {
    setStampIndex((prev) => Math.max(0, Math.min(captions.length - 1, prev + delta)));
    setStampPhase(stampMode === 'alternate' ? 'start' : 'end');
  };

  const switchStampMode = (mode: 'alternate' | 'chain') => {
    setStampMode(mode);
    setStampPhase(mode === 'alternate' ? 'start' : 'end');
  };

  const stampNow = () => Math.round(currentTime * 10) / 10;

  // 交互モード: 開始→終了→（次のカードの）開始→… とワンボタンで確定する。
  // 打ち直したいときは -1秒/一時停止で戻り、⇄ でフェーズを切り替えて同じ場所を再確定できる。
  const handleStampAlternate = () => {
    const target = captions[stampIndex];
    if (!target) {
      setStampActive(false);
      return;
    }
    const at = stampNow();
    if (stampPhase === 'start') {
      if (totalDuration > 0 && at >= totalDuration - 0.1) return;
      const updates: Partial<Omit<Caption, 'id'>> = { startTime: at };
      // 開始を後ろへ動かして終了を追い越す場合は、最低 0.5 秒の表示時間を確保する
      const minEnd = at + 0.5;
      if (target.endTime < minEnd) {
        updates.endTime = totalDuration > 0 ? Math.min(minEnd, totalDuration) : minEnd;
      }
      onUpdateCaptionLive(target.id, updates);
      setStampPhase('end');
    } else {
      if (at <= target.startTime + 0.1) return; // 開始より前では終了できない
      onUpdateCaptionLive(target.id, {
        endTime: totalDuration > 0 ? Math.min(at, totalDuration) : at,
      });
      if (captions[stampIndex + 1]) {
        setStampIndex(stampIndex + 1);
        setStampPhase('start');
      } else {
        setStampActive(false);
      }
    }
  };

  // 連続モード: 終了＝次の開始を同時に確定（間なし）
  const handleStampChain = () => {
    const target = captions[stampIndex];
    if (!target) {
      setStampActive(false);
      return;
    }
    if (currentTime <= target.startTime + 0.1) return;
    const at = stampNow();
    onUpdateCaptionLive(target.id, {
      endTime: totalDuration > 0 ? Math.min(at, totalDuration) : at,
    });
    const next = captions[stampIndex + 1];
    if (next) {
      // 次の開始は「終了位置 + 設定した間隔」
      const nextStart = Math.round((at + stampGapSec) * 10) / 10;
      const nextUpdates: Partial<Omit<Caption, 'id'>> = { startTime: nextStart };
      // 間隔で開始が終了を追い越す場合は最低 0.5 秒の表示時間を確保する
      if (next.endTime < nextStart + 0.5) {
        const minEnd = nextStart + 0.5;
        nextUpdates.endTime = totalDuration > 0 ? Math.min(minEnd, totalDuration) : minEnd;
      }
      onUpdateCaptionLive(next.id, nextUpdates);
      setStampIndex(stampIndex + 1);
    } else {
      setStampActive(false);
    }
  };

  const handleAddCaption = () => {
    if (!newText.trim()) return;

    // 現在のスライドバー位置（currentTime）から開始
    let startTime = currentTime;

    // 境界値チェック: startTimeがtotalDurationを超えないようにする
    if (startTime >= totalDuration) {
      // 動画の終わりに達している場合、最後の3秒前から開始
      startTime = Math.max(0, totalDuration - 3);
    }

    // endTimeは3秒後、ただしtotalDurationを超えない
    const endTime = Math.min(startTime + 3, totalDuration);

    // startTimeとendTimeが同じ（または逆転）にならないようにする
    if (endTime <= startTime) {
      return; // 追加できる余地がない
    }

    onAddCaption(newText.trim(), startTime, endTime);
    setNewText('');
  };

  const fontSizeOptions: { value: CaptionSize; label: string }[] = [
    { value: 'small', label: '小' },
    { value: 'medium', label: '中' },
    { value: 'large', label: '大' },
    { value: 'xlarge', label: '特大' },
  ];

  // 固定表示フォント: standard は「基本 2 + 実在する丸ゴシック」+ ドロップダウン、iOS は従来の 2 種
  const fontStyleOptions = supportsExtendedFonts
    ? [...BASIC_CAPTION_FONT_OPTIONS, ...availablePinnedFonts.filter((o) => o.extended)]
    : BASIC_CAPTION_FONT_OPTIONS;

  const positionOptions: { value: CaptionPosition; label: string }[] = [
    { value: 'top', label: '上部' },
    { value: 'center', label: '中央' },
    { value: 'bottom', label: '下部' },
  ];

  return (
    <section className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden shadow-xl">
      {/* ヘッダー */}
      <div
        className="p-4 bg-gray-850 border-b border-gray-800 flex justify-between items-center cursor-pointer hover:bg-gray-800/50 transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h2 className="font-bold flex items-center gap-2 text-yellow-400 md:text-base lg:text-lg">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="w-6 h-6 lg:w-7 lg:h-7 rounded-full bg-yellow-500/10 flex items-center justify-center text-xs lg:text-sm">
            4
          </span>
          <span>キャプション</span>
          {captions.length > 0 && (
            <span className="text-[10px] md:text-xs text-yellow-300 font-normal ml-2">
              ({captions.length}件)
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenHelp();
            }}
            className="p-1 rounded-lg transition border border-blue-500/45 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200 ml-1"
            title="このセクションの説明"
            aria-label="キャプションセクションの説明"
          >
            <CircleHelp className="w-4 h-4" />
          </button>
        </h2>
        <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
          {/* 表示/非表示トグル */}
          <button
            onClick={() => onSetEnabled(!settings.enabled)}
            className={`p-1.5 rounded-lg transition ${
              settings.enabled
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600'
            }`}
            title={settings.enabled ? 'キャプションを非表示' : 'キャプションを表示'}
          >
            {settings.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          {/* ロック */}
          <button
            onClick={onToggleLock}
            className={`p-1.5 rounded-lg transition ${
              isLocked
                ? 'bg-red-500/20 text-red-400'
                : 'bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600'
            }`}
            title={isLocked ? 'ロック解除' : 'ロック'}
            aria-label={
              isLocked ? 'キャプションセクションのロックを解除' : 'キャプションセクションをロック'
            }
          >
            {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* コンテンツ */}
      {isOpen && (
        <div className="p-3 lg:p-4 space-y-3">
          {/* スタイル/フェード一括設定 */}
          <div className="bg-gray-800/50 rounded-xl border border-gray-600/70">
            <button
              type="button"
              onClick={() => setShowStyleSettings((open) => !open)}
              aria-expanded={showStyleSettings}
              aria-controls="caption-style-settings"
              className="w-full p-2 flex items-center justify-between text-xs md:text-sm text-gray-400 hover:text-white transition"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Type className="w-3 h-3" />
                <span className="whitespace-nowrap">スタイル/フェード一括設定</span>
                {!showStyleSettings && (
                  <span
                    aria-hidden="true"
                    className="whitespace-nowrap text-[9px] font-normal text-gray-500 md:text-[10px]"
                  >
                    （開いて設定）
                  </span>
                )}
              </div>
              {showStyleSettings ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
            {showStyleSettings && (
              <div id="caption-style-settings" className="px-3 pb-3 space-y-3">
                {/* ■ スタイル設定 */}
                <div className="space-y-2">
                  <div className="text-[10px] md:text-xs text-yellow-400 font-bold">
                    ■ スタイル設定
                  </div>
                  {/* 文字サイズ: プリセット + カスタム値（standard のみ） */}
                  <div className="flex items-center gap-2 text-[10px] md:text-xs">
                    <span className="text-gray-400 w-16">サイズ:</span>
                    <div className="flex gap-1 flex-1">
                      {fontSizeOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            onSetFontSizeCustom(null);
                            onSetFontSize(opt.value);
                          }}
                          disabled={isLocked}
                          className={`flex-1 max-w-[4rem] py-1 rounded transition ${
                            !isCustomFontSize && settings.fontSize === opt.value
                              ? 'bg-yellow-500 text-gray-900'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          } disabled:opacity-50`}
                        >
                          {opt.label}
                        </button>
                      ))}
                      {supportsExtendedFonts && (
                        <button
                          onClick={() => {
                            if (!isCustomFontSize) {
                              onSetFontSizeCustom(CAPTION_FONT_SIZE_PRESETS[settings.fontSize]);
                            }
                          }}
                          disabled={isLocked}
                          className={`flex-1 max-w-[4.5rem] py-1 rounded transition ${
                            isCustomFontSize
                              ? 'bg-yellow-500 text-gray-900'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          } disabled:opacity-50`}
                          title="サイズを数値で自由に指定"
                        >
                          カスタム
                        </button>
                      )}
                    </div>
                  </div>
                  {/* カスタムサイズ入力 */}
                  {supportsExtendedFonts && isCustomFontSize && (
                    <div className="flex items-center gap-2 text-[10px] md:text-xs pl-16">
                      <SwipeProtectedSlider
                        min={CAPTION_FONT_SIZE_CUSTOM_MIN}
                        max={CAPTION_FONT_SIZE_CUSTOM_MAX}
                        step={2}
                        value={settings.fontSizeCustom ?? CAPTION_FONT_SIZE_PRESETS.medium}
                        onChange={(val) => onSetFontSizeCustom(clampCustomFontSize(val))}
                        disabled={isLocked}
                        className={`flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${isLocked ? '' : 'cursor-pointer'}`}
                      />
                      <input
                        type="number"
                        min={CAPTION_FONT_SIZE_CUSTOM_MIN}
                        max={CAPTION_FONT_SIZE_CUSTOM_MAX}
                        step={2}
                        value={Math.round(
                          settings.fontSizeCustom ?? CAPTION_FONT_SIZE_PRESETS.medium
                        )}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!Number.isNaN(val)) onSetFontSizeCustom(clampCustomFontSize(val));
                        }}
                        disabled={isLocked}
                        className="w-14 bg-gray-700 border border-gray-600 rounded px-1 text-right focus:outline-none focus:border-yellow-500 disabled:opacity-50"
                      />
                      <span className="text-gray-500 whitespace-nowrap">px</span>
                    </div>
                  )}
                  {/* 字体: 固定（基本 2 + 実在する丸ゴシック）+ 実在フォントのみのドロップダウン（standard のみ） */}
                  <div className="flex items-center gap-2 text-[10px] md:text-xs">
                    <span className="text-gray-400 w-16">字体:</span>
                    <div className="flex gap-1 flex-1 items-stretch min-w-0">
                      {fontStyleOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => onSetFontStyle(opt.value)}
                          disabled={isLocked}
                          className={`flex-1 min-w-0 px-0.5 py-1 rounded transition whitespace-nowrap ${
                            settings.fontStyle === opt.value
                              ? 'bg-yellow-500 text-gray-900'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          } disabled:opacity-50`}
                          style={{ fontFamily: opt.family }}
                        >
                          {opt.label}
                        </button>
                      ))}
                      {supportsExtendedFonts && (
                        <select
                          value={dropdownFontValue}
                          onChange={(e) => {
                            const value = e.target.value as CaptionFontStyle | '';
                            if (value) onSetFontStyle(value);
                          }}
                          disabled={isLocked}
                          className={`flex-1 min-w-0 max-w-[7.5rem] py-1 px-1 rounded transition text-[10px] md:text-xs bg-gray-700 focus:outline-none focus:ring-1 focus:ring-yellow-500 disabled:opacity-50 ${
                            dropdownFontValue
                              ? 'text-yellow-300 ring-1 ring-yellow-500/70 font-semibold'
                              : 'text-gray-300 hover:bg-gray-600'
                          }`}
                          title="その他のシステムフォントから選ぶ（端末に実在するもののみ表示）"
                        >
                          <option value="" disabled className="bg-gray-800 text-gray-500">
                            その他▾
                          </option>
                          {availableDropdownFonts.map((opt) => (
                            <option
                              key={opt.value}
                              value={opt.value}
                              className="bg-gray-800 text-gray-200"
                              style={{ fontFamily: opt.family }}
                            >
                              {opt.label}
                            </option>
                          ))}
                          {localFontFamilies.length > 0 && (
                            <optgroup label="端末のフォント" className="bg-gray-800 text-gray-400">
                              {localFontFamilies.map((family) => (
                                <option
                                  key={family}
                                  value={createLocalFontValue(family)}
                                  className="bg-gray-800 text-gray-200"
                                  style={{ fontFamily: family }}
                                >
                                  {family}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {!dropdownHasSelected && (
                            <option
                              value={dropdownFontValue}
                              className="bg-gray-800 text-gray-200"
                              style={{ fontFamily: resolveCaptionFontFamily(dropdownFontValue) }}
                            >
                              {selectedLocalFamily ?? dropdownFontValue}
                            </option>
                          )}
                        </select>
                      )}
                    </div>
                  </div>
                  {/* PC: 端末の全フォント読み込み（Local Font Access API 対応環境のみ） */}
                  {canLoadLocalFonts && localFontFamilies.length === 0 && (
                    <div className="pl-16">
                      <button
                        onClick={handleLoadLocalFonts}
                        disabled={isLocked || localFontsLoading}
                        className="text-[10px] text-blue-300 hover:text-blue-200 underline underline-offset-2 disabled:opacity-50"
                        title="この PC にインストールされている全フォントを選択肢に追加します（許可が必要）"
                      >
                        {localFontsLoading
                          ? '読み込み中…'
                          : '＋ この端末の全フォントから選ぶ（PC）'}
                      </button>
                    </div>
                  )}
                  {/* 字体の仕上げ: デフォルトで困らない詳細設定は段階的に開示する */}
                  <div className="rounded-lg border border-gray-700/70 bg-gray-900/30">
                    <button
                      type="button"
                      onClick={() => setShowOutlineColorSettings((open) => !open)}
                      aria-expanded={showOutlineColorSettings}
                      aria-controls="caption-outline-color-settings"
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-[10px] text-gray-400 transition hover:bg-gray-800/45 hover:text-white md:text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-2 font-semibold">
                        <span className="whitespace-nowrap">文字の縁・色</span>
                        {!showOutlineColorSettings && (
                          <span
                            aria-hidden="true"
                            className="whitespace-nowrap text-[9px] font-normal text-gray-500 md:text-[10px]"
                          >
                            （開いて設定）
                          </span>
                        )}
                      </span>
                      {showOutlineColorSettings ? (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0" />
                      )}
                    </button>
                    {showOutlineColorSettings && (
                      <div
                        id="caption-outline-color-settings"
                        className="space-y-2 border-t border-gray-700/60 px-2 pb-2 pt-2"
                      >
                        <div className="flex items-center gap-2 text-[10px] md:text-xs">
                          <label
                            className="text-gray-400 w-16 shrink-0"
                            htmlFor="caption-stroke-width"
                          >
                            縁の幅:
                          </label>
                          <SwipeProtectedSlider
                            min={CAPTION_STROKE_WIDTH_MIN}
                            max={CAPTION_STROKE_WIDTH_MAX}
                            step={CAPTION_STROKE_WIDTH_STEP}
                            value={clampCaptionStrokeWidth(settings.strokeWidth)}
                            onChange={(value) => onSetStrokeWidth(clampCaptionStrokeWidth(value))}
                            disabled={isLocked}
                            ariaLabel="キャプションの縁の幅"
                            className={`min-w-0 flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${isLocked ? '' : 'cursor-pointer'}`}
                          />
                          <input
                            id="caption-stroke-width"
                            type="number"
                            min={CAPTION_STROKE_WIDTH_MIN}
                            max={CAPTION_STROKE_WIDTH_MAX}
                            step={CAPTION_STROKE_WIDTH_STEP}
                            value={clampCaptionStrokeWidth(settings.strokeWidth)}
                            onChange={(event) => {
                              const value = Number.parseFloat(event.target.value);
                              if (Number.isFinite(value))
                                onSetStrokeWidth(clampCaptionStrokeWidth(value));
                            }}
                            disabled={isLocked}
                            aria-label="キャプションの縁の幅（数値）"
                            className="w-14 rounded-md border border-gray-600 bg-gray-700 px-1.5 py-1 text-right focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500/40 disabled:opacity-50"
                          />
                          <span className="text-gray-500">px</span>
                        </div>
                        <CaptionColorField
                          label="縁の色"
                          value={settings.strokeColor}
                          fallback="#000000"
                          disabled={isLocked}
                          onChange={onSetStrokeColor}
                        />
                        <CaptionColorField
                          label="文字本体"
                          value={settings.fontColor}
                          fallback="#FFFFFF"
                          disabled={isLocked}
                          onChange={onSetFontColor}
                        />
                        <p className="pl-[4.5rem] text-[9px] leading-relaxed text-gray-500">
                          色見本を押すか、#RRGGBB 形式で直接入力できます。
                        </p>
                      </div>
                    )}
                  </div>
                  {/* 位置: プリセット + カスタム XY（standard のみ） */}
                  <div className="flex items-center gap-2 text-[10px] md:text-xs">
                    <span className="text-gray-400 w-16">位置:</span>
                    <div className="flex gap-1 flex-1">
                      {positionOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            onSetPositionCustom(null);
                            onSetPosition(opt.value);
                          }}
                          disabled={isLocked}
                          className={`flex-1 max-w-[4rem] py-1 rounded transition ${
                            !isCustomPosition && settings.position === opt.value
                              ? 'bg-yellow-500 text-gray-900'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          } disabled:opacity-50`}
                        >
                          {opt.label}
                        </button>
                      ))}
                      {supportsExtendedFonts && (
                        <button
                          onClick={() => {
                            if (!isCustomPosition) {
                              onSetPositionCustom({ ...CAPTION_POSITION_CUSTOM_DEFAULT });
                            }
                          }}
                          disabled={isLocked}
                          className={`flex-1 max-w-[4.5rem] py-1 rounded transition ${
                            isCustomPosition
                              ? 'bg-yellow-500 text-gray-900'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          } disabled:opacity-50`}
                          title="XY 座標で自由に配置"
                        >
                          カスタム
                        </button>
                      )}
                    </div>
                  </div>
                  {/* カスタム位置入力（キャンバスに対する % / テキスト中心） */}
                  {supportsExtendedFonts && isCustomPosition && (
                    <div className="space-y-1.5 pl-16">
                      <div className="flex items-center gap-2 text-[10px] md:text-xs">
                        <span className="text-gray-500 w-4">X</span>
                        <SwipeProtectedSlider
                          min={0}
                          max={100}
                          step={1}
                          value={customPosition.x}
                          onChange={(val) =>
                            onSetPositionCustom({ ...customPosition, x: clampPositionPercent(val) })
                          }
                          disabled={isLocked}
                          className={`flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${isLocked ? '' : 'cursor-pointer'}`}
                        />
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={Math.round(customPosition.x)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!Number.isNaN(val))
                              onSetPositionCustom({
                                ...customPosition,
                                x: clampPositionPercent(val),
                              });
                          }}
                          disabled={isLocked}
                          className="w-14 bg-gray-700 border border-gray-600 rounded px-1 text-right focus:outline-none focus:border-yellow-500 disabled:opacity-50"
                        />
                        <span className="text-gray-500">%</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] md:text-xs">
                        <span className="text-gray-500 w-4">Y</span>
                        <SwipeProtectedSlider
                          min={0}
                          max={100}
                          step={1}
                          value={customPosition.y}
                          onChange={(val) =>
                            onSetPositionCustom({ ...customPosition, y: clampPositionPercent(val) })
                          }
                          disabled={isLocked}
                          className={`flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 ${isLocked ? '' : 'cursor-pointer'}`}
                        />
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={Math.round(customPosition.y)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!Number.isNaN(val))
                              onSetPositionCustom({
                                ...customPosition,
                                y: clampPositionPercent(val),
                              });
                          }}
                          disabled={isLocked}
                          className="w-14 bg-gray-700 border border-gray-600 rounded px-1 text-right focus:outline-none focus:border-yellow-500 disabled:opacity-50"
                        />
                        <span className="text-gray-500">%</span>
                      </div>
                      <div className="text-[9px] text-gray-500">
                        X=50 が中央、Y=0 が最上部（テキスト中心の位置）
                      </div>
                    </div>
                  )}
                  {/* ぼかし */}
                  <div className="flex items-center gap-2 text-[10px] md:text-xs">
                    <span className="text-gray-400 w-16">ぼかし:</span>
                    <SwipeProtectedSlider
                      min={0}
                      max={50}
                      step={1}
                      value={settings.blur * 10}
                      onChange={(val) => onSetBlur(val / 10)}
                      disabled={isLocked}
                      className={`flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 disabled:cursor-default disabled:bg-gray-800 disabled:accent-gray-700 ${isLocked ? '' : 'cursor-pointer'}`}
                    />
                    <span
                      className={`w-8 text-right whitespace-nowrap ${isLocked ? 'text-gray-600' : 'text-gray-400'}`}
                    >
                      {settings.blur.toFixed(1)}
                    </span>
                  </div>
                </div>
                {/* ■ フェード一括設定 */}
                <div className="space-y-2 pt-2 border-t border-gray-700/50">
                  <div className="text-[10px] md:text-xs text-yellow-400 font-bold">
                    ■ フェード一括設定（個別ON優先）
                  </div>
                  {/* フェード設定 - 1行表示 */}
                  {/* フェード一括設定 - レイアウト改善 */}
                  <div className="flex flex-col gap-2 mt-2 text-[10px] md:text-xs">
                    {/* フェードイン */}
                    <div className="flex items-center gap-2">
                      <label
                        className={`flex items-center gap-1 w-24 justify-start ${isLocked ? 'opacity-50' : 'cursor-pointer'}`}
                      >
                        <input
                          type="checkbox"
                          checked={settings.bulkFadeIn}
                          onChange={(e) => onSetBulkFadeIn(e.target.checked)}
                          disabled={isLocked}
                          className="accent-yellow-500 rounded cursor-pointer disabled:opacity-50 disabled:cursor-default"
                        />
                        <span className="whitespace-nowrap">フェードイン</span>
                      </label>
                      <SwipeProtectedSlider
                        min={0}
                        max={2}
                        step={1}
                        value={
                          settings.bulkFadeInDuration === 0.5
                            ? 0
                            : settings.bulkFadeInDuration === 1.0
                              ? 1
                              : 2
                        }
                        onChange={(val) => {
                          const steps = [0.5, 1.0, 2.0];
                          onSetBulkFadeInDuration(steps[val]);
                        }}
                        disabled={isLocked || !settings.bulkFadeIn}
                        className={`flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 disabled:cursor-default disabled:bg-gray-800 disabled:accent-gray-700 ${isLocked || !settings.bulkFadeIn ? '' : 'cursor-pointer'}`}
                      />
                      <span
                        className={`w-8 text-right whitespace-nowrap ${isLocked || !settings.bulkFadeIn ? 'text-gray-600' : 'text-gray-400'}`}
                      >
                        {settings.bulkFadeInDuration}秒
                      </span>
                    </div>

                    {/* フェードアウト */}
                    <div className="flex items-center gap-2">
                      <label
                        className={`flex items-center gap-1 w-24 justify-start ${isLocked ? 'opacity-50' : 'cursor-pointer'}`}
                      >
                        <input
                          type="checkbox"
                          checked={settings.bulkFadeOut}
                          onChange={(e) => onSetBulkFadeOut(e.target.checked)}
                          disabled={isLocked}
                          className="accent-yellow-500 rounded cursor-pointer disabled:opacity-50 disabled:cursor-default"
                        />
                        <span className="whitespace-nowrap">フェードアウト</span>
                      </label>
                      <SwipeProtectedSlider
                        min={0}
                        max={2}
                        step={1}
                        value={
                          settings.bulkFadeOutDuration === 0.5
                            ? 0
                            : settings.bulkFadeOutDuration === 1.0
                              ? 1
                              : 2
                        }
                        onChange={(val) => {
                          const steps = [0.5, 1.0, 2.0];
                          onSetBulkFadeOutDuration(steps[val]);
                        }}
                        disabled={isLocked || !settings.bulkFadeOut}
                        className={`flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 disabled:cursor-default disabled:bg-gray-800 disabled:accent-gray-700 ${isLocked || !settings.bulkFadeOut ? '' : 'cursor-pointer'}`}
                      />
                      <span
                        className={`w-8 text-right whitespace-nowrap ${isLocked || !settings.bulkFadeOut ? 'text-gray-600' : 'text-gray-400'}`}
                      >
                        {settings.bulkFadeOutDuration}秒
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 入力ツール群（枠でグルーピング） */}
          <div className="space-y-2 border border-gray-700/60 rounded-xl p-2 bg-gray-900/40">
            {/* STEP フロー: ①まとめて入力 → ②タイミング打ち（standard フレーバー限定） */}
            {supportsBulkInput && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBulkModal(true)}
                  disabled={isLocked}
                  className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 border border-yellow-600/40 text-yellow-300 rounded-lg transition disabled:opacity-50"
                  title="歌詞や長い字幕を複数行まとめて追加・編集"
                >
                  <span className="flex items-center justify-center gap-1.5 text-xs md:text-sm">
                    <ListPlus className="w-3.5 h-3.5" /> ① まとめて入力
                    {captions.length > 0 ? '・編集' : ''}
                  </span>
                  <span className="block text-[9px] text-gray-500 leading-tight mt-0.5">
                    歌詞や字幕を一括で追加・編集
                  </span>
                </button>
                <button
                  onClick={() => (stampActive ? setStampActive(false) : startStampMode())}
                  disabled={isLocked || captions.length < 2}
                  className={`flex-1 py-1.5 rounded-lg transition disabled:opacity-50 ${
                    stampActive
                      ? 'bg-yellow-600 text-white'
                      : 'bg-gray-800 hover:bg-gray-700 border border-yellow-600/40 text-yellow-300'
                  }`}
                  title="再生しながらキャプションの切り替わりタイミングを確定する"
                >
                  <span className="flex items-center justify-center gap-1.5 text-xs md:text-sm">
                    <Timer className="w-3.5 h-3.5" /> ② タイミング打ち
                  </span>
                  <span
                    className={`block text-[9px] leading-tight mt-0.5 ${stampActive ? 'text-yellow-100' : 'text-gray-500'}`}
                  >
                    {captions.length < 2
                      ? 'キャプション2件以上で使用可'
                      : stampActive
                        ? 'タップで終了'
                        : '再生しながら表示タイミングを設定'}
                  </span>
                </button>
              </div>
            )}

            {/* 一括シフト（standard のみ・キャプションがあるとき）: カード基準で時間を前後にずらす */}
            {supportsBulkInput && captions.length > 0 && (
              <div className="space-y-1.5 text-[10px] md:text-xs bg-gray-800/50 rounded-lg border border-gray-700/50 px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400 shrink-0">時間をまとめてずらす:</span>
                  <select
                    value={shiftFromIndex}
                    onChange={(e) => {
                      setShiftFromIndex(Number(e.target.value));
                      setShiftAlignmentFeedback('');
                    }}
                    disabled={isLocked}
                    className="flex-1 min-w-0 bg-gray-700 text-gray-300 rounded px-1 py-1 text-[10px] md:text-xs focus:outline-none focus:ring-1 focus:ring-yellow-500 disabled:opacity-50"
                    aria-label="ずらす対象のキャプションカード"
                    title="ずらす対象のキャプションカード"
                  >
                    <option value={-1} className="bg-gray-800 text-gray-200">
                      すべてのカード
                    </option>
                    {captions.map((c, i) => (
                      <option key={c.id} value={i} className="bg-gray-800 text-gray-200">
                        [{i + 1}] {c.text.slice(0, 8)}
                        {c.text.length > 8 ? '…' : ''} 以降
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={alignShiftStartToCurrentTime}
                  disabled={isLocked || isShiftAlignmentCurrent}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-yellow-500/50 bg-yellow-600/15 px-2 py-2 font-medium text-yellow-200 transition hover:bg-yellow-600/25 focus:outline-none focus:ring-2 focus:ring-yellow-500/70 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800/60 disabled:text-gray-500 disabled:opacity-70"
                  aria-describedby="caption-shift-alignment-status"
                  title="対象範囲の最初のキャプションをプレビューの現在位置へ移動"
                >
                  <Crosshair className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  現在位置（{formatShiftPosition(shiftAlignmentTarget)}）に先頭を合わせる
                </button>
                <p
                  id="caption-shift-alignment-status"
                  className="min-h-4 text-[9px] leading-4 text-gray-500 md:text-[10px]"
                  aria-live="polite"
                >
                  {shiftAlignmentFeedback ||
                    (isShiftAlignmentCurrent
                      ? '対象の先頭は、すでにプレビューの現在位置に合っています。'
                      : `対象の先頭 ${formatShiftPosition(shiftAnchorCaption?.startTime ?? 0)} → ${formatShiftPosition(shiftAlignmentTarget)}（${formatSignedShift(shiftAlignmentDelta)}）`)}
                </p>
                <div className="flex items-center gap-1.5 border-t border-gray-700/60 pt-1.5">
                  <span className="shrink-0 text-gray-500">秒数で微調整:</span>
                  <button
                    onPointerDown={() => !isLocked && startShiftHold(-1)}
                    onPointerUp={stopShiftHold}
                    onPointerLeave={stopShiftHold}
                    onPointerCancel={stopShiftHold}
                    onContextMenu={(e) => e.preventDefault()}
                    disabled={isLocked}
                    className="w-7 h-7 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 flex items-center justify-center transition disabled:opacity-50 select-none"
                    aria-label="ずらす秒数を減らす（長押しで加速）"
                    title="長押しで早く減ります"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <input
                    type="number"
                    min={0.1}
                    max={600}
                    step={0.5}
                    value={shiftAmount}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!Number.isNaN(val)) {
                        setShiftAmount(Math.max(0.1, Math.min(600, Math.round(val * 10) / 10)));
                      }
                    }}
                    disabled={isLocked}
                    className="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-center font-mono focus:outline-none focus:border-yellow-500 disabled:opacity-50"
                  />
                  <span className="text-gray-500 shrink-0">秒</span>
                  <button
                    onPointerDown={() => !isLocked && startShiftHold(1)}
                    onPointerUp={stopShiftHold}
                    onPointerLeave={stopShiftHold}
                    onPointerCancel={stopShiftHold}
                    onContextMenu={(e) => e.preventDefault()}
                    disabled={isLocked}
                    className="w-7 h-7 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 flex items-center justify-center transition disabled:opacity-50 select-none"
                    aria-label="ずらす秒数を増やす（長押しで加速）"
                    title="長押しで早く増えます"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => applyShift(-1)}
                    disabled={isLocked}
                    className="flex-1 px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition disabled:opacity-50"
                    title="対象カードの時間を早める（前へ移動）"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 inline" />
                    早める
                  </button>
                  <button
                    onClick={() => applyShift(1)}
                    disabled={isLocked}
                    className="flex-1 px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition disabled:opacity-50"
                    title="対象カードの時間を遅らせる（後ろへ移動）"
                  >
                    遅らせる
                    <ChevronRight className="w-3.5 h-3.5 inline" />
                  </button>
                </div>
              </div>
            )}

            {/* 新規キャプション追加 */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCaption();
                }}
                placeholder="キャプションテキストを入力..."
                disabled={isLocked}
                className="flex-1 h-9 md:h-10 bg-gray-800 border border-gray-700 rounded-lg px-3 text-sm md:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 disabled:opacity-50"
              />
              <button
                onClick={handleAddCaption}
                disabled={isLocked || !newText.trim()}
                className="h-9 md:h-10 bg-yellow-600 hover:bg-yellow-500 text-white px-3 lg:px-4 rounded-lg text-xs md:text-sm font-semibold whitespace-nowrap flex items-center gap-1 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-3 h-3" /> 追加
              </button>
            </div>
          </div>

          {/* キャプション一覧 */}
          <div className="space-y-2 min-h-14 lg:min-h-[4.5rem] max-h-80 lg:max-h-[26rem] overflow-y-auto custom-scrollbar">
            {captions.length === 0 ? (
              <div className="text-center py-2 lg:py-2.5 min-h-12 lg:min-h-14 text-gray-600 text-xs md:text-sm border-2 border-dashed border-gray-800 rounded flex items-center justify-center">
                キャプションがありません
              </div>
            ) : (
              captions.map((caption, index) => (
                <CaptionItem
                  key={caption.id}
                  caption={caption}
                  settings={settings}
                  index={index}
                  totalCaptions={captions.length}
                  totalDuration={totalDuration}
                  currentTime={currentTime}
                  isLocked={isLocked}
                  onUpdate={onUpdateCaption}
                  onRemove={onRemoveCaption}
                  onMove={onMoveCaption}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* 一括入力/編集モーダル */}
      {showBulkModal && (
        <CaptionBulkAddModal
          captions={captions}
          totalDuration={totalDuration}
          currentTime={currentTime}
          formatTime={formatTime}
          onApplyCaptions={onApplyCaptions}
          onClose={() => setShowBulkModal(false)}
        />
      )}

      {/* タイミング打ちバー v2（画面下部固定・動画を見ながら押せる） */}
      {stampActive && stampTarget && (
        <div className="fixed bottom-0 inset-x-0 z-[250] bg-gray-900/95 border-t border-yellow-600/40 backdrop-blur px-3 py-2 shadow-2xl">
          <div className="max-w-3xl mx-auto space-y-1.5">
            {/* 情報行: 対象ナビ + 再生位置 + 終了 */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => moveStampTarget(-1)}
                disabled={stampIndex === 0}
                className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-30 transition"
                title="前のキャプションへ"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0 flex-1 text-center">
                <div className="text-[10px] text-yellow-400">
                  {stampIndex + 1}/{captions.length}（再生位置: {formatTime(currentTime)}）
                </div>
                <div className="text-xs md:text-sm text-gray-200 truncate">
                  「{stampTarget.text}」の
                  <span className="text-yellow-300">
                    {stampPhase === 'end' ? '終わり' : '始まり'}
                  </span>
                  で押す
                </div>
              </div>
              <button
                onClick={() => moveStampTarget(1)}
                disabled={stampIndex >= captions.length - 1}
                className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-30 transition"
                title="次のキャプションへ"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setStampActive(false)}
                className="p-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition"
                title="タイミング打ちを終了"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* モード切替 + 間隔（連続時）+ プレビュー微調整（1秒戻る/再生・一時停止/1秒進む） */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex rounded-lg overflow-hidden border border-gray-700 shrink-0 text-[10px] md:text-xs">
                <button
                  onClick={() => switchStampMode('alternate')}
                  className={`px-2 py-1.5 transition ${stampMode === 'alternate' ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
                  title="交互モード: ワンボタンで 開始→終了→開始… と確定（間のある歌詞・説明向け）"
                >
                  交互
                </button>
                <button
                  onClick={() => switchStampMode('chain')}
                  className={`px-2 py-1.5 transition ${stampMode === 'chain' ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
                  title="連続モード: 終了＝次の開始を同時に確定（間隔設定可）"
                >
                  連続
                </button>
              </div>
              {/* 間隔（連続モードのみ・モード切替の右横）。カスタム入力欄は常時確保して幅が変わらないようにする */}
              {stampMode === 'chain' && (
                <div className="flex items-center gap-1 ml-1.5 text-[10px] md:text-xs shrink-0">
                  <span className="text-gray-400">間隔:</span>
                  <button
                    onClick={() => {
                      setIsStampGapCustom(false);
                      setStampGapSec(0);
                    }}
                    className={`px-2 py-1 rounded transition ${!isStampGapCustom && stampGapSec === 0 ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
                  >
                    なし
                  </button>
                  <button
                    onClick={() => {
                      setIsStampGapCustom(false);
                      setStampGapSec(0.2);
                    }}
                    className={`px-2 py-1 rounded transition ${!isStampGapCustom && stampGapSec === 0.2 ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
                  >
                    200ms
                  </button>
                  <button
                    onClick={() => setIsStampGapCustom(true)}
                    className={`px-2 py-1 rounded transition ${isStampGapCustom ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
                  >
                    カスタム
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={stampGapSec}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!Number.isNaN(val))
                        setStampGapSec(Math.max(0, Math.min(10, Math.round(val * 10) / 10)));
                    }}
                    disabled={!isStampGapCustom}
                    className="w-14 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-center focus:outline-none focus:border-yellow-500 disabled:opacity-40"
                    title="カスタム間隔（秒）"
                  />
                  <span className={isStampGapCustom ? 'text-gray-500' : 'text-gray-600'}>秒</span>
                </div>
              )}
              <div className="flex-1" />
              <button
                onClick={() => onSeekBy(-1)}
                className="h-9 px-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-[10px] md:text-xs font-mono transition"
                title="1秒戻る"
              >
                -1s
              </button>
              <button
                onClick={onTogglePlay}
                className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur text-white flex items-center justify-center transition-transform active:scale-95"
                title={isPlaying ? '一時停止' : '再生'}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>
              <button
                onClick={() => onSeekBy(1)}
                className="h-9 px-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-[10px] md:text-xs font-mono transition"
                title="1秒進む"
              >
                +1s
              </button>
            </div>
            {/* 操作行: モードごとのボタン */}
            {stampMode === 'alternate' ? (
              <div className="flex gap-2">
                <button
                  onClick={handleStampAlternate}
                  className={`flex-1 h-11 text-white rounded-xl text-sm md:text-base font-bold transition ${
                    stampPhase === 'start'
                      ? 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400'
                      : 'bg-yellow-600 hover:bg-yellow-500 active:bg-yellow-400'
                  }`}
                  title={
                    stampPhase === 'start'
                      ? 'このキャプションの開始位置を現在の再生位置に確定'
                      : 'このキャプションの終了位置を現在の再生位置に確定'
                  }
                >
                  {stampPhase === 'start' ? '▶ ここから開始' : '⏹ ここで終了'}
                </button>
                <button
                  onClick={() => setStampPhase((prev) => (prev === 'start' ? 'end' : 'start'))}
                  className="h-11 px-3 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-xl transition"
                  title="開始/終了を切り替える（打ち直したいとき: -1s で戻って切り替えてもう一度押す）"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleStampChain}
                className="w-full h-11 bg-yellow-600 hover:bg-yellow-500 active:bg-yellow-400 text-white rounded-xl text-sm md:text-base font-bold transition"
                title="終了と次の開始を同時に確定（間を空けない）"
              >
                ⏭ 区切って次へ
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default React.memo(CaptionSection);
