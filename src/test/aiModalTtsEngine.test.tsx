import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiModal from '../components/modals/AiModal';
import { VOICE_OPTIONS } from '../constants';
import { AI_VOICE_USAGE_STORAGE_KEY } from '../utils/aiVoiceRecents';

function buildBaseProps(overrides: Partial<ComponentProps<typeof AiModal>> = {}): ComponentProps<typeof AiModal> {
  return {
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
    voiceOptions: VOICE_OPTIONS,
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
    ...overrides,
  };
}

describe('AIナレーションスタジオ刷新UIと音声エンジン設定', () => {
  afterEach(() => {
    localStorage.removeItem('turtle-video-gemini-api-key');
    localStorage.removeItem(AI_VOICE_USAGE_STORAGE_KEY);
    vi.unstubAllGlobals();
  });

  it('Gemini 3.8 Flash / Flash-Lite の2択と、全体の雰囲気・速さ・男女代表ボイスをワンタップ設定できる', () => {
    const onTtsEngineChange = vi.fn();
    const onTtsToneChange = vi.fn();
    const onTtsPaceChange = vi.fn();
    const onTtsStyleDetailChange = vi.fn();
    const onVoiceChange = vi.fn();

    render(
      <AiModal
        {...buildBaseProps({
          onTtsEngineChange,
          onTtsToneChange,
          onTtsPaceChange,
          onTtsStyleDetailChange,
          onVoiceChange,
        })}
      />,
    );

    // 音声エンジン（旧 2.5 は出さず 3.8 の 2 択）
    const engineGroup = screen.getByRole('group', { name: '音声エンジン' });
    expect(within(engineGroup).getByRole('button', { name: '高音質 Flash' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(engineGroup).queryByRole('button', { name: /2\.5/ })).not.toBeInTheDocument();
    fireEvent.click(within(engineGroup).getByRole('button', { name: '高速 Flash-Lite' }));
    expect(onTtsEngineChange).toHaveBeenCalledWith('gemini-3.8-flash-lite-tts');

    // 全体の雰囲気（メリハリある統合9種）
    const atmosphereGroup = screen.getByRole('group', { name: '全体の雰囲気' });
    fireEvent.click(within(atmosphereGroup).getByRole('button', { name: '温かく親しみ' }));
    expect(onTtsToneChange).toHaveBeenCalledWith('warm');
    expect(onTtsStyleDetailChange).toHaveBeenCalledWith('');

    fireEvent.click(within(atmosphereGroup).getByRole('button', { name: 'ニュース・解説' }));
    expect(onTtsToneChange).toHaveBeenCalledWith('clear');
    expect(onTtsStyleDetailChange).toHaveBeenCalledWith('');

    fireEvent.click(within(atmosphereGroup).getByRole('button', { name: '熱血・盛り上げ' }));
    expect(onTtsToneChange).toHaveBeenCalledWith('natural');
    expect(onTtsStyleDetailChange).toHaveBeenCalledWith('熱血・ハイテンションに');

    fireEvent.click(within(atmosphereGroup).getByRole('button', { name: '重厚・シリアス' }));
    expect(onTtsToneChange).toHaveBeenCalledWith('natural');
    expect(onTtsStyleDetailChange).toHaveBeenCalledWith('ドキュメンタリー風の重厚な語りで');

    // 話す速さ（3択セグメント）
    const paceGroup = screen.getByRole('group', { name: '話す速さ' });
    fireEvent.click(within(paceGroup).getByRole('button', { name: 'ゆっくり' }));
    expect(onTtsPaceChange).toHaveBeenCalledWith('slow');

    // 男女の代表的な声をその場でワンタップ選択でき、直前の声も「よく使う声」に残って取り消せる
    const femaleGroup = screen.getByRole('group', { name: '女性の代表的な声' });
    fireEvent.click(within(femaleGroup).getByRole('button', { name: /若々しい/ }));
    expect(onVoiceChange).toHaveBeenCalledWith('Leda');
    const frequentAfterClick = screen.getByRole('group', { name: 'よく使う声' });
    expect(within(frequentAfterClick).getByRole('button', { name: /Aoede/ })).toBeInTheDocument();
    expect(within(frequentAfterClick).getByRole('button', { name: /Leda/ })).toBeInTheDocument();

    const maleGroup = screen.getByRole('group', { name: '男性の代表的な声' });
    fireEvent.click(within(maleGroup).getByRole('button', { name: /渋い・低め/ }));
    expect(onVoiceChange).toHaveBeenCalledWith('Algenib');
  });

  it('先頭付近に部分アクセントを適用しても、原稿欄のスクロール位置が末尾へ飛ばず維持される', () => {
    const longScript = Array.from({ length: 30 }, (_, i) => `第${i + 1}段落のナレーション原稿です。`).join('\n');
    let currentScript = longScript;
    const onScriptChange = vi.fn((next: string) => {
      currentScript = next;
    });

    const { rerender } = render(
      <AiModal
        {...buildBaseProps({
          aiScript: currentScript,
          onScriptChange,
        })}
      />,
    );

    const textarea = screen.getByLabelText('原稿（直接入力・編集）') as HTMLTextAreaElement;
    textarea.scrollTop = 0;
    textarea.setSelectionRange(0, 5);

    fireEvent.click(screen.getByRole('button', { name: '強調して' }));
    expect(onScriptChange).toHaveBeenCalled();

    // 親からの再描画で textarea.scrollTop が下へ飛ばされそうになっても元の 0 に復元される
    textarea.scrollTop = 999;
    rerender(
      <AiModal
        {...buildBaseProps({
          aiScript: currentScript,
          onScriptChange,
        })}
      />,
    );
    expect(textarea.scrollTop).toBe(0);
  });

  it('瞬間タグ（少し間・ため息・笑い）をカーソル位置へワンタップ挿入できる', () => {
    const onScriptChange = vi.fn();
    render(
      <AiModal
        {...buildBaseProps({
          aiScript: 'こんにちは。ありがとう。',
          onScriptChange,
        })}
      />,
    );

    const textarea = screen.getByLabelText('原稿（直接入力・編集）') as HTMLTextAreaElement;
    textarea.setSelectionRange(6, 6);

    fireEvent.click(screen.getByRole('button', { name: '少し間' }));
    expect(onScriptChange).toHaveBeenLastCalledWith('こんにちは。【少し間】ありがとう。');

    fireEvent.click(screen.getByRole('button', { name: 'ため息' }));
    expect(onScriptChange).toHaveBeenLastCalledWith('こんにちは。【ため息】ありがとう。');

    fireEvent.click(screen.getByRole('button', { name: '笑い' }));
    expect(onScriptChange).toHaveBeenLastCalledWith('こんにちは。【笑い】ありがとう。');

    // 「その他」で直下へインライン展開 → 公式タグをワンタップ挿入 → もう一度「その他」で非表示
    const toggleBtn = screen.getByRole('button', { name: 'その他' });
    fireEvent.click(toggleBtn);
    const extraMenu = screen.getByRole('region', { name: 'その他の間・息づかいメニュー' });
    fireEvent.click(within(extraMenu).getByRole('button', { name: 'ハッと驚く' }));
    expect(onScriptChange).toHaveBeenLastCalledWith('こんにちは。【ハッと驚く】ありがとう。');
    expect(screen.getByRole('region', { name: 'その他の間・息づかいメニュー' })).toBeInTheDocument();
    fireEvent.click(toggleBtn);
    expect(screen.queryByRole('region', { name: 'その他の間・息づかいメニュー' })).not.toBeInTheDocument();
  });

  it('「もっと別の声を探す」画面で基本30声と追加音声を絞り込み選択でき、英語の二重表示が起きない', async () => {
    localStorage.setItem('turtle-video-gemini-api-key', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        voices: [
          { id: 'Aoede', display_name: 'Aoede', type: 'prebuilt', gender: 'female' },
          { id: 'voice_extra', display_name: '追加の日本語声', description: '24-year-old Teacher with a clear voice.', type: 'prompted', gender: 'female', language_code: 'ja-JP', persona: '教師', context: '教育' },
          { id: 'voice_teacher_ad', display_name: '広告用の教師声', description: '42-year-old Teacher with a warm voice.', type: 'prebuilt', gender: 'female', language_code: 'ja-JP', persona: '教師', context: '広告' },
          { id: 'voice_news', display_name: 'ニュース用声', description: '62-year-old News Anchor with a calm voice.', type: 'prebuilt', gender: 'female', language_code: 'ja-JP', persona: 'アナウンサー', context: 'ニュース' },
          { id: 'voice_english', display_name: 'English narrator', type: 'prebuilt', gender: 'male', language_code: 'en-US', persona: 'Narrator', context: 'Audiobook' },
          { id: 'voice_tutor_6', display_name: 'Tutor 6', description: '22-year-old Tutor from the East Coast. Speaks clearly with a friendly and encouraging tone for long educational conversations.', type: 'prebuilt', gender: 'male', language_code: 'en-US', persona: 'Educational Tutor', context: 'Conversational / Edu' },
          { id: 'voice_french', display_name: 'French narrator', type: 'prebuilt', gender: 'male', language_code: 'fr-FR', persona: 'Narrator', context: 'Audiobook' },
        ],
      }),
    }));

    const onVoiceChange = vi.fn();
    render(<AiModal {...buildBaseProps({ aiVoice: 'Leda', onVoiceChange })} />);

    // 通常画面から「もっと別の声を探す」を開く
    fireEvent.click(screen.getByRole('button', { name: /もっと別の声を探す/ }));

    // Leda の説明が二重英語表記になっていないこと
    expect(screen.getByText('若々しい（Youthful）')).toBeInTheDocument();
    expect(screen.queryByText(/Youthful.*Youthful/)).not.toBeInTheDocument();

    // 基本30声の性別＋雰囲気タグ絞り込み
    fireEvent.click(within(screen.getByRole('group', { name: '声の性別で絞り込み' })).getByRole('button', { name: '男性' }));
    expect(within(screen.getByRole('listbox', { name: '声の一覧リスト' })).getByRole('button', { name: /Puck/ })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: '基本の声の雰囲気タグ' })).getByRole('button', { name: '明るい・元気' }));
    expect(within(screen.getByRole('listbox', { name: '声の一覧リスト' })).getByRole('button', { name: /Puck/ })).toBeInTheDocument();
    expect(within(screen.getByRole('listbox', { name: '声の一覧リスト' })).queryByRole('button', { name: /Charon/ })).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: '基本の声の雰囲気タグ' })).getByRole('button', { name: 'すべて' }));
    fireEvent.click(within(screen.getByRole('group', { name: '声の性別で絞り込み' })).getByRole('button', { name: '全て' }));

    // 追加音声へ切替 → 自動読み込み → 用途タグ＆詳細絞り込み → 清潔な日本語カード表示を確認 → タップで選択＆自動でメイン画面へ戻る
    fireEvent.click(screen.getByRole('button', { name: '追加音声' }));
    const voiceSelect = screen.getByRole('combobox', { name: '声の選択' });
    await waitFor(() => expect(within(voiceSelect).getByRole('option', { name: /追加の日本語声/ })).toBeInTheDocument());
    expect(within(voiceSelect).queryByRole('option', { name: /English narrator|French narrator/ })).not.toBeInTheDocument();

    // カード表面に「原文:」ノイズが出ずスッキリ表示されていること
    const extraList = screen.getByRole('listbox', { name: '声の一覧リスト' });
    expect(within(extraList).queryByText(/原文:/)).not.toBeInTheDocument();

    // 用途タグで「ニュース・案内」へ絞り込み → 「すべて」へ戻す
    fireEvent.click(within(screen.getByRole('group', { name: '追加音声の用途タグ' })).getByRole('button', { name: 'ニュース・案内' }));
    expect(within(voiceSelect).getByRole('option', { name: /ニュース用声/ })).toBeInTheDocument();
    expect(within(voiceSelect).queryByRole('option', { name: /追加の日本語声/ })).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: '追加音声の用途タグ' })).getByRole('button', { name: 'すべて' }));

    // 年代タグで「〜20代」と「60代〜」を絞り込み → 「すべて」へ戻す
    const ageGroup = screen.getByRole('group', { name: '追加音声の年代タグ' });
    fireEvent.click(within(ageGroup).getByRole('button', { name: '〜20代' }));
    expect(within(voiceSelect).getByRole('option', { name: /追加の日本語声/ })).toBeInTheDocument();
    expect(within(voiceSelect).queryByRole('option', { name: /ニュース用声/ })).not.toBeInTheDocument();
    fireEvent.click(within(ageGroup).getByRole('button', { name: '60代〜' }));
    expect(within(voiceSelect).getByRole('option', { name: /ニュース用声/ })).toBeInTheDocument();
    expect(within(voiceSelect).queryByRole('option', { name: /追加の日本語声/ })).not.toBeInTheDocument();
    fireEvent.click(within(ageGroup).getByRole('button', { name: 'すべて' }));

    // 「細かい職業・分類で絞る」を開いて詳細絞り込みも使える
    fireEvent.click(screen.getByRole('button', { name: /細かい職業・分類で絞る/ }));
    fireEvent.change(screen.getByRole('combobox', { name: '職業・人物像' }), { target: { value: '教師' } });
    expect(within(voiceSelect).queryByRole('option', { name: /ニュース用声/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'シーン・用途' }), { target: { value: '教育' } });
    expect(within(voiceSelect).queryByRole('option', { name: /広告用の教師声/ })).not.toBeInTheDocument();

    // タップ選択で onVoiceChange が呼ばれ、自動でメイン画面へ戻り、よく使う声に記録される
    fireEvent.click(within(screen.getByRole('listbox', { name: '声の一覧リスト' })).getByRole('button', { name: /追加の日本語声/ }));
    expect(onVoiceChange).toHaveBeenCalledWith('voice_extra');
    expect(screen.getByRole('button', { name: /もっと別の声を探す/ })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'よく使う声' })).getByRole('button', { name: /追加の日本語声/ })).toBeInTheDocument();
  });

  it('よく使う声の履歴が使用回数順で通常画面に自動表示される', () => {
    localStorage.setItem(AI_VOICE_USAGE_STORAGE_KEY, JSON.stringify({
      Sulafat: { id: 'Sulafat', count: 5, lastUsedAt: 200, label: 'Sulafat', gender: 'female', shortLabel: 'あたたかい' },
      Zephyr: { id: 'Zephyr', count: 2, lastUsedAt: 100, label: 'Zephyr', gender: 'female', shortLabel: '明るい' },
    }));

    const onVoiceChange = vi.fn();
    render(<AiModal {...buildBaseProps({ aiVoice: 'Zephyr', onVoiceChange })} />);

    const frequentGroup = screen.getByRole('group', { name: 'よく使う声' });
    const buttons = within(frequentGroup).getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('Sulafat');
    expect(buttons[1]).toHaveTextContent('Zephyr');

    fireEvent.click(buttons[0]);
    expect(onVoiceChange).toHaveBeenCalledWith('Sulafat');
  });
});
