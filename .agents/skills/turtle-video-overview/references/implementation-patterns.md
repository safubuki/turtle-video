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

### 2-4. シークバー終端での最終フレーム表示

- **ファイル**: `src/components/TurtleVideo.tsx`（`renderFrame`, `syncVideoToTime`）
- **問題**: シークバーを終端までスライドすると `time === totalDuration` となり、アクティブクリップの検索条件 `time < t + item.duration` を満たさないため黒画面が表示される（通常再生の終端では直前フレームが保持されるため問題なし）
- **対策**:
  - `renderFrame`: アクティブクリップが見つからず `time >= totalDuration` の場合、最後のクリップの最終フレーム（`duration - 0.001`）にフォールバック
  - `syncVideoToTime`: 同様に終端ケースで最後のビデオの最終フレーム位置にシーク
- **注意**: `0.001` のオフセットは最終フレームを確実に表示するための安全マージン。フレーム保持（`holdFrame`）パターンとの組み合わせで黒画面を完全に防止

### 2-5. 停止→再生経路での終端黒フレーム防止

- **ファイル**: `src/components/TurtleVideo.tsx`（`renderFrame`, `loop`, `startEngine`）
- **問題**: 「停止→再生→終端到達」で黒画像が一瞬挟まる。「途中シーク→終端到達」では再現しない
- **原因（完全版）**:
  - **直接原因**: ビデオ要素の内部再生クロックと `Date.now()` ベースのタイムラインクロック（`startTimeRef`）のドリフト。ビデオクロックが僅かに速いと、最終クリップのビデオが `trimEnd`（`= originalDuration`）に先に到達し、ブラウザが `ended` / `paused=true` にする。次の `renderFrame`（`isActivePlaying=true`）で: ① `holdFrame` チェック: `readyState >= 2 && !seeking` = true → `holdFrame = false` ② 黒クリア実行（`shouldGuardNearEnd` は `isActivePlaying=true` で無効） ③ `play()` on ended → HTML仕様によりposition 0へシーク → `seeking=true` ④ 描画チェック `readyState >= 2 && !seeking` → `seeking=true` で描画スキップ → 黒フレーム
  - **シーク操作が防ぐ理由**: シーク後の再生再開（`proceedWithPlayback`）で `startTimeRef` がリベースされ、蓄積ドリフトがリセットされる。残り再生時間が短く、ビデオが先に自然終了する前にタイムライン finalization が到達する
  - （旧原因）`startEngine` に `resetInactiveVideos()` がなかった問題、`loop` 終端分岐後の遅延 `renderFrame` 競合 → 既に対策済
- **対策**:
  - `startEngine` に `resetInactiveVideos()` を追加し、seek 経路と同一の初期化を実施
  - `renderFrame` に `shouldGuardNearEnd` 条件を追加: `!isActivePlaying && time >= totalDuration - 0.1` のとき黒クリアを抑止
  - `endFinalizedRef` フラグ: `finalizeAtEnd()` で設定し、後続の遅延 `renderFrame` による黒クリアを 300ms 間完全に抑止。`startEngine` / `handleStop` / `handleSeekChange` でクリア
  - **`shouldHoldForVideoEnd` ガード（v3.0.6）**: holdFrame チェックで `activeEl.ended` またはビデオの `currentTime >= duration - 0.05` を検出し、タイムライン終端 0.2 秒以内なら `holdFrame = true` にして黒クリアを抑止。これにより `play()` on ended → seeking の連鎖を根本的にブロック
  - **`isEndedNearEnd` play() ガード（v3.0.6）**: forEach 内のアクティブビデオ処理で、ended 状態かつ終端 0.2 秒以内のとき sync と `play()` の両方を抑止。position 0 へのシーク発動自体を防止
  - 終端付近（±0.5秒以内）での黒クリア実行時に診断ログを出力
- **注意**: `shouldGuardNearEnd` は `isActivePlaying=false` のときのみ適用。`shouldHoldForVideoEnd` は `isActivePlaying` の値に関わらずビデオ終了状態を検出。アクティブ再生中のフェードアウト等には影響しない

### 2-6. Android再生中シークの遅延change競合対策

- **ファイル**: `src/components/TurtleVideo.tsx`（`handleSeekChange`, `handleSeekEnd`）
- **問題**: Android でシーク終了（`pointerup`/`touchend`）後に `change` が遅延発火すると、シーク再開準備と競合して `renderFrame(..., false)` が走り、再生のカクつきやブラックアウトが発生する
- **対策**:
  - `handleSeekChange` は `isSeekingRef.current === false` の場合、再生状態を維持したまま `syncVideoToTime(..., { force: true })` で同期する
  - `cancelPendingSeekPlaybackPrepare()` / `cancelPendingPausedSeekWait()` はアクティブなシークセッション中にのみ実行し、遅延 `change` で再開準備を破壊しない
  - `handleSeekEnd` の再生再開時刻は固定値ではなく `currentTimeRef.current` から再取得し、遅延イベントで更新された最終シーク位置を取りこぼさない
- **注意**: シークセッション外イベントで `renderFrame(..., false)` を実行すると、再生中動画を誤って `pause()` しやすい

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

### 9-7. iOS Safari エクスポート安定化

- **ファイル**: `src/hooks/useExport.ts`, `src/components/TurtleVideo.tsx`
- **問題**:
  - iOS Safari で音声トラックが取得できないケースや空バッファ時に、UI が「作成中」のまま復帰しない
  - エクスポート中の時間補正シークで、黒フレームが周期的に混入する
  - iOS Safari では `MediaStreamTrackProcessor` 経由の `masterDest.stream` 音声読み取りが正しく動作しない
  - `needsCorrection` が通常再生時にも `holdFrame` を発動し、iOS Safari で再生がカクつく
  - iOS Safari では `MediaStreamAudioDestinationNode` → `ScriptProcessorNode` 経由のリアルタイム音声キャプチャが root cause として機能しない（ストリーム経由データドロップ、ScriptProcessor メインスレッド競合、iOS 最適化によるノード無効化）
- **対策**:
  - `startExport` に失敗コールバックを追加し、例外・中断・空バッファ時に呼び出し元で `isProcessing` を確実に解除
  - `MediaStreamTrackProcessor` 非対応または iOS Safari では、`VideoFrame(canvas)` による直接キャプチャへフォールバック
  - **muxer と AudioEncoder は常に音声付きで設定**（`audioTrack` の有無に関わらず）
  - **iOS Safari では `OfflineAudioContext` による音声プリレンダリング方式を使用**:
    - エクスポート開始前に全音声ソース（動画音声、BGM、ナレーション）の `File` オブジェクトを **メインAudioContext** の `decodeAudioData` で `AudioBuffer` に変換（OfflineAudioContext上でのビデオコンテナ(MP4)デコード失敗を回避）
    - `OfflineAudioContext` 上で各ソースを `BufferSourceNode` + `GainNode` でタイムライン通りにスケジューリング（音量・フェードイン/アウト含む）
    - `startRendering()` で完全なミックスダウン済み `AudioBuffer` を生成
    - プリレンダリング済みバッファを **`f32-planar` 形式**の `AudioData` チャンクに分割し、`AudioEncoder` に直接供給（AudioBufferのネイティブ形式であり、iOS Safari AudioEncoderとの互換性が高い）
    - これにより `ScriptProcessorNode`、`MediaStreamAudioDestinationNode`、リアルタイム同期を完全に回避
    - **診断ログ**: レンダリング後の振幅チェック、AudioEncoder出力チャンクカウンタ、flush前後の状態ログを出力
  - **iOS Safari の `decodeAudioData` はビデオコンテナ(.mov/.mp4)のデコードに非対応**（`EncodingError: Decoding failed`）。音声専用ファイル(.mp3/.m4a/.wav)は正常にデコードできる
  - **ビデオコンテナのデコード失敗時のフォールバック**: `extractAudioViaVideoElement()` 関数で `<video>` 要素 → `MediaElementAudioSourceNode` → `ScriptProcessorNode` 経由のリアルタイム音声抽出を行う。動画の長さと同程度の時間がかかるが確実に動作する
  - **エクスポートのタイミング制御**: `ExportAudioSources.onAudioPreRenderComplete` コールバックにより、音声プリレンダリング（リアルタイム抽出含む）が完了した後にビデオキャプチャ用の再生ループを開始する。これにより、音声抽出とビデオエンコードのタイミング競合を回避。TurtleVideo.tsx の `startEngine` でエクスポートモード時は `loop()` をコールバック内で呼び出す
  - **startTimeRef のリセット（v3.0.5）**: `onAudioPreRenderComplete` コールバック内で `startTimeRef.current = Date.now() - fromTime * 1000` を再セットする。リアルタイム音声抽出に費やした時間（動画の長さと同等）だけ `startTimeRef` が古くなり、`loop()` の `elapsed` 計算で即座に `elapsed >= totalDuration` となりループが0フレームで終了する問題を防止
  - OfflineAudioContext 失敗時は従来の ScriptProcessorNode 方式にフォールバック
  - `renderFrame` で「補正シークが必要なフレーム」を事前に `holdFrame` 扱いにし、黒クリアを回避（**エクスポート時のみ適用、通常再生には影響させない**）
  - iOS Safari のエクスポート時は動画同期しきい値を緩和（通常 0.5 秒 / Safari エクスポート時 1.2 秒）
  - iOS Safari の通常再生時は同期しきい値を 1.0 秒に緩和し、過剰なシークによるカクつきを防止
- **注意**:
  - クリップ切替直後のみ厳密同期（0.05 秒）を維持し、それ以外は過剰なシークを避ける
  - `OfflineAudioContext` はリアルタイムではなく最大速度でレンダリングするため、メインスレッド負荷の影響を受けない
  - `decodeAudioData` が失敗した音声ソース（画像アイテム、音声トラックなし等）は自動的にスキップ（各ソースのデコード成否をログ出力）
  - フェード時間の重複（短いクリップ）は按分で自動クランプ
  - BGM/ナレーションのフェードアウトはプロジェクト終端からの相対位置で計算

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

## 11. PC / タブレット レスポンシブ対応

### 11-1. デスクトップアダプティブ戦略

- **原則**: モバイル（<768px）は一切変更せず、`md:` / `lg:` ブレイクポイントでのみPC/タブレット向けスタイルを追加
- **レイアウト**: `TurtleVideo.tsx` で `lg:grid lg:grid-cols-[1fr_480px]` による2カラムレイアウト（左: 編集コントロール、右: スティッキープレビュー）
- **コンテナ幅**: `max-w-md md:max-w-3xl lg:max-w-6xl` でビューポートに応じて拡大
- **注意**: 新しいコンポーネントを追加する場合は、モバイルファーストのスタイルを書き、必要に応じて `md:` / `lg:` レスポンシブバリアントを追加

### 11-2. テキスト・UIスケーリング

- **テキスト**: `text-[10px] md:text-xs`、`text-xs md:text-sm`、`text-sm md:text-base` のパターンで段階的に拡大
- **ボタン**: `px-3 py-1.5 lg:px-4 lg:py-2` でタッチターゲット拡大
- **アイコン**: `w-5 h-5 lg:w-6 lg:h-6` で視認性向上
- **スライダー**: `index.css` の `@media` クエリでトラック・サムのサイズを自動拡大
- **注意**: `index.css` に `@media (min-width: 768px)` / `@media (min-width: 1024px)` でグローバルなスライダー・スクロールバーの拡大ルールあり

### 11-3. 画面向き制御

- **ファイル**: `src/hooks/useOrientationLock.ts`
- **対策**: `window.innerWidth >= 768` の場合は向き固定をスキップし、タブレットの横画面使用を許可
- **注意**: スマホ（<768px）のみ `portrait` ロックを適用

---

## 横断的な注意点まとめ

| カテゴリ | 注意点 |
|---------|--------|
| **AudioContext** | `suspended` → `resume()` はユーザージェスチャーが必要。必ず `catch` する |
| **ObjectURL** | 作成したら必ず `revokeObjectURL` で解放。特にリストア時の古い URL に注意 |
| **Canvas** | `display: none` の video からは描画不可。`opacity: 0.001` で隠す |
| **WebCodecs** | `VideoFrame` は `close()` しないとメモリリーク。CFR 強制が重要 |
| **Safari Export** | iOS Safari では OfflineAudioContext による音声プリレンダリング方式を使用。メインAudioContextで`decodeAudioData`を実行し、`f32-planar`形式のAudioDataをAudioEncoderに直接供給する。**重要**: iOS Safari の `decodeAudioData` はビデオコンテナ(.mov/.mp4)をデコードできない（`EncodingError`）ため、`extractAudioViaVideoElement()` で `<video>` 要素経由のリアルタイム音声抽出にフォールバックする。muxer/AudioEncoder は常に音声付きで初期化。OfflineAudioContext 失敗時は ScriptProcessorNode にフォールバック |
| **タブ切替** | `visibilitychange` で復帰時に Canvas を再描画、メディアをリロード |
| **モバイル** | スライダー誤操作を `useSwipeProtectedValue` で防止。`playsInline` 必須 |
| **レスポンシブ** | モバイル既存スタイルは変更禁止。`md:` / `lg:` バリアントのみ追加で対応 |
| **IndexedDB** | `File → ArrayBuffer → File` のラウンドトリップが必要。大容量データに注意 |
| **Zustand** | `getState()` で React 外アクセス可能。Ref+State 並行管理でリアルタイム値と再レンダリングを両立 |
| **再生ループ** | `loopIdRef` で世代管理。古いループの自動停止メカニズムが重要 |
| **シーク終端** | `time >= totalDuration` で最終クリップにフォールバックし黒画面を防止 |
| **停止→再生終端** | `startEngine` で `resetInactiveVideos()` を実行、`shouldGuardNearEnd` + `endFinalizedRef` で非アクティブ描画の黒クリア抑止、`shouldHoldForVideoEnd` でビデオ自然終了時の holdFrame 強制、`isEndedNearEnd` で ended ビデオへの play()/sync 抑止 |
| **キャプチャ** | 再生中は一時停止してからCanvasをキャプチャ。ObjectURLは`setTimeout`で解放 |
| **エラー** | 3 層防御: ErrorBoundary（コンポーネント）、グローバルハンドラ（window）、try-catch（個別処理） |

## 12. Dev Script Pattern (media-video-analyzer STT)

### 12-1. Whisper STT in dedicated venv

- **Files**: `scripts/dev/setup-media-analysis-env.ps1`, `scripts/dev/run-media-analysis.ps1`, `scripts/dev/analyze-video.py`, `scripts/dev/requirements-media-analysis-stt.txt`
- **Behavior**:
  - Keep STT dependencies optional via setup flag `-WithStt`.
  - Provide npm shortcut `npm run dev:media:setup:stt`.
  - `run-media-analysis.ps1` forwards STT args to analyzer for `-Mode transcribe`.
  - `analyze-video.py` uses provider fallback order: `faster-whisper` -> `openai-whisper`.
- **Caution**:
  - Install STT dependencies only after explicit user approval.
  - STT model download can require network and extra time; report this before execution.

### 12-2. Whisper model prefetch + blocked proxy guard

- **Files**: `scripts/dev/setup-media-analysis-env.ps1`, `scripts/dev/prefetch-whisper-models.py`, `package.json`
- **Behavior**:
  - Add `-PrefetchSttModels` and `-SttModels` to setup script for proactive model caching (`tiny`, `small`).
  - Add npm shortcut `npm run dev:media:setup:stt:models`.
  - Setup script temporarily disables only blocked loopback proxy values (`127.0.0.1:9`, `localhost:9`, `::1:9`) for install/prefetch commands and restores environment variables afterwards.
- **Caution**:
  - Guard is intentionally narrow; valid corporate proxies are left unchanged.
  - Prefetch still requires network access and can take time on first run.

### 12-3. Media analysis artifact cleanup policy

- **Files**: `scripts/dev/cleanup-media-analysis-artifacts.ps1`, `package.json`, `Docs/developer_guide.md`
- **Behavior**:
  - Provide `npm run dev:media:cleanup` to remove generated files under `tmp/video-analysis` and `.media-analysis-output`.
  - Provide `npm run dev:media:cleanup:keep-json` to keep only `*.json` reports in `tmp/video-analysis`.
  - Treat extracted audio and frame image dumps as disposable artifacts by default.
- **Caution**:
  - Keep JSON reports when evidence or review records are required.
  - Removing artifacts does not affect app runtime; they are developer-only outputs.

### 12-4. Issue CLI local gh fallback

- **Files**: `scripts/create-github-issue.mjs`, `.tools/gh/bin/gh.exe`, `Docs/github_issue_workflow.md`
- **Behavior**:
  - `issue:create` uses `gh` from `PATH` first.
  - If not found, it falls back to local bundled CLI at `.tools/gh/bin/gh.exe` (Windows).
  - Authentication remains required (`gh auth login` or `GH_TOKEN`).
- **Caution**:
  - `.tools/gh/LICENSE` should be kept together with bundled `gh.exe`.
  - Without authentication, issue creation fails even when `gh` binary is available.

### 12-5. Skills sync symlink preservation

- **Files**: `scripts/sync-skills.mjs`, `.github/skills/skills-sync-guard/scripts/safe-sync-skills.mjs`
- **Behavior**:
  - `Dirent.isFile()` だけではなく `Dirent.isSymbolicLink()` も同期対象・監査対象に含める。
  - 差分判定ハッシュは、通常ファイルは内容ハッシュ、symlink は `readlink()` のリンク先文字列を使う。
  - `latest` / `base` の両戦略で symlink を欠落させずに同期する。
- **Caution**:
  - symlink をハッシュ対象から外すと `hasDiff=false` となり、必要な同期がスキップされる可能性がある。
  - symlink を `stat/readFile` 前提で扱うと、リンク先の変更検知が不正確になる。
