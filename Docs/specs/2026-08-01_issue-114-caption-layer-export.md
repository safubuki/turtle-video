# Issue #114: キャプション単独出力（透過 / 黒背景）+ 字幕ファイル

## 仕様書

### 概要

ベース動画を再圧縮せず、他の動画編集ソフトで合成できるよう、キャプションレイヤーだけを書き出す。  
理想はアルファ付き透過動画。制約時は黒背景（ルミナンスキー向け白文字オプション含む）。併せて汎用字幕ファイル（SRT / VTT）も出力する。

### 背景・課題

- 現状は焼き込み（composite）のみ。ベース映像ごと再圧縮され、駒落ちや画質劣化が起きやすい。
- プロユースでは、他ソフトで作ったベース映像に Turtle Video の高度なキャプションだけを載せたい需要がある。
- Issue 本文は「透過 or 黒背景の動画」中心。ユーザー追加要望として、汎用字幕規格（SRT/VTT）の同時出力も有用。

### 利用シナリオ

1. 他ソフトでベース動画を作成する  
2. その尺・タイミングを前提に Turtle Video でキャプションを作成する  
3. 「キャプションのみ」で透過（または黒背景）動画を書き出す  
4. 必要なら SRT/VTT も書き出す  
5. 他ソフトでベース + キャプションレイヤーを合成する  

### 要件一覧

| # | 要件 | 優先度 | 説明 |
|---|------|--------|------|
| R1 | 出力モード選択 | 必須 | エクスポート UI に「完成動画 / キャプションのみ」を用意する。キャプション0件では後者を選択不可にする |
| R2 | ベース映像を含めない | 必須 | キャプションのみ時、動画・画像・トランジション・倍速バッジ・ウォーターマークを描画しない |
| R3 | マット形式 | 必須 | 最低限 **黒背景 MP4** を提供する（受け入れ条件） |
| R4 | 透過動画 | 推奨 | 可能なら **WebM（alpha）** を提供する（Chrome / Android Chrome 想定） |
| R5 | ルミナンスキー用 | 推奨 | 黒背景 + 白文字強制の MP4 オプション（Issue フォールバック） |
| R6 | 音声なし | 必須 | キャプションのみ動画は無音（音声トラックなし、または無音） |
| R7 | 尺の一致 | 必須 | プロジェクト `totalDuration` と同じ尺で出力する |
| R8 | WYSIWYG | 必須 | キャプションの時刻・位置・字体・縁・ぼかし・背景帯・フェード・時分割は通常描画と同じ |
| R9 | 動画タイトル | 必須 | 動画タイトル（Issue #211）もキャプションレイヤーに含める |
| R10 | 字幕ファイル | 推奨 | SRT と WebVTT を生成・ダウンロードできる |
| R11 | 既存 composite 不変 | 必須 | 既定の「完成動画」書き出しの見た目・経路を壊さない |
| R12 | フレーバー | 必須 | 第1版は **standard** を主対象。apple-safari は黒背景 MP4 を可能な範囲で追随、alpha WebM は対象外可 |

### スコープ外

- アプリ内でのルミナンスキー / クロマキー合成
- ASS/SSA など高度スタイル字幕
- ProRes 4444 / MOV alpha（ブラウザ非対応）
- ベース動画をプロジェクトに持たない「キャプションだけプロジェクト」新規フロー（現状どおりメディアで尺を決める）

### 設計判断（仕様不足箇所の内部確定）

| 論点 | 決定 | 理由 |
|------|------|------|
| 何をレイヤーに含めるか | 通常キャプション + 動画タイトル | WM はブランドロゴ、倍速バッジは UI 情報 |
| 既定マット | 黒背景 MP4 | 受け入れ条件を全環境で満たす。alpha は推奨オプション |
| alpha コンテナ | WebM (VP8/VP9) | ブラウザで alpha が現実的な形式。MP4/H.264 は alpha 非対応 |
| ルミナンスキー | 任意オプション | 色付きキャプションを維持したい用途と両立するため既定にはしない |
| 字幕の時間 | 時分割行を個別キューに展開 | 他ソフトでの編集しやすさ優先。スタイルは SRT/VTT では捨てる |
| 字幕の同時出力 | 動画完了後に任意で追加ダウンロード、または同時生成 | 依存追加なしで順次保存 |
| iOS | 黒背景 MP4 のみ検討。alpha WebM は非対応でよい | MediaRecorder/MP4 制約 |
| プレビュー | 変更しない（常に完成合成） | 編集中の確認はベース付きが必要 |

### データ構造

```ts
/** 書き出しの内容モード */
export type ExportContentMode = 'composite' | 'caption-layer';

/**
 * キャプションのみ時の映像形式。
 * - black-matte-mp4: 黒背景 + 通常スタイル（既定・最も互換）
 * - luminance-key-mp4: 黒背景 + 白文字強制（他ソフトのルミナンスキー用）
 * - alpha-webm: 透過 WebM（対応ブラウザのみ）
 */
export type CaptionLayerVideoFormat =
  | 'black-matte-mp4'
  | 'luminance-key-mp4'
  | 'alpha-webm';

export type CaptionSubtitleFormat = 'srt' | 'vtt';

export interface ExportOutputOptions {
  contentMode: ExportContentMode;
  captionLayerFormat: CaptionLayerVideoFormat;
  /** 動画と一緒に字幕ファイルも生成するか */
  includeSubtitles: boolean;
  subtitleFormats: CaptionSubtitleFormat[];
}
```

### 画面仕様

プレビューセクション「動画ファイルを作成」付近に、初期状態が閉じた「動画出力オプション」アコーディオンを置く。既存のサムネイル設定も同じアコーディオンへまとめる。

- **サムネイル設定**
  - 自動 / 手動と設定時刻、サムネイル画像、現在フレーム設定 / 自動復帰
- **出力内容**
  - 完成動画（既定）
  - キャプションのみ（キャプション + 動画タイトル。ベース映像なし。キャプション0件では無効）
- **キャプションのみ選択時**
  - 形式: 透過 WebM / 黒背景 MP4 / 白文字キー用 MP4（非対応時は無効表示）
  - 補足文はモバイルでも1行程度の短文にし、背景透過は WebM のみと説明する
  - 字幕ファイルも出力: チェック（SRT + VTT）
  - 字幕ファイルの単独ダウンロードは同じ字幕設定カード内に置く
- **生成済み状態**
  - `exportUrl` がありダウンロードボタンを表示している間は、サムネイル・出力内容・キャプション形式・字幕同時出力を変更不可にする
  - 停止または再生で生成済み動画を解除すると再設定できる
- ヘルプ: 他ソフトでの合成フローを 1 文で説明

### 影響を受けるファイル（想定）

| ファイル | 変更内容 |
|---------|---------|
| `src/types/index.ts` | モード・形式型の追加 |
| `src/utils/captionLayerExport.ts` | 新設: 形式解決・マット方針・ファイル名 |
| `src/utils/captionSubtitle.ts` | 新設: SRT/VTT 生成 |
| `src/utils/captionLayerRender.ts` | 新設: キャプションレイヤー描画（preview/export 共有） |
| `src/flavors/standard/preview/usePreviewEngine.ts` | export 時 caption-layer 早退パス、または共有描画呼び出し |
| `src/flavors/standard/export/exportEngine.ts` | caption-layer 用オフライン encode 経路 |
| `src/hooks/export-strategies/types.ts` | startExport オプション拡張 |
| `src/components/sections/PreviewSection.tsx` | UI |
| `src/components/TurtleVideo.tsx` | 配線・字幕ダウンロード |
| `src/constants/sectionHelp.ts` | ヘルプ追記 |
| `src/test/*` | 純ロジック・UI・回帰 |

### 技術方針

1. **オフラインフレームループ**  
   キャプションのみは `<video>` 再生・音声プリレンダ不要。`frameIndex / FPS` で時刻を進め、Canvas を直接 encode する。既存の wall-dilation / backpressure 複雑さを避ける。

   キャプショングリフは2倍解像度のオフスクリーン Canvas へ描き、出力キャンバスへ高品質縮小する。同一グリフはセッション内でキャッシュし、毎フレームの再ラスタライズによるGC負荷と輪郭品質の揺れを抑える。

2. **描画の単一ソース**  
   キャプション + タイトル描画を `captionLayerRender` に寄せ、通常 composite の caption 段も可能な範囲で再利用し WYSIWYG を保つ。

3. **音声**  
   動画のみ（audio track なし）を優先。コンテナ互換で必須なら無音 AAC を後から検討。

4. **alpha WebM**  
   `VideoFrame` + VP8/VP9 + `webm-muxer` または MediaRecorder。実装難度が高いため Phase 後半。非対応時は黒背景へフォールバック。

   文字と透明境界の圧縮荒れを抑えるため、caption-layer は通常動画の2倍ビットレートを要求し、対応ブラウザには `contentHint = 'detail'` を指定する。

5. **字幕**  
   `captionTimeline` の時分割結果をキュー化。SRT/VTT は UTF-8。位置情報は入れない（プレイヤー任せ）。

### 受け入れ条件マッピング

| Issue 受け入れ | 対応 |
|----------------|------|
| エクスポート設定に「キャプションのみ出力」がある | R1 UI |
| 元の動画映像が含まれない | R2 |
| alpha または黒背景 | R3（必須）/ R4（推奨） |

---

## 実装計画

### Phase 0: 契約・純ロジック (0.5h)

**目標**: 型と形式解決・字幕生成の純関数を用意する

タスク:
- [ ] 型追加（`ExportContentMode` 等）
- [ ] `captionLayerExport.ts`（既定値・拡張子・MIME・ファイル名）
- [ ] `captionSubtitle.ts`（SRT/VTT）
- [ ] ユニットテスト

**完了条件**:
- [ ] 純ロジックテストがパスする
- [ ] ビルドが成功する

---

### Phase 1: キャプションレイヤー描画 (1–2h)

**目標**: 任意時刻に「マット + キャプション + タイトル」だけを Canvas へ描ける

タスク:
- [ ] `captionLayerRender.ts` に描画を集約（既存 caption/title ロジックを移植 or 呼び出し）
- [ ] standard `renderFrame` から export caption-layer 時に利用
- [ ] luminance-key 時は fill を白に強制

**完了条件**:
- [ ] 既存 preview テストがパスする
- [ ] 描画ユニットテスト追加

---

### Phase 2: オフライン export 経路 (2–3h)

**目標**: standard で黒背景 / 白文字キー MP4 のキャプションのみ書き出し

タスク:
- [ ] `startExport` に `ExportOutputOptions` を渡せるようにする
- [ ] caption-layer 時: 音声解析スキップ、オフライン encode
- [ ] UI store / download 拡張子連携
- [ ] キャンセル・ObjectURL 解放

**完了条件**:
- [ ] 完成動画経路の既存テストがパスする
- [ ] caption-layer の主要経路テスト

---

### Phase 3: UI 統合 (1h)

**目標**: Preview からモード・形式を選べる

タスク:
- [ ] PreviewSection にオプション UI
- [ ] TurtleVideo 配線
- [ ] sectionHelp 更新
- [ ] キャプション0件では「キャプションのみ」を無効化し、選択後に全削除された場合は完成動画へ戻す

---

### Phase 4: 字幕ファイル (1h)

**目標**: SRT/VTT をダウンロード可能にする

タスク:
- [ ] 動画と同時、または独立ボタン
- [ ] `fileSave` 経由で保存

---

### Phase 5: 透過 WebM (1–2h)

**目標**: alpha-webm を standard で提供（可能なら）

タスク:
- [ ] 対応判定
- [ ] encode / mux
- [ ] 非対応時フォールバック

**リスク**: 環境差が大きい → 失敗時は黒背景へ自動フォールバックし、トーストで通知

---

### Phase 6: 仕上げ

タスク:
- [ ] 回帰テスト・lint・build
- [ ] overview スキル追記
- [ ] Issue #114 への進捗コメント（ユーザー依頼時）

---

## デグレ注意

- 既定 composite export の経路・ビットレート・尺合わせを変更しない
- export 中の ObjectURL リーク防止
- renderFrame の通常再生パスに caption-layer 分岐が混入しないこと
- apple-safari 契約（`UseExportReturn`）を壊さない（オプション引数は末尾 optional）

## 検証観点

1. 完成動画: 従来どおり焼き込み
2. キャプションのみ・黒背景: ベース映像なし、キャプション位置・時刻がプレビューと一致
3. 白文字キー: 文字が白、背景が黒
4. 字幕: 時分割行が個別キュー、時刻が秒精度で妥当
5. キャンセル: 途中停止で UI が戻る
6. 長尺: 数分でもハングしない（オフライン encode）
