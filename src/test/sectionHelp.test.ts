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
  return [
    item.description,
    ...(item.bullets ?? []),
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
  return item.visuals ?? [];
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

    expect(styleDescription).toContain('（開いて設定）');
    expect(styleDescription).toContain('文字揃え（左・中・右）');
    expect(outlineDescription).toContain('縁の幅');
    expect(outlineDescription).toContain('文字本体');
    expect(individualDescription).toContain('文字の縁幅・縁色・文字本体色');
    expect(individualDescription).toContain('文字揃え（左・中・右）');
    expect(individualDescription).toContain('ぼかし');
    expect(getHelpVisuals('caption', 'キャプション 一括設定')).toContain(
      'caption_style_accordion'
    );
    expect(getHelpVisuals('caption', '文字の縁・色')).toEqual([
      'caption_outline_color_accordion',
      'caption_outline_controls',
    ]);
    expect(getHelpVisuals('caption', '個別設定（歯車マーク）')).toEqual(
      expect.arrayContaining([
        'caption_outline_color_accordion',
        'caption_outline_controls',
        'blur_chip',
      ])
    );
  });

  it('音声 一括設定のヘルプはミュートと揃え方を実画面どおりに案内する', () => {
    expect(getHelpDescription('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('ロゴ表示の下');
    expect(getHelpDescription('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('一括ミュート');
    expect(getHelpDescription('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('動画がまだ無くても先に有効にでき');
    expect(getHelpDescription('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('あとから追加した動画にもすぐ適用します');
    expect(getHelpDescription('bgm', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('曲がまだ無くても先に有効にでき');
    expect(getHelpDescription('narration', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('クリップがまだ無くても先に有効にでき');
    expect(getHelpDescription('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('最大に揃える');
    expect(getHelpDescription('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('残りはスクロールします');
    expect(getHelpDescription('clips', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).not.toContain('チェックを外せ');
    expect(getHelpDescription('bgm', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('BGMカテゴリ');
    expect(getHelpDescription('narration', '音声 一括設定（ミュート / 一括音量 / 音量揃え）')).toContain('ナレーションカテゴリ');
    expect(getHelpDescription('clips', '再生速度（0.5〜8.0倍）')).toContain('0.5');
    expect(getHelpDescription('clips', '再生速度（0.5〜8.0倍）')).toContain('等倍でもチェックできます');
    expect(getHelpDescription('clips', '再生速度（0.5〜8.0倍）')).toContain('四隅から9%内側');
  });

  it('文章だけだった最近の機能にも操作部品の視覚見本を持たせる', () => {
    expect(getHelpVisuals('clips', '動画の形式（横16:9／縦9:16）')).toContain(
      'aspect_ratio_toggle'
    );
    expect(getHelpVisuals('clips', 'ロゴ表示（ウォーターマーク / エンドロール）'))
      .toContain('watermark_controls');
    expect(getHelpVisuals('clips', 'トランジション（Android/PC版）')).toContain(
      'transition_button'
    );
    expect(getHelpVisuals('clips', '位置・サイズ・回転・ぼかし調整')).toContain('rotate_button');
    expect(getHelpVisuals('bgm', '複数のBGM（Android/PC版）')).toEqual(
      expect.arrayContaining(['bgm_count_label', 'bgm_auto_adjust_toggle', 'copy_button'])
    );
    expect(getHelpVisuals('narration', 'タイトルの登録件数')).toContain('narration_count_label');
    expect(getHelpVisuals('narration', '音量波形と無音の区切り検出')).toContain(
      'narration_waveform'
    );
    expect(getHelpVisuals('caption', 'タイトル（キャプションとは別管理）')).toContain(
      'video_title_accordion'
    );
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
      'poster_accordion',
      'poster_actions',
    ]);
  });
});
