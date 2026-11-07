## エクスポート復旧対応まとめ（2026-07-20）

「フルHD/HD/自動モード」追加（`d04cfbd`〜`6ba5893`）以降にエクスポートが崩れた一連の不具合を、
「まずは最低限エクスポートが動く」ことを目標に段階的に復旧した記録。詳細は implementation-patterns.md の
[[13-118]]〜[[13-121]] を参照。ここは全体像と再発時の入口を示す索引。

### 背景（何が壊れていたか）
出力解像度を auto/fhd/hd で切り替えられるようにした一連のコミットで、以下が連鎖的に発生していた。
1. 書き出し最終段の**解像度検証が正常ファイルまで throw**して全滅（見かけ上「全く出力できない」）。
2. 画像のみ構成で導入した**フレーム駆動ペーシングの停滞**により「書き出し準備中」から進まないハング。
3. 出力後の UI で**現在秒数が総尺より 1 秒少なく表示**（例 0:04 / 0:05）。
4. エクスポート中に**BGM がスピーカーから漏れて聞こえる**（出力ファイルには無関係）。

### 実施した対応（順に）
- **13-118 解像度検証の緩和**: `resolveExportResolutionVerdict()` で `match`/`mismatch`/`unverified` の 3 値化。
  実解像度が読めない（パーサー限界）だけでは破棄せず、確実な不一致のみ失敗にする。standard/apple-safari 両方。
- **13-119 フレーム駆動ウォッチドッグ**: `evaluateFrameDrivenExportStall()`。投入フレーム数が 2 秒進まなければ
  壁時計ペーシングへフォールバックし、どの下位原因でもハングせず必ず終端へ到達させる。VideoEncoder エラーも logStore へ記録。
- **13-120 終端で現在時刻を総尺へスナップ**: standard の export 終端だけ `setCurrentTime(totalDuration)` が欠けていた
  （preview 終端・apple-safari は実施済み）ため統一。表示のみ、ファイル尺は不変。
- **13-121 native 音声漏れの無音化**: export 中は出力音声を OfflineAudioContext で別途生成するため、
  WebAudio ノードを持たない（キャプチャ対象外の）ライブ要素は `applyPreviewAudioOutputState` で必ず無音化。

### 出力ファイルへの影響評価（重要）
- **いずれの修正も出力 MP4 の中身を変えない**。映像は全フレームエンコード＋最終フレーム duration を総尺まで延長、
  音声は OfflineAudioContext のミックス由来。13-120/13-121 は UI/スピーカーのみ、13-118 は検証の緩和、
  13-119 は進行保証（尺は count ベース CFR で不変）。

### 検証（最終チェック 2026-07-20）
- `tsc --noEmit`: 0 エラー / `eslint src`: 0 エラー（既存 warning のみ・フレーバー境界違反なし）
- `vitest run`: 全 610 件合格（export 関連 131 件含む）/ `npm run build`: 成功
- フレーバー境界: standard⇄apple-safari のクロス import なし（共有は utils/exportTimeline・hooks/export-strategies のみ）

### 残課題・再発時の入口
- 実機（ブラウザ WebCodecs / GPU）での書き出しは本環境で未検証。実機で失敗が残る場合は開発ログを見る:
  - `standard.export.pacing.selected`（frame-driven / wall-clock の選択）
  - `standard.export.pacing.watchdog`（2 秒停滞で壁時計フォールバックが発火したか＝真の下位原因あり）
  - `VideoEncoder エラー` / `[DIAG-RESOLUTION]` / `[DIAG-DURATION-2]`
- duration の ±1ms hard-throw（`DURATION_DIFF_THRESHOLD_US`）は本対応の対象外で従来どおり。AAC プライミング遅延で
  audio track が伸びる実測が出たらここを見直す。
- 「最低限動く」到達が目的のため、フレーム駆動の停滞そのものの根治（瞬時前進）は未実施。ウォッチドッグは安全弁。
