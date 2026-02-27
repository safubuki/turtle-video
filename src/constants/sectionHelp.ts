/**
 * @file sectionHelp.ts
 * @author Turtle Village
 * @description セクションヘルプの表示内容を一元管理する定義。
 */

export type SectionHelpKey = 'clips' | 'bgm' | 'narration' | 'caption' | 'preview';

export type SectionHelpVisualId =
  | 'add_green_button'
  | 'add_yellow_button'
  | 'ai_add_button'
  | 'unlock_button'
  | 'lock_button_red'
  | 'eye_on_button'
  | 'eye_off_button'
  | 'move_up_button'
  | 'move_down_button'
  | 'delete_button'
  | 'edit_button'
  | 'settings_button'
  | 'save_button'
  | 'item_unlock_chip'
  | 'item_lock_chip'
  | 'trim_chip'
  | 'duration_chip'
  | 'start_chip'
  | 'delay_chip'
  | 'volume_chip'
  | 'mute_button'
  | 'reset_button'
  | 'scale_chip'
  | 'position_chip'
  | 'blackbar_toggle_chip'
  | 'size_chip'
  | 'blur_chip'
  | 'fade_in_chip'
  | 'fade_out_chip'
  | 'fade_in_checkbox'
  | 'fade_out_checkbox'
  | 'style_chip'
  | 'current_pin_chip'
  | 'stop_button'
  | 'play_button'
  | 'capture_button'
  | 'clear_button'
  | 'export_button'
  | 'download_button'
  | 'slider_demo';

export interface SectionHelpItem {
  title: string;
  description: string;
  visuals?: SectionHelpVisualId[];
}

export interface SectionHelpDefinition {
  title: string;
  subtitle: string;
  items: SectionHelpItem[];
}

export const SECTION_HELP_CONTENT: Record<SectionHelpKey, SectionHelpDefinition> = {
  clips: {
    title: '動画・画像の使い方',
    subtitle: '素材の追加、並び替え、表示調整をこのセクションで行います。',
    items: [
      {
        title: '追加ボタン',
        description: '動画・画像ファイルを複数選択して一括追加できます。',
        visuals: ['add_green_button'],
      },
      {
        title: 'セクションの鍵アイコン',
        description: 'セクション全体をロックして誤操作を防止できます。',
        visuals: ['unlock_button', 'lock_button_red'],
      },
      {
        title: '並び替え・削除',
        description: '各クリップは上下移動と削除ができます。',
        visuals: ['move_up_button', 'move_down_button', 'delete_button'],
      },
      {
        title: '個別パネルの鍵',
        description: '各クリップだけを個別にロックできます。',
        visuals: ['item_unlock_chip', 'item_lock_chip'],
      },
      {
        title: '表示区間（動画：トリミング／画像：表示時間）',
        description:
          '動画は開始・終了位置を指定してトリミングできます。画像は表示時間を常時調整できます。どちらもスライダーで操作できます。',
        visuals: ['trim_chip', 'duration_chip', 'slider_demo'],
      },
      {
        title: '位置・サイズ調整',
        description:
          'この項目は折りたたみ表示です。開くと黒帯除去、拡大縮小、位置X/Yの調整ができます。黒帯除去は微細な上下の隙間を目立ちにくくする設定です。拡大縮小・位置の調整はスライダーで行え、くるくるアイコンでデフォルト値に戻せます。',
        visuals: ['blackbar_toggle_chip', 'scale_chip', 'position_chip', 'reset_button', 'slider_demo'],
      },
      {
        title: '音量・フェード設定',
        description:
          'この項目は折りたたみ表示です。開くとスピーカーでミュート切替、くるくるアイコンでデフォルト値に戻せます。動画・画像のフェードはチェックON時のみ有効で、秒数は0.5秒・1秒・2秒の3つから設定できます。',
        visuals: ['volume_chip', 'mute_button', 'reset_button', 'fade_in_checkbox', 'fade_out_checkbox', 'slider_demo'],
      },
    ],
  },
  bgm: {
    title: 'BGMの使い方',
    subtitle: 'BGMの追加、配置、音量、フェードを細かく調整できます。',
    items: [
      {
        title: '追加ボタン',
        description: 'BGMファイルを追加できます。',
        visuals: ['add_green_button'],
      },
      {
        title: 'セクションの鍵アイコン',
        description: 'BGM設定をロックして誤操作を防止できます。',
        visuals: ['unlock_button', 'lock_button_red'],
      },
      {
        title: 'パネル内の削除',
        description: 'BGMを削除する場合は、パネル内のゴミ箱ボタンを使います。',
        visuals: ['delete_button'],
      },
      {
        title: '開始位置・開始タイミング（遅延）',
        description: 'BGM内の開始位置と、動画タイムライン上の開始タイミング（遅延）を設定できます。',
        visuals: ['start_chip', 'delay_chip', 'slider_demo'],
      },
      {
        title: '音量調整',
        description: '音量を調整し、スピーカーアイコンでミュートON/OFF切替、くるくるアイコンでデフォルト値に戻せます。',
        visuals: ['volume_chip', 'mute_button', 'reset_button', 'slider_demo'],
      },
      {
        title: 'フェード設定',
        description:
          'チェックを入れるとフェードイン/フェードアウトが有効になり、秒数は0.5秒・1秒・2秒の3つから設定できます。',
        visuals: ['fade_in_checkbox', 'fade_out_checkbox', 'slider_demo'],
      },
    ],
  },
  narration: {
    title: 'ナレーションの使い方',
    subtitle: 'AIボタンと追加ボタンを使って、複数のナレーションを重ねて管理します。',
    items: [
      {
        title: 'AI / 追加ボタン',
        description:
          'AIで好みのナレーションを生成できます。あらかじめ用意した音声ファイルを追加することもでき、複数のナレーションを重ねて設定できます。',
        visuals: ['ai_add_button', 'add_green_button'],
      },
      {
        title: 'セクションの鍵アイコン',
        description: 'ナレーションの追加・削除・調整をロックできます。',
        visuals: ['unlock_button', 'lock_button_red'],
      },
      {
        title: '並び替え・編集・削除・保存',
        description:
          '各ナレーションを上下移動、編集、削除できます。保存ボタンを使うと、AIで生成したナレーションをパソコンやスマホに保存できます。',
        visuals: ['move_up_button', 'move_down_button', 'edit_button', 'delete_button', 'save_button'],
      },
      {
        title: '開始位置',
        description: '開始位置は数値入力・スライダーのほか、現在位置ボタンでプレビューの現在位置に設定できます。',
        visuals: ['start_chip', 'current_pin_chip', 'slider_demo'],
      },
      {
        title: 'トリミング設定（折りたたみ）',
        description:
          'トリミング開始/終了は「トリミング設定」を開いたときだけ表示されます。長いナレーションを複数に分割して、タイミングを調整したり、声質を合わせたいときに便利です。',
        visuals: ['trim_chip', 'duration_chip', 'slider_demo'],
      },
      {
        title: '音量調整',
        description: '音量は常時表示です。スライダーで調整し、スピーカーアイコンでミュートON/OFF切替、くるくるアイコンでデフォルト値に戻せます。',
        visuals: ['volume_chip', 'mute_button', 'reset_button', 'slider_demo'],
      },
    ],
  },
  caption: {
    title: 'キャプションの使い方',
    subtitle: '追加、表示ON/OFF、一括設定、個別設定をまとめて管理できます。',
    items: [
      {
        title: '追加ボタン',
        description: '入力したテキストをキャプションとして追加できます。',
        visuals: ['add_yellow_button'],
      },
      {
        title: '表示アイコン（目のマークのアイコン）',
        description:
          '表示アイコンをOFFに設定すると、キャプションを設定していてもすべてOFF表示になり、出力した動画にも表示されません。鍵アイコンで編集ロックを切り替えます。',
        visuals: ['eye_on_button', 'eye_off_button', 'unlock_button', 'lock_button_red'],
      },
      {
        title: 'スタイル・フェードの一括設定',
        description:
          'ここで全キャプション共通の設定をまとめて行えます。サイズ、字体、位置、ぼかしなどのスタイルに加えて、フェード（0.5秒・1秒・2秒）も一括で設定できます。',
        visuals: ['style_chip', 'size_chip', 'position_chip', 'blur_chip', 'fade_in_checkbox', 'fade_out_checkbox', 'slider_demo'],
      },
      {
        title: '各キャプションの操作',
        description:
          '上下移動、削除、編集を各行のボタンで行えます。鉛筆の編集ボタンでキャプション内容を編集できます。',
        visuals: ['move_up_button', 'move_down_button', 'edit_button', 'delete_button'],
      },
      {
        title: '個別設定（歯車マーク）',
        description:
          '歯車マークを押すと、キャプションごとの個別設定を開けます。サイズ、字体、位置、フェードを個別に調整でき、一括設定を使っていても個別設定で上書きできます。',
        visuals: ['settings_button', 'slider_demo'],
      },
      {
        title: '表示時間',
        description: '開始時間・終了時間はスライダーや数値で調整し、現在位置ボタンでプレビューの現在位置に設定できます。',
        visuals: ['start_chip', 'duration_chip', 'current_pin_chip', 'slider_demo'],
      },
    ],
  },
  preview: {
    title: 'プレビューの使い方',
    subtitle: '再生確認、書き出し、ダウンロードをこのセクションで行います。',
    items: [
      {
        title: '停止・再生・キャプチャ',
        description: '停止と再生でプレビュー操作ができ、キャプチャは現在の表示内容を画像として保存できます。',
        visuals: ['stop_button', 'play_button', 'capture_button'],
      },
      {
        title: '動画ファイルを作成',
        description: '動画ファイルを作成できます。作成中にタブを切り替えたり画面を非アクティブにすると、動画を正しく作成できません。',
        visuals: ['export_button'],
      },
      {
        title: '作成後のダウンロード',
        description: '作成完了後はダウンロードできます。停止/再生を押すと「動画ファイルを作成」ボタンに戻り、再作成も可能です。',
        visuals: ['download_button'],
      },
      {
        title: '一括クリア',
        description: '一括クリアで動画作成状態をクリアしてすべて初期状態に戻せます。',
        visuals: ['clear_button'],
      },
    ],
  },
};
