# タートルビデオ

ブラウザで動作する動画編集アプリケーション。動画・画像の結合、BGM・ナレーション追加、AIナレーション生成機能を備えています。

## 機能

### 基本編集機能
- **動画/画像編集**: 複数の動画・画像を結合してタイムライン編集
- **トリミング**: 動画の開始/終了時間を調整
- **トランスフォーム**: 拡大・縮小、位置調整（ミニプレビュー付き）
- **動画エクスポート**: WebM/MP4形式でファイル作成・ダウンロード

### プロジェクト管理機能
- **自動保存**: 設定可能な間隔（オフ/1分/2分/5分）で自動的にプロジェクトを保存
- **手動保存・読み込み**: IndexedDBを使用した2スロット方式（自動保存/手動保存）
- **保存・素材モーダル**: プロジェクトの保存・読み込み・削除、白/黒画像の生成機能
- **データ永続化**: ブラウザを閉じても作業内容を保持

### オーディオ機能
- **BGM追加**: 音楽ファイルをBGMとして追加
- **ナレーション**: 音声ファイルの追加またはAI生成
- **AIナレーション**: Google Gemini APIを使用したテキスト読み上げ
- **音声フェード**: フェードイン/フェードアウト効果

### キャプション機能
- **字幕追加**: テキスト字幕を任意のタイミングで表示
- **スタイル設定**: 文字サイズ（小/中/大）、表示位置（上/中央/下）
- **タイムライン編集**: 開始/終了時間をスライダーまたは数値で調整
- **リアルタイムプレビュー**: 現在時刻のキャプションをハイライト表示

### UI/UX機能
- **誤操作防止**: スワイプ保護付きスライダーで縦スクロール時の誤操作を防止
- **セクションロック**: 各セクション（クリップ/BGM/ナレーション/キャプション）を個別にロック可能
- **確認ダイアログ**: 一括クリアやデータ削除時に確認を要求
- **設定モーダル**: APIキー設定とログ閲覧機能を提供
- **ミニプレビュー**: トランスフォームパネル内でリアルタイムプレビュー表示
- **ログ機能**: エラー・警告・情報をリアルタイム記録（エクスポート可能）

## すぐに使う（GitHub Pages）

- 公開URL: `https://safubuki.github.io/turtle-video-rel/`
- URLにアクセスするだけで利用できます（インストール不要）。
- 対応環境: Android / PC / iOS Safari
- 提供機能は各対応環境で基本的に同一です。
- iOS Safari は暫定対応です。端末やOSバージョンによっては不具合が発生する可能性があります。

## セットアップ

### 必要環境

- Node.js 18+
- npm または yarn

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

## Agent Skills

**Agent Skills とは**

AIアシスタントに特定のタスク手順やプロジェクト固有の知識を教えるための「指示書のパッケージ」です。
これにより、AIがプロジェクトの文脈を理解し、一貫した品質でコード生成やドキュメント作成を行えるようになります。

このプロジェクトには、3つの異なるAI環境（GitHub Copilot、GPT Codex、Google Gemini）向けのAgent Skills設定が含まれています。
それぞれの環境で利用方法と参照するディレクトリが異なります。

### 1. 管理と同期

以下の2つのディレクトリでスキルを管理しています。

- **Master**: `.github/skills` (GitHub Copilot / GPT Codex用)
- **Mirror**: `.agent/skills` (Google Gemini用)

以下のコマンドで、これら2つのディレクトリを同期します。

- `npm run skills:sync -- --dry-run --verbose`（確認のみ）
- `npm run skills:sync`（実同期）
- `npm run skills:sync -- --strategy base --base github`（GitHub側を正として強制同期）

### 2. 環境別セットアップ

#### A. GitHub Copilot
- **利用ディレクトリ**: `.github/skills`
- **設定**: VS Code等の `.vscode/settings.json` で以下を有効にします。

```json
{
  "chat.useAgentSkills": true
}
```

#### B. GPT Codex (CLI)
- **利用ディレクトリ**: `.github/skills`
- **設定**: ユーザー設定ファイル（通常 `C:/Users/<ユーザー名>/.codex/config.toml`）にパスを指定してください。

**設定例（1つのスキルのみ）**:
```toml
# 例: C:/Users/<ユーザー名>/.codex/config.toml
[[skills.config]]
path = "C:/<workspace-parent>/<workspace-folder>/.github/skills/bug-analysis/SKILL.md"
enabled = true
```

#### C. Google Gemini (AntiGravity)
- **利用ディレクトリ**: `.agent/skills`
- **設定**: **不要**。
  - プロジェクトルートに `.agent/skills` ディレクトリが存在するだけで自動的に認識されます。

### このプロジェクトで使う主なスキル
- `bug-analysis`
- `bugfix-guard`
- `elite-ux-architect`
- `implementation-plan`
- `readme-generator`
- `skills-generator`
- `turtle-video-overview`
- `user-guide`

## 技術スタック

- **フレームワーク**: React 19 + TypeScript
- **ビルドツール**: Vite 7
- **スタイリング**: Tailwind CSS 4
- **状態管理**: Zustand
- **アイコン**: Lucide React
- **テスト**: Vitest + Testing Library
- **AI API**: Google Gemini API (text/speech generation)

## プロジェクト構造

```
src/
├── components/
│   ├── common/          # 共通UIコンポーネント
│   │   ├── Toast.tsx
│   │   ├── ErrorMessage.tsx
│   │   ├── ErrorBoundary.tsx
│   │   └── MiniPreview.tsx     # トランスフォームミニプレビュー
│   ├── media/           # メディア関連コンポーネント
│   │   ├── ClipItem.tsx
│   │   ├── CaptionItem.tsx     # キャプションアイテム
│   │   └── MediaResourceLoader.tsx
│   ├── sections/        # セクションコンポーネント
│   │   ├── ClipsSection.tsx
│   │   ├── BgmSection.tsx
│   │   ├── NarrationSection.tsx
│   │   ├── CaptionSection.tsx  # キャプションセクション
│   │   └── PreviewSection.tsx
│   ├── modals/          # モーダルコンポーネント
│   │   ├── AiModal.tsx
│   │   ├── SettingsModal.tsx   # 設定モーダル（APIキー・ログ）
│   │   └── SaveLoadModal.tsx   # 保存・素材モーダル
│   ├── Header.tsx
│   ├── SwipeProtectedSlider.tsx # 誤操作防止スライダー
│   └── TurtleVideo.tsx  # メインコンポーネント
├── hooks/               # カスタムフック
│   ├── useMediaItems.ts
│   ├── useAudioTracks.ts
│   ├── usePlayback.ts
│   ├── useAudioContext.ts
│   ├── useExport.ts
│   ├── useAiNarration.ts
│   ├── useAutoSave.ts           # 自動保存フック
│   └── useSwipeProtectedValue.ts # 誤操作防止フック
├── stores/              # Zustand ストア
│   ├── mediaStore.ts    # メディア状態管理
│   ├── audioStore.ts    # BGM/ナレーション状態管理
│   ├── captionStore.ts  # キャプション状態管理
│   ├── projectStore.ts  # プロジェクト保存・読み込み管理
│   ├── logStore.ts      # ログ管理
│   └── uiStore.ts       # UI状態管理
├── utils/               # ユーティリティ関数
│   ├── format.ts        # フォーマット関数
│   ├── media.ts         # メディア操作関数
│   └── indexedDB.ts     # IndexedDB操作関数
├── types/               # 型定義
│   └── index.ts
└── test/                # テストファイル
    ├── setup.ts
    ├── format.test.ts
    ├── media.test.ts
    └── stores/
        ├── mediaStore.test.ts
        ├── audioStore.test.ts
        └── uiStore.test.ts
```

## 開発ガイド

### コード規約

- TypeScript strict モードを使用
- ESLint + Prettier でコードフォーマット
- コンポーネントは React.memo で最適化

### 新機能の追加

1. 必要に応じて型定義を `src/types/index.ts` に追加
2. ユーティリティ関数は `src/utils/` に配置
3. 状態管理は Zustand ストアを使用
4. テストを `src/test/` に追加

## ライセンス

GNU General Public License v3.0 (GPLv3)

Copyright (c) 2026 safubuki (TurtleVillage)

本ソフトウェアはオープンソースソフトウェアです。GNU General Public License v3.0 (GPLv3) の条件下で、再頒布および変更が可能です。

**GPLv3の主な特徴:**
- **ソースコードの公開義務**: 本ソフトウェアを改変して配布する場合、そのソースコードも公開する必要があります。
- **ライセンスの継承**: 改変したソフトウェアも同じGPLv3ライセンスの下で公開する必要があります。
- **特許の保護**: ユーザーがソフトウェアを使用する権利を特許権者が侵害することを防ぎます。

詳細については [LICENSE](./LICENSE) ファイルを参照してください。
