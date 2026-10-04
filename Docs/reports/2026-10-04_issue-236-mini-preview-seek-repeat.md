# Issue #236: ミニプレビューの5秒ボタン連打後の再生停止

## 概要

再生中に5秒戻る／進むを素早く連打すると、実際の動画と再生時計が止まり、ミニのボタンは一時停止表示のままになる。シーク再開準備中の再生意図を次の操作へ引き継ぎ、最後に確定した位置から再開するよう修正した。

重要度: Major（再生操作の継続を妨げる。保存データへの影響はない）。

## 現象・再現結果

1. 動く映像と音声を持つ60秒の動画を追加し、ミニを開く。
2. 動画要素が実際に再生したことを確認する。
3. 5秒進むを20ms間隔で3回押す。

修正前の実Chromeでは時刻が約15.3161秒になり、1.2秒待っても同じ時刻だった。動画要素は `paused=true`、UIの `isPlaying` はtrue、一時停止ボタンの表示も残っていた。

新しい回帰テストでも、両controllerの連打・交互操作・遅いデコーダで計8件が修正前に失敗した。一時停止／明示停止／iOSの再開禁止を確認する残り6件は修正前も成功した。

## 原因と修正

`handleSeekStart` は既存の再開待機をキャンセルした後、`isPlayingRef` だけをシーク前の再生状態として記録していた。再開準備中はこのrefがfalseであり、次の操作で本来の再生意図をfalseへ上書きしていた。

standard / apple-safari の `usePreviewSeekController.ts` で、待機をキャンセルする前に「実再生中、またはシーク再開準備中」を記録する。その値を次のシークの再開意図として渡す。位置計算は既存の最新 `currentTimeRef` による相対シークと範囲制限を使用する。

明示一時停止・停止・手動クローズ・書き出しで準備を解除した場合は引き継がない。iOS Safariの `TurtleVideo` による自動再開禁止も維持する。UIの再生中表示はシーク中の再生意図を表す既存契約を保ち、操作が落ち着いたら実再生を再開する。

補助Canvas、メディア要素、描画ループ、デバウンスを追加しない。既存の準備待機、キャンセル、世代管理、最終位置からの音声再同期を使用する。

## 検証

- 新規 `src/test/previewSeekResumeIntent.test.tsx`: **14件成功**。両controllerを実際のミニボタンへ接続し、戻る／進む／交互の連打、移動量の累積、再開1回、残留タイマーなし、停止中の操作、準備中の明示停止、遅いシーク、iOSの再開禁止を確認。
- 直接関連の `standardPreviewSeekController`、`timelineWaveformSeekLifecycle`、`floatingPreview` と合わせて **4ファイル41件成功**。
- `npm.cmd run typecheck` / `npm.cmd run build`: 成功。ビルドの既存のchunkサイズ等の警告は残る。
- 全域回帰: **144ファイル、1,831件成功、失敗0件**。初回のIssue #236対応でも除外した既知の失敗／OOMの4ファイルを同じく除外しており、無条件の全テスト成功ではない。今回の変更による新しい失敗はない。

```text
npm.cmd run test:run -- --exclude src/test/turtleVideoExportWiring.test.tsx --exclude src/test/captionStampSilenceNav.test.tsx --exclude src/test/sectionHelpModal.test.tsx --exclude src/test/aiModalPopstate.test.tsx --maxWorkers=2 --reporter=json --outputFile=.tmp/issue236-seek/regression-results.json
```

### 実Chrome（390×844、タッチ有効）

| 操作 | 修正後の結果 |
| --- | --- |
| 進むを20ms間隔で3回 | 約5.3485→10.3485→15.3485秒。1.2秒後16.3299秒へ進み、動画も再生中 |
| 戻るを20ms間隔で3回 | 約11.3299→6.3299→1.3299秒。1.2秒後2.3074秒へ進み、動画も再生中 |
| 進む・戻る・進む | 約7.3074→2.3074→7.3074秒。1.2秒後8.2853秒へ進み、動画も再生中 |
| 連打後すぐ一時停止 | 約18.314秒で停止。1.2秒後も同じ位置、全videoは停止、ボタンは再生表示 |
| 一時停止中に戻るを2回 | 約13.314→8.314秒。1.2秒後も停止状態を保持 |
| 再開準備中に×で閉じる | 約18.553秒で停止。1.2秒後も同じ位置で停止し、ミニは閉じたまま |
| 連打で末尾へ到達 | 60秒へ制限。UIも実再生も停止、再生ボタン表示、進むボタンは無効 |
| Canvas・二重再生 | 同じ320×180のCanvasを維持。再生videoは1本、もう1本は既存キャッシュ |

## レビュー・未確認範囲

- Findings: 指摘なし。既存の準備キャンセル・シーク世代管理・一時停止の優先・最終時刻と音声の再同期を維持する小さな修正。
- Open questions / assumptions: 実ブラウザで確認したのはstandard経路のChrome。apple-safariのcontrollerは自動テストで確認しているが、iPhone／iPad SafariとAndroid実機は未確認。
- 総評: 再生意図を待機キャンセル前に引き継ぐことで連打後の停止と表示のずれを解消し、回帰テストを追加した。
