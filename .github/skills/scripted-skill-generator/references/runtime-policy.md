# ランタイム確認とインストール確認方針

生成するスクリプトは Windows と Linux(Ubuntu) の両方で使えることを前提にする。ランタイムがない場合は、勝手にインストールせず、必ず選択式でユーザーに確認する。

## 推奨ランタイム

| 優先 | ランタイム | 使う場面 |
|------|------------|----------|
| 1 | Python 標準ライブラリ | 汎用、CSV/JSON、ファイル走査、統計処理 |
| 2 | Node.js `.mjs` | Node.js/TypeScript プロジェクト、package.json が中心の作業 |
| 3 | PowerShell + Bash ペア | OS ネイティブ操作が必要で、クロスプラットフォームを2本で吸収する場合 |

外部依存は最小限にする。依存を追加する場合は、依存名、用途、代替案、インストール確認を SKILL.md に明記する。

## 確認コマンド

Windows/Linux 共通で最初に確認する：

```bash
python --version
python3 --version
node --version
```

PowerShell Core を使う場合：

```bash
pwsh --version
```

## 選択式質問の例

ランタイムがない場合は、askQuestions や `request_user_input` 相当の UI があれば使う。ない場合は番号付きで聞く。

### Python がない場合

質問: Python が見つかりません。どう進めますか？

1. Python をインストールしてから実行する
2. Node.js 版のスクリプトに変更する
3. 今回はスクリプトファイルだけ生成し、実行は後で行う

### Node.js がない場合

質問: Node.js が見つかりません。どう進めますか？

1. Python 標準ライブラリ版に変更する
2. Node.js をインストールしてから実行する
3. 今回はスクリプトファイルだけ生成し、実行は後で行う

## インストール提案の扱い

インストールはユーザーが選択した場合だけ行う。OS 別の候補を提示し、実行前にもう一度対象コマンドを明示する。

| OS | Python 候補 | Node.js 候補 |
|----|-------------|--------------|
| Windows | `winget install Python.Python.3` | `winget install OpenJS.NodeJS.LTS` |
| Ubuntu | `sudo apt update && sudo apt install python3` | `sudo apt update && sudo apt install nodejs npm` |

管理者権限、`sudo`、パッケージインストールは影響が大きいため、ユーザーの明示承認なしに実行しない。

## スクリプト側の互換性ルール

- Python: `pathlib.Path`、`argparse`、`csv`、`json`、`subprocess.run(..., shell=False)` を優先する
- Node.js: `node:fs`、`node:path`、`node:child_process` を `shell: false` で使う
- パス区切り文字 `/` や `\` を文字列連結で決め打ちしない
- 文字コードは UTF-8 を既定にする。Excel で開く CSV が主用途の場合だけ `utf-8-sig` を検討する
- タイムゾーンが重要な集計では、入力と出力のタイムゾーンを引数または SKILL.md に明記する
