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
        "detected_titles": ["動画・画像", "トランジション"],
        "detected_actions": ["追加", "コピー", "削除", "トリミング"],
        "detected_icons": ["Plus", "Copy", "Trash2"]
      }
    }
  }
  ```

### 1.2. `scaffold`
ヘルプ定義のスケルトン（JSON）を生成します。

```bash
python scripts/help_system_tool.py scaffold [--scan-file <scanned.json>] --output <skeleton.json>
```

- **入力**: `--scan-file`（`scan` コマンドで出力したJSON）
- **出力**: `--output`（カテゴリ親アコーディオン、直接表示項目、子アコーディオン、基本メタ項目を含むJSONファイル）

### 1.3. `validate`
ヘルプ定義ファイルが UX・アクセシビリティ・整合性ルールに準拠しているかを自動監査します。

```bash
python scripts/help_system_tool.py validate --file <help_definitions.json>
```

- **検証ルール**:
  - `concise-description`: 導入文が140文字以内か（警告）
  - `no-accordion-header-visual`: アコーディオン開閉ヘッダー枠の見本（`_accordion`）が含まれていないか（エラー）
  - `explain-visual-tokens`: 箇条書きのない孤立したビジュアルトークンが存在しないか（情報）
  - `basic-app-meta`: 動作環境、ライセンス、基本操作が含まれているか（警告）
- **終了コード**: エラーが 0 件なら `0`、エラーが存在すれば `1`
