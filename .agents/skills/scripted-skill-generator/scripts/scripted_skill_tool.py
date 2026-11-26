#!/usr/bin/env python3
"""スクリプト活用型 Agent Skill の雛形生成と静的検証を行う補助ツール。

Windows と Linux（Ubuntu）の両方で追加依存なしに動くよう、
Python 標準ライブラリのみで構成しています。
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


SKILL_NAME_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
SCRIPT_NAME_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_-]*$")
MARKDOWN_LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")

# 自己検証時にこのソース自体を誤検知しないよう、検出対象文字列は分割して組み立てる。
DANGEROUS_PATTERNS = [
    "".join(("rm", " -rf")),
    "".join(("Remove-Item", " -Recurse", " -Force")),
    "".join(("sudo", " ")),
    "".join(("curl", " ")),
    "".join(("wget", " ")),
    "".join(("Invoke", "-WebRequest")),
    "".join(("id", "_rsa")),
    "".join(("shell", "=True")),
    "".join(("os.", "system(")),
    "".join(("ev", "al(")),
    "".join(("ex", "ec(")),
]
ENV_FILE_RE = re.compile(r"""(?:['"/\\]|^)\.en""" + r"""v(?:\.local|\.production|\.development)?(?:['"\s),]|$)""")
HARDCODED_WIN_PATH_RE = re.compile(r"""(?:^|[\s'"(])[A-Za-z]:""" + r"""\\(?:Users|Windows|Program Files|git_home)\\""")
HARDCODED_POSIX_HOME_RE = re.compile(r"""(?:^|[\s'"(])/""" + r"""(?:home|Users)/[A-Za-z0-9._-]+/""")
TEMPLATE_LEFTOVER_TOKENS = [
    "".join(("replace-", "this-template")),
    "".join(("TODO:", "業務固有")),
]
GENERIC_TRIGGER_LEFTOVERS = [
    "".join(("「scripted ", "skill」")),
    "".join(("「定型", "処理」")),
    "".join(("「スクリプト", "実行」")),
]
YAML_BLOCK_SCALARS = {"|", ">", "|-", ">-", "|+", ">+"}

PATTERN_META = {
    "pipeline": {
        "label": "パターンA: 決定論パイプライン型",
        "overview_suffix": "取得・正規化・集計・固定形式出力",
        "ai_before": "依頼や既存構成からの実行条件・対象範囲・可変オプション設定",
        "var_boundary": "期間、入力元、出力先、形式（CSV/JSON）などの CLI 引数",
        "script_role": "データ取得、正規化、集計、固定形式出力、上書き保護",
        "ai_after": "出力の要点整理、異常値・警告の解釈、次のアクション提案",
        "step1": "依頼や既存ファイルから対象ファイル・期間・出力先・認証の有無を整理します（推定不能な必須項目や破壊的操作がある場合のみユーザーへ確認します）。",
    },
    "ai-to-script": {
        "label": "パターンB: AI設計 ＋ スクリプト実行型",
        "overview_suffix": "中間データの検証・計算・変換・固定形式出力",
        "ai_before": "曖昧な要望の整理、構成案の設計、中間データ（JSON/Markdown）の作成",
        "var_boundary": "AI が生成した中間データファイル、およびスタイル・形式などの CLI 引数",
        "script_role": "中間データのスキーマ検証、決定論的な計算・変換・生成、上書き保護",
        "ai_after": "生成結果と警告の確認、フィードバックに応じた中間データの調整",
        "step1": "ユーザーの要望を整理し、スクリプトが受け取れる中間データ（JSON または Markdown）と出力オプションを準備します（目的が曖昧な必須点がある場合のみ確認します）。",
    },
    "script-to-ai": {
        "label": "パターンC: スクリプト収集・検証 ＋ AI判断型",
        "overview_suffix": "対象走査・事実データ収集・機械的ルール検証",
        "ai_before": "調査対象・除外ルール・チェック観点の設定",
        "var_boundary": "対象パス、除外パターン、ルール設定・閾値などの CLI 引数",
        "script_role": "全件走査、客観データの収集、規約違反や異常候補の機械的検出・構造化出力",
        "ai_after": "検出結果の優先度判定、文脈を踏まえた原因分析と改善提案の作成",
        "step1": "調査・チェックの対象ディレクトリ、除外条件、出力形式を既存構成から整理します（対象が特定できない場合のみ確認します）。",
    },
}


@dataclass
class CheckResult:
    """validate コマンドが出力する 1 件の検証結果。"""

    level: str
    message: str


def configure_stdio() -> None:
    """Windows コンソール等でも UTF-8 出力で失敗しないよう標準入出力を整える。"""

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except OSError:
                pass


def clean_single_line(text: str) -> str:
    """改行や連続空白を 1 つのスペースへ正規化する。"""

    return re.sub(r"\s+", " ", text).strip()


def normalize_skill_name(value: str) -> str:
    """入力文字列を Agent Skills のハイフン区切り小文字名へ正規化する。"""

    name = value.strip().lower()
    name = re.sub(r"[^a-z0-9]+", "-", name)
    name = name.strip("-")
    return name[:64].strip("-")


def ensure_skill_name(value: str) -> str:
    """スキル名を正規化し、命名規則に合うか検証する。"""

    name = normalize_skill_name(value)
    if not name or not SKILL_NAME_RE.match(name):
        raise SystemExit(f"Invalid skill name: {value!r}")
    return name


def ensure_script_name(value: str | None, skill_name: str, runtime: str) -> str:
    """ランタイムに合った安全なスクリプトファイル名を返す（拡張子の重複を防止）。"""

    suffix = ".py" if runtime == "python" else ".mjs"
    if value:
        stem = value.strip()
        for ext in (".py", ".mjs", ".js", ".ps1", ".sh"):
            if stem.lower().endswith(ext):
                stem = stem[: -len(ext)]
                break
    else:
        stem = skill_name.replace("-", "_")
    stem = re.sub(r"[^A-Za-z0-9_-]+", "_", stem).strip("_-")
    if not stem or not SCRIPT_NAME_RE.match(stem):
        raise SystemExit(f"Invalid script name: {value!r}")
    return f"{stem}{suffix}"


def format_skill_path_hint(output_arg: str, skill_name: str, override: str | None) -> str:
    """SKILL.md のコマンド例に載せる、環境非依存でそのまま叩きやすいパス表記を作る。"""

    if override:
        return override.replace("\\", "/").rstrip("/")
    raw = Path(output_arg)
    if raw.is_absolute():
        return f"<skill-dir>"
    normalized = output_arg.replace("\\", "/").rstrip("/")
    if normalized in ("", "."):
        return skill_name
    return f"{normalized}/{skill_name}"


def write_file(path: Path, content: str, apply: bool) -> None:
    """--apply 指定時のみファイルを作成し、未指定時はドライラン予定を表示する。"""

    if apply:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="\n")
        print(f"created: {path}")
    else:
        print(f"[dry-run] would create: {path}")


def python_script_template(script_name: str, purpose: str) -> str:
    """生成スキル用の Python 補助スクリプト雛形を組み立てる。"""

    clean_purpose = clean_single_line(purpose)
    doc_safe = clean_purpose.replace("\\", "\\\\").replace('"""', '\\"\\"\\"')
    purpose_literal = json.dumps(clean_purpose, ensure_ascii=False)
    placeholder_token = "".join(("replace-", "this-template"))

    return f'''#!/usr/bin/env python3
"""{doc_safe} を決定論的に実行する補助スクリプト。"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path


DEFAULT_COLUMNS = ["item", "value"]


def configure_stdio() -> None:
    """Windows 環境でも日本語出力で失敗しないよう UTF-8 を設定する。"""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except OSError:
                pass


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description={purpose_literal})
    parser.add_argument("--input", type=Path, help="入力ファイルまたはディレクトリ")
    parser.add_argument("--output", type=Path, help="出力先ファイルパス（省略時は標準出力へ JSON 出力）")
    parser.add_argument("--format", choices=["csv", "json"], default="csv", help="ファイル出力形式（既定: csv）")
    parser.add_argument("--dry-run", action="store_true", help="ファイルを書き込まずに実行予定だけを表示する")
    parser.add_argument("--force", action="store_true", help="既存の出力ファイルがある場合に上書きを許可する")
    parser.add_argument("--verbose", action="store_true", help="進捗情報を標準エラー出力へ表示する")
    return parser


def collect_rows(input_path: Path | None, verbose: bool = False) -> list[dict[str, str]]:
    """この関数を対象業務の決定論的ロジックに置き換えてください。"""
    if input_path is not None and not input_path.exists():
        raise FileNotFoundError(f"入力パスが存在しません: {{input_path}}")
    if verbose:
        print(f"[verbose] 入力を読み込みます: {{input_path or '(なし)'}}", file=sys.stderr)
    return [
        {{
            "item": "example",
            "value": "{placeholder_token}",
        }}
    ]


def resolve_columns(rows: list[dict[str, str]]) -> list[str]:
    """列順を安定させる（既定列を先頭に固定し、追加列は昇順で末尾へ並べる）。"""
    seen = list(DEFAULT_COLUMNS)
    extra = sorted({{key for row in rows for key in row.keys()}} - set(seen))
    return seen + extra


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    fieldnames = resolve_columns(rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2, sort_keys=True) + "\\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    configure_stdio()
    args = build_parser().parse_args(argv)
    rows = collect_rows(args.input, verbose=args.verbose)

    if args.dry_run:
        plan = {{
            "dry_run": True,
            "rows": len(rows),
            "format": args.format,
            "output": str(args.output) if args.output else None,
            "would_overwrite": bool(args.output and args.output.exists()),
        }}
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0

    if args.output is None:
        print(json.dumps(rows, ensure_ascii=False, indent=2, sort_keys=True))
        return 0

    if args.output.exists() and not args.force:
        raise FileExistsError(
            f"出力ファイルが既に存在します: {{args.output}}（上書きするには --force を指定してください）"
        )

    if args.format == "csv":
        write_csv(args.output, rows)
    else:
        write_json(args.output, rows)

    if args.verbose:
        print(f"[verbose] {{len(rows)}} 件を {{args.output}} へ書き込みました", file=sys.stderr)
    print(f"Wrote {{len(rows)}} row(s) to {{args.output}}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Error: {{exc}}", file=sys.stderr)
        raise SystemExit(1)
'''


def node_script_template(script_name: str, purpose: str) -> str:
    """生成スキル用の Node.js (.mjs) 補助スクリプト雛形を組み立てる。"""

    clean_purpose = clean_single_line(purpose)
    purpose_literal = json.dumps(clean_purpose, ensure_ascii=False)
    placeholder_token = "".join(("replace-", "this-template"))

    return f'''#!/usr/bin/env node
// 決定論的補助スクリプト
import {{ mkdir, stat, writeFile }} from "node:fs/promises";
import {{ dirname, resolve }} from "node:path";

const PURPOSE = {purpose_literal};
const DEFAULT_COLUMNS = ["item", "value"];

function requireValue(argv, index, flag) {{
  if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {{
    throw new Error(`${{flag}} には値が必要です`);
  }}
  return argv[index + 1];
}}

function parseArgs(argv) {{
  const args = {{ format: "json", dryRun: false, force: false, verbose: false, help: false }};
  for (let index = 0; index < argv.length; index += 1) {{
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--verbose") args.verbose = true;
    else if (arg === "--input") {{
      args.input = requireValue(argv, index, "--input");
      index += 1;
    }} else if (arg === "--output") {{
      args.output = requireValue(argv, index, "--output");
      index += 1;
    }} else if (arg === "--format") {{
      args.format = requireValue(argv, index, "--format").toLowerCase();
      index += 1;
    }} else {{
      throw new Error(`未対応の引数です: ${{arg}}`);
    }}
  }}
  return args;
}}

function printHelp() {{
  console.log(`${{PURPOSE}}

Usage: node scripts/{script_name} [options]

Options:
  --input <PATH>        入力ファイルまたはディレクトリ
  --output <PATH>       出力先ファイルパス（省略時は標準出力へ JSON 出力）
  --format <json|csv>   出力形式（既定: json）
  --dry-run             ファイルを書き込まずに実行予定だけを表示する
  --force               既存の出力ファイルがある場合に上書きを許可する
  --verbose             進捗情報を標準エラー出力へ表示する
  -h, --help            このヘルプを表示する`);
}}

async function pathExists(target) {{
  try {{
    await stat(target);
    return true;
  }} catch {{
    return false;
  }}
}}

async function collectRows(inputPath, verbose) {{
  // この関数を対象業務の決定論的ロジックに置き換えてください。
  if (inputPath) {{
    const absInput = resolve(inputPath);
    if (!(await pathExists(absInput))) {{
      throw new Error(`入力パスが存在しません: ${{absInput}}`);
    }}
  }}
  if (verbose) {{
    console.error(`[verbose] 入力を読み込みます: ${{inputPath || "(なし)"}}`);
  }}
  return [
    {{
      item: "example",
      value: "{placeholder_token}",
    }},
  ];
}}

function escapeCsvCell(value) {{
  const text = value === undefined || value === null ? "" : String(value);
  if (/[",\\r\\n]/.test(text)) {{
    return `"${{text.replaceAll('"', '""')}}"`;
  }}
  return text;
}}

function toCsv(rows) {{
  const extra = new Set();
  for (const row of rows) {{
    for (const key of Object.keys(row)) {{
      if (!DEFAULT_COLUMNS.includes(key)) extra.add(key);
    }}
  }}
  const columns = [...DEFAULT_COLUMNS, ...[...extra].sort()];
  const lines = [columns.map(escapeCsvCell).join(",")];
  for (const row of rows) {{
    lines.push(columns.map((col) => escapeCsvCell(row[col])).join(","));
  }}
  return lines.join("\\n") + "\\n";
}}

async function main() {{
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {{
    printHelp();
    return;
  }}
  if (!["json", "csv"].includes(args.format)) {{
    throw new Error("--format には json または csv を指定してください");
  }}

  const rows = await collectRows(args.input, args.verbose);
  const absOutput = args.output ? resolve(args.output) : null;
  const exists = absOutput ? await pathExists(absOutput) : false;

  if (args.dryRun) {{
    console.log(
      JSON.stringify(
        {{
          dry_run: true,
          rows: rows.length,
          format: args.format,
          output: absOutput,
          would_overwrite: exists,
        }},
        null,
        2
      )
    );
    return;
  }}

  const body = args.format === "csv" ? toCsv(rows) : JSON.stringify(rows, null, 2) + "\\n";
  if (!absOutput) {{
    process.stdout.write(body);
    return;
  }}
  if (exists && !args.force) {{
    throw new Error(`出力ファイルが既に存在します: ${{absOutput}}（上書きするには --force を指定してください）`);
  }}

  await mkdir(dirname(absOutput), {{ recursive: true }});
  await writeFile(absOutput, body, "utf8");
  if (args.verbose) {{
    console.error(`[verbose] ${{rows.length}} 件を ${{absOutput}} へ書き込みました`);
  }}
  console.log(`Wrote ${{rows.length}} row(s) to ${{absOutput}}`);
}}

main().catch((error) => {{
  console.error(`Error: ${{error.message}}`);
  process.exit(1);
}});
'''


def format_triggers(triggers_arg: str | None, title: str) -> str:
    """発火キーワード文字列を整形する（未指定時は要置換の TODO を明示する）。"""

    if triggers_arg:
        items = [clean_single_line(part) for part in triggers_arg.split(",") if clean_single_line(part)]
        if items:
            return "".join(f"「{item}」" for item in items)
    todo_marker = "".join(("TODO:", "業務固有の発火キーワードに置換"))
    return f"「{title}」「{todo_marker}」"


def skill_template(
    skill_name: str,
    title: str,
    purpose: str,
    script_name: str,
    runtime: str,
    pattern: str,
    skill_path_hint: str,
    triggers_arg: str | None,
) -> str:
    """生成スキルの SKILL.md を組み立てる。"""

    clean_purpose = clean_single_line(purpose)
    meta = PATTERN_META[pattern]
    triggers_text = format_triggers(triggers_arg, title)
    runtime_check = (
        "# Windows\npython --version\npy -3 --version\n\n# Linux (Ubuntu)\npython3 --version"
        if runtime == "python"
        else "node --version"
    )
    runner = (
        f"python {skill_path_hint}/scripts/{script_name}"
        if runtime == "python"
        else f"node {skill_path_hint}/scripts/{script_name}"
    )

    return f"""---
name: {skill_name}
description: {clean_purpose}。定型的な{meta["overview_suffix"]}を scripts/{script_name} へ委譲し、AI は条件設計・結果解釈・例外対応を行う Agent Skill。{triggers_text}などで発火。
---

# {title}

## スキル読み込み通知

このスキルが読み込まれたら、必ず以下の通知をユーザーに表示してください：

> **{title} スキルを読み込みました**  
> {clean_purpose}（定型処理は scripts/{script_name} で実行します）。

## 概要

このスキルは、{clean_purpose} のうち確率論によるブレを許さない処理を `scripts/{script_name}` に委譲し、文脈に応じた条件設定・例外対応・結果解釈は AI が担当します（採用パターン: **{meta["label"]}**）。

## 役割分担（3層分離）

| 層 | 担当 | 担う処理 |
|----|------|----------|
| 層3: 判断・解釈・対話（確率論） | AI（自然言語） | {meta["ai_before"]} / {meta["ai_after"]} |
| 層2: 可変境界（引数・中間データ） | CLI引数 / 中間ファイル | {meta["var_boundary"]} |
| 層1: 決定論コア（固定） | `scripts/{script_name}` | {meta["script_role"]} |

## 実行環境

実行前にランタイムを確認します：

```bash
{runtime_check}
```

必要なランタイムが見つからない場合は、勝手にインストールせず、ユーザーに選択式で確認します：

1. ランタイムをインストールしてから実行する
2. 今回は実行を見送り、環境準備後に再実行する
3. 小規模な対象であれば、AI による代替手順（正確性・件数制約の注意付き）で進める

## 手順

### Step 1: 入力と可変条件を整理する

{meta["step1"]}

### Step 2: ドライランで事前確認する

```bash
{runner} --dry-run --input <input> --output <output>
```

### Step 3: 本実行する

```bash
{runner} --input <input> --output <output>
```

### Step 4: 出力と警告を解釈する

スクリプトの出力と警告を読み、ユーザーの目的に合わせて要点、異常値、次のアクションを説明します。

## 失敗時の確認ポイント

- 終了コードが `0` 以外の場合は標準エラー出力（stderr）の原因と対象パスを確認する
- 既存の出力ファイル保護で停止した場合は、別名出力するかユーザー確認のうえ `--force` を付ける
- 想定外の入力形式や警告が出た場合は、スクリプトで推測補正せず状況に応じて判断・相談する

## スクリプト更新・見直し条件

- 入力形式、出力列、集計軸、対象 API やプロジェクト構造が変わったとき
- 同じ手作業や例外対応を2回以上繰り返したとき（スクリプトへ追加・昇格）
- 実行のたびにスクリプト本体を書き換えているとき（固定しすぎのサイン → 引数化または AI 判断層へ戻す）

## 参照

- [scripts/{script_name}](scripts/{script_name}) — 定型処理の実行スクリプト
- [references/script-contract.md](references/script-contract.md) — 入出力契約・3層境界・検証条件
"""


def contract_template(
    purpose: str,
    script_name: str,
    runtime: str,
    pattern: str,
    skill_path_hint: str,
) -> str:
    """生成スキル用の入出力契約ドキュメント（日本語）を組み立てる。"""

    clean_purpose = clean_single_line(purpose)
    meta = PATTERN_META[pattern]
    runner = (
        f"python {skill_path_hint}/scripts/{script_name}"
        if runtime == "python"
        else f"node {skill_path_hint}/scripts/{script_name}"
    )

    return f"""# スクリプト入出力契約

## 目的

{clean_purpose}

## 採用パターンと3層境界

- **採用パターン**: {meta["label"]}
- **層1（決定論コア・固定）**: {meta["script_role"]}
- **層2（可変境界）**: {meta["var_boundary"]}
- **層3（確率論的判断・AI）**: {meta["ai_before"]} / {meta["ai_after"]}

## 対象スクリプト

`scripts/{script_name}`

## 入力（CLI 引数）

- `--input`: 入力ファイルまたはディレクトリ
- `--output`: 出力先ファイルパス（省略時は標準出力へ JSON を出力）
- `--format`: 出力形式（`csv` または `json`）
- `--dry-run`: ファイルを書き込まずに実行予定と上書き有無を JSON で表示
- `--force`: 既存の出力ファイルがある場合に上書きを許可
- `--verbose`: 進捗情報を標準エラー出力（stderr）へ表示

## 出力と終了コード

- 安定した列順の CSV または整形済み JSON（UTF-8）
- データ本体は標準出力（stdout）、進捗やエラー詳細は標準エラー出力（stderr）へ分離
- 終了コード `0`: 正常終了
- 終了コード `1`: 入力不備・既存ファイル保護・実行時エラー

## 安全性ポリシー

- `--dry-run` 時はファイル書き込みを行わない
- 既存の出力ファイルがある場合は `--force` なしでは上書きしない
- シークレットや認証トークンをログ・出力ファイルに含めない

## 更新・見直し条件

- 入力形式、出力列、JSON スキーマが変わったとき
- 対象 API やプロジェクト構造が変わったとき
- 同じ手作業の例外対応を2回以上繰り返したとき（スクリプトへ昇格）
- 毎回スクリプト本体を書き換える状態になったとき（可変条件を引数・設定へ外出し、または AI 判断へ戻す）

## 検証コマンド

```bash
{runner} --help
{runner} --dry-run --input <input> --output <output>
```
"""


def scaffold(args: argparse.Namespace) -> int:
    """スクリプト活用型スキルの雛形を生成する（既定はドライラン）。"""

    skill_name = ensure_skill_name(args.name)
    runtime = args.runtime
    script_name = ensure_script_name(args.script_name, skill_name, runtime)
    target = Path(args.output).expanduser().resolve() / skill_name
    title = args.title or " ".join(part.capitalize() for part in skill_name.split("-"))
    skill_path_hint = format_skill_path_hint(args.output, skill_name, args.skill_path)

    if target.exists() and not args.force:
        raise SystemExit(f"Target already exists: {target}. Use --force to overwrite files.")

    script_body = (
        python_script_template(script_name, args.purpose)
        if runtime == "python"
        else node_script_template(script_name, args.purpose)
    )
    files = {
        target / "SKILL.md": skill_template(
            skill_name=skill_name,
            title=title,
            purpose=args.purpose,
            script_name=script_name,
            runtime=runtime,
            pattern=args.pattern,
            skill_path_hint=skill_path_hint,
            triggers_arg=args.triggers,
        ),
        target / "scripts" / script_name: script_body,
        target / "references" / "script-contract.md": contract_template(
            purpose=args.purpose,
            script_name=script_name,
            runtime=runtime,
            pattern=args.pattern,
            skill_path_hint=skill_path_hint,
        ),
    }

    for path, content in files.items():
        if path.exists() and not args.force:
            raise SystemExit(f"File already exists: {path}. Use --force to overwrite files.")
        write_file(path, content, args.apply)

    if not args.apply:
        print("[dry-run] add --apply to create files")
    return 0


def read_frontmatter(skill_md: Path) -> tuple[dict[str, str], bool, bool]:
    """SKILL.md から frontmatter を読み取る。

    Returns:
        (metadata, has_bom, has_multiline_description)
    """

    raw_bytes = skill_md.read_bytes()
    has_bom = raw_bytes.startswith(b"\xef\xbb\xbf")
    text = raw_bytes.decode("utf-8-sig", errors="replace").replace("\r\n", "\n")
    if not text.startswith("---\n"):
        return {}, has_bom, False
    end = text.find("\n---", 4)
    if end == -1:
        return {}, has_bom, False

    metadata: dict[str, str] = {}
    has_multiline_description = False
    last_key: str | None = None
    for line in text[4:end].splitlines():
        if not line.strip():
            continue
        if line[0] in (" ", "\t"):
            if last_key == "description":
                has_multiline_description = True
            continue
        if ":" in line:
            key, value = line.split(":", 1)
            key = key.strip()
            metadata[key] = value.strip()
            last_key = key
        else:
            last_key = None
    return metadata, has_bom, has_multiline_description


def strip_fenced_code_blocks(markdown_text: str) -> str:
    """Markdown 本文からコードフェンスブロックを除いたテキストを返す。"""

    lines: list[str] = []
    in_fence = False
    fence_char = ""
    fence_len = 0
    for line in markdown_text.splitlines():
        stripped = line.lstrip()
        match = re.match(r"^(`{3,}|~{3,})", stripped)
        if match:
            token = match.group(1)
            if not in_fence:
                in_fence = True
                fence_char = token[0]
                fence_len = len(token)
            elif token[0] == fence_char and len(token) >= fence_len and stripped[len(token) :].strip() == "":
                in_fence = False
            continue
        if not in_fence:
            lines.append(line)
    return "\n".join(lines)


def check_relative_links(skill_dir: Path, body: str) -> list[CheckResult]:
    """SKILL.md 本文中の相対 Markdown リンク切れを検出する（コードブロック内は除外）。"""

    results: list[CheckResult] = []
    plain = strip_fenced_code_blocks(body)
    for match in MARKDOWN_LINK_RE.finditer(plain):
        target = match.group(1).strip()
        if not target:
            continue
        # タイトル付きリンク [label](path "title") を考慮
        target = target.split()[0].strip("<>")
        if target.startswith(("http://", "https://", "mailto:", "file://", "#")):
            continue
        if any(ch in target for ch in ("{", "}", "<", ">")):
            continue
        rel_path = target.split("#", 1)[0].split("?", 1)[0]
        if not rel_path:
            continue
        resolved = (skill_dir / rel_path).resolve()
        if not resolved.exists():
            results.append(CheckResult("error", f"broken relative link in SKILL.md: {target}"))
    return results


def validate_script(path: Path) -> list[CheckResult]:
    """補助スクリプトの構文・安全性・互換性・テンプレート残骸を検証する（副作用なし）。"""

    results: list[CheckResult] = []
    text = path.read_text(encoding="utf-8-sig", errors="replace")

    for pattern in DANGEROUS_PATTERNS:
        if pattern in text:
            results.append(CheckResult("warning", f"{path}: contains sensitive or dangerous pattern {pattern!r}"))
    if ENV_FILE_RE.search(text):
        results.append(CheckResult("warning", f"{path}: references a .env file; confirm secret handling"))
    if HARDCODED_WIN_PATH_RE.search(text) or HARDCODED_POSIX_HOME_RE.search(text):
        results.append(CheckResult("warning", f"{path}: contains hardcoded machine-specific path"))
    for token in TEMPLATE_LEFTOVER_TOKENS:
        if token in text:
            results.append(CheckResult("warning", f"{path}: contains unreplaced template placeholder {token!r}"))

    if "--help" not in text and "argparse" not in text:
        results.append(CheckResult("warning", f"{path}: no visible --help or argparse support"))
    if (
        any(token in text for token in ["write_text", "writeFile", "open(", "mkdir", "unlink", "remove("])
        and "--dry-run" not in text
    ):
        results.append(CheckResult("warning", f"{path}: writes or modifies files but has no --dry-run mention"))

    if path.suffix == ".py":
        # py_compile は __pycache__ を生成してリポジトリを汚すため、インプロセスの compile() で検証する。
        try:
            compile(text, str(path), "exec")
        except SyntaxError as exc:
            results.append(CheckResult("error", f"{path}: Python syntax error at line {exc.lineno}: {exc.msg}"))

    if path.suffix == ".mjs":
        node = shutil.which("node")
        if node:
            proc = subprocess.run([node, "--check", str(path)], capture_output=True, text=True)
            if proc.returncode != 0:
                results.append(CheckResult("error", f"{path}: Node check failed: {proc.stderr.strip()}"))
        else:
            results.append(CheckResult("info", f"{path}: node not found; skipped node --check"))

    return results


def validate(args: argparse.Namespace) -> int:
    """生成・改善済みスキルの構造、ドキュメント、補助スクリプトを検証する。"""

    skill_dir = Path(args.skill).expanduser().resolve()
    results: list[CheckResult] = []
    skill_md = skill_dir / "SKILL.md"
    scripts_dir = skill_dir / "scripts"
    is_self_skill = False

    if not skill_md.exists():
        results.append(CheckResult("error", f"missing SKILL.md: {skill_md}"))
    else:
        metadata, has_bom, has_multiline_desc = read_frontmatter(skill_md)
        if has_bom:
            results.append(CheckResult("warning", "SKILL.md has UTF-8 BOM; prefer UTF-8 without BOM"))
        name = metadata.get("name", "")
        description = metadata.get("description", "")
        is_self_skill = name == "scripted-skill-generator"
        if not SKILL_NAME_RE.match(name):
            results.append(CheckResult("error", f"invalid or missing frontmatter name: {name!r}"))
        elif name != skill_dir.name:
            results.append(
                CheckResult("warning", f"frontmatter name {name!r} does not match directory name {skill_dir.name!r}")
            )
        if not description:
            results.append(CheckResult("error", "missing frontmatter description"))
        if description in YAML_BLOCK_SCALARS or has_multiline_desc:
            results.append(CheckResult("warning", "description should be one line without YAML block syntax"))

        if not is_self_skill:
            for token in GENERIC_TRIGGER_LEFTOVERS + TEMPLATE_LEFTOVER_TOKENS:
                if token in description:
                    results.append(
                        CheckResult(
                            "warning",
                            f"description contains generic or placeholder trigger {token!r}; replace with domain-specific triggers",
                        )
                    )

        body = skill_md.read_text(encoding="utf-8-sig", errors="replace")
        if not args.allow_no_scripts and "scripts/" not in body:
            results.append(CheckResult("warning", "SKILL.md does not mention scripts/"))
        if "スキル読み込み通知" not in body:
            results.append(CheckResult("warning", "SKILL.md has no skill loading notification section"))
        if "役割分担" not in body and "3層分離" not in body:
            results.append(CheckResult("warning", "SKILL.md does not clearly state AI vs script responsibility split"))
        if "更新条件" not in body and "見直し条件" not in body:
            results.append(CheckResult("warning", "SKILL.md has no script update/review conditions section"))
        if not args.allow_no_scripts and "--version" not in body:
            results.append(CheckResult("warning", "SKILL.md does not include a runtime version check command"))
        results.extend(check_relative_links(skill_dir, body))

    if not scripts_dir.exists():
        level = "info" if args.allow_no_scripts else "error"
        results.append(CheckResult(level, f"missing scripts directory: {scripts_dir}"))
    else:
        pycache_dirs = [p for p in scripts_dir.rglob("__pycache__") if p.is_dir()]
        for cache_dir in pycache_dirs:
            results.append(CheckResult("warning", f"remove cached bytecode directory: {cache_dir}"))

        script_files = sorted(
            p
            for p in scripts_dir.rglob("*")
            if p.is_file()
            and "__pycache__" not in p.parts
            and p.suffix in {".py", ".mjs", ".ps1", ".sh"}
        )
        if not script_files:
            level = "info" if args.allow_no_scripts else "error"
            results.append(CheckResult(level, "scripts directory has no executable script files"))
        for script_file in script_files:
            results.extend(validate_script(script_file))

    counts = {"error": 0, "warning": 0, "info": 0}
    for result in results:
        counts[result.level] = counts.get(result.level, 0) + 1

    if args.json:
        print(json.dumps({"counts": counts, "results": [r.__dict__ for r in results]}, ensure_ascii=False, indent=2))
    else:
        if not results:
            print("PASS: no issues found")
        for result in results:
            print(f"{result.level.upper()}: {result.message}")
        print(f"Summary: {counts}")
    return 1 if counts.get("error", 0) else 0


def build_parser() -> argparse.ArgumentParser:
    """scaffold / validate サブコマンドの CLI を定義する。"""

    parser = argparse.ArgumentParser(description="Create and validate script-backed Agent Skill skeletons")
    subparsers = parser.add_subparsers(dest="command", required=True)

    scaffold_parser = subparsers.add_parser("scaffold", help="Create a scripted skill skeleton")
    scaffold_parser.add_argument("--name", required=True, help="Skill name (hyphen-case)")
    scaffold_parser.add_argument("--output", required=True, help="Directory that will contain the skill folder")
    scaffold_parser.add_argument("--purpose", required=True, help="One-sentence purpose for the generated skill")
    scaffold_parser.add_argument("--script-name", help="Script file stem or filename")
    scaffold_parser.add_argument("--runtime", choices=["python", "node"], default="python")
    scaffold_parser.add_argument(
        "--pattern",
        choices=list(PATTERN_META.keys()),
        default="pipeline",
        help="Skill boundary pattern: pipeline (A), ai-to-script (B), script-to-ai (C)",
    )
    scaffold_parser.add_argument("--triggers", help="Comma-separated domain-specific trigger keywords")
    scaffold_parser.add_argument("--title", help="Human-readable skill title")
    scaffold_parser.add_argument("--skill-path", help="Skill path prefix shown in generated SKILL.md commands")
    scaffold_parser.add_argument("--apply", action="store_true", help="Write files. Omit for dry-run.")
    scaffold_parser.add_argument("--force", action="store_true", help="Overwrite existing files")
    scaffold_parser.set_defaults(func=scaffold)

    validate_parser = subparsers.add_parser("validate", help="Validate a scripted skill")
    validate_parser.add_argument("--skill", required=True, help="Path to a skill directory")
    validate_parser.add_argument(
        "--allow-no-scripts",
        action="store_true",
        help="Allow natural-language-first skills without a scripts/ directory",
    )
    validate_parser.add_argument("--json", action="store_true", help="Print JSON results")
    validate_parser.set_defaults(func=validate)
    return parser


def main(argv: list[str] | None = None) -> int:
    """選択されたサブコマンドを実行し終了コードを返す。"""

    configure_stdio()
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
