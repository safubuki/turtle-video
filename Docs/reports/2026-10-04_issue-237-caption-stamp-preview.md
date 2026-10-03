# Issue #237: タイミング打ち中のキャプション表示

対象: [Issue #237](https://github.com/safubuki/turtle-video/issues/237)

## 修正前の動作

「② タイミング打ち」を開始してもプレビューは全キャプションを通常どおり描画していた。今回まだ時刻を設定していないキャプションも元の表示区間で現れ、重なった文字が映像とタイミング入力を妨げていた。

キャプションの一覧やテキストが原因ではなく、タイミング打ちのセッション状態が描画エンジンへ渡っていなかったことが原因。

## 変更後の動作

- モード開始時は表示対象を空にし、プレビュー上の既存キャプションを一時的に非表示にする。
- 交互モードで開始または終了時刻を設定したキャプションを表示対象へ加える。連続モードでは現在の終了と次の開始を設定した両方を対象へ加える。
- 対象に加えた後も表示区間・フェード・通常の表示設定に従う。対象選択やフェーズ切替、無効な確定操作だけでは表示しない。
- 手動終了・最終キャプション完了・ロック・書き出し開始・対象消失・アンマウントで通常表示へ戻る。再開始時は表示対象をリセットする。
- 入力一覧とテキストを保持し、一時非表示のためにキャプションや時刻を変更しない。タイミング打ちによる時刻変更は従来どおり反映する。

## 実装上の境界

`CaptionSection` が今回確定したIDの集合を保持し、`TurtleVideo` のプレビュー専用state/refへ通知する。`null` は通常表示、空集合は全非表示。

両flavorの描画エンジンは、プレビューだけ `filterCaptionsForPreview` で絞る。書き出し時は元の全キャプション配列を使用する。元の `captionsRef`、ストア、プロジェクト保存形式、字幕・キャプションのみ出力は変更しない。動画タイトルと入力・スタイル確認用ミニビューもこの表示制限の対象外。

停止中の開始・確定・終了も既存の再描画effectで反映する。モード中は全キャプションを焼き込んだAndroidプレビューキャッシュを使用しない。キャッシュは現在無効だが、再有効化時にも開始前に内部キャッシュ再生を終了し、現在位置を保持してライブ再生へ切り替えられるようにした。

解除処理は最新の通知callbackをrefで参照し、アンマウント時だけ呼ぶ。callbackの参照変更だけで確定対象を解除しない。

## 検証

### 自動テスト

- `captionStampPreview.test.tsx`: 19件。開始時の全非表示、データと一覧保持、交互・連続、無効操作、選択・フェーズ・モード変更、手動・自動終了、再開始、ロック・書き出し・削除・platform変更・アンマウント、callback参照変更を確認。
- `captionTimeline.test.ts`: 表示フィルタの7件を追加。ID選別、時刻判定との併用、通常表示への復帰、再開始、入力不変、書き出し除外を確認。
- `captionStampPreviewEngine.test.tsx`: 4件。standard / apple-safari の本物の `renderFrame` で最終Canvasの描画対象を確認。空集合→確定ID→通常表示→書き出しと、optional ref未指定の呼び出しを検証。glyph画像の生成だけ差し替え、表示対象の選別・時刻判定・エンジン自体は実装を使用。
- 最終回帰テスト: 142ファイル・1,783件すべて成功（下記4ファイルを除外）。新規テストは計30件。
- `npm.cmd run typecheck` と `npm.cmd run build` は成功。ビルドの既存警告（大きいchunk、静的／動的importの併存、Browserslist更新案内）は継続。`git diff --check` も成功。

最終回帰テストのコマンド:

```powershell
npm.cmd run test:run -- --exclude src/test/turtleVideoExportWiring.test.tsx --exclude src/test/captionStampSilenceNav.test.tsx --exclude src/test/sectionHelpModal.test.tsx --exclude src/test/aiModalPopstate.test.tsx --maxWorkers=2
```

全域のテストからは、Issue #233でも確認済みの既存失敗がある `captionStampSilenceNav.test.tsx`、`sectionHelpModal.test.tsx`、`aiModalPopstate.test.tsx` と、既存のメモリ不足がある `turtleVideoExportWiring.test.tsx` を除外した。前者のタイミング打ちfixtureは `defaultOpen` 未指定でセクションが閉じているため失敗する。今回の新規fixtureはセクションを開き、ライブ更新を実データへ反映して検証した。

### 実Chrome

検証用画像と、0〜4秒で重なる `FIRST` / `SECOND` / `THIRD` の3キャプションをUIから登録。Canvasの文字画像生成と最終描画を記録し、スクリーンショットも目視確認した。

| 操作 | プレビューの文字 |
| --- | --- |
| 通常表示（0.5秒） | FIRST、SECOND、THIRD |
| モード開始 | なし。全データ・設定が開始前と一致 |
| FIRSTの開始確定 | FIRSTだけ |
| FIRSTの終了確定（1.5秒） | なし |
| SECONDの開始確定 | SECONDだけ |
| モード終了 | SECOND、THIRD |
| 再開始 | なし |
| 再度終了 | SECOND、THIRD |
| 再生中の未確定 | なし |
| 再生中にSECONDの開始確定 | SECONDだけ。再生継続 |
| 連続モードの区切り直後 | なし。次の開始までの間隔を維持 |
| 次の表示区間へ移動 | THIRDだけ |

書き出し全体の実ファイル生成とAndroid実機は今回未検証。書き出しへの一時制御の非混入は、両エンジンの実描画テストと完成動画・字幕・キャプションのみ出力・保存の配線レビューで確認した。

## 資料更新

- `spec.md`: プレビュー限定の表示対象と解除・再開始の条件を追記。
- `src/constants/sectionHelp.ts`: タイミング打ち中の表示と通常表示への復帰を説明。
- overviewの `implementation-patterns.md` 13-258 と `project-details.md`: セッション状態・描画・書き出しの境界を追記。
