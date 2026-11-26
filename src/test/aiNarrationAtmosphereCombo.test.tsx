import { useState, type ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AiModal from '../components/modals/AiModal';
import { VOICE_OPTIONS } from '../constants';
import type { NarrationTtsTone } from '../types';
import {
  buildGemini38TtsRequest,
  composeAtmosphereStyleDetail,
  normalizeGemini38StyleDetail,
  parseAtmosphereStyleDetail,
  resolveActiveAtmospherePresetIds,
  toggleAtmospherePreset,
} from '../utils/gemini38Tts';

describe('雰囲気の組み合わせ（保存形式は tone + styleDetail のまま）', () => {
  it('旧データ（定型句だけ／自由記述だけ）をそのまま読める', () => {
    expect(parseAtmosphereStyleDetail('熱血・ハイテンションに')).toEqual({ stylePresetIds: ['excited'], freeText: '' });
    expect(parseAtmosphereStyleDetail('物語の読み聞かせ風に')).toEqual({ stylePresetIds: [], freeText: '物語の読み聞かせ風に' });
    expect(parseAtmosphereStyleDetail('')).toEqual({ stylePresetIds: [], freeText: '' });
  });

  it('演出を重ね、補足を後ろへつないで保存し、同じ内容へ読み戻せる', () => {
    const stored = composeAtmosphereStyleDetail(['excited', 'documentary'], '物語風に、ゆっくり');
    expect(stored).toBe('熱血・ハイテンションに、ドキュメンタリー風の重厚な語りで、物語風に、ゆっくり');
    expect(parseAtmosphereStyleDetail(stored)).toEqual({
      stylePresetIds: ['excited', 'documentary'],
      freeText: '物語風に、ゆっくり',
    });
  });

  it('ニュース・解説（声の調子）と熱血（演出）を同時に選択中にできる', () => {
    const afterTone = toggleAtmospherePreset({ tone: 'natural', styleDetail: '' }, 'clear');
    const afterStyle = toggleAtmospherePreset(afterTone, 'excited');
    expect(afterStyle).toEqual({ tone: 'clear', styleDetail: '熱血・ハイテンションに' });
    expect(resolveActiveAtmospherePresetIds(afterStyle.tone, afterStyle.styleDetail)).toEqual(['clear', 'excited']);
  });

  it('声の調子は 1 つだけ（選び替え・再タップで標準）、演出は付け外し、自然（標準）で全部戻す', () => {
    let state: { tone: NarrationTtsTone; styleDetail: string } = { tone: 'clear', styleDetail: '熱血・ハイテンションに、早口で' };
    state = toggleAtmospherePreset(state, 'warm');
    expect(state.tone).toBe('warm');
    state = toggleAtmospherePreset(state, 'warm');
    expect(state.tone).toBe('natural');
    state = toggleAtmospherePreset(state, 'excited');
    expect(state.styleDetail).toBe('早口で');
    state = toggleAtmospherePreset({ tone: 'clear', styleDetail: '熱血・ハイテンションに、早口で' }, 'natural');
    expect(state).toEqual({ tone: 'natural', styleDetail: '早口で' });
    expect(resolveActiveAtmospherePresetIds('natural', '')).toEqual(['natural']);
    expect(resolveActiveAtmospherePresetIds('natural', '熱血・ハイテンションに')).toEqual(['excited']);
  });

  it('音声生成では演出と補足の両方を英語 style にして送る（補足を捨てない）', () => {
    expect(normalizeGemini38StyleDetail('熱血・ハイテンションに、物語の読み聞かせ風に'))
      .toBe('enthusiastic, high-energy, excited delivery, evocative storytelling, warm cinematic phrasing');
    expect(normalizeGemini38StyleDetail('熱血・ハイテンションに、宇宙人っぽく'))
      .toBe('enthusiastic, high-energy, excited delivery, 宇宙人っぽく');
    const request = buildGemini38TtsRequest({
      engine: 'gemini-3.8-flash-tts',
      script: '今日のニュースです。',
      voice: 'Charon',
      tone: 'clear',
      pace: 'normal',
      styleDetail: '熱血・ハイテンションに',
    });
    expect(request.input[0].content[0].annotations?.[0].style)
      .toBe('clear and articulate, enthusiastic, high-energy, excited delivery');
  });
});

function StatefulAiModal() {
  const [tone, setTone] = useState<NarrationTtsTone>('natural');
  const [styleDetail, setStyleDetail] = useState('');
  const props: ComponentProps<typeof AiModal> = {
    isOpen: true,
    onClose: vi.fn(),
    aiPrompt: '',
    aiScript: 'こんにちは。',
    aiScriptLength: 'short',
    aiVoice: 'Aoede',
    aiVoiceStyle: '',
    aiNarrationScene: '',
    aiTtsEngine: 'gemini-3.8-flash-tts',
    aiTtsTone: tone,
    aiTtsPace: 'normal',
    aiTtsStyleDetail: styleDetail,
    isAiLoading: false,
    voiceOptions: VOICE_OPTIONS,
    onPromptChange: vi.fn(),
    onScriptChange: vi.fn(),
    onScriptLengthChange: vi.fn(),
    onVoiceChange: vi.fn(),
    onVoiceStyleChange: vi.fn(),
    onNarrationSceneChange: vi.fn(),
    onTtsEngineChange: vi.fn(),
    onTtsToneChange: setTone,
    onTtsPaceChange: vi.fn(),
    onTtsStyleDetailChange: setStyleDetail,
    onGenerateScript: vi.fn(),
    onGenerateSpeech: vi.fn(),
  };
  return (
    <>
      <AiModal {...props} />
      <output data-testid="stored-style">{`${tone}|${styleDetail}`}</output>
    </>
  );
}

describe('AIナレーションスタジオ: 全体の話し方を組み合わせて、補足を書いても選択が外れない', () => {
  it('ニュース・解説＋熱血を選んだまま、補足欄に追記できる', () => {
    render(<StatefulAiModal />);
    const group = screen.getByRole('group', { name: '全体の雰囲気' });
    fireEvent.click(within(group).getByRole('button', { name: 'ニュース・解説' }));
    fireEvent.click(within(group).getByRole('button', { name: '熱血・盛り上げ' }));

    const input = screen.getByLabelText('細かい話し方の補足（任意）') as HTMLInputElement;
    // 補足欄には自分で書いた文だけが出る（定型句は出さない）
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '語尾をはっきり ' } });

    expect(within(group).getByRole('button', { name: 'ニュース・解説' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: '熱血・盛り上げ' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: '自然（標準）' })).toHaveAttribute('aria-pressed', 'false');
    // 入力途中の末尾の空白も消えない
    expect(input.value).toBe('語尾をはっきり ');
    expect(screen.getByTestId('stored-style').textContent).toBe('clear|熱血・ハイテンションに、語尾をはっきり');

    // 演出を外しても補足は残る
    fireEvent.click(within(group).getByRole('button', { name: '熱血・盛り上げ' }));
    expect(screen.getByTestId('stored-style').textContent).toBe('clear|語尾をはっきり');
    expect(input.value).toBe('語尾をはっきり ');
  });
});
