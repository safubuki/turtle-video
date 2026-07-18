# F1: キャプションのシステムフォント拡張 - 仕様書

## 概要

キャプションの字体を現在の 2 種（ゴシック/明朝）に加え、端末に組み込まれたシステムフォントを
利用した字体を選択できるようにする。既存の「2 択で迷わず選べる」簡単さは維持する。

## 背景・課題

- 現在は `CaptionFontStyle = 'gothic' | 'mincho'` の 2 択のみで表現の幅が狭い。
- ブラウザの Canvas 描画は CSS フォントスタック指定で端末のシステムフォントをそのまま使えるため、
  フォントファイルの同梱なしで表現を広げられる。
- Android Chrome にはフォント列挙 API（Local Font Access API）が無いため、
  「実在フォントの列挙」ではなく「主要システムフォントに解決される厳選プリセット」方式を採る。

## 要件一覧

| # | 要件 | 優先度 | 説明 |
|---|------|--------|------|
| R1 | 既存 2 択 UI の維持 | 必須 | ゴシック/明朝ボタンは現状のまま先頭に表示 |
| R2 | 拡張フォントプリセット | 必須 | 丸ゴシック/手書き風/等幅/端末標準 の 4 種を追加（計 6 種） |
| R3 | ライブプレビュー | 必須 | 拡張フォント選択 UI は各フォント自身で描画したプレビュー付き |
| R4 | Android/PC 限定 | 必須 | 拡張フォントの選択 UI は standard フレーバーのみ表示 |
| R5 | 描画フォールバック | 必須 | 未知の fontStyle 値は sans-serif へフォールバック（iOS 含む全描画パス） |
| R6 | 個別 override 対応 | 必須 | キャプション個別設定モーダルでも拡張フォントを選択可能 |
| R7 | 実フォント列挙（PC Chrome） | 将来 | `queryLocalFonts` による実列挙 + 自由入力は次サイクル検討 |

## データ構造

```ts
// src/types/index.ts（追加値のみ・破壊なし）
export type CaptionFontStyle =
  | 'gothic' | 'mincho'                    // 既存
  | 'rounded' | 'handwriting' | 'mono' | 'system'; // 追加
```

フォント解決はフレーバー中立の単一カタログに集約する:

```ts
// src/utils/captionFontCatalog.ts（新設）
resolveCaptionFontFamily(style: CaptionFontStyle | undefined): string  // 未知値は sans-serif
CAPTION_FONT_OPTIONS: { value; label; family }[]                       // UI 用（基本2 + 拡張4）
```

各プリセットの CSS スタック（端末に無いフォントは総称ファミリへフォールバック）:

| value | label | スタック概要 |
|-------|-------|--------------|
| gothic | ゴシック | sans-serif（現状維持） |
| mincho | 明朝 | 游明朝/ヒラギノ明朝/Noto Serif JP/serif（現状維持+Noto追加） |
| rounded | 丸ゴシック | M PLUS Rounded 1c / ヒラギノ丸ゴ / HG丸ｺﾞｼｯｸM-PRO / sans-serif |
| handwriting | 手書き風 | Klee One / UDデジタル教科書体 / Yu Kyokasho / cursive |
| mono | 等幅 | Consolas / Menlo / MS Gothic / monospace |
| system | 端末標準 | system-ui（Android=Roboto系, Windows=Segoe UI/Yu Gothic UI） |

## 画面仕様

- **一括設定（CaptionSection）**: 字体行はゴシック/明朝ボタン + 「その他」ボタン（standard のみ）。
  「その他」タップでフォントカードのグリッドをインライン展開。各カードは
  `あア亜 Aa1` をそのフォントで描画。選択中カードは黄色ハイライト。
- **個別設定（CaptionSettingsModal）**: 同様に「デフォルト/ゴシック/明朝 + その他」構成。
- 拡張フォント選択中に iOS でプロジェクトを開いた場合: UI は既存 2 択のまま
  （選択状態はどれにも該当せず）、描画はフォールバック（sans-serif）。データは保持される。

## 影響を受けるファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/types/index.ts` | `CaptionFontStyle` へ 4 値追加 |
| `src/utils/captionFontCatalog.ts` | 新設: カタログ + 解決関数 |
| `src/flavors/standard/preview/usePreviewEngine.ts` | インライン fontFamilyMap をカタログ参照へ置換 |
| `src/flavors/apple-safari/preview/usePreviewEngine.ts` | 型互換のみ: 未知値→sans-serif フォールバック（挙動不変） |
| `src/components/turtle-video/usePreviewEngine.ts` | 凍結レガシー: 型互換フォールバックのみ |
| `src/components/sections/CaptionSection.tsx` | 拡張フォント選択 UI（standard のみ表示） |
| `src/components/modals/CaptionSettingsModal.tsx` | 個別 override の拡張フォント UI（standard のみ表示） |

## テスト計画

- `captionFontCatalog` の解決関数ユニットテスト（既知 6 値 + 未知値フォールバック）。
- 既存 preview/caption 関連テストの回帰確認。
