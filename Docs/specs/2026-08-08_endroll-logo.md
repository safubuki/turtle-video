/**
 * @file 2026-08-08_endroll-logo.md
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 */

# エンドロールロゴ 仕様・実装計画書

- 作成日: 2026-08-08
- **実装完了: 2026-08-09（Phase 1〜8）。実機確認待ち**
- 対象フレーバー: **standard（Android / PC）限定**。apple-safari には露出しない（13-171 の方針を踏襲）
- 関連: 13-171（新機能を Apple へ出さない）、Issue #210 ウォーターマーク（`Docs/specs/2026-07-27_issue-210-watermark-overlay.md`）

---

## 1. 目的

現状のウォーターマーク（動画に重ねてロゴを表示）を**そのまま維持**しつつ、
**動画が終わった後**に単色背景 + ロゴを表示する「エンドロール」を新規追加する。

12 秒の動画に 5 秒のエンドロールを設定したら **17 秒の動画になる**（尺が伸びる）。
これが本機能における最大の注意点であり、実装上のリスクの中心。

---

## 2. 仕様

### 2.1 UI（ウォーターマークアコーディオン内）

- アコーディオン名を「ウォーターマーク」→「**ロゴ表示**」に変更（2 機能を含むため）。
- 上部に**タブ切替**を置く: `[ ウォーターマーク ] [ エンドロール ]`
  - 現在どちらを設定中かが一目で分かるようにする（選択中タブを強調）。
  - タブに設定状態バッジを出す: 画像未設定=「指定なし」/ 設定済=ロゴのサムネイル。
- **スライダー・ボタン類は共通コンポーネントを再利用**（位置・サイズ・回転・不透明度・マスク・ぼかし・フェード）。
  操作 UI は共通、**書き込み先の state だけがタブで切り替わる**。
- 画像はウォーターマークとエンドロールで**別々に保持**する（異なる画像を設定できる）。

### 2.2 エンドロール固有の設定

| 項目 | 内容 | 既定値 |
|---|---|---|
| 有効/無効 | OFF のとき尺は伸びない | OFF |
| 長さ | 0.5〜30 秒 | 5 秒 |
| 背景色 | 黒 / 白 / カスタム（カラーピッカー） | **黒** |
| BGM フェードアウト | エンドロール区間で BGM を徐々にフェードアウト。**BGM 未設定時はグレーアウト無効** | OFF |

- 位置・サイズ・回転・不透明度・マスク・マスクサイズ・ぼかし・フェードイン/アウトは
  ウォーターマークと**同じ設定項目・同じ範囲**を持つ（共通 UI で操作）。
- エンドロールには `startTime` / `endTime`（表示範囲）は持たない。
  区間 = エンドロール全体なので不要。フェードイン/アウトはエンドロール区間の先頭/末尾基準。

### 2.3 タイムライン（最重要）

**用語を分離する。これが実装の背骨。**

| 用語 | 意味 | 例 |
|---|---|---|
| `clipsDuration` | クリップだけの長さ（従来の `totalDuration` と同値） | 12 秒 |
| `endrollDuration` | エンドロールの長さ（無効なら 0） | 5 秒 |
| `totalDuration` | `clipsDuration + endrollDuration` = **出力全体の長さ** | 17 秒 |

**方針: `totalDuration` の意味を「出力全体の長さ」へ拡張し、クリップ配置に使う箇所だけ `clipsDuration` へ置き換える。**

- 理由: `totalDuration` は 46 ファイルが参照し、その多くは「シークバー範囲」「エクスポート尺」「BGM フェードアウト位置」など
  **出力全体を意味する使い方**。こちらを維持する方が変更点が少なく安全。
- `clipsDuration` へ置き換えるのは「クリップの配置・探索」に関わる箇所のみ（下表）。

| 用途 | 使う値 |
|---|---|
| シークバー範囲、再生終了判定、エクスポート尺 | `totalDuration`（17秒） |
| クリップの active 判定 / トランジション計算 | `clipsDuration`（12秒） |
| キャプション表示 | `clipsDuration`（12秒。エンドロール中は出さない） |
| BGM の再生継続・末尾フェードアウト基準 | `totalDuration`（17秒） |
| BGM 自動尺合わせ | `totalDuration`（17秒） |
| ナレーション | `clipsDuration`（12秒。エンドロール中は鳴らさない） |

### 2.4 描画

- 再生位置 `t >= clipsDuration` のとき **エンドロールフレーム**を描く:
  1. Canvas 全面を背景色で塗る
  2. `drawWatermarkOverlayFrame()` と**同じ描画関数**でロゴを合成（`localTime = t - clipsDuration`）
  3. キャプション・ウォーターマークは描かない
- プレビューとエクスポートで**同一の描画関数**を使う（WYSIWYG を崩さない）。

### 2.5 音声

- **BGM**: エンドロール区間も継続再生。既定の末尾フェードアウト（0.5/1/2秒）は `totalDuration`(17秒) 基準。
- **BGM エンドロールフェードアウト（新規オプション）**: ON のとき
  `clipsDuration` から `totalDuration` にかけて **エンドロール長ぶんかけて徐々に 0 へ**。
  既存の末尾フェードアウトとは独立した別オプション。両方 ON なら短い方が優先（＝より早く 0 に近づく方を採用）。
  BGM が 1 つも無いときは**チェックボックスをグレーアウト無効**。
- **ナレーション**: エンドロール区間では鳴らさない。
- **動画クリップ音声**: `clipsDuration` で終わるので自然に無音。

### 2.6 永続化

- `EndrollOverlay` を `WatermarkOverlay` とは**別フィールド**で保存する（additive）。
- 画像は既存のウォーターマークと同じ `serializeWatermarkOverlay` の仕組み（`fileData`）を流用。
- 旧バージョンのプロジェクトを読むと `endroll` は未定義 → 既定値（無効・5秒・黒）へ正規化。
- autoSave のハッシュ、cache key にも `endroll` を追加する（変更が保存されないバグを防ぐ）。

---

## 3. 影響範囲

| 種別 | ファイル |
|---|---|
| 型 | `src/types/index.ts` |
| 純ロジック（新規） | `src/utils/endrollOverlay.ts` |
| 描画共通化 | `src/utils/watermarkOverlay.ts` |
| ストア | `src/stores/overlayStore.ts`, `src/stores/projectStore.ts` |
| 尺計算 | `src/utils/media.ts`, `src/utils/transitionTimeline.ts` |
| プレビュー | `src/flavors/standard/preview/usePreviewEngine.ts` ほか standard 配下 |
| エクスポート | `src/flavors/standard/export/exportEngine.ts` |
| UI | `src/components/sections/OverlaySection.tsx`, `src/components/TurtleVideo.tsx` |
| ヘルプ | `src/constants/sectionHelp.ts` |
| flavor 境界 | `src/app/appFlavorUi.ts`（`supportsEndroll` を standard 限定で追加） |

---

## 4. 実装フェーズ

各フェーズ終了時に `npm run test:run` / `npx tsc --noEmit` / `npm run build` を通す。

### Phase 1: 型と純ロジック（UI・描画に触れない）

- [x] `EndrollOverlay` 型を追加（`WatermarkOverlay` と共通のスタイル項目 + `durationSec` / `backgroundMode` / `backgroundColor` / `bgmFadeOut`）
- [x] `src/utils/endrollOverlay.ts` を新規作成
  - `DEFAULT_ENDROLL_OVERLAY`（無効・5秒・黒）
  - `normalizeEndrollOverlay()`（旧データ・不正値の正規化）
  - `getEndrollDuration(endroll)` → 無効/画像なしなら 0
  - `resolveEndrollBackgroundColor(endroll)` → 黒/白/カスタム
  - `calculateEndrollFadeAlpha()`（ウォーターマークのフェード計算を再利用）
  - `resolveBgmEndrollFadeGain()`（エンドロール BGM フェード。純関数）
- [x] **テスト**: 正規化、尺 0 の条件、背景色解決、フェード計算、BGM フェード
- **確認**: 既存テスト全合格（この時点で挙動は一切変わらない）

### Phase 2: 尺計算の分離（`clipsDuration` / `totalDuration`）

- [x] `calculateTotalDuration(items)` は**クリップ尺のまま維持**し、`clipsDuration` として扱う
- [x] `TurtleVideo` で `totalDuration = clipsDuration + endrollDuration` を算出して配下へ渡す
- [x] クリップ配置に使う箇所を `clipsDuration` へ置換（2.3 の表に従う）
  - `findActiveTimelineItemWithTransitions`, キャプション、ナレーション
- [x] **テスト**: エンドロール無効なら `totalDuration === clipsDuration`（**既存挙動の完全一致を保証**）
- **確認**: エンドロール未設定で全テスト合格。尺・シーク・BGM が従来どおり

### Phase 3: ストアと永続化

- [x] `overlayStore` に `endroll` state と操作アクションを追加
- [x] 画像設定・削除・各調整値の更新アクション（ウォーターマークと対称に）
- [x] `projectStore` に serialize / deserialize を追加（additive）
- [x] autoSave ハッシュ・cache key に `endroll` を追加
- [x] **テスト**: 保存→読込のラウンドトリップ、旧データ（`endroll` 無し）の読込、画像がそれぞれ独立して保存されること
- **確認**: 保存・復元でウォーターマークとエンドロールが混ざらない

### Phase 4: プレビュー描画

- [x] `renderFrame` に「`t >= clipsDuration` ならエンドロールを描く」分岐を追加
- [x] 背景塗り → ロゴ合成。キャプション・ウォーターマークはスキップ
- [x] エンドロール中は動画要素を pause（無駄なデコードを避ける）
- [x] シーク・一時停止・タブ復帰がエンドロール区間でも壊れないこと
- [x] **テスト**: 描画分岐の純ロジック（どの時刻でどちらを描くか）
- **確認**: プレビューで 12 秒以降にロゴが出る。シークバーが 17 秒になる

### Phase 5: 音声（BGM エンドロールフェード）

- [x] BGM の gain 解決に `resolveBgmEndrollFadeGain()` を合成
- [x] ナレーションはエンドロール区間で鳴らさない
- [x] **テスト**: エンドロール区間の gain 推移、既存フェードとの併用、BGM 無し時
- **確認**: エンドロールで BGM が徐々に消える

### Phase 6: エクスポート

- [x] 映像: エンドロール区間のフレームをプレビューと同じ関数で生成
- [x] 音声: `OfflineAudioContext` のレンダリング長を `totalDuration` に、BGM エンベロープにエンドロールフェードを追加
- [x] **テスト**: エクスポート尺 = `totalDuration`、音声長の一致
- **確認**: 書き出した MP4 が 17 秒でエンドロール付き

### Phase 7: UI

- [x] アコーディオンを「ロゴ表示」に改称、タブ切替を追加
- [x] 共通スライダー群を両タブで再利用（書き込み先を切替）
- [x] エンドロール固有 UI: 有効/無効、長さ、背景色（黒/白/カスタム）、BGM フェード（BGM 無しでグレーアウト）
- [x] タブに設定状態（指定なし / サムネイル）を表示
- [x] flavor 境界: **`supportsEndroll` は追加せず**、既存の `supportsWatermark`（standard 限定）に相乗り。
      OverlaySection ごと gate されるため、フラグを増やすと二重管理になる。
      `appleSafariFlavorRegression.test.ts` の `supportsWatermark: false` が引き続きガードする。
- [x] `sectionHelp.ts` にヘルプ追記
- [x] **テスト**: タブ切替で書き込み先が変わる、Apple で非表示、BGM 無しでグレーアウト
- **確認**: 実機で一連の操作（未実施）

### Phase 8: 仕上げ

- [x] overview（`implementation-patterns.md`）へ追記
- [x] 全テスト・lint・build
- [ ] **実機確認（Android / PC）… 未実施。ユーザー確認待ち**

---

## 5. デグレ注意点

| 項目 | 注意 |
|---|---|
| **エンドロール無効時の完全な挙動不変** | 最重要。`endrollDuration === 0` なら `totalDuration === clipsDuration` で従来と 1 ビットも変わらないこと |
| **`totalDuration` の意味変更** | 46 ファイルが参照。クリップ配置用途だけを `clipsDuration` へ替える。取り違えると BGM 尺やキャプションがずれる |
| **保存の混線** | ウォーターマークとエンドロールの画像・設定が混ざらないこと。autoSave ハッシュ漏れは「設定が保存されない」バグになる |
| **apple-safari 非影響** | standard 配下のみ変更。Apple は `clipsDuration === totalDuration` のまま |
| **プレビュー = エクスポート** | 同一描画関数を使う。片方だけ直さない |
| **BGM 自動尺合わせ** | `totalDuration`(17秒) 基準になる。エンドロール ON/OFF で BGM の有効区間が変わる点をユーザーに分かるようにする |
