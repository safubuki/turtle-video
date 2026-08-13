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
  | 'transition_button'
  | 'range_pin_buttons'
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
  | 'slider_demo';

export interface SectionHelpItem {
  title: string;
  description: string;
  bullets?: string[];
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
  const downloadHelpSentence = getDownloadHelpSentence(context);
  const appFlavorSupportSummary = getAppFlavorSupportSummary(context.appFlavor);

  const content: Record<SectionHelpKey, SectionHelpDefinition> = {
    app: {
      title: 'タートルビデオの使い方',
      subtitle: '',
      items: [
        {
          title: '概要',
          description: 'タートルビデオは、ブラウザで手軽に使える動画編集ソフトです。',
          bullets: [
            'スマホ・PCの画面幅に合わせて表示を最適化します。',
            'PWAとして利用でき、AI機能を使わない編集はオフラインでも行えます。',
            'AIナレーションを使って、原稿作成や音声合成を補助できます。',
            'GPLv3のオープンソースとして、用途に合わせた改変も可能です。',
          ],
          note: '旅行や出張の隙間時間から、自宅での本格的な編集までご活用ください🐢',
        },
        {
          title: '主要な機能',
          description: '素材の追加から動画ファイルの完成まで、次の機能を利用できます。',
          bullets: [
            '動画・画像: 追加、並び替え、トリミング、横16:9／縦9:16の切替',
            '演出: クリップ間トランジション、ウォーターマーク',
            '音声: 複数BGM、AI／音声ナレーション、波形トリミング',
            '文字: 動画タイトル、キャプション、一括・個別設定',
            '仕上げ: 全体波形、無音区間移動、サムネイル、動画ファイル作成',
            'プロジェクト: 自動保存、手動保存、読み込み',
          ],
          note: 'スマホで縦スクロール中にスライダーへ触れた場合は、誤操作と判断した変更を自動的に元へ戻します。',
        },
        {
          title: '使い方（5ステップ）',
          description: '初めてでも、次の5ステップでかんたんに動画を作成できます。',
          visuals: [
            'app_step_clips',
            'app_step_bgm',
            'app_step_narration',
            'app_step_caption',
            'app_step_preview',
          ],
        },
        {
          title: '動作確認機種',
          description: '以下の環境で基本動作を確認しています。',
          facts: [
            {
              label: 'スマホ',
              description: 'Pixel 6a（Android・Chrome）',
            },
            {
              label: 'パソコン',
              description: 'Windows／Ryzen 5 5500／RTX 3060 12GB',
            },
          ],
          note: `手持ちの機種による確認です。${appFlavorSupportSummary}`,
        },
        {
          title: '注意事項',
          description:
            '長い編集や複雑な編集は、動作が不安定になることがあります。手動、自動保存を活用してください。',
        },
        {
          title: 'ライセンス',
          description: 'タートルビデオは GNU GPLv3 で公開されています。',
          bullets: [
            '個人利用や社内利用では、用途に合わせて自由に改変できます。',
            '改変版を外部へ配布する場合は、ソースコード公開や同ライセンス継承などの条件があります。',
            '正確な条件は README と LICENSE を確認してください。',
          ],
          accordions: [
            {
              title: '使用ライセンス一覧（本番依存 / 直接）',
              items: [
                '@tailwindcss/postcss (^4.1.18): MIT',
                'lucide-react (^0.563.0): ISC',
                'mp4-muxer (^5.2.2): MIT',
                'react (^19.2.4): MIT',
                'react-dom (^19.2.4): MIT',
                'zustand (^5.0.10): MIT',
              ],
            },
            {
              title: '使用ライセンス一覧（開発依存 / 直接）',
              items: [
                '@testing-library/jest-dom (^6.9.1): MIT',
                '@testing-library/react (^16.3.2): MIT',
                '@testing-library/user-event (^14.6.1): MIT',
                '@types/react (^19.2.10): MIT',
                '@types/react-dom (^19.2.3): MIT',
                '@typescript-eslint/eslint-plugin (^8.54.0): MIT',
                '@typescript-eslint/parser (^8.54.0): MIT',
                '@vitejs/plugin-react (^5.1.2): MIT',
                'autoprefixer (^10.4.23): MIT',
                'eslint (^9.39.2): MIT',
                'eslint-config-prettier (^10.1.8): MIT',
                'jsdom (^27.4.0): MIT',
                'postcss (^8.5.6): MIT',
                'prettier (^3.8.1): MIT',
                'sharp (^0.34.5): Apache-2.0',
                'tailwindcss (^4.1.18): MIT',
                'typescript (^5.9.3): Apache-2.0',
                'vite (^7.3.1): MIT',
                'vite-plugin-pwa (^1.2.0): MIT',
                'vitest (^4.0.18): MIT',
              ],
            },
            {
              title: '使用ライセンス一覧（間接依存を含む集計）',
              items: [
                '調査範囲: node_modules のユニークパッケージ 537 件',
                'MIT: 463件',
                'Apache-2.0: 21件',
                'ISC: 21件',
                'BSD-2-Clause: 11件',
                'BSD-3-Clause: 6件',
                'BlueOak-1.0.0: 4件',
                'MIT-0: 2件',
                'MPL-2.0: 2件',
                'Apache-2.0 AND LGPL-3.0-or-later: 1件',
                'Python-2.0: 1件',
                'CC-BY-4.0: 1件',
                '(AFL-2.1 OR BSD-3-Clause): 1件',
                'CC0-1.0: 1件',
                '0BSD: 1件',
                '(MIT OR CC0-1.0): 1件',
              ],
            },
          ],
        },
      ],
    },
    clips: {
      title: '動画・画像の使い方',
      subtitle: '素材の追加、並び替え、表示調整をこのセクションで行います。',
      items: [
        {
          title: '動画の形式（横16:9／縦9:16）',
          description:
            'セクション右上の横画面・縦画面アイコンで、プレビューと書き出しの形式を切り替えます。横は16:9、縦は9:16です。縦画面では横長素材の左右を切り取って枠いっぱいに表示し、位置・サイズ調整で見せたい範囲を整えられます。形式はプロジェクトごとに保存されます。',
          note: '縦画面ではキャプション・タイトルの文字サイズが横画面と同程度になり、下部の既定位置もやや上に配置されます。',
          visuals: ['aspect_ratio_toggle'],
        },
        {
          title: 'ロゴ表示（ウォーターマーク / エンドロール）',
          description:
            '動画・画像一覧の先頭にある「ロゴ表示」（開いて設定）から操作します。上部のタブで「ウォーターマーク」（映像に重ねる）と「エンドロール」（動画の後に続ける）を切り替えます。位置・倍率・透過度・回転・マスク・フェードの操作は共通で、画像と設定はそれぞれ別に保存されます。',
          bullets: [
            'タブには設定状態が表示されます（未設定は「指定なし」、設定済みはロゴの縮小表示）。',
            '「画像を選択」で PNG・JPEG・WebP を追加します。',
            '表示する時間、位置、倍率、透過度、回転、マスク、周辺ぼかしを調整できます。',
            '【ウォーターマーク】「表示する区間」で「本編のみ」（既定）と「全編（エンドロール含む）」を選べます。全編にするとエンドロールにもロゴが重なり、終了時間をエンドロールの末尾まで指定できます。',
            '位置は「左下・右下・中央・左上・右上」から簡単に選べます。',
            '位置の数値は動画・画像・キャプションと共通で、画面中央が 0、横は右が＋、縦は上が＋です（-100〜+100%）。',
            'フェードイン／フェードアウトは動画と同じく 0.5・1・2 秒で設定でき、表示する時間の開始・終了に合わせてかかります。',
            '非表示にしても画像と設定は保持され、くるくるアイコンで各項目を初期値へ戻せます。',
            '【エンドロール】動画の再生が終わった後に、単色背景でロゴを表示します。設定した長さのぶん動画が長くなります（例: 12秒の動画に5秒のエンドロールで17秒）。',
            '【エンドロール】長さは 0.5〜30 秒、背景色は黒・白・カスタム（既定は黒）から選べます。',
            '【エンドロール】「エンドロール中に BGM を徐々に消す」をONにすると、エンドロールの長さをかけて BGM の音量が 0 まで下がります。BGM 未設定のときは選べません。',
            '【エンドロール】区間中はキャプションとウォーターマークは表示されません。',
          ],
          visuals: [
            'watermark_controls',
            'range_pin_buttons',
            'reset_button',
            'slider_demo',
            'fade_in_checkbox',
            'fade_out_checkbox',
          ],
        },
        {
          title: '一括ミュート（スピーカーアイコン）',
          description:
            'セクション右上のスピーカーで、登録中の動画をまとめてミュート／解除できます。',
          bullets: [
            '画像は音声がないため対象外です。',
            '一括ミュートがオンのとき、あとから追加した動画もミュートになります。',
            '個別ミュートと同じ設定なので、プレビューと書き出しの両方に効きます。',
          ],
          visuals: ['mute_button'],
        },
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
          title: '並び替え・コピー・削除',
          description:
            '各クリップは上下移動と削除ができます。青いコピーボタンで同じクリップを直後に複製でき、同じ動画から別のシーンを切り出すときに便利です（Android/PC版）。',
          visuals: ['move_up_button', 'move_down_button', 'delete_button'],
        },
        {
          title: 'トランジション（Android/PC版）',
          description:
            '「トランジション」から効果と時間（0.5〜2秒）を設定できます。再生中に開くと安全な反映のため一時停止します。ディゾルブはクリップを重ねるぶん動画全体が短くなり、フェードは長さを変えません。',
          visuals: ['transition_button'],
        },
        {
          title: '個別パネルの鍵',
          description: '各クリップだけを個別にロックできます。',
          visuals: ['item_unlock_chip', 'item_lock_chip'],
        },
        {
          title: '表示区間（動画：トリミング／画像：表示時間）',
          description: '動画はトリミング、画像は表示時間を設定します。',
          bullets: [
            '「開始」「終了」でプレビューの現在位置を動画のトリミング範囲へ反映できます。',
            '再トリミング時も、現在の有効区間を基準に計算します。',
            '動画・画像とも、スライダーからも時間を調整できます。',
          ],
          visuals: ['trim_chip', 'duration_chip', 'range_pin_buttons', 'slider_demo'],
        },

        {
          title: '位置・サイズ・回転・ぼかし調整',
          description: '折りたたみを開くと、カードごとの見た目を調整できます。',
          facts: [
            {
              label: '位置・サイズ',
              description:
                '拡大縮小と 横／縦 の位置をスライダーで調整します。位置は画面中央が 0 で、横は右が＋、縦は上が＋です（-100〜+100%）。ロゴ・キャプションと共通の指定方法です。',
            },
            {
              label: '回転',
              description: '「90°回転」を押すたびに 0°→90°→180°→270° と切り替わります。',
            },
            {
              label: 'ぼかし',
              description: '0〜30px。背景素材などを柔らかく見せたいときに使います。',
            },
            {
              label: '元に戻す',
              description: 'くるくるアイコンで項目ごとに初期値へ戻せます。',
            },
          ],
          visuals: [
            'blackbar_toggle_chip',
            'scale_chip',
            'position_chip',
            'blur_chip',
            'rotate_button',
            'reset_button',
            'slider_demo',
          ],
        },
        {
          title: '音量・フェード設定',
          description:
            'この項目は折りたたみ表示です。開くとスピーカーでミュート切替、くるくるアイコンでデフォルト値に戻せます。動画・画像のフェードはチェックON時のみ有効で、秒数は0.5秒・1秒・2秒の3つから設定できます。',
          visuals: [
            'volume_chip',
            'mute_button',
            'reset_button',
            'fade_in_checkbox',
            'fade_out_checkbox',
            'slider_demo',
          ],
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
          title: '複数のBGM（Android/PC版）',
          description: '複数の曲を追加し、シーンごとにBGMを切り替えられます。',
          bullets: [
            'タイトル右側の「(n件)」で登録数を確認できます。',
            '動画終端より後から始まる曲は一時的に無効になり、動画尺が戻ると復元されます。',
            '「設定を末尾に固定」は、開始・終了の設定値そのものを書き換えるときに使います。',
            'フェードアウトは、実際に再生される有効終端を基準にかかります。',
          ],
          comparison: {
            caption: 'BGMの自動調整 ON・OFF の違い',
            rows: [
              {
                label: 'ON',
                description:
                  '設定値は残したまま、最後の曲の有効区間を動画末尾に合わせます。既定はこちらです。',
              },
              {
                label: 'OFF',
                description:
                  '設定した区間だけ再生します。動画が長くなってもBGMを延長しません。',
              },
            ],
          },
          visuals: ['bgm_count_label', 'bgm_auto_adjust_toggle', 'copy_button'],
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
          description:
            'BGM内の開始位置と、動画タイムライン上の開始タイミング（遅延）を設定できます。',
          visuals: ['start_chip', 'delay_chip', 'slider_demo'],
        },
        {
          title: '音量調整',
          description:
            '音量を調整し、スピーカーアイコンでミュートON/OFF切替、くるくるアイコンでデフォルト値に戻せます。',
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
          title: 'タイトルの登録件数',
          description:
            'ナレーションを登録すると、タイトル右側の「(n件)」で現在の登録数を確認できます。',
          visuals: ['narration_count_label'],
        },
        {
          title: 'セクションの鍵アイコン',
          description: 'ナレーションの追加・削除・調整をロックできます。',
          visuals: ['unlock_button', 'lock_button_red'],
        },
        {
          title: 'コピー（Android/PC版）',
          description:
            '青いコピーボタンでナレーションを複製できます。複製はトリミング後の末尾に続けて配置されるので、長い音声を分割して好きなタイミングに配置するときに便利です。',
          visuals: ['copy_button'],
        },
        {
          title: '並び替え・編集・削除・保存',
          description:
            '各ナレーションを上下移動、編集、削除できます。保存ボタンを使うと、AIで生成したナレーションをパソコンやスマホに保存できます。' +
            `${downloadHelpSentence}`,
          visuals: [
            'move_up_button',
            'move_down_button',
            'edit_button',
            'delete_button',
            'save_button',
          ],
        },
        {
          title: 'AI原稿からキャプションカードを追加',
          description: 'AIナレーションの原稿から、編集可能な通常キャプションを作成します。',
          facts: [
            {
              label: '作成方法',
              description: '原稿を読みやすい長さに分け、実際のナレーション再生区間へ配置します。',
            },
            {
              label: '短い無音',
              description: '0.3秒未満ではキャプションを消さず、無音の中央で次のカードへ切り替えます。',
            },
            {
              label: '長い無音',
              description: '0.3秒以上では発話前後に約0.1秒ずつキャプションを残し、中央だけ非表示にします。',
            },
            {
              label: '解析できない場合',
              description: '文字数の比率で配置します。追加後は文字と開始・終了を個別編集できます。',
            },
          ],
          visuals: ['narration_caption_button'],
        },
        {
          title: '開始・終了位置',
          description:
            '開始位置は数値入力・スライダーで調整できます。「開始」「終了」ボタンでは、プレビューの現在位置をそのナレーションの再生開始・終了へ反映できます。',
          visuals: ['start_chip', 'range_pin_buttons', 'slider_demo'],
        },
        {
          title: 'トリミング設定（折りたたみ）',
          description:
            'トリミング開始/終了は「トリミング設定」を開いたときだけ表示されます。長いナレーションを複数に分割して、タイミングを調整したり、声質を合わせたいときに便利です。',
          visuals: ['trim_chip', 'duration_chip', 'slider_demo'],
        },
        {
          title: '音量波形と無音の区切り検出',
          description: 'トリミング設定を開くと、ナレーションの音量波形が表示されます。',
          bullets: [
            '緑の線: トリミング開始',
            '赤の線: トリミング終了',
            '黄色の線: 自動検出した文の区切り',
            '黄色の線を選び、「開始に」「終了に」でトリミング位置へ反映します。',
          ],
          note: '音量波形と無音検出は Android・パソコン向けの機能です。',
          visuals: ['narration_waveform'],
        },
        {
          title: '音量調整',
          description:
            '音量は常時表示です。スライダーで調整し、スピーカーアイコンでミュートON/OFF切替、くるくるアイコンでデフォルト値に戻せます。',
          visuals: ['volume_chip', 'mute_button', 'reset_button', 'slider_demo'],
        },
      ],
    },
    caption: {
      title: 'キャプションの使い方',
      subtitle: 'タイトル、追加、表示ON/OFF、一括設定、個別設定をまとめて管理できます。',
      items: [
        {
          title: 'タイトル（キャプションとは別管理）',
          description: 'セクション先頭の「タイトル」（開いて設定）から、動画タイトルを設定できます。',
          facts: [
            {
              label: '管理方法',
              description: '通常キャプションとは別に保存され、キャプション一覧には並びません。',
            },
            {
              label: '初期設定',
              description: '中央・大きめの文字、表示0〜4秒、終了フェード1秒です。',
            },
            {
              label: '表示時間',
              description: 'スライダー・数値・「プレビュー位置を反映」の開始／終了で設定します。',
            },
            {
              label: '見た目',
              description: 'サイズ、字体、位置、縁、文字色、ぼかし、背景帯を「スタイル設定」で調整します。',
            },
          ],
          note: '変更はすぐプレビューへ反映され、書き出した動画にも同じ見た目で入ります。',
          visuals: [
            'video_title_accordion',
            'range_pin_buttons',
            'position_chip',
            'start_chip',
            'duration_chip',
          ],
        },
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
          title: 'キャプション一括削除（ゴミ箱アイコン）',
          description:
            'セクションヘッダー（表示アイコンと鍵のあいだ）のゴミ箱アイコンで、設定中のキャプションをすべて削除できます。押すと確認ダイアログが出て、OK したときだけ削除されます。タイトル設定は削除しません。',
          visuals: ['delete_button'],
        },
        {
          title: 'キャプション スタイル/フェードの一括設定',
          description:
            '閉じているときはタイトル右側に「（開いて設定）」と表示されます。押すと、全キャプション共通のサイズ、字体、位置、ぼかし、背景の帯（既定OFF）、フェード（0.5秒・1秒・2秒）をまとめて設定できます。開いた後は「（開いて設定）」が消え、下向き矢印で開いている状態を示します。',
          visuals: [
            'caption_style_accordion',
            'size_chip',
            'position_chip',
            'blur_chip',
            'fade_in_checkbox',
            'fade_out_checkbox',
          ],
        },
        {
          title: '文字の縁・色',
          description:
            '一括スタイル内の「文字の縁・色」から、縁の幅・色と文字本体色を調整します。',
          bullets: [
            '「縁の幅」はスライダーまたは数値入力で調整できます。',
            '「縁の色」と「文字本体」は色見本または #RRGGBB 形式で指定できます。',
            '初期値は白い文字本体と黒い縁（4px）です。',
            '「キャプション背景の帯」を ON にすると、文字幅に合わせて半透明の背景（既定は黒）を敷けます。',
          ],
          visuals: ['caption_outline_color_accordion', 'caption_outline_controls'],
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
            '歯車マークから、文字の縁幅・縁色・文字本体色、サイズ、位置、ぼかし、背景の帯、フェードをカードごとに設定できます。背景の帯は一括と同様にチェックでON/OFFでき、未設定の項目は一括設定を継承します。',
          bullets: [
            '変更した項目だけ、一括設定より優先されます。',
            '「文字の縁・色」は「（開いて設定）」から開きます。',
            '「この個別設定をクリア」では、本文と表示時間を残して一括設定へ戻します。',
          ],
          visuals: [
            'settings_button',
            'caption_outline_color_accordion',
            'caption_outline_controls',
            'blur_chip',
            'slider_demo',
          ],
        },
        {
          title: '表示時間',
          description:
            '開始時間・終了時間はスライダーや数値で調整し、現在位置ボタンでプレビューの現在位置に設定できます。',
          visuals: ['start_chip', 'duration_chip', 'current_pin_chip', 'slider_demo'],
        },
        {
          title: 'まとめて入力・編集（Android/PC版）',
          description: '歌詞や長いキャプションを、複数行まとめて追加・編集できます。',
          bullets: [
            '通常は1行につき1枚のキャプションカードを作成します。',
            '「混在」では、+ で始めた行を直前カードの時分割行にできます。',
            '「＋ 時分割行を挿入」と、[開始-終了]形式の時間指定を利用できます。',
            '「時間指定だけ消す」では文章を残したまま時刻だけ削除します。',
          ],
          note: '登録前は「① まとめて入力」、登録後は「① まとめて入力・編集」と表示されます。',
          visuals: ['bulk_caption_button'],
        },
        {
          title: '② タイミング打ち（Android/PC版）',
          description:
            '再生しながらボタンを押すだけでキャプションの表示タイミングを確定できます。交互モード（開始→終了を交互に確定）と連続モード（区切ると同時に次が始まる・間隔設定可）があり、-1s/+1s と再生ボタンで微調整できます。',
          bullets: [
            '「無音区間：前へ／次へ」で、波形と同じ無音の切れ目へ素早く移動できます。',
            '「読みやすい位置へ自動調整」は既定 ON です。無音ぴったりではなく、発話の少し後まで残す／少し前から出す位置へ移動します。',
            '短い無音では間を空けず、中央で切り替える位置へ寄せます（ナレーションからキャプションを作るときと同じ考え方です）。',
            '無音の開始・終了そのものへ合わせたいときだけ、チェックを外してください。',
          ],
          note: '波形下の無音ナビは常に無音の開始・終了そのものへ移動します。余白付きの移動はタイミング打ち内のチェックだけに効きます。',
          visuals: ['timing_caption_button', 'silence_nav_controls'],
        },
        {
          title: '時間をまとめてずらす（Android/PC版）',
          description:
            '対象を選び、「現在位置に先頭を合わせる」で最初のキャプションをプレビュー位置へ移動します。終了位置の指定は不要です。動画・ナレーション・BGMは移動しません。',
          bullets: [
            '各カードの表示時間とカード間の間隔は維持されます。',
            '秒数指定の「早める」「遅らせる」は微調整に利用できます。',
          ],
          visuals: ['shift_caption_controls'],
        },
        {
          title: 'フォント・カスタム値（Android/PC版）',
          description:
            '字体は「その他▾」から端末に実在するシステムフォントを選べます。サイズと位置は「カスタム」で自由に指定できます。',
          bullets: [
            'PCでは「＋ この端末の全フォントから選ぶ（PC）」も利用できます。',
            '位置は画面中央が 0 で、横は右が＋、縦は上が＋です（-100〜+100%）。動画・画像・ロゴと共通の指定方法です。',
            '「上部」「中央」「下部」を選んでから「カスタム」を押すと、その位置を引き継いで微調整できます。',
          ],
          visuals: ['caption_custom_controls'],
        },
      ],
    },
    preview: {
      title: 'プレビューの使い方',
      subtitle: '再生確認、書き出し、ダウンロードをこのセクションで行います。',
      items: [
        {
          title: '停止・再生・キャプチャ',
          description:
            '停止と再生でプレビュー操作ができ、キャプチャは現在の表示内容を画像として保存できます。',
          visuals: ['stop_button', 'play_button', 'capture_button'],
        },
        {
          title: '音量波形と無音区間',
          description: 'シークバーの下に、プロジェクト全体の音量変化と無音区間を表示します。',
          facts: [
            {
              label: '波形に含む音声',
              description: 'ナレーション、動画音声、BGMを反映します。',
            },
            {
              label: '移動方法',
              description: '波形のタップ、または「無音区間：前へ／次へ」を使います。',
            },
            {
              label: '判定の優先順',
              description: 'ナレーション → 動画音声 → BGM の順です。現在の基準は波形下に表示します。',
            },
            {
              label: '更新タイミング',
              description: '音声素材、トリミング、音量を変更すると波形を作り直します。',
            },
          ],
          bullets: [
            '黄色い帯は、発話の切れ目となる無音区間です。',
            '移動先には動画の先頭と末尾も含まれます。',
            '同じ移動ボタンは、キャプションの「タイミング打ち」にもあります。',
          ],
          note: '移動しただけではキャプション時刻は変わりません。移動後にキャプション側の現在位置反映ボタンを押してください。iPhone・iPadでは波形を表示しません。',
          visuals: ['timeline_waveform', 'silence_nav_controls'],
        },
        {
          title: 'サムネイル（プロジェクト全体）',
          description: '完成映像の代表フレームを、プレビュー下の「サムネイル設定」から選べます。',
          bullets: [
            '既定はタイムライン先頭付近（約0.2秒）です。',
            '自動設定のときは、クリップの追加・削除・並び替えや尺変更で先頭付近が変わると、サムネイルも自動で更新されます。',
            '「現在のフレームをサムネイルに設定」で手動設定します（手動中は並び替えでも変わりません）。',
            '「自動設定に戻す」で先頭付近の自動取得へ戻せます。',
            '次回の動画ファイル作成時に、MP4のカバーアートと先頭キーフレームへ反映します。',
          ],
          note: '横16:9／縦9:16を変更して画像比率が合わなくなった場合は、自動設定へ戻ります。',
          visuals: ['poster_accordion', 'poster_actions'],
        },
        {
          title: '動画ファイルを作成',
          description:
            '動画ファイルを作成できます。作成中にタブを切り替えたり画面を非アクティブにすると、動画を正しく作成できません。',
          visuals: ['export_button'],
        },
        {
          title: 'キャプションのみ出力（Android/PC版）',
          description:
            '動画出力オプションで「キャプションのみ」を選ぶと、ベース映像を含めずキャプションと動画タイトルだけを書き出せます。他の編集ソフトで合成する用途向けです。',
          bullets: [
            '透過 WebM: 背景透過（対応ブラウザのみ）。非対応時は黒背景へフォールバックします。',
            '黒背景 MP4: 互換性重視の基本形式です。',
            '白文字キー用 MP4: 黒背景に白文字で、ルミナンスキー合成向けです。',
            '字幕ファイル（SRT / VTT）も同時に、または単独でダウンロードできます。',
          ],
          note: 'キャプションが1件もない場合は選択できません。完成動画（焼き込み）の書き出しは従来どおり選べます。iPhone / iPad 版ではキャプションのみ出力は未対応です。',
          visuals: ['export_button'],
        },
        {
          title: '作成後のダウンロード',
          description:
            '作成完了後はダウンロードできます。' +
            `${downloadHelpSentence}停止/再生を押すと「動画ファイルを作成」ボタンに戻り、再作成も可能です。`,
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

  if (context.appFlavor === 'apple-safari') {
    const hiddenTitles = new Set([
      '動画の形式（横16:9／縦9:16）',
      'ロゴ表示（ウォーターマーク / エンドロール）',
      '一括ミュート（スピーカーアイコン）',
      'トランジション（Android/PC版）',
      '複数のBGM（Android/PC版）',
      'コピー（Android/PC版）',
      'AI原稿からキャプションカードを追加',
      '音量波形と無音の区切り検出',
      'タイトル（キャプションとは別管理）',
      'キャプション一括削除（ゴミ箱アイコン）',
      '文字の縁・色',
      'まとめて入力・編集（Android/PC版）',
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
        'プロジェクト: 自動保存、手動保存、読み込み',
      ];
    }

    const clipOperations = content.clips.items.find((item) => item.title === '並び替え・コピー・削除');
    if (clipOperations) {
      clipOperations.title = '並び替え・削除';
      clipOperations.description = '各クリップは上下移動と削除ができます。';
    }

    const clipRange = content.clips.items.find((item) => item.title.startsWith('表示区間'));
    if (clipRange) {
      clipRange.bullets = ['動画・画像とも、スライダーから時間を調整できます。'];
      clipRange.visuals = ['trim_chip', 'duration_chip', 'slider_demo'];
    }

    const clipTransform = content.clips.items.find((item) => item.title === '位置・サイズ・回転・ぼかし調整');
    if (clipTransform) {
      clipTransform.title = '位置・サイズ調整';
      clipTransform.facts = clipTransform.facts?.filter(
        (fact) => fact.label !== '回転' && fact.label !== 'ぼかし',
      );
      clipTransform.visuals = clipTransform.visuals?.filter(
        (visual) => visual !== 'rotate_button' && visual !== 'blur_chip',
      );
    }

    const captionStyle = content.caption.items.find(
      (item) => item.title === 'キャプション スタイル/フェードの一括設定',
    );
    if (captionStyle) {
      captionStyle.description =
        '閉じているときはタイトル右側に「（開いて設定）」と表示されます。押すと、全キャプション共通のサイズ、字体、位置、ぼかし、フェード（0.5秒・1秒・2秒）をまとめて設定できます。';
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
