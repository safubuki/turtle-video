/**
 * @file sectionHelp.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description セクションヘルプの表示内容を一元管理する定義。
 */

import type { AppFlavor } from '../app/resolveAppFlavor';
import { getAppFlavorSupportSummary, getDownloadHelpSentence } from '../app/appFlavorUi';

export type SectionHelpKey = 'app' | 'clips' | 'bgm' | 'narration' | 'caption' | 'preview';

export type SectionHelpVisualId =
  | 'app_step_clips'
  | 'app_step_bgm'
  | 'app_step_narration'
  | 'app_step_caption'
  | 'app_step_preview'
  | 'add_green_button'
  | 'add_yellow_button'
  | 'ai_add_button'
  | 'aspect_ratio_toggle'
  | 'watermark_controls'
  | 'watermark_tab_button'
  | 'endroll_tab_button'
  | 'logo_image_select'
  | 'logo_position_buttons'
  | 'transition_button'
  | 'range_pin_buttons'
  | 'bgm_trim_position_buttons'
  | 'rotate_button'
  | 'bgm_count_label'
  | 'bgm_auto_adjust_toggle'
  | 'narration_count_label'
  | 'narration_caption_button'
  | 'narration_waveform'
  | 'video_title_accordion'
  | 'timeline_waveform'
  | 'silence_nav_controls'
  | 'poster_accordion'
  | 'poster_actions'
  | 'copy_button'
  | 'caption_style_accordion'
  | 'caption_outline_color_accordion'
  | 'caption_outline_controls'
  | 'bulk_caption_button'
  | 'timing_caption_button'
  | 'shift_caption_controls'
  | 'caption_custom_controls'
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
  | 'slider_demo'
  | 'folder_button'
  | 'settings_header_button'
  | 'project_save_slots'
  | 'stepper_buttons'
  | 'continuation_copy_button'
  | 'image_range_buttons'
  | 'speed_badge_presets'
  | 'bgm_fit_end_button'
  | 'bulk_audio_controls'
  | 'caption_text_align_controls'
  | 'caption_sub_row_demo'
  | 'timing_mode_controls'
  | 'timeline_seek_bar'
  | 'export_mode_tabs'
  | 'export_progress_demo'
  | 'logo_scope_buttons'
  | 'endroll_bg_buttons'
  | 'endroll_bgm_fade_checkbox'
  | 'video_title_style_sample'
  | 'bulk_mute_checkbox'
  | 'bulk_volume_checkbox'
  | 'bulk_normalize_buttons'
  | 'ai_script_length_demo'
  | 'ai_tone_preset_demo'
  | 'ai_voice_setting_demo'
  | 'ai_generate_button_demo'
  | 'google_ai_studio_link';

export interface SectionHelpBullet {
  text: string;
  visuals?: SectionHelpVisualId[];
}

export interface SectionHelpItem {
  title: string;
  category?: string;
  isSubAccordion?: boolean;
  description: string;
  bullets?: Array<string | SectionHelpBullet>;
  facts?: {
    label: string;
    description: string;
  }[];
  comparison?: {
    caption: string;
    rows: {
      label: string;
      description: string;
    }[];
  };
  note?: string;
  visuals?: SectionHelpVisualId[];
  accordions?: {
    title: string;
    items: string[];
  }[];
}

export interface SectionHelpDefinition {
  title: string;
  subtitle: string;
  items: SectionHelpItem[];
}

export interface SectionHelpContext {
  appFlavor: AppFlavor;
  supportsShowSaveFilePicker: boolean;
}

export function getSectionHelpContent(
  context: SectionHelpContext
): Record<SectionHelpKey, SectionHelpDefinition> {
  const flavorSummary = getAppFlavorSupportSummary(context.appFlavor);
  const downloadHelpSentence = getDownloadHelpSentence(context);

  const content: Record<SectionHelpKey, SectionHelpDefinition> = {
  "app": {
    "title": "タートルビデオの使い方",
    "subtitle": "",
    "items": [
      {
        "title": "概要",
        "category": "はじめに",
        "description": "ブラウザ上で手軽に本格的な動画編集ができるWebアプリケーションです。",
        "bullets": [
          "スマホ・PC両対応: 画面幅に合わせて最適なレイアウトで操作できます。",
          "完全ローカル処理: AI機能以外の編集・プレビュー・書き出しはオフラインでも動作します。",
          "AIナレーション対応: 原稿作成や高品質な音声合成をスムーズに行えます。",
          "オープンソース: GPLv3ライセンスで公開されています。"
        ],
        "note": "旅行や出張の隙間時間から、自宅での本格的な編集までご活用ください🐢"
      },
      {
        "title": "主要な機能",
        "category": "はじめに",
        "description": "素材の追加から動画ファイルの完成まで、次の機能を利用できます。",
        "bullets": [
          "動画・画像: 追加、並び替え、トリミング、横16:9／縦9:16の切替",
          "演出: クリップ間トランジション、ウォーターマーク・エンドロール",
          "音声: 複数BGM、AI／音声ナレーション、波形トリミング、音声一括設定",
          "文字: 動画タイトル、キャプション、一括・個別スタイル設定、時分割",
          "仕上げ: 全体波形、無音区間移動、サムネイル、動画ファイル作成",
          "プロジェクト: 自動保存、手動保存3枠（名前・サムネイル付き）、読み込み"
        ],
        "note": "スマホで縦スクロール中にスライダーへ触れた場合は、誤操作と判断した変更を自動的に元へ戻します。数値の −/+ はタップのほか、押し続けると徐々に速く増減します。"
      },
      {
        "title": "使い方（5ステップ）",
        "category": "はじめに",
        "description": "初めてでも、次の5ステップでかんたんに動画を作成できます。",
        "visuals": [
          "app_step_clips",
          "app_step_bgm",
          "app_step_narration",
          "app_step_caption",
          "app_step_preview"
        ]
      },
      {
        "title": "プロジェクトの保存・読み込み",
        "category": "全体設定・保存",
        "description": "編集中のデータを端末内に保存し、いつでも前回の作業状態を復元できます。",
        "bullets": [
          {
            "text": "保存・読み込み画面: ヘッダーのフォルダアイコンから専用画面を開きます。",
            "visuals": [
              "folder_button"
            ]
          },
          {
            "text": "手動保存（3枠）と自動保存: 3枠（①〜③）に名前・サムネイル付きで個別保存でき、定期的な自動バックアップ（1分・2分・5分・オフ）も行われます。",
            "visuals": [
              "project_save_slots"
            ]
          },
          "復元: 一覧からプロジェクトを選ぶだけで、素材や配置を即座に読み込みます。"
        ],
        "visuals": []
      },
      {
        "title": "全体設定（APIキー・画質・オフライン）",
        "category": "全体設定・保存",
        "description": "AI連携や書き出し品質など、アプリ全体の動作環境を設定できます。",
        "bullets": [
          "Gemini APIキー: AIナレーション生成に必要なAPIキーを設定・変更できます。",
          "書き出し解像度: 自動、フルHD(1080p)、HD(720p)、SD(480p)から選択できます。",
          "オフラインモード: 通信量を抑えたい場合や機内などでは通信を遮断して利用できます。"
        ],
        "visuals": [
          "settings_header_button"
        ]
      },
      {
        "title": "操作の基本（長押し増減・スワイプ保護）",
        "category": "基本操作・情報",
        "description": "スライダーや数値入力を快適かつ安全に行うための操作補助機能です。",
        "bullets": [
          {
            "text": "長押し増減: ＋／−ボタンを長押しすると、数値が段階的に加速して素早く増減できます。",
            "visuals": [
              "stepper_buttons"
            ]
          },
          {
            "text": "スライダー操作: 微細な調整はスライダーを左右にドラッグして直感的に行えます。",
            "visuals": [
              "slider_demo"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "動作確認機種",
        "category": "基本操作・情報",
        "description": "以下の環境で基本動作を確認しています。",
        "facts": [
          {
            "label": "スマホ",
            "description": "Pixel 6a（Android・Chrome）"
          },
          {
            "label": "パソコン",
            "description": "Windows／Ryzen 5 5500／RTX 3060 12GB"
          }
        ],
        "note": `手持ちの機種による確認です。${flavorSummary}`
      },
      {
        "title": "注意事項",
        "category": "基本操作・情報",
        "description": "長い編集や複雑な編集は、動作が不安定になることがあります。手動、自動保存を活用してください。"
      },
      {
        "title": "ライセンス",
        "category": "基本操作・情報",
        "description": "タートルビデオは GNU GPLv3 で公開されています。",
        "bullets": [
          "個人利用や社内利用では、用途に合わせて自由に改変できます。",
          "改変版を外部へ配布する場合は、ソースコード公開や同ライセンス継承などの条件があります。",
          "正確な条件は README と LICENSE を確認してください。"
        ],
        "accordions": [
          {
            "title": "使用ライセンス一覧（本番依存 / 直接）",
            "items": [
              "@tailwindcss/postcss (^4.1.18): MIT",
              "lucide-react (^0.563.0): ISC",
              "mp4-muxer (^5.2.2): MIT",
              "react (^19.2.4): MIT",
              "react-dom (^19.2.4): MIT",
              "zustand (^5.0.10): MIT"
            ]
          },
          {
            "title": "使用ライセンス一覧（開発依存 / 直接）",
            "items": [
              "@testing-library/jest-dom (^6.9.1): MIT",
              "@testing-library/react (^16.3.2): MIT",
              "@testing-library/user-event (^14.6.1): MIT",
              "@types/react (^19.2.10): MIT",
              "@types/react-dom (^19.2.3): MIT",
              "@typescript-eslint/eslint-plugin (^8.54.0): MIT",
              "@typescript-eslint/parser (^8.54.0): MIT",
              "@vitejs/plugin-react (^5.1.2): MIT",
              "autoprefixer (^10.4.23): MIT",
              "eslint (^9.39.2): MIT",
              "eslint-config-prettier (^10.1.8): MIT",
              "jsdom (^27.4.0): MIT",
              "postcss (^8.5.6): MIT",
              "prettier (^3.8.1): MIT",
              "sharp (^0.34.5): Apache-2.0",
              "tailwindcss (^4.1.18): MIT",
              "typescript (^5.9.3): Apache-2.0",
              "vite (^7.3.1): MIT",
              "vite-plugin-pwa (^1.2.0): MIT",
              "vitest (^4.0.18): MIT"
            ]
          },
          {
            "title": "使用ライセンス一覧（間接依存を含む集計）",
            "items": [
              "調査範囲: node_modules のユニークパッケージ 537 件",
              "MIT: 463件",
              "Apache-2.0: 21件",
              "ISC: 21件",
              "BSD-2-Clause: 11件",
              "BSD-3-Clause: 6件",
              "BlueOak-1.0.0: 4件",
              "MIT-0: 2件",
              "MPL-2.0: 2件",
              "Apache-2.0 AND LGPL-3.0-or-later: 1件",
              "Python-2.0: 1件",
              "CC-BY-4.0: 1件",
              "(AFL-2.1 OR BSD-3-Clause): 1件",
              "CC0-1.0: 1件",
              "0BSD: 1件",
              "(MIT OR CC0-1.0): 1件"
            ]
          }
        ]
      }
    ]
  },
  "clips": {
    "title": "動画・画像の使い方",
    "subtitle": "素材の追加、並び替え、表示調整をこのセクションで行います。",
    "items": [
      {
        "title": "追加ボタン",
        "category": "セクションヘッダー（形式・ロック・追加）",
        "description": "動画・画像ファイルを複数選択して一括追加します。",
        "visuals": [
          "add_green_button"
        ]
      },
      {
        "title": "動画の形式（横16:9／縦9:16）",
        "category": "セクションヘッダー（形式・ロック・追加）",
        "description": "用途に合わせて動画の縦横比を切り替えます。形式はプロジェクトごとに保存されます。",
        "bullets": [
          "YouTube・PC動画向け: 横16:9",
          "ショート・Reels・TikTok向け: 縦9:16（横長素材の左右を自動トリミング）"
        ],
        "note": "縦画面ではキャプション・タイトルの文字サイズが横画面と同程度になり、下部位置もやや上に配置されます。",
        "visuals": [
          "aspect_ratio_toggle"
        ]
      },
      {
        "title": "セクションの鍵アイコン",
        "category": "セクションヘッダー（形式・ロック・追加）",
        "description": "セクション全体をロックして誤操作を防止します。",
        "visuals": [],
        "bullets": [
          {
            "text": "ロック解除（通常時）: 素材の追加や編集を自由に行えます。",
            "visuals": [
              "unlock_button"
            ]
          },
          {
            "text": "ロック中: 誤操作を防ぐため、セクション全体の編集を保護します。",
            "visuals": [
              "lock_button_red"
            ]
          }
        ]
      },
      {
        "title": "タイトル（オープニングタイトル）",
        "category": "全体設定（タイトル・ロゴ・音声一括）",
        "description": "動画冒頭に表示する主タイトル・サブタイトルの文字、スタイル、表示時間、フェードを設定します。",
        "bullets": [
          {
            "text": "文字入力と帯: 主タイトルとサブタイトルを入力可能（改行対応）。「タイトル背景の帯」で濃さや角丸を設定し、映像上の視認性を高められます。",
            "visuals": [
              "video_title_accordion"
            ]
          },
          {
            "text": "スタイル設定: サイズ（小/中/大/特大/カスタム）、字体、位置（上部/中央/下部/XY座標）、文字色、縁の幅・色、ぼかしを主・サブ個別に細かく装飾できます。",
            "visuals": [
              "video_title_style_sample"
            ]
          },
          {
            "text": "表示時間と位置反映: スライダーや数値で表示秒数を設定。「開始」「終了」ボタンでプレビューの現在位置を一発反映できます。",
            "visuals": [
              "duration_chip",
              "range_pin_buttons"
            ]
          },
          {
            "text": "フェード効果: フェードイン・フェードアウト（各0.1〜3秒）を設定し、タイトルを滑らかに出現・消失させられます。",
            "visuals": [
              "fade_in_checkbox",
              "fade_out_checkbox"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "ロゴ表示（ウォーターマーク / エンドロール）",
        "category": "全体設定（タイトル・ロゴ・音声一括）",
        "description": "透かしロゴや動画末尾のエンドロールを設定します（チャンネル認知向上や動画の演出などに活用でき、両方設定可能です）。",
        "bullets": [
          {
            "text": "タブ切り替えと画像設定: 上部タブで［ウォーターマーク］［エンドロール］を切り替え、どちらも［画像を選択］から画像を設定します。設定後は［表示中 / 非表示］で簡単に切り替えられます。",
            "visuals": [
              "watermark_tab_button",
              "endroll_tab_button",
              "logo_image_select"
            ]
          },
          {
            "text": "ウォーターマーク（本編または全編）: 再生中の映像にロゴを重ねて表示（動画の長さは不変）。表示する区間で［本編のみ］（エンドロールでは非表示）または［全編（エンドロール含む）］（エンディングまで重ねて表示）を選択できます。",
            "visuals": [
              "logo_scope_buttons",
              "range_pin_buttons"
            ]
          },
          {
            "text": "エンドロール（動画末尾にロゴ表示）: 動画末尾に単色背景でロゴを表示（0.5〜30秒延長）。区間中もキャプションを追加・表示できます。背景色は［黒］［白］［カスタム］から選べ、［エンドロール中に BGM を徐々に消す］を有効にするとBGMを自動で滑らかにフェードアウトできます。",
            "visuals": [
              "endroll_bg_buttons",
              "endroll_bgm_fade_checkbox"
            ]
          },
          {
            "text": "共通調整項目: 位置（四隅・中央）、倍率、透過度、回転、周辺ぼかし、マスク形状（四角・角丸・円形）、フェードイン/フェードアウトなど多彩な調整が可能です。",
            "visuals": [
              "logo_position_buttons",
              "reset_button",
              "fade_in_checkbox",
              "fade_out_checkbox"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "音声 一括設定（ミュート / 一括音量 / 音量揃え）",
        "category": "全体設定（タイトル・ロゴ・音声一括）",
        "description": "すべての動画・画像クリップの音量バランスやミュート状態を一括管理します。",
        "bullets": [
          {
            "text": "一括ミュート: すべての動画を一括で消音。動画がまだ無くても先に有効にでき、あとから追加した動画にもすぐ適用します。",
            "visuals": [
              "bulk_mute_checkbox"
            ]
          },
          {
            "text": "一括音量設定: すべての動画を同じ音量（%）に統一します。",
            "visuals": [
              "bulk_volume_checkbox"
            ]
          },
          {
            "text": "音量を揃える: 動画ごとの音の大小を自動で均一化（平均に揃える / 最大に揃えるから選択）。",
            "visuals": [
              "bulk_normalize_buttons"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "並び替え・コピー・削除",
        "category": "動画・画像カードの設定",
        "description": "クリップの再生順序の変更、複製、削除を行います。",
        "bullets": [
          {
            "text": "上下移動: クリップの再生順序を入れ替えます。",
            "visuals": [
              "move_up_button",
              "move_down_button"
            ]
          },
          {
            "text": "コピー: 同じ動画から別のシーンを切り出す際、直後に複製します（Android/PC版）。「続きを追加コピー」も利用できます。",
            "visuals": [
              "copy_button"
            ]
          },
          {
            "text": "削除: 不要なクリップをタイムラインから除外します。",
            "visuals": [
              "delete_button"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "個別パネルの鍵",
        "category": "動画・画像カードの設定",
        "description": "各クリップだけを個別にロックし、誤編集を防止します。",
        "visuals": [],
        "bullets": [
          {
            "text": "通常時: クリップの各種調整を行えます。",
            "visuals": [
              "item_unlock_chip"
            ]
          },
          {
            "text": "ロック時: このクリップの誤操作を個別に防ぎます。",
            "visuals": [
              "item_lock_chip"
            ]
          }
        ]
      },
      {
        "title": "トランジション（Android/PC版）",
        "category": "動画・画像カードの設定",
        "description": "クリップ間の切り替え効果（ディゾルブ・フェード）と時間（0.5〜2秒）を設定します。",
        "bullets": [
          "ディゾルブ: 前後のクリップを重ねて滑らかに繋ぎます（動画全体が少し短縮）。",
          "フェード: 黒または白を挟んでシーン転換します（全体の長さは変わりません）。"
        ],
        "visuals": [
          "transition_button"
        ]
      },
      {
        "title": "表示区間（動画：トリミング／画像：表示時間）",
        "category": "動画・画像カードの設定",
        "description": "素材の再生区間や表示秒数を設定します。",
        "bullets": [
          {
            "text": "動画（トリミング）: 開始点・終了点をスライダーや−/＋で設定。「開始」「終了」ボタンでプレビュー位置を一発反映。終了を右端まで動かすと素材の実尺へ合わせます。",
            "visuals": [
              "trim_chip"
            ]
          },
          {
            "text": "画像（表示時間）: 0.5〜60秒の表示時間を設定。「ここまで延長」「ここまで短縮」でプレビュー位置に末尾を合わせられます。スライダーは0.5秒単位、＋−ボタンは0.1秒単位で調整できます。",
            "visuals": [
              "duration_chip",
              "image_range_buttons"
            ]
          },
          {
            "text": "続きを追加コピー: トリミング終了点から素材末尾までを、直後のクリップとしてワンタップで複製できます（Android/PC版）。",
            "visuals": [
              "continuation_copy_button"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "クリップ一覧とサムネイル確認",
        "category": "動画・画像カードの設定",
        "description": "プレビュー再生との連動枠線や、サムネイルの拡大確認が行えます。",
        "bullets": [
          "再生連動: プレビューのシーク位置にあるクリップの枠線が強調表示されます。",
          "サムネイルタップ: 素材の拡大プレビューを表示し、内容を素早く確認できます。",
          "一括開閉: クリップが複数ある場合は「すべて開く」「すべて閉じる」で表示を整理できます。"
        ]
      },
      {
        "title": "位置・サイズ・回転・ぼかし調整",
        "category": "動画・画像カードの設定",
        "isSubAccordion": true,
        "description": "クリップごとに映像の拡大縮小、配置位置、回転、背景ぼかしを調整します。",
        "bullets": [
          {
            "text": "位置・サイズ: スライダーで拡大率や横・縦の配置を調整（中央が0、-100〜+100%）。",
            "visuals": [
              "scale_chip",
              "position_chip"
            ]
          },
          {
            "text": "黒帯除去: 102.5%に拡大して上下左右の黒帯をカットします。",
            "visuals": [
              "blackbar_toggle_chip"
            ]
          },
          {
            "text": "90°回転: タップするたびに 0°→90°→180°→270° と切り替わります。",
            "visuals": [
              "rotate_button"
            ]
          },
          {
            "text": "ぼかし: 0〜30pxで背景素材などを柔らかく見せます。",
            "visuals": [
              "blur_chip"
            ]
          },
          {
            "text": "リセット: くるくるアイコンで項目ごとに初期値へ戻せます。",
            "visuals": [
              "reset_button"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "音量・フェード設定",
        "category": "動画・画像カードの設定",
        "isSubAccordion": true,
        "description": "クリップごとの音量、ミュート、フェードイン／アウトを設定します。",
        "bullets": [
          {
            "text": "音量調整: 素材ごとの音量をスライダーで設定し、スピーカーでミュート切替ができます。",
            "visuals": [
              "volume_chip",
              "mute_button",
              "reset_button"
            ]
          },
          {
            "text": "フェードイン/アウト: チェックを入れて0.5秒・1秒・2秒から選択します。",
            "visuals": [
              "fade_in_checkbox",
              "fade_out_checkbox"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "再生速度（0.5〜8.0倍）",
        "category": "動画・画像カードの設定",
        "isSubAccordion": true,
        "description": "動画の再生速度を0.5〜8.0倍まで0.1倍刻みで調整します。",
        "bullets": [
          "速度設定: スライダーや−/＋ボタン、等倍・2倍などのショートカットで設定。タイムラインの表示尺も自動伸縮します。",
          "プレビュー/書き出しに速度を表示: 等倍でもチェックできます。",
          "速度バッジ: 位置の既定は四隅から9%内側です。速度バッジも映像と同じタイミングで表示/非表示になります。"
        ],
        "visuals": [
          "speed_badge_presets"
        ]
      }
    ]
  },
  "bgm": {
    "title": "BGMの使い方",
    "subtitle": "BGMの追加、配置、音量、フェードを細かく調整できます。",
    "items": [
      {
        "title": "追加ボタン",
        "category": "セクションヘッダー（追加・ロック）",
        "description": "BGMファイルを追加できます。",
        "visuals": [
          "add_green_button"
        ]
      },
      {
        "title": "複数のBGM（Android/PC版）",
        "category": "セクションヘッダー（追加・ロック）",
        "description": "複数の曲を追加し、シーンごとにBGMを切り替えられます。",
        "bullets": [
          {
            "text": "登録件数表示: タイトル右側の「(n件)」で登録数を確認できます。",
            "visuals": [
              "bgm_count_label"
            ]
          },
          {
            "text": "自動調整ON/OFF: 動画の長さに合わせてBGMの長さを自動伸縮します。",
            "visuals": [
              "bgm_auto_adjust_toggle"
            ]
          },
          {
            "text": "BGMの複製: 同じBGMを別の区間で使いたい場合に直後へコピーします。",
            "visuals": [
              "copy_button"
            ]
          },
          "動画終端より後から始まる曲は一時的に無効になり、動画尺が戻ると復元されます。",
          "「設定を末尾に固定」は、開始・終了の設定値そのものを書き換えるときに使います。",
          "フェードアウトは、実際に再生される有効終端を基準にかかります。"
        ],
        "comparison": {
          "caption": "BGMの自動調整 ON・OFF の違い",
          "rows": [
            {
              "label": "ON",
              "description": "設定値は残したまま、最後の曲の有効区間を動画末尾に合わせます。既定はこちらです。"
            },
            {
              "label": "OFF",
              "description": "設定した区間だけ再生します。動画が長くなってもBGMを延長しません。"
            }
          ]
        },
        "visuals": []
      },
      {
        "title": "セクションの鍵アイコン",
        "category": "セクションヘッダー（追加・ロック）",
        "description": "BGM設定をロックして誤操作を防止できます。",
        "visuals": [],
        "bullets": [
          {
            "text": "ロック解除（通常時）: BGMの追加や編集を自由に行えます。",
            "visuals": [
              "unlock_button"
            ]
          },
          {
            "text": "ロック中: 誤操作を防ぐため、BGMセクション全体の編集を保護します。",
            "visuals": [
              "lock_button_red"
            ]
          }
        ]
      },
      {
        "title": "音声 一括設定（ミュート / 一括音量 / 音量揃え）",
        "category": "音声 一括設定",
        "description": "登録しているすべてのBGMの音量バランスやミュート状態をまとめて管理します。",
        "bullets": [
          "BGMカテゴリ専用: 全曲の音量やミュートを一括管理（動画・ナレーションには影響しません）。",
          {
            "text": "一括ミュート: 全曲をまとめて消音。曲がまだ無くても先に有効にでき、あとから追加したBGMにもすぐ適用します。",
            "visuals": [
              "bulk_mute_checkbox"
            ]
          },
          {
            "text": "一括音量設定: 全曲の音量を同じ音量（%）に統一します。",
            "visuals": [
              "bulk_volume_checkbox"
            ]
          },
          {
            "text": "音量を揃える: 全曲の音量を揃えたり、曲ごとの大小を自動調整（平均/最大）できます。",
            "visuals": [
              "bulk_normalize_buttons"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "並び替え・コピー・削除",
        "category": "BGMカードの設定",
        "description": "登録した複数のBGMクリップは、上下移動で再生順序を入れ替えたり、複製・削除ができます。",
        "visuals": [],
        "bullets": [
          {
            "text": "上下移動: クリップの再生順序を入れ替えます。",
            "visuals": [
              "move_up_button",
              "move_down_button"
            ]
          },
          {
            "text": "コピー: 同じBGMを直後に複製します。",
            "visuals": [
              "copy_button"
            ]
          },
          {
            "text": "削除: 不要なBGMクリップをタイムラインから除外します。",
            "visuals": [
              "delete_button"
            ]
          }
        ]
      },
      {
        "title": "開始位置・開始タイミング（遅延）",
        "category": "BGMカードの設定",
        "description": "BGM内の開始位置と、動画タイムライン上の開始タイミング（遅延）を設定できます。",
        "bullets": [
          {
            "text": "開始位置: スライダーで音源内の開始秒数を設定し、リセットボタンで0秒に戻せます。",
            "visuals": [
              "start_chip"
            ]
          },
          {
            "text": "配置タイミング: タイムライン上で再生を開始したい位置へ遅延配置できます。",
            "visuals": [
              "delay_chip"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "設定を末尾に固定（Android/PC版）",
        "category": "BGMカードの設定",
        "description": "動画全体の長さに合わせて、選択したBGMの再生終了位置をピタリと固定します。",
        "bullets": [
          "末尾固定: 動画の最後までBGMを流し切りたいときにワンタップで設定値を合わせられます。",
          "自動調整OFF時: 手動で動画末尾に合わせたい場合にも役立ちます。"
        ],
        "visuals": [
          "bgm_fit_end_button"
        ]
      },
      {
        "title": "BGMのトリミング（Android/PC版）",
        "category": "BGMカードの設定",
        "description": "プレビューの再生位置を使って、BGMの再生開始・終了タイミングを直感的に設定できます。",
        "bullets": [
          "位置反映: 「開始設定」「終了設定」で、現在流れているBGMの音源位置をトリミング範囲へ即座に反映します。開始設定を押してもBGM配置開始は移動しません。",
          "微調整: スライダーや数値入力から0.1秒単位で前後のトリミング位置を調整できます。"
        ],
        "visuals": [
          "bgm_trim_position_buttons"
        ]
      },
      {
        "title": "音量調整",
        "category": "BGMカードの設定",
        "isSubAccordion": true,
        "description": "各BGMの音量をスライダーで個別に調整し、ミュート切替や初期値へのリセットを行えます。",
        "bullets": [
          {
            "text": "個別音量: スライダーで0〜250%まで調整できます。",
            "visuals": [
              "volume_chip"
            ]
          },
          {
            "text": "ミュート・リセット: スピーカーアイコンで消音切替、更新アイコンで100%に戻せます。",
            "visuals": [
              "mute_button",
              "reset_button"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "フェード設定",
        "category": "BGMカードの設定",
        "isSubAccordion": true,
        "description": "曲の始まりと終わりにフェードイン／アウト（0.5〜2秒）を設定し、自然な音の出入りを作ります。",
        "bullets": [
          {
            "text": "フェード時間: チェックを入れて0.5秒・1秒・2秒のプリセットから選択します。",
            "visuals": [
              "fade_in_checkbox",
              "fade_out_checkbox"
            ]
          },
          "有効区間連動: 実際に再生される有効終端を基準にフェードアウトがかかります。"
        ],
        "visuals": []
      }
    ]
  },
  "narration": {
    "title": "ナレーションの使い方",
    "subtitle": "AIボタンと追加ボタンを使って、複数のナレーションを重ねて管理します。",
    "items": [
      {
        "title": "AI / 追加ボタン",
        "category": "セクションヘッダー（AI・追加・ロック）",
        "description": "AIで高品質なナレーション音声を自動生成したり、用意した音声ファイルを追加できます。",
        "bullets": [
          {
            "text": "AI音声生成: Gemini TTS等で高品質なナレーションを自動生成します。",
            "visuals": [
              "ai_add_button"
            ]
          },
          {
            "text": "音声ファイル追加: 手元にある音声ファイルを追加できます。",
            "visuals": [
              "add_green_button"
            ]
          },
          "音声エンジンは Gemini 2.5 Flash TTS、Gemini 3.8 Flash TTS、Flash-Lite TTS から選べます。",
          "Gemini 3.8 では声の雰囲気・速さ・追加の話し方を設定できます。",
          "追加音声は日本語・英語、人物像、シーンで絞り込めます。"
        ],
        "visuals": []
      },
      {
        "title": "タイトルの登録件数",
        "category": "セクションヘッダー（AI・追加・ロック）",
        "description": "ナレーションを登録すると、タイトル右側の「(n件)」で現在の登録数を確認できます。",
        "visuals": [
          "narration_count_label"
        ]
      },
      {
        "title": "セクションの鍵アイコン",
        "category": "セクションヘッダー（AI・追加・ロック）",
        "description": "ナレーションの追加・削除・調整をロックできます。",
        "visuals": [],
        "bullets": [
          {
            "text": "ロック解除（通常時）: ナレーションの追加や編集を自由に行えます。",
            "visuals": [
              "unlock_button"
            ]
          },
          {
            "text": "ロック中: 誤操作を防ぐため、ナレーション全体の編集を保護します。",
            "visuals": [
              "lock_button_red"
            ]
          }
        ]
      },
      {
        "title": "AIナレーションの基本フロー（準備と手順）",
        "category": "AIナレーションスタジオ（AI原稿・声・話し方）",
        "description": "Gemini APIキーを設定し、テーマ入力から原稿作成・音声合成までを行う機能です。",
        "bullets": [
          {
            "text": "スタジオ起動: ナレーションヘッダーの［AI］ボタン（またはスタジオ内の［？］ボタン）からいつでも専用スタジオとヘルプを開けます。",
            "visuals": [
              "ai_add_button"
            ]
          },
          {
            "text": "APIキーの登録場所: トップ画面のタートルビデオ アプリ名の横の歯車アイコンからGemini APIキーを設定できます。",
            "visuals": [
              "settings_header_button",
              "google_ai_studio_link"
            ]
          },
          "4つのステップ: ①テーマ入力（任意） → ②原稿編集・部分アクセント → ③音声エンジンと声の選択 → ④音声合成。"
        ],
        "note": "重要: AI原稿作成や音声合成を利用するには Gemini APIキーが必須です。登録したAPIキーはお使いのブラウザ内（ローカル）にのみ安全に保存され、外部サーバーには送信されません。トップ画面のタートルビデオ アプリ名の横の歯車アイコンからAPIキーを登録してください（Google AI Studio で無料取得可能）。APIキーが未登録の場合、スタジオ内の生成ボタンは無効になります。",
        "visuals": []
      },
      {
        "title": "Step 1: テーマ入力とAI原稿作成（任意）",
        "category": "AIナレーションスタジオ（AI原稿・声・話し方）",
        "description": "作りたい動画のテーマを入力し、AIにナレーション原稿を自動生成させます。",
        "bullets": [
          "テーマ入力: 「京都旅行の動画」などテーマを入力（テーマを入力せずStep 2へ直接入力・貼付も可能）。",
          {
            "text": "文章の長さと作成: ［短め］［中くらい］［長め］を選び、［AI原稿を作成］で自動生成します。",
            "visuals": [
              "ai_script_length_demo"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "Step 2: 原稿編集と部分アクセント（語り口調）",
        "category": "AIナレーションスタジオ（AI原稿・声・話し方）",
        "description": "原稿の推敲・直接編集と、文中の特定フレーズへの部分アクセントを設定します。",
        "bullets": [
          "原稿の一括編集: 1つのテキスト欄で全文を直接確認・編集・推敲できます。",
          {
            "text": "部分アクセント（語り口調）: 文中の特定フレーズを選択し、プリセット（「強調して」「感情込めて」「ささやき」「早口で」「ゆっくり」）を押して抑揚を付与します。",
            "visuals": [
              "ai_tone_preset_demo"
            ]
          },
          "自由入力と解除: 「疑問を投げかけるように」「笑いながら」など自由入力して［適用］も可能。「選択のアクセントを外す」「すべて外す」でいつでもリセットできます。"
        ],
        "visuals": []
      },
      {
        "title": "Step 3: 音声エンジン・話し方・声の選択",
        "category": "AIナレーションスタジオ（AI原稿・声・話し方）",
        "description": "音声モデル（Gemini 3.8 / 2.5）と声質、全体のトーン、話すテンポ、演出指示を設定します。",
        "bullets": [
          {
            "text": "エンジンと声質: 高音質なGemini 3.8 Flash TTSや高速版から選べ、声の雰囲気・話す速さ・演出指示を微調整できます。",
            "visuals": [
              "ai_voice_setting_demo"
            ]
          },
          "多彩な声ライブラリ: 基本の30声（女性・男性）に加え、Gemini 3.8 では豊富な追加ライブラリ（人物像やシーン別）から選べます。"
        ],
        "visuals": []
      },
      {
        "title": "Step 4: 音声合成とタイムライン追加",
        "category": "AIナレーションスタジオ（AI原稿・声・話し方）",
        "description": "設定した原稿と声をもとに音声を自動合成し、動画のナレーションクリップとして追加します。",
        "bullets": [
          {
            "text": "音声合成の実行: ［AIナレーションを作成して追加］ボタンを押すと、音声を生成してタイムラインに追加します。",
            "visuals": [
              "ai_generate_button_demo"
            ]
          },
          {
            "text": "音声ファイルのダウンロード保存: 作成したナレーションは、カードの［保存］ボタンから音声ファイルとしてダウンロード保存することもできます。",
            "visuals": [
              "save_button"
            ]
          },
          "追加後の個別調整: 追加されたクリップは、音量調整、トリミング、配置タイミング変更、波形確認、キャプション化などが自由に行えます。"
        ],
        "visuals": []
      },
      {
        "title": "音声 一括設定（ミュート / 一括音量 / 音量揃え）",
        "category": "音声 一括設定",
        "description": "すべてのナレーションの音量バランスやミュート状態をまとめて管理します。",
        "bullets": [
          "ナレーションカテゴリ専用: 全音声の音量やミュートを一括管理（動画・BGMには影響しません）。",
          {
            "text": "一括ミュート: 全クリップをまとめて消音。クリップがまだ無くても先に有効にでき、あとから追加したナレーションにもすぐ適用します。",
            "visuals": [
              "bulk_mute_checkbox"
            ]
          },
          {
            "text": "一括音量設定: 全ナレーションの音量を同じ音量（%）に統一します。",
            "visuals": [
              "bulk_volume_checkbox"
            ]
          },
          {
            "text": "音量を揃える: 全音声の音量を揃えたり、クリップごとの大小を自動調整（平均/最大）できます。",
            "visuals": [
              "bulk_normalize_buttons"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "並び替え・編集・削除・保存",
        "category": "ナレーションカードの設定",
        "description": "各ナレーションを上下移動、編集、削除できます。保存ボタンを使うと、AIで生成したナレーションをパソコンやスマホに保存できます。" + `${downloadHelpSentence}`,
        "visuals": [],
        "bullets": [
          {
            "text": "上下移動: クリップの再生順序を入れ替えます。",
            "visuals": [
              "move_up_button",
              "move_down_button"
            ]
          },
          {
            "text": "テキスト編集・保存: ナレーションの原稿を編集し、ファイルとして保存できます。",
            "visuals": [
              "edit_button",
              "save_button"
            ]
          },
          {
            "text": "削除: 不要なナレーションをタイムラインから除外します。",
            "visuals": [
              "delete_button"
            ]
          }
        ]
      },
      {
        "title": "コピー（Android/PC版）",
        "category": "ナレーションカードの設定",
        "description": "青いコピーボタンでナレーションを複製できます。複製はトリミング後の末尾に続けて配置されるので、長い音声を分割して好きなタイミングに配置するときに便利です。",
        "visuals": [
          "copy_button"
        ]
      },
      {
        "title": "開始・終了位置",
        "category": "ナレーションカードの設定",
        "description": "動画タイムライン上でナレーションを再生する開始・終了位置を設定します。",
        "bullets": [
          {
            "text": "開始位置: 数値入力やスライダーで動画上の再生開始点を調整できます。",
            "visuals": [
              "start_chip"
            ]
          },
          {
            "text": "位置反映: 「開始」「終了」ボタンで、プレビューの現在再生位置をナレーションの再生区間へ一発反映できます。",
            "visuals": [
              "range_pin_buttons"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "トリミング設定（区間切り出し）",
        "category": "ナレーションカードの設定",
        "description": "長い音声から必要な発話区間だけを切り出し、タイミングや声質を整えられます。",
        "bullets": [
          {
            "text": "分割・切り出し: 長い音声を複数クリップに分け、必要な発話区間だけを抜き出して配置できます。",
            "visuals": [
              "start_chip"
            ]
          },
          {
            "text": "位置反映・微調整: 開始・終了ボタンやスライダーで細かく調整できます。",
            "visuals": [
              "range_pin_buttons"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "音量波形と無音の区切り検出",
        "category": "ナレーションカードの設定",
        "isSubAccordion": true,
        "description": "音声波形と自動検出された文の区切りから、トリミング位置を視覚的に調整できます。",
        "bullets": [
          "緑の線: トリミング開始位置を示します。",
          "赤の線: トリミング終了位置を示します。",
          "黄色の線: 自動検出された文の区切りを示します。",
          "ワンタップ反映: 黄色の線を選び、「開始に」「終了に」でトリミング位置へ素早く反映できます。"
        ],
        "note": "音量波形と無音検出は Android・パソコン向けの機能です。",
        "visuals": [
          "narration_waveform"
        ]
      },
      {
        "title": "音量調整",
        "category": "ナレーションカードの設定",
        "isSubAccordion": true,
        "description": "各ナレーションの音量をスライダーで個別に調整し、ミュート切替や初期値へのリセットを行えます。",
        "bullets": [
          {
            "text": "個別音量: スライダーで0〜250%まで調整できます。",
            "visuals": [
              "volume_chip"
            ]
          },
          {
            "text": "ミュート・リセット: スピーカーアイコンで消音切替、更新アイコンで100%に戻せます。",
            "visuals": [
              "mute_button",
              "reset_button"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "AI原稿からキャプションカードを追加",
        "category": "ナレーションカードの設定",
        "isSubAccordion": true,
        "description": "AIナレーションの原稿から、編集可能な通常キャプションを作成します。",
        "facts": [
          {
            "label": "作成方法",
            "description": "句点・読点で読みやすい長さに分け、句読点は除いて画面に収まるキャプションへします。"
          },
          {
            "label": "短い無音",
            "description": "0.3秒未満ではキャプションを消さず、無音の中央で次のカードへ切り替えます。"
          },
          {
            "label": "長い無音",
            "description": "0.3秒以上では発話前後に約0.1秒ずつキャプションを残し、中央だけ非表示にします。"
          },
          {
            "label": "解析できない場合",
            "description": "文字数の比率で配置します。追加後は文字と開始・終了を個別編集できます。"
          }
        ],
        "visuals": [
          "narration_caption_button"
        ]
      }
    ]
  },
  "caption": {
    "title": "キャプションの使い方",
    "subtitle": "追加、表示ON/OFF、一括設定、個別設定をまとめて管理できます。",
    "items": [
      {
        "title": "追加ボタン",
        "category": "セクションヘッダー（表示・ロック・追加・一括入力）",
        "description": "入力したテキストを、プレビューの現在位置からキャプションとして追加できます。",
        "note": "エンドロール区間でも追加・表示できます。",
        "visuals": [
          "add_yellow_button"
        ]
      },
      {
        "title": "表示アイコン（目のマークのアイコン）",
        "category": "セクションヘッダー（表示・ロック・追加・一括入力）",
        "description": "キャプションの一括表示/非表示を切り替えます。OFFにすると書き出した動画にも表示されません。",
        "bullets": [
          {
            "text": "表示・非表示切替: 目のアイコンでプレビュー上のキャプション表示を一括でオン・オフできます。",
            "visuals": [
              "eye_on_button",
              "eye_off_button"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "セクションの鍵アイコン",
        "category": "セクションヘッダー（表示・ロック・追加・一括入力）",
        "description": "キャプション設定をロックして誤操作を防止できます。",
        "visuals": [
          "unlock_button",
          "lock_button_red"
        ]
      },
      {
        "title": "まとめて入力・編集（Android/PC版）",
        "category": "セクションヘッダー（表示・ロック・追加・一括入力）",
        "description": "歌詞や長いキャプションを、複数行まとめて追加・編集できます。",
        "bullets": [
          "通常は1行につき1枚のキャプションカードを作成します。",
          "「混在」では、+ で始めた行を直前カードの時分割行にできます。",
          "「＋ 時分割行を挿入」と、[開始-終了]形式の時間指定を利用できます。",
          "「時間指定だけ消す」では文章を残したまま時刻だけ削除します。"
        ],
        "note": "登録前は「① まとめて入力」、登録後は「① まとめて入力・編集」と表示されます。",
        "visuals": [
          "bulk_caption_button"
        ]
      },
      {
        "title": "時分割キャプション（Android/PC版）",
        "category": "セクションヘッダー（表示・ロック・追加・一括入力）",
        "description": "1枚のカードで複数人の会話や長文をまとめ、与えられた時間と文字数から自動で比例配分して1行ずつ順次表示する便利機能です。",
        "facts": [
          {
            "label": "一括設定の手間削減",
            "description": "1行ごとに個別のカードを作って時間を合わせる必要がなく、1枚のカードでまとめて効率的に管理できます。"
          },
          {
            "label": "文字数比例配分",
            "description": "カード全体の表示時間を、各行の文字量比で自動配分。均等割りではなく自然なテンポで切り替わります。"
          },
          {
            "label": "アルファベット係数",
            "description": "日本語（1文字=1.0）に対し英数字は係数（0.8）で配分。読了速度に合わせた自然なタイミングになります。"
          },
          {
            "label": "複数人のまとまり",
            "description": "会話の掛け合いや一連のセリフ・歌詞を、1つのまとまりとして直感的に編集・配置できます。"
          }
        ],
        "bullets": [
          "一括設定のメリット: 1行毎に開始・終了時間を設定しなくても、カード全体の時間を決めるだけで各行が自動配分されるため、編集の手間を大幅に削減できます。",
          "時間・文字数による自動比例配分: 与えられた総表示時間と各行の文字数から、読む長さに応じた表示区間を自動計算して順次切り替えます。",
          "アルファベット係数による自然な調整: 日本語（1文字=1.0）に対してアルファベットや数字は係数（0.8）で計算され、英単語混じりの文でも読みやすいリズムを保ちます。",
          "作成方法: 「まとめて入力」で「+」から始まる行を書くか、カード詳細から「＋時分割行を挿入」で簡単に作成できます。"
        ],
        "note": "カード全体の表示時間を伸縮すると、含まれるすべての時分割行の表示タイミングも自動で再配分されます。",
        "visuals": [
          "caption_sub_row_demo"
        ]
      },
      {
        "title": "② タイミング打ち（Android/PC版）",
        "category": "セクションヘッダー（表示・ロック・追加・一括入力）",
        "description": "動画を再生しながらボタンをリズムよく押すだけで、キャプションの表示開始・終了位置を直感的に確定できる機能です。",
        "comparison": {
          "caption": "タイミング打ちの2つのモード",
          "rows": [
            {
              "label": "交互モード",
              "description": "「▶ ここから開始」と「⏹ ここで終了」を交互に押し、1枚ずつの表示区間を確定します。"
            },
            {
              "label": "連続モード",
              "description": "ボタンを押した瞬間に現在の終了と次の開始が同時に確定し、流れるようにテンポよく打てます。"
            }
          ]
        },
        "bullets": [
          {
            "text": "タイミング打ち起動: ヘッダーの［② タイミング打ち］ボタンを押すと、専用のリアルタイム打鍵パネルが開きます。",
            "visuals": [
              "timing_caption_button"
            ]
          },
          {
            "text": "実画面仕様の操作パネル: ガイド表示を見ながら、再生に合わせて緑の［▶ ここから開始］ボタンを押すだけで直感的にタイミングが確定します。",
            "visuals": [
              "timing_mode_controls"
            ]
          },
          "無音区間ジャンプ＆自動調整: ［前へ］［次へ］で波形の無音切れ目へ素早く移動可能。「読みやすい位置へ自動調整」により発話前後の自然な余白も自動付与されます。",
          "微調整と打ち直し: ［-1s］［+1s］や中央の再生・一時停止ボタン、開始/終了の切替［⇆］ボタンで、その場ですぐに微調整や打ち直しができます。"
        ],
        "note": "スライダーで1つずつ秒数を入力する手間がなく、音楽や会話のリズムに合わせて直感的にキャプションを配置できるTurtle Video自慢の便利機能です。",
        "visuals": []
      },
      {
        "title": "キャプション一括削除（ゴミ箱アイコン）",
        "category": "セクションヘッダー（表示・ロック・追加・一括入力）",
        "description": "設定中のキャプションをすべて削除できます（誤操作を防ぐ確認ダイアログ付き）。",
        "note": "動画全体のタイトル設定は保持され、削除されません。",
        "visuals": [
          "delete_button"
        ]
      },
      {
        "title": "キャプション 一括設定",
        "category": "キャプション 一括設定",
        "description": "全キャプション共通のサイズ、字体、文字揃え（左・中・右）、位置、ぼかし、背景の帯、フェード時間をまとめて設定できます。",
        "bullets": [
          {
            "text": "文字サイズ: スライダーで全体の文字の大きさを調整します。",
            "visuals": [
              "size_chip"
            ]
          },
          {
            "text": "配置位置: 上下・左右の配置位置を一括調整します。",
            "visuals": [
              "position_chip"
            ]
          },
          {
            "text": "ぼかし: 文字の背景ぼかし強度を設定します。",
            "visuals": [
              "blur_chip"
            ]
          },
          {
            "text": "フェード時間: キャプションのフェードイン／アウトを設定します。",
            "visuals": [
              "fade_in_checkbox",
              "fade_out_checkbox"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "文字揃え（左・中央・右）",
        "category": "キャプション 一括設定",
        "description": "キャプションの行揃えを「左揃え」「中央揃え」「右揃え」からワンタップで切り替えられます。",
        "bullets": [
          {
            "text": "一括行揃え: すべてのキャプションの基本行揃えを「左揃え」「中央揃え」「右揃え」からワンタップで統一します。",
            "visuals": [
              "caption_text_align_controls"
            ]
          },
          "個別指定: 特定のカードだけ左揃えにしたい場合は、個別設定（歯車マーク）から行ごとに上書き指定も可能です。"
        ],
        "visuals": []
      },
      {
        "title": "文字の縁・色",
        "category": "キャプション 一括設定",
        "description": "一括スタイル内の「文字の縁・色」から、縁の幅・色と文字本体色を調整します。",
        "bullets": [
          {
            "text": "縁の幅と色: 文字の視認性を高めるため、縁取りの太さや色、文字色を細かく設定できます。",
            "visuals": [
              "caption_outline_controls"
            ]
          }
        ],
        "visuals": []
      },
      {
        "title": "フォント・カスタム値（Android/PC版）",
        "category": "キャプション 一括設定",
        "description": "字体は「その他▾」から端末に実在するシステムフォントを選べます。サイズと位置は「カスタム」で自由に指定できます。",
        "bullets": [
          "PCでは「＋ この端末の全フォントから選ぶ（PC）」も利用できます。",
          "位置は画面中央が 0 で、横は右が＋、縦は上が＋です（-100〜+100%）。動画・画像・ロゴと共通の指定方法です。",
          "「上部」「中央」「下部」を選んでから「カスタム」を押すと、その位置を引き継いで微調整できます。"
        ],
        "visuals": [
          "caption_custom_controls"
        ]
      },
      {
        "title": "各キャプションの操作",
        "category": "各キャプション行の設定",
        "description": "上下移動、削除、編集を各行のボタンで行えます。鉛筆の編集ボタンでキャプション内容を編集できます。",
        "visuals": [],
        "bullets": [
          {
            "text": "上下移動: キャプションの順序を入れ替えます。",
            "visuals": [
              "move_up_button",
              "move_down_button"
            ]
          },
          {
            "text": "テキスト編集: 文字内容をその場で直接編集できます。",
            "visuals": [
              "edit_button"
            ]
          },
          {
            "text": "削除: 不要なキャプション行を削除します。",
            "visuals": [
              "delete_button"
            ]
          }
        ]
      },
      {
        "title": "表示時間",
        "category": "各キャプション行の設定",
        "description": "開始時間・終了時間はスライダーや数値で調整し、現在位置ボタンでプレビューの現在位置に設定できます。",
        "bullets": [
          {
            "text": "開始・終了スライダー: 0.1秒単位で表示区間を設定できます。",
            "visuals": [
              "start_chip"
            ]
          },
          {
            "text": "プレビュー位置を反映: 「開始」「終了」ボタンで、プレビューの現在位置を一発反映できます。",
            "visuals": [
              "range_pin_buttons"
            ]
          },
          "実尺合わせ: 終了をスライダー右端や＋で動かすと、動画の末尾まで表示します。"
        ],
        "visuals": []
      },
      {
        "title": "時間をまとめてずらす（Android/PC版）",
        "category": "各キャプション行の設定",
        "description": "対象を選び、「現在位置に先頭を合わせる」で最初のキャプションをプレビュー位置へ移動します。終了位置の指定は不要です。動画・ナレーション・BGMは移動しません。",
        "bullets": [
          "間隔維持: 各カードの表示時間とカード間の間隔を保ったまま一括移動できます。",
          "微調整: 「早める」「遅らせる」ボタンで秒数を指定して微調整できます。"
        ],
        "visuals": [
          "shift_caption_controls"
        ]
      },
      {
        "title": "個別設定（歯車マーク）",
        "category": "各キャプション行の設定",
        "isSubAccordion": true,
        "description": "歯車マークから、サイズ、字体、文字揃え（左・中・右）、文字の縁幅・縁色・文字本体色、位置、ぼかし、背景の帯、フェードをカードごとに設定できます。未設定項目は一括設定を継承します。",
        "bullets": [
          {
            "text": "個別設定パネル: 歯車アイコンから、その行だけのスタイルを個別に調整できます。",
            "visuals": [
              "settings_button"
            ]
          },
          {
            "text": "個別の縁・色: 行ごとに異なる縁取りや色を設定できます。",
            "visuals": [
              "caption_outline_controls"
            ]
          },
          {
            "text": "個別のぼかし: 行ごとにぼかし強度を調整できます。",
            "visuals": [
              "blur_chip"
            ]
          }
        ],
        "visuals": []
      }
    ]
  },
  "preview": {
    "title": "プレビューの使い方",
    "subtitle": "再生確認、書き出し、ダウンロードをこのセクションで行います。",
    "items": [
      {
        "title": "停止・再生・キャプチャ",
        "category": "プレビュー・確認",
        "description": "停止と再生でプレビュー操作ができ、キャプチャは現在の表示内容を画像として保存できます。",
        "visuals": [],
        "bullets": [
          {
            "text": "停止: 動画を先頭（0:00）に戻して停止します。",
            "visuals": [
              "stop_button"
            ]
          },
          {
            "text": "再生/一時停止: プレビュー動画を再生または一時停止します。",
            "visuals": [
              "play_button"
            ]
          },
          {
            "text": "サムネイル撮影（キャプチャ）: 現在の再生フレームをプロジェクトのサムネイル画像として保存します。",
            "visuals": [
              "capture_button"
            ]
          }
        ]
      },
      {
        "title": "シークバーとタイムライン（1/100秒表示）",
        "category": "プレビュー・確認",
        "description": "シークバーをドラッグまたはタップして、動画の任意の位置へ素早く移動できます。",
        "bullets": [
          "現在の再生時刻と動画全体の長さを 1/100 秒単位（分:秒.ミリ秒）で正確に確認できます。",
          "クリップ間のトランジションが設定されている区間は、再生バー上に紫のグラデーション帯で表示されます。"
        ],
        "visuals": [
          "timeline_seek_bar"
        ]
      },
      {
        "title": "音量波形と無音区間",
        "category": "プレビュー・確認",
        "description": "シークバーの下に、プロジェクト全体の音量変化と無音区間を表示します。",
        "facts": [
          {
            "label": "波形に含む音声",
            "description": "ナレーション、動画音声、BGMを反映します。"
          },
          {
            "label": "移動方法",
            "description": "波形のタップ、または「無音区間：前へ／次へ」を使います。"
          },
          {
            "label": "判定の優先順",
            "description": "ナレーション → 動画音声 → BGM の順です。現在の基準は波形下に表示します。"
          },
          {
            "label": "更新タイミング",
            "description": "音声素材、トリミング、音量を変更すると波形を作り直します。"
          }
        ],
        "bullets": [
          {
            "text": "黄色い帯は、発話の切れ目となる無音区間です。",
            "visuals": [
              "timeline_waveform"
            ]
          },
          {
            "text": "無音区間ジャンプ: 前へ／次へボタンで、発話の切れ目へ素早くシークできます。移動先には動画の先頭と末尾も含まれます。",
            "visuals": [
              "silence_nav_controls"
            ]
          },
          "同じ移動ボタンは、キャプションの「タイミング打ち」にもあります。"
        ],
        "note": "移動しただけではキャプション時刻は変わりません。移動後にキャプション側の現在位置反映ボタンを押してください。iPhone・iPadでは波形を表示しません。",
        "visuals": []
      },
      {
        "title": "サムネイル（プロジェクト全体）",
        "category": "プレビュー・確認",
        "description": "完成動画のカバーアートとなる代表フレーム（サムネイル）を設定できます。",
        "bullets": [
          {
            "text": "サムネイル設定: 現在のフレームをサムネイルに設定したり、自動設定に戻せます。",
            "visuals": [
              "poster_actions"
            ]
          }
        ],
        "note": "横16:9／縦9:16を変更して画像比率が合わなくなった場合は、自動設定へ戻ります。",
        "visuals": []
      },
      {
        "title": "動画ファイルを作成",
        "category": "書き出し・管理",
        "description": "編集内容をレンダリングし、1本のMP4動画ファイルとしてエンコード・作成します。",
        "note": "作成中にブラウザの別タブへ移動したり画面を非アクティブにすると正しく作成できない場合があります。完了まで画面を表示したままにしてください。",
        "visuals": [
          "export_button"
        ]
      },
      {
        "title": "動画作成の進捗と中止",
        "category": "書き出し・管理",
        "description": "動画ファイル作成中は、進捗率と準備ステージがリアルタイムに表示されます。",
        "bullets": [
          "「準備中（初期化・音声解析・音声ミックス・エンコード）」から「レンダリング中」へと段階的に進みます。",
          "途中で中断したい場合は「中止」ボタンを押せば、いつでも安全に処理を停止できます。"
        ],
        "visuals": [
          "export_progress_demo"
        ]
      },
      {
        "title": "キャプションのみ出力（Android/PC版）",
        "category": "書き出し・管理",
        "description": "ベース映像を含めず、キャプションと動画タイトルだけを動画や字幕ファイルとして書き出せます。他の編集ソフトで合成する用途向けです。",
        "bullets": [
          {
            "text": "書き出しタブ切替: 上部のタブで［完成動画（焼き込み）］と［キャプションのみ］を切り替えます。",
            "visuals": [
              "export_mode_tabs"
            ]
          },
          "形式選択: 透過WebM（背景透過）、黒背景MP4（基本形式）、白文字キー用MP4（ルミナンス合成向け）、字幕ファイル（SRT/VTT）から選択可能です。",
          {
            "text": "書き出し実行: 設定完了後、「動画ファイルを作成」を押してエンコードを開始します。",
            "visuals": [
              "export_button"
            ]
          }
        ],
        "note": "キャプションが1件もない場合は選択できません。完成動画（焼き込み）の書き出しは従来どおり選べます。iPhone / iPad 版ではキャプションのみ出力は未対応です。",
        "visuals": []
      },
      {
        "title": "作成後のダウンロード",
        "category": "書き出し・管理",
        "description": "作成完了後はダウンロードできます。" + `${downloadHelpSentence}停止/再生を押すと「動画ファイルを作成」ボタンに戻り、再作成も可能です。`,
        "visuals": [
          "download_button"
        ]
      },
      {
        "title": "一括クリア",
        "category": "書き出し・管理",
        "description": "すべての素材と設定をクリアし、プロジェクトを初期状態に戻します。",
        "bullets": [
          "動画・画像・BGM・ナレーション・キャプション・ロゴを削除します。",
          "動画・画像・BGM・ナレーションの音声一括設定（ミュート / 一括音量 / 音量揃え）も初期値へ戻します。"
        ],
        "visuals": [
          "clear_button"
        ]
      }
    ]
  }
};

  if (context.appFlavor === 'apple-safari') {
    const hiddenTitles = new Set([
      '動画の形式（横16:9／縦9:16）',
      'ロゴ表示（ウォーターマーク / エンドロール）',
      '音声 一括設定（ミュート / 一括音量 / 音量揃え）',
      '再生速度（0.5〜8.0倍）',
      'トランジション（Android/PC版）',
      '複数のBGM（Android/PC版）',
      '設定を末尾に固定（Android/PC版）',
      'BGMのトリミング（Android/PC版）',
      'コピー（Android/PC版）',
      'AI原稿からキャプションカードを追加',
      '音量波形と無音の区切り検出',
      '全体設定',
      'キャプション一括削除（ゴミ箱アイコン）',
      '文字の縁・色',
      'まとめて入力・編集（Android/PC版）',
      '時分割キャプション（Android/PC版）',
      '② タイミング打ち（Android/PC版）',
      '時間をまとめてずらす（Android/PC版）',
      'フォント・カスタム値（Android/PC版）',
      '音量波形と無音区間',
      'サムネイル（プロジェクト全体）',
      'キャプションのみ出力（Android/PC版）',
    ]);

    Object.values(content).forEach((section) => {
      section.items = section.items.filter((item) => !hiddenTitles.has(item.title));
    });

    const mainFeatures = content.app.items.find((item) => item.title === '主要な機能');
    if (mainFeatures) {
      mainFeatures.bullets = [
        '動画・画像: 追加、並び替え、トリミング、位置・サイズ調整',
        '音声: BGM、AI／音声ナレーション',
        '文字: キャプション、一括・個別設定',
        '仕上げ: プレビュー、キャプチャ、動画ファイル作成',
        'プロジェクト: 自動保存、手動保存3枠（名前・サムネイル付き）、読み込み',
      ];
    }

    const clipOperations = content.clips.items.find((item) => item.title === '並び替え・コピー・削除');
    if (clipOperations) {
      clipOperations.title = '並び替え・削除';
      clipOperations.description = '各クリップは上下移動と削除ができます。';
      clipOperations.bullets = undefined;
    }

    const clipRange = content.clips.items.find((item) => item.title.startsWith('表示区間'));
    if (clipRange) {
      clipRange.bullets = [
        '動画・画像とも、スライダーから時間を調整できます。',
        '終了の数値はプレビューと同じ 1/100 秒です。右端や＋で末尾まで動かすと実尺へ合わせます。',
        '画像の表示時間は 0.5秒〜60秒で、0.1秒単位で調整できます。',
      ];
      clipRange.visuals = ['trim_chip', 'duration_chip', 'slider_demo'];
    }

    const clipTransform = content.clips.items.find((item) => item.title === '位置・サイズ・回転・ぼかし調整');
    if (clipTransform) {
      clipTransform.title = '位置・サイズ調整';
      clipTransform.facts = clipTransform.facts?.filter(
        (fact) => fact.label !== '回転' && fact.label !== 'ぼかし'
      );
      clipTransform.visuals = clipTransform.visuals?.filter(
        (visual) => visual !== 'rotate_button' && visual !== 'blur_chip'
      );
    }

    const captionStyle = content.caption.items.find(
      (item) => item.title === 'キャプション 一括設定'
    );
    if (captionStyle) {
      captionStyle.description =
        '全キャプション共通のサイズ、字体、文字揃え（左・中・右）、位置、ぼかし、フェード時間をまとめて設定できます。';
    }

    const individualCaption = content.caption.items.find((item) => item.title === '個別設定（歯車マーク）');
    if (individualCaption) {
      individualCaption.description =
        '歯車マークから、サイズ、位置、フェードをカードごとに設定できます。';
      individualCaption.bullets = [
        '変更した項目だけ、一括設定より優先されます。',
        '「この個別設定をクリア」では、本文と表示時間を残して一括設定へ戻します。',
      ];
    }
  }

  return content;
}

export const SECTION_HELP_CONTENT: Record<SectionHelpKey, SectionHelpDefinition> =
  getSectionHelpContent({
    appFlavor: 'standard',
    supportsShowSaveFilePicker: false,
  });
