import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiModal from '../components/modals/AiModal';

describe('AIナレーションの音声エンジン設定', () => {
  afterEach(() => {
    localStorage.removeItem('turtle-video-gemini-api-key');
    vi.unstubAllGlobals();
  });
  it('既定は従来設定を表示し、Gemini 3.8 選択時だけ話し方設定に切り替える', () => {
    const onTtsEngineChange = vi.fn();
    const onTtsToneChange = vi.fn();
    const props: ComponentProps<typeof AiModal> = {
      isOpen: true,
      onClose: vi.fn(),
      aiPrompt: '',
      aiScript: 'こんにちは。',
      aiScriptLength: 'short',
      aiVoice: 'Aoede',
      aiVoiceStyle: '',
      aiNarrationScene: '',
      aiTtsEngine: 'legacy',
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
      onTtsEngineChange,
      onTtsToneChange,
      onTtsPaceChange: vi.fn(),
      onTtsStyleDetailChange: vi.fn(),
      onGenerateScript: vi.fn(),
      onGenerateSpeech: vi.fn(),
    };
    const { rerender } = render(<AiModal {...props} />);

    expect(screen.getByText('場面・状況（全体）')).toBeInTheDocument();
    expect(screen.queryByText('Gemini 3.8 の話し方')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '音声エンジン' }), {
      target: { value: 'gemini-3.8-flash-tts' },
    });
    expect(onTtsEngineChange).toHaveBeenCalledWith('gemini-3.8-flash-tts');

    rerender(<AiModal {...props} aiTtsEngine="gemini-3.8-flash-tts" />);
    expect(screen.queryByText('場面・状況（全体）')).not.toBeInTheDocument();
    expect(screen.getByText('Gemini 3.8 の話し方')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '声の雰囲気' }), {
      target: { value: 'warm' },
    });
    expect(onTtsToneChange).toHaveBeenCalledWith('warm');
    expect(screen.getByRole('combobox', { name: '声の選択' })).toBeInTheDocument();
  });

  it('Gemini 3.8 では追加音声を選択でき、従来エンジンでは候補から外す', async () => {
    localStorage.setItem('turtle-video-gemini-api-key', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ voices: [
        { id: 'Aoede', display_name: 'Aoede', type: 'prebuilt', gender: 'female' },
        { id: 'voice_extra', display_name: '追加の日本語声', type: 'prompted', gender: 'female', language_code: 'ja-JP', persona: '教師', context: '教育' },
        { id: 'voice_teacher_ad', display_name: '広告用の教師声', type: 'prebuilt', gender: 'female', language_code: 'ja-JP', persona: '教師', context: '広告' },
        { id: 'voice_news', display_name: 'ニュース用声', type: 'prebuilt', gender: 'female', language_code: 'ja-JP', persona: 'アナウンサー', context: 'ニュース' },
        { id: 'voice_plain', display_name: '分類なしの声', type: 'prebuilt', gender: 'female', language_code: 'ja-JP' },
        { id: 'voice_english', display_name: 'English narrator', type: 'prebuilt', gender: 'male', language_code: 'en-US', persona: 'Narrator', context: 'Audiobook' },
        { id: 'voice_french', display_name: 'French narrator', type: 'prebuilt', gender: 'male', language_code: 'fr-FR', persona: 'Narrator', context: 'Audiobook' },
      ] }),
    }));
    const onVoiceChange = vi.fn();
    const props: ComponentProps<typeof AiModal> = {
      isOpen: true, onClose: vi.fn(), aiPrompt: '', aiScript: 'こんにちは。', aiScriptLength: 'short',
      aiVoice: 'Aoede', aiVoiceStyle: '', aiNarrationScene: '', aiTtsEngine: 'gemini-3.8-flash-tts',
      aiTtsTone: 'natural', aiTtsPace: 'normal', aiTtsStyleDetail: '', isAiLoading: false,
      voiceOptions: [{ id: 'Aoede', label: 'Aoede', desc: '軽やか', gender: 'female', traitEn: 'Breezy' }],
      onPromptChange: vi.fn(), onScriptChange: vi.fn(), onScriptLengthChange: vi.fn(),
      onVoiceChange, onVoiceStyleChange: vi.fn(), onNarrationSceneChange: vi.fn(),
      onTtsEngineChange: vi.fn(), onTtsToneChange: vi.fn(), onTtsPaceChange: vi.fn(),
      onTtsStyleDetailChange: vi.fn(), onGenerateScript: vi.fn(), onGenerateSpeech: vi.fn(),
    };
    const { rerender } = render(<AiModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '追加音声' }));
    fireEvent.click(screen.getByRole('button', { name: '追加の声を読み込む' }));
    const voiceSelect = screen.getByRole('combobox', { name: '声の選択' });
    await waitFor(() => expect(within(voiceSelect).getByRole('option', { name: /追加の日本語声/ })).toBeInTheDocument());
    expect(within(voiceSelect).getByRole('option', { name: /ニュース用声/ })).toBeInTheDocument();
    expect(within(voiceSelect).getByRole('option', { name: /分類なしの声/ })).toBeInTheDocument();
    expect(within(voiceSelect).queryByRole('option', { name: /English narrator|French narrator/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '基本の30声' }));
    expect(within(voiceSelect).queryByRole('option', { name: /追加の日本語声/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '追加音声' }));
    fireEvent.change(screen.getByRole('combobox', { name: '職業・人物像' }), { target: { value: '教師' } });
    expect(within(voiceSelect).queryByRole('option', { name: /ニュース用声/ })).not.toBeInTheDocument();
    expect(within(voiceSelect).queryByRole('option', { name: /分類なしの声/ })).not.toBeInTheDocument();
    expect(within(voiceSelect).getByRole('option', { name: /広告用の教師声/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '教育' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'シーン・用途' }), { target: { value: '教育' } });
    expect(within(voiceSelect).queryByRole('option', { name: /広告用の教師声/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '声の選択' }), { target: { value: 'voice_extra' } });
    expect(onVoiceChange).toHaveBeenCalledWith('voice_extra');

    fireEvent.change(screen.getByRole('combobox', { name: '言語' }), { target: { value: 'en' } });
    expect(within(voiceSelect).getByRole('option', { name: /English narrator/ })).toBeInTheDocument();
    expect(within(voiceSelect).queryByRole('option', { name: /追加の日本語声|French narrator/ })).not.toBeInTheDocument();

    rerender(<AiModal {...props} aiTtsEngine="legacy" />);
    expect(screen.queryByRole('option', { name: /追加の日本語声/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Aoede/ })).toBeInTheDocument();
  });

  it('Gemini 3.8 で用途・目的ドロップダウンの絞り込みと条件リセットが動作する', async () => {
    localStorage.setItem('turtle-video-gemini-api-key', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ voices: [
        { id: 'voice_narration', display_name: '解説ナレーター', type: 'prebuilt', gender: 'female', language_code: 'ja-JP', persona: 'Video Voiceover', context: 'Content & Media' },
        { id: 'voice_story', display_name: '昔話の語り手', type: 'prebuilt', gender: 'male', language_code: 'ja-JP', persona: 'Storyteller', context: 'Conversational / Edu' },
      ] }),
    }));
    const onVoiceChange = vi.fn();
    const props: ComponentProps<typeof AiModal> = {
      isOpen: true, onClose: vi.fn(), aiPrompt: '', aiScript: 'こんにちは。', aiScriptLength: 'short',
      aiVoice: 'Aoede', aiVoiceStyle: '', aiNarrationScene: '', aiTtsEngine: 'gemini-3.8-flash-tts',
      aiTtsTone: 'natural', aiTtsPace: 'normal', aiTtsStyleDetail: '', isAiLoading: false,
      voiceOptions: [{ id: 'Aoede', label: 'Aoede', desc: '軽やか', gender: 'female', traitEn: 'Breezy' }],
      onPromptChange: vi.fn(), onScriptChange: vi.fn(), onScriptLengthChange: vi.fn(),
      onVoiceChange, onVoiceStyleChange: vi.fn(), onNarrationSceneChange: vi.fn(),
      onTtsEngineChange: vi.fn(), onTtsToneChange: vi.fn(), onTtsPaceChange: vi.fn(),
      onTtsStyleDetailChange: vi.fn(), onGenerateScript: vi.fn(), onGenerateSpeech: vi.fn(),
    };
    render(<AiModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '追加音声' }));
    fireEvent.click(screen.getByRole('button', { name: '追加の声を読み込む' }));

    const voiceSelect = screen.getByRole('combobox', { name: '声の選択' });
    await waitFor(() => expect(within(voiceSelect).getByRole('option', { name: /解説ナレーター/ })).toBeInTheDocument());
    expect(within(voiceSelect).getByRole('option', { name: /昔話の語り手/ })).toBeInTheDocument();

    // 「Content & Media」の日本語・英語併記オプションが存在することを確認
    expect(screen.getByRole('option', { name: /動画・メディアコンテンツ \(Content & Media\)/ })).toBeInTheDocument();

    // 用途・目的ドロップダウンで「Content & Media」に絞り込み
    fireEvent.change(screen.getByRole('combobox', { name: 'シーン・用途' }), { target: { value: 'Content & Media' } });
    expect(within(voiceSelect).getByRole('option', { name: /解説ナレーター/ })).toBeInTheDocument();
    expect(within(voiceSelect).queryByRole('option', { name: /昔話の語り手/ })).not.toBeInTheDocument();

    // カードリストから直接タップして選択
    fireEvent.click(screen.getByRole('button', { name: /解説ナレーター/ }));
    expect(onVoiceChange).toHaveBeenCalledWith('voice_narration');

    // 条件をリセット
    expect(screen.getByRole('button', { name: /条件をリセット/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /条件をリセット/ }));
  });

  it('職業を選択しても用途・目的ドロップダウンの全選択肢が維持され、用途の変更で職業がリセットされる', async () => {
    localStorage.setItem('turtle-video-gemini-api-key', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ voices: [
        { id: 'voice_narration', display_name: '解説ナレーター', type: 'prebuilt', gender: 'female', language_code: 'ja-JP', persona: 'Video Voiceover', context: 'Content & Media' },
        { id: 'voice_story', display_name: '昔話の語り手', type: 'prebuilt', gender: 'male', language_code: 'ja-JP', persona: 'Storyteller', context: 'Conversational / Edu' },
      ] }),
    }));
    const props: ComponentProps<typeof AiModal> = {
      isOpen: true, onClose: vi.fn(), aiPrompt: '', aiScript: 'こんにちは。', aiScriptLength: 'short',
      aiVoice: 'Aoede', aiVoiceStyle: '', aiNarrationScene: '', aiTtsEngine: 'gemini-3.8-flash-tts',
      aiTtsTone: 'natural', aiTtsPace: 'normal', aiTtsStyleDetail: '', isAiLoading: false,
      voiceOptions: [{ id: 'Aoede', label: 'Aoede', desc: '軽やか', gender: 'female', traitEn: 'Breezy' }],
      onPromptChange: vi.fn(), onScriptChange: vi.fn(), onScriptLengthChange: vi.fn(),
      onVoiceChange: vi.fn(), onVoiceStyleChange: vi.fn(), onNarrationSceneChange: vi.fn(),
      onTtsEngineChange: vi.fn(), onTtsToneChange: vi.fn(), onTtsPaceChange: vi.fn(),
      onTtsStyleDetailChange: vi.fn(), onGenerateScript: vi.fn(), onGenerateSpeech: vi.fn(),
    };
    render(<AiModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '追加音声' }));
    fireEvent.click(screen.getByRole('button', { name: '追加の声を読み込む' }));

    const voiceSelect = screen.getByRole('combobox', { name: '声の選択' });
    await waitFor(() => expect(within(voiceSelect).getByRole('option', { name: /解説ナレーター/ })).toBeInTheDocument());

    const contextSelect = screen.getByRole('combobox', { name: 'シーン・用途' });
    const personaSelect = screen.getByRole('combobox', { name: '職業・人物像' });

    // 先に職業・人物像で「Video Voiceover」を選択
    fireEvent.change(personaSelect, { target: { value: 'Video Voiceover' } });
    expect(personaSelect).toHaveValue('Video Voiceover');

    // 職業を選択していても、用途・目的ドロップダウンには依然としてすべての用途（Content & Media と Conversational / Edu）が残っている
    expect(within(contextSelect).getByRole('option', { name: /動画・メディアコンテンツ/ })).toBeInTheDocument();
    expect(within(contextSelect).getByRole('option', { name: /会話・教育・学習/ })).toBeInTheDocument();

    // 直接用途を「Conversational / Edu」に切り替えると、前の職業が自動リセットされ、用途に属する声が表示される
    fireEvent.change(contextSelect, { target: { value: 'Conversational / Edu' } });
    expect(personaSelect).toHaveValue('');
    expect(within(voiceSelect).getByRole('option', { name: /昔話の語り手/ })).toBeInTheDocument();
    expect(within(voiceSelect).queryByRole('option', { name: /解説ナレーター/ })).not.toBeInTheDocument();
  });

  it('追加の話し方にアニメ調やドキュメンタリー風などの演出チップが表示され、クリックで設定される', () => {
    const onTtsStyleDetailChange = vi.fn();
    const props: ComponentProps<typeof AiModal> = {
      isOpen: true, onClose: vi.fn(), aiPrompt: '', aiScript: 'こんにちは。', aiScriptLength: 'short',
      aiVoice: 'Aoede', aiVoiceStyle: '', aiNarrationScene: '', aiTtsEngine: 'gemini-3.8-flash-tts',
      aiTtsTone: 'natural', aiTtsPace: 'normal', aiTtsStyleDetail: '', isAiLoading: false,
      voiceOptions: [{ id: 'Aoede', label: 'Aoede', desc: '軽やか', gender: 'female', traitEn: 'Breezy' }],
      onPromptChange: vi.fn(), onScriptChange: vi.fn(), onScriptLengthChange: vi.fn(),
      onVoiceChange: vi.fn(), onVoiceStyleChange: vi.fn(), onNarrationSceneChange: vi.fn(),
      onTtsEngineChange: vi.fn(), onTtsToneChange: vi.fn(), onTtsPaceChange: vi.fn(),
      onTtsStyleDetailChange, onGenerateScript: vi.fn(), onGenerateSpeech: vi.fn(),
    };
    render(<AiModal {...props} />);

    const animeChip = screen.getByRole('button', { name: '＋ アニメ調でコミカルに' });
    expect(animeChip).toBeInTheDocument();
    fireEvent.click(animeChip);
    expect(onTtsStyleDetailChange).toHaveBeenCalledWith('アニメ調でコミカルに');
  });

  it('場面・状況でスタジオ解説を選択した後に自由入力を選択しても指定なしに戻らず自由入力が維持される', () => {
    let currentScene = '';
    const onNarrationSceneChange = vi.fn((scene: string) => {
      currentScene = scene;
    });
    const props: ComponentProps<typeof AiModal> = {
      isOpen: true, onClose: vi.fn(), aiPrompt: '', aiScript: 'こんにちは。', aiScriptLength: 'short',
      aiVoice: 'Aoede', aiVoiceStyle: '', aiNarrationScene: '', aiTtsEngine: 'legacy',
      aiTtsTone: 'natural', aiTtsPace: 'normal', aiTtsStyleDetail: '', isAiLoading: false,
      voiceOptions: [{ id: 'Aoede', label: 'Aoede', desc: '軽やか', gender: 'female', traitEn: 'Breezy' }],
      onPromptChange: vi.fn(), onScriptChange: vi.fn(), onScriptLengthChange: vi.fn(),
      onVoiceChange: vi.fn(), onVoiceStyleChange: vi.fn(), onNarrationSceneChange,
      onTtsEngineChange: vi.fn(), onTtsToneChange: vi.fn(), onTtsPaceChange: vi.fn(),
      onTtsStyleDetailChange: vi.fn(), onGenerateScript: vi.fn(), onGenerateSpeech: vi.fn(),
    };
    const { rerender } = render(<AiModal {...props} />);

    // 最初は「指定なし」がアクティブ
    expect(screen.getByRole('button', { name: '指定なし' })).toHaveAttribute('aria-pressed', 'true');

    // 「スタジオ解説」をクリック
    fireEvent.click(screen.getByRole('button', { name: 'スタジオ解説' }));
    expect(onNarrationSceneChange).toHaveBeenCalled();
    expect(currentScene).toContain('静かなスタジオ。');

    // 親の state 更新を反映
    rerender(<AiModal {...props} aiNarrationScene={currentScene} />);
    expect(screen.getByRole('button', { name: 'スタジオ解説' })).toHaveAttribute('aria-pressed', 'true');

    // 次に「自由入力」をクリック
    fireEvent.click(screen.getByRole('button', { name: '自由入力' }));
    expect(screen.getByRole('button', { name: '自由入力' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '指定なし' })).toHaveAttribute('aria-pressed', 'false');

    // 親の state 更新（自由入力の値）を反映
    rerender(<AiModal {...props} aiNarrationScene={currentScene} />);
    // 自由入力の選択状態が維持され、「指定なし」にリセットされていないこと
    expect(screen.getByRole('button', { name: '自由入力' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '指定なし' })).toHaveAttribute('aria-pressed', 'false');
    // 入力欄にスタジオ解説の内容が初期値として引き継がれていること
    expect(screen.getByPlaceholderText(/Scene（場所）/)).toHaveValue('静かなスタジオ。');
  });
});
