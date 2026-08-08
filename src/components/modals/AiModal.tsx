/**
 * @file AiModal.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description AIナレーションを生成するためのモーダルダイアログ。プロンプト入力、スクリプト生成、音声合成のフローを提供する。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, X, Loader, FileText, Mic, ChevronDown, CircleHelp, ExternalLink } from 'lucide-react';
import type {
  VoiceOption,
  VoiceId,
  NarrationScriptLength,
  VoiceGenderFilter,
} from '../../types';
import {
  formatVoiceOptionLabel,
  getVoiceOption,
  resolveVoiceSelectOptions,
} from '../../constants';
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
  onClose: () => void;
  aiPrompt: string;
  aiScript: string;
  aiScriptLength: NarrationScriptLength;
  aiVoice: VoiceId;
  aiVoiceStyle: string;
  aiNarrationScene: string;
  isAiLoading: boolean;
  voiceOptions: VoiceOption[];
  onPromptChange: (value: string) => void;
  onScriptChange: (value: string) => void;
  onScriptLengthChange: (value: NarrationScriptLength) => void;
  onVoiceChange: (value: VoiceId) => void;
  onVoiceStyleChange: (value: string) => void;
  onNarrationSceneChange: (scene: string) => void;
  onGenerateScript: () => void;
  onGenerateSpeech: () => void;
}

/**
 * AIナレーション生成モーダル
 */
const AiModal: React.FC<AiModalProps> = ({
  isOpen,
  onClose,
  aiPrompt,
  aiScript,
  aiScriptLength,
  aiVoice,
  aiVoiceStyle,
  aiNarrationScene,
  isAiLoading,
  voiceOptions,
  onPromptChange,
  onScriptChange,
  onScriptLengthChange,
  onVoiceChange,
  onVoiceStyleChange: _onVoiceStyleChange,
  onNarrationSceneChange,
  onGenerateScript,
  onGenerateSpeech,
}) => {
  // モーダル表示中は背景のスクロールを防止
  useDisableBodyScroll(isOpen);
  /** 声一覧の性別絞り込み（すべて / 女性 / 男性） */
  const [voiceGenderFilter, setVoiceGenderFilter] = useState<VoiceGenderFilter>('all');
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
    { id: 'all', label: 'すべて' },
    { id: 'female', label: '女性' },
    { id: 'male', label: '男性' },
  ];

  const filteredVoiceOptions = useMemo(
    () => resolveVoiceSelectOptions(voiceOptions, voiceGenderFilter, aiVoice),
    [voiceOptions, voiceGenderFilter, aiVoice],
  );

  const selectedVoice =
    getVoiceOption(aiVoice) ?? voiceOptions.find((v) => v.id === aiVoice) ?? null;

  const filteredCount =
    voiceGenderFilter === 'all'
      ? voiceOptions.length
      : voiceOptions.filter((v) => v.gender === voiceGenderFilter).length;

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
      onNarrationSceneChange(
        resolveSceneSetting('custom', customSceneLine, customSampleContext),
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
                <li>STEP 3: 場面（全体）と声を選んで「AIナレーションを作成して追加」を押します。</li>
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
                  選択した文章に語り口調
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={removeToneFromSelection}
                    className="min-h-8 px-2 rounded-md text-[10px] md:text-[11px] font-semibold border border-gray-600 bg-gray-800 text-gray-200 hover:border-amber-400/70 hover:text-amber-100"
                  >
                    選択の語り口を外す
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
                原稿の一部を選んでからボタンを押します。スマホは長押しで範囲選択。解除は範囲を選ぶか《…》の中にカーソルを置いて「選択の語り口を外す」。
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
                  placeholder="自由な語り口（例: 少し早口で）"
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
                  設定中: {appliedToneLabels.join(' / ')}（画面上は《語り口》…《/》。音声生成時は
                  Scene / Sample Context と短い英語 [tag] 本文 形式へ変換）
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3 md:space-y-4">
            <div className="space-y-1.5 md:space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                Step 3: 場面・声
              </label>
            </div>

            {/* 全体の Scene / Sample Context（Google 公式 TTS 構成に対応） */}
            <div className="space-y-1.5 md:space-y-2">
              <span className="text-xs font-bold text-gray-400">場面・状況（全体）</span>
              <div
                className="flex flex-wrap gap-1.5"
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
                      className={`min-h-9 px-2.5 rounded-lg text-[11px] md:text-xs font-semibold border transition ${
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
                  className={`min-h-9 px-2.5 rounded-lg text-[11px] md:text-xs font-semibold border transition ${
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
                    placeholder="Scene（場所）例: 静かなスタジオ。"
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
                    placeholder="Sample Context（話し方）例: 操作説明。落ち着いたペースで、はっきりと親しみやすく。"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
              )}
              {(activeSceneSetting.scene || activeSceneSetting.sampleContext) && (
                <div className="rounded-lg border border-gray-700/70 bg-gray-900/60 px-2.5 py-2 space-y-1 text-[10px] md:text-[11px] text-gray-400 leading-relaxed">
                  {activeSceneSetting.scene && (
                    <p>
                      <span className="font-semibold text-gray-300">Scene</span>{' '}
                      {activeSceneSetting.scene}
                    </p>
                  )}
                  {activeSceneSetting.sampleContext && (
                    <p>
                      <span className="font-semibold text-gray-300">Sample Context</span>{' '}
                      {activeSceneSetting.sampleContext}
                    </p>
                  )}
                </div>
              )}
              <p className="text-[10px] text-gray-500 leading-relaxed">
                Google TTS と同様に、場所（Scene）と話し方の方針（Sample Context）を指定します。区間の
                [tag] と組み合わせて臨場感を出せます。
              </p>
            </div>

            <div className="space-y-1.5 md:space-y-2">
              <label className="text-xs font-bold text-gray-400 flex items-center gap-1">
                声の選択
              </label>
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label="声の性別で絞り込み"
              >
                {voiceGenderFilterOptions.map((opt) => {
                  const active = voiceGenderFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setVoiceGenderFilter(opt.id)}
                      className={`min-h-9 px-3 rounded-lg text-[11px] md:text-xs font-semibold border transition ${
                        active
                          ? 'bg-blue-500 text-white border-blue-400'
                          : 'bg-gray-900 text-gray-300 border-gray-700 hover:border-blue-500/50 hover:text-blue-100'
                      }`}
                      aria-pressed={active}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                <span className="text-[10px] text-gray-500 ml-0.5">{filteredCount} 件</span>
              </div>
              <div className="relative">
                <select
                  value={aiVoice}
                  onChange={(e) => onVoiceChange(e.target.value as VoiceId)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 pr-10 text-sm appearance-none focus:outline-none focus:border-blue-500 text-gray-100"
                  aria-describedby="ai-voice-help"
                >
                  {filteredVoiceOptions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {formatVoiceOptionLabel(v)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 absolute inset-y-0 right-3 my-auto text-gray-400 pointer-events-none" />
              </div>
              {selectedVoice && (
                <p className="text-[10px] md:text-xs text-gray-400">
                  選択中: {selectedVoice.gender === 'female' ? '女性' : '男性'} · {selectedVoice.label} —{' '}
                  {selectedVoice.desc}
                </p>
              )}
              <p id="ai-voice-help" className="text-[10px] md:text-xs text-gray-500 leading-relaxed">
                公式 {voiceOptions.length} 声。試聴は{' '}
                <a
                  href="https://aistudio.google.com/generate-speech"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                >
                  AI Studio
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
