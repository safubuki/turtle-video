/**
 * @file AiModal.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description AIナレーションを生成するためのモーダルダイアログ。
 * PCでは番号付き枠で区切った左右2カラム（①原稿 → ②声・話し方）、
 * スマホでは2タブ構成＋下部固定作成バーで縦長・重複を解消し、
 * 代表ボイス＆よく使う声のワンタップ選択、瞬間タグ挿入、整理されたボイス探索を提供する。
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  X,
  Loader,
  FileText,
  Mic,
  CircleHelp,
  Check,
  RotateCcw,
  Volume2,
  AlertTriangle,
  ExternalLink,
  Settings,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Star,
} from 'lucide-react';
import type {
  VoiceOption,
  NarrationScriptLength,
  VoiceGenderFilter,
  NarrationTtsEngine,
  NarrationTtsTone,
  NarrationTtsPace,
} from '../../types';
import {
  formatVoiceOptionLabel,
  getVoiceOption,
  isVoiceId,
  resolveVoiceSelectOptions,
} from '../../constants';
import { getStoredApiKey } from './SettingsModal';
import { listGemini38Voices, type Gemini38Voice } from '../../utils/gemini38Voices';
import {
  BASIC_VOICE_MOOD_GROUPS,
  EXTRA_VOICE_AGE_GROUPS,
  formatCompactExtraVoiceCard,
  formatPersonaLabel,
  formatContextLabel,
  formatVoiceDescription,
  wrapVoiceTooltip,
  getPersonaSelectOptions,
  getContextSelectOptions,
  voiceMatchesAgeGroup,
  voiceMatchesBasicMood,
  voiceMatchesPurposeGroup,
  type BasicVoiceMoodGroup,
  type ExtraVoiceAgeGroup,
  type VoicePurposeGroup,
} from '../../utils/gemini38VoiceCategories';
import {
  NARRATION_EXTRA_INLINE_EVENT_PRESETS,
  NARRATION_INLINE_EVENT_PRESETS,
  NARRATION_TONE_PRESETS,
  clearAllDeliveryMarkers,
  insertInlineEventMarker,
  listAppliedInlineEventLabels,
  listAppliedToneLabels,
  stripDeliveryMarkers,
  unwrapRangeTone,
  wrapRangeWithTone,
} from '../../utils/narrationDelivery';
import {
  GEMINI_38_ATMOSPHERE_PRESETS,
  TONE_FALLBACK_LABELS,
  resolveActiveAtmospherePresetId,
  type Gemini38AtmospherePreset,
} from '../../utils/gemini38Tts';
import {
  QUICK_FEMALE_VOICES,
  QUICK_MALE_VOICES,
  ensureAiVoiceInHistory,
  getFrequentAiVoices,
  recordAiVoiceUsage,
  type AiVoiceUsageEntry,
} from '../../utils/aiVoiceRecents';
import { useDisableBodyScroll } from '../../hooks/useDisableBodyScroll';

interface AiModalProps {
  isOpen: boolean;
  offlineMode?: boolean;
  onClose: () => void;
  aiPrompt: string;
  aiScript: string;
  aiScriptLength: NarrationScriptLength;
  aiVoice: string;
  aiVoiceStyle: string;
  aiNarrationScene: string;
  aiTtsEngine: NarrationTtsEngine;
  aiTtsTone: NarrationTtsTone;
  aiTtsPace: NarrationTtsPace;
  aiTtsStyleDetail: string;
  isAiLoading: boolean;
  voiceOptions: VoiceOption[];
  onPromptChange: (value: string) => void;
  onScriptChange: (value: string) => void;
  onScriptLengthChange: (value: NarrationScriptLength) => void;
  onVoiceChange: (value: string) => void;
  onVoiceStyleChange: (value: string) => void;
  onNarrationSceneChange: (scene: string) => void;
  onTtsEngineChange: (engine: NarrationTtsEngine) => void;
  onTtsToneChange: (tone: NarrationTtsTone) => void;
  onTtsPaceChange: (pace: NarrationTtsPace) => void;
  onTtsStyleDetailChange: (style: string) => void;
  onGenerateScript: () => void;
  onGenerateSpeech: () => void;
  onOpenHelp?: () => void;
}

const PACE_OPTIONS: ReadonlyArray<{ value: NarrationTtsPace; label: string }> = [
  { value: 'slow', label: 'ゆっくり' },
  { value: 'normal', label: '標準' },
  { value: 'fast', label: '速め' },
];

const ENGINE_OPTIONS: ReadonlyArray<{ value: NarrationTtsEngine; label: string }> = [
  { value: 'gemini-3.8-flash-tts', label: '高音質 Flash' },
  { value: 'gemini-3.8-flash-lite-tts', label: '高速 Flash-Lite' },
];

const SCRIPT_LENGTH_OPTIONS: ReadonlyArray<{ value: NarrationScriptLength; label: string }> = [
  { value: 'short', label: '短め' },
  { value: 'medium', label: '中くらい' },
  { value: 'long', label: '長め' },
];

/** 追加音声向けの簡潔な日本語用途チップ（ごちゃつきを抑えた6択） */
const EXTRA_VOICE_PURPOSE_CHIPS: ReadonlyArray<{ id: VoicePurposeGroup; label: string }> = [
  { id: 'all', label: 'すべて' },
  { id: 'narration', label: '解説・動画' },
  { id: 'storytelling', label: '物語・朗読' },
  { id: 'character', label: '会話・親しみ' },
  { id: 'commercial', label: 'CM・PR' },
  { id: 'announcement', label: 'ニュース・案内' },
];

/** 基本ボイスの説明文から二重の英語括弧表記を避けて整形する */
function formatBasicVoiceDesc(voice: VoiceOption): string {
  const desc = voice.desc.trim();
  if (!voice.traitEn) return desc;
  if (desc.toLowerCase().includes(voice.traitEn.toLowerCase())) {
    return desc;
  }
  return `${desc}（${voice.traitEn}）`;
}

/** 基本ボイスの日本語のみの短い特徴名を取り出す */
function extractShortJapaneseTrait(desc: string): string {
  return desc.replace(/[（(][^）)]*[）)]/g, '').trim() || desc;
}

/**
 * AIナレーション生成モーダル
 */
const AiModal: React.FC<AiModalProps> = ({
  isOpen,
  offlineMode = false,
  onClose,
  onOpenHelp,
  aiPrompt,
  aiScript,
  aiScriptLength,
  aiVoice,
  aiVoiceStyle: _aiVoiceStyle,
  aiNarrationScene: _aiNarrationScene,
  aiTtsEngine,
  aiTtsTone,
  aiTtsPace,
  aiTtsStyleDetail,
  isAiLoading,
  voiceOptions,
  onPromptChange,
  onScriptChange,
  onScriptLengthChange,
  onVoiceChange,
  onVoiceStyleChange: _onVoiceStyleChange,
  onNarrationSceneChange: _onNarrationSceneChange,
  onTtsEngineChange,
  onTtsToneChange,
  onTtsPaceChange,
  onTtsStyleDetailChange,
  onGenerateScript,
  onGenerateSpeech,
}) => {
  useDisableBodyScroll(isOpen);

  const [apiKey, setApiKey] = useState(() => getStoredApiKey() || import.meta.env.VITE_GEMINI_API_KEY || '');
  const [activeMobileTab, setActiveMobileTab] = useState<'script' | 'voice'>('script');
  const [isPromptPanelOpen, setIsPromptPanelOpen] = useState(true);
  const [isVoiceExplorerOpen, setIsVoiceExplorerOpen] = useState(false);
  const [frequentVoices, setFrequentVoices] = useState<AiVoiceUsageEntry[]>(() => getFrequentAiVoices(4));

  /** 声探しサブビューの状態 */
  const [voiceGenderFilter, setVoiceGenderFilter] = useState<VoiceGenderFilter>('all');
  const [basicVoiceMood, setBasicVoiceMood] = useState<BasicVoiceMoodGroup>('all');
  const [extraPurposeGroup, setExtraPurposeGroup] = useState<VoicePurposeGroup>('all');
  const [extraAgeGroup, setExtraAgeGroup] = useState<ExtraVoiceAgeGroup>('all');
  const [showDetailedExtraFilters, setShowDetailedExtraFilters] = useState(false);
  const [voiceSource, setVoiceSource] = useState<'basic' | 'library'>('basic');
  const [voiceSearch, setVoiceSearch] = useState('');
  const [voiceLanguage, setVoiceLanguage] = useState<'ja' | 'en'>('ja');
  const [voicePersona, setVoicePersona] = useState('');
  const [voiceContext, setVoiceContext] = useState('');
  const [libraryVoices, setLibraryVoices] = useState<Gemini38Voice[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const libraryRequestRef = useRef<AbortController | null>(null);

  /** 区間語り口調の自由入力 */
  const [customToneText, setCustomToneText] = useState('');
  const [selectionHint, setSelectionHint] = useState('');
  const [isExtraInlineEventsOpen, setIsExtraInlineEventsOpen] = useState(false);
  const scriptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingTextareaRestoreRef = useRef<{ caret: number; scrollTop: number } | null>(null);
  const modalHistoryIdRef = useRef<string | null>(null);
  const closedByPopstateRef = useRef(false);
  const sheetScrollRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartScrollTopRef = useRef(0);
  const touchDeltaYRef = useRef(0);
  const swipeCloseEligibleRef = useRef(false);

  const hasApiKey = Boolean(apiKey.trim());

  useEffect(() => {
    if (isOpen) {
      setApiKey(getStoredApiKey() || import.meta.env.VITE_GEMINI_API_KEY || '');
      setFrequentVoices(getFrequentAiVoices(4));
      setIsVoiceExplorerOpen(false);
      setActiveMobileTab('script');
      setShowDetailedExtraFilters(false);
      setIsExtraInlineEventsOpen(false);
      // 既存原稿の再編集（テーマ空・原稿あり）は原稿欄を広く見せるため初期折りたたみ
      setIsPromptPanelOpen(!aiScript.trim() || Boolean(aiPrompt.trim()));
      setVoiceSource(!isVoiceId(aiVoice) ? 'library' : 'basic');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    setLibraryLoading(false);
    return () => {
      libraryRequestRef.current?.abort();
      libraryRequestRef.current = null;
    };
  }, [isOpen, aiTtsEngine, offlineMode]);

  useEffect(() => {
    if (isOpen && isVoiceExplorerOpen && voiceSource === 'library' && !libraryLoaded && !libraryLoading && libraryVoices.length === 0) {
      void loadVoiceLibrary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isVoiceExplorerOpen, voiceSource, libraryLoaded, libraryLoading, libraryVoices.length]);

  const isEditableTouchTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    return target.closest('textarea, input:not([type="radio"]):not([type="checkbox"]):not([type="range"]), select, [contenteditable="true"]') !== null;
  };

  const isMobileViewport = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  };

  const voiceGenderFilterOptions: { id: VoiceGenderFilter; label: string }[] = [
    { id: 'all', label: '全て' },
    { id: 'female', label: '女性' },
    { id: 'male', label: '男性' },
  ];

  const loadVoiceLibrary = async () => {
    libraryRequestRef.current?.abort();
    libraryRequestRef.current = null;
    setLibraryLoading(false);
    setLibraryVoices([]);
    setLibraryLoaded(false);
    if (offlineMode) {
      setLibraryError('オフラインモードを解除すると追加の声を読み込めます。');
      return;
    }
    const storedKey = getStoredApiKey() || import.meta.env.VITE_GEMINI_API_KEY || '';
    if (!storedKey) {
      setLibraryError('APIキーを設定すると追加の声を読み込めます。');
      return;
    }
    const controller = new AbortController();
    libraryRequestRef.current = controller;
    setLibraryLoading(true);
    setLibraryError('');
    try {
      const voices = await listGemini38Voices(storedKey, controller.signal);
      if (!controller.signal.aborted) {
        setLibraryVoices(voices);
        setLibraryLoaded(true);
        const savedVoice = !isVoiceId(aiVoice) && voices.find((voice) => voice.id === aiVoice);
        if (savedVoice) {
          setVoiceLanguage(savedVoice.languageCode.slice(0, 2).toLowerCase() as 'ja' | 'en');
          setVoicePersona('');
          setVoiceContext('');
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setLibraryError(error instanceof Error ? error.message : '音声一覧の取得に失敗しました。');
      }
    } finally {
      if (!controller.signal.aborted) setLibraryLoading(false);
      if (libraryRequestRef.current === controller) libraryRequestRef.current = null;
    }
  };

  const extraVoices = useMemo(
    () => libraryVoices.filter((voice) => !voiceOptions.some((option) => option.id === voice.id)),
    [libraryVoices, voiceOptions],
  );
  const languageVoices = useMemo(
    () => extraVoices.filter((voice) => voice.languageCode.toLowerCase().startsWith(voiceLanguage)),
    [extraVoices, voiceLanguage],
  );

  const jaVoiceCount = useMemo(
    () => extraVoices.filter((v) => v.languageCode.toLowerCase().startsWith('ja')).length,
    [extraVoices],
  );
  const enVoiceCount = useMemo(
    () => extraVoices.filter((v) => v.languageCode.toLowerCase().startsWith('en')).length,
    [extraVoices],
  );

  const contextOptions = useMemo(
    () => getContextSelectOptions(languageVoices, voiceLanguage, voiceGenderFilter),
    [languageVoices, voiceLanguage, voiceGenderFilter],
  );
  const personaOptions = useMemo(
    () => getPersonaSelectOptions(languageVoices, voiceLanguage, voiceGenderFilter, voiceContext),
    [languageVoices, voiceLanguage, voiceGenderFilter, voiceContext],
  );

  const normalizedSearch = voiceSearch.trim().toLocaleLowerCase();
  const matchesSearch = (id: string, label: string, description: string, language = '') =>
    !normalizedSearch || `${id} ${label} ${description} ${language}`.toLocaleLowerCase().includes(normalizedSearch);

  const filteredBaseVoices = useMemo(
    () => resolveVoiceSelectOptions(voiceOptions, voiceGenderFilter, aiVoice)
      .filter((voice) =>
        voice.id === aiVoice
        || (voiceMatchesBasicMood(voice, basicVoiceMood) && matchesSearch(voice.id, voice.label, voice.desc)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [voiceOptions, voiceGenderFilter, basicVoiceMood, aiVoice, normalizedSearch],
  );
  const baseVoiceChoices = filteredBaseVoices.filter((voice) => voice.id !== aiVoice);

  const filteredExtraVoices = useMemo(
    () => languageVoices.filter((voice) => {
      const compact = formatCompactExtraVoiceCard(voice);
      return (
        voiceMatchesPurposeGroup(voice, extraPurposeGroup)
        && voiceMatchesAgeGroup(voice, extraAgeGroup)
        && (!voicePersona || voice.persona.trim() === voicePersona.trim())
        && (!voiceContext || voice.context.trim() === voiceContext.trim())
        && (voiceGenderFilter === 'all' || voice.gender === voiceGenderFilter)
        && matchesSearch(
          voice.id,
          `${voice.label} ${compact.primaryTitle} ${compact.ageLabel}`,
          `${compact.summaryLine} ${voice.description} ${voice.persona} ${voice.context}`,
          voice.languageCode,
        )
      );
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [languageVoices, extraPurposeGroup, extraAgeGroup, voicePersona, voiceContext, voiceGenderFilter, normalizedSearch],
  );
  const extraVoiceChoices = filteredExtraVoices.filter((voice) => voice.id !== aiVoice);

  const selectedVoice = getVoiceOption(aiVoice) ?? voiceOptions.find((voice) => voice.id === aiVoice);
  const selectedExtraVoice = extraVoices.find((voice) => voice.id === aiVoice);
  const selectedExtraCompact = useMemo(
    () => (selectedExtraVoice ? formatCompactExtraVoiceCard(selectedExtraVoice) : null),
    [selectedExtraVoice],
  );
  const selectedFrequentEntry = frequentVoices.find((entry) => entry.id === aiVoice);
  const filteredCount = voiceSource === 'library'
    ? extraVoiceChoices.length
    : baseVoiceChoices.length;
  const voiceVisibleInSelect = voiceSource === 'library'
    ? filteredExtraVoices.some((voice) => voice.id === aiVoice)
    : filteredBaseVoices.some((voice) => voice.id === aiVoice);

  const hasActiveVoiceFilters =
    voiceGenderFilter !== 'all'
    || basicVoiceMood !== 'all'
    || extraPurposeGroup !== 'all'
    || extraAgeGroup !== 'all'
    || Boolean(voicePersona)
    || Boolean(voiceContext)
    || Boolean(voiceSearch);

  const resetVoiceFilters = () => {
    setVoiceGenderFilter('all');
    setBasicVoiceMood('all');
    setExtraPurposeGroup('all');
    setExtraAgeGroup('all');
    setVoicePersona('');
    setVoiceContext('');
    setVoiceSearch('');
  };

  /** 声IDから「よく使う声」チップ用の表示メタを解決する */
  const resolveVoiceChipMeta = (id: string, entry?: AiVoiceUsageEntry) => {
    const quick = [...QUICK_FEMALE_VOICES, ...QUICK_MALE_VOICES].find((v) => v.id === id);
    const basic = getVoiceOption(id) ?? voiceOptions.find((v) => v.id === id);
    if (basic) {
      return {
        id: basic.id,
        label: basic.label,
        shortLabel: quick?.shortLabel || extractShortJapaneseTrait(basic.desc),
        gender: basic.gender as 'female' | 'male',
        count: entry?.count,
      };
    }
    const extra = extraVoices.find((v) => v.id === id);
    if (extra) {
      const compact = formatCompactExtraVoiceCard(extra);
      return {
        id: extra.id,
        label: extra.label,
        shortLabel: compact.primaryTitle,
        gender: extra.gender,
        count: entry?.count,
      };
    }
    return {
      id,
      label: entry?.label || id,
      shortLabel: entry?.shortLabel || 'カスタム声',
      gender: entry?.gender ?? ('neutral' as const),
      count: entry?.count,
    };
  };

  /** 通常画面の「よく使う声・最近の声」チップ一覧（最大4件・代表声を選んでも消えずワンタップで戻せる） */
  const quickFrequentChips = useMemo(() => {
    const list: Array<{
      id: string;
      label: string;
      shortLabel: string;
      gender: 'female' | 'male' | 'neutral' | 'unknown';
      count?: number;
    }> = [];
    const seen = new Set<string>();

    for (const entry of frequentVoices) {
      if (seen.has(entry.id)) continue;
      list.push(resolveVoiceChipMeta(entry.id, entry));
      seen.add(entry.id);
      if (list.length >= 4) break;
    }

    if (aiVoice && !seen.has(aiVoice)) {
      const currentEntry = frequentVoices.find((item) => item.id === aiVoice);
      const currentMeta = resolveVoiceChipMeta(aiVoice, currentEntry);
      if (list.length < 4) {
        list.push(currentMeta);
      } else {
        list[list.length - 1] = currentMeta;
      }
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiVoice, extraVoices, frequentVoices, voiceOptions]);

  const appliedToneLabels = useMemo(() => listAppliedToneLabels(aiScript), [aiScript]);
  const appliedInlineLabels = useMemo(() => listAppliedInlineEventLabels(aiScript), [aiScript]);
  const plainScriptLength = useMemo(() => stripDeliveryMarkers(aiScript).trim().length, [aiScript]);
  const estimatedSpeechSec = plainScriptLength > 0 ? Math.max(1, Math.round(plainScriptLength / 5.5)) : 0;
  const activeAtmosphereId = useMemo(
    () => resolveActiveAtmospherePresetId(aiTtsTone, aiTtsStyleDetail),
    [aiTtsTone, aiTtsStyleDetail],
  );

  const selectedVoiceDisplayName = selectedVoice
    ? selectedVoice.label
    : selectedExtraCompact
      ? selectedExtraCompact.primaryTitle
      : selectedFrequentEntry?.shortLabel || selectedFrequentEntry?.label || aiVoice;
  const selectedVoiceGender = selectedVoice
    ? selectedVoice.gender
    : selectedExtraVoice
      ? selectedExtraVoice.gender
      : selectedFrequentEntry?.gender;
  const selectedVoiceDesc = selectedVoice
    ? formatBasicVoiceDesc(selectedVoice)
    : selectedExtraCompact
      ? [selectedExtraCompact.ageLabel, selectedExtraCompact.summaryLine, selectedExtraCompact.rawName].filter(Boolean).join(' · ')
      : selectedFrequentEntry?.label && selectedFrequentEntry.label !== selectedVoiceDisplayName
        ? selectedFrequentEntry.label
        : '';

  const activeAtmosphereLabel = useMemo(() => {
    const matched = GEMINI_38_ATMOSPHERE_PRESETS.find((preset) => preset.id === activeAtmosphereId);
    if (matched) return matched.label;
    if (aiTtsStyleDetail.trim()) return aiTtsStyleDetail.trim();
    return TONE_FALLBACK_LABELS[aiTtsTone] || '自然（標準）';
  }, [activeAtmosphereId, aiTtsStyleDetail, aiTtsTone]);

  const activePaceLabel = PACE_OPTIONS.find((opt) => opt.value === aiTtsPace)?.label ?? '標準';
  const activeEngineLabel = aiTtsEngine === 'gemini-3.8-flash-lite-tts' ? '高速 Lite' : '高音質 Flash';

  const selectVoiceWithTracking = (
    voiceId: string,
    meta?: { label?: string; gender?: 'female' | 'male' | 'neutral' | 'unknown'; shortLabel?: string; closeExplorer?: boolean },
  ) => {
    // 誤って別の声を押しても直前の声へすぐ戻せるよう、切り替え前の声も未登録なら履歴へ保護する
    if (aiVoice && aiVoice !== voiceId) {
      const prevMeta = resolveVoiceChipMeta(aiVoice, selectedFrequentEntry);
      ensureAiVoiceInHistory({
        id: prevMeta.id,
        label: prevMeta.label,
        gender: prevMeta.gender,
        shortLabel: prevMeta.shortLabel,
      });
    }
    onVoiceChange(voiceId);
    if (voiceId !== aiVoice || meta?.closeExplorer) {
      const nextMeta = resolveVoiceChipMeta(voiceId);
      const updated = recordAiVoiceUsage({
        id: voiceId,
        label: meta?.label || nextMeta.label,
        gender: meta?.gender || nextMeta.gender,
        shortLabel: meta?.shortLabel || nextMeta.shortLabel,
      });
      setFrequentVoices(updated);
    }
    if (meta?.closeExplorer) {
      setIsVoiceExplorerOpen(false);
    }
  };

  const handleAtmospherePresetClick = (preset: Gemini38AtmospherePreset) => {
    onTtsToneChange(preset.tone);
    onTtsStyleDetailChange(preset.styleDetail);
  };

  const handleGenerateSpeechClick = () => {
    const updated = recordAiVoiceUsage({
      id: aiVoice,
      label: selectedExtraVoice?.label || selectedVoice?.label || selectedFrequentEntry?.label || aiVoice,
      gender: selectedVoiceGender,
      shortLabel: selectedVoice
        ? extractShortJapaneseTrait(selectedVoice.desc)
        : selectedExtraCompact
          ? selectedExtraCompact.primaryTitle
          : selectedFrequentEntry?.shortLabel,
    });
    setFrequentVoices(updated);
    onGenerateSpeech();
  };

  const applyTextareaRestore = (ta: HTMLTextAreaElement, caret: number, scrollTop: number) => {
    const safeCaret = Math.max(0, Math.min(caret, ta.value.length));
    ta.setSelectionRange(safeCaret, safeCaret);
    ta.focus({ preventScroll: true });
    ta.scrollTop = scrollTop;
  };

  useLayoutEffect(() => {
    const pending = pendingTextareaRestoreRef.current;
    const ta = scriptTextareaRef.current;
    if (!pending || !ta) return;
    applyTextareaRestore(ta, pending.caret, pending.scrollTop);
    const { scrollTop } = pending;
    pendingTextareaRestoreRef.current = null;
    requestAnimationFrame(() => {
      const currentTa = scriptTextareaRef.current;
      if (currentTa) {
        currentTa.scrollTop = scrollTop;
      }
    });
  }, [aiScript]);

  const restoreCaret = (caret: number, savedScrollTop: number) => {
    pendingTextareaRestoreRef.current = { caret, scrollTop: savedScrollTop };
    requestAnimationFrame(() => {
      const pending = pendingTextareaRestoreRef.current;
      const ta = scriptTextareaRef.current;
      if (!pending || !ta) return;
      applyTextareaRestore(ta, pending.caret, pending.scrollTop);
      pendingTextareaRestoreRef.current = null;
    });
  };

  const applyToneToSelection = (toneLabel: string) => {
    const el = scriptTextareaRef.current;
    if (!el) return;
    const savedScrollTop = el.scrollTop;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) {
      setSelectionHint('原稿の中で範囲を選んでから、話し方ボタンを押してください。');
      return;
    }
    const { text, caret } = wrapRangeWithTone(aiScript, start, end, toneLabel);
    onScriptChange(text);
    setSelectionHint('');
    restoreCaret(caret, savedScrollTop);
  };

  const insertInlineEventAtCaret = (marker: string) => {
    const el = scriptTextareaRef.current;
    const savedScrollTop = el?.scrollTop ?? 0;
    const start = el?.selectionStart ?? aiScript.length;
    const end = el?.selectionEnd ?? aiScript.length;
    const { text, caret } = insertInlineEventMarker(aiScript, start, end, marker);
    onScriptChange(text);
    setSelectionHint('');
    restoreCaret(caret, savedScrollTop);
  };

  const removeToneFromSelection = () => {
    const el = scriptTextareaRef.current;
    if (!el) return;
    const savedScrollTop = el.scrollTop;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const { text, caret } = unwrapRangeTone(aiScript, start, end);
    if (text === aiScript) {
      setSelectionHint(
        start === end
          ? 'カーソルを《話し方》…《/》の内側に置くか、その範囲を選んでから解除してください。'
          : '選択範囲に外せる演出マーカーがありません。',
      );
      return;
    }
    onScriptChange(text);
    setSelectionHint('');
    restoreCaret(caret, savedScrollTop);
  };

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const stateId = `ai-modal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    modalHistoryIdRef.current = stateId;
    closedByPopstateRef.current = false;

    const currentState = (window.history.state && typeof window.history.state === 'object')
      ? window.history.state as Record<string, unknown>
      : {};
    window.history.pushState({ ...currentState, __aiModal: stateId }, '');

    const handlePopState = (event: PopStateEvent) => {
      const state =
        event.state && typeof event.state === 'object'
          ? (event.state as Record<string, unknown>)
          : window.history.state && typeof window.history.state === 'object'
            ? (window.history.state as Record<string, unknown>)
            : null;

      if (state && modalHistoryIdRef.current && state.__aiModal === modalHistoryIdRef.current) {
        return;
      }

      closedByPopstateRef.current = true;
      onClose();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      const current = (window.history.state && typeof window.history.state === 'object')
        ? window.history.state as Record<string, unknown>
        : null;
      const ownStateOnTop = Boolean(
        modalHistoryIdRef.current &&
        current &&
        current.__aiModal === modalHistoryIdRef.current
      );
      if (!closedByPopstateRef.current && ownStateOnTop) {
        window.history.back();
      }
      modalHistoryIdRef.current = null;
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
    if (isEditableTouchTarget(event.target)) {
      resetTouchTracking();
      return;
    }
    const touch = event.touches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    touchDeltaYRef.current = 0;
    touchStartScrollTopRef.current = sheetScrollRef.current?.scrollTop ?? 0;
    swipeCloseEligibleRef.current = touchStartScrollTopRef.current <= 0;
  };

  const handleSheetTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!swipeCloseEligibleRef.current || touchStartXRef.current === null || touchStartYRef.current === null || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaY = touch.clientY - touchStartYRef.current;
    touchDeltaYRef.current = deltaY;

    const atTop = (sheetScrollRef.current?.scrollTop ?? 0) <= 0;
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-100 bg-black/80 backdrop-blur-sm flex items-end md:items-start md:justify-center md:px-4 md:pt-8 md:pb-6 font-sans antialiased"
    >
      <div
        className={`bg-gray-800 border border-gray-700 w-full md:max-w-5xl max-h-[92vh] md:max-h-[calc(100vh-3.5rem)] rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-ai-modal-sheet ${
          isVoiceExplorerOpen ? 'h-[90vh] md:h-[min(calc(100vh-3.5rem),1100px)]' : ''
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden pt-2 px-4 shrink-0">
          <div className="mx-auto h-1 w-12 rounded-full bg-gray-600/80" />
        </div>

        {/* ヘッダー（固定） */}
        <div className="px-4 py-2.5 md:px-5 md:py-2.5 border-b border-gray-700 flex justify-between items-center gap-2 shrink-0 bg-linear-to-r from-purple-900/50 to-blue-900/50">
          {isVoiceExplorerOpen ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setIsVoiceExplorerOpen(false)}
                className="min-h-9 px-3 rounded-lg border border-blue-400/45 bg-blue-950/60 text-blue-200 hover:bg-blue-900/60 text-xs md:text-sm font-bold flex items-center gap-1.5 transition shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>戻る</span>
              </button>
              <h3 className="font-bold text-sm md:text-lg text-white truncate">
                もっと別の声を探す
              </h3>
            </div>
          ) : (
            <h3 className="font-bold flex items-center gap-2 text-white text-sm md:text-lg">
              <Sparkles className="w-5 h-5 text-yellow-400 shrink-0" />
              <span>AIナレーションスタジオ</span>
              {onOpenHelp && (
                <button
                  type="button"
                  onClick={onOpenHelp}
                  className="p-1 rounded-lg transition border border-blue-500/45 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  title="AIナレーションスタジオのヘルプを開く"
                  aria-label="AIナレーションスタジオの説明"
                >
                  <CircleHelp className="w-4 h-4" />
                </button>
              )}
            </h3>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="AIナレーションスタジオを閉じる"
            className="p-1.5 text-gray-300 hover:text-white rounded-lg hover:bg-white/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* モバイル専用 2 タブ切替バー（PCでは番号付き2枠で左右表示） */}
        {!isVoiceExplorerOpen && (
          <div className="md:hidden px-3.5 pt-2.5 pb-1.5 shrink-0 bg-gray-800/95 border-b border-gray-700/70">
            <div
              role="tablist"
              aria-label="AIナレーション設定タブ"
              className="grid grid-cols-2 gap-1.5 p-1 bg-gray-900/90 border border-gray-700 rounded-xl"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeMobileTab === 'script'}
                onClick={() => setActiveMobileTab('script')}
                className={`min-h-9 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  activeMobileTab === 'script'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>① 原稿・部分演出</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeMobileTab === 'voice'}
                onClick={() => setActiveMobileTab('voice')}
                className={`min-h-9 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  activeMobileTab === 'voice'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>② 声・話し方</span>
              </button>
            </div>
          </div>
        )}

        {/* メインコンテンツ（単一スクロールコンテナ） */}
        <div
          ref={sheetScrollRef}
          className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 md:px-4 md:py-3 space-y-3"
          onTouchStart={handleSheetTouchStart}
          onTouchMove={handleSheetTouchMove}
          onTouchEnd={handleSheetTouchEnd}
          onTouchCancel={resetTouchTracking}
        >
          {!hasApiKey && (
            <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3.5 md:p-4 space-y-2 text-amber-200 shadow-md">
              <div className="flex items-center gap-2 font-bold text-xs md:text-sm text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Gemini APIキーの登録が必要です</span>
              </div>
              <p className="text-xs md:text-sm text-amber-100/90 leading-relaxed">
                AI原稿作成や音声合成機能を利用するには、Gemini APIキーの登録が必要です。トップ画面のタートルビデオ アプリ名の横の
                <span className="inline-flex items-center gap-1 rounded bg-gray-800/90 border border-gray-700/80 px-1.5 py-0.5 text-xs text-gray-200 mx-1 align-middle font-medium shadow-xs">
                  <Settings className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>歯車アイコン</span>
                </span>
                からAPIキーを登録してください。
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <p className="text-xs text-amber-300/90 font-medium">
                  ※ブラウザ内（ローカル）にのみ安全に保存されます。
                </p>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-400/50 bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-xs md:text-sm font-semibold transition shadow-xs"
                >
                  <span>Google AI Studio でAPIキーを取得（無料）</span>
                  <ExternalLink className="w-3.5 h-3.5 text-amber-300" />
                </a>
              </div>
            </div>
          )}

          {!isVoiceExplorerOpen ? (
            /* ===== 通常ビュー（PC: 番号付き左右2枠 / スマホ: 2タブ切替） ===== */
            <div className="grid grid-cols-1 md:grid-cols-12 md:gap-3.5 items-stretch">
              {/* ===== 左枠: Step 1 原稿・部分演出 ===== */}
              <div
                className={`md:col-span-6 md:rounded-2xl md:border md:border-purple-500/35 md:bg-gray-900/55 md:p-3 space-y-2.5 ${
                  activeMobileTab === 'script' ? 'block' : 'hidden md:block'
                }`}
              >
                {/* PC用 ステップ見出し（視線の起点を明確化） */}
                <div className="hidden md:flex items-center justify-between gap-2 pb-1.5 border-b border-gray-700/80">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-400/45 text-purple-200 flex items-center justify-center text-xs font-bold shrink-0">
                      1
                    </span>
                    <span className="text-[15px] font-bold text-purple-200">原稿・部分演出</span>
                  </div>
                  <span className="text-xs text-gray-400">まず文章を決めます</span>
                </div>

                {/* AI 原稿作成（コンパクト折りたたみパネル） */}
                <div className="rounded-xl border border-purple-500/35 bg-purple-950/20 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsPromptPanelOpen((open) => !open)}
                    aria-expanded={isPromptPanelOpen}
                    className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-purple-900/20 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                  >
                    <span className="text-xs md:text-sm font-bold text-purple-200 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-300 shrink-0" />
                      <span>AIで原稿を作成（任意）</span>
                    </span>
                    <span className="text-xs text-purple-300/90 flex items-center gap-1">
                      <span>{isPromptPanelOpen ? '閉じる' : 'テーマから作る'}</span>
                      {isPromptPanelOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                  </button>

                  {isPromptPanelOpen && (
                    <div className="px-3 pb-2.5 pt-1 space-y-2 border-t border-purple-500/20">
                      <input
                        type="text"
                        aria-label="テーマ入力"
                        value={aiPrompt}
                        onChange={(e) => onPromptChange(e.target.value)}
                        placeholder="テーマを入力（例: 京都旅行の動画）"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-400"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5" role="group" aria-label="文章の長さ">
                          {SCRIPT_LENGTH_OPTIONS.map((opt) => {
                            const active = aiScriptLength === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                aria-pressed={active}
                                onClick={() => onScriptLengthChange(opt.value)}
                                className={`min-h-8 px-3 rounded-lg text-xs md:text-sm font-semibold border transition ${
                                  active
                                    ? 'bg-purple-600 border-purple-400 text-white'
                                    : 'bg-gray-900/80 border-gray-700 text-gray-300 hover:border-purple-500/60'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={onGenerateScript}
                          disabled={!hasApiKey || isAiLoading || !aiPrompt.trim()}
                          className="min-h-8 bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-1 rounded-lg text-xs md:text-sm font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition"
                          title={!hasApiKey ? 'Gemini APIキーの登録が必要です' : undefined}
                        >
                          {isAiLoading ? (
                            <Loader className="w-4 h-4 animate-spin" />
                          ) : (
                            <FileText className="w-4 h-4" />
                          )}
                          <span>AI原稿を作成</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 原稿テキストエリア（上下ブロックと同じカード枠で統一） */}
                <div className="rounded-xl border border-gray-700/80 bg-gray-900/65 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="ai-narration-script"
                      className="text-xs md:text-sm font-bold text-gray-100"
                    >
                      原稿（直接入力・編集）
                    </label>
                    <span className="text-xs text-gray-400">
                      {plainScriptLength > 0 ? `目安 約${estimatedSpeechSec}秒 · ${plainScriptLength}文字` : '文字を入力してください'}
                    </span>
                  </div>
                  <textarea
                    id="ai-narration-script"
                    ref={scriptTextareaRef}
                    value={aiScript}
                    onChange={(e) => {
                      onScriptChange(e.target.value);
                      if (selectionHint) setSelectionHint('');
                    }}
                    placeholder="ここにナレーション原稿を入力・貼り付けできます"
                    className="w-full h-32 md:h-36 md:min-h-36 md:max-h-[55vh] bg-gray-950/70 border border-gray-700 rounded-lg p-2.5 text-sm md:text-[15px] text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none md:resize-y leading-relaxed"
                  />
                </div>

                {/* 部分アクセント（範囲）＋ 瞬間タグ（カーソル挿入） */}
                <div className="rounded-xl border border-gray-700/80 bg-gray-900/65 p-2.5 space-y-2">
                  {/* 選択範囲の話し方 */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <p className="text-xs md:text-sm font-semibold text-gray-100">
                        部分アクセント（選択範囲に付与）
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={removeToneFromSelection}
                          className="min-h-7 px-2.5 rounded-md text-xs font-semibold border border-gray-600 bg-gray-800 text-gray-200 hover:border-amber-400/70 hover:text-amber-100 transition"
                        >
                          選択解除
                        </button>
                        {(appliedToneLabels.length > 0 || appliedInlineLabels.length > 0) && (
                          <button
                            type="button"
                            onClick={() => {
                              onScriptChange(clearAllDeliveryMarkers(aiScript));
                              setSelectionHint('');
                            }}
                            className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-200"
                          >
                            すべて外す
                          </button>
                        )}
                      </div>
                    </div>
                    <div
                      className="grid grid-cols-3 sm:grid-cols-[1fr_1.2fr_1fr_1fr_1fr] gap-1.5"
                      role="group"
                      aria-label="語り口調プリセット"
                    >
                      {NARRATION_TONE_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyToneToSelection(preset.label)}
                          className="min-h-8 px-1.5 rounded-lg text-xs lg:text-sm font-semibold border border-gray-600 bg-gray-800 text-gray-100 hover:border-purple-400 hover:bg-purple-500/15 active:scale-[0.98] transition text-center whitespace-nowrap"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        aria-label="自由な部分アクセント"
                        value={customToneText}
                        onChange={(e) => setCustomToneText(e.target.value)}
                        placeholder="自由な部分アクセント（例: 疑問を投げかけるように、笑いながら）"
                        className="min-w-0 flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs md:text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!customToneText.trim()) {
                            setSelectionHint('自由入力の話し方を書いてから適用してください。');
                            return;
                          }
                          applyToneToSelection(customToneText.trim());
                        }}
                        className="shrink-0 min-h-8 px-3.5 rounded-lg text-xs md:text-sm font-bold bg-purple-600 hover:bg-purple-500 text-white transition"
                      >
                        適用
                      </button>
                    </div>
                  </div>

                  {/* 瞬間タグ（カーソル位置へワンタップ挿入 ＋ その他インライン展開） */}
                  <div className="pt-2 border-t border-gray-700/70 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-xs md:text-sm font-semibold text-indigo-200">
                        間・息づかいを挿入（カーソル位置）
                      </span>
                      <span className="text-[11px] md:text-xs text-gray-400">
                        選択不要・ワンタップ挿入
                      </span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5" role="group" aria-label="瞬間効果の挿入">
                      {NARRATION_INLINE_EVENT_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => insertInlineEventAtCaret(preset.marker)}
                          className="min-h-8 px-1.5 rounded-lg text-xs lg:text-sm font-semibold border border-indigo-500/40 bg-indigo-950/40 text-indigo-100 hover:border-indigo-400 hover:bg-indigo-900/50 active:scale-[0.98] transition text-center whitespace-nowrap"
                          title={`カーソル位置に${preset.marker}を挿入`}
                        >
                          {preset.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setIsExtraInlineEventsOpen((open) => !open)}
                        aria-expanded={isExtraInlineEventsOpen}
                        className={`min-h-8 px-1.5 rounded-lg text-xs lg:text-sm font-semibold border transition inline-flex items-center justify-center gap-1 whitespace-nowrap ${
                          isExtraInlineEventsOpen
                            ? 'border-indigo-400 bg-indigo-600 text-white'
                            : 'border-gray-600 bg-gray-800 text-gray-200 hover:border-indigo-400 hover:text-white'
                        }`}
                      >
                        <span>その他</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform motion-reduce:transition-none ${
                            isExtraInlineEventsOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </div>

                    {isExtraInlineEventsOpen && (
                      <div
                        role="region"
                        aria-label="その他の間・息づかいメニュー"
                        className="pt-2 mt-1 border-t border-gray-800/80 grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5"
                      >
                        {NARRATION_EXTRA_INLINE_EVENT_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => insertInlineEventAtCaret(preset.marker)}
                            title={`カーソル位置に${preset.marker}（${preset.tag}）を挿入`}
                            className="min-h-8 px-1 rounded-lg text-xs font-semibold border border-indigo-500/35 bg-indigo-950/35 text-indigo-100 hover:border-indigo-400 hover:bg-indigo-900/50 active:scale-[0.98] transition text-center whitespace-nowrap"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectionHint && (
                    <p className="text-xs text-amber-300" role="status">
                      {selectionHint}
                    </p>
                  )}
                  {(appliedToneLabels.length > 0 || appliedInlineLabels.length > 0) && (
                    <p className="text-xs text-gray-400">
                      適用中: {[...appliedToneLabels, ...appliedInlineLabels].join(' / ')}
                    </p>
                  )}
                </div>
              </div>

              {/* ===== 右枠: Step 2 声・話し方 ===== */}
              <div
                className={`md:col-span-6 md:rounded-2xl md:border md:border-blue-500/35 md:bg-gray-900/55 md:p-3 space-y-2.5 ${
                  activeMobileTab === 'voice' ? 'block' : 'hidden md:block'
                }`}
              >
                {/* PC用 ステップ見出し */}
                <div className="hidden md:flex items-center justify-between gap-2 pb-1.5 border-b border-gray-700/80">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-400/45 text-blue-200 flex items-center justify-center text-xs font-bold shrink-0">
                      2
                    </span>
                    <span className="text-[15px] font-bold text-blue-200">声・話し方</span>
                  </div>
                  <span className="text-xs text-gray-400">次に声とトーンを決めます</span>
                </div>

                {/* 声のクイック選択（男女の代表声 ＋ よく使う声 ＋ 別の声を探す） */}
                <div className="rounded-xl border border-blue-500/35 bg-linear-to-br from-blue-950/35 via-gray-900/75 to-gray-900/85 p-2.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Volume2 className="w-4 h-4 text-blue-400 shrink-0" />
                      <span className="text-xs md:text-sm font-bold text-gray-100">声</span>
                      <span className="text-xs text-blue-100 bg-blue-500/20 border border-blue-400/40 px-2.5 py-0.5 rounded-full truncate max-w-[180px] font-medium">
                        {selectedVoiceDisplayName}
                        {selectedVoiceGender === 'female' ? ' · 女性' : selectedVoiceGender === 'male' ? ' · 男性' : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsVoiceExplorerOpen(true)}
                      className="min-h-8 px-2.5 rounded-lg border border-blue-400/50 bg-blue-600/20 hover:bg-blue-600/35 text-blue-100 hover:text-white text-xs md:text-sm font-bold flex items-center gap-1 transition shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    >
                      <span>もっと別の声を探す</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 最近使用した声（最大4件・PC/スマホとも2列×最大2行・PCでは代表声2ボタン分の横幅＆スリム縦幅） */}
                  {quickFrequentChips.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-[11px] md:text-xs font-semibold text-amber-300/95">
                        <Star className="w-3 h-3" />
                        <span>最近使用した声</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="よく使う声">
                        {quickFrequentChips.map((chip) => {
                          const active = aiVoice === chip.id;
                          return (
                            <button
                              key={chip.id}
                              type="button"
                              aria-pressed={active}
                              title={`${chip.shortLabel} (${chip.label})`}
                              onClick={() => selectVoiceWithTracking(chip.id)}
                              className={`min-h-7 px-2.5 py-0.5 rounded-md border text-left transition flex items-center justify-between gap-1.5 min-w-0 ${
                                active
                                  ? 'bg-blue-600/35 border-blue-400 text-white ring-1 ring-blue-400/70'
                                  : 'bg-gray-900/80 border-gray-700 text-gray-200 hover:border-blue-400/60'
                              }`}
                            >
                              <span className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className={`w-1.5 h-1.5 rounded-xs shrink-0 ${
                                    chip.gender === 'female'
                                      ? 'bg-pink-400'
                                      : chip.gender === 'male'
                                        ? 'bg-blue-400'
                                        : 'bg-gray-400'
                                  }`}
                                />
                                <span className="text-[11px] md:text-xs font-bold truncate">{chip.shortLabel}</span>
                              </span>
                              <span className="text-[10px] md:text-[11px] text-gray-400 truncate shrink-0 max-w-[48%]">{chip.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 女性 代表4パターン */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] md:text-xs font-semibold text-pink-300">
                      <span className="w-2 h-2 rounded-xs bg-pink-400" />
                      <span>女性の代表的な声</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" role="group" aria-label="女性の代表的な声">
                      {QUICK_FEMALE_VOICES.map((voice) => {
                        const active = aiVoice === voice.id;
                        return (
                          <button
                            key={voice.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => selectVoiceWithTracking(voice.id)}
                            className={`min-h-11 px-2.5 py-1 rounded-lg border text-left transition flex flex-col justify-center ${
                              active
                                ? 'bg-pink-500/20 border-pink-400 text-white ring-1 ring-pink-400/70'
                                : 'bg-gray-900/80 border-gray-700/80 text-gray-200 hover:border-pink-400/60 hover:bg-gray-800/80'
                            }`}
                          >
                            <span className="text-xs md:text-sm font-bold leading-tight truncate">{voice.shortLabel}</span>
                            <span className="text-[11px] md:text-xs text-gray-400 leading-tight truncate">{voice.id}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 男性 代表4パターン */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] md:text-xs font-semibold text-blue-300">
                      <span className="w-2 h-2 rounded-xs bg-blue-400" />
                      <span>男性の代表的な声</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" role="group" aria-label="男性の代表的な声">
                      {QUICK_MALE_VOICES.map((voice) => {
                        const active = aiVoice === voice.id;
                        return (
                          <button
                            key={voice.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => selectVoiceWithTracking(voice.id)}
                            className={`min-h-11 px-2.5 py-1 rounded-lg border text-left transition flex flex-col justify-center ${
                              active
                                ? 'bg-blue-600/30 border-blue-400 text-white ring-1 ring-blue-400/70'
                                : 'bg-gray-900/80 border-gray-700/80 text-gray-200 hover:border-blue-400/60 hover:bg-gray-800/80'
                            }`}
                          >
                            <span className="text-xs md:text-sm font-bold leading-tight truncate">{voice.shortLabel}</span>
                            <span className="text-[11px] md:text-xs text-gray-400 leading-tight truncate">{voice.id}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 全体の話し方（雰囲気9種統合 ＋ 速さ3択 ＋ 補足1行） */}
                <div className="rounded-xl border border-indigo-500/30 bg-linear-to-br from-indigo-950/30 via-purple-950/20 to-gray-900/65 p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs md:text-sm font-bold text-indigo-200 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-300" />
                      <span>全体の話し方</span>
                    </p>
                    <span className="text-[11px] md:text-xs text-indigo-300/80">動画全体のベース</span>
                  </div>

                  {/* 雰囲気9種（3列×3段・排他選択で矛盾なし） */}
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-gray-300">雰囲気</span>
                    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="全体の雰囲気">
                      {GEMINI_38_ATMOSPHERE_PRESETS.map((preset) => {
                        const active = activeAtmosphereId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => handleAtmospherePresetClick(preset)}
                            className={`min-h-9 px-2 py-1 rounded-lg border text-xs md:text-sm font-semibold transition text-center leading-tight ${
                              active
                                ? 'bg-indigo-600 border-indigo-400 text-white shadow-xs'
                                : 'bg-gray-900/80 border-gray-700 text-gray-200 hover:border-indigo-400/60 hover:bg-indigo-950/40'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 話す速さ（1行3択ボタン） */}
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs md:text-sm font-semibold text-gray-200 shrink-0 w-18">話す速さ</span>
                    <div
                      role="group"
                      aria-label="話す速さ"
                      className="grid grid-cols-3 gap-1 flex-1 p-0.5 rounded-lg bg-gray-900/90 border border-gray-700"
                    >
                      {PACE_OPTIONS.map((opt) => {
                        const active = aiTtsPace === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onTtsPaceChange(opt.value)}
                            className={`min-h-8 rounded-md text-xs md:text-sm font-semibold transition ${
                              active
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-gray-300 hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 細かい補足（任意1行） */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="ai-tts-style-detail" className="text-xs md:text-sm font-semibold text-gray-200">
                        細かい話し方の補足（任意）
                      </label>
                      {aiTtsStyleDetail.trim() && (
                        <button
                          type="button"
                          onClick={() => onTtsStyleDetailChange('')}
                          className="text-xs text-gray-400 hover:text-gray-200 underline"
                        >
                          クリア
                        </button>
                      )}
                    </div>
                    <input
                      id="ai-tts-style-detail"
                      type="text"
                      value={aiTtsStyleDetail}
                      onChange={(event) => onTtsStyleDetailChange(event.target.value)}
                      maxLength={200}
                      placeholder="例: 物語の読み聞かせ風に、怪談っぽく不気味に"
                      className="w-full rounded-lg border border-gray-700 bg-gray-900/90 px-2.5 py-1.5 text-xs md:text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>

                {/* 音声エンジン（省スペース2択トグル） */}
                <div className="rounded-xl border border-gray-700/80 bg-gray-900/70 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs md:text-sm font-semibold text-gray-200">
                    音声エンジン (Gemini 3.8)
                  </span>
                  <div
                    role="group"
                    aria-label="音声エンジン"
                    className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-gray-950/80 border border-gray-700"
                  >
                    {ENGINE_OPTIONS.map((opt) => {
                      const active = aiTtsEngine === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => onTtsEngineChange(opt.value)}
                          className={`min-h-8 px-3 rounded-md text-xs md:text-sm font-semibold transition whitespace-nowrap ${
                            active
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'text-gray-300 hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ===== 「もっと別の声を探す」サブビュー（雰囲気/用途タグ＋清潔な2行カード） ===== */
            <div className="space-y-3.5">
              {/* 選択中の声カード */}
              <div className="rounded-xl border border-blue-500/40 bg-linear-to-r from-blue-950/40 via-indigo-950/30 to-gray-900/60 p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-500/25 text-blue-200 border border-blue-400/40 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 text-blue-300" />
                      選択中
                    </span>
                    <span className="font-bold text-sm md:text-base text-white truncate">
                      {selectedVoiceDisplayName}
                    </span>
                    {selectedVoiceGender && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium border shrink-0 bg-gray-900/60 border-gray-700">
                        <span
                          className={`w-2 h-2 rounded-xs shrink-0 ${
                            selectedVoiceGender === 'female'
                              ? 'bg-pink-400'
                              : selectedVoiceGender === 'male'
                                ? 'bg-blue-400'
                                : 'bg-gray-400'
                          }`}
                        />
                        <span
                          className={
                            selectedVoiceGender === 'female'
                              ? 'text-pink-300'
                              : selectedVoiceGender === 'male'
                                ? 'text-blue-300'
                                : 'text-gray-400'
                          }
                        >
                          {selectedVoiceGender === 'female' ? '女性' : selectedVoiceGender === 'male' ? '男性' : '指定なし'}
                        </span>
                      </span>
                    )}
                  </div>
                  {selectedVoiceDesc && (
                    <p
                      className="text-xs md:text-sm text-gray-300 mt-1 truncate"
                      title={selectedExtraVoice ? wrapVoiceTooltip([
                        selectedExtraVoice.label,
                        formatPersonaLabel(selectedExtraVoice.persona),
                        formatContextLabel(selectedExtraVoice.context),
                        formatVoiceDescription(selectedExtraVoice),
                      ].filter(Boolean).join(' · ')) : undefined}
                    >
                      {selectedVoiceDesc}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {hasActiveVoiceFilters && (
                    <button
                      type="button"
                      onClick={resetVoiceFilters}
                      className="text-xs md:text-sm text-amber-300 hover:text-amber-200 flex items-center gap-1 underline underline-offset-2"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      条件をリセット
                    </button>
                  )}
                  <span className="text-xs md:text-sm text-gray-300 font-medium">
                    候補: {filteredCount} 件
                  </span>
                </div>
              </div>

              {/* 基本の30声 / 追加音声 切り替えタブ */}
              <div role="group" aria-label="声の種類" className="grid grid-cols-2 gap-1.5 p-1 bg-gray-900/80 border border-gray-700/80 rounded-xl">
                {([
                  ['basic', '基本の30声'],
                  ['library', '追加音声'],
                ] as const).map(([source, label]) => {
                  const active = voiceSource === source;
                  return (
                    <button
                      key={source}
                      type="button"
                      onClick={() => {
                        setVoiceSource(source);
                        if (source === 'library' && !libraryLoaded && !libraryLoading) {
                          void loadVoiceLibrary();
                        }
                      }}
                      aria-pressed={active}
                      aria-label={label}
                      className={`min-h-10 py-1.5 px-3 rounded-lg text-xs md:text-sm font-bold transition flex items-center justify-center gap-1.5 ${
                        active
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-gray-300 hover:text-white hover:bg-gray-800/60'
                      }`}
                    >
                      <span>{label}</span>
                      {source === 'basic' && <span className="text-xs opacity-80">({voiceOptions.length})</span>}
                      {source === 'library' && extraVoices.length > 0 && <span className="text-xs opacity-80">({extraVoices.length})</span>}
                    </button>
                  );
                })}
              </div>

              {/* 基本の30声：性別 ＋ 雰囲気タグ ＋ 検索 */}
              {voiceSource === 'basic' && (
                <div className="space-y-2.5 bg-gray-900/65 border border-gray-700/70 p-3 rounded-xl">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-1.5" role="group" aria-label="声の性別で絞り込み">
                      <span className="text-xs md:text-sm text-gray-300 font-semibold mr-1">性別:</span>
                      {voiceGenderFilterOptions.map((opt) => {
                        const active = voiceGenderFilter === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setVoiceGenderFilter(opt.id)}
                            className={`min-h-9 min-w-[3.75rem] px-2.5 whitespace-nowrap rounded-lg text-xs md:text-sm font-semibold border transition ${
                              active
                                ? 'bg-blue-500 text-white border-blue-400'
                                : 'bg-gray-800 text-gray-200 border-gray-700 hover:border-blue-500/50 hover:text-blue-100'
                            }`}
                            aria-pressed={active}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="search"
                      aria-label="声を検索"
                      value={voiceSearch}
                      onChange={(event) => setVoiceSearch(event.target.value)}
                      placeholder="声名・特徴で検索..."
                      className="flex-1 min-w-[160px] rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs md:text-sm text-gray-100 placeholder-gray-500 focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-start gap-2 pt-1.5 border-t border-gray-800" role="group" aria-label="基本の声の雰囲気タグ">
                    <span className="text-xs md:text-sm text-gray-300 font-semibold w-12 shrink-0 pt-1.5">雰囲気:</span>
                    <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                      {BASIC_VOICE_MOOD_GROUPS.map((mood) => {
                        const active = basicVoiceMood === mood.id;
                        return (
                          <button
                            key={mood.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setBasicVoiceMood(mood.id)}
                            className={`min-h-8 px-3 rounded-full text-xs md:text-sm font-semibold border transition ${
                              active
                                ? 'bg-indigo-600 text-white border-indigo-400'
                                : 'bg-gray-800 text-gray-200 border-gray-700 hover:border-indigo-400/60'
                            }`}
                          >
                            {mood.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 追加音声：直感的な用途タグ（6チップ）＋ 性別・言語・検索（詳細プルダウンは折りたたみ） */}
              {voiceSource === 'library' && (
                <div className="space-y-2.5">
                  {!libraryLoaded ? (
                    <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-5 text-center space-y-3">
                      <p className="text-xs md:text-sm text-indigo-200 leading-relaxed">
                        {libraryLoading
                          ? 'Google AI Studio から追加の音声を読み込んでいます…'
                          : 'Google AI Studio から、日本語・英語の追加音声を読み込みます。'}
                      </p>
                      <button
                        type="button"
                        onClick={loadVoiceLibrary}
                        disabled={libraryLoading}
                        aria-label="追加の声を読み込む"
                        className="w-full sm:w-auto min-h-10 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs md:text-sm font-bold shadow-md transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
                      >
                        {libraryLoading ? (
                          <>
                            <Loader className="w-4 h-4 animate-spin" />
                            <span>追加の声を読み込み中…</span>
                          </>
                        ) : (
                          <span>追加の声を読み込む</span>
                        )}
                      </button>
                      {libraryError && <p role="alert" className="text-xs md:text-sm text-amber-300">{libraryError}</p>}
                    </div>
                  ) : (
                    <div className="space-y-2.5 rounded-xl border border-gray-700/80 bg-gray-900/70 p-3">
                      {/* 1行目: 言語 ＋ 性別 ＋ 検索 */}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5" role="group" aria-label="言語切り替え">
                          <select
                            id="ai-voice-language-select"
                            aria-label="言語"
                            value={voiceLanguage}
                            onChange={(event) => {
                              setVoiceLanguage(event.target.value as 'ja' | 'en');
                              setVoicePersona('');
                              setVoiceContext('');
                            }}
                            className="min-h-9 bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1 text-xs md:text-sm text-gray-100 font-semibold focus:outline-none focus:border-blue-400"
                          >
                            <option value="ja">🇯🇵 日本語 ({jaVoiceCount}件)</option>
                            <option value="en">🇺🇸 英語 ({enVoiceCount}件)</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-1" role="group" aria-label="声の性別で絞り込み">
                          {voiceGenderFilterOptions.map((opt) => {
                            const active = voiceGenderFilter === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setVoiceGenderFilter(opt.id)}
                                className={`min-h-9 px-2.5 whitespace-nowrap rounded-lg text-xs md:text-sm font-semibold border transition ${
                                  active
                                    ? 'bg-blue-500 text-white border-blue-400'
                                    : 'bg-gray-800 text-gray-200 border-gray-700 hover:border-blue-500/50 hover:text-blue-100'
                                }`}
                                aria-pressed={active}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>

                        <input
                          type="search"
                          aria-label="声を検索"
                          value={voiceSearch}
                          onChange={(event) => setVoiceSearch(event.target.value)}
                          placeholder="キーワード検索（例: 医師、親友、明瞭）"
                          className="flex-1 min-w-[160px] rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs md:text-sm text-gray-100 placeholder-gray-500 focus:border-blue-400 focus:outline-none"
                        />
                      </div>

                      {/* 2行目: わかりやすい日本語用途チップ 6 択（スマホは3列×2段で綺麗に整列・PCは横1列） */}
                      <div className="flex items-start gap-2 pt-1.5 border-t border-gray-800" role="group" aria-label="追加音声の用途タグ">
                        <span className="text-xs md:text-sm text-gray-300 font-semibold w-10 shrink-0 pt-1.5">用途:</span>
                        <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1.5 flex-1 min-w-0">
                          {EXTRA_VOICE_PURPOSE_CHIPS.map((chip) => {
                            const active = extraPurposeGroup === chip.id;
                            return (
                              <button
                                key={chip.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => {
                                  setExtraPurposeGroup(chip.id);
                                  setVoiceContext('');
                                  setVoicePersona('');
                                }}
                                className={`min-h-8 px-2 sm:px-3 rounded-full text-xs md:text-sm font-semibold border transition text-center whitespace-nowrap ${
                                  active
                                    ? 'bg-indigo-600 text-white border-indigo-400'
                                    : 'bg-gray-800 text-gray-200 border-gray-700 hover:border-indigo-400/60'
                                }`}
                              >
                                {chip.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 3行目: 年代チップ 5 択（用途と同じ左ラインで整列・1行収まり優先） */}
                      <div className="flex items-start gap-2 pt-1.5 border-t border-gray-800/70" role="group" aria-label="追加音声の年代タグ">
                        <span className="text-xs md:text-sm text-gray-300 font-semibold w-10 shrink-0 pt-1.5">年代:</span>
                        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                          {EXTRA_VOICE_AGE_GROUPS.map((ageOpt) => {
                            const active = extraAgeGroup === ageOpt.id;
                            return (
                              <button
                                key={ageOpt.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setExtraAgeGroup(ageOpt.id)}
                                className={`min-h-8 px-2.5 sm:px-3 rounded-full text-xs md:text-sm font-semibold border transition text-center whitespace-nowrap ${
                                  active
                                    ? 'bg-teal-700 text-white border-teal-400'
                                    : 'bg-gray-800 text-gray-200 border-gray-700 hover:border-teal-400/60'
                                }`}
                              >
                                {ageOpt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 細かい分類で絞る（普段は閉じて画面をスッキリ保つ） */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-800/80">
                        <button
                          type="button"
                          onClick={() => setShowDetailedExtraFilters((open) => !open)}
                          aria-expanded={showDetailedExtraFilters}
                          className="text-xs text-gray-300 hover:text-white flex items-center gap-1 font-medium"
                        >
                          {showDetailedExtraFilters ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          <span>細かい職業・分類で絞る</span>
                        </button>
                        <button
                          type="button"
                          onClick={loadVoiceLibrary}
                          disabled={libraryLoading}
                          className="text-xs text-gray-400 hover:text-gray-200 underline disabled:opacity-50"
                        >
                          {libraryLoading ? '読み込み中…' : '一覧を再読み込み'}
                        </button>
                      </div>

                      {showDetailedExtraFilters && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <div className="flex flex-col gap-1">
                            <label htmlFor="ai-voice-context-filter" className="text-xs font-semibold text-gray-300">
                              シーン・用途
                            </label>
                            <select
                              id="ai-voice-context-filter"
                              aria-label="シーン・用途"
                              value={voiceContext}
                              onChange={(event) => {
                                setVoiceContext(event.target.value);
                                setVoicePersona('');
                              }}
                              className="w-full h-9 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-xs md:text-sm text-gray-100 focus:outline-none focus:border-blue-400 truncate"
                            >
                              <option value="">すべてのシーン</option>
                              {contextOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label htmlFor="ai-voice-persona-filter" className="text-xs font-semibold text-gray-300">
                              職業・人物像
                            </label>
                            <select
                              id="ai-voice-persona-filter"
                              aria-label="職業・人物像"
                              value={voicePersona}
                              onChange={(event) => setVoicePersona(event.target.value)}
                              className="w-full h-9 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-xs md:text-sm text-gray-100 focus:outline-none focus:border-blue-400 truncate"
                            >
                              <option value="">すべての人物像</option>
                              {personaOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* アクセシビリティ ＆ 互換用セレクト */}
              <div className="sr-only">
                <select
                  id="ai-voice-select"
                  aria-label="声の選択"
                  value={voiceVisibleInSelect ? aiVoice : ''}
                  onChange={(e) => onVoiceChange(e.target.value)}
                >
                  {!voiceVisibleInSelect && (
                    <option value="" disabled>
                      {voiceSource === 'library'
                        ? extraVoices.length ? '声を選択してください（一覧から選べます）' : '追加の声を読み込んでください'
                        : '基本の声を選択してください'}
                    </option>
                  )}
                  {voiceSource === 'basic' && (
                    <optgroup label="基本の30声">
                      {filteredBaseVoices.map((voice) => (
                        <option key={voice.id} value={voice.id}>{formatVoiceOptionLabel(voice)}</option>
                      ))}
                    </optgroup>
                  )}
                  {voiceSource === 'library' && filteredExtraVoices.length > 0 && (
                    <optgroup label={`Gemini 3.8 追加の声 (${filteredExtraVoices.length}件)`}>
                      {filteredExtraVoices.map((voice) => {
                        const compact = formatCompactExtraVoiceCard(voice);
                        return (
                          <option key={voice.id} value={voice.id}>
                            {compact.primaryTitle} ({voice.label}) · {voice.gender === 'female' ? '女性' : voice.gender === 'male' ? '男性' : '指定なし'} {compact.ageLabel} {compact.summaryLine}
                          </option>
                        );
                      })}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* 広々した声一覧（PCは2列・清潔な2行カード） */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs md:text-sm text-gray-300">
                  <span className="font-semibold">タップして選択（選択後自動で戻ります）</span>
                  <span className="text-gray-400">{filteredCount} 件中 {Math.min(filteredCount, 40)} 件表示</span>
                </div>
                <div
                  className="grid grid-cols-1 md:grid-cols-2 gap-2"
                  role="listbox"
                  aria-label="声の一覧リスト"
                >
                  {voiceSource === 'basic' && (
                    baseVoiceChoices.length === 0 ? (
                      <p className="md:col-span-2 text-xs md:text-sm text-gray-400 text-center py-6">ほかに一致する声がありません。</p>
                    ) : (
                      baseVoiceChoices.map((voice) => (
                        <button
                          key={voice.id}
                          type="button"
                          onClick={() => selectVoiceWithTracking(voice.id, {
                            label: voice.label,
                            gender: voice.gender,
                            shortLabel: extractShortJapaneseTrait(voice.desc),
                            closeExplorer: true,
                          })}
                          className="w-full text-left p-3 rounded-xl border bg-gray-900/80 border-gray-700/80 hover:border-blue-400 hover:bg-blue-950/30 text-gray-100 transition flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-bold text-sm text-white truncate">
                                  {extractShortJapaneseTrait(voice.desc)}
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium border shrink-0 bg-gray-900 border-gray-700">
                                  <span
                                    className={`w-2 h-2 rounded-xs shrink-0 ${
                                      voice.gender === 'female' ? 'bg-pink-400' : 'bg-blue-400'
                                    }`}
                                  />
                                  <span className={voice.gender === 'female' ? 'text-pink-300' : 'text-blue-300'}>
                                    {voice.gender === 'female' ? '女性' : '男性'}
                                  </span>
                                </span>
                              </div>
                              <span className="text-xs text-gray-400 font-medium shrink-0">{voice.label}</span>
                            </div>
                            <p className="text-xs text-blue-200/85 mt-1 truncate">
                              {formatBasicVoiceDesc(voice)}
                            </p>
                          </div>
                        </button>
                      ))
                    )
                  )}

                  {voiceSource === 'library' && (
                    !libraryLoaded ? (
                      <div className="md:col-span-2 text-center py-6 space-y-1.5">
                        <Loader className="w-5 h-5 animate-spin mx-auto text-indigo-400" />
                        <p className="text-xs md:text-sm text-gray-400">追加音声を読み込んでいます…</p>
                      </div>
                    ) : extraVoiceChoices.length === 0 ? (
                      <div className="md:col-span-2 text-center py-6 space-y-2">
                        <p className="text-xs md:text-sm text-amber-300">条件に一致する声が見つかりませんでした。</p>
                        <button
                          type="button"
                          onClick={resetVoiceFilters}
                          className="text-xs md:text-sm text-blue-400 underline"
                        >
                          絞り込み条件をリセットする
                        </button>
                      </div>
                    ) : (
                      extraVoiceChoices.slice(0, 40).map((voice) => {
                        const compact = formatCompactExtraVoiceCard(voice);
                        const fullTooltip = wrapVoiceTooltip([
                          voice.label,
                          formatPersonaLabel(voice.persona),
                          formatContextLabel(voice.context),
                          formatVoiceDescription(voice),
                        ].filter(Boolean).join(' · '));
                        return (
                          <button
                            key={voice.id}
                            type="button"
                            onClick={() => selectVoiceWithTracking(voice.id, {
                              label: voice.label,
                              gender: voice.gender,
                              shortLabel: compact.primaryTitle,
                              closeExplorer: true,
                            })}
                            title={fullTooltip}
                            className="w-full text-left p-3 rounded-xl border bg-gray-900/80 border-gray-700/80 hover:border-blue-400 hover:bg-blue-950/30 text-gray-100 transition space-y-1"
                          >
                            {/* 1行目: 日本語のわかりやすい役割名 ＋ 性別 ＋ 年齢 */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-bold text-sm text-white truncate">
                                  {compact.primaryTitle}
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium border shrink-0 bg-gray-900 border-gray-700">
                                  <span
                                    className={`w-2 h-2 rounded-xs shrink-0 ${
                                      voice.gender === 'female'
                                        ? 'bg-pink-400'
                                        : voice.gender === 'male'
                                          ? 'bg-blue-400'
                                          : 'bg-gray-400'
                                    }`}
                                  />
                                  <span
                                    className={
                                      voice.gender === 'female'
                                        ? 'text-pink-300'
                                        : voice.gender === 'male'
                                          ? 'text-blue-300'
                                          : 'text-gray-400'
                                    }
                                  >
                                    {voice.gender === 'female' ? '女性' : voice.gender === 'male' ? '男性' : '指定なし'}
                                  </span>
                                </span>
                                {compact.ageLabel && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-200 border border-gray-700 shrink-0">
                                    {compact.ageLabel}
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* 2行目: 短い日本語特徴サマリー ＋ 右に控えめな英語名 */}
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-blue-200/85 truncate">
                                {compact.summaryLine || '追加音声'}
                              </span>
                              <span className="text-gray-400 truncate max-w-[140px] shrink-0">
                                {compact.rawName}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )
                  )}
                </div>
              </div>

              {!isVoiceId(aiVoice) && !selectedExtraVoice && (
                <p className="text-xs text-amber-300">
                  保存済みの声: {aiVoice}。日本語・英語の一覧にない場合も、選択は保持しています。
                </p>
              )}
            </div>
          )}
        </div>

        {/* 下部固定フッター */}
        <div className="shrink-0 border-t border-gray-700 bg-gray-900/95 px-4 py-2 md:px-5 md:py-2.5">
          {isVoiceExplorerOpen ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs md:text-sm text-gray-300 truncate">
                選択中: <strong className="text-white">{selectedVoiceDisplayName}</strong>
              </span>
              <button
                type="button"
                onClick={() => setIsVoiceExplorerOpen(false)}
                className="min-h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs md:text-sm font-bold transition shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                この声で戻る
              </button>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <p className="text-xs md:text-sm text-gray-300 truncate">
                <span className="text-blue-300 font-bold">{selectedVoiceDisplayName}</span>
                <span> · {activeAtmosphereLabel} · 速さ:{activePaceLabel} · {activeEngineLabel}</span>
              </p>
              <button
                type="button"
                onClick={handleGenerateSpeechClick}
                disabled={!hasApiKey || isAiLoading || !aiScript.trim()}
                className="w-full md:w-auto md:min-w-[270px] bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white py-2 px-5 rounded-xl font-bold text-sm md:text-base flex items-center justify-center gap-2 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                title={!hasApiKey ? 'Gemini APIキーの登録が必要です' : undefined}
              >
                {isAiLoading ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
                <span>AIナレーションを作成して追加</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AiModal;
