/**
 * @file SectionHelpModal.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description セクション別の操作ヘルプを表示するモーダル（モバイルはボトムシート表示）。
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  CircleHelp,
  X,
  Upload,
  Sparkles,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit2,
  Save,
  Timer,
  Volume2,
  VolumeX,
  RefreshCw,
  MapPin,
  Settings,
  Square,
  Play,
  Camera,
  RotateCcw,
  Download,
  Check,
  Type,
  Plus,
  Move,
  ZoomIn,
  Copy,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  ListPlus,
  Crosshair,
  Captions,
  ArrowDownUp,
  RectangleHorizontal,
  RectangleVertical,
  RotateCw,
  Image as ImageIcon,
  ChevronsLeft,
  ChevronsRight,
  AudioLines,
  Scissors,
  FolderOpen,
  Split,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Minus,
} from 'lucide-react';
import { useDisableBodyScroll } from '../../hooks/useDisableBodyScroll';
import {
  getSectionHelpContent,
  type SectionHelpKey,
  type SectionHelpVisualId,
  type SectionHelpItem,
} from '../../constants/sectionHelp';
import type { AppFlavor } from '../../app/resolveAppFlavor';

interface SectionHelpModalProps {
  appFlavor: AppFlavor;
  supportsShowSaveFilePicker: boolean;
  isOpen: boolean;
  section: SectionHelpKey | null;
  onClose: () => void;
}

const sectionAccentClass: Record<SectionHelpKey, string> = {
  app: 'text-emerald-300 border-emerald-500/35 bg-emerald-500/10',
  clips: 'text-blue-300 border-blue-500/35 bg-blue-500/10',
  bgm: 'text-purple-300 border-purple-500/35 bg-purple-500/10',
  narration: 'text-indigo-300 border-indigo-500/35 bg-indigo-500/10',
  caption: 'text-yellow-300 border-yellow-500/35 bg-yellow-500/10',
  preview: 'text-green-300 border-green-500/35 bg-green-500/10',
};

/**
 * セクションヘルプモーダル
 */
const SectionHelpModal: React.FC<SectionHelpModalProps> = ({
  appFlavor,
  supportsShowSaveFilePicker,
  isOpen,
  section,
  onClose,
}) => {
  useDisableBodyScroll(isOpen);
  const [demoSliderValue, setDemoSliderValue] = useState(24);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const historyStateIdRef = useRef<string | null>(null);
  const closedByPopstateRef = useRef(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartScrollTopRef = useRef(0);
  const touchDeltaYRef = useRef(0);
  const swipeCloseEligibleRef = useRef(false);

  const isMobileViewport = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    let value = 24;
    let direction = 1;
    const timer = setInterval(() => {
      value += direction * 12;
      if (value >= 82) {
        value = 82;
        direction = -1;
      } else if (value <= 18) {
        value = 18;
        direction = 1;
      }
      setDemoSliderValue(value);
    }, 520);
    return () => clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const stateId = `section-help-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    historyStateIdRef.current = stateId;
    closedByPopstateRef.current = false;

    const currentState =
      window.history.state && typeof window.history.state === 'object'
        ? (window.history.state as Record<string, unknown>)
        : {};
    window.history.pushState({ ...currentState, __sectionHelpModal: stateId }, '');

    const handlePopState = () => {
      closedByPopstateRef.current = true;
      onClose();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);

      const current =
        window.history.state && typeof window.history.state === 'object'
          ? (window.history.state as Record<string, unknown>)
          : null;
      const ownStateOnTop = Boolean(
        historyStateIdRef.current &&
        current &&
        current.__sectionHelpModal === historyStateIdRef.current
      );

      if (!closedByPopstateRef.current && ownStateOnTop) {
        window.history.back();
      }

      historyStateIdRef.current = null;
      closedByPopstateRef.current = false;
    };
  }, [isOpen, onClose]);

  const resetTouchTracking = () => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    touchStartScrollTopRef.current = 0;
    touchDeltaYRef.current = 0;
    swipeCloseEligibleRef.current = false;
  };

  const handleSheetTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobileViewport() || event.touches.length !== 1) {
      resetTouchTracking();
      return;
    }

    const touchedInsideScrollableContent = Boolean(
      contentScrollRef.current && contentScrollRef.current.contains(event.target as Node)
    );
    if (touchedInsideScrollableContent) {
      resetTouchTracking();
      return;
    }

    const touch = event.touches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    touchDeltaYRef.current = 0;
    touchStartScrollTopRef.current = contentScrollRef.current?.scrollTop ?? 0;
    swipeCloseEligibleRef.current = touchStartScrollTopRef.current <= 0;
  };

  const handleSheetTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (
      !swipeCloseEligibleRef.current ||
      touchStartXRef.current === null ||
      touchStartYRef.current === null ||
      event.touches.length !== 1
    ) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaY = touch.clientY - touchStartYRef.current;
    touchDeltaYRef.current = deltaY;

    const atTop = (contentScrollRef.current?.scrollTop ?? 0) <= 0;
    const isVerticalDownSwipe = deltaY > 0 && Math.abs(deltaY) > Math.abs(deltaX);
    if (!atTop || touchStartScrollTopRef.current > 0 || !isVerticalDownSwipe) {
      swipeCloseEligibleRef.current = false;
      return;
    }

    event.preventDefault();
  };

  const handleSheetTouchEnd = () => {
    if (swipeCloseEligibleRef.current && touchDeltaYRef.current > 72) {
      onClose();
    }
    resetTouchTracking();
  };

  const helpContent = getSectionHelpContent({ appFlavor, supportsShowSaveFilePicker });
  const help = section ? helpContent[section] : null;

  // カテゴリごとにグループ化
  const groupedItems = React.useMemo(() => {
    if (!help) return [];
    const groups: {
      category: string;
      items: { item: (typeof help.items)[number]; globalIndex: number }[];
    }[] = [];
    const categoryMap = new Map<
      string,
      { item: (typeof help.items)[number]; globalIndex: number }[]
    >();

    help.items.forEach((item, index) => {
      const cat = item.category || 'その他';
      if (!categoryMap.has(cat)) {
        const list: { item: (typeof help.items)[number]; globalIndex: number }[] = [];
        categoryMap.set(cat, list);
        groups.push({ category: cat, items: list });
      }
      categoryMap.get(cat)!.push({ item, globalIndex: index });
    });
    return groups;
  }, [help]);

  const allCategoryKeys = React.useMemo(() => {
    return groupedItems.map((g) => g.category);
  }, [groupedItems]);

  const allSubItemKeys = React.useMemo(() => {
    if (!help) return [];
    const keys: string[] = [];
    help.items.forEach((item, index) => {
      if (item.isSubAccordion) {
        keys.push(`${item.title}-${index}`);
      }
    });
    return keys;
  }, [help]);

  // 親アコーディオン（カテゴリごと）
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set());
  // 子アコーディオン（isSubAccordion のアイテムごと）
  const [openSubItems, setOpenSubItems] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (isOpen) {
      setOpenCategories(new Set());
      setOpenSubItems(new Set());
    }
  }, [isOpen, section]);

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const toggleSubItem = (key: string) => {
    setOpenSubItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setOpenCategories(new Set(allCategoryKeys));
    setOpenSubItems(new Set(allSubItemKeys));
  };

  const handleCollapseAll = () => {
    setOpenCategories(new Set());
    setOpenSubItems(new Set());
  };

  if (!isOpen || !section || !help) return null;

  const accent = sectionAccentClass[section];
  const chipBaseClass =
    'inline-flex items-center gap-1 rounded-lg border text-[10px] md:text-xs leading-none';

  const renderVisualToken = (token: SectionHelpVisualId, index: number) => {
    switch (token) {
      case 'app_step_clips':
        return (
          <div key={`${token}-${index}`} className="basis-full w-full">
            <div className="w-full rounded-lg border border-blue-500/35 bg-blue-500/10 px-2.5 py-2">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full border border-blue-400/40 bg-blue-500/20 text-xs font-bold text-blue-200 shrink-0">
                  1
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-blue-200">動画・画像</div>
                  <p className="text-xs md:text-sm text-gray-200 leading-relaxed">
                    動画・画像を追加し、並び順や表示区間を整えます。
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      case 'app_step_bgm':
        return (
          <div key={`${token}-${index}`} className="basis-full w-full">
            <div className="w-full rounded-lg border border-purple-500/35 bg-purple-500/10 px-2.5 py-2">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full border border-purple-400/40 bg-purple-500/20 text-xs font-bold text-purple-200 shrink-0">
                  2
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-purple-200">BGM</div>
                  <p className="text-xs md:text-sm text-gray-200 leading-relaxed">
                    BGMを追加し、開始タイミングや音量を調整して動画を盛り上げます。
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      case 'app_step_narration':
        return (
          <div key={`${token}-${index}`} className="basis-full w-full">
            <div className="w-full rounded-lg border border-indigo-500/35 bg-indigo-500/10 px-2.5 py-2">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full border border-indigo-400/40 bg-indigo-500/20 text-xs font-bold text-indigo-200 shrink-0">
                  3
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-indigo-200">ナレーション</div>
                  <p className="text-xs md:text-sm text-gray-200 leading-relaxed">
                    AI生成でも、あらかじめ用意した音声ファイルでもナレーションを追加できます。
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      case 'app_step_caption':
        return (
          <div key={`${token}-${index}`} className="basis-full w-full">
            <div className="w-full rounded-lg border border-yellow-500/35 bg-yellow-500/10 px-2.5 py-2">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full border border-yellow-400/40 bg-yellow-500/20 text-xs font-bold text-yellow-200 shrink-0">
                  4
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-yellow-200">キャプション</div>
                  <p className="text-xs md:text-sm text-gray-200 leading-relaxed">
                    キャプションを追加し、サイズや字体、位置、フェードなどを整えて見やすく仕上げます。
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      case 'app_step_preview':
        return (
          <div key={`${token}-${index}`} className="basis-full w-full">
            <div className="w-full rounded-lg border border-green-500/35 bg-green-500/10 px-2.5 py-2">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full border border-green-400/40 bg-green-500/20 text-xs font-bold text-green-200 shrink-0">
                  5
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-green-200">プレビュー</div>
                  <p className="text-xs md:text-sm text-gray-200 leading-relaxed">
                    プレビューで確認後、「動画ファイルを作成」してダウンロードすれば完了です。
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      case 'add_green_button':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2.5 py-1 bg-emerald-700 border-emerald-500/45 text-white font-semibold`}
          >
            <Upload className="w-3 h-3" /> 追加
          </span>
        );
      case 'add_yellow_button':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2.5 py-1 bg-yellow-700 border-yellow-500/45 text-yellow-100 font-semibold`}
          >
            <Plus className="w-3 h-3" /> 追加
          </span>
        );
      case 'ai_add_button':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2.5 py-1 bg-linear-to-r from-indigo-600 to-blue-600 border-indigo-400/45 text-white font-semibold`}
          >
            <Sparkles className="w-3 h-3" /> AI
          </span>
        );
      case 'aspect_ratio_toggle':
        return (
          <div
            key={`${token}-${index}`}
            className="inline-flex items-center rounded-lg border border-gray-700 bg-gray-800/70 p-0.5"
            aria-label="出力の向きの見本"
          >
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white"
              title="横画面 (16:9)"
            >
              <RectangleHorizontal className="h-4 w-4" />
            </span>
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400"
              title="縦画面 (9:16)"
            >
              <RectangleVertical className="h-4 w-4" />
            </span>
            <span className="px-2 text-[10px] text-gray-400 md:text-xs">横16:9／縦9:16</span>
          </div>
        );
      case 'watermark_controls':
        return (
          <div
            key={`${token}-${index}`}
            className="basis-full w-full space-y-2 rounded-xl border border-gray-700/80 bg-gray-900/60 p-2.5 text-[10px] text-gray-300 md:text-xs"
          >
            <div className="flex gap-1">
              <span className="flex-1 py-1 text-center rounded-lg border border-blue-400/80 bg-blue-500/20 text-blue-100 font-semibold text-[10px] md:text-xs">
                ウォーターマーク
              </span>
              <span className="flex-1 py-1 text-center rounded-lg border border-gray-700 bg-gray-800 text-gray-400 text-[10px] md:text-xs">
                エンドロール
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white text-xs shadow-xs">
                画像を選択
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-2 py-1.5 text-emerald-300 text-xs">
                <Eye className="h-3.5 w-3.5" /> 表示中
              </span>
              {['左下', '右下', '中央', '左上', '右上'].map((label, i) => (
                <span
                  key={label}
                  className={`rounded-lg border px-2 py-1 text-xs ${
                    i === 1
                      ? 'border-blue-500/60 bg-blue-500/20 text-blue-200 font-semibold'
                      : 'border-gray-700 bg-gray-800 text-gray-300'
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        );
      case 'watermark_tab_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center px-2.5 py-1 rounded-lg border border-blue-400/80 bg-blue-500/20 text-blue-100 font-semibold text-[10px] md:text-xs"
          >
            ウォーターマーク
          </span>
        );
      case 'endroll_tab_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center px-2.5 py-1 rounded-lg border border-blue-400/80 bg-blue-500/20 text-blue-100 font-semibold text-[10px] md:text-xs"
          >
            エンドロール
          </span>
        );
      case 'logo_image_select':
        return (
          <div key={`${token}-${index}`} className="inline-flex items-center gap-1.5">
            <span className="rounded-lg bg-blue-600 px-2.5 py-1 font-semibold text-white text-[10px] md:text-xs shadow-xs">
              画像を選択
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-emerald-300 text-[10px] md:text-xs">
              <Eye className="h-3 w-3" /> 表示中
            </span>
          </div>
        );
      case 'logo_position_buttons':
        return (
          <div key={`${token}-${index}`} className="inline-flex flex-wrap items-center gap-1 text-[10px] md:text-xs">
            <span className="text-gray-400 mr-0.5">配置:</span>
            {['左下', '右下', '中央', '左上', '右上'].map((label, i) => (
              <span
                key={label}
                className={`rounded border px-1.5 py-0.5 text-[10px] md:text-xs ${
                  i === 1
                    ? 'border-blue-500/60 bg-blue-500/20 text-blue-200 font-semibold'
                    : 'border-gray-700 bg-gray-800 text-gray-300'
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        );
      case 'transition_button':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} rounded-full border-purple-500/50 bg-purple-900/40 px-2.5 py-1 text-purple-200`}
          >
            <ArrowDownUp className="h-3 w-3" /> ディゾルブ 1秒
          </span>
        );
      case 'range_pin_buttons':
        return (
          <div
            key={`${token}-${index}`}
            className="inline-flex flex-wrap items-center gap-1.5 text-[10px] text-gray-500 md:text-xs"
          >
            <span>プレビュー位置を反映:</span>
            <span className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-gray-200">
              <MapPin className="h-3.5 w-3.5" /> 開始
            </span>
            <span className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-gray-200">
              <MapPin className="h-3.5 w-3.5" /> 終了
            </span>
          </div>
        );
      case 'bgm_trim_position_buttons':
        return (
          <div
            key={`${token}-${index}`}
            className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-purple-500/25 bg-purple-950/20 px-2 py-1.5 text-[10px] text-gray-300 md:text-xs"
          >
            <span>現在のBGM位置を反映:</span>
            <span className="inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-gray-700 bg-gray-800 px-2 text-gray-200 md:px-2.5">
              <Scissors className="h-3.5 w-3.5 shrink-0" /> 開始設定
            </span>
            <span className="inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-gray-700 bg-gray-800 px-2 text-gray-200 md:px-2.5">
              <Scissors className="h-3.5 w-3.5 shrink-0" /> 終了設定
            </span>
          </div>
        );
      case 'rotate_button':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} border-gray-600 bg-gray-700 px-2.5 py-1.5 font-medium text-gray-200`}
          >
            <RotateCw className="h-3.5 w-3.5" /> 90°回転
          </span>
        );
      case 'bgm_count_label':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center gap-1 text-sm font-bold text-purple-300"
          >
            BGM <span className="text-[10px] font-normal text-purple-300 md:text-xs">(2件)</span>
          </span>
        );
      case 'narration_count_label':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center gap-1 text-sm font-bold text-indigo-300"
          >
            ナレーション{' '}
            <span className="text-[10px] font-normal text-indigo-300 md:text-xs">(2件)</span>
          </span>
        );
      case 'bgm_auto_adjust_toggle':
        return (
          <div
            key={`${token}-${index}`}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/35 px-2.5 py-2 text-[10px] text-gray-300 md:text-xs"
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-emerald-400/70 bg-emerald-500/20 text-emerald-200">
              <Check className="h-3 w-3" />
            </span>
            動画尺に合わせて自動調整
            <span className="rounded border border-emerald-600/50 bg-emerald-900/30 px-1.5 py-0.5 text-emerald-300">
              ON
            </span>
          </div>
        );
      case 'narration_caption_button':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} border-yellow-500/45 bg-yellow-700/70 px-2.5 py-1.5 font-semibold text-yellow-50`}
          >
            <Captions className="h-3.5 w-3.5" /> キャプションカードを追加
          </span>
        );
      case 'narration_waveform':
        return (
          <div
            key={`${token}-${index}`}
            className="basis-full w-full rounded-lg border border-gray-700/70 bg-gray-900/40 p-2"
          >
            <div className="relative h-12 overflow-hidden rounded bg-gray-950/80">
              <div className="absolute inset-x-0 top-1/2 h-px bg-gray-700" />
              <div className="absolute inset-0 flex items-center justify-around gap-px px-1">
                {[18, 30, 12, 38, 24, 8, 34, 16, 28, 10, 36, 20].map((height, barIndex) => (
                  <span
                    key={barIndex}
                    className="w-1 rounded-full bg-indigo-400/80"
                    style={{ height }}
                  />
                ))}
              </div>
              <span className="absolute inset-y-0 left-[18%] w-px bg-emerald-400" />
              <span className="absolute inset-y-0 right-[14%] w-px bg-red-400" />
              <span className="absolute inset-y-0 left-[58%] w-px bg-yellow-400" />
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-gray-500">
              <span className="text-emerald-300">開始</span>
              <span className="text-yellow-300">無音候補</span>
              <span className="text-red-300">終了</span>
            </div>
          </div>
        );
      case 'video_title_accordion':
        return (
          <div
            key={`${token}-${index}`}
            className="w-full rounded-lg border border-gray-700/80 bg-black/60 p-2 text-center space-y-0.5"
          >
            <div className="text-xs font-bold text-white drop-shadow">
              主タイトル（動画タイトル）
            </div>
            <div className="text-[10px] text-blue-200">
              サブタイトル（副題・補足）
            </div>
          </div>
        );
      case 'timeline_waveform':
        return (
          <div
            key={`${token}-${index}`}
            className="basis-full w-full rounded-lg border border-gray-700/70 bg-gray-950/70 p-2"
          >
            <div className="relative flex h-12 items-center justify-around gap-px overflow-hidden rounded bg-gray-900 px-1">
              <span className="absolute inset-y-0 left-[42%] w-[12%] bg-yellow-500/15" />
              {[12, 24, 34, 18, 38, 26, 10, 8, 14, 30, 36, 20, 28, 16].map((height, barIndex) => (
                <span
                  key={barIndex}
                  className="z-10 w-1 rounded-full bg-blue-400/75"
                  style={{ height }}
                />
              ))}
              <span className="absolute inset-y-0 left-[68%] w-px bg-white/90" />
            </div>
          </div>
        );
      case 'silence_nav_controls':
        return (
          <div
            key={`${token}-${index}`}
            className="flex basis-full w-full flex-wrap items-center gap-1.5 text-[10px] md:text-xs"
          >
            <span className="flex items-center gap-1 text-gray-400">
              <AudioLines className="h-3.5 w-3.5 text-blue-300" /> 無音区間
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-gray-200">
              <ChevronsLeft className="h-3.5 w-3.5" /> 無音区間：前へ
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-gray-200">
              無音区間：次へ <ChevronsRight className="h-3.5 w-3.5" />
            </span>
          </div>
        );
      case 'poster_accordion':
        return null;
      case 'poster_actions':
        return (
          <div
            key={`${token}-${index}`}
            className="flex basis-full w-full flex-wrap items-center gap-1.5 text-[10px] md:text-xs"
          >
            <span className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-gray-200">
              <ImageIcon className="h-3.5 w-3.5" /> 現在のフレームをサムネイルに設定
            </span>
            <span className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-gray-200">
              <RefreshCw className="h-3.5 w-3.5" /> 自動設定に戻す
            </span>
          </div>
        );
      case 'copy_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-blue-800/50 bg-blue-900/30 text-blue-300"
          >
            <Copy className="h-3.5 w-3.5" />
          </span>
        );
      case 'caption_style_accordion':
        return null;
      case 'caption_outline_color_accordion':
        return null;
      case 'caption_outline_controls':
        return (
          <div
            key={`${token}-${index}`}
            className="basis-full w-full space-y-2 rounded-lg border border-gray-700/70 bg-gray-900/30 px-2 py-2 text-[10px] text-gray-300 md:text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-gray-400">縁の幅:</span>
              <div className="relative h-4 flex-1">
                <div className="absolute inset-x-0 top-1.5 h-1 rounded-full bg-gray-700" />
                <div className="absolute left-[35%] top-0 h-4 w-4 -translate-x-1/2 rounded-full border border-gray-300 bg-gray-100" />
              </div>
              <span className="rounded border border-gray-600 bg-gray-700 px-1.5 py-1">2</span>
              <span className="text-gray-500">px</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-gray-400">縁の色</span>
              <span className="h-6 w-8 rounded border border-gray-500 bg-black" />
              <span className="rounded border border-gray-600 bg-gray-700 px-1.5 py-1 font-mono">
                #000000
              </span>
              <span className="ml-1 text-gray-400">文字本体</span>
              <span className="h-6 w-8 rounded border border-gray-500 bg-white" />
              <span className="rounded border border-gray-600 bg-gray-700 px-1.5 py-1 font-mono">
                #FFFFFF
              </span>
            </div>
          </div>
        );
      case 'bulk_caption_button':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-3 py-2 border-yellow-600/40 bg-gray-800 text-yellow-300`}
          >
            <ListPlus className="h-3.5 w-3.5" /> ① まとめて入力・編集
          </span>
        );
      case 'timing_caption_button':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-3 py-2 border-yellow-600/40 bg-gray-800 text-yellow-300`}
          >
            <Timer className="h-3.5 w-3.5" /> ② タイミング打ち
          </span>
        );
      case 'shift_caption_controls':
        return (
          <div
            key={`${token}-${index}`}
            className="basis-full w-full rounded-lg border border-gray-700/50 bg-gray-800/50 p-2 text-[10px] text-gray-300 md:text-xs"
          >
            <div className="mb-1.5 text-gray-400">
              時間をまとめてずらす:{' '}
              <span className="rounded bg-gray-700 px-1.5 py-1">すべてのカード</span>
            </div>
            <div className="mb-1.5 flex items-center justify-center gap-1 rounded border border-yellow-500/50 bg-yellow-600/15 px-2 py-1.5 text-yellow-200">
              <Crosshair className="h-3.5 w-3.5" /> 現在位置に先頭を合わせる
            </div>
            <div className="mb-1.5 text-center text-[9px] text-gray-500">
              対象の先頭を現在位置 0:12.3 に合わせます
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">微調整:</span>
              <span className="rounded bg-gray-700 px-2 py-1">1 秒</span>
              <span className="flex-1 rounded bg-gray-700 px-2 py-1 text-center">
                <ChevronLeft className="inline h-3.5 w-3.5" />
                早める
              </span>
              <span className="flex-1 rounded bg-gray-700 px-2 py-1 text-center">
                遅らせる
                <ChevronRight className="inline h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        );
      case 'caption_custom_controls':
        return (
          <div
            key={`${token}-${index}`}
            className="flex basis-full w-full flex-wrap items-center gap-1.5 text-[10px] md:text-xs"
          >
            <span className="rounded bg-gray-700 px-2 py-1 text-gray-300">カスタム</span>
            <span className="rounded bg-gray-700 px-2 py-1 text-gray-300">その他▾</span>
            <span className="text-blue-300 underline underline-offset-2">
              ＋ この端末の全フォントから選ぶ（PC）
            </span>
          </div>
        );
      case 'unlock_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-gray-600 bg-gray-700 text-gray-300"
          >
            <Unlock className="w-3.5 h-3.5" />
          </span>
        );
      case 'lock_button_red':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-red-500/45 bg-red-500/20 text-red-300"
          >
            <Lock className="w-3.5 h-3.5" />
          </span>
        );
      case 'eye_on_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-yellow-500/45 bg-yellow-500/20 text-yellow-300"
          >
            <Eye className="w-3.5 h-3.5" />
          </span>
        );
      case 'eye_off_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-gray-600 bg-gray-700 text-gray-300"
          >
            <EyeOff className="w-3.5 h-3.5" />
          </span>
        );
      case 'move_up_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-gray-600 bg-gray-700/60 text-gray-200"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </span>
        );
      case 'move_down_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-gray-600 bg-gray-700/60 text-gray-200"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </span>
        );
      case 'delete_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center px-2 py-1 rounded border border-red-800/50 bg-red-900/30 text-red-400"
          >
            <Trash2 className="w-3 h-3" />
          </span>
        );
      case 'edit_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-7 h-7 rounded border border-gray-600 bg-gray-700 text-gray-300"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </span>
        );
      case 'settings_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-7 h-7 rounded border border-gray-600 bg-gray-700 text-gray-300"
          >
            <Settings className="w-3.5 h-3.5" />
          </span>
        );
      case 'save_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-7 h-7 rounded border border-gray-600 bg-gray-700 text-gray-300"
          >
            <Save className="w-3.5 h-3.5" />
          </span>
        );
      case 'item_unlock_chip':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-7 h-7 rounded border border-gray-600 bg-gray-700/55 text-gray-400"
          >
            <Unlock className="w-3 h-3" />
          </span>
        );
      case 'item_lock_chip':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-7 h-7 rounded border border-red-500/35 bg-red-500/20 text-red-400"
          >
            <Lock className="w-3 h-3" />
          </span>
        );
      case 'trim_chip':
        return (
          <div
            key={`${token}-${index}`}
            className="w-full bg-black/40 p-2.5 md:p-3 rounded-lg border border-gray-700/60 space-y-2 text-xs"
          >
            <div className="flex items-center gap-2 text-[11px] md:text-xs text-gray-400">
              <Scissors className="w-3.5 h-3.5 text-gray-400" />
              <span>トリミング: 0.00s - 12.04s</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] md:text-xs">
              <span className="text-gray-400 mr-0.5">プレビュー位置を反映:</span>
              <span className="px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 flex items-center gap-1 font-medium">
                <MapPin className="w-3.5 h-3.5" /> 開始
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 flex items-center gap-1 font-medium">
                <MapPin className="w-3.5 h-3.5" /> 終了
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-10 shrink-0 text-[11px]">開始</span>
              <div className="w-16 px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-right font-mono text-white text-[11px]">
                0 秒
              </div>
              <div className="flex-1 h-1.5 bg-gray-700 rounded-full relative">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow" />
              </div>
              <div className="flex items-center gap-0.5">
                <span className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400">−</span>
                <span className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400">＋</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-10 shrink-0 text-[11px]">終了</span>
              <div className="w-16 px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-right font-mono text-white text-[11px]">
                12.04 秒
              </div>
              <div className="flex-1 h-1.5 bg-gray-700 rounded-full relative">
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow" />
              </div>
              <div className="flex items-center gap-0.5">
                <span className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400">−</span>
                <span className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400">＋</span>
              </div>
            </div>
            <div className="w-full px-2.5 py-1.5 rounded-lg bg-blue-900/30 text-blue-200 border border-blue-800/50 flex items-center justify-center gap-1.5 text-[11px]">
              <Split className="w-3.5 h-3.5" />
              <span>続きを追加コピー（5.20s 〜 15.00s）</span>
            </div>
          </div>
        );
      case 'duration_chip':
        return (
          <div
            key={`${token}-${index}`}
            className="w-full bg-black/40 p-2.5 md:p-3 rounded-lg border border-gray-700/60 space-y-2 text-xs"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="text-gray-400 w-14 shrink-0 text-[11px]">表示時間</span>
              <div className="w-16 px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-right font-mono text-white text-[11px]">
                5.0 秒
              </div>
              <div className="flex-1 h-1.5 bg-gray-700 rounded-full relative">
                <div className="absolute left-1/3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow" />
              </div>
              <div className="flex items-center gap-0.5">
                <span className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400">−</span>
                <span className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400">＋</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] md:text-xs">
              <span className="text-gray-400 mr-0.5">プレビュー位置を反映:</span>
              <span className="px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 flex items-center gap-1 font-medium">
                <MapPin className="w-3.5 h-3.5" /> ここまで延長
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 flex items-center gap-1 font-medium">
                <MapPin className="w-3.5 h-3.5" /> ここまで短縮
              </span>
            </div>
          </div>
        );
      case 'start_chip':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2 py-1 border-indigo-500/40 bg-indigo-500/10 text-indigo-200`}
          >
            <Timer className="w-3 h-3" /> 開始位置
          </span>
        );
      case 'delay_chip':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2 py-1 border-purple-500/40 bg-purple-500/10 text-purple-200`}
          >
            <Timer className="w-3 h-3" /> 遅延
          </span>
        );
      case 'volume_chip':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-7 h-7 rounded border border-gray-600 bg-gray-700 text-gray-300"
            title="音量調整"
            aria-label="音量調整"
          >
            <Volume2 className="w-3.5 h-3.5" />
          </span>
        );
      case 'mute_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-7 h-7 rounded border border-red-500/35 bg-red-500/15 text-red-300"
            title="ミュートON"
            aria-label="ミュートON"
          >
            <VolumeX className="w-3.5 h-3.5" />
          </span>
        );
      case 'reset_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-7 h-7 rounded border border-gray-600 bg-gray-700 text-gray-300"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </span>
        );
      case 'scale_chip':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2 py-1 border-blue-500/40 bg-blue-500/10 text-blue-200`}
          >
            <ZoomIn className="w-3 h-3" /> 拡大率
          </span>
        );
      case 'position_chip':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2 py-1 border-blue-500/40 bg-blue-500/10 text-blue-200`}
          >
            <Move className="w-3 h-3" /> 位置
          </span>
        );
      case 'blackbar_toggle_chip':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2 py-1 border-blue-500/40 bg-blue-500/10 text-blue-200`}
          >
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded border border-blue-300/70 bg-blue-400/20">
              <Check className="w-2.5 h-2.5" />
            </span>
            黒帯除去 (102.5%)
          </span>
        );
      case 'size_chip':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2 py-1 border-yellow-500/40 bg-yellow-500/10 text-yellow-200`}
          >
            <Type className="w-3 h-3" /> サイズ
          </span>
        );
      case 'blur_chip':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2 py-1 border-yellow-500/40 bg-yellow-500/10 text-yellow-200`}
          >
            <Sparkles className="w-3 h-3" /> ぼかし
          </span>
        );
      case 'fade_in_chip':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2 py-1 border-blue-500/40 bg-blue-500/10 text-blue-200`}
          >
            フェードイン
          </span>
        );
      case 'fade_out_chip':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2 py-1 border-blue-500/40 bg-blue-500/10 text-blue-200`}
          >
            フェードアウト
          </span>
        );
      case 'fade_in_checkbox':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2 py-1 border-blue-500/40 bg-blue-500/10 text-blue-200`}
          >
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded border border-blue-300/70 bg-blue-400/20">
              <Check className="w-2.5 h-2.5" />
            </span>
            フェードイン
          </span>
        );
      case 'fade_out_checkbox':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2 py-1 border-blue-500/40 bg-blue-500/10 text-blue-200`}
          >
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded border border-blue-300/70 bg-blue-400/20">
              <Check className="w-2.5 h-2.5" />
            </span>
            フェードアウト
          </span>
        );
      case 'style_chip':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2 py-1 border-yellow-500/40 bg-yellow-500/10 text-yellow-200`}
          >
            <Type className="w-3 h-3" /> キャプション 一括設定
          </span>
        );
      case 'current_pin_chip':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2 py-1 border-indigo-500/40 bg-indigo-500/10 text-indigo-200`}
          >
            <MapPin className="w-3 h-3" /> 現在位置に設定
          </span>
        );
      case 'stop_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-800 border border-gray-700 text-gray-200"
          >
            <Square className="w-4 h-4 fill-current" />
          </span>
        );
      case 'play_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-blue-600 border border-blue-500/60 text-white"
          >
            <Play className="w-4 h-4 ml-0.5" />
          </span>
        );
      case 'capture_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-800 border border-gray-700 text-gray-200"
          >
            <Camera className="w-4 h-4" />
          </span>
        );
      case 'clear_button':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-2.5 py-1 border-gray-600 bg-gray-700/50 text-gray-200 font-medium`}
          >
            <RotateCcw className="w-3 h-3" /> 一括クリア
          </span>
        );
      case 'export_button':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-3 py-1.5 rounded-full border-blue-500/60 bg-blue-600 text-white font-semibold`}
          >
            動画ファイルを作成
          </span>
        );
      case 'download_button':
        return (
          <span
            key={`${token}-${index}`}
            className={`${chipBaseClass} px-3 py-1.5 rounded-full border-green-500/60 bg-green-600 text-white font-semibold`}
          >
            <Download className="w-3 h-3" /> ダウンロード
          </span>
        );
      case 'slider_demo':
        return (
          <div key={`${token}-${index}`} className="basis-full w-full pt-1">
            <div className="relative h-5 w-3/4">
              <div className="absolute left-0 right-0 top-2 h-1 rounded-full bg-gray-700" />
              <div
                className="absolute left-0 top-2 h-1 rounded-full bg-blue-500/55 transition-all duration-500"
                style={{ width: `${demoSliderValue}%` }}
              />
              <div
                className="absolute top-0.5 -translate-x-1/2 w-4 h-4 rounded-full bg-gray-100 border border-gray-300 shadow-md transition-all duration-500"
                style={{ left: `${demoSliderValue}%` }}
              />
            </div>
          </div>
        );
      case 'folder_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs text-gray-200"
          >
            <FolderOpen className="w-3.5 h-3.5 text-emerald-400" /> 保存・読み込み
          </span>
        );
      case 'settings_header_button':
        return (
          <div
            key={`${token}-${index}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-800 bg-gray-900/90 px-2 py-1 text-xs"
          >
            <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-gray-400 hover:text-white transition">
              <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline text-[11px] text-gray-300">保存・読込</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-gray-800 border border-gray-700 px-2 py-0.5 text-white font-medium shadow-xs">
              <Settings className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px]">設定</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/45 bg-blue-500/10 px-1.5 py-0.5 text-blue-300">
              <CircleHelp className="w-3.5 h-3.5" />
            </span>
          </div>
        );
      case 'project_save_slots':
        return (
          <div
            key={`${token}-${index}`}
            className="basis-full w-full space-y-3 rounded-xl border border-gray-700/80 bg-gray-900/60 p-2.5 text-[10px] md:text-xs"
          >
            {/* 自動保存設定・カード（実画面 SaveLoadModal 準拠） */}
            <div className="space-y-2 rounded-xl bg-gray-800/80 p-2.5 border border-gray-700/50">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="flex items-center gap-1 text-[11px] font-medium text-gray-300">
                  <Timer className="w-3.5 h-3.5 text-blue-400" /> 自動保存間隔
                </span>
                <div className="flex gap-1">
                  {[
                    { label: 'オフ', active: false },
                    { label: '1分', active: false },
                    { label: '2分', active: true },
                    { label: '5分', active: false },
                  ].map((opt) => (
                    <span
                      key={opt.label}
                      className={`rounded px-2 py-0.5 text-[10px] ${
                        opt.active
                          ? 'bg-blue-600 text-white font-semibold shadow-xs'
                          : 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {opt.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-stretch gap-2.5 border-t border-gray-700/70 pt-2">
                <div className="relative aspect-[7/5] w-20 shrink-0 self-center overflow-hidden rounded-lg bg-gray-950 flex items-center justify-center border border-gray-700/60 sm:w-24">
                  <ImageIcon className="w-4 h-4 text-gray-500" />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1 font-semibold text-white text-[11px]">
                      <Clock className="w-3 h-3 text-blue-300" /> 自動保存
                    </span>
                    <span className="text-[10px] text-gray-300">たった今</span>
                  </div>
                  <div className="text-[10px] text-gray-400">定期保存中（2分ごと）</div>
                  <div className="text-[9px] text-gray-500">前回保存日時: 2026/09/26 10:20:00</div>
                  <div className="flex flex-wrap gap-1 pt-1 text-[10px]">
                    <span className="rounded-md bg-gray-700 px-2 py-0.5 text-white font-medium">読み込み</span>
                    <span className="rounded-md border border-red-500/40 px-2 py-0.5 text-red-300 font-medium">削除</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 手動保存の3枠（実画面 SaveLoadModal 準拠の縦並びカード） */}
            <div className="space-y-1.5" aria-label="手動保存スロット（3枠）">
              <div className="text-[11px] font-semibold text-emerald-300 flex items-center gap-1">
                手動保存スロット（3枠）
              </div>
              {/* スロット① */}
              <div className="rounded-xl border border-gray-700 bg-gray-800/70 p-2">
                <div className="flex items-stretch gap-2">
                  <div className="relative aspect-[7/5] w-20 shrink-0 self-center overflow-hidden rounded-lg bg-gray-950 flex items-center justify-center border border-gray-700/60 sm:w-24">
                    <ImageIcon className="w-4 h-4 text-blue-400/70" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="shrink-0 font-bold text-blue-300 text-xs">①</span>
                      <span className="truncate font-semibold text-white text-[11px]">プロジェクトA</span>
                    </div>
                    <div className="text-[10px] text-gray-400">動画 0:30 ・ たった今</div>
                    <div className="flex flex-wrap gap-1 pt-1 text-[10px]">
                      <span className="rounded-md bg-blue-600 px-2 py-0.5 text-white font-medium shadow-xs">保存</span>
                      <span className="rounded-md bg-gray-700 px-2 py-0.5 text-white font-medium">読み込み</span>
                      <span className="rounded-md border border-red-500/40 px-2 py-0.5 text-red-300 font-medium">削除</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* スロット②（未保存） */}
              <div className="rounded-xl border border-gray-700/70 bg-gray-850/50 p-2">
                <div className="flex items-stretch gap-2">
                  <div className="relative aspect-[7/5] w-20 shrink-0 self-center overflow-hidden rounded-lg bg-gray-950/60 flex items-center justify-center border border-gray-800 sm:w-24">
                    <ImageIcon className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="shrink-0 font-bold text-gray-500 text-xs">②</span>
                      <span className="text-[11px] text-gray-400">未保存</span>
                    </div>
                    <div className="text-[10px] text-gray-500">---</div>
                    <div className="flex flex-wrap gap-1 pt-1 text-[10px]">
                      <span className="rounded-md bg-blue-600 px-2 py-0.5 text-white font-medium shadow-xs">保存</span>
                      <span className="rounded-md bg-gray-800 px-2 py-0.5 text-gray-500 opacity-50">読み込み</span>
                      <span className="rounded-md border border-gray-700 px-2 py-0.5 text-gray-600 opacity-50">削除</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* スロット③（未保存） */}
              <div className="rounded-xl border border-gray-700/70 bg-gray-850/50 p-2">
                <div className="flex items-stretch gap-2">
                  <div className="relative aspect-[7/5] w-20 shrink-0 self-center overflow-hidden rounded-lg bg-gray-950/60 flex items-center justify-center border border-gray-800 sm:w-24">
                    <ImageIcon className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="shrink-0 font-bold text-gray-500 text-xs">③</span>
                      <span className="text-[11px] text-gray-400">未保存</span>
                    </div>
                    <div className="text-[10px] text-gray-500">---</div>
                    <div className="flex flex-wrap gap-1 pt-1 text-[10px]">
                      <span className="rounded-md bg-blue-600 px-2 py-0.5 text-white font-medium shadow-xs">保存</span>
                      <span className="rounded-md bg-gray-800 px-2 py-0.5 text-gray-500 opacity-50">読み込み</span>
                      <span className="rounded-md border border-gray-700 px-2 py-0.5 text-gray-600 opacity-50">削除</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 'stepper_buttons':
        return (
          <div
            key={`${token}-${index}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700/70 bg-gray-800/80 px-2 py-1 text-[10px] md:text-xs text-gray-300"
          >
            <span className="text-gray-400">長押し加速:</span>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-gray-700 font-bold text-gray-200">
              <Minus className="h-3 w-3" />
            </span>
            <span className="rounded border border-gray-600 bg-gray-900 px-2 py-0.5 font-mono text-white">
              1.0
            </span>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-gray-700 font-bold text-gray-200">
              <Plus className="h-3 w-3" />
            </span>
            <span className="text-[9px] text-emerald-300 ml-1">スワイプ保護ON</span>
          </div>
        );
      case 'continuation_copy_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-800/50 bg-blue-900/30 px-2.5 py-1.5 text-[10px] md:text-xs font-semibold text-blue-200"
          >
            <Split className="h-3.5 w-3.5" /> 続きを追加コピー（5.20s 〜 15.00s）
          </span>
        );
      case 'image_range_buttons':
        return (
          <div
            key={`${token}-${index}`}
            className="inline-flex flex-wrap items-center gap-1.5 text-[10px] md:text-xs"
          >
            <span className="text-gray-500">プレビュー位置に反映:</span>
            <span className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-yellow-200">
              <MapPin className="h-3.5 w-3.5" /> ここまで延長
            </span>
            <span className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-yellow-200">
              <MapPin className="h-3.5 w-3.5" /> ここまで短縮
            </span>
          </div>
        );
      case 'speed_badge_presets':
        return (
          <div
            key={`${token}-${index}`}
            className="basis-full w-full space-y-1.5 rounded-lg border border-gray-700/60 bg-gray-900/40 p-2 text-[10px] md:text-xs"
          >
            <div className="flex flex-wrap items-center gap-1 text-gray-400">
              <span>速度表示位置:</span>
              {['左上', '右上', '左下', '右下'].map((pos, i) => (
                <span
                  key={pos}
                  className={`rounded px-1.5 py-0.5 border ${
                    i === 3
                      ? 'border-amber-500/60 bg-amber-500/20 text-amber-200 font-semibold'
                      : 'border-gray-700 bg-gray-800 text-gray-400'
                  }`}
                >
                  {pos}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1 text-gray-400">
              <span>形式:</span>
              <span className="rounded border border-amber-500/60 bg-amber-500/20 px-1.5 py-0.5 text-amber-200">
                日本語（2.0倍速）
              </span>
              <span className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-gray-400">
                English（2.0x）
              </span>
            </div>
          </div>
        );
      case 'bgm_fit_end_button':
        return (
          <span
            key={`${token}-${index}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-900/30 px-2.5 py-1.5 text-[10px] md:text-xs font-semibold text-purple-200"
          >
            <Scissors className="h-3.5 w-3.5" /> 設定を末尾に固定
          </span>
        );
      case 'bulk_audio_controls':
        return (
          <div
            key={`${token}-${index}`}
            className="basis-full w-full space-y-2 rounded-lg border border-gray-700/70 bg-gray-900/40 p-2.5 text-[10px] md:text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-semibold text-gray-200">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-red-500/60 bg-red-500/20 text-red-300">
                  <Check className="h-3 w-3" />
                </span>
                一括ミュート
              </span>
              <span className="flex items-center gap-1.5 font-semibold text-gray-200">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-blue-500/60 bg-blue-500/20 text-blue-300">
                  <Check className="h-3 w-3" />
                </span>
                一括音量設定 (100%)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-800 pt-1.5 text-gray-400">
              <span>音量を揃える:</span>
              <span className="rounded border border-emerald-500/60 bg-emerald-500/20 px-2 py-0.5 font-medium text-emerald-200">
                平均に揃える
              </span>
              <span className="rounded border border-gray-700 bg-gray-800 px-2 py-0.5 text-gray-400">
                最大に揃える
              </span>
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-300">
                +2.4 dB
              </span>
            </div>
          </div>
        );
      case 'caption_text_align_controls':
        return (
          <div
            key={`${token}-${index}`}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800/80 p-1 text-[10px] md:text-xs"
          >
            <span className="px-1 text-gray-400">文字揃え:</span>
            <span className="inline-flex items-center gap-1 rounded border border-gray-700 bg-gray-700 px-2 py-1 text-gray-300">
              <AlignLeft className="h-3.5 w-3.5" /> 左揃え
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-yellow-500/60 bg-yellow-500/20 px-2 py-1 font-semibold text-yellow-200">
              <AlignCenter className="h-3.5 w-3.5" /> 中央揃え
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-gray-700 bg-gray-700 px-2 py-1 text-gray-300">
              <AlignRight className="h-3.5 w-3.5" /> 右揃え
            </span>
          </div>
        );
      case 'caption_sub_row_demo':
        return (
          <div
            key={`${token}-${index}`}
            className="basis-full w-full space-y-1.5 rounded-lg border border-yellow-500/30 bg-gray-900/40 p-2 text-[10px] md:text-xs"
          >
            <div className="font-semibold text-yellow-300">時分割キャプションの見本</div>
            <div className="rounded border border-gray-700 bg-gray-800/60 p-2 space-y-1">
              <div className="flex items-center justify-between text-white font-medium">
                <span>メイン行：こんにちは</span>
                <span className="text-[9px] text-gray-400 font-mono">0:01.0 - 0:05.0</span>
              </div>
              <div className="flex items-center justify-between pl-3 border-l-2 border-yellow-500/60 text-yellow-200">
                <span>+ サブ行：今日も良い天気ですね</span>
                <span className="text-[9px] text-yellow-300 font-mono">0:02.5〜</span>
              </div>
            </div>
          </div>
        );
      case 'timing_mode_controls':
        return (
          <div
            key={`${token}-${index}`}
            className="basis-full w-full space-y-1.5 rounded-lg border border-gray-700/60 bg-gray-900/40 p-2 text-[10px] md:text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="text-gray-400">確定モード:</span>
              <span className="rounded border border-yellow-500/60 bg-yellow-500/20 px-2 py-0.5 font-semibold text-yellow-200">
                交互モード（開始/終了）
              </span>
              <span className="rounded border border-gray-700 bg-gray-800 px-2 py-0.5 text-gray-400">
                連続モード
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-300">
              <span className="rounded bg-gray-800 px-2 py-1 text-center font-semibold text-emerald-300 border border-emerald-500/40">
                開始確定
              </span>
              <span className="rounded bg-gray-800 px-2 py-1 text-center font-semibold text-red-300 border border-red-500/40">
                終了確定
              </span>
              <span className="rounded bg-gray-700 px-1.5 py-1 text-gray-300">-1s</span>
              <span className="rounded bg-gray-700 px-1.5 py-1 text-gray-300">+1s</span>
            </div>
          </div>
        );
      case 'timeline_seek_bar':
        return (
          <div
            key={`${token}-${index}`}
            className="basis-full w-full space-y-1.5 rounded-lg border border-gray-700/70 bg-gray-950 p-2.5 text-[10px] md:text-xs"
          >
            <div className="flex items-center justify-between font-mono text-gray-300">
              <span className="text-blue-300 font-bold">0:12.34</span>
              <span className="text-gray-500">/ 1:00.00</span>
            </div>
            <div className="relative h-4 w-full">
              <div className="absolute inset-x-0 top-1.5 h-1.5 rounded-full bg-gray-800" />
              <div className="absolute left-[30%] right-[50%] top-1.5 h-1.5 rounded-full bg-linear-to-r from-purple-500/40 via-purple-500 to-purple-500/40" />
              <div className="absolute left-[20%] top-0 h-4 w-4 -translate-x-1/2 rounded-full border border-blue-400 bg-blue-500 shadow-md" />
            </div>
            <div className="flex justify-between text-[9px] text-gray-500">
              <span>0秒</span>
              <span className="text-purple-300">ディゾルブ区間</span>
              <span>終了</span>
            </div>
          </div>
        );
      case 'export_mode_tabs':
        return (
          <div
            key={`${token}-${index}`}
            className="basis-full w-full space-y-1.5 rounded-lg border border-gray-700/70 bg-gray-900/40 p-2 text-[10px] md:text-xs"
          >
            <div className="flex gap-1">
              <span className="flex-1 rounded-md border border-gray-700 bg-gray-800 py-1 text-center font-medium text-gray-400">
                完成動画（焼き込み）
              </span>
              <span className="flex-1 rounded-md border border-blue-500/60 bg-blue-500/20 py-1 text-center font-semibold text-blue-200">
                キャプションのみ
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-[9px] md:text-[10px]">
              <span className="rounded border border-blue-400/40 bg-blue-500/10 px-1.5 py-0.5 text-blue-300">
                透過 WebM
              </span>
              <span className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-gray-300">
                黒背景 MP4
              </span>
              <span className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-gray-300">
                白文字キー用 MP4
              </span>
              <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
                字幕 SRT / VTT
              </span>
            </div>
          </div>
        );
      case 'export_progress_demo':
        return (
          <div
            key={`${token}-${index}`}
            className="basis-full w-full space-y-2 rounded-lg border border-blue-500/30 bg-gray-950 p-2.5 text-[10px] md:text-xs"
          >
            <div className="flex items-center justify-between text-gray-300">
              <span className="flex items-center gap-1.5 font-semibold text-blue-300">
                <RefreshCw className="h-3 w-3 animate-spin text-blue-400" />
                動画ファイルを生成中... (48%)
              </span>
              <span className="rounded border border-red-500/50 bg-red-950/40 px-2 py-0.5 font-medium text-red-300">
                中止
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-800">
              <div className="h-full w-[48%] bg-blue-500 rounded-full" />
            </div>
            <div className="text-[9px] text-gray-400">ステージ: レンダリング中 (残り約 12 秒)</div>
          </div>
        );
      default:
        return null;
    }
  };

  /**
   * 閉じたアコーディオンヘッダーでもパッと見てどの項目か直感的にわかる関連ボタン・アイコン見本
   */
  const renderHeaderQuickSample = (item: SectionHelpItem) => {
    // 1. 動画の形式
    if (item.title.includes('動画の形式') || item.visuals?.includes('aspect_ratio_toggle')) {
      return (
        <span className="inline-flex items-center rounded border border-gray-700 bg-gray-900/90 p-0.5 shrink-0">
          <RectangleHorizontal className="w-3.5 h-3.5 text-blue-400 p-0.5" />
          <RectangleVertical className="w-3.5 h-3.5 text-gray-500 p-0.5" />
        </span>
      );
    }
    // 2. 全体設定
    if (item.title === '全体設定' || item.visuals?.includes('settings_header_button')) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-gray-800 border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300 shrink-0">
          <Settings className="w-3 h-3 text-blue-400" /> 設定
        </span>
      );
    }
    // 3. ロゴ表示
    if (item.title.includes('ロゴ表示') || item.visuals?.includes('watermark_controls')) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-blue-950/70 border border-blue-500/40 px-1.5 py-0.5 text-[10px] text-blue-200 shrink-0">
          <Eye className="w-3 h-3" /> ロゴ
        </span>
      );
    }
    // 4. 音声 一括設定
    if (item.title.includes('音声 一括設定') || item.visuals?.includes('bulk_audio_controls')) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-gray-800 border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300 shrink-0">
          <Volume2 className="w-3 h-3 text-blue-400" /> 一括
        </span>
      );
    }
    // 5. 追加ボタン
    if (
      item.title.includes('追加ボタン') ||
      item.visuals?.includes('add_green_button') ||
      item.visuals?.includes('add_yellow_button')
    ) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-800/80 border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-100 shrink-0">
          <Upload className="w-3 h-3" /> 追加
        </span>
      );
    }
    // 6. AI生成
    if (item.title.includes('AI') || item.visuals?.includes('ai_add_button')) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-linear-to-r from-indigo-600 to-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shrink-0">
          <Sparkles className="w-3 h-3" /> AI
        </span>
      );
    }
    // 7. セクション鍵
    if (item.title.includes('セクションの鍵')) {
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-gray-800 border border-gray-700 text-gray-300 shrink-0">
          <Unlock className="w-3 h-3" />
        </span>
      );
    }
    // 8. 個別鍵
    if (item.title.includes('個別パネルの鍵')) {
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-gray-800 border border-gray-700 text-gray-400 shrink-0">
          <Lock className="w-3 h-3" />
        </span>
      );
    }
    // 9. 並び替え・コピー・削除
    if (item.title.includes('並び替え') || item.title.includes('削除')) {
      return (
        <span className="inline-flex items-center gap-1 text-gray-400 shrink-0">
          <ArrowUp className="w-3 h-3" />
          <Copy className="w-3 h-3 text-blue-400" />
          <Trash2 className="w-3 h-3 text-red-400" />
        </span>
      );
    }
    // 10. 続きを追加コピー
    if (item.title.includes('続きを追加コピー') || item.visuals?.includes('continuation_copy_button')) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-blue-950/70 border border-blue-500/40 px-1.5 py-0.5 text-[10px] text-blue-200 shrink-0">
          <Split className="w-3 h-3" /> 続きコピー
        </span>
      );
    }
    // 11. トランジション
    if (item.title.includes('トランジション') || item.visuals?.includes('transition_button')) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-950/70 border border-purple-500/40 px-2 py-0.5 text-[10px] text-purple-200 shrink-0">
          <ArrowDownUp className="w-3 h-3" /> ディゾルブ
        </span>
      );
    }
    // 12. 再生速度
    if (item.title.includes('再生速度')) {
      return (
        <span className="inline-flex items-center rounded bg-amber-950/60 border border-amber-500/40 px-1.5 py-0.5 text-[10px] text-amber-300 font-mono shrink-0">
          0.5〜8.0x
        </span>
      );
    }
    // 13. 表示区間・トリミング
    if (
      item.title.includes('表示区間') ||
      item.title.includes('トリミング') ||
      item.visuals?.includes('trim_chip')
    ) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-gray-800 border border-blue-500/40 px-1.5 py-0.5 text-[10px] text-blue-300 shrink-0">
          <Timer className="w-3 h-3" /> トリム
        </span>
      );
    }
    // 14. 位置・サイズ・回転
    if (item.title.includes('位置・サイズ・回転')) {
      return (
        <span className="inline-flex items-center gap-1 text-gray-400 shrink-0">
          <RotateCw className="w-3 h-3" />
          <ZoomIn className="w-3 h-3" />
        </span>
      );
    }
    // 15. プロジェクトの保存・読み込み
    if (item.title.includes('保存・読み込み') || item.visuals?.includes('project_save_slots')) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-gray-800 border border-emerald-500/40 px-1.5 py-0.5 text-[10px] text-emerald-300 shrink-0">
          <FolderOpen className="w-3 h-3 text-emerald-400" /> 保存・読込
        </span>
      );
    }
    // 16. キャプション一括設定
    if (
      item.title.includes('キャプション 一括設定') ||
      item.visuals?.includes('caption_style_accordion')
    ) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-yellow-950/60 border border-yellow-500/40 px-1.5 py-0.5 text-[10px] text-yellow-300 shrink-0">
          <Type className="w-3 h-3" /> 一括設定
        </span>
      );
    }
    // 17. タイミング打ち
    if (item.title.includes('タイミング打ち') || item.visuals?.includes('timing_caption_button')) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-gray-800 border border-yellow-600/40 px-1.5 py-0.5 text-[10px] text-yellow-300 shrink-0">
          <Timer className="w-3 h-3" /> タイミング
        </span>
      );
    }
    // 18. まとめて入力
    if (item.title.includes('まとめて入力') || item.visuals?.includes('bulk_caption_button')) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-gray-800 border border-yellow-600/40 px-1.5 py-0.5 text-[10px] text-yellow-300 shrink-0">
          <ListPlus className="w-3 h-3" /> まとめて
        </span>
      );
    }
    // 19. 動画ファイルを作成
    if (item.title.includes('動画ファイルを作成') || item.visuals?.includes('export_button')) {
      return (
        <span className="inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-xs shrink-0">
          作成
        </span>
      );
    }
    // 20. ダウンロード
    if (item.title.includes('ダウンロード') || item.visuals?.includes('download_button')) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-xs shrink-0">
          <Download className="w-3 h-3" /> 保存
        </span>
      );
    }
    // 21. 操作の基本
    if (item.title.includes('操作の基本') || item.visuals?.includes('stepper_buttons')) {
      return (
        <span className="inline-flex items-center gap-0.5 rounded bg-gray-800 border border-gray-700 px-1 py-0.5 text-[9px] text-gray-300 shrink-0">
          <span>−</span>
          <span className="text-white font-mono">1.0</span>
          <span>＋</span>
        </span>
      );
    }
    return null;
  };

  /**
   * カテゴリアコーディオンヘッダー
   * - アイコン領域を固定幅（w-8 h-7）に統一して左揃えを整列
   * - ?マークを削除
   * - タイトルに「カテゴリ」を付与
   * - PC/スマホに応じた（クリック/タップで開閉）表示を追加
   */
  const renderCategoryAccordionHeader = (
    category: string,
    currentSection: SectionHelpKey,
    _isOpen: boolean
  ) => {
    // 1. セクションヘッダー系
    if (
      category.includes('セクションヘッダー') ||
      category.includes('プレビュー画面') ||
      category.includes('はじめに')
    ) {
      if (currentSection === 'clips') {
        return (
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-7 flex items-center justify-center shrink-0">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/25 border border-blue-400/50 text-blue-200 text-xs font-bold">
                  1
                </span>
              </div>
              <span className="text-xs sm:text-sm font-bold text-blue-300 truncate">
                動画・画像カテゴリ
              </span>
              <span className="text-[10px] sm:text-xs text-gray-400 font-normal shrink-0">
                <span className="inline md:hidden">（タップで{_isOpen ? '閉じる' : '開く'}）</span>
                <span className="hidden md:inline">（クリックで{_isOpen ? '閉じる' : '開く'}）</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center rounded-lg border border-gray-700 bg-gray-900/80 p-0.5">
                <span className="flex items-center gap-0.5 rounded px-1.5 py-0.5 bg-blue-600 text-white text-[10px] font-medium">
                  <RectangleHorizontal className="w-3 h-3" />
                </span>
                <span className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-gray-400 text-[10px]">
                  <RectangleVertical className="w-3 h-3" />
                </span>
              </div>
              <div className="p-1 rounded-lg border border-gray-700 bg-gray-800/80 text-gray-300">
                <Unlock className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold shadow-xs">
                <Upload className="w-3.5 h-3.5" />
                <span>追加</span>
              </div>
            </div>
          </div>
        );
      }
      if (currentSection === 'bgm') {
        return (
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-7 flex items-center justify-center shrink-0">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-500/25 border border-purple-400/50 text-purple-200 text-xs font-bold">
                  2
                </span>
              </div>
              <span className="text-xs sm:text-sm font-bold text-purple-300 truncate">
                BGMカテゴリ
              </span>
              <span className="text-[10px] sm:text-xs text-gray-400 font-normal shrink-0">
                <span className="inline md:hidden">（タップで{_isOpen ? '閉じる' : '開く'}）</span>
                <span className="hidden md:inline">（クリックで{_isOpen ? '閉じる' : '開く'}）</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 hidden sm:inline-block">
                (n件)
              </span>
              <span className="text-[10px] text-purple-300 bg-purple-950/60 border border-purple-600/40 px-1.5 py-0.5 rounded hidden sm:inline-block">
                自動調整ON
              </span>
              <div className="p-1 rounded-lg border border-gray-700 bg-gray-800/80 text-gray-300">
                <Unlock className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold shadow-xs">
                <Upload className="w-3.5 h-3.5" />
                <span>追加</span>
              </div>
            </div>
          </div>
        );
      }
      if (currentSection === 'narration') {
        return (
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-7 flex items-center justify-center shrink-0">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/25 border border-indigo-400/50 text-indigo-200 text-xs font-bold">
                  3
                </span>
              </div>
              <span className="text-xs sm:text-sm font-bold text-indigo-300 truncate">
                ナレーションカテゴリ
              </span>
              <span className="text-[10px] sm:text-xs text-gray-400 font-normal shrink-0">
                <span className="inline md:hidden">（タップで{_isOpen ? '閉じる' : '開く'}）</span>
                <span className="hidden md:inline">（クリックで{_isOpen ? '閉じる' : '開く'}）</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-linear-to-r from-indigo-600 to-blue-600 text-white text-[10px] font-semibold">
                <Sparkles className="w-3 h-3" />
                <span>AI原稿</span>
              </div>
              <div className="p-1 rounded-lg border border-gray-700 bg-gray-800/80 text-gray-300">
                <Unlock className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold shadow-xs">
                <Upload className="w-3.5 h-3.5" />
                <span>追加</span>
              </div>
            </div>
          </div>
        );
      }
      if (currentSection === 'caption') {
        return (
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-7 flex items-center justify-center shrink-0">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-500/25 border border-yellow-400/50 text-yellow-200 text-xs font-bold">
                  4
                </span>
              </div>
              <span className="text-xs sm:text-sm font-bold text-yellow-300 truncate">
                キャプションカテゴリ
              </span>
              <span className="text-[10px] sm:text-xs text-gray-400 font-normal shrink-0">
                <span className="inline md:hidden">（タップで{_isOpen ? '閉じる' : '開く'}）</span>
                <span className="hidden md:inline">（クリックで{_isOpen ? '閉じる' : '開く'}）</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="p-1 rounded-lg border border-gray-700 bg-gray-800/80 text-gray-300">
                <Eye className="w-3.5 h-3.5" />
              </div>
              <div className="p-1 rounded-lg border border-gray-700 bg-gray-800/80 text-gray-300">
                <Unlock className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yellow-500 text-black text-[11px] font-bold shadow-xs">
                <Plus className="w-3.5 h-3.5" />
                <span>追加</span>
              </div>
            </div>
          </div>
        );
      }
      if (currentSection === 'preview') {
        return (
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-7 flex items-center justify-center shrink-0">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/25 border border-green-400/50 text-green-200 text-xs font-bold">
                  5
                </span>
              </div>
              <span className="text-xs sm:text-sm font-bold text-green-300 truncate">
                プレビュー・出力カテゴリ
              </span>
              <span className="text-[10px] sm:text-xs text-gray-400 font-normal shrink-0">
                <span className="inline md:hidden">（タップで{_isOpen ? '閉じる' : '開く'}）</span>
                <span className="hidden md:inline">（クリックで{_isOpen ? '閉じる' : '開く'}）</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="p-1 rounded border border-gray-700 bg-gray-800 text-gray-400">
                <Square className="w-3 h-3 fill-current" />
              </div>
              <div className="p-1 rounded border border-gray-700 bg-gray-800 text-green-400">
                <Play className="w-3 h-3 fill-current" />
              </div>
              <div className="p-1 rounded border border-gray-700 bg-gray-800 text-gray-300">
                <Camera className="w-3 h-3" />
              </div>
            </div>
          </div>
        );
      }
      if (currentSection === 'app') {
        return (
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-7 flex items-center justify-center shrink-0">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/25 border border-emerald-400/50 text-emerald-200 text-xs font-bold">
                  ★
                </span>
              </div>
              <span className="text-xs sm:text-sm font-bold text-emerald-300 truncate">
                タートルビデオの基本カテゴリ
              </span>
              <span className="text-[10px] sm:text-xs text-gray-400 font-normal shrink-0">
                <span className="inline md:hidden">（タップで{_isOpen ? '閉じる' : '開く'}）</span>
                <span className="hidden md:inline">（クリックで{_isOpen ? '閉じる' : '開く'}）</span>
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0 text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded">
              ステップ 1〜5
            </div>
          </div>
        );
      }
    }

    // 2. 全体設定 / 音声一括設定 / キャプション一括設定 / エクスポート / 便利機能
    if (
      category.includes('全体設定') ||
      category.includes('一括設定') ||
      category.includes('エクスポート') ||
      category.includes('便利機能')
    ) {
      if (currentSection === 'clips') {
        return (
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-7 flex items-center justify-center shrink-0">
                <Settings className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-gray-100 truncate">
                全体設定
              </span>
              <span className="text-[10px] sm:text-xs text-gray-400 font-normal shrink-0">
                <span className="inline md:hidden">（タップで{_isOpen ? '閉じる' : '開く'}）</span>
                <span className="hidden md:inline">（クリックで{_isOpen ? '閉じる' : '開く'}）</span>
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-[11px] text-gray-400 shrink-0">
              <span>タイトル</span>
              <span>・</span>
              <span>ロゴ表示</span>
              <span>・</span>
              <span>音声 一括設定</span>
            </div>
          </div>
        );
      }
      if (category.includes('音声 一括設定')) {
        return (
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-7 flex items-center justify-center shrink-0">
                <Volume2 className="w-4 h-4 text-purple-400" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-gray-100 truncate">
                音声 一括設定
              </span>
              <span className="text-[10px] sm:text-xs text-gray-400 font-normal shrink-0">
                <span className="inline md:hidden">（タップで{_isOpen ? '閉じる' : '開く'}）</span>
                <span className="hidden md:inline">（クリックで{_isOpen ? '閉じる' : '開く'}）</span>
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-[11px] text-gray-400 shrink-0">
              <span>ミュート</span>
              <span>・</span>
              <span>音量統一</span>
              <span>・</span>
              <span>音量揃え</span>
            </div>
          </div>
        );
      }
      if (category.includes('キャプション 一括設定')) {
        return (
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-7 flex items-center justify-center shrink-0">
                <Type className="w-4 h-4 text-yellow-400" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-gray-100 truncate">
                キャプション 一括設定
              </span>
              <span className="text-[10px] sm:text-xs text-gray-400 font-normal shrink-0">
                <span className="inline md:hidden">（タップで{_isOpen ? '閉じる' : '開く'}）</span>
                <span className="hidden md:inline">（クリックで{_isOpen ? '閉じる' : '開く'}）</span>
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-[11px] text-gray-400 shrink-0">
              <span>スタイル</span>
              <span>・</span>
              <span>ふちどり色</span>
              <span>・</span>
              <span>配置位置</span>
            </div>
          </div>
        );
      }
      if (category.includes('エクスポート')) {
        return (
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-7 flex items-center justify-center shrink-0">
                <Download className="w-4 h-4 text-green-400" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-gray-100 truncate">
                動画書き出し（エクスポート）
              </span>
              <span className="text-[10px] sm:text-xs text-gray-400 font-normal shrink-0">
                <span className="inline md:hidden">（タップで{_isOpen ? '閉じる' : '開く'}）</span>
                <span className="hidden md:inline">（クリックで{_isOpen ? '閉じる' : '開く'}）</span>
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-[11px] text-green-300 shrink-0">
              <span>高速／標準／互換モード</span>
            </div>
          </div>
        );
      }
      if (currentSection === 'app') {
        return (
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-7 flex items-center justify-center shrink-0">
                <FolderOpen className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-gray-100 truncate">
                便利機能とトラブルシューティング
              </span>
              <span className="text-[10px] sm:text-xs text-gray-400 font-normal shrink-0">
                <span className="inline md:hidden">（タップで{_isOpen ? '閉じる' : '開く'}）</span>
                <span className="hidden md:inline">（クリックで{_isOpen ? '閉じる' : '開く'}）</span>
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-[11px] text-gray-400 shrink-0">
              <span>自動保存</span>
              <span>・</span>
              <span>最適化</span>
              <span>・</span>
              <span>ライセンス</span>
            </div>
          </div>
        );
      }
    }

    // 3. 各カード個別設定（clips, bgm, narration, caption）
    if (category.includes('カード') || category.includes('各キャプション行')) {
      if (currentSection === 'clips') {
        return (
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-7 flex items-center justify-center shrink-0">
                <div className="relative w-7 h-5 rounded bg-gray-700 border border-gray-600 flex items-center justify-center">
                  <span className="absolute -top-1 -left-1 bg-blue-600 text-[8px] text-white px-0.5 rounded font-bold leading-tight">
                    1
                  </span>
                  <ImageIcon className="w-3 h-3 text-gray-300" />
                </div>
              </div>
              <span className="text-xs sm:text-sm font-bold text-gray-100 truncate">
                動画・画像カードの設定
              </span>
              <span className="text-[10px] sm:text-xs text-gray-400 font-normal shrink-0">
                <span className="inline md:hidden">（タップで{_isOpen ? '閉じる' : '開く'}）</span>
                <span className="hidden md:inline">（クリックで{_isOpen ? '閉じる' : '開く'}）</span>
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <div className="p-1 rounded border border-gray-700 bg-gray-800/80 text-gray-300">
                <Unlock className="w-3 h-3" />
              </div>
              <div className="p-1 rounded border border-gray-700 bg-gray-800/80 text-gray-300">
                <ArrowUp className="w-3 h-3" />
              </div>
              <div className="p-1 rounded border border-gray-700 bg-gray-800/80 text-gray-300">
                <ArrowDown className="w-3 h-3" />
              </div>
              <div className="p-1 rounded border border-gray-700 bg-gray-800/80 text-blue-300">
                <Copy className="w-3 h-3" />
              </div>
              <div className="p-1 rounded border border-gray-700 bg-gray-800/80 text-red-300">
                <Trash2 className="w-3 h-3" />
              </div>
            </div>
          </div>
        );
      }
      if (currentSection === 'bgm') {
        return (
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-7 flex items-center justify-center shrink-0">
                <div className="w-7 h-5 rounded bg-purple-900/60 border border-purple-600/40 flex items-center justify-center">
                  <AudioLines className="w-3 h-3 text-purple-300" />
                </div>
              </div>
              <span className="text-xs sm:text-sm font-bold text-gray-100 truncate">
                BGMカードの設定
              </span>
              <span className="text-[10px] sm:text-xs text-gray-400 font-normal shrink-0">
                <span className="inline md:hidden">（タップで{_isOpen ? '閉じる' : '開く'}）</span>
                <span className="hidden md:inline">（クリックで{_isOpen ? '閉じる' : '開く'}）</span>
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <div className="p-1 rounded border border-gray-700 bg-gray-800/80 text-gray-300">
                <ArrowUp className="w-3 h-3" />
              </div>
              <div className="p-1 rounded border border-gray-700 bg-gray-800/80 text-gray-300">
                <ArrowDown className="w-3 h-3" />
              </div>
              <div className="p-1 rounded border border-gray-700 bg-gray-800/80 text-blue-300">
                <Copy className="w-3 h-3" />
              </div>
              <div className="p-1 rounded border border-gray-700 bg-gray-800/80 text-red-300">
                <Trash2 className="w-3 h-3" />
              </div>
            </div>
          </div>
        );
      }
      if (currentSection === 'narration') {
        return (
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-7 flex items-center justify-center shrink-0">
                <div className="w-7 h-5 rounded bg-indigo-900/60 border border-indigo-600/40 flex items-center justify-center">
                  <AudioLines className="w-3 h-3 text-indigo-300" />
                </div>
              </div>
              <span className="text-xs sm:text-sm font-bold text-gray-100 truncate">
                ナレーションカードの設定
              </span>
              <span className="text-[10px] sm:text-xs text-gray-400 font-normal shrink-0">
                <span className="inline md:hidden">（タップで{_isOpen ? '閉じる' : '開く'}）</span>
                <span className="hidden md:inline">（クリックで{_isOpen ? '閉じる' : '開く'}）</span>
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <div className="p-1 rounded border border-gray-700 bg-gray-800/80 text-gray-300">
                <ArrowUp className="w-3 h-3" />
              </div>
              <div className="p-1 rounded border border-gray-700 bg-gray-800/80 text-gray-300">
                <ArrowDown className="w-3 h-3" />
              </div>
              <div className="p-1 rounded border border-gray-700 bg-gray-800/80 text-blue-300">
                <Copy className="w-3 h-3" />
              </div>
              <div className="p-1 rounded border border-gray-700 bg-gray-800/80 text-red-300">
                <Trash2 className="w-3 h-3" />
              </div>
            </div>
          </div>
        );
      }
      if (currentSection === 'caption') {
        return (
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-7 flex items-center justify-center shrink-0">
                <div className="w-7 h-5 rounded bg-yellow-900/60 border border-yellow-600/40 flex items-center justify-center text-yellow-300 font-bold text-[10px]">
                  T
                </div>
              </div>
              <span className="text-xs sm:text-sm font-bold text-gray-100 truncate">
                各キャプション行の設定
              </span>
              <span className="text-[10px] sm:text-xs text-gray-400 font-normal shrink-0">
                <span className="inline md:hidden">（タップで{_isOpen ? '閉じる' : '開く'}）</span>
                <span className="hidden md:inline">（クリックで{_isOpen ? '閉じる' : '開く'}）</span>
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] text-gray-400 bg-gray-800 px-1 py-0.5 rounded border border-gray-700">
                0:00.0〜
              </span>
              <div className="p-1 rounded border border-gray-700 bg-gray-800/80 text-gray-300">
                <Settings className="w-3 h-3" />
              </div>
              <div className="p-1 rounded border border-gray-700 bg-gray-800/80 text-red-300">
                <Trash2 className="w-3 h-3" />
              </div>
            </div>
          </div>
        );
      }
    }

    // デフォルト
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-8 h-7 flex items-center justify-center shrink-0">
          <span className="w-1.5 h-4 bg-blue-500 rounded-full" />
        </div>
        <span className="text-xs sm:text-sm font-bold text-white truncate">{category}</span>
        <span className="text-[10px] sm:text-xs text-gray-400 font-normal shrink-0">
          <span className="inline md:hidden">（タップで{_isOpen ? '閉じる' : '開く'}）</span>
          <span className="hidden md:inline">（クリックで{_isOpen ? '閉じる' : '開く'}）</span>
        </span>
      </div>
    );
  };

  // 各ヘルプ項目の詳細内容を描画
  const renderItemContent = (item: SectionHelpItem) => {
    // 箇条書き内で使用された visualId を収集（下部での重複描画を防ぐ）
    const usedVisuals = new Set<string>();
    if (item.bullets) {
      item.bullets.forEach((bullet) => {
        if (typeof bullet === 'object' && bullet !== null && bullet.visuals) {
          bullet.visuals.forEach((v) => usedVisuals.add(v));
        }
      });
    }

    // 箇条書きに紐づいていない残りの全体 visualId
    const remainingVisuals = (item.visuals || []).filter(
      (v) => !usedVisuals.has(v)
    );

    return (
      <div className="space-y-2.5">
        <p className="text-xs md:text-sm text-gray-300 leading-relaxed">
          {item.description}
        </p>
        {item.bullets && item.bullets.length > 0 && (
          <ul className="space-y-2 text-xs leading-relaxed text-gray-300 md:text-sm">
            {item.bullets.map((bullet, bulletIndex) => {
              const isObj = typeof bullet === 'object' && bullet !== null;
              const text = isObj ? bullet.text : bullet;
              const bulletVisuals = isObj ? bullet.visuals : undefined;

              return (
                <li
                  key={`${item.title}-bullet-${bulletIndex}`}
                  className="space-y-1.5 pl-0.5"
                >
                  <div className="flex items-start gap-1.5">
                    <span className="text-blue-400 font-bold shrink-0 leading-relaxed">・</span>
                    <span className="flex-1">{text}</span>
                  </div>
                  {bulletVisuals && bulletVisuals.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pl-4 pt-0.5">
                      {bulletVisuals.map((visual, vIdx) =>
                        renderVisualToken(visual, vIdx)
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {item.facts && item.facts.length > 0 && (
          <dl className="grid gap-1.5 sm:grid-cols-2">
            {item.facts.map((fact, factIndex) => (
              <div
                key={`${item.title}-fact-${factIndex}`}
                className="rounded-lg border border-gray-700/80 bg-gray-900/45 px-2.5 py-2"
              >
                <dt className="text-[10px] font-semibold text-blue-300 md:text-xs">
                  {fact.label}
                </dt>
                <dd className="mt-0.5 text-[11px] leading-relaxed text-gray-300 md:text-xs">
                  {fact.description}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {item.comparison && (
          <div className="overflow-hidden rounded-lg border border-gray-700/80">
            <table
              className="w-full table-fixed text-left text-[11px] md:text-xs"
              aria-label={item.comparison.caption}
            >
              <caption className="sr-only">{item.comparison.caption}</caption>
              <thead className="bg-gray-900/75 text-gray-400">
                <tr>
                  <th
                    scope="col"
                    className="w-16 px-2.5 py-2 font-semibold md:w-20"
                  >
                    設定
                  </th>
                  <th scope="col" className="px-2.5 py-2 font-semibold">
                    動作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/80 bg-gray-900/35 text-gray-300">
                {item.comparison.rows.map((row, rowIndex) => (
                  <tr key={`${item.title}-comparison-${rowIndex}`}>
                    <th
                      scope="row"
                      className="px-2.5 py-2 align-top font-semibold text-white"
                    >
                      {row.label}
                    </th>
                    <td className="px-2.5 py-2 leading-relaxed">
                      {row.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {item.note && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-2.5 py-2 text-[11px] leading-relaxed text-amber-100 md:text-xs">
            <span className="mr-1 font-semibold text-amber-300">ポイント:</span>
            {item.note}
          </div>
        )}
        {remainingVisuals.length > 0 && (
          <div className="flex flex-wrap w-full gap-1.5 pt-1">
            {remainingVisuals.map((visual, visualIndex) =>
              renderVisualToken(visual, visualIndex)
            )}
          </div>
        )}
      {item.accordions && item.accordions.length > 0 && (
        <div className="space-y-2 pt-1">
          {item.accordions.map((accordion, accordionIndex) => (
            <details
              key={`${item.title}-accordion-${accordionIndex}`}
              className="rounded-lg border-2 border-gray-600/80 bg-gray-900/55"
            >
              <summary className="cursor-pointer select-none list-none px-3 py-2 text-xs md:text-sm text-gray-100 font-semibold flex items-center justify-between gap-2">
                <span>{accordion.title}</span>
                <span className="text-[10px] md:text-xs text-gray-400">
                  <span className="inline md:hidden">タップで開閉</span>
                  <span className="hidden md:inline">クリックで開閉</span>
                </span>
              </summary>
              <div className="px-3 pb-2">
                <ul className="space-y-1">
                  {accordion.items.map((line, lineIndex) => (
                    <li
                      key={`${item.title}-accordion-${accordionIndex}-line-${lineIndex}`}
                      className="text-[11px] md:text-xs text-gray-300 leading-relaxed"
                    >
                      ・{line}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ))}
        </div>
      )}
      </div>
    );
  };

  // 直接表示ブロック（アコーディオン無し）
  const renderHelpItemBlock = (item: SectionHelpItem, globalIndex: number) => (
    <div
      key={`${item.title}-${globalIndex}`}
      className="rounded-xl border-2 border-gray-600/70 bg-gray-800/50 p-3 space-y-2.5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2 border-b border-gray-600/60 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold shrink-0">
            {globalIndex + 1}
          </span>
          <h4 className="text-xs sm:text-sm font-bold text-white truncate">
            {item.title}
          </h4>
        </div>
        {renderHeaderQuickSample(item)}
      </div>
      {renderItemContent(item)}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[320] bg-black/75 backdrop-blur-sm flex items-end md:items-center md:justify-center md:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${help.title}ヘルプ`}
    >
      <div
        className="w-full md:max-w-2xl max-h-[calc(100dvh-0.5rem)] md:max-h-[88vh] bg-gray-900 border border-gray-700 rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleSheetTouchStart}
        onTouchMove={handleSheetTouchMove}
        onTouchEnd={handleSheetTouchEnd}
        onTouchCancel={resetTouchTracking}
      >
        <div className="md:hidden pt-2 px-4">
          <div className="mx-auto h-1 w-12 rounded-full bg-gray-600/80" />
        </div>
        <div className="p-4 border-b border-gray-700 flex items-center justify-between bg-gray-850">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border shrink-0 ${accent}`}
            >
              <CircleHelp className="w-3.5 h-3.5" />
              ヘルプ
            </span>
            <h3 className="font-bold text-sm md:text-base text-white truncate">{help.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-gray-600/80 bg-gray-800/80 text-gray-200 hover:text-white hover:bg-gray-700 hover:border-gray-500 transition"
            title="閉じる"
            aria-label="ヘルプを閉じる"
          >
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        <div
          ref={contentScrollRef}
          className="flex-1 min-h-0 p-4 md:p-5 overflow-y-auto space-y-4 overscroll-contain pb-[calc(env(safe-area-inset-bottom)+1rem)] md:pb-5"
        >
          {help.subtitle.trim().length > 0 && (
            <p className="text-xs md:text-sm text-gray-300 leading-relaxed">{help.subtitle}</p>
          )}

          {/* 目次・開閉操作バー */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-2">
            <span className="text-[11px] md:text-xs text-gray-400">
              <span className="inline md:hidden">各項目をタップして開閉できます（閉じておくと目次になります）</span>
              <span className="hidden md:inline">各項目をクリックして開閉できます（閉じておくと目次になります）</span>
            </span>
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <button
                type="button"
                onClick={handleExpandAll}
                className="px-2.5 py-1 text-[11px] rounded-lg border border-gray-700 bg-gray-800/90 text-gray-300 hover:text-white hover:bg-gray-700 transition"
              >
                すべて開く
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                className="px-2.5 py-1 text-[11px] rounded-lg border border-gray-700 bg-gray-800/90 text-gray-300 hover:text-white hover:bg-gray-700 transition"
              >
                すべて閉じる
              </button>
            </div>
          </div>

          {/* カテゴリごとのアコーディオン一覧 */}
          <div className="space-y-3.5">
            {groupedItems.map((group) => {
              const isCatOpen = openCategories.has(group.category);
              const directItems = group.items.filter(({ item }) => !item.isSubAccordion);
              const subAccordionItems = group.items.filter(({ item }) => item.isSubAccordion);

              return (
                <div
                  key={group.category}
                  className={`rounded-2xl border-2 transition-colors overflow-hidden ${
                    isCatOpen
                      ? 'border-gray-500/90 bg-gray-900/95 shadow-xl shadow-black/25'
                      : 'border-gray-600/80 bg-gray-800/40 hover:border-gray-500/80 hover:bg-gray-800/60'
                  }`}
                >
                  {/* 親アコーディオンヘッダー（実画面のパーツを模したバー） */}
                  <button
                    type="button"
                    onClick={() => toggleCategory(group.category)}
                    aria-expanded={isCatOpen}
                    aria-label={`${group.category}（開閉）`}
                    className="w-full flex items-center justify-between gap-2 p-2.5 sm:p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      {renderCategoryAccordionHeader(group.category, section, isCatOpen)}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-gray-400 pl-1">
                      <span className="text-[11px] md:text-xs whitespace-nowrap">
                        <span className="inline md:hidden">{isCatOpen ? '（閉じる）' : '（開く）'}</span>
                        <span className="hidden md:inline">{isCatOpen ? '（閉じる）' : '（開く）'}</span>
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${
                          isCatOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {/* カテゴリ本文（開閉アニメーション・アクセシビリティ対応） */}
                  <div
                    className={
                      isCatOpen
                        ? 'block px-3 pb-3 pt-2 border-t-2 border-gray-700/80 space-y-3'
                        : 'hidden'
                    }
                  >
                    {/* 1. 直接表示項目（アコーディオン無しで並ぶ） */}
                    {directItems.length > 0 && (
                      <div className="space-y-3">
                        {directItems.map(({ item, globalIndex }) =>
                          renderHelpItemBlock(item, globalIndex)
                        )}
                      </div>
                    )}

                    {/* 2. 子アコーディオン項目（各調整項目） */}
                    {subAccordionItems.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-gray-800/80">
                        <div className="text-[11px] font-bold text-gray-400 px-1 flex items-center gap-1.5">
                          <span className="w-1 h-3 bg-blue-400 rounded-full" />
                          <span>カードの調整項目</span>
                          <span className="text-[10px] text-gray-500 font-normal">
                            <span className="inline md:hidden">（タップで開閉）</span>
                            <span className="hidden md:inline">（クリックで開閉）</span>
                          </span>
                        </div>
                        {subAccordionItems.map(({ item, globalIndex }) => {
                          const subKey = `${item.title}-${globalIndex}`;
                          const isSubOpen = openSubItems.has(subKey);
                          return (
                            <div
                              key={subKey}
                              className={`rounded-xl border-2 transition-colors ${
                                isSubOpen
                                  ? 'border-gray-500/80 bg-gray-800/90 shadow-sm'
                                  : 'border-gray-600/70 bg-gray-800/40 hover:border-gray-500/70 hover:bg-gray-800/60'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => toggleSubItem(subKey)}
                                aria-expanded={isSubOpen}
                                aria-label={`${item.title}のヘルプを開閉`}
                                className="w-full flex items-center justify-between gap-2 p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-xl cursor-pointer"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-xs sm:text-sm font-semibold text-gray-100">
                                    {item.title}
                                  </span>
                                  <span className="text-[10px] md:text-xs text-gray-400 font-normal shrink-0">
                                    <span className="inline md:hidden">（タップで{isSubOpen ? '閉じる' : '開く'}）</span>
                                    <span className="hidden md:inline">（クリックで{isSubOpen ? '閉じる' : '開く'}）</span>
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 text-gray-400">
                                  <span className="text-[11px] md:text-xs">
                                    <span className="inline md:hidden">{isSubOpen ? '（閉じる）' : '（開く）'}</span>
                                    <span className="hidden md:inline">{isSubOpen ? '（閉じる）' : '（開く）'}</span>
                                  </span>
                                  <ChevronDown
                                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                      isSubOpen ? 'rotate-180' : ''
                                    }`}
                                  />
                                </div>
                              </button>
                              <div
                                className={
                                  isSubOpen
                                    ? 'block px-3 pb-3 pt-2 border-t border-gray-600/70'
                                    : 'hidden'
                                }
                              >
                                {renderItemContent(item)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(SectionHelpModal);
