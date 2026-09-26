import type { ComponentProps } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AiModal from '../components/modals/AiModal';

describe('AiModal popstate handling with stacked modals', () => {
  const defaultProps: ComponentProps<typeof AiModal> = {
    isOpen: true,
    onClose: vi.fn(),
    aiPrompt: '',
    aiScript: 'こんにちは。',
    aiScriptLength: 'short',
    aiVoice: 'Aoede',
    aiVoiceStyle: '',
    aiNarrationScene: '',
    aiTtsEngine: 'gemini-3.8-flash-tts',
    aiTtsTone: 'natural',
    aiTtsPace: 'normal',
    aiTtsStyleDetail: '',
    isAiLoading: false,
    voiceOptions: [{ id: 'Aoede', label: 'Aoede', desc: '軽やか', gender: 'female', traitEn: 'Breezy' }],
    onPromptChange: vi.fn(),
    onScriptChange: vi.fn(),
    onScriptLengthChange: vi.fn(),
    onVoiceChange: vi.fn(),
    onVoiceStyleChange: vi.fn(),
    onNarrationSceneChange: vi.fn(),
    onTtsEngineChange: vi.fn(),
    onTtsToneChange: vi.fn(),
    onTtsPaceChange: vi.fn(),
    onTtsStyleDetailChange: vi.fn(),
    onGenerateScript: vi.fn(),
    onGenerateSpeech: vi.fn(),
    onOpenHelp: vi.fn(),
  };

  it('上に重ねた子モーダルが閉じて自身の state に戻ってきた場合は onClose を呼ばない', () => {
    const onClose = vi.fn();
    render(<AiModal {...defaultProps} onClose={onClose} />);

    // AiModal の pushState により window.history.state に __aiModal がある
    const aiModalState = window.history.state as Record<string, unknown>;
    expect(aiModalState).toHaveProperty('__aiModal');
    const aiModalId = aiModalState.__aiModal;

    // 子モーダル（SectionHelpModal等）が開いて pushState された状態をシミュレート
    const subModalState = { ...aiModalState, __sectionHelpModal: 'help-123' };
    window.history.pushState(subModalState, '');

    // 子モーダルが閉じて window.history.back() され、AiModal の state に戻った popstate イベントを発火
    const popEvent = new PopStateEvent('popstate', { state: { __aiModal: aiModalId } });
    window.dispatchEvent(popEvent);

    // 自分の state に戻ってきただけなので、AiModal の onClose は呼ばれてはならない
    expect(onClose).not.toHaveBeenCalled();
  });

  it('自身の state よりも前に戻る popstate が発生した場合は onClose を呼ぶ', () => {
    const onClose = vi.fn();
    render(<AiModal {...defaultProps} onClose={onClose} />);

    // 自分の __aiModal が存在しない state（モーダルが開く前の状態）へ戻る popstate
    const popEvent = new PopStateEvent('popstate', { state: {} });
    window.dispatchEvent(popEvent);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('APIキーが未登録の場合、黄色い警告バナーが表示され、生成ボタンがdisabledになる', () => {
    localStorage.removeItem('turtle-video-gemini-api-key');
    const { getByRole, getByText } = render(
      <AiModal
        {...defaultProps}
        aiPrompt="京都旅行"
        aiScript="京都の風景です。"
      />
    );

    // 警告バナーが表示されている
    expect(getByText('Gemini APIキーの登録が必要です')).toBeInTheDocument();
    expect(getByText('Google AI Studio でAPIキーを取得（無料）')).toBeInTheDocument();

    // ボタンが無効化されている
    const scriptBtn = getByRole('button', { name: /AI原稿を作成/ });
    expect(scriptBtn).toBeDisabled();

    const speechBtn = getByRole('button', { name: /AIナレーションを作成して追加/ });
    expect(speechBtn).toBeDisabled();
  });

  it('APIキーが登録されている場合、警告バナーは非表示となり、生成ボタンが有効化される', () => {
    localStorage.setItem('turtle-video-gemini-api-key', 'dummy-key-123');
    const { queryByText, getByRole } = render(
      <AiModal
        {...defaultProps}
        aiPrompt="京都旅行"
        aiScript="京都の風景です。"
      />
    );

    // 警告バナーは表示されない
    expect(queryByText('Gemini APIキーの登録が必要です')).not.toBeInTheDocument();

    // プロンプトと原稿があるので有効化されている
    const scriptBtn = getByRole('button', { name: /AI原稿を作成/ });
    expect(scriptBtn).not.toBeDisabled();

    const speechBtn = getByRole('button', { name: /AIナレーションを作成して追加/ });
    expect(speechBtn).not.toBeDisabled();

    localStorage.removeItem('turtle-video-gemini-api-key');
  });
});
