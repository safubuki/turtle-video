# ヘルプの図解ガイド（SVG）

ヘルプの文章だけでは伝わりにくい「流れ」「場所」「前と後の違い」「仕組み」を、SVG の図で見せるためのルール。お手本は [assets/diagrams/](../assets/diagrams/)（`preview.html` をブラウザで開くと 3 つの型をライト/ダークで見られる）。

---

## 1. 図にするか、しないか

図は「文章を読むより早く分かる」ときだけ入れる。飾りの図は読み手の注意を奪うだけなので入れない。

| 伝えたいこと | 使う型 | お手本 |
|---|---|---|
| 3 つ以上の手順の順番、データや素材がどこへ渡るか | 手順の流れ | `flow-steps.svg` |
| 画面のどこにあるか（「アプリ名の横の歯車」など） | 画面の場所 | `screen-callouts.svg` |
| 設定をオンにすると何が変わるか | 前と後 | `before-after.svg` |
| 配分・計算・処理のしくみ（時間の割り振り、自動調整） | 流れの型を応用した構造図 | `flow-steps.svg` を元に組む |
| ボタン 1 つの意味 | 図にしない。操作見本（visuals）を箇条書きの直下に置く | SKILL.md Step 3 |
| 2〜3 行で言えること | 図にしない。文章で書く | — |

**1 つの図で伝えることは 1 つ。** 流れと場所を同時に描かない。

### 根拠

| 原則 | 内容 | 確度 |
|---|---|---|
| マルチメディア原理（Mayer） | 文章だけより、文章＋図のほうが理解が深まる。初学者ほど効果が大きい | 研究（実験の積み重ね） |
| 空間的近接の原理（Mayer） | 説明文は図の該当箇所の近くに置く。離すと探す手間で理解が落ちる。→ 図の番号と本文の番号をそろえ、図のすぐ横・下に説明を置く | 研究 |
| 一貫性の原理（Mayer） | 関係のない飾り（装飾画像・凝った背景）は理解を下げる | 研究 |
| 信号の原理（Mayer） | 大事な所を強調すると理解が上がる。→ いま説明している場所だけ強調色で囲む | 研究 |
| ヘルプとドキュメント（Nielsen の 10 ヒューリスティクス #10） | ヘルプは利用者の作業に沿い、具体的な手順を示し、短くする | 実務の定番原則 |

出典：Richard E. Mayer『Multimedia Learning』（Cambridge University Press）、Nielsen Norman Group「10 Usability Heuristics for User Interface Design」。

---

## 2. 書き方のルール

### 大きさ（スマホで読めること）

| ルール | 値 |
|---|---|
| viewBox の幅 | **400 以下**を基本にする（スマホの幅 343px に縮めても文字が読める） |
| 文字の大きさ | viewBox の中で **14 以上**。幅 343px で表示したとき **12px 以上** になること（`validate --svg` が計算する） |
| 日本語の幅 | 全角 1 文字 ≒ 文字サイズ 1 つ分。枠の幅に 1 割の余白を残す |
| 流れの向き | 手順は**縦に並べる**（横並びはスマホで文字が小さくなる） |
| 長い説明 | SVG の中に書かない。図には番号だけ振り、説明は図の外の HTML に書く（折り返せて、読み上げもできる） |

### 中身

- **画面は略図にする。** スクリーンショットや本物そっくりの絵は、UI を変えるたびに古くなる。場所が分かる程度の箱と記号で描く
- **矢印には「何が渡るか」を書く**（「選んだ素材がカードになる」）。向きだけの矢印は意味が伝わらない
- **番号は本文の箇条書きと同じ**にする。図の ① と本文の ① が同じものを指す
- **いま説明している所だけ強調色**（アクセント色の枠と薄い塗り）。他はグレー
- 前と後の見出しは「悪い/良い」ではなく**状態**（「オフ/オン」「変更前/変更後」）と、見た目の違い

### 色とテーマ

- 色は `var(--hd-text, #1f2933)` のように **CSS 変数＋既定色**で指定する
- `<style>` の中に `@media (prefers-color-scheme: dark)` を書き、ダーク用の既定色を入れる
- 文字は背景に対して **4.5:1 以上**、線や枠は **3:1 以上**。お手本の色はこの条件を満たしている

| 変数 | ライト | ダーク | 用途 |
|---|---|---|---|
| `--hd-bg` | `#ffffff` | `#111827` | 画面の外枠の塗り |
| `--hd-surface` | `#f3f5f8` | `#1f2937` | 箱・領域 |
| `--hd-line` | `#7b8494` | `#7d8796` | 枠線・矢印（3:1 以上） |
| `--hd-text` | `#1f2933` | `#f3f4f6` | 見出し |
| `--hd-muted` | `#4b5563` | `#c4c9d2` | 説明文（4.5:1 以上） |
| `--hd-accent` | `#1d4ed8` | `#8fb0ff` | 番号・強調 |
| `--hd-on-accent` | `#ffffff` | `#0b1220` | 番号の文字 |
| `--hd-accent-soft` | `#e8efff` | `#1e2a4a` | 強調する領域の塗り |

### 読み上げ・保守

- ルートに `role="img"` と `aria-labelledby`、中に `<title>`（図の名前）と `<desc>`（図の要点を 1〜2 文）
- 文字は `<text>` で書く。アウトライン化（path 化）すると検索・翻訳・修正ができない
- `<style>` のクラス名には図ごとの接頭辞を付ける（`hd-flow-` など）。インライン SVG の `<style>` はページ全体に効く
- 外部 URL・埋め込み画像・`<foreignObject>` を使わない

---

## 3. アプリへの埋め込み方

| 方法 | 向いている場面 | テーマ |
|---|---|---|
| `<img src="flow.svg" alt="…">` | 静的なヘルプ、ファイルで管理したい | OS のライト/ダークに追従。ページの CSS は効かない |
| インライン SVG（React コンポーネントなど） | アプリ内の切り替えボタンでテーマを変える | 親要素で `--hd-*` をアプリのトークンに対応付ける |

```tsx
// アプリのテーマ変数に合わせる（アプリ独自のテーマ切り替えにも追従する）
<figure className="help-diagram" style={{
  '--hd-text': 'var(--text)', '--hd-muted': 'var(--text-muted)',
  '--hd-surface': 'var(--surface-2)', '--hd-line': 'var(--border-strong)',
  '--hd-accent': 'var(--accent)', '--hd-on-accent': 'var(--on-accent)',
} as React.CSSProperties}>
  <FlowSteps />            {/* SVG を貼ったコンポーネント。vite なら vite-plugin-svgr で import も可 */}
  <figcaption className="sr-only">…</figcaption>
</figure>
```

- `<img>` の `alt` には図の要点を書く（「図」「イメージ」だけにしない）
- 図の幅は `width: 100%; max-width: 400px; height: auto;`

---

## 4. Mermaid を使うとき

| 場面 | やり方 |
|---|---|
| README や設計メモ（GitHub の Markdown） | Mermaid をそのまま書いてよい（GitHub が描画する） |
| アプリ内ヘルプ | **実行時に Mermaid を読み込まない。** 作成時に SVG へ書き出して同梱するか、最初から SVG を書く |
| 要素が 10 個以下の図 | **SVG を直接書く**ほうが、大きさ・スマホ表示・色を思いどおりにできる |
| 要素が多い流れ図・シーケンス図 | Mermaid で下書きして SVG に書き出し、色と文字サイズを直す |

書き出し例（Node.js が必要。勝手にインストールせず、ユーザーに確認する）：

```bash
npx -p @mermaid-js/mermaid-cli mmdc -i flow.mmd -o flow.svg -c mermaid-config.json
```

```json
{ "htmlLabels": false, "flowchart": { "htmlLabels": false } }
```

- `htmlLabels` を切らないと文字が `<foreignObject>` になり、`<img>` 埋め込みや他のアプリで文字が消えることがある
- 横向き（`flowchart LR`）は横に長くなり、スマホで文字が小さくなる。`flowchart TD`（縦）にする
- 書き出した SVG も `validate --svg` にかける

---

## 5. 確認

```bash
# 機械検査：viewBox、読み上げ名、幅 343px での文字サイズ、画像・外部 URL・foreignObject、テーマ
python scripts/help_system_tool.py validate --svg src/assets/help/ --min-width 343
```

- 実際の画面で、スマホ幅とダークモードの両方を目で見る。elite-ux-architect スキルがあれば `node <elite-ux-architect>/scripts/capture.mjs <ページ> --viewports mobile --theme both` で撮れる
- 図の番号と本文の番号、図の文言とアプリのボタン名が一致しているか確かめる（ボタン名を変えたら図も直す）
