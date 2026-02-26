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
        title: '表示時間・位置・サイズ',
        description: 'トリミング、表示時間、拡大率、位置X/Yをスライダーで調整できます。',
        visuals: ['trim_chip', 'duration_chip', 'scale_chip', 'position_chip', 'slider_demo'],
      },
      {
        title: '黒帯除去',
        description: '素材の縦横比差で上下に出る微小な隙間を、102.5%拡大で目立ちにくくする設定です。',
        visuals: ['blackbar_toggle_chip'],
      },
      {
        title: '音量・フェード設定',
        description: 'スピーカーでミュート切替、くるくるで初期値に戻せます。フェードはチェックON時のみ有効です。',
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
        title: '開始位置・遅延',
        description: 'BGM内の開始位置と、動画タイムライン上の遅延位置を設定できます。',
        visuals: ['start_chip', 'delay_chip', 'slider_demo'],
      },
      {
        title: '音量調整',
        description: '音量を調整し、スピーカーアイコンでミュートON/OFF切替、くるくるアイコンでデフォルト値に戻せます。',
        visuals: ['volume_chip', 'mute_button', 'reset_button', 'slider_demo'],
      },
      {
        title: 'フェード設定',
        description: 'チェックを入れるとフェードイン/フェードアウトが有効になり、秒数を調整できます。',
        visuals: ['fade_in_checkbox', 'fade_out_checkbox', 'slider_demo'],
      },
    ],
  },
  narration: {
    title: 'ナレーションの使い方',
    subtitle: 'AIボタンと追加ボタンを使って、ナレーションを重ねて管理します。',
    items: [
      {
        title: 'AI / 追加ボタン',
        description: 'AI生成で作成するか、音声ファイルを追加するかを選べます。',
        visuals: ['ai_add_button', 'add_green_button'],
      },
      {
        title: 'セクションの鍵アイコン',
        description: 'ナレーションの追加・削除・調整をロックできます。',
        visuals: ['unlock_button', 'lock_button_red'],
      },
      {
        title: '並び替え・編集・削除・保存',
        description: '各ナレーションを上下移動、編集、削除、保存できます。',
        visuals: ['move_up_button', 'move_down_button', 'edit_button', 'delete_button', 'save_button'],
      },
      {
        title: '開始位置',
        description: '開始位置は数値入力・スライダーのほか、現在位置ボタンでも設定できます。',
        visuals: ['start_chip', 'current_pin_chip', 'slider_demo'],
      },
      {
        title: '切り出し設定（折りたたみ）',
        description: '切り出し開始/終了は「切り出し設定」を開いたときだけ表示されます。通常は閉じたまま使えます。',
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
    subtitle: '追加、表示ON/OFF、個別設定、フェード設定をまとめて管理できます。',
    items: [
      {
        title: '追加ボタン',
        description: '入力したテキストをキャプションとして追加できます。',
        visuals: ['add_yellow_button'],
      },
      {
        title: '表示アイコン / 鍵アイコン',
        description: '目アイコンで表示ON/OFF、鍵アイコンで編集ロックを切り替えます。',
        visuals: ['eye_on_button', 'eye_off_button', 'unlock_button', 'lock_button_red'],
      },
      {
        title: '各キャプションの操作',
        description: '上下移動、設定、編集、削除を各行のボタンで行います。',
        visuals: ['move_up_button', 'move_down_button', 'settings_button', 'edit_button', 'delete_button'],
      },
      {
        title: '表示時間',
        description: '開始時間・終了時間はスライダーや数値で調整し、現在位置ボタンでも設定できます。',
        visuals: ['start_chip', 'duration_chip', 'current_pin_chip', 'slider_demo'],
      },
      {
        title: '位置・サイズ調整',
        description: 'スタイル一括設定でサイズ、字体、位置、ぼかしをまとめて調整できます。',
        visuals: ['style_chip', 'size_chip', 'position_chip', 'blur_chip'],
      },
      {
        title: 'フェード設定',
        description: 'フェードはチェックONで有効になり、秒数を調整できます。',
        visuals: ['fade_in_checkbox', 'fade_out_checkbox', 'slider_demo'],
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
        title: '一括クリア',
        description: '一括クリアで素材・音声・キャプションを初期状態に戻せます。',
        visuals: ['clear_button'],
      },
      {
        title: '動画ファイルを作成',
        description: '動画ファイルを作成できます。',
        visuals: ['export_button'],
      },
      {
        title: '作成後のダウンロード',
        description: '作成完了後はダウンロードできます。停止/再生を押すと作成ボタンに戻り、再作成も可能です。',
        visuals: ['download_button'],
      },
    ],
  },
};
