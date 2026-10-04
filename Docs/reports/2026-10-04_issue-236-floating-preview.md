# Issue #236: スマホの追従ミニプレビュー

## 対応内容

通常プレビューが画面外にあるとき、スマホレイアウトの右下に映像ボタンを表示する。編集位置を維持してミニプレビューを開き、再生・一時停止・停止・シーク・±5秒で確認できる。×／Escapeでは現在位置で一時停止し、停止ボタンでは先頭へ戻る。

通常映像が画面に入ったら開いていた意図を保持してミニUIを一時的に取り外し、通常の再生を継続する。画面外へ戻ったらボタンを経由せずミニ表示を復元し、編集中の入力欄のフォーカスも維持する。手動クローズ後は自動復元しない。書き出し前にはミニを同期的に閉じてCanvasを通常枠へ戻す。書き出し中は開いていた意図・補助ボタン・パネル・可視性／高さ監視を解除し、完了・中断後は再び手動で開ける。

設計: [仕様・実装計画](../specs/2026-10-04_issue-236-floating-preview.md)。開始時のHEADは `aa570c3`。Issue #229／#233／#237／#247の構図・タッチ保護・タイミング打ちの表示契約を維持する。

## 画質と負荷への配慮

- Canvasは既存の1個を使用する。React portalの対象を固定し、そのコンテナだけ表示枠へ移す。開閉による再生成・width/height再代入・映像コピーはない。画質設定や出力の向きによる既存の寸法変更は維持する。
- video/audio、AudioContext、captureStream、独自の再生時計、rAF、intervalは追加しない。通常とミニは既存controllerを共有し、±5秒はUI公開値ではなく最新の再生時計を基準に0〜総尺へ制限する。
- 通常映像のIntersectionObserverをモバイル・素材あり・編集時に限定する。タイミング打ちバーのResizeObserverは補助UIを利用できる場合だけ設置し、解除後の通知も無視する。スクロール位置の周期的なポーリングは行わない。
- ミニパネルとその操作リスナーは必要時だけマウントする。通常映像への自動復帰と手動クローズを区別し、exportのアンマウントでシークが再生を再開しないよう保護する。
- パネルはsafe areaに対応。操作領域は44px以上、入口は48px。タイミング打ちバーは実測高さを避け、横持ちは見出し＋映像と操作を横並びにして高さを抑える。

## 変更ファイル

| ファイル | 変更内容 |
| --- | --- |
| `src/hooks/useFloatingPreview.ts` | モバイル・通常映像の可視性・export・固定バー高さによる利用制御 |
| `src/components/common/FloatingPreview.tsx` | 編集位置を維持するパネルと再生操作 |
| `src/components/common/PreviewSeekSlider.tsx` | Issue #233の方向判定とシーク開始／変更／終了を通常とミニで共有 |
| `src/components/sections/PreviewSection.tsx` | 同一Canvasの表示先切替、入口、書き出し前の退避 |
| `src/components/TurtleVideo.tsx` | 既存controllerの接続、手動終了時の一時停止、モーダル・固定バーとの連携 |
| `src/components/sections/CaptionSection.tsx` | 固定バーの高さ参照。タイミング打ちの動作は維持 |
| `src/index.css`, `src/constants/sectionHelp.ts` | 縦横配置と操作説明 |
| `src/test/floatingPreview.test.tsx` | 21件の状態遷移・品質・リソース・シーク・export回帰テスト |

## 自動検証

- `npm.cmd run typecheck`: 成功。
- `npm.cmd run build`: 成功。既存のchunkサイズ、動的／静的import混在、Browserslist更新通知は残る。
- 通常プレビュー56件、タッチ保護21＋5件、Canvasクリア13件、タイミング打ち28＋6件を含む関連テストを確認。
- 初回実装時の全域回帰: **143ファイル、1,813件成功、失敗0件**。
- 追加調整後の関連回帰: `floatingPreview` 21件、通常プレビュー56件、タッチ保護21＋5件の **4ファイル、103件成功**。通常枠で一時非表示のまま高速なexportを開始した場合も、開いていた意図を解除する。型チェックとビルドも再確認して成功。

```text
npm.cmd run test:run -- --exclude src/test/turtleVideoExportWiring.test.tsx --exclude src/test/captionStampSilenceNav.test.tsx --exclude src/test/sectionHelpModal.test.tsx --exclude src/test/aiModalPopstate.test.tsx --maxWorkers=2 --reporter=json --outputFile=.tmp/issue236/final-results.json
```

上記4ファイルは前回までに確認した既知のOOM／失敗のため除外しており、全テスト成功という意味ではない。`captionStampSilenceNav`は初期閉状態のfixture、`sectionHelpModal`と`aiModalPopstate`は既知の失敗、`turtleVideoExportWiring`はOOM。今回これらのテストは修正していない。

UX監査: src全体を変更前後で比較。error 0／warning 0／info 9のまま、新規指摘なし。infoは既存の`transition-all`に関する指摘。

## 実Chrome検証

Playwright CLIからChromeを操作。実機ではなく、タッチ有効のスマホサイズで確認した。

| 確認項目 | 結果 |
| --- | --- |
| 同じ画像の通常→ミニ切替 | Canvas同一、画素一致、1280×720維持、追加コピー0回、scrollY 0のまま |
| 再生・手動クローズ | 再生後0.5123秒で閉じ、300ms後も同時刻で一時停止。巻き戻しなし |
| ±5秒／停止 | 追加調整後の20秒素材で進む→5秒、進む→10秒、戻る→5秒。停止→0秒は初回実装時に確認 |
| 通常映像の画面内復帰 | Canvasが通常枠へ戻り、再生継続。追加調整後は画面外へ戻すとボタンを経由せずミニ表示を復元 |
| 自動復元／手動終了 | 390×844で復元を繰り返し、Canvas・画素・解像度が一致し再生を継続。自動復元後も画像表示時間の入力フォーカスを維持。×で閉じた後は画面内／外を移動しても入口ボタンのまま |
| 320×568、390×844、844×390 | 全ボタンが画面内で押せる。縦動画は同じ720×1280のCanvasをcontain表示 |
| 縦スワイプ／短いタップ | 実CDPタッチでページが69pxスクロールしても共有時刻0.06秒は不変。タップは約3.55秒へ移動 |
| タイミング打ち同時表示 | 最終版でミニ下端／バー上端は617／629、341／353、201／242px。すべて重なりなし、バーの操作ボタンも押せる |
| 動画・音声の二重再生 | 音声付き動画で再生中のvideoは1本。DOMのもう1本は既存のプレビューキャッシュ。ミニの開閉で追加なし |
| export中 | `processing=true`でミニ／入口ともなし、同じCanvasが通常枠にある |
| export完了／中断後 | 再度ミニを開ける。中断後も同じCanvasで約0.3942秒まで再生し、再生videoは1本 |

同じ画像素材で約1秒間の描画回数は通常60回／ミニ60回。Canvas 2、video 1、audio 0で両状態とも同じ（Canvasのもう1個は既存カードサムネイル）。停止直後は既存のフレーム描き直しが1回あり、補助の周期描画は追加していない。これは短いサンプルであり、すべての端末でCPU/GPU負荷が同一と保証する計測ではない。

### 書き出し品質

約4.987秒の赤→緑に切り替わる音声付きWebMを入力し、ミニを開いた状態からFHDで書き出した。出力は約966KB、H.264 Main **1920×1080・30fps・150フレーム**、AAC LC **48kHz・ステレオ**。FFmpegで映像と音声を最後までデコードしてexit 0を確認し、0.5秒の赤いフレーム／3.5秒の緑のフレームも確認した。書き出し中の記録はミニ非表示で、完了後のCanvasは同じノードのまま素材に応じた640×360へ戻った。

補足: 検証用Chromeで出力を別のdetached videoへ読み戻す確認はdemuxerエラーになった。既存exportログのmetadata probeは成功し、FFmpegの全デコードも成功したため、出力品質の判定はそれらに基づく。別videoでの再生互換性を今回の確認済み範囲へ含めない。

## レビューと未確認範囲

追加の不具合対応: 5秒ボタンを連打すると再生が止まる問題を修正。原因と再現・検証結果は[連続シークの対応レポート](2026-10-04_issue-236-mini-preview-seek-repeat.md)を参照。

- Findings: **指摘なし**。Issueの要件、既存のシーク／タイミング打ち、保存互換性、書き出しのCanvasと音声経路を確認。保存スキーマ、flavor別描画・exportエンジン、新規依存は変更していない。
- Open questions / assumptions: モバイルの対象は既存レイアウトに合わせ1024px未満。実iPhone／iPad Safari、Android実機、長尺・多数素材でのCPU/GPU／バッテリー測定は未実施。
- 総評: 通常とミニで映像・音声の処理を共有し、補助の描画を追加せずに編集位置での確認を可能にした。overviewに機能と単一Canvasを維持する注意点を追記。
