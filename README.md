# タートルビデオ

ブラウザで動作する動画編集ソフトです。動画・画像・BGM・ナレーション・キャプションをまとめて編集し、動画ファイルとして書き出せます。PWA対応のためスマホでもアプリ感覚で利用できます。

## 機能

### 動画・画像
- 複数ファイルの追加、並び替え、削除、コピー
- 表示区間の調整（動画: トリミング / 画像: 表示時間）
- 位置・サイズ調整（黒帯除去、拡大縮小、位置、90度回転、ぼかし）
- 音量、ミュート、フェード（0.5秒 / 1秒 / 2秒）
- 横16:9 / 縦9:16 の切り替え
- クリップ間トランジション（ディゾルブ / フェード黒 / フェード白）
- 倍速再生（速度バッジの表示にも対応）

### ロゴ表示（ウォーターマーク / エンドロール）
- **ウォーターマーク**: 映像に重ねてロゴを表示。表示する時間・位置・倍率・透過度・
  回転・マスク（四角 / 角丸 / 円形）・周辺ぼかし・フェードを調整
- 表示する区間を「本編のみ」「全編（エンドロール含む）」から選択
- **エンドロール**: 動画本編の後に単色背景＋ロゴを表示（設定した長さだけ動画が伸びる）
- エンドロールの長さは 0.5〜30秒、背景色は黒 / 白 / カスタム（既定は黒）
- エンドロール中に BGM を徐々にフェードアウトするオプション
- 画像と設定はウォーターマーク／エンドロールでそれぞれ独立して保存

### BGM
- BGMファイルの追加・削除（複数BGMに対応）
- 開始位置・開始タイミング（遅延）の調整、トリミング
- 音量、ミュート、フェード（0.5秒 / 1秒 / 2秒）
- 動画尺に合わせた自動調整

### ナレーション
- AI生成または音声ファイル追加
- 複数トラック管理（並び替え・編集・削除・保存・コピー）
- 開始位置（現在位置ボタン対応）、トリミング設定（折りたたみ）
- 音量波形の表示と無音区間の自動検出（区切り位置へワンタップで反映）
- AI原稿からキャプションカードを自動生成
- 音量、ミュート調整

### キャプション
- 追加、表示ON/OFF、ロック、一括削除
- スタイル・フェードの一括設定（サイズ、字体、位置、色・縁、背景帯、ぼかし、フェード）
- 各行の操作（移動・削除・編集）と個別設定（歯車）
- 表示時間の開始/終了調整（現在位置ボタン対応）
- まとめて入力・編集、タイミング打ち、時間をまとめてずらす
- 動画タイトル（キャプションとは別管理）

### 位置指定について
動画・画像／ロゴ／キャプションの位置は共通の座標系で指定します。

- 画面中央が `0`
- 横は右が ＋ / 左が −
- 縦は **上が ＋** / 下が −
- 範囲は -100〜+100%

### プレビュー・書き出し
- 停止・再生・キャプチャ
- シークバーに区間を色分け表示（ディゾルブの重なりは紫、エンドロールは別色）
- 全体波形の表示と無音区間への移動
- 出力品質の選択と字幕ファイル（SRT）の書き出し
- 動画ファイル作成とダウンロード
- サムネイル（プロジェクト全体）の自動・手動設定
- 一括クリアで作成状態を含め初期化

### 保存・素材
- 保存先はブラウザ上の IndexedDB（自動保存/手動保存の2スロット）
- ブラウザやアプリを閉じても保存データを保持
- 自動保存は定期上書きで、保存データが増え続けにくい設計
- 白画像/黒画像（1280x720）素材の生成

### 設定
- Gemini APIキー管理（ブラウザ保存）
- 実行ログの確認、コピー、JSON出力、クリア
- Google AI Studio / Gemini API の利用上限に関する注意表示

## すぐに使う（Cloudflare Pages）

- 公開URL: `https://turtle-video.pages.dev/`
- URLにアクセスするだけで利用できます（インストール不要）。
- 動作確認機種:
  - スマホ: Pixel 6a（Android・Chrome）
  - スマホ / タブレット: iPhone / iPad（iOS・Safari）
  - PC: Windows / CPU Ryzen 5 5500 / GPU RTX3060 12GB
- ※動作確認は手持ちの機種でのみ実施しています。動作しない場合はご了承ください。
- iPhone / iPad の Safari に対応しています。ブラウザ仕様により一部の表示・動作が異なる場合があります。お気づきの不具合はご報告ください。

## 使い方（ヘルプ準拠）

1. 動画・画像を追加し、並び順や表示区間を調整
2. BGMを追加し、開始タイミングや音量を調整
3. ナレーションをAI生成または音声ファイルで追加
4. キャプションを追加し、表示時間やスタイルを調整
5. プレビュー確認後、「動画ファイルを作成」してダウンロード

### 注意事項

- 長い編集や複雑な編集では、動作が不安定になることがあります。
- 手動保存と自動保存を活用してください。
- 動画ファイル作成中にタブ切り替えや非アクティブ化を行うと、正しく作成できない場合があります。

## セットアップ

### 必要環境

- Node.js 20+（Vite 7 の要件。CI も Node 20 でビルド）
- npm（`package-lock.json` を同梱。CI は `npm ci` を使用）

### インストール

```bash
# 依存関係をインストール
npm install

# 開発サーバーを起動
npm run dev
```

### 環境変数設定

AIナレーション機能を使用するには、Google Gemini API キーが必要です。

**方法1: 設定モーダルから設定（推奨）**

アプリケーション起動後、ヘッダーの歯車アイコンから設定モーダルを開き、「APIキー」タブでAPIキーを設定できます。設定されたAPIキーはブラウザのlocalStorageに保存されます。

設定モーダルでは以下の機能も利用できます：
- **APIキー管理**: Google Gemini APIキーの設定・保存
- **ログ閲覧**: エラー・警告・情報ログのリアルタイム表示とエクスポート

**方法2: 環境変数で設定**

```bash
# .env.example をコピーして .env を作成
cp .env.example .env

# .env ファイルを編集してAPIキーを設定
VITE_GEMINI_API_KEY=your_api_key_here
```

## ビルド

```bash
# プロダクションビルド
npm run build

# ビルド結果をプレビュー
npm run preview
```

## テスト

```bash
# テストを実行 (ウォッチモード)
npm run test

# テストを一度だけ実行
npm run test:run

# カバレッジを確認
npm run test:coverage
```

## 開発スクリプト（集約先）

実行可能なスクリプト一覧の正本は `package.json` の `scripts` です。

### よく使うスクリプト

- `npm run dev`: 開発サーバー起動
- `npm run build`: 本番ビルド
- `npm run test:run`: テスト一括実行
- `npm run preview`: ビルド結果をローカル確認

## Agent Skills（AIエディタ連携）

このリポジトリには開発支援用の Agent Skills を同梱しています。読み込まれるディレクトリは利用する AI エディタ・ツールごとに異なります（いずれもリポジトリに含まれており、`npm run skills:sync` で内容を同期します）。

### 対応ツールと読み込みディレクトリ

#### GitHub Copilot

- **利用ディレクトリ**: `.github/skills/`
- **設定**: `.vscode/settings.json` に以下を追加します。

```json
{
  "chat.useAgentSkills": true
}
```

#### GPT Codex（VS Code 拡張・CLI）

- **利用ディレクトリ**: `.agents/skills/`
- **設定**: 不要。ディレクトリが存在するだけで自動認識されます。

#### Google Gemini（AntiGravity）

- **利用ディレクトリ**: `.agent/skills/`（複数形の「s」なし）
- **設定**: 不要。ディレクトリが存在するだけで自動認識されます。

> [!NOTE]
> GPT Codex は `.agents`（複数形）、Google Gemini は `.agent`（単数形）でディレクトリ名が異なります。

### このプロジェクトで使う主なスキル
- `bug-analysis`
- `bugfix-guard`
- `elite-ux-architect`
- `implementation-plan`
- `issue-specialist`
- `media-video-analyzer`
- `readme-generator`
- `release-version-manager`
- `skills-generator`
- `skills-sync-guard`
- `test-improvement`
- `turtle-video-overview`
- `turtle-video-platform-targeting`
- `user-guide`

## 技術スタック

- **フレームワーク**: React 19 + TypeScript
- **ビルドツール**: Vite 7
- **スタイリング**: Tailwind CSS 4
- **状態管理**: Zustand
- **アイコン**: Lucide React
- **PWA**: vite-plugin-pwa（Workbox）
- **動画書き出し**: WebCodecs / MediaRecorder + mp4-muxer
- **テスト**: Vitest + Testing Library
- **AI API**: Google Gemini API (text/speech generation)

## プロジェクト構造

```
turtle-video/
├── .github/skills/      # GitHub Copilot向け Agent Skills
├── .agents/skills/      # GPT Codex向け Agent Skills
├── .agent/skills/       # Google Gemini向け Agent Skills
├── Docs/                # ドキュメント
│   ├── architecture/    # platform / runtime architecture notes
│   ├── guides/          # developer and workflow guides
│   ├── handovers/       # handover notes
│   ├── reports/         # investigation and fix reports
│   ├── review/          # review criteria
│   └── specs/           # design specs and implementation plans
├── public/              # 静的アセット
├── scripts/             # 開発・運用スクリプト
├── src/
│   ├── app/             # アプリ起動シェルとプラットフォーム（flavor）判定
│   ├── components/      # UIコンポーネント（common/media/modals/sections）
│   ├── constants/       # 定数定義
│   ├── flavors/         # プラットフォーム別実装（standard / apple-safari）
│   ├── hooks/           # カスタムフック
│   ├── stores/          # Zustandストア
│   ├── test/            # テストコード
│   ├── types/           # 型定義
│   └── utils/           # ユーティリティ
├── spec.md
├── version.json
└── package.json
```

## 開発ガイド

### コード規約

- TypeScript strict モードを使用
- ESLint + Prettier でコードフォーマット
- コンポーネントは React.memo で最適化
- 開発用スクリプトは `package.json` の `scripts` を正本とし、動画解析手順は `Docs/guides/developer_guide.md` を参照
- platform 分岐の図解は `Docs/architecture/platform-route-diagram.md` を参照

### 新機能の追加

1. 必要に応じて型定義を `src/types/index.ts` に追加
2. ユーティリティ関数は `src/utils/` に配置
3. 状態管理は Zustand ストアを使用
4. テストを `src/test/` に追加

## ライセンス

GNU General Public License v3.0 (GPLv3)

Copyright (C) 2026 safubuki (Turtle Village)

本ソフトウェアはオープンソースソフトウェアです。GNU General Public License v3.0 (GPLv3) の条件下で、再頒布および変更が可能です。
個人や社内で再頒布を伴わない場合は、自由に改変して利用できます。

**GPLv3の主な特徴:**
- **ソースコードの公開義務**: 本ソフトウェアを改変して配布する場合、そのソースコードも公開する必要があります。
- **ライセンスの継承**: 改変したソフトウェアも同じGPLv3ライセンスの下で公開する必要があります。
- **特許の保護**: ユーザーがソフトウェアを使用する権利を特許権者が侵害することを防ぎます。

詳細については [LICENSE](./LICENSE) ファイルを参照してください。
