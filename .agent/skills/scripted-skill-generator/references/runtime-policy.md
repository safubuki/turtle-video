# ランタイム確認とインストール確認方針

生成するスクリプトは Windows と Linux（Ubuntu）の両方で安定して動くことを前提にします。必要なランタイムが見つからない場合は、勝手にインストールせず、必ず選択式でユーザーに確認します。

## 推奨ランタイム

| 優先 | ランタイム | 使う場面 |
|------|------------|----------|
| 1 | Python 標準ライブラリ | 汎用処理、CSV/JSON、ファイル走査、統計集計、テキスト検証 |
| 2 | Node.js `.mjs` | Node.js/TypeScript プロジェクト、`package.json` や JSON 中心の作業 |
| 3 | PowerShell + Bash ペア | OS 固有操作が必要で、クロスプラットフォームを2本で吸収する場合 |

外部依存ライブラリ（`pip` や `npm` の追加パッケージ）は最小限にします。どうしても必要な場合は、依存名、用途、代替案、インストール確認手順を `SKILL.md` に明記します。

## 確認コマンド

実行環境に応じて次の順で確認します。

### Python の確認

Windows では `python3` が Microsoft Store の起動エイリアス（偽コマンド）に結びついており、未導入時にエラーやストア起動が起きるケースがあります。そのため、Windows と Linux で確認順を意識します。

```bash
# Windows（PowerShell / cmd）
python --version
py -3 --version

# Linux（Ubuntu） / macOS
python3 --version
python --version
```

- 終了コードが `0` かつ `Python 3.x.y` のようなバージョン文字列が返ったコマンドを採用します。
- 実行コマンド例には、環境で通ったコマンド（例: `python` または `python3`）を使います。

### Node.js の確認

```bash
node --version
```

### PowerShell Core を使う場合

```bash
pwsh --version
```

## 選択式質問の例

ランタイムがない場合は、`ask_question` / `request_user_input` 相当の選択 UI があればそれを使い、ない場合は短い番号付き選択肢で聞きます。

### スキル新規作成時にランタイムがない場合

質問: 想定ランタイム（例: Python）が見つかりません。どう進めますか？

1. ランタイムをインストールしてから実行・検証する
2. 別の利用可能なランタイム（例: Node.js）に変更する
3. 今回はスクリプトファイルだけ生成し、実行・検証は後で行う

### 生成済みスキルを実行するときにランタイムがない場合

質問: 必要なランタイム（例: Python）が見つかりません。どう進めますか？

1. ランタイムをインストールしてからスクリプトを実行する
2. 今回は実行を見送り、環境準備後に再実行する
3. 小規模な処理のため、AI による代替手順（手作業フォールバック）で進める（正確性や件数制限の注意付き）

## インストール提案の扱い

インストールはユーザーが明示的に選択した場合だけ行います。OS 別の候補を提示し、実行前にもう一度対象コマンドを明示して承認を得ます。

| OS | Python 候補 | Node.js 候補 |
|----|-------------|--------------|
| Windows | `winget install Python.Python.3` | `winget install OpenJS.NodeJS.LTS` |
| Ubuntu | `sudo apt update && sudo apt install python3` | `sudo apt update && sudo apt install nodejs npm` |

管理者権限、`sudo`、パッケージインストールは環境への影響が大きいため、ユーザーの明示承認なしに実行しません。

## クロスプラットフォーム互換性ルール

- **Python**:
  - `pathlib.Path`、`argparse`、`csv`、`json`、`subprocess.run(..., shell=False)` を優先する
  - 構文チェックなどで `py_compile` を対象スキル内で直接回さず、`compile()` / `ast.parse()` など `__pycache__` を残さない手段を選ぶ
  - Windows コンソール（CP932 等）での文字化けや `UnicodeEncodeError` を防ぐため、スクリプト起動時に `sys.stdout.reconfigure(encoding="utf-8", errors="replace")`（および `sys.stderr`）を検討し、ファイル入出力は必ず `encoding="utf-8"` を明示する
- **Node.js**:
  - `node:fs/promises`、`node:path`、`node:child_process` を `shell: false` で使う
  - 引数解析は未指定値（例: `--input` の直後に値がない）を明示エラーにする
- **共通**:
  - パス区切り文字 `/` や `\` を文字列連結で決め打ちしない。また `C:\Users\...` や `/home/...` のような環境固有パスをハードコードしない
  - 改行コードは出力ファイルで `LF`（`\n`）を基本にし、入力読み込みでは `CRLF` / `LF` および BOM 付き UTF-8（`utf-8-sig`）に耐えられるようにする
  - 文字コードは UTF-8 を既定にする。Excel で直接開く CSV が主用途の場合だけ `--bom` オプションまたは `utf-8-sig` を検討する
  - タイムゾーンが重要な集計では、入力と出力のタイムゾーンを引数または `SKILL.md` に明記する
