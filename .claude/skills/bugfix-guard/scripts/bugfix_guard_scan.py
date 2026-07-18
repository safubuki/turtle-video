#!/usr/bin/env python3
"""Build a compact preflight report for bugfix-guard.

The script scans local Agent Skill overview folders and extracts only the
references and snippets that look relevant to the current bugfix request. This
keeps routine discovery work out of the model context while still leaving final
judgment to the AI agent.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


SKILL_ROOTS = (
    ".agents/skills",
    ".github/skills",
    ".claude/skills",
    ".agent/skills",
)
COMMON_REFERENCES = (
    "references/project-details.md",
    "references/implementation-patterns.md",
    "references/current-issues-qa.md",
)
WORD_RE = re.compile(r"[A-Za-z0-9_./-]{2,}|[\u3040-\u30ff\u3400-\u9fff]{2,}")
REFERENCE_RE = re.compile(r"(?:\(|`)(references/[^)`#\s]+)")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$")
STOP_WORDS = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "して",
    "する",
    "です",
    "ます",
    "追加",
    "修正",
    "対応",
}
RISK_RULES = (
    {
        "name": "ObjectURL lifecycle",
        "terms": ("createobjecturl", "revokeobjecturl", "objecturl"),
        "check": "If ObjectURL is created, confirm revokeObjectURL cleanup.",
    },
    {
        "name": "Canvas or video rendering",
        "terms": ("canvas", "video", "renderframe", "blackout", "visibilitychange"),
        "check": "Check render, seek, export, and tab-restore behavior.",
    },
    {
        "name": "Audio routing",
        "terms": ("audio", "audiocontext", "sound", "voice", "volume"),
        "check": "Check AudioContext resume/catch behavior and export playback paths.",
    },
    {
        "name": "State store changes",
        "terms": ("store", "state", "zustand", "restorefromsave", "localstorage", "indexeddb"),
        "check": "Check persistence, restore compatibility, and derived state updates.",
    },
    {
        "name": "Async cancellation",
        "terms": ("abortcontroller", "cancel", "export", "worker", "promise"),
        "check": "Check cancellation, cleanup, and long-running task failure paths.",
    },
    {
        "name": "Mobile interaction",
        "terms": ("touch", "swipe", "mobile", "responsive", "playsinline"),
        "check": "Check touch protection, mobile layout, and video playsInline behavior.",
    },
)


@dataclass
class OverviewSkill:
    name: str
    path: str
    skill_md: str
    references: list[str]


@dataclass
class Snippet:
    file: str
    line: int
    score: int
    terms: list[str]
    text: str


def read_text(path: Path) -> str:
    """Read text without failing on unexpected encodings."""

    return path.read_text(encoding="utf-8", errors="replace")


def parse_frontmatter_name(text: str) -> str | None:
    """Return the frontmatter name field from SKILL.md when present."""

    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 4)
    if end == -1:
        return None
    for line in text[4:end].splitlines():
        if line.startswith("name:"):
            return line.split(":", 1)[1].strip()
    return None


def extract_terms(request: str, paths: Iterable[str]) -> list[str]:
    """Build stable search terms from the user request and hinted paths."""

    terms: set[str] = set()
    source = " ".join([request, *paths])
    for match in WORD_RE.findall(source):
        term = match.strip().lower()
        if len(term) >= 2 and term not in STOP_WORDS:
            terms.add(term)
        for part in re.split(r"[のをにへがはでと、。\s]+", term):
            if len(part) >= 2 and part not in STOP_WORDS:
                terms.add(part)
    for path in paths:
        stem = Path(path).stem.lower()
        if len(stem) >= 2:
            terms.add(stem)
    return sorted(terms)


def discover_overviews(project_root: Path) -> list[OverviewSkill]:
    """Find local *-overview Agent Skills and their referenced files."""

    overviews: list[OverviewSkill] = []
    seen_names: set[str] = set()
    for root_name in SKILL_ROOTS:
        skills_root = project_root / root_name
        if not skills_root.exists():
            continue
        for skill_dir in sorted(p for p in skills_root.iterdir() if p.is_dir()):
            skill_md = skill_dir / "SKILL.md"
            if not skill_md.exists():
                continue
            body = read_text(skill_md)
            name = parse_frontmatter_name(body) or skill_dir.name
            if not (skill_dir.name.endswith("-overview") or name.endswith("-overview")):
                continue
            if name in seen_names:
                continue
            seen_names.add(name)
            refs = discover_references(skill_dir, body)
            overviews.append(
                OverviewSkill(
                    name=name,
                    path=str(skill_dir.relative_to(project_root)),
                    skill_md=str(skill_md.relative_to(project_root)),
                    references=[str(ref.relative_to(project_root)) for ref in refs],
                )
            )
    return overviews


def discover_references(skill_dir: Path, skill_md_body: str) -> list[Path]:
    """Collect references linked from SKILL.md plus common overview references."""

    refs: dict[str, Path] = {}
    for match in REFERENCE_RE.findall(skill_md_body):
        path = (skill_dir / match).resolve()
        if path.exists() and path.is_file():
            refs[str(path)] = path
    for rel in COMMON_REFERENCES:
        path = (skill_dir / rel).resolve()
        if path.exists() and path.is_file():
            refs[str(path)] = path
    return sorted(refs.values(), key=lambda p: str(p).lower())


def iter_blocks(text: str) -> Iterable[tuple[int, str]]:
    """Yield heading-based markdown blocks with their starting line number."""

    lines = text.splitlines()
    start = 1
    current: list[str] = []
    for index, line in enumerate(lines, start=1):
        if HEADING_RE.match(line) and current:
            yield start, "\n".join(current).strip()
            start = index
            current = [line]
        else:
            if not current:
                start = index
            current.append(line)
    if current:
        yield start, "\n".join(current).strip()


def score_block(block: str, terms: list[str]) -> tuple[int, list[str]]:
    """Score one markdown block using request terms and built-in risk terms."""

    lower = block.lower()
    matched = [term for term in terms if term and term in lower]
    score = len(matched) * 5
    for rule in RISK_RULES:
        if any(term in lower for term in rule["terms"]):
            score += 2
    return score, matched


def collect_snippets(project_root: Path, overviews: list[OverviewSkill], terms: list[str], max_snippets: int, max_chars: int) -> list[Snippet]:
    """Extract compact relevant snippets from overview reference files."""

    snippets: list[Snippet] = []
    for overview in overviews:
        for rel in overview.references:
            path = project_root / rel
            if not path.exists():
                continue
            for line, block in iter_blocks(read_text(path)):
                score, matched = score_block(block, terms)
                if score <= 0:
                    continue
                text = re.sub(r"\n{3,}", "\n\n", block)
                if len(text) > max_chars:
                    text = text[: max_chars - 3].rstrip() + "..."
                snippets.append(
                    Snippet(
                        file=rel,
                        line=line,
                        score=score,
                        terms=matched[:12],
                        text=text,
                    )
                )
    snippets.sort(key=lambda item: (-item.score, item.file, item.line))
    return snippets[:max_snippets]


def detect_risk_checks(request: str, snippets: list[Snippet]) -> list[str]:
    """Suggest guard checks when request or snippets mention risky areas."""

    haystack = " ".join([request.lower(), *(snippet.text.lower() for snippet in snippets)])
    checks: list[str] = []
    for rule in RISK_RULES:
        if any(term in haystack for term in rule["terms"]):
            checks.append(f"{rule['name']}: {rule['check']}")
    return checks


def package_commands(project_root: Path) -> list[str]:
    """Read package.json and return likely verification commands."""

    package_json = project_root / "package.json"
    if not package_json.exists():
        return []
    try:
        data = json.loads(read_text(package_json))
    except json.JSONDecodeError:
        return []
    scripts = data.get("scripts", {})
    if not isinstance(scripts, dict):
        return []
    preferred = ("test:run", "test", "build", "typecheck", "lint")
    commands = [f"npm run {name}" for name in preferred if name in scripts]
    commands.extend(f"npm run {name}" for name in sorted(scripts) if name not in preferred and any(key in name for key in ("test", "build", "type", "lint")))
    return commands


def render_markdown(report: dict) -> str:
    """Render the preflight data as a compact markdown report."""

    lines: list[str] = []
    lines.append("# Bugfix Guard Preflight")
    lines.append("")
    lines.append(f"- Project root: `{report['project_root']}`")
    lines.append(f"- Request terms: {', '.join(report['request_terms']) if report['request_terms'] else '(none)'}")
    lines.append("")
    lines.append("## Overview Skills")
    if report["overviews"]:
        for overview in report["overviews"]:
            lines.append(f"- `{overview['name']}` at `{overview['path']}`")
    else:
        lines.append("- No `*-overview` skills found in standard skill roots.")
    lines.append("")
    lines.append("## Relevant References")
    references = sorted({ref for overview in report["overviews"] for ref in overview["references"]})
    if references:
        for ref in references:
            lines.append(f"- `{ref}`")
    else:
        lines.append("- No reference files found.")
    lines.append("")
    lines.append("## Relevant Snippets")
    if report["snippets"]:
        for snippet in report["snippets"]:
            terms = ", ".join(snippet["terms"]) if snippet["terms"] else "risk keyword"
            lines.append(f"### `{snippet['file']}:{snippet['line']}` score={snippet['score']}")
            lines.append(f"- Matched: {terms}")
            lines.append("")
            lines.append("```text")
            lines.append(snippet["text"])
            lines.append("```")
            lines.append("")
    else:
        lines.append("- No relevant snippets found. Read the most likely overview references manually if the change is risky.")
        lines.append("")
    lines.append("## Suggested Guard Checks")
    if report["risk_checks"]:
        for check in report["risk_checks"]:
            lines.append(f"- {check}")
    else:
        lines.append("- No specific risk checks detected from request terms.")
    lines.append("")
    lines.append("## Suggested Verification Commands")
    if report["verification_commands"]:
        for command in report["verification_commands"]:
            lines.append(f"- `{command}`")
    else:
        lines.append("- No package.json verification commands detected.")
    lines.append("")
    return "\n".join(lines)


def build_report(args: argparse.Namespace) -> dict:
    """Run all scans and return a serializable report dictionary."""

    project_root = Path(args.project_root).expanduser().resolve()
    if not project_root.is_dir():
        raise ValueError(f"Project root is not a directory: {project_root}")
    if args.max_snippets < 1 or args.max_chars < 1:
        raise ValueError("--max-snippets and --max-chars must be positive")
    hinted_paths = args.path or []
    terms = extract_terms(args.request or "", hinted_paths)
    overviews = discover_overviews(project_root)
    snippets = collect_snippets(project_root, overviews, terms, args.max_snippets, args.max_chars)
    report = {
        "project_root": str(project_root),
        "request": args.request or "",
        "request_terms": terms,
        "overviews": [asdict(overview) for overview in overviews],
        "snippets": [asdict(snippet) for snippet in snippets],
        "risk_checks": detect_risk_checks(args.request or "", snippets),
        "verification_commands": package_commands(project_root),
    }
    return report


def build_parser() -> argparse.ArgumentParser:
    """Define CLI arguments."""

    parser = argparse.ArgumentParser(description="Create a compact bugfix-guard preflight report")
    parser.add_argument("--project-root", default=".", help="Project root to scan")
    parser.add_argument("--request", default="", help="User bugfix or feature request")
    parser.add_argument("--path", action="append", help="Known target file or path hint. Can be repeated.")
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown", help="Output format")
    parser.add_argument("--output", help="Optional output file")
    parser.add_argument("--dry-run", action="store_true", help="Print the report target without writing --output")
    parser.add_argument("--force", action="store_true", help="Replace an existing --output file")
    parser.add_argument("--max-snippets", type=int, default=12, help="Maximum snippets to include")
    parser.add_argument("--max-chars", type=int, default=900, help="Maximum characters per snippet")
    return parser


def main(argv: list[str] | None = None) -> int:
    """Entry point."""

    args = build_parser().parse_args(argv)
    report = build_report(args)
    body = json.dumps(report, ensure_ascii=False, indent=2) + "\n" if args.format == "json" else render_markdown(report)

    if args.output:
        output = Path(args.output).expanduser().resolve()
        if args.dry_run:
            print(f"[dry-run] would write: {output}")
            return 0
        if output.exists() and not args.force:
            raise FileExistsError(f"Output already exists; use --force to replace it: {output}")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(body, encoding="utf-8", newline="\n")
        print(f"Wrote preflight report: {output}")
        return 0

    print(body, end="" if body.endswith("\n") else "\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
