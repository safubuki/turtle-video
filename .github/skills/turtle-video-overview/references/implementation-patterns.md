# Turtle Video 実装パターン・注意点リファレンス

本プロジェクトに組み込まれている実装パターン・ワークアラウンド・注意すべきポイントを網羅的にまとめたドキュメントです。新機能の追加や既存コードの変更時に必ず確認してください。

---

## 1. スクロール/スワイプ誤操作防止

### 1-1. モーダル表示時のボディスクロールロック

- **ファイル**: `src/hooks/useDisableBodyScroll.ts`
- **問題**: モーダル表示中に背景がスクロールする（特にモバイル）
- **対策**:
  - `body.style.overflow = 'hidden'` + `position: fixed` + `top: -scrollY`
  - クリーンアップ時に `window.scrollTo({ behavior: 'instant' })` で元の位置に復帰
- **注意**: `position: fixed` にすると元のスクロール位置がリセットされるため、`top: -scrollY` で視覚的な位置を保持する必要がある

### 1-2. スライダーのスワイプ保護（モバイル誤操作防止）

- **ファイル**: `src/hooks/useSwipeProtectedValue.ts`, `src/components/SwipeProtectedSlider.tsx`
- **問題**: モバイルで縦スクロール中にスライダーに指が触れて値が変わる
- **対策**:
  - `onTouchStart` → `onTouchMove` で `deltaX` vs `deltaY` を比較し方向を判定
  - 縦移動 > 横移動 → 縦スクロールと判断しスライダーの値をリセット
  - 80ms 未満のタッチは「通りすがりタップ」としてリセット
- **注意**: 方向判定は一度決めたら変更されない（`directionDecidedRef`）。閾値は `minMovement=15px`, `minTouchDuration=200ms`

---

## 2. ブラックアウト対策・表示復帰

### 2-1. タブ復帰時の Canvas 自動リフレッシュ

- **ファイル**: `src/components/TurtleVideo.tsx`
- **問題**: タブ切り替え後に Canvas が黒画面のまま
- **対策**:
  - `visibilitychange` イベントで Page Visibility API を監視
  - `document.visibilityState === 'visible'` で `requestAnimationFrame(() => renderFrame(...))` を実行
  - `readyState < 2` のメディア要素には `element.load()` で再読み込み
- **注意**: `visibilitychange` リスナーのクリーンアップを必ず行う

### 2-2. メディアリソースの可視配置（display: none 回避）

- **ファイル**: `src/components/media/MediaResourceLoader.tsx`
- **問題**: `display: none` にするとブラウザがビデオのデコードを停止する
- **対策**: `opacity: 0.001`, `position: fixed`, `zIndex: -100`, `pointerEvents: 'none'` で視覚的に隠しつつ、ブラウザにはレンダリング対象として認識させる
- **禁止**: `display: none` や `visibility: hidden` は使わない

### 2-3. メディア読み込みエラー時の自動リトライ

- **ファイル**: `src/components/media/MediaResourceLoader.tsx`
- **対策**: `onerror` 時に `setTimeout(() => el.load(), 1000)` で 1 秒後に再読み込み

---

## 3. AudioContext 管理

### 3-1. 遅延初期化 + ユーザージェスチャー要件

- **ファイル**: `src/hooks/useAudioContext.ts`, `src/utils/audio.ts`
- **問題**: AudioContext は Autoplay Policy によりユーザージェスチャー後でないと `resume()` できない
- **対策**:
  - `window.AudioContext || window.webkitAudioContext` でクロスブラウザ対応（Safari）
  - 初回呼び出し時にのみ AudioContext を作成（遅延初期化）
  - `ctx.state === 'suspended'` チェック後に `ctx.resume()`（必ず `.catch()` する）
- **注意**: メディアアップロード時やエンジン起動時に `resume()` を呼ぶ

### 3-2. SourceNode の重複防止

- **ファイル**: `src/components/TurtleVideo.tsx`, `src/hooks/useAudioContext.ts`
- **問題**: `createMediaElementSource()` を同じ要素に2回呼ぶとエラー
- **対策**: `sourceNodesRef.current[id]` で存在チェックし、既存のノードを再利用
- **注意**: 一度 `createMediaElementSource()` した要素は他の AudioContext で使えない

### 3-3. オーディオルーティング切替（再生 vs エクスポート）

- **ファイル**: `src/hooks/useAudioContext.ts`
- **対策**: `configureAudioRouting(isExporting)` で GainNode の接続先を `ctx.destination`（通常再生）/ `masterDest`（エクスポート）に切り替え

---

## 4. メモリ管理

### 4-1. ObjectURL の確実な解放

- **ファイル**: `src/utils/media.ts`, `src/stores/mediaStore.ts`, `src/stores/audioStore.ts`, `src/stores/uiStore.ts`
- **問題**: `URL.createObjectURL()` で作成した URL はメモリリークの原因
- **対策**:
  - `revokeObjectUrl()` ユーティリティで安全に解放（null/undefined チェック + try-catch）
  - メディア削除時、全クリア時、リストア時（既存 URL を先に解放）、エクスポート URL 更新時
- **注意**: `restoreFromSave` 時は「既存の」URL を先に解放してから新しいアイテムを設定する

### 4-2. AudioContext / MediaRecorder のクリーンアップ

- **ファイル**: `src/components/TurtleVideo.tsx`
- **対策**: `useEffect` のクリーンアップで `cancelAnimationFrame`、`audioCtx.close()`、`recorder.stop()`、全メディア要素の `pause()` を実行
- **注意**: 各操作を個別の `try-catch` で包み、1 つの失敗が全体のクリーンアップを阻害しないようにする

### 4-3. エクスポート中断時の AbortController

- **ファイル**: `src/hooks/useExport.ts`
- **対策**: `AbortController` + `videoReaderRef` / `audioReaderRef` を保持し、`stopExport()` で `abort()` + `reader.cancel()`

### 4-4. メモリ使用量の定期監視

- **ファイル**: `src/stores/logStore.ts`, `src/components/TurtleVideo.tsx`
- **対策**: 10 秒間隔で `performance.memory`（Chrome 限定）からヒープ使用量を取得・記録

---

## 5. エラーハンドリング（3層防御）

### 5-1. ErrorBoundary（コンポーネント層）

- **ファイル**: `src/components/common/ErrorBoundary.tsx`
- **対策**: クラスコンポーネントで `getDerivedStateFromError` + `componentDidCatch`。「再試行」と「リロード」の 2 段階リカバリ。`import.meta.env.DEV` で開発時のみ詳細表示

### 5-2. グローバルエラーハンドラ（window 層）

- **ファイル**: `src/main.tsx`
- **対策**: `window.addEventListener('error', ...)` + `unhandledrejection` で未捕捉エラーを `logStore` に記録

### 5-3. エラーメッセージの重複集約

- **ファイル**: `src/stores/uiStore.ts`
- **対策**: 同じメッセージはカウントインクリメント、`ErrorMessage` で「(N件)」表示。10 秒後に自動消去

### 5-4. ログの重複抑制

- **ファイル**: `src/stores/logStore.ts`
- **対策**: `DUPLICATE_SUPPRESS_MS = 10000` で 10 秒以内の同一キー（level+category+message）のログを抑制

---

## 6. パフォーマンス最適化

### 6-1. React.memo の適用

- **適用**: `ErrorMessage`, `Toast`, `MiniPreview`, `ClipItem`, `CaptionItem`, `PreviewSection`, `ClipsSection`, `BgmSection`, `NarrationSection`, `CaptionSection`, `SettingsModal`, `Header`
- **注意**: 新しいコンポーネントを作成したら、必要に応じて `React.memo` の適用を検討する

### 6-2. カスタム比較関数付き memo

- **ファイル**: `src/components/media/MediaResourceLoader.tsx`
- **問題**: トリミング等のプロパティ変更で DOM 要素を再作成したくない
- **対策**: `memo(Component, (prev, next) => prev.item.id === next.item.id && prev.item.url === next.item.url)` で URL と ID 以外の変更を無視

### 6-3. MiniPreview の描画最適化

- **ファイル**: `src/components/common/MiniPreview.tsx`
- **対策**:
  - `IntersectionObserver` で画面外のプレビューは描画しない
  - ビデオ再生中は約 15fps（66ms 間隔）でスロットリング
  - `itemRef` パターンで `useCallback` 依存から `item` を除外し関数再生成を防止

### 6-4. 再生/一時停止のデバウンス

- **ファイル**: `src/components/TurtleVideo.tsx`
- **対策**: `lastToggleTimeRef` で 200ms 以内の連続クリックを無視

### 6-5. シークのスロットリング

- **ファイル**: `src/components/TurtleVideo.tsx`
- **対策**: `lastSeekTimeRef` + `pendingSeekRef` で高頻度のシーク操作を間引く

### 6-6. 次のビデオのプリロード

- **ファイル**: `src/hooks/usePlayback.ts`
- **対策**: アクティブクリップの残り時間が 1.5 秒未満になったら、次のビデオの `currentTime` を `trimStart` 位置に設定

---

## 7. モバイル / レスポンシブ対応

### 7-1. 画面向き固定

- **ファイル**: `src/hooks/useOrientationLock.ts`
- **対策**: `screen.orientation.lock(orientation)` で固定。PC や非対応ブラウザではエラーを黙殺
- **注意**: クリーンアップ時のアンロックは**意図的に行わない**（アプリに戻った時も固定を維持）

### 7-2. playsInline 属性

- **ファイル**: `src/components/media/MediaResourceLoader.tsx`
- **問題**: iOS Safari ではデフォルトでビデオがフルスクリーン再生になる
- **対策**: `<video playsInline>` 属性を必ず付与

---

## 8. データ永続化

### 8-1. IndexedDB によるプロジェクト保存

- **ファイル**: `src/utils/indexedDB.ts`
- **対策**: Promise ベースのラッパー。`'auto'` / `'manual'` の 2 スロット方式
- **注意**: `request.onerror` と `request.onsuccess` の両方ハンドリングが必要。トランザクション後に `db.close()`

### 8-2. メディアファイルのシリアライズ

- **ファイル**: `src/stores/projectStore.ts`, `src/utils/indexedDB.ts`
- **問題**: `File` オブジェクトや Blob URL はそのまま IndexedDB に保存できない
- **対策**: 保存時 `File → ArrayBuffer`、復元時 `ArrayBuffer → File → URL.createObjectURL()`
- **注意**: ArrayBuffer は大容量になり得る。`getStorageEstimate()` で容量確認可能

### 8-3. 自動保存（変更検知付き）

- **ファイル**: `src/hooks/useAutoSave.ts`
- **対策**: メディア ID・音量・トリム値等を連結したハッシュで変更検知。空データ時とエクスポート中はスキップ
- **注意**: エクスポート中（`isProcessing`）は保存をスキップ（動画品質保護）

### 8-4. ページ離脱防止

- **ファイル**: `src/hooks/usePreventUnload.ts`
- **対策**: `beforeunload` イベントで `e.preventDefault()` + `e.returnValue` 設定（複数ストアのデータ有無を確認）

---

## 9. メディアハンドリング

### 9-1. WebCodecs + mp4-muxer による MP4 エクスポート

- **ファイル**: `src/hooks/useExport.ts`
- **対策**:
  - `VideoEncoder`（H.264 Main Profile）+ `AudioEncoder`（AAC-LC）
  - **CFR 強制**: フレームインデックスからタイムスタンプを再計算し、VFR による再生速度問題を回避
  - `VideoFrame` は `close()` しないとメモリリーク
- **注意**: `recorderRef.current` にダミー MediaRecorder を設定（既存コードとの後方互換性）

### 9-2. Canvas 描画パイプライン

- **ファイル**: `src/hooks/usePlayback.ts`, `src/utils/canvas.ts`
- **対策**: 毎フレーム黒塗りクリア → `drawImage` → フェードアルファ適用。`ctx.save()/restore()` でトランスフォームを安全に管理
- **注意**: `ctx.globalAlpha` を描画後に `1.0` に戻す必要がある

### 9-3. ビデオ同期制御

- **ファイル**: `src/hooks/usePlayback.ts`
- **対策**: 再生中は `0.8 秒` 以上ズレた場合のみシーク（頻繁なシークを回避）。停止中は `0.01 秒` のより厳密な閾値

### 9-4. 再生開始時のビデオ準備待機

- **ファイル**: `src/components/TurtleVideo.tsx`
- **対策**: `canplay` イベント（readyState >= 3）を `{ once: true }` で待機。1 秒タイムアウトのフォールバック
- **注意**: `canplaythrough` ではなく `canplay` を使用（長い動画では `canplaythrough` が発火しない場合がある）

### 9-5. 再生ループの世代管理

- **ファイル**: `src/components/TurtleVideo.tsx`
- **問題**: 複数の再生ループが同時に走ると競合
- **対策**: `loopIdRef` をインクリメントし、各ループが自身の ID を検証。不一致なら自動終了

### 9-6. GainNode によるボリューム / フェード制御

- **ファイル**: `src/hooks/usePlayback.ts`
- **対策**: `gain.setTargetAtTime(vol, ctx.currentTime, 0.05)` でスムーズなボリューム遷移。非アクティブ要素は即座にミュート

---

## 9.5. プレビューキャプチャ

### 9.5-1. CanvasフレームのPNGキャプチャ

- **ファイル**: `src/utils/canvas.ts` (`captureCanvasAsImage`), `src/components/TurtleVideo.tsx` (`handleCapture`), `src/components/sections/PreviewSection.tsx`
- **機能**: プレビューの現在のフレームをPNG画像としてダウンロード
- **対策**:
  - 再生停止中: 現在のCanvas内容をそのまま `canvas.toBlob('image/png')` でキャプチャ
  - 再生中: 先に `stopAll()` + `pause()` で一時停止し、現在のフレームをキャプチャ
  - `URL.createObjectURL(blob)` で一時URLを生成し、`<a>` 要素のクリックでダウンロードをトリガー
  - ObjectURLは `setTimeout(() => URL.revokeObjectURL(url), 1000)` で確実に解放
- **ファイル名规則**: `turtle_capture_{time}_{timestamp}.png`（例: `turtle_capture_1m30s_1738900000000.png`）
- **UI**: PreviewSectionの再生コントロール横にCameraアイコンボタンを配置
- **注意**: エクスポート中（`isProcessing`）はキャプチャ不可。メディアがない場合も無効

## 10. 状態管理パターン

### 10-1. ストアの責務分離

| ストア | 責務 |
|--------|------|
| `mediaStore` | 動画・画像クリップの状態管理 |
| `audioStore` | BGM・ナレーションの状態管理 |
| `captionStore` | キャプションの状態管理 |
| `uiStore` | UI 状態（Toast、エラー、再生、エクスポート、AI モーダル） |
| `projectStore` | プロジェクト保存・読み込み管理 |
| `logStore` | ログ管理（エラー・警告・メモリ監視） |

### 10-2. ストア間の協調

- フック内で複数ストアのセレクタを使ってデータを集約
- ストア間の直接依存（import）は避け、**フック層で統合**する
- React 外からは `useXxxStore.getState().action()` でアクセス可能

### 10-3. Ref + State 並行管理

- **ファイル**: `src/components/TurtleVideo.tsx`
- **問題**: `useState` は非同期更新のため、再生ループ内で最新値が取れない
- **対策**: `currentTimeRef`, `isPlayingRef` 等の `useRef` でリアルタイム値を保持し、UI 再レンダリング用に `useState` も並行更新

### 10-4. 保存復元パターン（restoreFromSave）

- 全ストアに `restoreFromSave()` アクションを持たせ、保存データから状態を復元
- **復元前に既存 URL を `revokeObjectUrl` で解放**
- `totalDuration` も `calculateTotalDuration(items)` で再計算

### 10-5. ログの sessionStorage 永続化

- **ファイル**: `src/stores/logStore.ts`
- ページリロードでもログを保持。`MAX_LOG_ENTRIES = 500` でサイズ制限

---

## 横断的な注意点まとめ

| カテゴリ | 注意点 |
|---------|--------|
| **AudioContext** | `suspended` → `resume()` はユーザージェスチャーが必要。必ず `catch` する |
| **ObjectURL** | 作成したら必ず `revokeObjectURL` で解放。特にリストア時の古い URL に注意 |
| **Canvas** | `display: none` の video からは描画不可。`opacity: 0.001` で隠す |
| **WebCodecs** | `VideoFrame` は `close()` しないとメモリリーク。CFR 強制が重要 |
| **タブ切替** | `visibilitychange` で復帰時に Canvas を再描画、メディアをリロード |
| **モバイル** | スライダー誤操作を `useSwipeProtectedValue` で防止。`playsInline` 必須 |
| **IndexedDB** | `File → ArrayBuffer → File` のラウンドトリップが必要。大容量データに注意 |
| **Zustand** | `getState()` で React 外アクセス可能。Ref+State 並行管理でリアルタイム値と再レンダリングを両立 |
| **再生ループ** | `loopIdRef` で世代管理。古いループの自動停止メカニズムが重要 |
| **キャプチャ** | 再生中は一時停止してからCanvasをキャプチャ。ObjectURLは`setTimeout`で解放 |
| **エラー** | 3 層防御: ErrorBoundary（コンポーネント）、グローバルハンドラ（window）、try-catch（個別処理） |
