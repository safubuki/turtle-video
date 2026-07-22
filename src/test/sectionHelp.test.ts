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
  return item.description;
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
    const styleDescription = getHelpDescription('caption', 'スタイル/フェード一括設定');
    const outlineDescription = getHelpDescription('caption', '文字の縁・色');
    const individualDescription = getHelpDescription('caption', '個別設定（歯車マーク）');

    expect(styleDescription).toContain('（開いて設定）');
    expect(outlineDescription).toContain('縁の幅');
    expect(outlineDescription).toContain('文字本体');
    expect(individualDescription).toContain('文字の縁幅・縁色・文字本体色');
    expect(individualDescription).toContain('ぼかし');
    expect(getHelpVisuals('caption', 'スタイル/フェード一括設定')).toContain(
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

  it('文章だけだった最近の機能にも操作部品の視覚見本を持たせる', () => {
    expect(getHelpVisuals('bgm', '複数のBGM（Android/PC版）')).toEqual(
      expect.arrayContaining(['bgm_count_label', 'copy_button'])
    );
    expect(getHelpVisuals('narration', 'タイトルの登録件数')).toContain('narration_count_label');
    expect(getHelpVisuals('caption', '② タイミング打ち（Android/PC版）')).toContain(
      'timing_caption_button'
    );
    expect(getHelpVisuals('caption', '時間をまとめてずらす（Android/PC版）')).toContain(
      'shift_caption_controls'
    );
    const shiftDescription = getHelpDescription('caption', '時間をまとめてずらす（Android/PC版）');
    expect(shiftDescription).toContain('現在位置（0:00.0）に先頭を合わせる');
    expect(shiftDescription).toContain('終了位置の指定は不要');
    expect(shiftDescription).toContain('動画・ナレーション・BGMは移動しません');
  });
});
