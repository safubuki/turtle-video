# 動画エクスポート早送り・後半黒画面 ポストモーテム（2026-07-27）

## 結論と対応状況

Windows 11 / Edge 150 の standard export で発生していた「MP4の映像内容だけが早送りされ、約24秒以降は黒画面、音声は39.64秒まで正常」という問題は、VideoEncoder backpressure 中だけ壁時計タイムラインと共有 `<video>` を同時停止する対策（implementation-patterns 13-153）で解消した。

**2026-07-27、ユーザー実機で同一条件の再エクスポートを行い、問題が完全に解消したことを確認済み。必須の残作業はない。**

## 再現条件と観測事実

- 環境: Windows 11 / Edge 150 / RAM 16GB / 12コア
- 出力: HD（1280×720）/ 30fps
- タイムライン: 画像1枚（0〜4秒）+ 動画1本（4〜39.64秒）
- 素材動画: 1920×1080 / 映像35.64秒 / 音声35.63秒
- プレビューは滑らかで、エクスポートだけが高確率で失敗
- MP4の`stts`/`ctts`は1190フレームの正常なCFRで、PTSの巻き戻り・大きなギャップなし
- `stsz`の1秒平均は24秒以降が約1660bytesで平坦化し、映像内容が静止/黒になった位置を特定
- rAFは平均16.7ms（約60fps）、Canvas描画は平均0.5ms、`VideoEncoder.encode()`呼び出しは平均0.02ms
- 完了前の`videoEncoder.encodeQueueSize`は89（HARD上限90）
- `submittedFrames`は1190で総枚数だけは一致していた

ここで重要なのは、**コンテナのフレーム枚数・timestampが正しいことと、各フレームへ正しい時刻の映像内容が描かれていることは別問題**という点である。

## 真因

standard のCanvas直接キャプチャ経路には、次の3つの時計が存在する。

1. 壁時計から進むexportタイムライン
2. 実時間で再生する`HTMLVideoElement.currentTime`
3. `VideoEncoder`へ正常投入できた枚数から進むMP4の出力スロット

エンコーダーの実消化が30fpsを下回りキューがHARD上限へ達すると、旧実装は3のフレーム投入だけを止め、1と2は進め続けていた。そのため、タイムライン終端時点で出力スロットは映像内容より約15秒遅れ、完了要求後の残りスロットを、既に素材末尾へ到達した黒いCanvasで埋めていた。

`tailFilledFrames: 0`だったのは異常が無かったからではない。Canvas直接経路の完了後補完だけ診断カウンタへ加算されていなかったためで、対策時に計測も修正した。

## 失敗した対策と、なぜ失敗したか

| 対策 | 結果 | 破綻理由 |
|---|---|---|
| 壁時計タイムラインを1ティック1フレームへ減速 | 改善は約1.93秒だけ | rAF側の進め方を変えても、根因であるEncoderキュー飽和時の`<video>`と出力スロットの分離を止めていなかった |
| 動画を含むexportもフレーム投入枚数駆動へ変更 | 数秒単位で進む/戻る出力へ悪化 | タイムラインだけが遅くなり、`<video>`は実時間で先行。`needsCorrection`が毎フレーム巻き戻しseekを行い、再バッファ→投入停止→さらに遅延の悪循環になった |
| Canvas描画直後にシンクで同期投入 | 1秒以降ほぼ静止/黒へ悪化 | 描画駆動の`frameIndex`と時刻駆動の`exportFrameIndex`を別々に進め、描画時刻と投入先スロットがずれた |
| 他タブ/アプリ終了、PC再起動、丁寧な停止操作 | 効果なし | 一時的な負荷ではなく、キュー飽和時の時計同期という構造上の欠陥だった |

### 調査上の失敗

- `exportFrameIndex`も壁時計由来なのに、番号が連番であることを「等速描画」の証拠と誤読した
- `1190フレーム ÷ 57秒`をrAF速度と誤読した。実際のrAFは約60fpsだった
- flush前の`videoEncoderOutputFrames`を欠落と誤認した
- `tailFilledFrames`がCanvas直接経路を数えていないことを見落とした
- `export-quality-regression-2026-03-27.md`の動画フレーム駆動差し戻し履歴を十分に重視しなかった
- 実機で仮説を検証できないまま、挙動変更を連続して投入した

## 成功した対策

- VideoEncoderキューがHARD上限へ達したときだけ`onVideoEncoderBackpressureChange(true)`を通知する
- SOFT上限までdrainする間、共有`<video>`をpauseし、rAFは維持したままタイムライン更新とCanvas描画を止める
- drain完了時、待機時間を`startTimeRef`へ加算し、壁時計の原点から待機時間を除外する
- 連続したタイムライン位置から既存のnative video再生経路で再開する
- 動画を含むstandard exportだけに限定し、画像のみのフレーム駆動、apple-safari、通常previewへ波及させない
- Canvas直接経路の完了後補完も`tailFilledFrames`へ加算する

## なぜ成功したか

1. **3つの時計を同じ区間だけ止めた**  
   Encoderが受け取れない間に、壁時計と`<video>`だけが先行しなくなった。

2. **動画の通常再生モデルを捨てなかった**  
   export全体をフレーム駆動にせず、通常時は既存の壁時計+native video再生を維持したため、連続seekによる再バッファを起こさなかった。

3. **実際のbackpressureだけを条件にした**  
   rAF、描画時間、PC負荷などの間接指標ではなく、`videoEncoder.encodeQueueSize`という根因の状態をトリガーにした。

4. **メモリ安全性を維持した**  
   HARD上限を撤廃して大量のVideoFrameを積むのではなく、既存のキュー上限とdrainを維持した。

5. **停止中もrAFを維持した**  
   ユーザー中断、完了要求、セッション世代変更へ応答でき、ハング回避の既存契約を壊さなかった。

## 今後守るべき不変条件

- backpressure時に「Encoderだけを待たせる」実装へ戻さない
- pause解除時は待機時間を必ず`startTimeRef`へ反映し、再開直後のタイムラインジャンプを防ぐ
- 動画export全体を`submittedFrameCount / FPS`駆動へ一般化しない
- 描画時刻と投入先frame indexを別の駆動源で進めない
- HARD上限を安易に撤廃・大幅増加しない
- `forceToEnd`は尺合わせの保険として残すが、大量発火を正常扱いしない
- standardの成功対策を根拠なくapple-safariへコピーしない
- 変更は一度に1仮説とし、同じ素材・同じ出力設定で実機比較する

## 再発時の診断順序

1. MP4の`stts`/`ctts`でtimestampと総フレーム数を確認する
2. `stsz`を1秒単位で集計し、映像内容が静止/黒へ変わる時刻を特定する
3. rAF間隔を実測し、`総フレーム数 ÷ 総処理時間`をrAF速度と混同しない
4. `videoEncoder.encodeQueueSize`がHARD上限付近へ張り付いていないか確認する
5. `standard.export.videoBackpressure`と`standard.export.timeline.backpressurePaused/Resumed`の対応を確認する
6. `tailFilledFrames`、`renderCallCount`、`submittedFrames`を別々に確認する
7. flush前後のEncoder出力枚数を分けて評価する
8. プレビューが滑らかか確認し、通常再生とexport固有経路を切り分ける

## 検証実績

- 回帰テスト: 950件すべて成功
- lint: エラー0（既存warningのみ）
- TypeScript + Vite本番ビルド: 成功
- Windows 11 / Edge 150 / HD 30fps / 39.64秒の元再現プロジェクト: **ユーザー実機で完全解消を確認**

