#!/usr/bin/env python3
"""Create and validate script-backed Agent Skill skeletons.

The tool intentionally uses only the Python standard library so it can run on
Windows and Linux without installing project-specific dependencies.
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
# Keep these split so validating this tool does not flag its own source text.
DANGEROUS_PATTERNS = [
    "".join(("rm", " -rf")),
    "".join(("Remove-Item", " -Recurse", " -Force")),
    "".join(("sudo", " ")),
    "".join(("curl", " ")),
    "".join(("wget", " ")),
    "".join(("Invoke", "-WebRequest")),
    "".join(("id", "_rsa")),
    "".join((".en", "v")),
]


@dataclass
class CheckResult:
    """One validation message emitted by the validate command."""

    level: str
    message: str


def normalize_skill_name(value: str) -> str:
    """Convert user-provided text into Agent Skills hyphen-case."""

    name = value.strip().lower()
    name = re.sub(r"[^a-z0-9]+", "-", name)
    name = name.strip("-")
    return name[:64].strip("-")


def ensure_skill_name(value: str) -> str:
    """Normalize and validate a skill directory/frontmatter name."""

    name = normalize_skill_name(value)
    if not name or not SKILL_NAME_RE.match(name):
        raise SystemExit(f"Invalid skill name: {value!r}")
    return name


def ensure_script_name(value: str | None, skill_name: str, runtime: str) -> str:
    """Return a safe script filename with the extension for the runtime."""

    if value:
        stem = value.strip()
    else:
        stem = skill_name.replace("-", "_")
    stem = re.sub(r"[^A-Za-z0-9_-]+", "_", stem).strip("_-")
    if not stem or not SCRIPT_NAME_RE.match(stem):
        raise SystemExit(f"Invalid script name: {value!r}")
    suffix = ".py" if runtime == "python" else ".mjs"
    return stem if stem.endswith(suffix) else f"{stem}{suffix}"


def write_file(path: Path, content: str, apply: bool) -> None:
    """Create a file when --apply is set, otherwise only report the plan."""

    if apply:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="\n")
        print(f"created: {path}")
    else:
        print(f"[dry-run] would create: {path}")


def python_script_template(script_name: str, purpose: str) -> str:
    """Build the placeholder Python helper stored in the generated skill."""

    return f'''#!/usr/bin/env python3
"""Deterministic helper for {purpose}."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="{purpose}")
    parser.add_argument("--input", type=Path, help="Input file or directory")
    parser.add_argument("--output", type=Path, help="Output file path")
    parser.add_argument("--format", choices=["csv", "json"], default="csv")
    parser.add_argument("--dry-run", action="store_true", help="Show planned work without writing files")
    parser.add_argument("--verbose", action="store_true", help="Print additional progress information")
    return parser


def collect_rows(input_path: Path | None) -> list[dict[str, str]]:
    """Replace this function with the skill-specific deterministic logic."""
    if input_path is not None and not input_path.exists():
        raise FileNotFoundError(f"Input does not exist: {{input_path}}")
    return [
        {{
            "item": "example",
            "value": "replace-this-template",
        }}
    ]


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    fieldnames = sorted({{key for row in rows for key in row.keys()}})
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2, sort_keys=True) + "\\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    rows = collect_rows(args.input)

    if args.dry_run:
        print(json.dumps({{"rows": len(rows), "output": str(args.output) if args.output else None}}, ensure_ascii=False))
        return 0

    if args.output is None:
        print(json.dumps(rows, ensure_ascii=False, indent=2, sort_keys=True))
        return 0

    if args.format == "csv":
        write_csv(args.output, rows)
    else:
        write_json(args.output, rows)
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
    """Build the placeholder Node.js helper stored in the generated skill."""

    return f'''#!/usr/bin/env node
// Deterministic helper for {purpose}.
import {{ mkdir, writeFile }} from "node:fs/promises";
import {{ dirname, resolve }} from "node:path";

function parseArgs(argv) {{
  const args = {{ format: "json", dryRun: false, verbose: false }};
  for (let index = 0; index < argv.length; index += 1) {{
    const arg = argv[index];
    if (arg === "--help") args.help = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--verbose") args.verbose = true;
    else if (arg === "--input") args.input = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else if (arg === "--format") args.format = argv[++index];
    else throw new Error(`Unknown argument: ${{arg}}`);
  }}
  return args;
}}

function printHelp() {{
  console.log(`Usage: node scripts/{script_name} [--input PATH] [--output PATH] [--format json] [--dry-run]`);
}}

function collectRows(inputPath) {{
  // Replace this function with the skill-specific deterministic logic.
  return [
    {{
      item: "example",
      value: "replace-this-template",
      input: inputPath ? resolve(inputPath) : "",
    }},
  ];
}}

async function main() {{
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {{
    printHelp();
    return;
  }}
  if (!["json"].includes(args.format)) {{
    throw new Error("--format currently supports json only");
  }}

  const rows = collectRows(args.input);
  if (args.dryRun) {{
    console.log(JSON.stringify({{ rows: rows.length, output: args.output || null }}));
    return;
  }}
  const body = JSON.stringify(rows, null, 2) + "\\n";
  if (!args.output) {{
    process.stdout.write(body);
    return;
  }}
  await mkdir(dirname(resolve(args.output)), {{ recursive: true }});
  await writeFile(resolve(args.output), body, "utf8");
  console.log(`Wrote ${{rows.length}} row(s) to ${{resolve(args.output)}}`);
}}

main().catch((error) => {{
  console.error(`Error: ${{error.message}}`);
  process.exit(1);
}});
'''


def skill_template(skill_name: str, title: str, purpose: str, script_name: str, runtime: str) -> str:
    """Build SKILL.md for the generated script-backed Agent Skill."""

    runtime_check = "python --version" if runtime == "python" else "node --version"
    runner = f"python scripts/{script_name}" if runtime == "python" else f"node scripts/{script_name}"
    return f"""---
name: {skill_name}
description: {purpose} を scripts/{script_name} で決定的に実行する Agent Skill。定型的な取得、変換、集計、検証をスクリプトへ委譲し、AI は条件確認、結果解釈、例外対応を行う。「{title}」「scripted skill」「定型処理」「スクリプト実行」などで発火。
---

# {title}

## スキル読み込み通知

このスキルが読み込まれたら、必ず以下の通知をユーザーに表示してください：

> **{title} スキルを読み込みました**  
> {purpose} の定型処理を scripts/{script_name} で実行します。

## 概要

このスキルは、{purpose} のうち定型的な処理を `scripts/{script_name}` に委譲します。AI は、実行条件の確認、結果の解釈、例外対応、ユーザー向け説明を担当します。

## 役割分担

| 領域 | 担当 |
|------|------|
| 入力確認、対象範囲の相談 | AI |
| 取得、正規化、集計、固定形式出力 | `scripts/{script_name}` |
| 異常値の解釈、改善提案 | AI |

## 実行環境

まずランタイムを確認します：

```bash
{runtime_check}
```

ランタイムがない場合は、ユーザーに「インストールする」「別ランタイムへ変更する」「今回は生成だけ行う」を選択式で確認します。

## 手順

### Step 1: 入力を確認する

対象ファイル、対象期間、出力先、認証の有無を確認します。

### Step 2: ドライランする

```bash
{runner} --dry-run --input <input> --output <output>
```

### Step 3: 実行する

```bash
{runner} --input <input> --output <output>
```

### Step 4: 結果を解釈する

スクリプトの出力を読み、ユーザーの目的に合わせて要点、異常値、次のアクションを説明します。

## 参照

- [scripts/{script_name}](scripts/{script_name}) — 定型処理の実行スクリプト
- [references/script-contract.md](references/script-contract.md) — 入出力契約と検証条件
"""


def contract_template(purpose: str, script_name: str, runtime: str) -> str:
    """Build a short input/output contract reference for the helper script."""

    runner = f"python scripts/{script_name}" if runtime == "python" else f"node scripts/{script_name}"
    return f"""# Script Contract

## Purpose

{purpose}

## Script

`scripts/{script_name}`

## Inputs

- `--input`: Input file or directory
- `--output`: Output file path
- `--dry-run`: Show planned work without writing files

## Outputs

- Stable CSV or JSON output
- Exit code `0` on success
- Exit code `1` on validation or runtime error

## Update Conditions

- Input format changed
- Output columns or JSON schema changed
- API or project structure changed
- The same manual exception handling is repeated more than once

## Validation

Run:

```bash
{runner} --help
{runner} --dry-run --input <input> --output <output>
```
"""


def scaffold(args: argparse.Namespace) -> int:
    """Create the skill skeleton files, using dry-run as the default mode."""

    skill_name = ensure_skill_name(args.name)
    runtime = args.runtime
    script_name = ensure_script_name(args.script_name, skill_name, runtime)
    target = Path(args.output).expanduser().resolve() / skill_name
    title = args.title or " ".join(part.capitalize() for part in skill_name.split("-"))

    if target.exists() and not args.force:
        raise SystemExit(f"Target already exists: {target}. Use --force to overwrite files.")

    # The generated helper is intentionally minimal: users replace collect_rows()
    # or collectRows() with domain-specific deterministic logic.
    script_body = (
        python_script_template(script_name, args.purpose)
        if runtime == "python"
        else node_script_template(script_name, args.purpose)
    )
    files = {
        target / "SKILL.md": skill_template(skill_name, title, args.purpose, script_name, runtime),
        target / "scripts" / script_name: script_body,
        target / "references" / "script-contract.md": contract_template(args.purpose, script_name, runtime),
    }

    for path, content in files.items():
        if path.exists() and not args.force:
            raise SystemExit(f"File already exists: {path}. Use --force to overwrite files.")
        write_file(path, content, args.apply)

    if not args.apply:
        print("[dry-run] add --apply to create files")
    return 0


def read_frontmatter(skill_md: Path) -> dict[str, str]:
    """Parse simple one-line YAML frontmatter fields from SKILL.md."""

    text = skill_md.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---", 4)
    if end == -1:
        return {}
    metadata: dict[str, str] = {}
    for line in text[4:end].splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            metadata[key.strip()] = value.strip()
    return metadata


def validate_script(path: Path) -> list[CheckResult]:
    """Check one bundled helper script for obvious safety and syntax issues."""

    results: list[CheckResult] = []
    text = path.read_text(encoding="utf-8", errors="replace")
    # This is a lightweight heuristic scan, not a full security audit.
    for pattern in DANGEROUS_PATTERNS:
        if pattern in text:
            results.append(CheckResult("warning", f"{path}: contains sensitive or dangerous pattern {pattern!r}"))
    if "--help" not in text and "argparse" not in text:
        results.append(CheckResult("warning", f"{path}: no visible --help or argparse support"))
    if any(token in text for token in ["write_text", "writeFile", "open(", "mkdir", "unlink", "remove("]) and "--dry-run" not in text:
        results.append(CheckResult("warning", f"{path}: writes files but has no --dry-run mention"))
    if path.suffix == ".py":
        # py_compile catches syntax errors without executing the script.
        proc = subprocess.run([sys.executable, "-m", "py_compile", str(path)], capture_output=True, text=True)
        if proc.returncode != 0:
            results.append(CheckResult("error", f"{path}: Python compile failed: {proc.stderr.strip()}"))
    if path.suffix == ".mjs":
        node = shutil.which("node")
        if node:
            # node --check parses the file without running it.
            proc = subprocess.run([node, "--check", str(path)], capture_output=True, text=True)
            if proc.returncode != 0:
                results.append(CheckResult("error", f"{path}: Node check failed: {proc.stderr.strip()}"))
        else:
            results.append(CheckResult("info", f"{path}: node not found; skipped node --check"))
    return results


def validate(args: argparse.Namespace) -> int:
    """Validate the structure and helper scripts of a generated skill."""

    skill_dir = Path(args.skill).expanduser().resolve()
    results: list[CheckResult] = []
    skill_md = skill_dir / "SKILL.md"
    scripts_dir = skill_dir / "scripts"

    if not skill_md.exists():
        results.append(CheckResult("error", f"missing SKILL.md: {skill_md}"))
    else:
        metadata = read_frontmatter(skill_md)
        name = metadata.get("name", "")
        description = metadata.get("description", "")
        if not SKILL_NAME_RE.match(name):
            results.append(CheckResult("error", f"invalid or missing frontmatter name: {name!r}"))
        if not description:
            results.append(CheckResult("error", "missing frontmatter description"))
        if "\n" in description or "|" in description:
            results.append(CheckResult("warning", "description should be one line without YAML block syntax"))
        body = skill_md.read_text(encoding="utf-8", errors="replace")
        if "scripts/" not in body:
            results.append(CheckResult("warning", "SKILL.md does not mention scripts/"))
        if "スキル読み込み通知" not in body:
            results.append(CheckResult("warning", "SKILL.md has no skill loading notification section"))

    if not scripts_dir.exists():
        results.append(CheckResult("error", f"missing scripts directory: {scripts_dir}"))
    else:
        script_files = [p for p in scripts_dir.iterdir() if p.is_file() and p.suffix in {".py", ".mjs", ".ps1", ".sh"}]
        if not script_files:
            results.append(CheckResult("error", "scripts directory has no executable script files"))
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
    """Define the command-line interface for scaffold and validate."""

    parser = argparse.ArgumentParser(description="Create and validate script-backed Agent Skill skeletons")
    subparsers = parser.add_subparsers(dest="command", required=True)

    scaffold_parser = subparsers.add_parser("scaffold", help="Create a scripted skill skeleton")
    scaffold_parser.add_argument("--name", required=True, help="Skill name")
    scaffold_parser.add_argument("--output", required=True, help="Directory that will contain the skill folder")
    scaffold_parser.add_argument("--purpose", required=True, help="One-sentence purpose for the generated skill")
    scaffold_parser.add_argument("--script-name", help="Script file stem or filename")
    scaffold_parser.add_argument("--runtime", choices=["python", "node"], default="python")
    scaffold_parser.add_argument("--title", help="Human-readable skill title")
    scaffold_parser.add_argument("--apply", action="store_true", help="Write files. Omit for dry-run.")
    scaffold_parser.add_argument("--force", action="store_true", help="Overwrite existing files")
    scaffold_parser.set_defaults(func=scaffold)

    validate_parser = subparsers.add_parser("validate", help="Validate a scripted skill")
    validate_parser.add_argument("--skill", required=True, help="Path to a skill directory")
    validate_parser.add_argument("--json", action="store_true", help="Print JSON results")
    validate_parser.set_defaults(func=validate)
    return parser


def main(argv: list[str] | None = None) -> int:
    """Dispatch the selected subcommand and return a process exit code."""

    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
