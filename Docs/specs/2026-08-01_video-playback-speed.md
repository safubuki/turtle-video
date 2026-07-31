# 動画カード倍速再生（1x / 2x / 4x / 8x）

## 仕様書

### 概要

動画カード単位で再生速度（等倍・2倍・4倍・8倍）を設定し、プレビューとエクスポートで同じ時間軸・同じ聴こえ方になるようにする。任意で倍速バッジ（早送り記号 + ○x）をキャンバス上に表示し、位置はプリセットと微調整で指定できる。

### 背景・課題

長い素材を短く見せたい「早送りシーン」がある。現状はトリムで切る以外に速度変更手段がなく、ソース音声ごと早送りする編集ができない。スロー再生は需要と実装リスクを分け、第1版では早送りのみとする。

### 要件一覧

| # | 要件 | 優先度 | 説明 |
|---|------|--------|------|
| R1 | 動画カード単位の速度 | 必須 | `1` / `2` / `4` / `8` を選択。画像カードは対象外 |
| R2 | タイムライン尺の短縮 | 必須 | `timelineDuration = (trimEnd - trimStart) / speed`。総尺・シークバーに反映 |
| R3 | プレビュー一致 | 必須 | 設定速度で映像が進み、ソース音声も同じ速度（ミュート時は無音） |
| R4 | エクスポート一致 | 必須 | 映像・ソース音声ともプレビューと同じ速度契約 |
| R5 | 既存ミュート連携 | 必須 | 音声を載せない場合は既存 `isMuted` を使う（倍速専用ミュートは作らない） |
| R6 | standard 限定 | 必須 | **Android/PC（`standard` flavor）のみ**。apple-safari では UI を出さない |
| R7 | 保存復元 | 必須 | 手動・自動保存に含め、旧データは速度 1・バッジ OFF で補完 |
| R8 | バッジ表示 | 必須 | `showSpeedBadge` が ON かつ speed>1 のとき描画。文言は `ja`（既定・「2倍速」）/ `en`（「2x」）を選択 |
| R9 | バッジ位置 | 必須 | 四隅プリセット + X/Y% 微調整（ウォーターマーク位置 UI と同型の操作感） |
| R12 | エクスポート映像の安定 | 必須 | export 映像は `playbackRate=1` 連続再生 + 壁時計を speed でダイレーション（seek 駆動・rate=speed 連続は不採用）。成功理由の詳細は `.agents/skills/turtle-video-overview/references/export-speed-video-wall-dilation-postmortem-2026-08-01.md` |
| R10 | 他トラック非自動スケール | 必須 | キャプション・ナレ・タイトル・透かしの絶対時刻は第1版では自動比例しない |
| R11 | スロー保留 | 任意 | 1 未満の速度は第1版で扱わない（型も 1/2/4/8 のみ） |

### 非要件（第1版）

- **iPhone / iPad Safari（apple-safari）向け UI・機能としての提供**（standard 限定。保存データに速度があっても iOS 側では設定 UI を出さない）
- ピッチ維持（タイムストレッチ）は行わない。速度変更に伴い音程が上がる
- 自由入力の任意倍速
- クリップ区間内キャプションの自動再配置
- 画像カードの倍速

### データ構造

```ts
type VideoPlaybackSpeed = 1 | 2 | 4 | 8;

// MediaItem に追加（動画のみ意味を持つ。旧データは未定義 = 1 / false / 既定位置）
interface MediaItem {
  // ...既存
  playbackSpeed?: VideoPlaybackSpeed;
  showSpeedBadge?: boolean;
  speedBadgePositionX?: number; // 0–100、中心の水平 %
  speedBadgePositionY?: number; // 0–100、中心の垂直 %
}
```

### 時間契約（単一ソース）

共通ユーティリティ `src/utils/playbackSpeed.ts` が唯一の定義源。

| 概念 | 定義 |
|------|------|
| sourceClipDuration | `max(0, trimEnd - trimStart)`（元動画上の有効尺） |
| playbackSpeed | `normalize` 後の 1/2/4/8 |
| item.duration | **タイムライン尺** = `sourceClipDuration / playbackSpeed` |
| sourceTime | `trimStart + localTimelineTime * playbackSpeed` |
| safeEndSourceTime | `trimEnd - ε`（または timelineDuration × speed から算出） |

プレビュー・エクスポート・シーク・トリム from preview はすべてこの契約に従う。

- フェードイン/アウト秒数は **タイムライン秒**（見た目の秒）のまま
- ディゾルブ等のトランジションも `item.duration`（タイムライン尺）基準の既存計算を維持
- BGM の動画尺連動は `totalDuration` 変化に既存どおり追従

### 画面仕様（UI）

動画カードのトリミング UI 直下（または音量設定付近）に次を置く。

1. **再生速度**: セグメントボタンまたは select（1x / 2x / 4x / 8x）。選択中を強調
2. **タイムライン尺の表示**: 例 `元 16.0s → 表示 4.0s（4x）`
3. **倍速表示バッジ**: チェックボックス「プレビュー/書き出しに速度を表示」
4. バッジ ON かつ speed>1 のとき:
   - 位置プリセット: 左上 / 右上 / 左下 / 右下（既定は右上）
   - X / Y スライダー（0–100%）で微調整
5. ロック中は操作不可（既存カードロックと同じ）

### 描画仕様（バッジ）

- 半透明の角丸ピル + 早送り記号（`»` または同等）+ `2x` 等
- 文字サイズはキャンバス短辺基準でスケール（キャプションに近い可読性）
- プレビューとエクスポートは同一 `drawSpeedBadgeFrame`
- 描画順: メディア → キャプション → タイトル → ウォーターマーク → **速度バッジ**（最前面）

### 影響を受けるファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/types/index.ts` | 速度・バッジフィールド |
| `src/utils/playbackSpeed.ts` | 新規: 正規化・時刻変換・バッジ描画 |
| `src/utils/media.ts` | trim from preview に速度反映、duration 再計算ヘルパ連携 |
| `src/stores/mediaStore.ts` | 速度更新、trim/duration 確定時の timeline 尺 |
| `src/utils/indexedDB.ts` / `projectStore` / `useAutoSave` | 永続化・ハッシュ |
| `src/components/media/ClipItem.tsx` 等 | UI・配線 |
| `src/flavors/standard/preview/*` | sourceTime・playbackRate・バッジ（主実装） |
| `src/flavors/standard/export/*` | 音声 playbackRate と source 尺 |
| `src/components/sections/ClipsSection.tsx` | `!isIosSafari` で UI 配線（standard 限定） |
| `src/test/*` | 契約・ストア・描画テスト |

### 受け入れ条件

1. 16 秒クリップを 4x にするとタイムライン上 4 秒になり、プレビューで 4 秒で内容が終わる
2. 同じ設定で書き出した MP4 も約 4 秒で、映像内容がプレビューと一致する
3. ミュート OFF なら音声も高速化して載る。ミュート ON ならソース音声なし
4. バッジ ON で右上などに `4x` が見え、書き出しにも入る
5. 旧プロジェクト読込で速度 1・挙動不変
6. `npm run test:run` / `lint` / `build` が通る

---

## 実装計画

### Phase 0: データ契約と純ロジック

- [x] 型・`playbackSpeed.ts`・media 尺/トリム連携・mediaStore
- [x] 単体テスト（正規化・sourceTime・duration）

### Phase 1: 永続化

- [x] SerializedMediaItem / serialize・deserialize / autoSave ハッシュ
- [x] 復元時に動画は trim と speed から duration を再計算

### Phase 2: プレビュー

- [x] standard / apple-safari: localTime→sourceTime、playbackRate、safe end
- [x] シーク・visibility 再同期も同一契約

### Phase 3: エクスポート

- [x] クリップ音声: pitch-preserved キャプチャ（失敗時 rate フォールバック）
- [x] 映像: export は rate=1 連続 + タイムライン wall/speed dilation（seek 駆動は不採用）

### Phase 4: UI

- [x] ClipItem 速度選択・バッジ・位置
- [x] ClipsSection / TurtleVideo 配線

### Phase 5: バッジ描画・品質

- [x] 共通描画を preview/export に接続
- [x] テスト・オーバービュー追記
