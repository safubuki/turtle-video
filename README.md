# Turtle Video

ブラウザで動作する動画編集アプリケーション。動画・画像の結合、BGM・ナレーション追加、AIナレーション生成機能を備えています。

## 機能

### 基本編集機能
- **動画/画像編集**: 複数の動画・画像を結合してタイムライン編集
- **トリミング**: 動画の開始/終了時間を調整
- **トランスフォーム**: 拡大・縮小、位置調整（ミニプレビュー付き）
- **動画エクスポート**: WebM/MP4形式で書き出し

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
- **設定モーダル**: APIキーの設定UIを提供
- **ミニプレビュー**: トランスフォームパネル内でリアルタイムプレビュー表示

### 更新履歴
- **v2.1.1**: 動画切り替え直後の停止操作により発生するタイムアウト/フリーズ不具合を修正（安全な停止ロジックの実装）

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

アプリケーション起動後、ヘッダーの歯車アイコンから設定モーダルを開き、APIキーを設定できます。設定されたAPIキーはブラウザのlocalStorageに保存されます。

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
│   │   └── SettingsModal.tsx   # 設定モーダル（APIキー設定）
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
│   └── useSwipeProtectedValue.ts # 誤操作防止フック
├── stores/              # Zustand ストア
│   ├── mediaStore.ts    # メディア状態管理
│   ├── audioStore.ts    # BGM/ナレーション状態管理
│   ├── captionStore.ts  # キャプション状態管理
│   └── uiStore.ts       # UI状態管理
├── utils/               # ユーティリティ関数
│   ├── format.ts        # フォーマット関数
│   └── media.ts         # メディア操作関数
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

MIT
