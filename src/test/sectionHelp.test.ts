import { describe, expect, it } from 'vitest';
import { getSectionHelpContent } from '../constants/sectionHelp';

function getHelpDescription(
  section: keyof ReturnType<typeof getSectionHelpContent>,
  title: string,
  input: Parameters<typeof getSectionHelpContent>[0] = {
    appFlavor: 'standard',
    supportsShowSaveFilePicker: false,
  }
): string {
  const item = getSectionHelpContent(input)[section].items.find((entry) => entry.title === title);
  if (!item) {
    throw new Error(`Help item not found: ${section} / ${title}`);
  }
  const bulletTexts = (item.bullets ?? []).map((b) => (typeof b === 'string' ? b : b.text));
  return [
    item.description,
    ...bulletTexts,
    ...(item.facts ?? []).flatMap((fact) => [fact.label, fact.description]),
    ...(item.comparison?.rows ?? []).flatMap((row) => [row.label, row.description]),
    item.note ?? '',
  ].join('\n');
}

function getHelpVisuals(section: keyof ReturnType<typeof getSectionHelpContent>, title: string) {
  const item = getSectionHelpContent({
    appFlavor: 'standard',
    supportsShowSaveFilePicker: false,
  })[section].items.find((entry) => entry.title === title);
  if (!item) throw new Error(`Help item not found: ${section} / ${title}`);
  const bulletVisuals = (item.bullets ?? []).flatMap((b) =>
    typeof b === 'object' && b.visuals ? b.visuals : []
  );
  return [...(item.visuals ?? []), ...bulletVisuals];
}

describe('sectionHelp support messaging', () => {
  it('apple-safari のヘルプに非表示機能の操作案内を出さない', () => {
    const help = getSectionHelpContent({
      appFlavor: 'apple-safari',
      supportsShowSaveFilePicker: false,
    });
    const titles = Object.values(help).flatMap((section) =>
      section.items.map((item) => item.title),
    );

    expect(titles).not.toContain('ロゴ表示（ウォーターマーク / エンドロール）');
    expect(titles).not.toContain('AI原稿からキャプションカードを追加');
    expect(titles).not.toContain('タイトル（キャプションとは別管理）');
    expect(titles).not.toContain('サムネイル（プロジェクト全体）');
    expect(help.clips.items.find((item) => item.title === '位置・サイズ調整')?.facts)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ label: '回転' })]));
  });

  it('各項目の導入文を短く保ち、詳しい説明は構造化する', () => {
    const allHelp = getSectionHelpContent({
      appFlavor: 'standard',
      supportsShowSaveFilePicker: false,
    });
    const allItems = Object.values(allHelp).flatMap((section) => section.items);

    for (const item of allItems) {
      expect(item.description.length, item.title).toBeLessThanOrEqual(140);
    }

    const bgmHelp = allHelp.bgm.items.find(
      (item) => item.title === '複数のBGM（Android/PC版）'
    );
    const waveformHelp = allHelp.preview.items.find(
      (item) => item.title === '音量波形と無音区間'
    );

    expect(bgmHelp?.comparison?.rows).toHaveLength(2);
    expect(waveformHelp?.facts?.length).toBeGreaterThanOrEqual(4);
    expect(waveformHelp?.bullets?.length).toBeGreaterThanOrEqual(3);
    expect(waveformHelp?.note).toContain('キャプション時刻は変わりません');
  });

  it('主要な機能はスライダー誤操作防止と −/+ の長押し増減を案内する', () => {
    const description = getHelpDescription('app', '主要な機能');
    expect(description).toContain('スライダーへ触れた場合');
    expect(description).toContain('−/+');
    expect(description).toContain('押し続けると徐々に速く増減');
  });

  it('app help は iPhone Safari を非対応ではなく動作モードとして案内する', () => {
    const description = getHelpDescription('app', '動作確認機種');

    expect(description).toContain('動作モード');
    expect(description).not.toContain('非対応');
  });

  it('保存系ヘルプは保存ダイアログと標準ダウンロードの両方を案内する', () => {
    const pickerNarrationDescription = getHelpDescription(
      'narration',
      '並び替え・編集・削除・保存',
      {
        appFlavor: 'standard',
        supportsShowSaveFilePicker: true,
      }
    );
    const fallbackPreviewDescription = getHelpDescription('preview', '作成後のダウンロード', {
      appFlavor: 'standard',
      supportsShowSaveFilePicker: false,
    });

    expect(pickerNarrationDescription).toContain('保存先ダイアログ');
    expect(pickerNarrationDescription).toContain('標準ダウンロード');
    expect(fallbackPreviewDescription).toContain('標準ダウンロード');
  });

  it('standard のクリップヘルプは続きを追加コピーを案内し、apple-safari では出さない', () => {
    expect(getHelpDescription('clips', '並び替え・コピー・削除')).toContain('続きを追加コピー');
    expect(getHelpDescription('clips', '表示区間（動画：トリミング／画像：表示時間）')).toContain('続きを追加コピー');

    const iosHelp = getSectionHelpContent({
      appFlavor: 'apple-safari',
      supportsShowSaveFilePicker: false,
    });
    const iosOps = iosHelp.clips.items.find((item) => item.title === '並び替え・削除');
    expect(iosOps?.description).not.toContain('続きを追加コピー');
    expect(iosOps?.bullets).toBeUndefined();
    expect(getHelpDescription(
      'clips',
      '表示区間（動画：トリミング／画像：表示時間）',
      { appFlavor: 'apple-safari', supportsShowSaveFilePicker: false },
    )).not.toContain('続きを追加コピー');
  });

  it('apple-safari help は Safari 動作モード向けの案内を出す', () => {
    const appDescription = getHelpDescription('app', '動作確認機種', {
      appFlavor: 'apple-safari',
      supportsShowSaveFilePicker: false,
    });
    const previewDescription = getHelpDescription('preview', '作成後のダウンロード', {
      appFlavor: 'apple-safari',
      supportsShowSaveFilePicker: false,
    });

    expect(appDescription).toContain('安定動作優先の動作モード');
    expect(previewDescription).toContain('共有メニュー');
  });

  it('新しいキャプション設定は実画面と同じ表記と視覚見本で案内する', () => {
    const styleDescription = getHelpDescription(
      'caption',
      'キャプション 一括設定'
    );
    const outlineDescription = getHelpDescription('caption', '文字の縁・色');
    const individualDescription = getHelpDescription('caption', '個別設定（歯車マーク）');

    expect(styleDescription).toContain('全キャプション共通');
    expect(styleDescription).toContain('文字揃え（左・中・右）');
    expect(outlineDescription).toContain('縁の幅');
    expect(outlineDescription).toContain('文字本体');
    expect(individualDescription).toContain('文字の縁幅・縁色・文字本体色');
    expect(individualDescription).toContain('文字揃え（左・中・右）');
    expect(individualDescription).toContain('ぼかし');
    expect(getHelpVisuals('caption', 'キャプション 一括設定')).toContain(
      'size_chip'
    );
    expect(getHelpVisuals('caption', '文字の縁・色')).toEqual([
      'caption_outline_controls',
    ]);
    expect(getHelpVisuals('caption', '個別設定（歯車マーク）')).toEqual(
      expect.arrayContaining([
        'caption_outline_controls',
        'blur_chip',
      ])
    );
  });

  it('音声 一括設定のヘルプはミュートと揃え方を実画面どおりに案内する', () => {
    expect(getHelpDescription('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('すべての動画・画像クリップ');
    expect(getHelpDescription('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('一括ミュート');
    expect(getHelpDescription('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('動画がまだ無くても先に有効にでき');
    expect(getHelpDescription('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('あとから追加した動画にもすぐ適用します');
    expect(getHelpDescription('bgm', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('曲がまだ無くても先に有効にでき');
    expect(getHelpDescription('narration', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('クリップがまだ無くても先に有効にでき');
    expect(getHelpDescription('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('最大に揃える');
    expect(getHelpDescription('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).not.toContain('残りはスクロールします');
    expect(getHelpDescription('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).not.toContain('チェックを外せ');
    expect(getHelpDescription('bgm', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('BGMカテゴリ');
    expect(getHelpDescription('narration', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('ナレーションカテゴリ');
    expect(getHelpDescription('clips', '再生速度（0.5〜8.0倍）')).toContain('0.5');
    expect(getHelpDescription('clips', '再生速度（0.5〜8.0倍）')).toContain('等倍でもチェックできます');
    expect(getHelpDescription('clips', '再生速度（0.5〜8.0倍）')).toContain('四隅から9%内側');
    expect(getHelpDescription('clips', '再生速度（0.5〜8.0倍）')).toContain('速度バッジも映像と同じタイミング');
    expect(getHelpDescription('caption', '表示時間')).toContain('実尺');
    expect(getHelpDescription('clips', '表示区間（動画：トリミング／画像：表示時間）')).toContain(
      '0.1秒単位',
    );
    expect(getHelpDescription('clips', '表示区間（動画：トリミング／画像：表示時間）')).toContain(
      '実尺',
    );
    expect(getHelpDescription('clips', '表示区間（動画：トリミング／画像：表示時間）')).toContain(
      'ここまで延長',
    );
    expect(getHelpDescription(
      'clips',
      '表示区間（動画：トリミング／画像：表示時間）',
      { appFlavor: 'apple-safari', supportsShowSaveFilePicker: false },
    )).toContain('0.1秒単位');
  });

  it('一括クリアは音声一括設定の初期化を案内する', () => {
    const description = getHelpDescription('preview', '一括クリア');
    expect(description).toContain('音声一括設定');
    expect(description).toContain('ミュート');
    expect(description).toContain('一括音量');
    expect(description).toContain('音量揃え');
    expect(description).toContain('BGM');
    expect(description).toContain('ナレーション');
  });

  it('エンドロール区間でもキャプションを追加・表示できると案内する', () => {
    expect(getHelpDescription('clips', 'ロゴ表示（ウォーターマーク / エンドロール）'))
      .toContain('区間中もキャプションを追加・表示できます');
    expect(getHelpDescription('caption', '追加ボタン'))
      .toContain('エンドロール区間でも追加・表示できます');
  });

  it('文章だけだった最近の機能にも操作部品の視覚見本を持たせる', () => {
    expect(getHelpVisuals('clips', '動画の形式（横16:9／縦9:16）')).toContain(
      'aspect_ratio_toggle'
    );
    expect(getHelpVisuals('clips', 'ロゴ表示（ウォーターマーク / エンドロール）'))
      .toContain('watermark_tab_button');
    expect(getHelpVisuals('clips', 'トランジション（Android/PC版）')).toContain(
      'transition_button'
    );
    expect(getHelpVisuals('clips', '位置・サイズ・回転・ぼかし調整')).toContain('rotate_button');
    expect(getHelpVisuals('bgm', '複数のBGM（Android/PC版）')).toEqual(
      expect.arrayContaining(['bgm_count_label', 'bgm_auto_adjust_toggle', 'copy_button'])
    );
    expect(getHelpDescription('bgm', 'BGMのトリミング（Android/PC版）'))
      .toContain('現在流れているBGMの音源位置');
    expect(getHelpDescription('bgm', 'BGMのトリミング（Android/PC版）'))
      .toContain('BGM配置開始は移動しません');
    expect(getHelpVisuals('bgm', 'BGMのトリミング（Android/PC版）'))
      .toEqual(['bgm_trim_position_buttons']);
    expect(getHelpVisuals('narration', 'タイトルの登録件数')).toContain('narration_count_label');
    expect(getHelpVisuals('narration', '音量波形と無音の区切り検出')).toContain(
      'narration_waveform'
    );
    const captionTitles = getSectionHelpContent({
      appFlavor: 'standard',
      supportsShowSaveFilePicker: false,
    }).caption.items.map((item) => item.title);
    expect(captionTitles).not.toContain('タイトル（キャプションとは別管理）');
    expect(getHelpVisuals('caption', '② タイミング打ち（Android/PC版）')).toContain(
      'timing_caption_button'
    );
    expect(getHelpVisuals('caption', '時間をまとめてずらす（Android/PC版）')).toContain(
      'shift_caption_controls'
    );
    const shiftDescription = getHelpDescription('caption', '時間をまとめてずらす（Android/PC版）');
    expect(shiftDescription).toContain('現在位置に先頭を合わせる');
    expect(shiftDescription).toContain('終了位置の指定は不要');
    expect(shiftDescription).toContain('動画・ナレーション・BGMは移動しません');
    expect(getHelpVisuals('preview', '音量波形と無音区間')).toEqual([
      'timeline_waveform',
      'silence_nav_controls',
    ]);
    expect(getHelpVisuals('preview', 'サムネイル（プロジェクト全体）')).toEqual([
      'poster_actions',
    ]);
  });

  it('新設した機能説明と部品ビジュアルが正しく登録されている', () => {
    // app
    expect(getHelpVisuals('app', 'プロジェクトの保存・読み込み')).toEqual([
      'folder_button',
      'project_save_slots',
    ]);
    expect(getHelpVisuals('app', '全体設定（APIキー・画質・オフライン）')).toEqual([
      'settings_header_button',
    ]);
    expect(getHelpVisuals('app', '操作の基本（長押し増減・スワイプ保護）')).toEqual([
      'stepper_buttons',
      'slider_demo',
    ]);

    // clips
    expect(getHelpVisuals('clips', '表示区間（動画：トリミング／画像：表示時間）')).toContain(
      'continuation_copy_button'
    );
    expect(getHelpVisuals('clips', '表示区間（動画：トリミング／画像：表示時間）')).toContain(
      'image_range_buttons'
    );
    expect(getHelpVisuals('clips', 'タイトル（オープニングタイトル）')).toContain(
      'video_title_style_sample'
    );
    expect(getHelpVisuals('clips', 'ロゴ表示（ウォーターマーク / エンドロール）')).toContain(
      'logo_scope_buttons'
    );
    expect(getHelpVisuals('clips', 'ロゴ表示（ウォーターマーク / エンドロール）')).toContain(
      'endroll_bg_buttons'
    );
    expect(getHelpVisuals('clips', 'ロゴ表示（ウォーターマーク / エンドロール）')).toContain(
      'endroll_bgm_fade_checkbox'
    );
    expect(getHelpVisuals('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain(
      'bulk_mute_checkbox'
    );
    expect(getHelpVisuals('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain(
      'bulk_volume_checkbox'
    );
    expect(getHelpVisuals('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain(
      'bulk_normalize_buttons'
    );
    expect(getHelpVisuals('clips', '再生速度（0.5〜8.0倍）')).toContain(
      'speed_badge_presets'
    );

    // bgm
    expect(getHelpVisuals('bgm', '設定を末尾に固定（Android/PC版）')).toEqual([
      'bgm_fit_end_button',
    ]);
    expect(getHelpVisuals('bgm', '並び替え・コピー・削除')).toEqual([
      'move_up_button',
      'move_down_button',
      'copy_button',
      'delete_button',
    ]);
    expect(getHelpVisuals('bgm', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain(
      'bulk_mute_checkbox'
    );
    expect(getHelpVisuals('bgm', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain(
      'bulk_volume_checkbox'
    );
    expect(getHelpVisuals('bgm', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain(
      'bulk_normalize_buttons'
    );

    // narration
    expect(getHelpVisuals('narration', 'AIナレーションの基本フロー（準備と手順）')).toContain(
      'ai_add_button'
    );
    expect(getHelpVisuals('narration', 'AIナレーションの基本フロー（準備と手順）')).toContain(
      'google_ai_studio_link'
    );
    expect(getHelpVisuals('narration', 'Step 1: テーマ入力とAI原稿作成（任意）')).toContain(
      'ai_script_length_demo'
    );
    expect(getHelpVisuals('narration', 'Step 2: 原稿編集と部分アクセント（語り口調）')).toContain(
      'ai_tone_preset_demo'
    );
    expect(getHelpVisuals('narration', 'Step 3: 音声エンジン・話し方・声の選択')).toContain(
      'ai_voice_setting_demo'
    );
    expect(getHelpVisuals('narration', 'Step 4: 音声合成とタイムライン追加')).toContain(
      'ai_generate_button_demo'
    );
    expect(getHelpVisuals('narration', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain(
      'bulk_mute_checkbox'
    );
    expect(getHelpVisuals('narration', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain(
      'bulk_volume_checkbox'
    );
    expect(getHelpVisuals('narration', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain(
      'bulk_normalize_buttons'
    );

    // caption
    expect(getHelpVisuals('caption', '文字揃え（左・中央・右）')).toEqual([
      'caption_text_align_controls',
    ]);
    expect(getHelpVisuals('caption', '時分割キャプション（Android/PC版）')).toEqual([
      'caption_sub_row_demo',
    ]);
    expect(getHelpVisuals('caption', '② タイミング打ち（Android/PC版）')).toContain(
      'timing_mode_controls'
    );

    // preview
    expect(getHelpVisuals('preview', 'シークバーとタイムライン（1/100秒表示）')).toEqual([
      'timeline_seek_bar',
    ]);
    expect(getHelpVisuals('preview', '動画作成の進捗と中止')).toEqual([
      'export_progress_demo',
    ]);
    expect(getHelpVisuals('preview', 'キャプションのみ出力（Android/PC版）')).toContain(
      'export_mode_tabs'
    );
  });

  it('apple-safari では新設した Android/PC 限定機能が非表示になる', () => {
    const help = getSectionHelpContent({
      appFlavor: 'apple-safari',
      supportsShowSaveFilePicker: false,
    });
    const titles = Object.values(help).flatMap((section) =>
      section.items.map((item) => item.title),
    );

    expect(titles).not.toContain('続きを追加コピー（Android/PC版）');
    expect(titles).not.toContain('設定を末尾に固定（Android/PC版）');
    expect(titles).not.toContain('時分割キャプション（Android/PC版）');
  });

  it('ロゴ表示はウォーターマークとエンドロールの両方を同時に設定可能と案内する', () => {
    const description = getHelpDescription('clips', 'ロゴ表示（ウォーターマーク / エンドロール）');
    expect(description).toContain('両方設定可能');
    expect(description).toContain('ウォーターマーク');
    expect(description).toContain('エンドロール');
    expect(description).toContain('認知向上');
    expect(description).toContain('表示する区間');
    expect(description).toContain('背景色');
    expect(description).toContain('徐々に消す');
  });

  it('タイトル設定は文字スタイルと帯とフェードを案内する', () => {
    const description = getHelpDescription('clips', 'タイトル（オープニングタイトル）');
    expect(description).toContain('主タイトル');
    expect(description).toContain('サブタイトル');
    expect(description).toContain('スタイル設定');
    expect(description).toContain('フェード');
    expect(description).toContain('タイトル背景の帯');
  });

  it('ナレーションヘルプはAIナレーションスタジオの4ステップと語り口調を案内する', () => {
    const help = getSectionHelpContent({
      appFlavor: 'standard',
      supportsShowSaveFilePicker: false,
    });
    const studioItems = help.narration.items.filter((item) =>
      item.category?.includes('AIナレーションスタジオ')
    );
    expect(studioItems.length).toBeGreaterThanOrEqual(4);
    expect(getHelpDescription('narration', 'AIナレーションの基本フロー（準備と手順）')).toContain('Gemini API');
    expect(getHelpDescription('narration', 'Step 2: 原稿編集と部分アクセント（語り口調）')).toContain('部分アクセント');
    expect(getHelpDescription('narration', 'Step 2: 原稿編集と部分アクセント（語り口調）')).toContain('強調して');
    expect(getHelpDescription('narration', 'Step 3: 音声エンジン・話し方・声の選択')).toContain('Gemini 3.8');

    // ヘッダーボタン名は実画面に合わせて［AI］（［AI原稿］ではない）
    const flowItem = help.narration.items.find(
      (item) => item.title === 'AIナレーションの基本フロー（準備と手順）'
    );
    const flowText = flowItem?.bullets?.map((b) => (typeof b === 'string' ? b : b.text)).join(' ') ?? '';
    expect(flowText).toContain('［AI］ボタン');
    expect(flowText).not.toContain('［AI原稿］ボタン');

    // APIキー設定の必要性と Google AI Studio への案内が重要ノートに記載されている
    expect(flowItem?.note).toContain('重要:');
    expect(flowItem?.note).toContain('Gemini APIキー');
    expect(flowItem?.note).toContain('Google AI Studio');
    expect(flowItem?.note).toContain('トップ画面のタートルビデオ アプリ名の横の歯車アイコン');
    expect(flowText).toContain('トップ画面のタートルビデオ アプリ名の横の歯車アイコン');

    // 試聴リンク/説明は削除されている
    const step3Item = help.narration.items.find(
      (item) => item.title === 'Step 3: 音声エンジン・話し方・声の選択'
    );
    const step3Text = step3Item?.bullets?.map((b) => (typeof b === 'string' ? b : b.text)).join(' ') ?? '';
    expect(step3Text).not.toContain('試聴');

    // Step 4 にダウンロード保存の案内が含まれている
    const step4Item = help.narration.items.find(
      (item) => item.title === 'Step 4: 音声合成とタイムライン追加'
    );
    const step4Text = step4Item?.bullets?.map((b) => (typeof b === 'string' ? b : b.text)).join(' ') ?? '';
    expect(step4Text).toContain('ダウンロード保存');
    expect(getHelpVisuals('narration', 'Step 4: 音声合成とタイムライン追加')).toContain(
      'save_button'
    );
  });

  it('時分割キャプションの説明に文字数比例配分・アルファベット係数・一括設定メリットを含める', () => {
    const help = getSectionHelpContent({
      appFlavor: 'standard',
      supportsShowSaveFilePicker: false,
    });
    const item = help.caption.items.find((i) => i.title === '時分割キャプション（Android/PC版）');
    expect(item).toBeDefined();

    const fullText = [
      item?.description,
      ...(item?.facts ?? []).flatMap((f) => [f.label, f.description]),
      ...(item?.bullets ?? []).map((b) => (typeof b === 'string' ? b : b.text)),
      item?.note ?? '',
    ].join('\n');

    expect(fullText).toContain('文字数');
    expect(fullText).toContain('比例配分');
    expect(fullText).toContain('アルファベット');
    expect(fullText).toContain('0.8');
    expect(fullText).toContain('一括設定');
    expect(fullText).toContain('手間');
  });

  it('タイミング打ちの説明に実画面仕様の操作パネルと便利さの案内を含める', () => {
    const help = getSectionHelpContent({
      appFlavor: 'standard',
      supportsShowSaveFilePicker: false,
    });
    const item = help.caption.items.find((i) => i.title === '② タイミング打ち（Android/PC版）');
    expect(item).toBeDefined();

    const fullText = [
      item?.description,
      ...(item?.bullets ?? []).map((b) => (typeof b === 'string' ? b : b.text)),
      item?.note ?? '',
    ].join('\n');

    expect(fullText).toContain('ここから開始');
    expect(fullText).toContain('実画面仕様');
    expect(fullText).toContain('自動調整');
    expect(fullText).toContain('微調整');
  });
});
