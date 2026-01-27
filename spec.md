# タートルビデオ - 仕様書 & 実装計画

## 概要

「タートルビデオ」は、ブラウザベースの動画編集アプリケーションです。React で構築されており、動画・画像のタイムライン編集、BGM・ナレーションの合成、AIナレーション生成機能を備えています。

---

## 現状の機能一覧

### 1. メディア管理機能

| 機能 | 説明 |
|------|------|
| 動画アップロード | 複数の動画ファイルをアップロード |
| 画像アップロード | 複数の画像ファイルをアップロード |
| メディア並べ替え | クリップの順序を上下に移動 |
| メディア削除 | 個別クリップの削除 |
| 個別ロック機能 | クリップ単位でのロック/アンロック |
| セクションロック機能 | クリップセクション全体のロック |

### 2. 動画編集機能

| 機能 | 説明 |
|------|------|
| トリミング | 動画の開始・終了位置を調整 |
| ボリューム調整 | 動画音声のボリューム設定 |
| ミュート | 動画音声のミュート切り替え |
| フェードイン | 映像・音声のフェードイン効果 |
| フェードアウト | 映像・音声のフェードアウト効果 |
| スケール調整 | 拡大率の調整 (0.5倍〜3.0倍) |
| 位置調整 | X/Y座標での位置調整 |
| 黒帯除去 | 102.5%拡大による黒帯除去オプション |

### 3. 画像編集機能

| 機能 | 説明 |
|------|------|
| 表示時間設定 | 画像の表示秒数を設定 (0.5秒〜60秒) |
| フェードイン/アウト | 画像のフェード効果 |
| スケール調整 | 拡大率の調整 |
| 位置調整 | X/Y座標での位置調整 |

### 4. BGM機能

| 機能 | 説明 |
|------|------|
| BGMアップロード | 音声ファイルのアップロード |
| 開始位置 (頭出し) | BGMの再生開始位置を設定 |
| 開始タイミング (遅延) | 動画タイムライン上での再生開始タイミング |
| ボリューム調整 | BGMのボリューム設定 |
| フェードイン/アウト | BGMのフェード効果 |
| セクションロック | BGMセクションのロック |

### 5. ナレーション機能

| 機能 | 説明 |
|------|------|
| ナレーションアップロード | 音声ファイルのアップロード |
| 開始位置 (頭出し) | ナレーションの再生開始位置を設定 |
| 開始タイミング (遅延) | 動画タイムライン上での再生開始タイミング |
| ボリューム調整 | ナレーションのボリューム設定 |
| フェードイン/アウト | ナレーションのフェード効果 |
| セクションロック | ナレーションセクションのロック |
| AI生成音声の保存 | 生成した音声ファイルのダウンロード |

### 6. AI機能 (Gemini API)

| 機能 | 説明 |
|------|------|
| スクリプト生成 | テーマからナレーション原稿を自動生成 |
| 音声合成 (TTS) | 原稿から音声を生成 |
| ボイス選択 | 5種類のAIボイスから選択 |

### 7. プレビュー & 再生機能

| 機能 | 説明 |
|------|------|
| リアルタイムプレビュー | Canvas上でのリアルタイム描画 |
| 再生/一時停止 | タイムラインの再生制御 |
| 停止 | 再生停止と位置リセット |
| シークバー | 任意の位置へのシーク |
| リソースリロード | メディア要素の強制リロード |
| タブ復帰時自動リフレッシュ | ブラウザタブ復帰時の再描画 |

### 8. エクスポート機能

| 機能 | 説明 |
|------|------|
| 動画書き出し | MediaRecorderを使用した動画出力 |
| MP4/WebM対応 | ブラウザ対応に応じたフォーマット選択 |
| ダウンロード | 生成した動画のダウンロード |

### 9. UI/UX機能

| 機能 | 説明 |
|------|------|
| トースト通知 | 操作結果のフィードバック表示 |
| エラー表示 | エラーメッセージの表示 |
| 一括クリア | 全データのリセット |
| レスポンシブレイアウト | モバイル対応デザイン |

---

## 現状の課題・問題点

### 🔴 Critical (重大な問題)

| # | 問題 | 詳細 |
|---|------|------|
| C1 | APIキーのハードコーディング | `apiKey = ""` が空文字。環境変数で管理すべき |
| C2 | 1ファイル巨大コード | 約1400行が1ファイルに集約されており保守困難 |
| C3 | 型安全性なし | JavaScript のため型エラーが実行時まで検出できない |

### 🟠 Major (大きな問題)

| # | 問題 | 詳細 |
|---|------|------|
| M1 | メモリリーク | `URL.revokeObjectURL` が適切に呼ばれない場合がある |
| M2 | エラーハンドリング不足 | try-catch が不十分で、ユーザーにフィードバックされないエラーあり |
| M3 | 非同期処理の競合 | `startEngine` の複数回呼び出しで競合状態が発生する可能性 |
| M4 | AudioContext の状態管理 | `suspended` 状態のハンドリングが不完全 |
| M5 | useEffect 依存配列 | `renderFrame` が依存配列に含まれておらず、stale closure の危険 |
| M6 | memoization 不足 | コールバック関数が毎回再生成され、不要な再レンダリング発生 |
| M7 | Ref と State の二重管理 | `mediaItems` と `mediaItemsRef` の同期が複雑でバグの温床 |

### 🟡 Minor (軽微な問題)

| # | 問題 | 詳細 |
|---|------|------|
| m1 | マジックナンバー | フェード時間 (1.0秒, 2.0秒) などがハードコーディング |
| m2 | console.log/error 残留 | 開発用ログがプロダクションコードに残存 |
| m3 | CSS クラス名混在 | Tailwind CSS クラスが長大で可読性が低い |
| m4 | アクセシビリティ | ARIA 属性やキーボード操作のサポート不足 |
| m5 | 国際化非対応 | 日本語ハードコーディング |

### 🔵 技術的負債

| # | 問題 | 詳細 |
|---|------|------|
| T1 | テストなし | 単体テスト・統合テストが存在しない |
| T2 | ビルド設定なし | Vite/webpack などのビルド設定がない |
| T3 | Linter/Formatter なし | ESLint/Prettier 設定がない |
| T4 | コンポーネント分離なし | UI がモノリシックで再利用性が低い |
| T5 | 状態管理の複雑さ | useState が多すぎて管理困難 |

---

## 推奨技術スタック

### コア

| 技術 | 用途 | 理由 |
|------|------|------|
| **Vite** | ビルドツール | 高速なHMR、TypeScript対応、設定が簡単 |
| **TypeScript** | 型安全性 | 開発時のエラー検出、IDE補完向上 |
| **React 18+** | UIフレームワーク | 既存コードとの互換性 |

### 状態管理

| 技術 | 用途 | 理由 |
|------|------|------|
| **Zustand** または **Jotai** | グローバル状態 | シンプルで軽量、学習コスト低 |
| Context API | 限定的な共有状態 | React 標準、追加依存なし |

### スタイリング

| 技術 | 用途 | 理由 |
|------|------|------|
| **Tailwind CSS** | ユーティリティCSS | 既存コードとの互換性維持 |

### 開発ツール

| 技術 | 用途 | 理由 |
|------|------|------|
| **ESLint** | 静的解析 | コード品質向上 |
| **Prettier** | フォーマッター | 統一されたコードスタイル |
| **Vitest** | テスト | Vite との親和性が高い |

### オプション (将来的に)

| 技術 | 用途 | 理由 |
|------|------|------|
| React Query / TanStack Query | API状態管理 | AI API呼び出しの管理 |
| Framer Motion | アニメーション | UI アニメーション強化 |

---

## 実装計画 (フェーズ別) - AI支援による高速開発

> 🤖 **AI支援開発**: 各フェーズでAIを活用し、コード生成・型定義・テスト作成を自動化することで、従来の約1/3の期間で完了します。

### Phase 0: 環境構築 (0.5日 = 数時間)

**目標**: Vite + TypeScript のプロジェクト基盤を構築

**AI活用ポイント**: プロジェクト初期化スクリプト生成、設定ファイル自動生成

```
タスク:
├── [x] Vite プロジェクト初期化 (AI: コマンド一括実行)
├── [x] TypeScript 設定 (AI: tsconfig自動生成)
├── [x] Tailwind CSS 設定 (AI: 設定ファイル自動生成)
├── [x] ESLint + Prettier 設定 (AI: ルール推奨・自動適用)
├── [x] 基本ディレクトリ構造の作成 (AI: 構造自動生成)
└── [x] 既存コードの動作確認（そのまま移行）
```

**成果物**:
```
src/
├── main.tsx
├── App.tsx
├── index.css
└── vite-env.d.ts
```

---

### Phase 1: 型定義 & 基本構造 (1日)

**目標**: TypeScript 型定義を整備し、既存機能を維持しながら移行

**AI活用ポイント**: 既存JSコードから型を自動推論、型定義ファイル一括生成

```
タスク:
├── [x] 型定義ファイル作成 (AI: 既存コードから型推論)
│   ├── MediaItem 型
│   ├── AudioTrack 型 (BGM/Narration)
│   ├── VoiceOption 型
│   └── その他共通型
├── [x] 定数ファイル分離 (AI: 定数抽出自動化)
├── [x] 既存コードの TypeScript 化 (AI: JS→TS変換)
└── [x] 動作確認
```

**成果物**:
```
src/
├── types/
│   └── index.ts
├── constants/
│   └── index.ts
└── components/
    └── TurtleVideo.tsx (TypeScript化)
```

---

### Phase 2: コンポーネント分割 (1-2日)

**目標**: UI コンポーネントを機能単位で分離

**AI活用ポイント**: 巨大コンポーネントから自動分割、props推論、export文自動生成

```
タスク:
├── [ ] Toast コンポーネント分離 (AI: 自動抽出)
├── [ ] MediaResourceLoader コンポーネント分離 (AI: 自動抽出)
├── [ ] Header コンポーネント (AI: 自動抽出)
├── [ ] ClipsSection コンポーネント (AI: 自動抽出 + ClipItem分離)
├── [ ] BgmSection コンポーネント (AI: 自動抽出)
├── [ ] NarrationSection コンポーネント (AI: 自動抽出)
├── [ ] PreviewSection コンポーネント (AI: 自動抽出 + Controls分離)
├── [ ] AiModal コンポーネント (AI: 自動抽出)
└── [ ] 動作確認
```

**成果物**:
```
src/
├── components/
│   ├── common/
│   │   ├── Toast.tsx
│   │   └── ErrorMessage.tsx
│   ├── media/
│   │   ├── MediaResourceLoader.tsx
│   │   └── ClipItem.tsx
│   ├── sections/
│   │   ├── ClipsSection.tsx
│   │   ├── BgmSection.tsx
│   │   ├── NarrationSection.tsx
│   │   └── PreviewSection.tsx
│   ├── modals/
│   │   └── AiModal.tsx
│   ├── Header.tsx
│   └── TurtleVideo.tsx (親コンポーネント)
```

---

### Phase 3: ロジック分離 - カスタムフック (1-2日)

**目標**: ビジネスロジックをカスタムフックに抽出

**AI活用ポイント**: ロジック自動抽出、依存配列自動推論、型安全なフック生成

```
タスク:
├── [ ] useMediaItems フック (AI: state/logicを自動抽出)
├── [ ] useAudioTracks フック (AI: BGM/ナレーションロジック抽出)
├── [ ] usePlayback フック (AI: 再生制御ロジック抽出)
├── [ ] useAudioContext フック (AI: Web Audio APIラッパー生成)
├── [ ] useExport フック (AI: 書き出しロジック抽出)
├── [ ] useAiNarration フック (AI: Gemini API呼び出し抽出)
└── [ ] 動作確認
```

**成果物**:
```
src/
├── hooks/
│   ├── useMediaItems.ts
│   ├── useAudioTracks.ts
│   ├── usePlayback.ts
│   ├── useAudioContext.ts
│   ├── useExport.ts
│   └── useAiNarration.ts
```

---

### Phase 4: ユーティリティ分離 (0.5-1日)

**目標**: 共通ユーティリティ関数を分離

**AI活用ポイント**: 純粋関数の自動抽出、単体テスト同時生成

```
タスク:
├── [ ] 時間フォーマット関数 (AI: 自動抽出 + テスト生成)
├── [ ] PCM to WAV 変換関数 (AI: 自動抽出 + テスト生成)
├── [ ] メディア操作ユーティリティ (AI: 自動抽出 + テスト生成)
├── [ ] Canvas 描画ユーティリティ (AI: 自動抽出 + テスト生成)
└── [ ] 動作確認
```

**成果物**:
```
src/
├── utils/
│   ├── format.ts
│   ├── audio.ts
│   ├── media.ts
│   └── canvas.ts
```

---

### Phase 5: 状態管理リファクタリング (1日)

**目標**: 状態管理を Zustand で整理

**AI活用ポイント**: Zustandストア設計自動化、useState→Zustand移行コード自動生成

```
タスク:
├── [ ] Zustand ストア設計 (AI: 既存stateから最適構造提案)
├── [ ] メディアストア (AI: 自動生成)
├── [ ] オーディオストア (AI: 自動生成)
├── [ ] UI ストア (AI: 自動生成)
├── [ ] 既存 useState からの移行 (AI: リファクタリング自動化)
└── [ ] 動作確認
```

**成果物**:
```
src/
├── stores/
│   ├── mediaStore.ts
│   ├── audioStore.ts
│   └── uiStore.ts
```

---

### Phase 6: エラーハンドリング & テスト (1-2日)

**目標**: 堅牢なエラーハンドリングとテスト追加

**AI活用ポイント**: テストコード自動生成、エッジケース自動抽出、モック自動作成

```
タスク:
├── [ ] エラーバウンダリ実装 (AI: ボイラープレート生成)
├── [ ] API エラーハンドリング改善 (AI: try-catch自動追加)
├── [ ] メモリリーク対策 (AI: cleanup関数自動生成)
├── [ ] Vitest セットアップ (AI: 設定自動生成)
├── [ ] ユーティリティ関数のテスト (AI: テストケース自動生成)
├── [ ] フックのテスト (AI: Testing Library活用テスト生成)
└── [ ] 動作確認
```

**成果物**:
```
src/
├── __tests__/
│   ├── utils/
│   └── hooks/
```

---

### Phase 7: 最適化 & 仕上げ (0.5-1日)

**目標**: パフォーマンス最適化と仕上げ

**AI活用ポイント**: 最適化ポイント自動検出、memo/callback自動適用

```
タスク:
├── [ ] React.memo 適用 (AI: 最適化候補自動検出)
├── [ ] useMemo/useCallback 最適化 (AI: 依存配列検証)
├── [ ] 環境変数設定 (.env) (AI: .env.example自動生成)
├── [ ] README 更新 (AI: ドキュメント自動生成)
├── [ ] ビルド最適化 (AI: bundle分析・最適化提案)
└── [ ] 最終動作確認
```

---

## 最終ディレクトリ構造

```
turtle-video/
├── public/
├── src/
│   ├── components/
│   │   ├── common/
│   │   │   ├── Toast.tsx
│   │   │   ├── ErrorMessage.tsx
│   │   │   └── Button.tsx
│   │   ├── media/
│   │   │   ├── MediaResourceLoader.tsx
│   │   │   └── ClipItem.tsx
│   │   ├── sections/
│   │   │   ├── ClipsSection.tsx
│   │   │   ├── BgmSection.tsx
│   │   │   ├── NarrationSection.tsx
│   │   │   └── PreviewSection.tsx
│   │   ├── modals/
│   │   │   └── AiModal.tsx
│   │   ├── Header.tsx
│   │   └── TurtleVideo.tsx
│   ├── hooks/
│   │   ├── useMediaItems.ts
│   │   ├── useAudioTracks.ts
│   │   ├── usePlayback.ts
│   │   ├── useAudioContext.ts
│   │   ├── useExport.ts
│   │   └── useAiNarration.ts
│   ├── stores/
│   │   ├── mediaStore.ts
│   │   ├── audioStore.ts
│   │   └── uiStore.ts
│   ├── utils/
│   │   ├── format.ts
│   │   ├── audio.ts
│   │   ├── media.ts
│   │   └── canvas.ts
│   ├── types/
│   │   └── index.ts
│   ├── constants/
│   │   └── index.ts
│   ├── __tests__/
│   │   ├── utils/
│   │   └── hooks/
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── .env.example
├── .eslintrc.cjs
├── .prettierrc
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── README.md
└── spec.md
```

---

## 想定スケジュール (AI支援開発)

| フェーズ | 期間 | 累計 | AI削減率 |
|----------|------|------|----------|
| Phase 0 | 0.5日 | 0.5日 | 75%削減 |
| Phase 1 | 1日 | 1.5日 | 60%削減 |
| Phase 2 | 1-2日 | 3.5日 | 60%削減 |
| Phase 3 | 1-2日 | 5.5日 | 60%削減 |
| Phase 4 | 0.5-1日 | 6.5日 | 70%削減 |
| Phase 5 | 1日 | 7.5日 | 60%削減 |
| Phase 6 | 1-2日 | 9.5日 | 60%削減 |
| Phase 7 | 0.5-1日 | 10.5日 | 70%削減 |

**合計**: 約7-11日 (実質1.5-2週間)

### 並行作業による更なる短縮

Phase 2-4 は部分的に並行作業可能：
- Phase 2 (コンポーネント分割) と Phase 4 (ユーティリティ) は独立
- Phase 3 (フック) は Phase 2 完了後すぐ開始可能

**最速スケジュール**: 集中作業で約5-7日 (1週間)

---

## 次のステップ

Phase 0 から開始する場合は、以下のコマンドでプロジェクトを初期化します:

```bash
npm create vite@latest turtle-video -- --template react-ts
cd turtle-video
npm install
npm install -D tailwindcss postcss autoprefixer
npm install lucide-react zustand
npm install -D eslint prettier eslint-config-prettier @typescript-eslint/eslint-plugin @typescript-eslint/parser vitest @testing-library/react @testing-library/jest-dom
npx tailwindcss init -p
```

---

## 備考

- 各フェーズ終了時に必ず動作確認を行う
- 既存機能を壊さないことを最優先とする
- 段階的に改善し、一度に大きな変更は避ける
