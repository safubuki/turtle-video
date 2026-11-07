# 倍速エクスポート映像の壁時計 dilation（2026-08）— 成功ノウハウ

## 結論と対応状況

動画カード倍速（2x / 4x / 8x）の **standard export 映像**は、次の組み合わせで安定した。

1. 共有 `<video>` は **常に `playbackRate=1` で連続再生**する  
2. export ループのタイムラインは **壁時計 Δt / speed** で進める（wall dilation）  
3. ソース時刻契約は不変: `sourceTime = trimStart + localTimeline × speed`

**2026-08、ユーザー実機で「この方式はうまく行っている」と確認済み。**  
seek 駆動や `playbackRate=speed` のみへ戻さないこと。

実装の入口:

- 純ロジック: `src/utils/playbackSpeed.ts`  
  - `resolveExportTimelineWallDivisorForItem`  
  - `wallDeltaToExportTimelineDelta`  
  - `resolveVideoElementPlaybackRateForContext`（export 時は常に 1）
- ループ: `src/flavors/standard/preview/usePreviewEngine.ts`  
  - `exportTimelineSecRef` / `exportLastWallNowMsRef`  
  - backpressure 再開時に `exportLastWallNowMsRef` を現在時刻へ合わせる
- 概要パターン: implementation-patterns **13-166**
- 仕様: `Docs/specs/2026-08-01_video-playback-speed.md`（R12）

---

## 問題の見え方

| 症状 | 備考 |
|------|------|
| 4x export で映像が途中で終わる（途中切れ） | `playbackRate=speed` 連続再生時 |
| 4x export で映像が完全に静止画のように固まる | paused + 毎フレーム seek 時 |
| プレビューは問題ないのに export だけ壊れる | プレビューは wall=timeline かつ rate=speed で別モデル |

音声（pitch-preserved キャプチャ）や波形圧縮は別経路で解決済み。本メモの対象は **export 映像の駆動方式**のみ。

---

## 失敗した方式と理由

| 方式 | 結果 | なぜ破綻するか |
|------|------|----------------|
| **A. `playbackRate=speed` 連続再生**（壁時計=タイムライン） | 途中切れ | タイムラインは 4s で終わるのに、デコーダが 4x でソース 16s 分を追い切れない。終端までソース内容が載らない |
| **B. paused + 毎フレーム sourceTime へ seek** | 静止画化 | 連続 seek でデコードパイプラインが張り付き、描画可能フレームが更新されない。[[export-video-backpressure-postmortem-2026-07-27]] が示す「連続 seek 悪循環」と同系 |
| **C. 動画 export 全体をフレーム投入枚数駆動** | 過去に悪化して差し戻し | `<video>` の native 実時間再生と競合し、correction seek 連打になる（13-148 / 13-153 の教訓） |

### なぜ A は「正しそうに見えて」ダメか

- 時刻契約上は `localTimeline * speed = sourceElapsed` なので、rate=speed と wall=timeline は**数式上は一致**する。  
- しかし export は Canvas キャプチャ + VideoEncoder 負荷下で走り、**高倍速のデコードが壁時計に追いつかない**。  
- 結果、タイムライン終端時にソース終端へ到達していない → 途中切れ。

### なぜ B はダメか

- 正確な sourceTime を毎フレーム強制できるが、HTMLVideoElement は **seek の連続に弱い**。  
- `seeking=true` のまま描画スキップが続き、出力は同じ絵の連番（静止画）になる。  
- プロジェクト全体の不変条件「通常は壁時計 + native 連続再生を捨てない」（13-153）にも反する。

---

## 成功した方式（wall dilation）

### 3 つの時計の役割分担

standard export には（少なくとも）次がある。

1. **壁時計**（実時間）— デコードと rAF が実際に進む時間  
2. **export タイムライン**（出力 MP4 の時刻・UI の currentTime）  
3. **`<video>.currentTime`**（ソース上の再生位置）

倍速クリップでは:

| 時計 | 進行 |
|------|------|
| 壁時計 | ソース尺ぶん実時間がかかる（4x の 16s ソースなら約 16s） |
| タイムライン | `Δtimeline = Δwall / speed`（16s 壁 → 4s タイムライン） |
| video | `playbackRate=1` で連続再生。ソースは壁とほぼ 1:1 |

これにより:

- `targetSource = trimStart + localTimeline * speed`  
- `video.currentTime ≈ trimStart + wallElapsed`（clip 開始から）  
- `localTimeline ≈ wallElapsed / speed`  
→ **3 者が揃い、correction seek はほぼ不要**。

### 実装上の要点

```
// export ループ（非フレーム駆動・動画あり）
wallDelta = now - exportLastWallNowMs
divisor  = activeVideo.playbackSpeed  // 画像・等倍は 1
exportTimelineSec += wallDelta / divisor
elapsed = exportTimelineSec

// renderFrame 側
applyVideoElementPlaybackRate(video, isExporting ? 1 : speed)
// needsCorrection は緩めしきい値のみ。毎フレーム seek しない
```

- **プレビュー**は従来どおり: 壁時計=タイムライン、`playbackRate=speed`。  
- **export の rate は常に 1**（等倍クリップも 1 でよい）。dilation の divisor だけが speed を担う。  
- **backpressure**（13-153）: pause 中は timeline を進めない。再開時は  
  `startTimeRef` の繰り下げに加え **`exportLastWallNowMsRef = now`** を忘れない（待機秒が timeline に混ざるとジャンプする）。  
- **音声**は Offline スケジューリング（タイムライン尺）+ 倍速は pitch-preserved キャプチャ。映像の dilation とは独立に AV は PTS で揃う。

### なぜ成功したか（要約）

1. **native 連続再生を捨てなかった** — seek 連打も高 rate 強制も避け、デコーダが最も安定する 1x 再生に寄せた。  
2. **「速さ」を video.playbackRate ではなくタイムライン時計側で表現した** — 出力尺は短く、中身はソース全区間を 1x でスキャンする。  
3. **過去の export 不変条件と両立** — フレーム駆動一般化や連続 seek に戻していない（13-153 / postmortem 2026-07-27）。  
4. **ソース時刻の単一契約を維持** — preview/export/trim すべて `resolveVideoSourceTime`。

---

## 守るべき不変条件

- 倍速 export 映像を **`playbackRate=speed` のみ**へ戻さない（途中切れ再発）。  
- 倍速 export 映像を **paused + 毎フレーム seek** へ戻さない（静止画化再発）。  
- 動画を含む export を、静止画専用のフレーム投入駆動へ一般化しない。  
- export 中 active video の rate は **`resolveVideoElementPlaybackRateForContext(true, …) === 1`**。  
- タイムライン進行は **`wallDeltaToExportTimelineDelta(wallDelta, divisor)`** 経由。  
- backpressure 再開で **`exportLastWallNowMsRef` を必ず更新**する。  
- プレビューの体感倍速（rate=speed）を export と無理に同一実装にしない。経路を分けるのが正しい。  
- 変更は standard に閉じる（UI も standard 限定）。apple-safari へコピーする場合は別途検証。

---

## 再発時の診断順序

1. 出力 MP4 の尺はタイムラインどおりか（コンテナ）、中身が途中で止まっていないか（映像内容）。  
2. export ログの pacing が `wall-clock-dilated` か。seek 駆動や rate=speed 専用分岐が戻っていないか。  
3. 共有 video の `playbackRate` が export 中 1 か。`seeking` が毎フレーム立っていないか。  
4. 4x クリップで **実書き出し時間がソース尺に近いか**（dilation が効いていれば長めに待つ）。短い実時間で終わるなら wall が timeline 直結に戻っている疑い。  
5. backpressure pause/resume ログと、resume 直後の timeline ジャンプ有無。  
6. プレビューが正常なら、問題は export 時計 / rate 経路に限定して切る。

---

## 関連

- implementation-patterns **13-166**（機能概要・データ契約）  
- **13-153** + [export-video-backpressure-postmortem-2026-07-27.md](export-video-backpressure-postmortem-2026-07-27.md)（連続 seek 禁止・壁時計+native 再生）  
- **13-45 / 13-46**（export 中の seek 過多による静止化）  
- 仕様: `Docs/specs/2026-08-01_video-playback-speed.md`

---

## 検証実績

- 単体: `playbackSpeed.test.ts`（dilation / rate context）  
- エンジン: `standardPreviewEngine.test.tsx`（export 終端 complete、backpressure と壁時計）  
- **ユーザー実機（2026-08）: wall dilation 方式で倍速 export 映像が正常**と確認
