#!/usr/bin/env python3
"""Find the Turtle Video overview entries that matter for one change request.

``references/implementation-patterns.md`` holds hundreds of past fixes and is far
too large to read whole. This script scores each heading block in the overview
references against the request terms, returns only the best matches with their
``file:line`` so the agent can read just those ranges, and lists the degradation
checks and verification commands that apply. It never edits anything.

Formerly part of the ``bugfix-guard`` skill (merged into this overview).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

SKILL_DIR = Path(__file__).resolve().parent.parent
REFERENCES_DIR = SKILL_DIR / "references"

WORD_RE = re.compile(r"[A-Za-z0-9_./-]{2,}|[぀-ヿ㐀-鿿]{2,}")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$")
PARTICLE_SPLIT_RE = re.compile(r"[のをにへがはでとも、。・\s]+")
STOP_WORDS = {
    "the", "and", "for", "with", "from", "this", "that",
    "して", "する", "です", "ます", "ください", "ほしい", "したい",
    "追加", "修正", "対応", "変更", "実装", "問題", "不具合",
}

# Turtle Video specific risk areas. Each rule adds a guard check when the request
# or a matched snippet touches the area.
RISK_RULES = (
    {
        "name": "ObjectURL lifecycle",
        "terms": ("createobjecturl", "revokeobjecturl", "objecturl", "blob"),
        "check": "新しく ObjectURL を作るなら revokeObjectURL の解放経路まで確認する",
    },
    {
        "name": "Canvas / video rendering",
        "terms": ("canvas", "video", "renderframe", "blackout", "visibilitychange", "プレビュー", "描画", "黒画面"),
        "check": "再生・シーク・エクスポート・タブ復帰の4経路すべてで描画を確認する",
    },
    {
        "name": "Audio routing",
        "terms": ("audio", "audiocontext", "sound", "voice", "volume", "bgm", "ナレーション", "音声", "音量"),
        "check": "AudioContext の resume/catch と、通常再生・エクスポート両方の音声経路を確認する",
    },
    {
        "name": "Export pipeline",
        "terms": ("export", "mediarecorder", "webcodecs", "videoframe", "書き出し", "エクスポート"),
        "check": "書き出しの尺・音ズレ・中断(AbortController)・VideoFrame.close() を確認する",
    },
    {
        "name": "State store / persistence",
        "terms": ("store", "state", "zustand", "restorefromsave", "localstorage", "indexeddb", "保存", "復元"),
        "check": "restoreFromSave との互換、自動保存の変更検知、IndexedDB 保存・復元を確認する",
    },
    {
        "name": "Mobile / Safari",
        "terms": ("touch", "swipe", "mobile", "responsive", "playsinline", "safari", "iphone", "ipad", "android", "スマホ"),
        "check": "スワイプ誤操作防止・モバイル表示・playsInline・flavor 境界（turtle-video-platform-targeting）を確認する",
    },
)


@dataclass
class Snippet:
    file: str
    line: int
    heading: str
    score: int
    terms: list[str]
    text: str


def read_text(path: Path) -> str:
    """Read text without failing on unexpected encodings."""

    return path.read_text(encoding="utf-8", errors="replace")


def extract_terms(request: str, paths: Iterable[str]) -> list[str]:
    """Build stable search terms from the request and hinted paths."""

    terms: set[str] = set()
    for match in WORD_RE.findall(" ".join([request, *paths])):
        term = match.strip().lower()
        if len(term) >= 2 and term not in STOP_WORDS:
            terms.add(term)
        for part in PARTICLE_SPLIT_RE.split(term):
            if len(part) >= 2 and part not in STOP_WORDS:
                terms.add(part)
    for path in paths:
        stem = Path(path).stem.lower()
        if len(stem) >= 2:
            terms.add(stem)
    return sorted(terms)


def iter_blocks(text: str) -> Iterable[tuple[int, str, str]]:
    """Yield (start line, heading, block text) for each heading-delimited block."""

    start, heading, current = 1, "", []
    for index, line in enumerate(text.splitlines(), start=1):
        match = HEADING_RE.match(line)
        if match and current:
            yield start, heading, "\n".join(current).strip()
            start, heading, current = index, match.group(2).strip(), [line]
            continue
        if match:
            start, heading = index, match.group(2).strip()
        current.append(line)
    if current:
        yield start, heading, "\n".join(current).strip()


def score_block(block: str, terms: list[str]) -> tuple[int, list[str]]:
    """Score a block: request-term hits dominate, risk-area hits break ties."""

    lower = block.lower()
    matched = [term for term in terms if term in lower]
    if not matched:
        return 0, []
    score = len(matched) * 5
    score += sum(1 for rule in RISK_RULES if any(term in lower for term in rule["terms"]))
    return score, matched


def collect_snippets(terms: list[str], max_snippets: int, max_chars: int) -> list[Snippet]:
    """Score every reference block and keep the best ones."""

    snippets: list[Snippet] = []
    for path in sorted(REFERENCES_DIR.glob("*.md")):
        for line, heading, block in iter_blocks(read_text(path)):
            score, matched = score_block(block, terms)
            if score <= 0:
                continue
            text = re.sub(r"\n{3,}", "\n\n", block)
            if len(text) > max_chars:
                text = text[: max_chars - 3].rstrip() + "..."
            snippets.append(
                Snippet(
                    file=str(path.relative_to(SKILL_DIR)).replace("\\", "/"),
                    line=line,
                    heading=heading,
                    score=score,
                    terms=matched[:12],
                    text=text,
                )
            )
    snippets.sort(key=lambda item: (-item.score, item.file, item.line))
    return snippets[:max_snippets]


def detect_risk_checks(request: str, snippets: list[Snippet]) -> list[str]:
    """Return guard checks for risk areas named by the request or the snippets."""

    haystack = " ".join([request.lower(), *(snippet.text.lower() for snippet in snippets)])
    return [
        f"{rule['name']}: {rule['check']}"
        for rule in RISK_RULES
        if any(term in haystack for term in rule["terms"])
    ]


def package_commands(project_root: Path) -> list[str]:
    """Return likely verification commands from package.json."""

    package_json = project_root / "package.json"
    if not package_json.exists():
        return []
    try:
        scripts = json.loads(read_text(package_json)).get("scripts", {})
    except json.JSONDecodeError:
        return []
    if not isinstance(scripts, dict):
        return []
    preferred = ("test:run", "test", "typecheck", "lint", "build")
    commands = [f"npm run {name}" for name in preferred if name in scripts]
    commands.extend(
        f"npm run {name}"
        for name in sorted(scripts)
        if name not in preferred and any(key in name for key in ("test", "build", "type", "lint"))
    )
    return commands


def render_markdown(report: dict) -> str:
    """Render the report as compact markdown."""

    lines = ["# Turtle Video 変更前チェック", ""]
    lines.append(f"- 検索語: {', '.join(report['request_terms']) or '(なし)'}")
    lines.append("")
    lines.append("## 関連する過去の対策（該当箇所だけ読むこと）")
    if report["snippets"]:
        for snippet in report["snippets"]:
            lines.append(f"### `{snippet['file']}:{snippet['line']}` {snippet['heading']} (score={snippet['score']})")
            lines.append(f"- 一致: {', '.join(snippet['terms'])}")
            lines.append("")
            lines.append("```text")
            lines.append(snippet["text"])
            lines.append("```")
            lines.append("")
    else:
        lines.append("- 一致なし。対象ファイル名や機能名を --path / --request に足して再実行する。")
        lines.append("")
    lines.append("## デグレ確認（references/degre-checklist.md の該当節も見る）")
    lines.extend(f"- {check}" for check in report["risk_checks"]) if report["risk_checks"] else lines.append("- 該当するリスク領域なし")
    lines.append("")
    lines.append("## 検証コマンド候補")
    if report["verification_commands"]:
        lines.extend(f"- `{command}`" for command in report["verification_commands"])
    else:
        lines.append("- package.json が見つからない（--project-root を確認）")
    lines.append("")
    return "\n".join(lines)


def build_report(args: argparse.Namespace) -> dict:
    """Run the scan and return a serializable report."""

    project_root = Path(args.project_root).expanduser().resolve()
    if not project_root.is_dir():
        raise ValueError(f"Project root is not a directory: {project_root}")
    if args.max_snippets < 1 or args.max_chars < 1:
        raise ValueError("--max-snippets and --max-chars must be positive")
    hinted = args.path or []
    terms = extract_terms(args.request or "", hinted)
    snippets = collect_snippets(terms, args.max_snippets, args.max_chars)
    return {
        "project_root": str(project_root),
        "request": args.request or "",
        "request_terms": terms,
        "snippets": [asdict(snippet) for snippet in snippets],
        "risk_checks": detect_risk_checks(args.request or "", snippets),
        "verification_commands": package_commands(project_root),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Find Turtle Video overview entries relevant to a change request")
    parser.add_argument("--request", default="", help="変更依頼の文（そのまま渡してよい）")
    parser.add_argument("--path", action="append", help="変更対象のファイルやキーワード。複数指定可")
    parser.add_argument("--project-root", default=".", help="package.json があるプロジェクトルート")
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    parser.add_argument("--max-snippets", type=int, default=10)
    parser.add_argument("--max-chars", type=int, default=700)
    return parser


def main(argv: list[str] | None = None) -> int:
    # Windows consoles default to cp932; agents read the output as UTF-8.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = build_parser().parse_args(argv)
    report = build_report(args)
    if args.format == "json":
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(render_markdown(report))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001 - report any failure as a CLI error
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
