#!/usr/bin/env python3
"""Collect deterministic, bounded evidence for AI-led bug analysis."""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import subprocess
import sys
from pathlib import Path

SCHEMA_VERSION = "1.0"
TEXT_SUFFIXES = {
    ".c", ".cc", ".cpp", ".cs", ".css", ".go", ".h", ".hpp", ".html",
    ".java", ".js", ".json", ".jsx", ".kt", ".md", ".mjs", ".php",
    ".ps1", ".py", ".rb", ".rs", ".sh", ".sql", ".swift", ".toml",
    ".ts", ".tsx", ".vue", ".xml", ".yaml", ".yml",
}
EXCLUDED_DIRS = {
    ".git", ".hg", ".svn", ".idea", ".vscode", "node_modules", "dist",
    "build", "coverage", "vendor", "target", "__pycache__", ".venv", "venv",
    ".venv-media-analysis", ".skills-backups",
}
SENSITIVE_NAMES = {"." + "env", ".npmrc", ".pypirc", "id_" + "rsa", "id_" + "ed25519"}
WORD_RE = re.compile(r"[A-Za-z0-9_./:-]{3,}|[\u3040-\u30ff\u3400-\u9fff]{2,}")
SECRET_RE = re.compile(
    r"(?i)(api[_-]?key|authorization|bearer|password|passwd|secret|token)(\s*[:=]\s*|\s+)([^\s,;]+)"
)
STOP_WORDS = {"the", "and", "for", "with", "from", "して", "する", "です", "ます", "不具合", "エラー", "調査", "解析"}


def safe_run(args: list[str], cwd: Path) -> str | None:
    try:
        result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=5, shell=False, check=False)
    except (OSError, subprocess.SubprocessError):
        return None
    text = (result.stdout or result.stderr).strip()
    return text.splitlines()[0][:500] if text else None


def redact(text: str) -> str:
    return SECRET_RE.sub(lambda m: f"{m.group(1)}{m.group(2)}<redacted>", text)


def terms_from(*values: str) -> list[str]:
    terms: set[str] = set()
    for value in values:
        for match in WORD_RE.findall(value or ""):
            term = match.lower().strip("./:-")
            terms.add(term)
            terms.update(part for part in re.split(r"[のをにへがはでと、。\s]+", term) if part)
    return sorted(t for t in terms if len(t) >= 2 and t not in STOP_WORDS)[:80]


def is_safe_candidate(path: Path) -> bool:
    lower = path.name.lower()
    return (
        path.suffix.lower() in TEXT_SUFFIXES
        and lower not in SENSITIVE_NAMES
        and not lower.endswith((".pem", ".key", ".p12", ".pfx"))
        and not any(part.lower() in EXCLUDED_DIRS for part in path.parts)
    )


def candidate_matches(root: Path, terms: list[str], max_files: int, max_matches: int) -> list[dict]:
    if not terms:
        return []
    results: list[dict] = []
    visited = 0
    for current, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted((name for name in dirnames if name.lower() not in EXCLUDED_DIRS), key=str.lower)
        for filename in sorted(filenames, key=str.lower):
            if len(results) >= max_matches or visited >= max_files:
                return results[:max_matches]
            path = Path(current) / filename
            if not is_safe_candidate(path):
                continue
            visited += 1
            try:
                if path.stat().st_size > 2_000_000:
                    continue
                lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            rel = path.relative_to(root).as_posix()
            path_hits = [term for term in terms if term in rel.lower()]
            for number, line in enumerate(lines, 1):
                matched = sorted({term for term in terms if term in line.lower()} | set(path_hits))
                if matched:
                    results.append({"file": rel, "line": number, "terms": matched[:8], "text": redact(line.strip())[:500]})
                    break
    return results[:max_matches]


def package_commands(root: Path) -> list[str]:
    package = root / "package.json"
    if not package.is_file():
        return []
    try:
        scripts = json.loads(package.read_text(encoding="utf-8")).get("scripts", {})
    except (OSError, json.JSONDecodeError, AttributeError):
        return []
    if not isinstance(scripts, dict):
        return []
    preferred = ("test:run", "test", "build", "typecheck", "lint")
    names = [name for name in preferred if name in scripts]
    names += sorted(name for name in scripts if name not in names and any(k in name.lower() for k in ("test", "build", "type", "lint")))
    return [f"npm run {name}" for name in names]


def read_log(root: Path, value: str, tail_lines: int) -> tuple[dict | None, str | None]:
    path = Path(value).expanduser()
    path = path if path.is_absolute() else root / path
    try:
        resolved = path.resolve()
        if not resolved.is_file():
            return None, f"Log file not found: {value}"
        if resolved.name.lower() in SENSITIVE_NAMES or resolved.name.lower().endswith((".pem", ".key", ".p12", ".pfx")):
            return None, f"Refused sensitive log path: {value}"
        lines = resolved.read_text(encoding="utf-8", errors="replace").splitlines()[-tail_lines:]
        label = resolved.relative_to(root).as_posix() if resolved.is_relative_to(root) else str(resolved)
        return {"file": label, "tail_lines": len(lines), "text": redact("\n".join(lines))}, None
    except OSError as exc:
        return None, f"Could not read log {value}: {exc}"


def git_observation(root: Path) -> str | None:
    try:
        result = subprocess.run(["git", "status", "--short"], cwd=root, capture_output=True, text=True, timeout=5, shell=False, check=False)
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    lines = result.stdout.splitlines()
    return f"git_status_changed_files={len(lines)}" + (f"; sample={'; '.join(lines[:10])}" if lines else "")


def build_report(args: argparse.Namespace) -> dict:
    root = Path(args.project_root).expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f"Project root is not a directory: {root}")
    hints = args.path or []
    terms = terms_from(args.request, args.error_text, *hints)
    observations = [
        f"platform={platform.system()} {platform.release()}",
        f"python={platform.python_version()}",
    ]
    node = safe_run(["node", "--version"], root)
    if node:
        observations.append(f"node={node}")
    git = git_observation(root)
    if git:
        observations.append(git)
    for hint in sorted(hints):
        observations.append(f"path_hint={hint}; exists={(root / hint).exists()}")
    logs, warnings = [], []
    for value in args.log_file or []:
        excerpt, warning = read_log(root, value, args.tail_lines)
        if excerpt:
            logs.append(excerpt)
        if warning:
            warnings.append(warning)
    return {
        "schema_version": SCHEMA_VERSION,
        "project_root": str(root),
        "request": args.request,
        "terms": terms,
        "observations": observations,
        "candidate_files": candidate_matches(root, terms, args.max_files, args.max_matches),
        "log_excerpts": logs,
        "verification_commands": package_commands(root),
        "warnings": warnings,
    }


def render_markdown(report: dict) -> str:
    lines = ["# Bug Analysis Evidence", "", f"- Schema: `{report['schema_version']}`", f"- Project: `{report['project_root']}`", f"- Request: {report['request'] or '(none)'}", "", "## Observations"]
    lines += [f"- {item}" for item in report["observations"]] or ["- None"]
    lines += ["", "## Candidate Files"]
    lines += [f"- `{item['file']}:{item['line']}` ({', '.join(item['terms'])}): {item['text']}" for item in report["candidate_files"]] or ["- None"]
    lines += ["", "## Log Excerpts"]
    for item in report["log_excerpts"]:
        lines += [f"### `{item['file']}`", "", "```text", item["text"], "```", ""]
    if not report["log_excerpts"]:
        lines.append("- None")
    lines += ["", "## Verification Candidates"]
    lines += [f"- `{item}`" for item in report["verification_commands"]] or ["- None"]
    lines += ["", "## Warnings"]
    lines += [f"- {item}" for item in report["warnings"]] or ["- None"]
    return "\n".join(lines) + "\n"


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Collect bounded evidence for AI-led bug analysis")
    p.add_argument("--project-root", default=".")
    p.add_argument("--request", default="")
    p.add_argument("--error-text", default="")
    p.add_argument("--path", action="append", help="Known related path; repeatable")
    p.add_argument("--log-file", action="append", help="Explicit log file; repeatable")
    p.add_argument("--tail-lines", type=int, default=200)
    p.add_argument("--max-files", type=int, default=5000)
    p.add_argument("--max-matches", type=int, default=30)
    p.add_argument("--format", choices=("markdown", "json"), default="markdown")
    p.add_argument("--output")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--force", action="store_true")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if min(args.tail_lines, args.max_files, args.max_matches) < 1:
        raise ValueError("Limits must be positive integers")
    report = build_report(args)
    body = json.dumps(report, ensure_ascii=False, indent=2) + "\n" if args.format == "json" else render_markdown(report)
    if not args.output:
        print(body, end="")
        return 0
    output = Path(args.output).expanduser().resolve()
    if args.dry_run:
        print(f"[dry-run] would write: {output}")
        return 0
    if output.exists() and not args.force:
        raise FileExistsError(f"Output already exists; use --force to replace it: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(body, encoding="utf-8", newline="\n")
    print(f"Wrote report: {output}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
