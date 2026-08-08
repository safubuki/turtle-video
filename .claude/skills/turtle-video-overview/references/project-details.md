# Turtle Video プロジェクト詳細リファレンス

## プロジェクト概要

**Turtle Video（タートルビデオ）**は、ブラウザベースの動画編集アプリケーションです。
React + TypeScript で構築されており、動画・画像のタイムライン編集、BGM・ナレーションの合成、AIナレーション生成機能を備えています。

- **リポジトリ**: `safubuki/turtle-video`
- **ライセンス**: GPL-3.0
- **バージョン管理**: `version.json` で管理（現在バージョン + 前回タグからの差分概要）

## 技術スタック

| カテゴリ | 技術 | バージョン |
|---------|------|-----------|
| フレームワーク | React + TypeScript | React 19 / TS 5.9 |
| ビルドツール | Vite | 7.x |
| スタイリング | Tailwind CSS | 4.x |
| 状態管理 | Zustand | 5.x |
| アイコン | Lucide React | — |
| 動画エンコード | mp4-muxer | — |
| テスト | Vitest + Testing Library | — |
| AI API | Google Gemini API | TTS・スクリプト生成 |
| PWA | vite-plugin-pwa | — |

## ディレクトリ構成

```
turtle-video/
├── public/                  # 静的アセット
├── src/
│   ├── components/          # UIコンポーネント
│   │   ├── common/          # 共通UI (Toast, ErrorBoundary, MiniPreview)
│   │   ├── media/           # メディア関連 (ClipItem, CaptionItem, MediaResourceLoader)
│   │   ├── sections/        # セクション (Clips, BGM, Narration, Caption, Preview)
│   │   ├── modals/          # モーダル (AI, Settings, SaveLoad, CaptionSettings)
│   │   ├── Header.tsx       # ヘッダー
│   │   ├── SwipeProtectedSlider.tsx  # 誤操作防止スライダー
│   │   └── TurtleVideo.tsx  # メインコンポーネント
│   ├── hooks/               # カスタムフック
│   │   ├── useMediaItems.ts       # メディア管理
│   │   ├── useAudioTracks.ts      # 音声トラック管理
│   │   ├── usePlayback.ts         # 再生制御
│   │   ├── useAudioContext.ts     # Web Audio API
│   │   ├── useExport.ts           # 動画エクスポート
│   │   ├── useAiNarration.ts      # AIナレーション
│   │   ├── useAutoSave.ts         # 自動保存
│   │   └── useSwipeProtectedValue.ts  # スワイプ保護
│   ├── stores/              # Zustand ストア
│   │   ├── mediaStore.ts    # メディア状態
│   │   ├── audioStore.ts    # BGM/ナレーション状態
│   │   ├── captionStore.ts  # キャプション状態
│   │   ├── projectStore.ts  # プロジェクト保存・読み込み
│   │   ├── logStore.ts      # ログ管理
│   │   └── uiStore.ts       # UI状態
│   ├── utils/               # ユーティリティ
│   │   ├── format.ts        # フォーマット関数
│   │   ├── audio.ts         # 音声変換
│   │   ├── media.ts         # メディア操作
│   │   ├── canvas.ts        # Canvas描画
│   │   ├── indexedDB.ts     # IndexedDB操作
│   │   └── index.ts         # バレルエクスポート
│   ├── types/               # 型定義
│   │   └── index.ts         # MediaItem, AudioTrack, CaptionItem 等
│   ├── constants/           # 定数
│   │   └── index.ts
│   └── test/                # テスト
│       ├── setup.ts
│       ├── format.test.ts
│       ├── media.test.ts
│       └── stores/          # ストアテスト
├── Docs/                    # ドキュメント
│   └── review/              # Codex向けPRレビュー基準
├── scripts/                 # ビルドスクリプト
├── spec.md                  # 仕様書 & 実装計画
├── version.json             # バージョン管理 + 前回タグからの差分概要
├── index.html               # エントリーHTML
├── vite.config.ts           # Vite設定
├── tsconfig.json            # TypeScript設定
├── tailwind.config.js       # Tailwind設定
└── package.json             # 依存関係・スクリプト
```

## 主要機能

### 1. メディア管理
- 動画・画像の複数アップロード、並べ替え、削除
- クリップ個別ロック / セクション一括ロック

### 2. 動画・画像編集
- トリミング（開始・終了位置）
- プレビュー現在位置から開始点・終了点を設定（再トリミングも現在の有効区間基準）
- プロジェクト全体のサムネイル（ポスター）をプレビューで自動/手動設定（合成後タイムライン基準）
  - 書き出し時に MP4 の cover art（`covr`）埋め込み + 先頭キーフレーム差し替え（標準手法）。**ユーザー実機でエクスプローラー等の動画サムネ表示を成功確認済み**（13-146）
  - 設定後は再書き出しが必要
- クリップ一覧の小サムネは動画ごと自動（有効開始+0.2秒）
- ボリューム調整、ミュート
- フェードイン/アウト（映像・音声）
- スケール調整（0.5倍〜3.0倍）、位置調整（X/Y）
  - クリップ調整パネルのミニプレビュー（`common/MiniPreview`）は**調整スライダーより上**に置く。下だとスマホでスライダーを操作する指がプレビューを隠し、「動かす→結果を見る」で視線も上下に振られるため。キャプション設定のミニプレビューとも配置を揃えている（`clipsSectionPicker.test.tsx` が DOM 順で固定）
- 90度回転（クリップ単位・画像/動画共通。ボタンで 0→90→180→270→0 巡回。縦横入れ替えに対応）
- ぼかし調整（クリップ単位・画像/動画共通。0〜30pxのスライダー、0はぼかしなし。プレビュー/書き出しの解像度へ比例反映）
- 画像の表示時間設定（0.5秒〜60秒）

### 3. BGM・ナレーション
- 音声ファイルのアップロード
- 開始位置（頭出し）、開始タイミング（遅延）
- ボリューム調整、フェードイン/アウト
- 動画尺が変わると BGM の有効再生区間を自動調整（既定 ON・OFF 可。設定区間は保持。尺が戻れば復元。無効 BGM は UI で明示）
- ナレーションのトリミング設定で音量波形を静的表示（Android/PC）。トリム開始/終了を⇔カーソルで可視化し、無音区間（文の区切り）を自動検出してタップで開始/終了へ反映

### 4. AIナレーション（Gemini API）
- テーマからスクリプト自動生成
- テキスト→音声合成（TTS）
- 5種類のAIボイス選択（Aoede, Kore, Puck, Fenrir, Charon）
- 長文原稿の入力中は、縦長の入力欄を確保しつつ、入力欄起点の下スワイプでモーダルが誤って閉じにくいよう保護
- オフラインモード中は AI ナレーション入口と Gemini 通信を止め、設定から OFF に戻す案内を表示
- オフラインモード中は AI 追加/編集ボタンを disabled にし、既存ナレーションの移動・削除・保存はそのまま使える

### 5. キャプション
- テキスト字幕の追加・編集
- スタイル設定（文字サイズ、字体、縁幅、縁色、文字本体色、表示位置、ぼかし）。縁幅はスライダーと数値入力、色はカラーピッカーと16進数入力に対応
- カードごとの個別設定でも文字サイズ、字体、縁幅、縁色、文字本体色、表示位置、ぼかし、フェードを上書き可能。未変更の項目は一括設定を継承
- **文字サイズ・字体・表示位置は一括設定と個別設定モーダルで同じ共有コンポーネントを使う**（`common/CaptionFontSizeField` / `CaptionFontStyleField` / `CaptionPositionField`）
  - 個別設定側は `allowDefaultOption` を立てて先頭に「デフォルト」（＝一括設定を継承）を追加し、値には `null` を渡す
  - 以前は個別設定モーダルが字体 UI を独自実装していたため **丸ゴシック等の固定ボタンが欠落**していた。共有化により一括設定と選択肢が必ず一致する
  - 一括設定・動画タイトルには「デフォルト」が無いため、コールバックでは `null` を弾いて元の setter を呼ぶ
  - **狭い場所は `compact` を渡す**（個別設定モーダル）。「デフォルト」が 1 つ増える分ボタンが多いため、**スマホ幅（md 未満）でだけ**ラベルを短縮（デフォルト→既定 / ゴシック→ゴシ / 丸ゴシック→丸ゴ / 上部→上 / カスタム→任意）し、ラベル列を `w-16`→`w-10` に詰める。360px 端末でも 1 段に収まる
  - **PC（md 以上）では一括設定とまったく同じ表示に戻す**。モーダルを `md:max-w-2xl` へ広げ、ラベル列も `md:w-16` に戻すため、幅に余裕があるのに「ゴシ」のような短縮が出て意味が取れない、という状態にしない
  - 出し分けは `common/ResponsiveButtonLabel` が担う。**両方のラベルを DOM に描いて CSS（`md:hidden` / `hidden md:inline`）で切り替える**方式で、JS のメディアクエリ監視が要らずリサイズ中もチラつかない
  - 表示用の span は `aria-hidden` にし、ボタン側の `aria-label`（常に正式名称）だけがアクセシブル名になる。読み上げ名が「デフォルト既定」と連結するのを防ぎ、位置の「中」がサイズの「中」と同名になる問題も解消する
  - 全ボタンへ `whitespace-nowrap` + `min-w-0 flex-1` を付けて折り返し・はみ出しを防ぐ
  - ミニプレビューは `max-w-sm` に抑え、モーダルが横広になっても画面を占有させない
- **ミニプレビュー（`common/CaptionMiniPreview`）**: 一括設定パネルと個別設定モーダルの両方に表示する、設定確認用の小型プレビュー
  - 背景は**キャプション抜きのフレームを転写**する（再デコードしない）。**メインプレビューの canvas をそのまま使ってはいけない**——キャプションが焼き込まれているため、設定中のキャプションを重ねると文字が二重に見える（サイズ変更で前のサイズが残る／削除した文字が残る）
  - そこで両フレーバーの `usePreviewEngine` がキャプション描画の**直前**に `captureCaptionFreeSnapshot`（`utils/canvas.ts`）でフレームを控える。`captionFreeSnapshotRef` を TurtleVideo → CaptionSection → CaptionItem → CaptionSettingsModal へ渡し、ミニプレビューはこれを優先し、未描画時のみ `previewCanvasRef`（メインプレビュー）へフォールバックする
  - キャプション／キャプション設定／タイトルが変わったら TurtleVideo の effect で `renderFrame` を呼び直す。**停止中は再描画の契機が無く、削除したキャプションがプレビューに残り続ける**ため（この再描画でスナップショットも更新される）
  - キャプションは export と同じ純関数 `drawCaptionLayerFrame` に `preserveBackground: true` を付けて重ねる（背景の塗り潰し／クリアを抑止）。見た目の解決が本番描画と完全に一致する
  - 確認が目的なので、時刻を固定した複製を描き（フェードは常に OFF 扱い）、`settings.enabled` が false でもミニプレビューには描画する
  - 更新はプロパティ変更時の単発描画のみ（rAF ループは回さない。モバイルの負荷対策）
- 新規プロジェクトの既定は黒い縁（キャプション 4px / タイトル 5px）・白い文字本体
- タイムライン上の開始/終了時間設定
- 対象範囲の先頭をプレビュー現在位置へ合わせる一括移動と、秒数指定による前後の微調整（キャプションのみ）
- 動画タイトル（Issue #211）: キャプションとは**別管理**の 1 件だけの設定。キャプションセクション先頭の「タイトル」アコーディオン（初期状態は閉じている）から設定する
  - 既定は中央・通常キャプションより大きい文字（148px @1080p）、表示 0〜4 秒、開始フェード OFF・終了フェード 1 秒
  - 開始/終了はキャプションカードと同じスライダー + 数値入力で設定し、「プレビュー位置を反映: [開始][終了]」で現在位置を取り込める
  - 見た目は「スタイル設定」アコーディオンにまとまっており、サイズ（小/中/大/特大 + カスタム）・字体（その他▾ / PC の全フォント読み込み対応）・位置（上/中央/下 + XY カスタム）・縁の幅と色・文字色・背景の帯（色/濃さ/角丸）を調整できる。サイズと字体はキャプションと同じ UI コンポーネントを共有している
  - キャプション一覧・時分割カード・まとめて入力・タイミング打ち・一括シフトの対象には含まれない
  - 複数行は同時に全行を中央揃えで表示する（キャプションのような時分割はしない）
  - 保存・復元はキャプションとは独立したフィールド（`ProjectData.videoTitle`）。旧保存データは既定値で補完される

### 6. プレビュー & 再生
- Canvas上でのリアルタイムプレビュー
- 再生/一時停止/停止、シークバー
  - **現在位置・総尺とも 1/100 秒まで表示**（`formatTimeCentiseconds`）。「分:秒」だけだと 3.00〜3.99 秒がすべて `0:03` に潰れ、スライダーを動かしても数字が変わらないように見えるため
  - **総尺も必ず同じ桁で出す**。10.5 秒の動画を floor して `0:10` と出すと、終端まで再生したとき現在位置が `0:10.50` となり「現在位置のほうが総尺より大きい」矛盾が起きる。左右の桁は常に揃える
  - 総尺はクリップ尺の**加算**なので浮動小数の誤差が乗る（0.1 秒 ×105 回 = `10.499999999999979`）。`formatTimeCentiseconds` は丸めてから切り捨てるためこれを吸収し `0:10.50` と出る
  - 表示に合わせてシークバーの `step` も `0.1`→`0.01` にする（表示だけ細かくしても、その粒度で動かせないと意味がない）。シーク自体は `SEEK_THROTTLE_MS`(50ms) と `seeked` 完了駆動で間引かれるためデコーダ負荷は増えない
  - 負荷は増えない。`setCurrentTime` は元々 rAF ごと（約 60fps）にフル精度の float で呼ばれており、表示桁を変えても React の再描画回数は変わらない（変わるのは文字列化の整数演算 2 回だけ）
  - 切り捨て（floor）で統一する。四捨五入すると 3.999 秒が `0:04.00` となり、総尺 4 秒の動画で「終端前なのに終端の表示」になる。丸めてから切り捨てることで `formatTimeDetailed` にある浮動小数の桁落ち（90.3→`1:30.2`）も回避している
- タブ復帰時の自動リフレッシュ
- プレビューキャプチャ（現在のフレームをPNG画像として保存）
  - **シークバーの現在位置と保存画像を必ず一致させる**（1 フレームズレ対策）。`utils/previewCaptureFrame.ts` が純ロジック
  - 原因: 通常再生は video を native 再生させたまま `drawImage` するだけで、canvas に載るのは「その瞬間デコーダが持っていたフレーム」。さらに終端では `finalizePreviewAtTimelineEnd` が `currentTime` を**総尺そのもの**へスナップする一方、終端判定は `総尺 - PREVIEW_END_THRESHOLD_SEC`(30ms) で先に発火するため、video は最終フレーム手前で止まっていた
  - 対策の順序: ①`resolveCaptureFrameTarget` で対象クリップと元動画上のソース時刻を解決（終端は `resolveVideoSafeEndSourceTime`）→ ②video を明示シークし `waitForVideoFrameAtTime` でデコード完了まで待つ → ③`renderPausedPreviewFrameAtTimeRef` で再描画 → ④`waitForPreviewFrameSettled` 後に canvas を読む
  - 描画時刻は `resolveCaptureRenderTime` で `総尺 - ε` へ丸める（プレビューの `toDisplayTime` と同じクランプに揃える）
- シークバー直下に全体の音量波形と無音区間を表示（Issue #217・standard フレーバー限定）
  - 波形はシークバーと同じ親コンテナ幅・左右パディングなしで描き、時刻→横位置を常に `t / totalDuration` で決める（両者の左端・右端・現在位置が一直線に揃う）
  - ナレーション + BGM クリップ + **動画クリップの音声**をデコードして 8kHz のモノラルへ落とし、有効再生区間・音量・フェードを反映してタイムラインへ合成（`utils/timelineWaveform.ts` が純ロジック、`hooks/useTimelineWaveform.ts` がデコードとキャッシュ）
  - 動画音声は `decodeAudioData` が MP4/WebM コンテナから音声トラックを取り出せる性質を使う。音声を持たない動画はデコードが失敗するので静かにスキップ（info ログのみ）。**動画だけのプロジェクトでも波形が出る**
  - 動画のタイムライン位置は `computeTransitionTimelineRanges`（ディゾルブのオーバーラップ考慮）、トリムは元動画上の `trimStart`/`trimEnd` を使う。キャッシュキーの尺は `originalDuration`（トリム変更で再デコードしないため）
  - 無音判定はナレーション時分割と同じ `detectSilenceSplitPoints` を共有。検出対象は `SILENCE_SOURCE_PRIORITY`（ナレーション → 動画音声 → BGM → 全体）の順にフォールバックする。既定はナレーション（BGM に埋もれないため）で、動画だけなら動画音声が使われる
  - 波形タップでシーク、`[無音区間：前へ][無音区間：次へ]` で境界へ移動。移動候補は無音区間の開始・終了に加えて**動画の先頭（0秒）・末尾**を含む（`collectSeekBoundaries`）。無音区間が 0 件でも先頭・末尾へは移動できる
  - 同じ 2 ボタンをキャプションの**タイミング打ちバー**にも配置（`-1s` の左と `+1s` の右）。両者が同じ検出結果を使うため、`useTimelineWaveform` は TurtleVideo で 1 度だけ呼び、`TimelineWaveform` へは `waveform` prop としてデータを渡す（コンポーネント内でフックを呼ばない）
  - 移動は `handleSeekToTime`（シークバーと同じ経路）を通り、キャプション時間は変更しない
  - デコード結果はソース識別子でキャッシュし、開始位置・トリム・音量の変更では再合成のみ。生成中も直前の波形を残してプレビュー操作を妨げない
  - iOS Safari は `decodeAudioData` が不安定なため `supportsTimelineWaveform=false` で無効（波形なしで従来どおり動く）

### 7. エクスポート
- MediaRecorder を使用した動画出力
- MP4 / WebM 形式対応
- 出力品質（auto / フルHD / HD）とアスペクト比の向き（16:9 横 / 9:16 縦）を選択可能
  - 向きは「動画・画像」セクションのタイトルバーのトグルで切替（既定は横）。プロジェクトごとに保存/復元される
  - 縦モードではプレビュー・クリップカード・エクスポートがすべて 9:16 になり、横素材は縦フレームを埋める（cover・左右カット）配置＋XY/拡大で微調整

### 8. プロジェクト管理
- 自動保存（設定可能な間隔）
- 手動保存・読み込み（IndexedDB 2スロット方式）
- データ永続化

## 状態管理アーキテクチャ

Zustand を使用し、機能ごとにストアを分離しています。

| ストア | 責務 |
|--------|------|
| `mediaStore` | メディアアイテム（動画・画像）の状態管理 |
| `audioStore` | BGM・ナレーションの状態管理 |
| `captionStore` | キャプションの状態管理 |
| `projectStore` | プロジェクト保存・読み込み管理 |
| `logStore` | ログ管理（エラー・警告・情報） |
| `uiStore` | UI状態（トースト、モーダル、再生状態） |
| `offlineModeStore` | オフラインモードの永続化状態管理（AI 通信・更新確認のガード） |

## 主要な型定義

- `MediaItem`: 動画/画像クリップの全プロパティ（`thumbnailMode` / `thumbnailSourceTime` を含む）
- `AudioTrack`: BGM/ナレーションの共通型
- `CaptionItem`: キャプションアイテム
- `VoiceId` / `VoiceOption`: AIボイスの型

## 開発コマンド

```bash
npm run dev         # 開発サーバー起動
npm run build       # プロダクションビルド (tsc && vite build)
npm run preview     # ビルド結果プレビュー
npm run test        # テスト（ウォッチモード）
npm run test:run    # テスト一回実行
npm run test:coverage  # カバレッジ確認
npm run lint        # ESLint
npm run format      # Prettier
```

## コーディング規約

- TypeScript strict モード使用
- ESLint + Prettier でフォーマット統一
- コンポーネントは `React.memo` で最適化
- 状態管理は Zustand ストアを使用、ローカル状態は最小限に
- 型定義は `src/types/index.ts` に集約
- テストは `src/test/` に配置、Vitest + Testing Library を使用

## AI機能について

Google Gemini API を使用。APIキーは以下の方法で設定：
1. **設定モーダル**（推奨）: ヘッダーの歯車アイコン → APIキータブ
2. **環境変数**: `VITE_GEMINI_API_KEY` を `.env` に設定

## 9. Development Scripts (Media Analyzer)

- `npm run dev:media:setup`: base analysis venv setup
- `npm run dev:media:setup:stt`: base + Whisper STT dependencies (`faster-whisper`) in `.venv-media-analysis`
- `npm run dev:media:setup:stt:models`: install STT deps and prefetch Whisper models (`tiny`, `small`)
- `npm run dev:media:analyze -- -Mode transcribe ...`: speech-to-text extraction for video audio
- `npm run dev:media:cleanup`: remove generated artifacts under `tmp/video-analysis` and `.media-analysis-output`
- `npm run dev:media:cleanup:keep-json`: keep JSON reports and remove other generated artifacts
