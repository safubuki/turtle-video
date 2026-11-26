# Script Contract: help_system_tool.py

`scripts/help_system_tool.py` の入出力仕様および動作契約です。

---

## 1. コマンド一覧

### 1.1. `scan`
ソースコードを解析し、UI要素、ボタン、アイコン、見出しを収集します。

```bash
python scripts/help_system_tool.py scan --src <source_dir> [--output <output.json>]
```

- **入力**: `--src`（スキャン対象のソースディレクトリ。既定: `src`）
- **出力**:
  ```json
  {
    "sections": {
      "clips": {
        "source_file": "components/sections/ClipsSection.tsx",
        "is_modal": false,
        "has_api_key_dependency": false,
        "detected_titles": ["動画・画像", "トランジション"],
        "detected_actions": ["追加", "コピー", "削除", "トリミング"],
        "detected_icons": ["Plus", "Copy", "Trash2"],
        "detected_links": []
      }
    }
  }
  ```

### 1.2. `scaffold`
ヘルプ定義のスケルトン（JSON）を生成します。

```bash
python scripts/help_system_tool.py scaffold [--scan-file <scanned.json>] --output <skeleton.json> [--dry-run]
```

- **入力**: `--scan-file`（`scan` コマンドで出力したJSON）
- **出力**: `--output`（カテゴリ親アコーディオン、直接表示項目、子アコーディオン、基本メタ項目、リアル操作パネル見本・前提条件案内を含むJSONファイル）

### 1.3. `validate`
ヘルプ定義ファイルが UX・アクセシビリティ・整合性・アーキテクチャルールに準拠しているかを自動監査します。

```bash
python scripts/help_system_tool.py validate --file <help_definitions.json>
```

- **検証ルール**:
  - `concise-description`: 導入文が140文字以内か（警告）
  - `no-accordion-header-visual`: アコーディオン開閉ヘッダー枠の見本（`_accordion`）が含まれていないか（エラー）
  - `forbid-crowded-visual-dump`: 4つ以上の操作見本が末尾に固まって羅列されていないか。実画面通りの操作パネル見本（`_panel_demo`）への昇華やインライン化を推奨（警告）
  - `explain-visual-tokens`: 箇条書きのない孤立したビジュアルトークンが存在しないか（情報）
  - `no-state-description`: 見たら自明な状態・位置の記述（「初期状態は閉じて」「開くと」等）が含まれていないか（警告）
  - `recommend-structured-facts`: 比例配分・時分割などの計算や一括処理ロジックに対し、`facts` や `comparison` で構造化されているか（情報）
  - `check-important-notes`: APIキー等の事前前提条件がある項目で、設定済みユーザーに対する動的非表示制御（ノイズ低減）が考慮されているか（情報）
  - `no-anxiety-inducing-terms`: APIキー説明に「直接通信」「APIへ送信」等の漏洩不安を煽るキーワードが含まれていないか（警告）
  - `recommend-security-clarity`: APIキー説明に「ブラウザ内（ローカル）にのみ安全に保存され、外部サーバーには送信されません」という安心文言が含まれているか（情報）
  - `accurate-location-phrasing`: 「右上の設定」等の古い位置説明が含まれず、実画面（「アプリ名の横の歯車アイコン」等）と一致しているか（警告）
  - `no-misplaced-section-items`: 他セクション管轄の機能（例: キャプションセクション内のタイトル設定等）が混入していないか（エラー）
  - `basic-app-meta`: 動作環境、ライセンス、基本操作が含まれているか（警告）
- **終了コード**: エラーが 0 件なら `0`、エラーが存在すれば `1`


### 1.4. `validate --component`
ヘルプ UI コンポーネント（TSX/JSX）のスマホ 2 行ヘッダー、インデント、ボタン改行防止、Mermaid の実行時読み込み（`prefer-prebuilt-svg-diagram`、情報）を検査します。

### 1.5. `validate --svg`
ヘルプの図（SVG）を検査します。ファイルかフォルダを指定し、複数回指定できます。

```bash
python scripts/help_system_tool.py validate --svg <file_or_dir> [--svg <...>] [--min-width 343]
```

- **検証ルール**:
  - `svg-viewbox`: ルートの `<svg>` に viewBox があるか（エラー）
  - `svg-accessible-name`: `role="img"` と `<title>` または `aria-label(ledby)` があるか（エラー）。`aria-hidden="true"` は情報として通知
  - `svg-min-text-size`: 最小の文字サイズ × (`--min-width` ÷ viewBox の幅) が 12px 以上か（警告）。`font-size` 属性、`font-size:` 、`font:` 省略記法を読む。文字があってサイズ指定が無い場合は 16 とみなす
  - `svg-text-as-text`: `<text>` が 1 つも無く `<path>` だけで描かれていないか（警告）
  - `svg-no-raster`: PNG/JPEG/WebP の画像を埋め込んでいないか（警告）
  - `svg-no-external`: 外部 URL を読み込んでいないか（エラー）
  - `svg-no-foreignobject`: `<foreignObject>` を使っていないか（警告）
  - `svg-theme-colors`: 固定色だけで、`prefers-color-scheme` / `currentColor` / `var(--…)` のどれも無いか（情報）
  - `svg-scoped-class-names`: `<style>` のクラス名に接頭辞（ハイフン入り）があるか（情報）
  - `svg-file-size`: 100KB を超えていないか（警告）
- **出力**: `{"valid": bool, "min_width": int, "files": [{"file", "valid", "issues": [{"severity", "rule", "message", "details?"}]}]}`
- **終了コード**: `--file` / `--component` / `--svg` のどれかでエラーがあれば `1`、なければ `0`
