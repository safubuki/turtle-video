#!/usr/bin/env python3
"""
app-add-help deterministic helper tool.
Provides:
  - scan:      Extract UI features, buttons, icons, and sections from source code.
  - scaffold:  Generate help definitions, help modal component, and tests.
  - validate:  Audit help definitions against UX, accessibility, and consistency rules.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set


# ==============================================================================
# 1. Feature Scanner
# ==============================================================================

def scan_features(src_dir: Path) -> Dict[str, Any]:
    """Scan source files to discover UI sections, buttons, icons, modals, and settings."""
    if not src_dir.exists():
        raise FileNotFoundError(f"Source directory does not exist: {src_dir}")

    sections: Dict[str, Dict[str, Any]] = {}
    icon_pattern = re.compile(r'<([A-Z][a-zA-Z0-9]+(?:Icon)?)\b')
    button_pattern = re.compile(r'<(?:button|Button)[^>]*>(.*?)</(?:button|Button)>', re.DOTALL)
    title_pattern = re.compile(r'<h[1-4][^>]*>(.*?)</h[1-4]>', re.DOTALL)
    aria_label_pattern = re.compile(r'aria-label=["\']([^"\']+)["\']')
    external_link_pattern = re.compile(r'https?://[^\s"\'<>]+')
    api_key_pattern = re.compile(r'(?:api[_-]?key|apiKey|gemini|token)', re.IGNORECASE)

    for file_path in src_dir.rglob("*"):
        if file_path.suffix not in (".tsx", ".jsx", ".vue", ".html", ".svelte"):
            continue
        # Skip test files and node_modules
        if "test" in file_path.stem.lower() or "node_modules" in file_path.parts:
            continue

        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        module_name = file_path.stem
        is_modal = "modal" in module_name.lower()
        # Derive section name
        sec_key = module_name.replace("Section", "").replace("Modal", "").lower()
        if not sec_key:
            sec_key = module_name.lower()

        if sec_key not in sections:
            sections[sec_key] = {
                "file": str(file_path.relative_to(src_dir)),
                "is_modal": is_modal,
                "titles": set(),
                "buttons": set(),
                "icons": set(),
                "aria_labels": set(),
                "external_links": set(),
                "has_api_key_dependency": bool(api_key_pattern.search(content)),
            }

        for match in title_pattern.finditer(content):
            raw = re.sub(r'<[^>]+>', '', match.group(1)).strip()
            if raw and len(raw) < 40 and not raw.startswith("{"):
                sections[sec_key]["titles"].add(raw)

        for match in button_pattern.finditer(content):
            raw = re.sub(r'<[^>]+>', '', match.group(1)).strip()
            if raw and len(raw) < 25 and not raw.startswith("{"):
                sections[sec_key]["buttons"].add(raw)

        for match in aria_label_pattern.finditer(content):
            label = match.group(1).strip()
            if label and len(label) < 40:
                sections[sec_key]["aria_labels"].add(label)

        for match in icon_pattern.finditer(content):
            icon_name = match.group(1)
            if icon_name not in ("Fragment", "Component", "Route", "Link", "Switch"):
                sections[sec_key]["icons"].add(icon_name)

        for match in external_link_pattern.finditer(content):
            url = match.group(0).rstrip('"\')>,;')
            if "localhost" not in url and "w3.org" not in url:
                sections[sec_key]["external_links"].add(url)

    # Convert sets to sorted lists for deterministic output
    result: Dict[str, Any] = {"sections": {}}
    for key, data in sorted(sections.items()):
        if not data["buttons"] and not data["titles"] and not data["aria_labels"]:
            continue
        result["sections"][key] = {
            "source_file": data["file"],
            "is_modal": data["is_modal"],
            "has_api_key_dependency": data["has_api_key_dependency"],
            "detected_titles": sorted(data["titles"]),
            "detected_actions": sorted(data["buttons"] | data["aria_labels"]),
            "detected_icons": sorted(data["icons"])[:15],
            "detected_links": sorted(data["external_links"]),
        }

    return result


# ==============================================================================
# 2. Quality Validator
# ==============================================================================

def validate_help_content(help_data: Dict[str, Any]) -> Dict[str, Any]:
    """Audit help items against UX, consistency, accessibility, and architectural rules."""
    issues: List[Dict[str, Any]] = []
    stats = {
        "total_sections": 0,
        "total_items": 0,
        "total_bullets": 0,
        "inline_visuals": 0,
        "standalone_visuals": 0,
        "facts_count": 0,
        "panel_demos": 0,
    }

    sections = help_data.get("sections") or help_data

    # Section responsibility keywords to prevent misplaced items
    misplaced_rules = {
        "caption": ["タイトル", "プロジェクト名", "画面比率", "アスペクト比"],
        "captions": ["タイトル", "プロジェクト名", "画面比率", "アスペクト比"],
        "audio": ["動画トリミング", "解像度", "字幕フォント"],
        "video": ["音声イコライザー", "BGMフェード"],
    }

    # Calculation and logic keywords that deserve structured facts
    logic_keywords = ["比例配分", "係数", "アルゴリズム", "一括配分", "時分割", "自動計算", "文字数"]

    for sec_key, sec_val in sections.items():
        if not isinstance(sec_val, dict) or "items" not in sec_val:
            continue
        stats["total_sections"] += 1
        items = sec_val.get("items", [])

        for idx, item in enumerate(items):
            stats["total_items"] += 1
            title = item.get("title", f"Item #{idx+1}")
            desc = item.get("description", "")

            # Rule 1: Short summary (<= 140 characters)
            if len(desc) > 140:
                issues.append({
                    "severity": "warning",
                    "section": sec_key,
                    "title": title,
                    "rule": "concise-description",
                    "message": f"導入文が長すぎます ({len(desc)}文字 > 140文字上限)。要点は箇条書きに分散してください。",
                })

            # Rule 2: Visual token checks
            item_visuals = set(item.get("visuals", []))
            stats["standalone_visuals"] += len(item_visuals)
            bullets = item.get("bullets", [])
            stats["total_bullets"] += len(bullets)
            facts = item.get("facts", [])
            stats["facts_count"] += len(facts)

            bullet_visuals: Set[str] = set()
            bullet_texts: List[str] = []
            for b in bullets:
                if isinstance(b, dict):
                    b_vis = b.get("visuals", [])
                    bullet_visuals.update(b_vis)
                    stats["inline_visuals"] += len(b_vis)
                    bullet_texts.append(b.get("text", ""))
                else:
                    bullet_texts.append(str(b))

            all_vis = item_visuals | bullet_visuals
            for v in all_vis:
                if "_panel_demo" in v:
                    stats["panel_demos"] += 1

            # Rule 3: Forbid accordion header mock visuals
            for v in all_vis:
                if "_accordion" in v:
                    issues.append({
                        "severity": "error",
                        "section": sec_key,
                        "title": title,
                        "rule": "no-accordion-header-visual",
                        "message": f"アコーディオンヘッダー見本 '{v}' が含まれています。開閉枠の見本は排除し、実操作ボタンのみを配置してください。",
                    })

            # Rule 4: Prevent crowded visual tokens dump (crowded icon cluster)
            unexplained_visuals = item_visuals - bullet_visuals
            if len(unexplained_visuals) >= 4:
                issues.append({
                    "severity": "warning",
                    "section": sec_key,
                    "title": title,
                    "rule": "forbid-crowded-visual-dump",
                    "message": (
                        f"末尾の操作見本 ({len(unexplained_visuals)}個) が固められています。"
                        "単なるアイコンの羅列を避け、実画面通りの操作パネル見本（例: '_panel_demo'）にまとめるか、"
                        "各箇条書きにインライン配置してください。"
                    ),
                })
            elif unexplained_visuals and not bullets:
                issues.append({
                    "severity": "info",
                    "section": sec_key,
                    "title": title,
                    "rule": "explain-visual-tokens",
                    "message": f"操作見本 {sorted(unexplained_visuals)} に対応する箇条書き説明がありません。文字説明を追加するか、見本を箇条書きにインライン化してください。",
                })

            # Rule 5: Forbid self-evident state/position descriptions
            state_keywords = ["初期状態は閉じて", "開くと", "閉じると", "画面の上にある", "画面の下にある", "開いて設定", "折りたたみを"]
            combined_text = desc + " " + " ".join(bullet_texts)
            for kw in state_keywords:
                if kw in combined_text:
                    issues.append({
                        "severity": "warning",
                        "section": sec_key,
                        "title": title,
                        "rule": "no-state-description",
                        "message": f"見たら自明な状態・位置の記述 '{kw}' が含まれています。機能の目的と操作方法に焦点を当ててください。",
                    })

            # Rule 6: Recommend structured facts for complex calculation/allocation logic
            has_logic_mention = any(kw in combined_text for kw in logic_keywords)
            if has_logic_mention and not facts and not item.get("comparison"):
                issues.append({
                    "severity": "info",
                    "section": sec_key,
                    "title": title,
                    "rule": "recommend-structured-facts",
                    "message": (
                        "配分計算や内部ロジックに関する記述があります。"
                        "文章だけでなく 'facts'（パラメータ一覧）や 'comparison'（一括設定メリットの対比）で構造化すると、"
                        "ユーザーへの利便性の伝達が大幅に向上します。"
                    ),
                })

            # Rule 7: Precondition / API key note dynamic guidance check
            note_text = item.get("note", "")
            if any(k in note_text for k in ["API", "キー", "必須", "設定が必要"]):
                if "設定済み" not in note_text and "未設定" not in note_text:
                    issues.append({
                        "severity": "info",
                        "section": sec_key,
                        "title": title,
                        "rule": "check-important-notes",
                        "message": (
                            f"重要ノート '{note_text[:30]}...' があります。"
                            "設定完了済みのユーザーには視覚的ノイズにならないよう、UIコンポーネント側で"
                            "「未設定時のみ黄色重要枠を表示し、設定済み時は非表示にする」動的制御を適用してください。"
                        ),
                    })

            # Rule 8: Security & Privacy clarity without anxiety-inducing terms
            combined_sec_text = desc + " " + note_text + " " + " ".join(bullet_texts)
            if "API" in combined_sec_text or "キー" in combined_sec_text:
                # 8a: Forbid anxiety-inducing communication phrasing
                anxiety_terms = ["直接通信", "通信します", "APIへ送信", "直接送信"]
                for term in anxiety_terms:
                    if term in combined_sec_text:
                        issues.append({
                            "severity": "warning",
                            "section": sec_key,
                            "title": title,
                            "rule": "no-anxiety-inducing-terms",
                            "message": (
                                f"APIキーの説明に通信に関する言及 '{term}' が含まれています。"
                                "ユーザーに漏洩の無用な不安を与えないよう通信の記述を削除し、"
                                "『登録したAPIキーはお使いのブラウザ内（ローカル）にのみ安全に保存され、外部サーバーには送信されません』と端的に記載してください。"
                            ),
                        })

                # 8b: Recommend local safe storage reassurance
                if "外部サーバー" not in combined_sec_text and "ローカル" not in combined_sec_text:
                    issues.append({
                        "severity": "info",
                        "section": sec_key,
                        "title": title,
                        "rule": "recommend-security-clarity",
                        "message": (
                            "APIキーの設定案内があります。"
                            "ユーザーが安心して利用できるよう、"
                            "『登録したAPIキーはお使いのブラウザ内（ローカル）にのみ安全に保存され、外部サーバーには送信されません』と明記することを推奨します。"
                        ),
                    })

            # Rule 9: Location phrasing accuracy (avoid outdated 'right-top settings')
            outdated_locations = ["右上の全体設定", "右上の設定", "画面右上の歯車"]
            for loc in outdated_locations:
                if loc in combined_sec_text:
                    issues.append({
                        "severity": "warning",
                        "section": sec_key,
                        "title": title,
                        "rule": "accurate-location-phrasing",
                        "message": (
                            f"古い位置表現 '{loc}' が含まれています。"
                            "実画面レイアウトに合わせ、"
                            "『トップ画面のタートルビデオ アプリ名の横の歯車アイコン』と表記を一致させてください。"
                        ),
                    })

            # Rule 10: Misplaced section responsibility check
            sec_lower = sec_key.lower()
            if sec_lower in misplaced_rules:
                for forbidden_kw in misplaced_rules[sec_lower]:
                    if forbidden_kw in title or forbidden_kw in desc:
                        issues.append({
                            "severity": "error",
                            "section": sec_key,
                            "title": title,
                            "rule": "no-misplaced-section-items",
                            "message": (
                                f"セクション '{sec_key}' に他責務のキーワード '{forbidden_kw}' が含まれています。"
                                f"{forbidden_kw} の設定は適切な全体設定または別セクションで説明してください。"
                            ),
                        })

    has_license_or_env = any(
        any("ライセンス" in item.get("title", "") or "動作" in item.get("title", "") or "環境" in item.get("title", "")
            for item in sec_val.get("items", []))
        for sec_val in sections.values() if isinstance(sec_val, dict)
    )

    if not has_license_or_env:
        issues.append({
            "severity": "warning",
            "section": "global",
            "title": "アプリ基本情報",
            "rule": "basic-app-meta",
            "message": "動作確認環境やライセンス、基本操作に関する説明項目が見当たりません。基本情報項目の追加を推奨します。",
        })

    return {
        "valid": len([i for i in issues if i["severity"] == "error"]) == 0,
        "stats": stats,
        "issue_count": len(issues),
        "issues": issues,
    }


# ==============================================================================
# 3. Scaffolder
# ==============================================================================

def generate_skeleton(scan_result: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Generate a high-quality help skeleton matching UX best practices."""
    skeleton: Dict[str, Any] = {
        "app": {
            "title": "アプリの使い方",
            "subtitle": "基本操作と全体設定",
            "items": [
                {
                    "title": "概要・はじめに",
                    "category": "はじめに",
                    "description": "アプリケーションの概要と特徴を簡潔に紹介します。",
                    "bullets": [
                        "スマホ・PC両対応: 画面サイズに合わせて最適化されたUIで操作できます。",
                        "基本操作: 各セクションのカードから編集や設定を行えます。"
                    ],
                    "note": "困ったときは各項目の（開く）を押して詳細を確認してください。"
                },
                {
                    "title": "動作環境・ライセンス",
                    "category": "基本情報",
                    "description": "推奨ブラウザおよびソフトウェアのライセンス情報です。",
                    "facts": [
                        {"label": "推奨環境", "description": "Google Chrome / Edge / Safari 最新版"},
                        {"label": "ライセンス", "description": "GNU GPLv3 または利用規約に準拠"}
                    ],
                    "accordions": [
                        {
                            "title": "オープンソースライセンス一覧（主要依存関係）",
                            "items": [
                                "React - MIT License",
                                "Lucide Icons - ISC License"
                            ]
                        }
                    ]
                }
            ]
        }
    }

    if scan_result and "sections" in scan_result:
        for sec_key, sec_data in scan_result["sections"].items():
            if sec_key in ("app", "modal"):
                continue
            actions = sec_data.get("detected_actions", [])
            has_api = sec_data.get("has_api_key_dependency", False)
            is_modal = sec_data.get("is_modal", False)
            sec_name = sec_key.capitalize()

            items = [
                {
                    "title": f"{sec_name}の基本操作",
                    "category": f"{sec_name}カテゴリ",
                    "description": f"{sec_name}に関する主要な操作や設定を行います。",
                    "bullets": [
                        {
                            "text": f"{act}: 操作を実行します。",
                            "visuals": [f"{sec_key}_{act.lower().replace(' ', '_')}_btn"]
                        } for act in actions[:3]
                    ] if actions else ["主要な機能を追加・設定できます。"],
                }
            ]

            # If section has API key requirement, provide dynamic guidance scaffolding
            if has_api:
                items[0]["note"] = (
                    "重要: この機能を使用するには事前のAPIキー設定が必要です。"
                    "登録したAPIキーはお使いのブラウザ内（ローカル）にのみ安全に保存され、外部サーバーには送信されません。"
                    "トップ画面のタートルビデオ アプリ名の横の歯車アイコンからAPIキーを登録してください。"
                )
                items[0]["bullets"].insert(0, {
                    "text": "APIキー連携: トップ画面のタートルビデオ アプリ名の横の歯車アイコンからキーを登録して利用可能にします。",
                    "visuals": ["settings_gear_badge"]
                })

            # If section has rich actions, provide real panel demo and structured facts
            if len(actions) > 3:
                items.append({
                    "title": f"{sec_name}の高度な操作・一括機能",
                    "category": f"{sec_name}の設定",
                    "isSubAccordion": True,
                    "description": "実画面仕様に基づく直感的なコントロールと効率的な一括設定を活用できます。",
                    "facts": [
                        {"label": "一括適用のメリット", "description": "1つずつ設定する手間を省き、全体の整合性を自動で保ちます。"},
                        {"label": "内部配分ルール", "description": "文字数や指定長さに応じてバランスよく自動計算されます。"}
                    ],
                    "bullets": [
                        {
                            "text": f"{actions[3]}: 直感的な操作パネルからリアルタイムに打鍵・反映できます。",
                            "visuals": [f"{sec_key}_panel_demo"]
                        }
                    ] + [f"{act}: 詳細な設定を適用します。" for act in actions[4:6]]
                })

            skeleton[sec_key] = {
                "title": f"{sec_name}の使い方",
                "subtitle": f"{sec_name}の機能一覧と操作方法" + (" (多重モーダル安全保護対応)" if is_modal else ""),
                "items": items
            }

    return skeleton


# ==============================================================================
# CLI Entrypoint
# ==============================================================================

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="app-add-help: Helper tool to design, scaffold, and validate application help systems."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Subcommand: scan
    scan_p = subparsers.add_parser("scan", help="Scan source code to discover UI features and actions.")
    scan_p.add_argument("--src", type=Path, default=Path("src"), help="Source directory to scan (default: src)")
    scan_p.add_argument("--output", type=Path, help="Output JSON file path")

    # Subcommand: scaffold
    scaffold_p = subparsers.add_parser("scaffold", help="Generate help skeleton definitions.")
    scaffold_p.add_argument("--scan-file", type=Path, help="Optional scanned JSON from 'scan' subcommand")
    scaffold_p.add_argument("--output", type=Path, required=True, help="Output JSON/TS skeleton path")
    scaffold_p.add_argument("--dry-run", action="store_true", help="Show generated skeleton without writing to disk")

    # Subcommand: validate
    val_p = subparsers.add_parser("validate", help="Audit help definitions against UX rules.")
    val_p.add_argument("--file", type=Path, required=True, help="Help definition JSON file to validate")

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "scan":
        result = scan_features(args.src)
        out_json = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(out_json + "\n", encoding="utf-8")
            print(f"Scanned features written to {args.output}")
        else:
            print(out_json)
        return 0

    if args.command == "scaffold":
        scan_data = None
        if args.scan_file and args.scan_file.exists():
            scan_data = json.loads(args.scan_file.read_text(encoding="utf-8"))
        skeleton = generate_skeleton(scan_data)
        out_json = json.dumps(skeleton, ensure_ascii=False, indent=2, sort_keys=True)
        if args.dry_run:
            print("[dry-run] Planned help skeleton:")
            print(out_json)
            return 0
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(out_json + "\n", encoding="utf-8")
        print(f"Help skeleton generated at {args.output}")
        return 0

    if args.command == "validate":
        if not args.file.exists():
            print(f"Error: File not found: {args.file}", file=sys.stderr)
            return 1
        data = json.loads(args.file.read_text(encoding="utf-8"))
        report = validate_help_content(data)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["valid"] else 1

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
