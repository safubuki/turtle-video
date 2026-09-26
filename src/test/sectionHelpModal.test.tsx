import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SectionHelpModal from '../components/modals/SectionHelpModal';

describe('SectionHelpModal', () => {
  it('キャプションヘルプの操作見本を現在のボタン表記に合わせる', () => {
    render(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="caption"
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getAllByText('キャプション 一括設定').length
    ).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('キャプション スタイル/フェード一括設定')).not.toBeInTheDocument();
    expect(screen.getByText('現在位置に先頭を合わせる')).toBeInTheDocument();
    expect(screen.getByText('対象の先頭を現在位置 0:12.3 に合わせます')).toBeInTheDocument();
    expect(screen.queryByText('現在位置（0:12.3）に先頭を合わせる')).not.toBeInTheDocument();
  });

  it('最新機能の操作見本を実画面のラベルで表示する', () => {
    const { rerender } = render(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="clips"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('横16:9／縦9:16')).toBeInTheDocument();
    expect(screen.getByText('画像を選択')).toBeInTheDocument();
    expect(screen.getByText('ディゾルブ 1秒')).toBeInTheDocument();
    expect(screen.getByText('90°回転')).toBeInTheDocument();

    rerender(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="bgm"
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByRole('table', { name: 'BGMの自動調整 ON・OFF の違い' })
    ).toBeInTheDocument();
    expect(screen.getByText('現在のBGM位置を反映:')).toBeInTheDocument();
    expect(screen.getByText('開始設定')).toBeInTheDocument();
    expect(screen.getByText('終了設定')).toBeInTheDocument();

    rerender(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="preview"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('無音区間：前へ')).toBeInTheDocument();
    expect(screen.getByText('無音区間：次へ')).toBeInTheDocument();
    expect(screen.getByText('現在のフレームをサムネイルに設定')).toBeInTheDocument();
    expect(screen.getByText('自動設定に戻す')).toBeInTheDocument();
    expect(
      screen.getByText('黄色い帯は、発話の切れ目となる無音区間です。').closest('li')
    ).not.toBeNull();
    expect(screen.getByText('判定の優先順').closest('dt')).not.toBeNull();
  });

  it('新設したUI部品（保存・文字揃え・時分割・シークバーなど）が正常に描画される', () => {
    const { rerender } = render(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="app"
        onClose={vi.fn()}
      />
    );

    // app
    expect(screen.getByText('保存・読み込み')).toBeInTheDocument();
    expect(screen.getByText('手動保存スロット（3枠）')).toBeInTheDocument();
    expect(screen.getByText('長押し加速:')).toBeInTheDocument();
    expect(screen.getByText('スワイプ保護ON')).toBeInTheDocument();

    // clips
    rerender(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="clips"
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getAllByText('続きを追加コピー（5.20s 〜 15.00s）').length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText('ここまで延長').length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText('ここまで短縮').length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('速度表示位置:')).toBeInTheDocument();
    expect(screen.getByText('一括音量設定 (100%)')).toBeInTheDocument();

    // bgm
    rerender(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="bgm"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('設定を末尾に固定')).toBeInTheDocument();

    // narration
    rerender(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="narration"
        onClose={vi.fn()}
      />
    );
    expect(screen.getAllByText('AIナレーションスタジオ').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('AI原稿を作成')).toBeInTheDocument();
    expect(screen.getByText('文中の部分アクセント・メリハリ（選択範囲のみ）')).toBeInTheDocument();
    expect(screen.getByText('強調して')).toBeInTheDocument();
    expect(screen.getByText('感情込めて')).toBeInTheDocument();
    expect(screen.getByText('選択のアクセントを外す')).toBeInTheDocument();
    expect(screen.getByText('Gemini 3.8 Flash TTS')).toBeInTheDocument();
    expect(screen.getByText('AIナレーションを作成して追加')).toBeInTheDocument();
    expect(screen.getByText('APIキー取得（Google AI Studio）')).toBeInTheDocument();
    expect(screen.getByText('重要:')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Google AI Studio/ }).length).toBeGreaterThanOrEqual(1);

    // caption
    rerender(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="caption"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('左揃え')).toBeInTheDocument();
    expect(screen.getByText('右揃え')).toBeInTheDocument();
    expect(screen.getByText('時分割キャプションの見本')).toBeInTheDocument();
    expect(screen.getByText('+ サブ行：今日も良い天気ですね')).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'タイミング打ちの2つのモード' })
    ).toBeInTheDocument();
    expect(screen.getByText('交互モード')).toBeInTheDocument();
    expect(screen.getByText('ここから開始')).toBeInTheDocument();

    // preview
    rerender(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="preview"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('0:12.34')).toBeInTheDocument();
    expect(screen.getByText('ディゾルブ区間')).toBeInTheDocument();
    expect(screen.getByText('完成動画（焼き込み）')).toBeInTheDocument();
    expect(screen.getByText('字幕 SRT / VTT')).toBeInTheDocument();
    expect(
      screen.getByText('動画ファイルを生成中... (48%)')
    ).toBeInTheDocument();
    expect(screen.getByText('中止')).toBeInTheDocument();
  });

  it('操作体験と一致する階層構造（セクションヘッダー・全体設定・カード設定）でアコーディオン開閉できる', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    render(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="clips"
        onClose={vi.fn()}
      />
    );

    // 実画面準拠の親アコーディオンヘッダーが表示されていること
    expect(screen.getByText('動画・画像カテゴリ')).toBeInTheDocument();
    expect(screen.getByText('全体設定')).toBeInTheDocument();
    expect(screen.getByText('動画・画像カードの設定')).toBeInTheDocument();

    // 操作バーのボタン
    const expandAllBtn = screen.getByText('すべて開く');
    const collapseAllBtn = screen.getByText('すべて閉じる');
    expect(expandAllBtn).toBeInTheDocument();
    expect(collapseAllBtn).toBeInTheDocument();

    // 開く表示（カッコ付き表記）
    const openLabels = screen.getAllByText(/（(クリックで|タップで)?開く）/);
    expect(openLabels.length).toBeGreaterThan(0);

    // 1. セクションヘッダーを開くと、追加ボタン・動画の形式・セクションの鍵アイコンがアコーディオン無しで直接表示される
    const sectionHeaderBtn = screen.getByRole('button', {
      name: /セクションヘッダー（形式・ロック・追加）/,
    });
    expect(sectionHeaderBtn).toHaveAttribute('aria-expanded', 'false');

    await user.click(sectionHeaderBtn);
    expect(sectionHeaderBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('追加ボタン')).toBeInTheDocument();
    expect(screen.getByText('動画の形式（横16:9／縦9:16）')).toBeInTheDocument();
    expect(screen.getByText('セクションの鍵アイコン')).toBeInTheDocument();

    // 2. 全体設定を開くと、タイトル・ロゴ・音声一括設定の3つがアコーディオン無しで直接表示される
    const overallSettingsBtn = screen.getByRole('button', {
      name: /全体設定（タイトル・ロゴ・音声一括）/,
    });
    expect(overallSettingsBtn).toHaveAttribute('aria-expanded', 'false');

    await user.click(overallSettingsBtn);
    expect(overallSettingsBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('タイトル（オープニングタイトル）')).toBeInTheDocument();
    expect(screen.getByText('ロゴ表示（ウォーターマーク / エンドロール）')).toBeInTheDocument();
    expect(screen.getByText('音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toBeInTheDocument();

    // 3. 動画・画像カードを開くと、基本操作と子アコーディオンが表示される
    const cardSettingsBtn = screen.getByRole('button', {
      name: /動画・画像カードの設定/,
    });
    expect(cardSettingsBtn).toHaveAttribute('aria-expanded', 'false');

    await user.click(cardSettingsBtn);
    expect(cardSettingsBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('並び替え・コピー・削除')).toBeInTheDocument();
    expect(screen.getByText('表示区間（動画：トリミング／画像：表示時間）')).toBeInTheDocument();

    // 子アコーディオン
    const subAccordionBtn = screen.getByRole('button', {
      name: /位置・サイズ・回転・ぼかし調整/,
    });
    expect(subAccordionBtn).toHaveAttribute('aria-expanded', 'false');

    await user.click(subAccordionBtn);
    expect(subAccordionBtn).toHaveAttribute('aria-expanded', 'true');

    // すべて開く
    await user.click(expandAllBtn);
    expect(sectionHeaderBtn).toHaveAttribute('aria-expanded', 'true');
    expect(overallSettingsBtn).toHaveAttribute('aria-expanded', 'true');
    expect(cardSettingsBtn).toHaveAttribute('aria-expanded', 'true');
    expect(subAccordionBtn).toHaveAttribute('aria-expanded', 'true');

    // すべて閉じる
    await user.click(collapseAllBtn);
    expect(sectionHeaderBtn).toHaveAttribute('aria-expanded', 'false');
    expect(overallSettingsBtn).toHaveAttribute('aria-expanded', 'false');
    expect(cardSettingsBtn).toHaveAttribute('aria-expanded', 'false');
    expect(subAccordionBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('実画面 SaveLoadModal に忠実な手動保存スロットと自動保存設定が描画される', () => {
    render(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="app"
        onClose={vi.fn()}
      />
    );

    // 実画面の自動保存設定
    expect(screen.getByText('自動保存間隔')).toBeInTheDocument();
    expect(screen.getByText('1分')).toBeInTheDocument();
    expect(screen.getByText('2分')).toBeInTheDocument();
    expect(screen.getByText('5分')).toBeInTheDocument();
    expect(screen.getByText('定期保存中（2分ごと）')).toBeInTheDocument();

    // 実画面の手動保存スロット（3枠）
    expect(screen.getByText('手動保存スロット（3枠）')).toBeInTheDocument();
    expect(screen.getByText('プロジェクトA')).toBeInTheDocument();
    expect(screen.getAllByText('未保存').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('保存').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('読み込み').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('削除').length).toBeGreaterThanOrEqual(2);
  });

  it('閉じた状態（isOpen=false）から開いた状態（isOpen=true）への遷移および全セクションの全展開でHooksエラー等なく正常に開く', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    const sections = ['app', 'clips', 'bgm', 'narration', 'caption', 'preview'] as const;
    const flavors = ['standard', 'apple-safari'] as const;

    for (const flavor of flavors) {
      // 初期状態: isOpen=false
      const { rerender } = render(
        <SectionHelpModal
          appFlavor={flavor}
          supportsShowSaveFilePicker={false}
          isOpen={false}
          section={null}
          onClose={vi.fn()}
        />
      );

      for (const section of sections) {
        // isOpen=false -> isOpen=true に遷移（Hooksルール違反があればここで例外が発生する）
        rerender(
          <SectionHelpModal
            appFlavor={flavor}
            supportsShowSaveFilePicker={false}
            isOpen={true}
            section={section}
            onClose={vi.fn()}
          />
        );

        // すべて開くをクリックして全UI要素を描画
        const expandBtn = screen.getByText('すべて開く');
        await user.click(expandBtn);

        // 閉じる
        rerender(
          <SectionHelpModal
            appFlavor={flavor}
            supportsShowSaveFilePicker={false}
            isOpen={false}
            section={null}
            onClose={vi.fn()}
          />
        );
      }
    }
  });

  it('initialCategory が指定された場合はそのカテゴリが初期状態で展開される', () => {
    render(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="narration"
        initialCategory="AIナレーションスタジオ（AI原稿・声・話し方）"
        onClose={vi.fn()}
      />
    );

    // AIナレーションスタジオのカテゴリが初期状態で展開されているため、直接子要素のテキストが表示されている
    expect(screen.getByText('APIキー取得（Google AI Studio）')).toBeInTheDocument();
    expect(screen.getByText('AI原稿を作成')).toBeInTheDocument();
  });

  it('APIキー未設定時は「重要:」黄色警告が description 直下に表示され、歯車アイコンもインライン表示される', () => {
    // APIキー未設定状態
    localStorage.removeItem('turtle-video-gemini-api-key');

    const { container } = render(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="narration"
        initialCategory="AIナレーションスタジオ（AI原稿・声・話し方）"
        onClose={vi.fn()}
      />
    );

    // 「重要:」が表示されている
    const importantLabel = screen.getByText('重要:');
    expect(importantLabel).toBeInTheDocument();

    // 説明文と重要ノートの順序関係を検証（description の直下に重要ノートがある）
    const descText = 'Gemini APIキーを設定し、テーマ入力から原稿作成・音声合成までを行う機能です。';
    const descElement = screen.getByText(descText);
    expect(descElement).toBeInTheDocument();

    // 重要ノートのコンテナが description 要素の直後の兄弟要素として配置されている
    const noteContainer = importantLabel.closest('div');
    expect(noteContainer).toBeInTheDocument();
    expect(descElement.nextElementSibling).toBe(noteContainer);

    // インラインの歯車アイコンが表示されている
    const gearTokens = screen.getAllByText('歯車アイコン');
    expect(gearTokens.length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector('svg.lucide-settings')).toBeInTheDocument();
  });

  it('APIキー設定済みのときは「重要:」黄色警告が表示されない（他の説明は表示される）', () => {
    // APIキー登録済み状態
    localStorage.setItem('turtle-video-gemini-api-key', 'test-api-key-12345');

    render(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="narration"
        initialCategory="AIナレーションスタジオ（AI原稿・声・話し方）"
        onClose={vi.fn()}
      />
    );

    // 「重要:」は非表示
    expect(screen.queryByText('重要:')).not.toBeInTheDocument();

    // 他の機能説明（description や bullets など）は表示されている
    expect(
      screen.getByText('Gemini APIキーを設定し、テーマ入力から原稿作成・音声合成までを行う機能です。')
    ).toBeInTheDocument();

    // クリーンアップ
    localStorage.removeItem('turtle-video-gemini-api-key');
  });

  it('キャプションヘルプで実画面仕様のタイミング打ちUI見本が描画され、タイトル項目が含まれない', () => {
    render(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="caption"
        initialCategory="セクションヘッダー（表示・ロック・追加・一括入力）"
        onClose={vi.fn()}
      />
    );

    // キャプションヘルプから「タイトル（キャプションとは別管理）」が削除されている
    expect(screen.queryByText('タイトル（キャプションとは別管理）')).not.toBeInTheDocument();

    // 実画面仕様のタイミング打ち操作パネルが描画されている
    expect(screen.getByText('1/2（再生位置: 0:00）')).toBeInTheDocument();
    expect(screen.getByText(/「今日はいい天気」の/)).toBeInTheDocument();
    expect(screen.getByText('始まり')).toBeInTheDocument();
    expect(screen.getByText('ここから開始')).toBeInTheDocument();
    expect(screen.getByText('交互')).toBeInTheDocument();
    expect(screen.getByText('連続')).toBeInTheDocument();
    expect(screen.getByText('読みやすい位置へ自動調整')).toBeInTheDocument();
  });
});



