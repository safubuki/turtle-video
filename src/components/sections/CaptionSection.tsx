/**
 * @file CaptionSection.tsx
 * @author Turtle Village
 * @description テキストキャプションの追加、編集、削除を行うセクション。タイムライン上での表示タイミングやスタイル（サイズ、位置）の設定UIを提供する。
 */
import React, { useMemo, useState } from 'react';
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
} from 'lucide-react';
import type { Caption, CaptionSettings, CaptionPosition, CaptionSize, CaptionFontStyle } from '../../types';
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
  clampCustomFontSize,
  clampPositionPercent,
} from '../../utils/captionStyle';
import CaptionBulkAddModal, { type BulkCaptionApplyItem } from '../modals/CaptionBulkAddModal';

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
  /** キャプションの一括時間シフト（fromTime 以降を deltaSec ずらす） */
  onShiftCaptions: (deltaSec: number, fromTime?: number) => void;
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
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [showStyleSettings, setShowStyleSettings] = useState(false);
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
  const isPinnedFontSelected = availablePinnedFonts.some((o) => o.value === settings.fontStyle)
    || BASIC_CAPTION_FONT_OPTIONS.some((o) => o.value === settings.fontStyle);
  const isDropdownFontSelected = !isPinnedFontSelected && isExtendedCaptionFontStyle(settings.fontStyle);
  const dropdownFontValue = isDropdownFontSelected ? settings.fontStyle : '';
  // 復元データ等で「選択中だが一覧に無い」値も表示できるよう補完する
  const dropdownHasSelected = !dropdownFontValue
    || availableDropdownFonts.some((o) => o.value === dropdownFontValue)
    || (selectedLocalFamily !== null && localFontFamilies.includes(selectedLocalFamily));

  // カスタムサイズ/位置（standard 限定）
  const isCustomFontSize = settings.fontSizeCustom != null;
  const isCustomPosition = settings.positionCustom != null;
  const customPosition = settings.positionCustom ?? CAPTION_POSITION_CUSTOM_DEFAULT;

  // === 一括シフト（映像の差し込み/削除後の時間調整） ===
  const [shiftAmount, setShiftAmount] = useState(1.0);
  const [shiftScope, setShiftScope] = useState<'all' | 'after'>('all');
  const applyShift = (direction: 1 | -1) => {
    const delta = Math.abs(shiftAmount) * direction;
    if (delta === 0) return;
    onShiftCaptions(delta, shiftScope === 'after' ? currentTime : 0);
  };

  // === タイミング打ち v2 ===
  // フェーズ: 'end' = 対象の終わりを待っている / 'start' = 対象の始まりを待っている
  const [stampActive, setStampActive] = useState(false);
  const [stampIndex, setStampIndex] = useState(0);
  const [stampPhase, setStampPhase] = useState<'end' | 'start'>('end');
  const stampTarget = stampActive ? captions[stampIndex] : undefined;

  // 現在のプレビュー位置にかかっている（または直後の）キャプションから開始する
  const startStampMode = () => {
    const idx = captions.findIndex((c) => c.endTime > currentTime + 0.05);
    setStampIndex(idx >= 0 ? idx : Math.max(0, captions.length - 1));
    setStampPhase('end');
    setStampActive(true);
  };

  const moveStampTarget = (delta: number) => {
    setStampIndex((prev) => Math.max(0, Math.min(captions.length - 1, prev + delta)));
    setStampPhase('end');
  };

  const stampNow = () => Math.round(currentTime * 10) / 10;

  // 「区切って次へ」: 終了＝次の開始を同時に確定（間なし）
  const handleStampSplit = () => {
    const target = captions[stampIndex];
    if (!target) {
      setStampActive(false);
      return;
    }
    if (currentTime <= target.startTime + 0.1) return; // 開始より前では区切れない
    const at = stampNow();
    onUpdateCaptionLive(target.id, {
      endTime: totalDuration > 0 ? Math.min(at, totalDuration) : at,
    });
    const next = captions[stampIndex + 1];
    if (next) {
      onUpdateCaptionLive(next.id, { startTime: at });
      setStampIndex(stampIndex + 1);
      setStampPhase('end');
    } else {
      setStampActive(false);
    }
  };

  // 「終了だけ」: 終了のみ確定し、次のキャプションの開始待ちへ（間を空けたいとき）
  const handleStampEndOnly = () => {
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
    if (captions[stampIndex + 1]) {
      setStampIndex(stampIndex + 1);
      setStampPhase('start');
    } else {
      setStampActive(false);
    }
  };

  // 「ここから開始」: 対象の開始を確定して終了待ちへ
  const handleStampStart = () => {
    const target = captions[stampIndex];
    if (!target) {
      setStampActive(false);
      return;
    }
    if (currentTime >= target.endTime - 0.1) return; // 終了より後には開始を置けない
    onUpdateCaptionLive(target.id, { startTime: stampNow() });
    setStampPhase('end');
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
            className={`p-1.5 rounded-lg transition ${settings.enabled
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
            className={`p-1.5 rounded-lg transition ${isLocked
              ? 'bg-red-500/20 text-red-400'
              : 'bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600'
              }`}
            title={isLocked ? 'ロック解除' : 'ロック'}
            aria-label={isLocked ? 'キャプションセクションのロックを解除' : 'キャプションセクションをロック'}
          >
            {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* コンテンツ */}
      {isOpen && (
        <div className="p-3 lg:p-4 space-y-3">
          {/* スタイル/フェード一括設定 */}
          <div className="bg-gray-800/50 rounded-lg border border-gray-700/50">
            <button
              onClick={() => setShowStyleSettings(!showStyleSettings)}
              className="w-full p-2 flex items-center justify-between text-xs md:text-sm text-gray-400 hover:text-white transition"
            >
              <div className="flex items-center gap-2">
                <Type className="w-3 h-3" />
                <span>スタイル/フェード一括設定</span>
              </div>
              {showStyleSettings ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
            {showStyleSettings && (
              <div className="px-3 pb-3 space-y-3">
                {/* ■ スタイル設定 */}
                <div className="space-y-2">
                  <div className="text-[10px] md:text-xs text-yellow-400 font-bold">■ スタイル設定</div>
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
                          className={`flex-1 max-w-[4rem] py-1 rounded transition ${!isCustomFontSize && settings.fontSize === opt.value
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
                          className={`flex-1 max-w-[4.5rem] py-1 rounded transition ${isCustomFontSize
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
                        value={Math.round(settings.fontSizeCustom ?? CAPTION_FONT_SIZE_PRESETS.medium)}
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
                          className={`flex-1 min-w-0 px-0.5 py-1 rounded transition whitespace-nowrap ${settings.fontStyle === opt.value
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
                          className={`flex-1 min-w-0 max-w-[7.5rem] py-1 px-1 rounded transition text-[10px] md:text-xs bg-gray-700 focus:outline-none focus:ring-1 focus:ring-yellow-500 disabled:opacity-50 ${dropdownFontValue
                            ? 'text-yellow-300 ring-1 ring-yellow-500/70 font-semibold'
                            : 'text-gray-300 hover:bg-gray-600'
                            }`}
                          title="その他のシステムフォントから選ぶ（端末に実在するもののみ表示）"
                        >
                          <option value="" disabled>
                            その他▾
                          </option>
                          {availableDropdownFonts.map((opt) => (
                            <option key={opt.value} value={opt.value} style={{ fontFamily: opt.family }}>
                              {opt.label}
                            </option>
                          ))}
                          {localFontFamilies.length > 0 && (
                            <optgroup label="端末のフォント">
                              {localFontFamilies.map((family) => (
                                <option
                                  key={family}
                                  value={createLocalFontValue(family)}
                                  style={{ fontFamily: family }}
                                >
                                  {family}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {!dropdownHasSelected && (
                            <option value={dropdownFontValue} style={{ fontFamily: resolveCaptionFontFamily(dropdownFontValue) }}>
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
                        {localFontsLoading ? '読み込み中…' : '＋ この端末の全フォントから選ぶ（PC）'}
                      </button>
                    </div>
                  )}
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
                          className={`flex-1 max-w-[4rem] py-1 rounded transition ${!isCustomPosition && settings.position === opt.value
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
                          className={`flex-1 max-w-[4.5rem] py-1 rounded transition ${isCustomPosition
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
                          onChange={(val) => onSetPositionCustom({ ...customPosition, x: clampPositionPercent(val) })}
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
                            if (!Number.isNaN(val)) onSetPositionCustom({ ...customPosition, x: clampPositionPercent(val) });
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
                          onChange={(val) => onSetPositionCustom({ ...customPosition, y: clampPositionPercent(val) })}
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
                            if (!Number.isNaN(val)) onSetPositionCustom({ ...customPosition, y: clampPositionPercent(val) });
                          }}
                          disabled={isLocked}
                          className="w-14 bg-gray-700 border border-gray-600 rounded px-1 text-right focus:outline-none focus:border-yellow-500 disabled:opacity-50"
                        />
                        <span className="text-gray-500">%</span>
                      </div>
                      <div className="text-[9px] text-gray-500">X=50 が中央、Y=0 が最上部（テキスト中心の位置）</div>
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
                    <span className={`w-8 text-right whitespace-nowrap ${isLocked ? 'text-gray-600' : 'text-gray-400'}`}>{settings.blur.toFixed(1)}</span>
                  </div>
                </div>
                {/* ■ フェード一括設定 */}
                <div className="space-y-2 pt-2 border-t border-gray-700/50">
                  <div className="text-[10px] md:text-xs text-yellow-400 font-bold">■ フェード一括設定（個別ON優先）</div>
                  {/* フェード設定 - 1行表示 */}
                  {/* フェード一括設定 - レイアウト改善 */}
                  <div className="flex flex-col gap-2 mt-2 text-[10px] md:text-xs">
                    {/* フェードイン */}
                    <div className="flex items-center gap-2">
                      <label className={`flex items-center gap-1 w-24 justify-start ${isLocked ? 'opacity-50' : 'cursor-pointer'}`}>
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
                        value={settings.bulkFadeInDuration === 0.5 ? 0 : settings.bulkFadeInDuration === 1.0 ? 1 : 2}
                        onChange={(val) => {
                          const steps = [0.5, 1.0, 2.0];
                          onSetBulkFadeInDuration(steps[val]);
                        }}
                        disabled={isLocked || !settings.bulkFadeIn}
                        className={`flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 disabled:cursor-default disabled:bg-gray-800 disabled:accent-gray-700 ${isLocked || !settings.bulkFadeIn ? '' : 'cursor-pointer'}`}
                      />
                      <span className={`w-8 text-right whitespace-nowrap ${isLocked || !settings.bulkFadeIn ? 'text-gray-600' : 'text-gray-400'}`}>{settings.bulkFadeInDuration}秒</span>
                    </div>

                    {/* フェードアウト */}
                    <div className="flex items-center gap-2">
                      <label className={`flex items-center gap-1 w-24 justify-start ${isLocked ? 'opacity-50' : 'cursor-pointer'}`}>
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
                        value={settings.bulkFadeOutDuration === 0.5 ? 0 : settings.bulkFadeOutDuration === 1.0 ? 1 : 2}
                        onChange={(val) => {
                          const steps = [0.5, 1.0, 2.0];
                          onSetBulkFadeOutDuration(steps[val]);
                        }}
                        disabled={isLocked || !settings.bulkFadeOut}
                        className={`flex-1 accent-yellow-500 h-1 bg-gray-600 rounded appearance-none disabled:opacity-50 disabled:cursor-default disabled:bg-gray-800 disabled:accent-gray-700 ${isLocked || !settings.bulkFadeOut ? '' : 'cursor-pointer'}`}
                      />
                      <span className={`w-8 text-right whitespace-nowrap ${isLocked || !settings.bulkFadeOut ? 'text-gray-600' : 'text-gray-400'}`}>{settings.bulkFadeOutDuration}秒</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

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
                  <ListPlus className="w-3.5 h-3.5" /> ① まとめて入力{captions.length > 0 ? '・編集' : ''}
                </span>
                <span className="block text-[9px] text-gray-500 leading-tight mt-0.5">
                  歌詞や字幕を一括で追加・編集
                </span>
              </button>
              <button
                onClick={() => (stampActive ? setStampActive(false) : startStampMode())}
                disabled={isLocked || captions.length < 2}
                className={`flex-1 py-1.5 rounded-lg transition disabled:opacity-50 ${stampActive
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 border border-yellow-600/40 text-yellow-300'
                  }`}
                title="再生しながらキャプションの切り替わりタイミングを確定する"
              >
                <span className="flex items-center justify-center gap-1.5 text-xs md:text-sm">
                  <Timer className="w-3.5 h-3.5" /> ② タイミング打ち
                </span>
                <span className={`block text-[9px] leading-tight mt-0.5 ${stampActive ? 'text-yellow-100' : 'text-gray-500'}`}>
                  {captions.length < 2 ? 'キャプション2件以上で使用可' : stampActive ? 'タップで終了' : '再生しながら切り替えを確定'}
                </span>
              </button>
            </div>
          )}

          {/* 一括シフト（standard のみ・キャプションがあるとき） */}
          {supportsBulkInput && captions.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] md:text-xs bg-gray-800/50 rounded-lg border border-gray-700/50 px-2 py-1.5">
              <span className="text-gray-400 shrink-0">まとめてずらす:</span>
              <select
                value={shiftScope}
                onChange={(e) => setShiftScope(e.target.value as 'all' | 'after')}
                disabled={isLocked}
                className="bg-gray-700 text-gray-300 rounded px-1 py-1 text-[10px] md:text-xs focus:outline-none focus:ring-1 focus:ring-yellow-500 disabled:opacity-50"
                title="ずらす対象"
              >
                <option value="all">全部</option>
                <option value="after">現在位置以降</option>
              </select>
              <input
                type="number"
                min={0.1}
                max={600}
                step={0.5}
                value={shiftAmount}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!Number.isNaN(val)) setShiftAmount(Math.max(0.1, Math.min(600, Math.abs(val))));
                }}
                disabled={isLocked}
                className="w-12 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-right focus:outline-none focus:border-yellow-500 disabled:opacity-50"
              />
              <span className="text-gray-500 shrink-0">秒</span>
              <button
                onClick={() => applyShift(-1)}
                disabled={isLocked}
                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition disabled:opacity-50"
                title={`${shiftScope === 'after' ? '現在位置以降' : '全部'}のキャプションを ${shiftAmount} 秒早める`}
              >
                <ChevronLeft className="w-3.5 h-3.5 inline" />早める
              </button>
              <button
                onClick={() => applyShift(1)}
                disabled={isLocked}
                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition disabled:opacity-50"
                title={`${shiftScope === 'after' ? '現在位置以降' : '全部'}のキャプションを ${shiftAmount} 秒遅らせる`}
              >
                遅らせる<ChevronRight className="w-3.5 h-3.5 inline" />
              </button>
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

          {/* キャプション一覧 */}
          <div className="space-y-2 min-h-14 lg:min-h-[4.5rem] max-h-44 lg:max-h-[15rem] overflow-y-auto custom-scrollbar">
            {captions.length === 0 ? (
              <div className="text-center py-2 lg:py-2.5 min-h-12 lg:min-h-14 text-gray-600 text-xs md:text-sm border-2 border-dashed border-gray-800 rounded flex items-center justify-center">
                キャプションがありません
              </div>
            ) : (
              captions.map((caption, index) => (
                <CaptionItem
                  key={caption.id}
                  caption={caption}
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
                  <span className="text-yellow-300">{stampPhase === 'end' ? '終わり' : '始まり'}</span>
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
            {/* 操作行: フェーズごとのボタン */}
            {stampPhase === 'end' ? (
              <div className="flex gap-2">
                <button
                  onClick={handleStampSplit}
                  className="flex-1 h-11 bg-yellow-600 hover:bg-yellow-500 active:bg-yellow-400 text-white rounded-xl text-sm md:text-base font-bold transition"
                  title="終了と次の開始を同時に確定（間を空けない）"
                >
                  ⏭ 区切って次へ
                </button>
                <button
                  onClick={handleStampEndOnly}
                  className="h-11 px-3 md:px-5 bg-gray-700 hover:bg-gray-600 text-gray-100 rounded-xl text-xs md:text-sm font-semibold transition"
                  title="終了だけ確定し、次の開始は別のタイミングで押す（間を空ける）"
                >
                  ∥ 終了だけ
                </button>
              </div>
            ) : (
              <button
                onClick={handleStampStart}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 text-white rounded-xl text-sm md:text-base font-bold transition"
                title="このキャプションの開始位置を現在の再生位置に確定"
              >
                ▶ ここから開始
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default React.memo(CaptionSection);
