/**
 * @file AiModal.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description AIナレーションを生成するためのモーダルダイアログ。プロンプト入力、スクリプト生成、音声合成のフローを提供する。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, X, Loader, FileText, Mic, CircleHelp, ExternalLink, Check, RotateCcw, Volume2 } from 'lucide-react';
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
  formatPersonaLabel,
  formatContextLabel,
  formatVoiceDescription,
  wrapVoiceTooltip,
  getPersonaSelectOptions,
  getContextSelectOptions,
} from '../../utils/gemini38VoiceCategories';
import {
  NARRATION_SCENE_PRESETS,
  NARRATION_TONE_PRESETS,
  clearAllDeliveryMarkers,
  decodeSceneSetting,
  listAppliedToneLabels,
  matchScenePresetId,
  resolveSceneSetting,
  unwrapRangeTone,
  wrapRangeWithTone,
  type NarrationScenePresetId,
} from '../../utils/narrationDelivery';
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
}

/**
 * AIナレーション生成モーダル
 */
const AiModal: React.FC<AiModalProps> = ({
  isOpen,
  offlineMode = false,
  onClose,
  aiPrompt,
  aiScript,
  aiScriptLength,
  aiVoice,
  aiVoiceStyle,
  aiNarrationScene,
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
  onNarrationSceneChange,
  onTtsEngineChange,
  onTtsToneChange,
  onTtsPaceChange,
  onTtsStyleDetailChange,
  onGenerateScript,
  onGenerateSpeech,
}) => {
  // モーダル表示中は背景のスクロールを防止
  useDisableBodyScroll(isOpen);
  /** 声一覧の性別絞り込み（すべて / 女性 / 男性） */
  const [voiceGenderFilter, setVoiceGenderFilter] = useState<VoiceGenderFilter>('all');
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
  /** 場面プリセット（custom 時は Scene / Sample Context を自由入力） */
  const [scenePresetId, setScenePresetId] = useState<NarrationScenePresetId | 'custom'>('none');
  const [customSceneLine, setCustomSceneLine] = useState('');
  const [customSampleContext, setCustomSampleContext] = useState('');
  /** 区間語り口調の自由入力 */
  const [customToneText, setCustomToneText] = useState('');
  const [selectionHint, setSelectionHint] = useState('');
  const scriptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const showHelpRef = useRef(false);
  const modalHistoryIdRef = useRef<string | null>(null);
  const closedByPopstateRef = useRef(false);
  const sheetScrollRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartScrollTopRef = useRef(0);
  const touchDeltaYRef = useRef(0);
  const swipeCloseEligibleRef = useRef(false);

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

  const isGemini38 = aiTtsEngine !== 'legacy';

  useEffect(() => {
    setLibraryLoading(false);
    return () => {
      libraryRequestRef.current?.abort();
      libraryRequestRef.current = null;
    };
  }, [isOpen, aiTtsEngine, offlineMode]);

  useEffect(() => {
    if (isOpen) setVoiceSource(isGemini38 && !isVoiceId(aiVoice) ? 'library' : 'basic');
  }, [isOpen, isGemini38, aiVoice]);

  useEffect(() => {
    if (isOpen && isGemini38 && voiceSource === 'library' && !libraryLoaded && !libraryLoading && libraryVoices.length === 0) {
      void loadVoiceLibrary();
    }
  }, [isOpen, isGemini38, voiceSource, libraryLoaded, libraryLoading, libraryVoices.length]);

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
    const apiKey = getStoredApiKey() || import.meta.env.VITE_GEMINI_API_KEY || '';
    if (!apiKey) {
      setLibraryError('APIキーを設定すると追加の声を読み込めます。');
      return;
    }
    const controller = new AbortController();
    libraryRequestRef.current = controller;
    setLibraryLoading(true);
    setLibraryError('');
    try {
      const voices = await listGemini38Voices(apiKey, controller.signal);
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
    () => isGemini38 ? libraryVoices.filter((voice) => !voiceOptions.some((option) => option.id === voice.id)) : [],
    [isGemini38, libraryVoices, voiceOptions],
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
      .filter((voice) => voice.id === aiVoice || matchesSearch(voice.id, voice.label, voice.desc)),
    [voiceOptions, voiceGenderFilter, aiVoice, normalizedSearch],
  );
  // 選択中の声は上のカードで確認できるため、切り替え候補だけを一覧に並べる。
  const baseVoiceChoices = filteredBaseVoices.filter((voice) => voice.id !== aiVoice);

  const filteredExtraVoices = useMemo(
    () => languageVoices.filter((voice) =>
      (!voicePersona || voice.persona.trim() === voicePersona.trim()) &&
      (!voiceContext || voice.context.trim() === voiceContext.trim()) &&
      (voiceGenderFilter === 'all' || voice.gender === voiceGenderFilter) &&
      matchesSearch(voice.id, voice.label, `${voice.description} ${voice.persona} ${voice.context}`, voice.languageCode),
    ),
    [languageVoices, voicePersona, voiceContext, voiceGenderFilter, normalizedSearch],
  );
  const extraVoiceChoices = filteredExtraVoices.filter((voice) => voice.id !== aiVoice);

  const selectedVoice = getVoiceOption(aiVoice) ?? voiceOptions.find((voice) => voice.id === aiVoice);
  const selectedExtraVoice = extraVoices.find((voice) => voice.id === aiVoice);
  const filteredCount = voiceSource === 'library' && isGemini38
    ? extraVoiceChoices.length : baseVoiceChoices.length;
  const voiceVisibleInSelect = voiceSource === 'library' && isGemini38
    ? filteredExtraVoices.some((voice) => voice.id === aiVoice)
    : filteredBaseVoices.some((voice) => voice.id === aiVoice);

  const hasActiveVoiceFilters = voiceGenderFilter !== 'all' || Boolean(voicePersona) || Boolean(voiceContext) || Boolean(voiceSearch);
  const resetVoiceFilters = () => {
    setVoiceGenderFilter('all');
    setVoicePersona('');
    setVoiceContext('');
    setVoiceSearch('');
  };

  const appliedToneLabels = useMemo(() => listAppliedToneLabels(aiScript), [aiScript]);

  const activeSceneSetting = useMemo(() => {
    if (scenePresetId === 'custom') {
      return {
        scene: customSceneLine.trim(),
        sampleContext: customSampleContext.trim(),
      };
    }
    const preset = NARRATION_SCENE_PRESETS.find((p) => p.id === scenePresetId);
    return {
      scene: preset?.scene ?? '',
      sampleContext: preset?.sampleContext ?? '',
    };
  }, [scenePresetId, customSceneLine, customSampleContext]);

  const applyScenePreset = (presetId: NarrationScenePresetId | 'custom') => {
    setScenePresetId(presetId);
    if (presetId === 'custom') {
      let nextScene = customSceneLine;
      let nextContext = customSampleContext;
      if (!nextScene && !nextContext && scenePresetId !== 'none' && scenePresetId !== 'custom') {
        const prevPreset = NARRATION_SCENE_PRESETS.find((p) => p.id === scenePresetId);
        if (prevPreset) {
          nextScene = prevPreset.scene;
          nextContext = prevPreset.sampleContext;
          setCustomSceneLine(nextScene);
          setCustomSampleContext(nextContext);
        }
      }
      onNarrationSceneChange(
        resolveSceneSetting('custom', nextScene, nextContext),
      );
      return;
    }
    onNarrationSceneChange(resolveSceneSetting(presetId, '', ''));
  };

  const restoreCaret = (caret: number) => {
    requestAnimationFrame(() => {
      const ta = scriptTextareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  };

  const applyToneToSelection = (toneLabel: string) => {
    const el = scriptTextareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) {
      setSelectionHint('原稿の中で範囲を選んでから、語り口調を押してください。');
      return;
    }
    const { text, caret } = wrapRangeWithTone(aiScript, start, end, toneLabel);
    onScriptChange(text);
    setSelectionHint('');
    restoreCaret(caret);
  };

  /** 選択範囲（またはキャレット位置）の語り口調マーカーを外す */
  const removeToneFromSelection = () => {
    const el = scriptTextareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const { text, caret } = unwrapRangeTone(aiScript, start, end);
    if (text === aiScript) {
      setSelectionHint(
        start === end
          ? 'キャレットを《語り口》…《/》の内側に置くか、その範囲を選んでから解除してください。'
          : '選択範囲に外せる語り口調がありません。',
      );
      return;
    }
    onScriptChange(text);
    setSelectionHint('');
    restoreCaret(caret);
  };

  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    showHelpRef.current = showHelp;
  }, [showHelp]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const stateId = `ai-modal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    modalHistoryIdRef.current = stateId;
    closedByPopstateRef.current = false;

    const currentState = (window.history.state && typeof window.history.state === 'object')
      ? window.history.state as Record<string, unknown>
      : {};
    window.history.pushState({ ...currentState, __aiModal: stateId }, '');

    const handlePopState = () => {
      if (showHelpRef.current) {
        setShowHelp(false);
        const state = (window.history.state && typeof window.history.state === 'object')
          ? window.history.state as Record<string, unknown>
          : {};
        window.history.pushState({ ...state, __aiModal: stateId }, '');
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

  // モーダルを開いたとき・場面設定が変わったときプリセット選択を同期
  useEffect(() => {
    if (!isOpen) return;
    if (scenePresetId === 'custom' && !aiNarrationScene.trim()) {
      return;
    }
    const matched = matchScenePresetId(aiNarrationScene);
    setScenePresetId(matched);
    if (matched === 'custom') {
      const decoded = decodeSceneSetting(aiNarrationScene);
      setCustomSceneLine(decoded.scene);
      setCustomSampleContext(decoded.sampleContext);
    } else if (!aiNarrationScene.trim() && aiVoiceStyle.trim()) {
      // 旧「声の調子」のみあるデータは Sample Context として復元
      setScenePresetId('custom');
      setCustomSceneLine('');
      setCustomSampleContext(aiVoiceStyle);
      onNarrationSceneChange(resolveSceneSetting('custom', '', aiVoiceStyle));
    }
  }, [aiNarrationScene, aiVoiceStyle, isOpen, onNarrationSceneChange]);

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
      className="fixed inset-0 z-100 bg-black/80 backdrop-blur-sm flex items-end md:items-center md:justify-center md:p-4"
    >
      <div
        className="bg-gray-800 border border-gray-700 w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden animate-ai-modal-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden pt-2 px-4 shrink-0">
          <div className="mx-auto h-1 w-12 rounded-full bg-gray-600/80" />
        </div>
        <div className="p-3.5 md:p-4 border-b border-gray-700 flex justify-between items-center bg-linear-to-r from-purple-900/50 to-blue-900/50">
          <h3 className="font-bold flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            <span>AIナレーションスタジオ</span>
            <button
              onClick={() => setShowHelp((prev) => !prev)}
              className="p-1 rounded-lg transition border border-blue-500/45 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200"
              title="このセクションの説明"
              aria-label="AIナレーションスタジオの説明"
            >
              <CircleHelp className="w-4 h-4" />
            </button>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div
          ref={sheetScrollRef}
          className="p-3.5 md:p-6 space-y-4 md:space-y-6 max-h-[78vh] overflow-y-auto"
          onTouchStart={handleSheetTouchStart}
          onTouchMove={handleSheetTouchMove}
          onTouchEnd={handleSheetTouchEnd}
          onTouchCancel={resetTouchTracking}
        >
          {showHelp && (
            <div className="rounded-xl border border-orange-400/45 bg-linear-to-br from-orange-500/18 via-amber-500/12 to-orange-500/6 p-3 md:p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-bold text-orange-100 flex items-center gap-1">
                  <CircleHelp className="w-4 h-4" /> AIナレーションスタジオの使い方
                </h4>
                <button
                  onClick={() => setShowHelp(false)}
                  className="p-1.5 rounded-md border border-orange-300/40 bg-orange-500/10 text-orange-100 hover:bg-orange-500/25 hover:border-orange-200/60 transition"
                  title="ヘルプを閉じる"
                  aria-label="ヘルプを閉じる"
                >
                  <X className="w-[18px] h-[18px]" />
                </button>
              </div>
              <p className="text-xs md:text-sm text-orange-50 leading-relaxed">
                先にAPI設定が必要です。右上の設定からGemini APIキーを登録してください。
              </p>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs md:text-sm text-orange-200 hover:text-orange-100 underline underline-offset-2"
              >
                APIキー取得（Google AI Studio）
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <ol className="list-decimal ml-4 space-y-1 text-xs md:text-sm text-orange-50 leading-relaxed">
                <li>STEP 1: テーマを入れて「AI原稿を作成」。テーマは任意で、長さも選べます。</li>
                <li>STEP 2: 原稿を直接編集。テーマを入れずに、Step2へ直接入力することもできます。</li>
                <li>STEP 2: 原稿を1つの欄で編集し、必要な箇所を選んで語り口調を付けます。</li>
                <li>STEP 3: 音声エンジンと声を選び、エンジンに応じた話し方を設定します。</li>
              </ol>
            </div>
          )}
          <div className="space-y-2.5 md:space-y-3">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              Step 1: テーマ入力（任意）
            </label>
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="例: 京都旅行の動画"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            />
            <div className="text-xs text-gray-500">
              テーマを入れずに、Step2へ直接入力することもできます。
            </div>
            <fieldset className="space-y-1.5 md:space-y-2 pt-0.5 md:pt-1">
              <legend className="text-xs font-bold text-gray-400 uppercase tracking-wider">文章の長さ</legend>
              <div className="flex items-center justify-between gap-2.5 md:gap-3 flex-wrap">
                <div className="flex flex-wrap gap-2.5 md:gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                    <input
                      type="radio"
                      name="ai-script-length"
                      checked={aiScriptLength === 'short'}
                      onChange={() => onScriptLengthChange('short')}
                      className="accent-purple-500"
                    />
                    短め
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                    <input
                      type="radio"
                      name="ai-script-length"
                      checked={aiScriptLength === 'medium'}
                      onChange={() => onScriptLengthChange('medium')}
                      className="accent-purple-500"
                    />
                    中くらい
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                    <input
                      type="radio"
                      name="ai-script-length"
                      checked={aiScriptLength === 'long'}
                      onChange={() => onScriptLengthChange('long')}
                      className="accent-purple-500"
                    />
                    長め
                  </label>
                </div>
                <button
                  onClick={onGenerateScript}
                  disabled={isAiLoading || !aiPrompt.trim()}
                  className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1 disabled:opacity-50"
                >
                  {isAiLoading ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}{' '}
                  AI原稿を作成
                </button>
              </div>
            </fieldset>
          </div>
          <div className="space-y-1.5 md:space-y-2">
            <label
              htmlFor="ai-narration-script"
              className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"
            >
              Step 2: 原稿（1つの欄で編集）
            </label>
            <textarea
              id="ai-narration-script"
              ref={scriptTextareaRef}
              value={aiScript}
              onChange={(e) => {
                onScriptChange(e.target.value);
                if (selectionHint) setSelectionHint('');
              }}
              placeholder="ここにナレーション原稿を入力・貼り付けできます"
              className="w-full h-40 md:h-44 bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
            />

            {/* 区間ごとの語り口調：選択範囲へ付与（入力欄は分割しない） */}
            <div className="rounded-lg border border-gray-700/80 bg-gray-900/50 p-2.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <p className="text-[11px] md:text-xs font-semibold text-gray-300">
                  文中の部分アクセント・メリハリ（選択範囲のみ）
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={removeToneFromSelection}
                    className="min-h-8 px-2 rounded-md text-[10px] md:text-[11px] font-semibold border border-gray-600 bg-gray-800 text-gray-200 hover:border-amber-400/70 hover:text-amber-100"
                  >
                    選択のアクセントを外す
                  </button>
                  {appliedToneLabels.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onScriptChange(clearAllDeliveryMarkers(aiScript));
                        setSelectionHint('');
                      }}
                      className="text-[10px] md:text-[11px] text-gray-400 underline underline-offset-2 hover:text-gray-200"
                    >
                      すべて外す
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-gray-500 leading-relaxed">
                選んだ部分に強調・ささやきを追加。全体の声は Step 3 で設定します。
              </p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="語り口調プリセット">
                {NARRATION_TONE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyToneToSelection(preset.label)}
                    className="min-h-9 px-2.5 rounded-lg text-[11px] md:text-xs font-semibold border border-gray-600 bg-gray-800 text-gray-100 hover:border-purple-400 hover:bg-purple-500/15 active:scale-[0.98] transition"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={customToneText}
                  onChange={(e) => setCustomToneText(e.target.value)}
                  placeholder="自由な部分アクセント（例: 疑問を投げかけるように、笑いながら）"
                  className="min-w-0 flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!customToneText.trim()) {
                      setSelectionHint('自由入力の語り口を書いてから適用してください。');
                      return;
                    }
                    applyToneToSelection(customToneText.trim());
                  }}
                  className="shrink-0 min-h-9 px-3 rounded-lg text-[11px] md:text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white"
                >
                  適用
                </button>
              </div>
              {selectionHint && (
                <p className="text-[10px] text-amber-300/90" role="status">
                  {selectionHint}
                </p>
              )}
              {appliedToneLabels.length > 0 && (
                <p className="text-[10px] text-gray-500">
                  設定中: {appliedToneLabels.join(' / ')}（選択フレーズのみ部分演出。
                  {aiTtsEngine === 'legacy'
                    ? 'Gemini 2.5 では [tag] へ変換します。'
                    : 'Gemini 3.8 では区間ごとの話し方へ変換します。'}）
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3 md:space-y-4">
            <div className="space-y-1.5 md:space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                Step 3: 音声エンジン・声
              </label>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="ai-tts-engine" className="text-xs font-bold text-gray-400">音声エンジン</label>
              <select
                id="ai-tts-engine"
                value={aiTtsEngine}
                onChange={(event) => onTtsEngineChange(event.target.value as NarrationTtsEngine)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              >
                <option value="gemini-3.8-flash-tts">Gemini 3.8 Flash TTS（既定・高音質）</option>
                <option value="gemini-3.8-flash-lite-tts">Gemini 3.8 Flash-Lite TTS（高速）</option>
                <option value="legacy">Gemini 2.5 Flash TTS（従来方式）</option>
              </select>
              <p className="text-[10px] md:text-xs text-gray-500">
                Gemini 2.5 Flash TTS は、これまでと同じ方法で音声を生成します。
              </p>
            </div>

            {/* 従来エンジンの Scene / Sample Context */}
            {aiTtsEngine === 'legacy' && (
            <div className="space-y-2 rounded-xl border border-indigo-500/30 bg-linear-to-br from-indigo-950/30 via-purple-950/20 to-gray-900/50 p-3 md:p-3.5">
              <p className="text-xs font-bold text-indigo-200">Gemini 2.5 Flash TTS の設定</p>
              <span className="block text-xs font-bold text-gray-400">場面・状況（全体）</span>
              <div
                className="grid grid-cols-2 sm:grid-cols-3 gap-1.5"
                role="group"
                aria-label="場面プリセット"
              >
                {NARRATION_SCENE_PRESETS.map((preset) => {
                  const active = scenePresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyScenePreset(preset.id)}
                      className={`min-h-10 w-full px-2 rounded-lg text-[11px] md:text-xs font-semibold border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                        active
                          ? 'bg-indigo-500 text-white border-indigo-400'
                          : 'bg-gray-900 text-gray-300 border-gray-700 hover:border-indigo-400/60'
                      }`}
                      aria-pressed={active}
                    >
                      {preset.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => applyScenePreset('custom')}
                  className={`min-h-10 w-full px-2 rounded-lg text-[11px] md:text-xs font-semibold border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                    scenePresetId === 'custom'
                      ? 'bg-indigo-500 text-white border-indigo-400'
                      : 'bg-gray-900 text-gray-300 border-gray-700 hover:border-indigo-400/60'
                  }`}
                  aria-pressed={scenePresetId === 'custom'}
                >
                  自由入力
                </button>
              </div>
              {scenePresetId === 'custom' && (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={customSceneLine}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCustomSceneLine(value);
                      setScenePresetId('custom');
                      onNarrationSceneChange(
                        resolveSceneSetting('custom', value, customSampleContext),
                      );
                    }}
                    placeholder="場面（Scene）例: 静かなスタジオ。"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <textarea
                    value={customSampleContext}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCustomSampleContext(value);
                      setScenePresetId('custom');
                      onNarrationSceneChange(
                        resolveSceneSetting('custom', customSceneLine, value),
                      );
                    }}
                    rows={2}
                    placeholder="話し方（Sample Context）例: 落ち着いたペースで、はっきりと親しみやすく。"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
              )}
              {(activeSceneSetting.scene || activeSceneSetting.sampleContext) && (
                <div className="rounded-lg border border-gray-700/70 bg-gray-900/60 px-2.5 py-2 space-y-1 text-[10px] md:text-[11px] text-gray-400 leading-relaxed">
                  {activeSceneSetting.scene && (
                    <p>
                      <span className="font-semibold text-gray-300">場面（Scene）</span>{' '}
                      {activeSceneSetting.scene}
                    </p>
                  )}
                  {activeSceneSetting.sampleContext && (
                    <p>
                      <span className="font-semibold text-gray-300">話し方（Sample Context）</span>{' '}
                      {activeSceneSetting.sampleContext}
                    </p>
                  )}
                </div>
              )}
              <p className="text-[10px] text-gray-500 leading-relaxed">
                場面と話し方を指定し、文中のアクセントと組み合わせられます。
              </p>
            </div>
            )}

            {aiTtsEngine !== 'legacy' && (
              <div className="space-y-2 rounded-xl border border-indigo-500/30 bg-linear-to-br from-indigo-950/30 via-purple-950/20 to-gray-900/50 p-3 md:p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-indigo-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
                    <span>Gemini 3.8 の話し方</span>
                    <span className="text-[10px] text-indigo-300/80 font-normal">（全体の基本トーン）</span>
                  </p>
                  <span className="text-[10px] text-indigo-300/80">動画全体のベース音声</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-gray-300">
                    <span>声の雰囲気（全体のトーン）</span>
                    <select
                      aria-label="声の雰囲気"
                      value={aiTtsTone}
                      onChange={(event) => onTtsToneChange(event.target.value as NarrationTtsTone)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-900/90 p-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="natural">自然</option>
                      <option value="warm">温かく親しみやすい</option>
                      <option value="calm">落ち着いた</option>
                      <option value="energetic">明るく元気</option>
                      <option value="clear">明瞭で聞き取りやすい</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs text-gray-300">
                    <span>話す速さ（全体のテンポ）</span>
                    <select
                      aria-label="話す速さ"
                      value={aiTtsPace}
                      onChange={(event) => onTtsPaceChange(event.target.value as NarrationTtsPace)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-900/90 p-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="normal">自然</option>
                      <option value="slow">ゆっくり</option>
                      <option value="fast">速め</option>
                    </select>
                  </label>
                </div>
                <div className="space-y-1.5 pt-0.5">
                  <label htmlFor="ai-tts-style-detail" className="block text-xs text-gray-300">
                    <span>追加の演出・キャラクター指示（任意）</span>
                  </label>
                  <input
                    id="ai-tts-style-detail"
                    type="text"
                    value={aiTtsStyleDetail}
                    onChange={(event) => onTtsStyleDetailChange(event.target.value)}
                    maxLength={200}
                    placeholder="例: アニメ調でコミカルに、ドキュメンタリー風の重厚な語りで"
                    className="w-full rounded-lg border border-gray-700 bg-gray-900/90 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {[
                      'アニメ調でコミカルに',
                      'ドキュメンタリー風の重厚な語りで',
                      '感情豊かにドラマチックに',
                      '囁くように静かに（ASMR風）',
                      'ニュースキャスター風に端正に',
                      '熱血・ハイテンションに',
                      '親身に語りかける相棒風に',
                      '物語の読み聞かせ風に',
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          const current = aiTtsStyleDetail.trim();
                          if (!current) {
                            onTtsStyleDetailChange(suggestion);
                          } else if (!current.includes(suggestion)) {
                            onTtsStyleDetailChange(`${current}、${suggestion}`);
                          }
                        }}
                        className="text-[10px] md:text-[11px] px-2 py-0.5 rounded-full border border-indigo-500/30 bg-indigo-950/40 text-indigo-300 hover:border-indigo-400 hover:bg-indigo-900/50 hover:text-indigo-100 transition"
                      >
                        ＋ {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2.5 md:space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor="ai-voice-select" className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-blue-400" />
                  <span>声の選択</span>
                </label>
                <div className="flex items-center gap-2">
                  {hasActiveVoiceFilters && (
                    <button
                      type="button"
                      onClick={resetVoiceFilters}
                      className="text-[11px] text-amber-300 hover:text-amber-200 flex items-center gap-1 underline underline-offset-2"
                    >
                      <RotateCcw className="w-3 h-3" />
                      条件をリセット
                    </button>
                  )}
                  <span className="text-[11px] text-gray-400 font-medium">
                    候補: {filteredCount} 件
                  </span>
                </div>
              </div>

              {/* 選択中の声ハイライトカード */}
              <div className="rounded-xl border border-blue-500/40 bg-linear-to-r from-blue-950/40 via-indigo-950/30 to-gray-900/60 p-2.5 md:p-3 flex items-center justify-between gap-3 shadow-inner">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-500/25 text-blue-200 border border-blue-400/40 flex items-center gap-1">
                      <Check className="w-3 h-3 text-blue-300" />
                      選択中
                    </span>
                    <span className="font-bold text-sm text-white truncate">
                      {selectedVoice ? selectedVoice.label : selectedExtraVoice ? selectedExtraVoice.label : aiVoice}
                    </span>
                    {selectedVoice && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium border shrink-0 bg-gray-900/60 border-gray-700">
                        <span
                          className={`w-2 h-2 rounded-xs shrink-0 ${
                            selectedVoice.gender === 'female' ? 'bg-pink-400' : 'bg-blue-400'
                          }`}
                        />
                        <span className={selectedVoice.gender === 'female' ? 'text-pink-300' : 'text-blue-300'}>
                          {selectedVoice.gender === 'female' ? '女性' : '男性'}
                        </span>
                        <span className="text-gray-400 text-[10px]">· 基本</span>
                      </span>
                    )}
                    {selectedExtraVoice && (
                      <>
                        <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium border shrink-0 bg-gray-900/60 border-gray-700">
                          <span
                            className={`w-2 h-2 rounded-xs shrink-0 ${
                              selectedExtraVoice.gender === 'female'
                                ? 'bg-pink-400'
                                : selectedExtraVoice.gender === 'male'
                                  ? 'bg-blue-400'
                                  : 'bg-gray-400'
                            }`}
                          />
                          <span
                            className={
                              selectedExtraVoice.gender === 'female'
                                ? 'text-pink-300'
                                : selectedExtraVoice.gender === 'male'
                                  ? 'text-blue-300'
                                  : 'text-gray-400'
                            }
                          >
                            {selectedExtraVoice.gender === 'female' ? '女性' : selectedExtraVoice.gender === 'male' ? '男性' : '指定なし'}
                          </span>
                        </span>
                        <span className="text-[11px] text-indigo-200/90 bg-indigo-900/40 px-1.5 py-0.5 rounded border border-indigo-700/50">
                          {selectedExtraVoice.languageCode.startsWith('ja') ? '🇯🇵 日本語' : '🇺🇸 英語'}
                        </span>
                      </>
                    )}
                  </div>
                  <p
                    className="text-xs text-gray-300 mt-1 truncate"
                    title={selectedExtraVoice ? wrapVoiceTooltip([
                      selectedExtraVoice.label,
                      formatPersonaLabel(selectedExtraVoice.persona),
                      formatContextLabel(selectedExtraVoice.context),
                      formatVoiceDescription(selectedExtraVoice),
                    ].filter(Boolean).join(' · ')) : undefined}
                  >
                    {selectedVoice
                      ? `${selectedVoice.desc} (${selectedVoice.traitEn})`
                      : selectedExtraVoice
                        ? [formatPersonaLabel(selectedExtraVoice.persona), formatContextLabel(selectedExtraVoice.context), formatVoiceDescription(selectedExtraVoice)].filter(Boolean).join(' · ')
                        : '未選択'}
                  </p>
                </div>
                <a
                  href="https://aistudio.google.com/generate-speech"
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] text-blue-300 hover:text-blue-100 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 px-2 py-1 rounded-lg transition"
                  title="Google AI Studio で音声を試聴・確認"
                >
                  <span>試聴</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* 基本の30声 / 追加音声 切り替えタブ */}
              {isGemini38 && (
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
                        className={`min-h-9 py-1 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                          active
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                        }`}
                      >
                        <span>{label}</span>
                        {source === 'basic' && <span className="text-[10px] opacity-75">({voiceOptions.length})</span>}
                        {source === 'library' && extraVoices.length > 0 && <span className="text-[10px] opacity-75">({extraVoices.length})</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 追加音声タブ */}
              {isGemini38 && voiceSource === 'library' && (
                <div className="space-y-2.5">
                  {!libraryLoaded ? (
                    <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 text-center space-y-2.5">
                      <p className="text-xs text-indigo-200 leading-relaxed">
                        {libraryLoading
                          ? 'Google AI Studio の Extended Voice Library から追加の音声を読み込んでいます…'
                          : 'Google AI Studio の Extended Voice Library から、日本語・英語の多彩な声を取得します。'}
                      </p>
                      <button
                        type="button"
                        onClick={loadVoiceLibrary}
                        disabled={libraryLoading}
                        aria-label="追加の声を読み込む"
                        className="w-full sm:w-auto min-h-10 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
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
                      {libraryError && <p role="alert" className="text-xs text-amber-300">{libraryError}</p>}
                    </div>
                  ) : (
                    <div className="space-y-2.5 rounded-xl border border-gray-700/80 bg-gray-900/70 p-3 space-y-2.5">
                      {/* 言語選択 ＆ 再読み込み */}
                      {/* 言語選択 ＆ リセット ＆ 再読み込み */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-700/60 pb-2">
                        <div className="flex items-center gap-1.5" role="group" aria-label="言語切り替え">
                          <label htmlFor="ai-voice-language-select" className="text-xs font-bold text-gray-400 mr-1">
                            言語:
                          </label>
                          <select
                            id="ai-voice-language-select"
                            aria-label="言語"
                            value={voiceLanguage}
                            onChange={(event) => {
                              setVoiceLanguage(event.target.value as 'ja' | 'en');
                              setVoicePersona('');
                              setVoiceContext('');
                            }}
                            className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1 text-xs text-gray-100 font-semibold focus:outline-none focus:border-blue-400"
                          >
                            <option value="ja">🇯🇵 日本語 ({jaVoiceCount}件)</option>
                            <option value="en">🇺🇸 英語 ({enVoiceCount}件)</option>
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={loadVoiceLibrary}
                          disabled={libraryLoading}
                          className="text-[11px] text-gray-400 hover:text-gray-200 underline disabled:opacity-50"
                        >
                          {libraryLoading ? '読み込み中…' : '追加の声を再読み込み'}
                        </button>
                      </div>

                      {/* 性別 ＆ 用途・目的 ＆ 職業・人物像（場所を取らないコンパクトな3列配置で完全に整列） */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-semibold text-gray-400 h-4 flex items-center leading-none">
                            性別
                          </span>
                          <div className="flex gap-1 h-8 items-stretch" role="group" aria-label="声の性別で絞り込み">
                            {voiceGenderFilterOptions.map((opt) => {
                              const active = voiceGenderFilter === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => setVoiceGenderFilter(opt.id)}
                                  className={`flex-1 h-8 px-1.5 whitespace-nowrap rounded-md text-[11px] font-semibold border transition text-center flex items-center justify-center ${
                                    active
                                      ? 'bg-blue-500 text-white border-blue-400'
                                      : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-blue-500/50 hover:text-blue-100'
                                  }`}
                                  aria-pressed={active}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor="ai-voice-context-filter"
                            className="text-[11px] font-semibold text-gray-400 h-4 flex items-center leading-none"
                          >
                            用途・目的（日/英）
                          </label>
                          <select
                            id="ai-voice-context-filter"
                            aria-label="シーン・用途"
                            value={voiceContext}
                            onChange={(event) => {
                              setVoiceContext(event.target.value);
                              setVoicePersona('');
                            }}
                            className="w-full h-8 rounded-md border border-gray-700 bg-gray-800 px-2 text-xs text-gray-100 focus:outline-none focus:border-blue-400 truncate"
                          >
                            <option value="">すべての用途・シーン</option>
                            {contextOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor="ai-voice-persona-filter"
                            className="text-[11px] font-semibold text-gray-400 h-4 flex items-center leading-none"
                          >
                            職業・人物像（日/英）
                          </label>
                          <select
                            id="ai-voice-persona-filter"
                            aria-label="職業・人物像"
                            value={voicePersona}
                            onChange={(event) => {
                              setVoicePersona(event.target.value);
                            }}
                            className="w-full h-8 rounded-md border border-gray-700 bg-gray-800 px-2 text-xs text-gray-100 focus:outline-none focus:border-blue-400 truncate"
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

                      {/* 検索入力 */}
                      <div className="pt-0.5">
                        <input
                          type="search"
                          aria-label="声を検索"
                          value={voiceSearch}
                          onChange={(event) => setVoiceSearch(event.target.value)}
                          placeholder="声の名前や特徴・キーワードで検索（例: ナレーション、明るい）"
                          className="w-full rounded-lg border border-gray-700 bg-gray-800/90 px-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:border-blue-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 基本の30声タブでのフィルター */}
              {(!isGemini38 || voiceSource === 'basic') && (
                <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-900/60 border border-gray-700/60 p-2.5 rounded-xl">
                  <div className="flex items-center gap-1.5" role="group" aria-label="声の性別で絞り込み">
                    <span className="text-xs text-gray-400 font-semibold mr-1">性別:</span>
                    {voiceGenderFilterOptions.map((opt) => {
                      const active = voiceGenderFilter === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setVoiceGenderFilter(opt.id)}
                          className={`min-h-9 w-[4.5rem] px-2 whitespace-nowrap rounded-lg text-xs font-semibold border transition ${
                            active
                              ? 'bg-blue-500 text-white border-blue-400'
                              : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-blue-500/50 hover:text-blue-100'
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
                    className="flex-1 min-w-[140px] rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs text-gray-100 focus:border-blue-400 focus:outline-none"
                  />
                </div>
              )}

              {/* ドロップダウン（アクセシビリティ ＆ テスト互換用: 視覚的には下の直感的なタップ選択カードに一本化） */}
              <div className="sr-only">
                <select
                  id="ai-voice-select"
                  aria-label="声の選択"
                  value={voiceVisibleInSelect ? aiVoice : ''}
                  onChange={(e) => onVoiceChange(e.target.value)}
                  aria-describedby="ai-voice-help"
                >
                  {!voiceVisibleInSelect && (
                    <option value="" disabled>
                      {isGemini38 && voiceSource === 'library'
                        ? extraVoices.length ? '声を選択してください（一覧から選べます）' : '追加の声を読み込んでください'
                        : '基本の声を選択してください'}
                    </option>
                  )}
                  {(!isGemini38 || voiceSource === 'basic') && (
                    <optgroup label="基本の30声">
                      {filteredBaseVoices.map((voice) => (
                        <option key={voice.id} value={voice.id}>{formatVoiceOptionLabel(voice)}</option>
                      ))}
                    </optgroup>
                  )}
                  {isGemini38 && voiceSource === 'library' && filteredExtraVoices.length > 0 && (
                    <optgroup label={`Gemini 3.8 追加の声 (${filteredExtraVoices.length}件)`}>
                      {filteredExtraVoices.map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.label} · {voice.gender === 'female' ? '女性' : voice.gender === 'male' ? '男性' : '指定なし'} · {voice.languageCode} — {formatPersonaLabel(voice.persona) || formatContextLabel(voice.context) || formatVoiceDescription(voice) || voice.id}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* ビジュアル声カードピッカー（タップで直接選べるスリムな一覧リスト） */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-gray-400">
                  <span className="font-semibold text-gray-300">声を選択（タップして切り替え）:</span>
                  <span>{filteredCount} 件中 {Math.min(filteredCount, 40)} 件表示</span>
                </div>
                <div
                  className="max-h-44 sm:max-h-52 overflow-y-auto space-y-1.5 pr-1 rounded-xl border border-gray-800 bg-gray-950/40 p-1.5"
                  role="listbox"
                  aria-label="声の一覧リスト"
                >
                  {(!isGemini38 || voiceSource === 'basic') && (
                    baseVoiceChoices.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-4">ほかに一致する声がありません。</p>
                    ) : (
                      baseVoiceChoices.map((voice) => {
                        const isSelected = aiVoice === voice.id;
                        return (
                          <button
                            key={voice.id}
                            type="button"
                            onClick={() => onVoiceChange(voice.id)}
                            className={`w-full text-left p-2 rounded-lg border transition flex items-center justify-between gap-2 ${
                              isSelected
                                ? 'bg-blue-600/20 border-blue-400 ring-1 ring-blue-400 text-white'
                                : 'bg-gray-900/80 border-gray-800 hover:border-gray-600 text-gray-200'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs">{voice.label}</span>
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium border shrink-0 bg-gray-900 border-gray-700">
                                  <span
                                    className={`w-2 h-2 rounded-xs shrink-0 ${
                                      voice.gender === 'female' ? 'bg-pink-400' : 'bg-blue-400'
                                    }`}
                                  />
                                  <span className={voice.gender === 'female' ? 'text-pink-300' : 'text-blue-300'}>
                                    {voice.gender === 'female' ? '女性' : '男性'}
                                  </span>
                                </span>
                                <span className="text-[10px] text-blue-300 font-medium">
                                  {voice.desc}
                                </span>
                              </div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                          </button>
                        );
                      })
                    )
                  )}

                  {isGemini38 && voiceSource === 'library' && (
                    !libraryLoaded ? (
                      <div className="text-center py-4 space-y-1">
                        <Loader className="w-4 h-4 animate-spin mx-auto text-indigo-400" />
                        <p className="text-xs text-gray-400">追加音声を読み込んでいます…</p>
                      </div>
                    ) : extraVoiceChoices.length === 0 ? (
                      <div className="text-center py-4 space-y-1.5">
                        <p className="text-xs text-amber-300">ほかに一致する声が見つかりませんでした。</p>
                        <button
                          type="button"
                          onClick={resetVoiceFilters}
                          className="text-xs text-blue-400 underline"
                        >
                          絞り込み条件をリセットする
                        </button>
                      </div>
                    ) : (
                      extraVoiceChoices.slice(0, 40).map((voice) => {
                        const isSelected = aiVoice === voice.id;
                        const personaText = formatPersonaLabel(voice.persona);
                        const contextText = formatContextLabel(voice.context);
                        const descriptionText = formatVoiceDescription(voice);
                        return (
                          <button
                            key={voice.id}
                            type="button"
                            onClick={() => onVoiceChange(voice.id)}
                            title={wrapVoiceTooltip([voice.label, personaText, contextText, descriptionText].filter(Boolean).join(' · '))}
                            className={`w-full text-left p-2 rounded-lg border transition flex items-start justify-between gap-2 ${
                              isSelected
                                ? 'bg-blue-600/20 border-blue-400 ring-1 ring-blue-400 text-white'
                                : 'bg-gray-900/80 border-gray-800 hover:border-gray-600 text-gray-200'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-bold text-xs">{voice.label}</span>
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium border shrink-0 bg-gray-900 border-gray-700">
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
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
                                  {voice.languageCode.startsWith('ja') ? '🇯🇵 日本語' : '🇺🇸 英語'}
                                </span>
                                {personaText && (
                                  <span className="text-[10px] text-indigo-300 font-medium truncate max-w-[180px]">
                                    {personaText}
                                  </span>
                                )}
                              </div>
                              {(contextText || descriptionText) && (
                                <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                                  {contextText ? `${contextText} · ` : ''}{descriptionText || voice.id}
                                </p>
                              )}
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />}
                          </button>
                        );
                      })
                    )
                  )}
                </div>
              </div>

              {isGemini38 && !isVoiceId(aiVoice) && !selectedExtraVoice && (
                <p className="text-[10px] md:text-xs text-amber-300">
                  保存済みの声: {aiVoice}。日本語・英語の一覧にない場合も、選択は保持しています。
                </p>
              )}
              <p id="ai-voice-help" className="text-[10px] md:text-xs text-gray-500 leading-relaxed">
                基本の {voiceOptions.length} 声は両エンジンで使える定番の声。{isGemini38 && '追加音声は Gemini 3.8 専用で、人物像や用途から選べます。'}試聴は{' '}
                <a
                  href="https://aistudio.google.com/generate-speech"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                >
                  Google AI Studio
                </a>
                で確認できます。
              </p>
            </div>
          </div>
          <button
            onClick={onGenerateSpeech}
            disabled={isAiLoading || !aiScript.trim()}
            className="w-full bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white py-2.5 md:py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all"
          >
            {isAiLoading ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : (
              <Mic className="w-5 h-5" />
            )}{' '}
            AIナレーションを作成して追加
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiModal;
