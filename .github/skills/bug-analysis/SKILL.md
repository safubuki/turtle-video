---
name: bug-analysis
description: 不具合調査時に scripts/bug_analysis_collect.py で環境、Git状態、検証コマンド、関連ファイル、ログ断片を定型収集し、AIが証拠の評価、原因仮説、優先度、改善案を判断する。「バグを調査」「不具合」「エラーを分析」「原因を調べて」「debug」「troubleshoot」などで発火。
---

# Bug Analysis

## スキル読み込み通知

このスキルを使用するときは、ユーザーへ次を通知する：

> **Bug Analysis スキルを読み込みました** — 定型的な証拠収集をスクリプトで行い、原因判断と対応案の評価をAIが行います。

## 役割分担

| 領域 | 担当 |
|---|---|
| 再現条件、期待動作、調査範囲の確認 | AI |
| 環境・Git状態・検証候補・関連ファイル・ログ断片の収集と整形 | `scripts/bug_analysis_collect.py` |
| 観測事実と推論の分離、根本原因、深刻度、修正案、追加調査の判断 | AI |

スクリプト出力は候補抽出であり、原因の確定ではない。コード、ログ、再現結果で裏付けられない内容を事実として報告しない。

## 実行環境

Python 3.10 以上の標準ライブラリだけを使用する。最初に確認する：

```bash
python --version
python3 --version
```

Python がない場合は、インストールを勝手に行わず、「インストールする」「手動調査に切り替える」「スクリプト実行を後回しにする」からユーザーに選んでもらう。

## 手順

### Step 1: 調査条件を整理する

次を既知情報から埋め、不足が解析を妨げる場合だけ確認する：現象、期待動作、再現手順、エラー文、発生環境、影響範囲、直前の変更。ログファイルはユーザーが指定したものだけを入力する。

### Step 2: 定型収集を実行する

標準出力だけで確認する基本形：

```bash
python .agents/skills/bug-analysis/scripts/bug_analysis_collect.py --project-root . --request "<現象または依頼>" --error-text "<エラー文>"
```

既知の対象やログを追加する場合は `--path` と `--log-file` を繰り返す：

```bash
python .agents/skills/bug-analysis/scripts/bug_analysis_collect.py --project-root . --request "<依頼>" --path src/example.ts --log-file logs/app.log --format json
```

ファイル出力前のドライランと本実行：

```bash
python .agents/skills/bug-analysis/scripts/bug_analysis_collect.py --project-root . --request "<依頼>" --output .bug-analysis/report.md --dry-run
python .agents/skills/bug-analysis/scripts/bug_analysis_collect.py --project-root . --request "<依頼>" --output .bug-analysis/report.md
```

既存出力を置き換える必要がある場合だけ `--force` を使う。`.github/skills` または `.claude/skills` から読み込んだ場合はスクリプトパスを読み替える。

### Step 3: AIが証拠を評価する

1. `observations` とログ断片を再現可能な事実として確認する。
2. `candidate_files` と `verification_commands` は候補として扱い、必要なファイルだけ追加で読む。
3. 原因仮説ごとに支持証拠、反証、未確認事項、確信度を示す。
4. 情報不足なら、最小の追加ログ、再現操作、テストを提案する。
5. 深刻度と修正優先度は影響、再現率、回避策、データ損失・セキュリティの有無からAIが判断する。

### Step 4: 報告する

[assets/report-template.md](assets/report-template.md) を使い、観測事実と推論を明確に分離する。プロジェクト固有の既知パターンが必要な場合だけ [references/investigation-guide.md](references/investigation-guide.md) を読む。

## 入出力と失敗時の扱い

- 入力: プロジェクトルート、依頼文、任意のエラー文・既知パス・明示ログファイル
- 出力: UTF-8 の Markdown または安定したキー構造の JSON。標準出力が既定
- 終了コード: `0` 成功、`1` 入力・読込・出力エラー、`2` CLI 引数エラー
- 機密対策: 一般的なトークン・パスワード表現をログ断片からマスクし、`.env`、鍵、認証ディレクトリを自動走査しない
- スクリプトは読み取り専用。`--output` 指定時だけレポートを書き込む

詳細は [references/script-contract.md](references/script-contract.md) を参照する。

## スクリプト更新条件

- 対象言語、除外ディレクトリ、検証コマンドの規約が変わった
- JSON 出力契約やログマスク規則を変える必要がある
- 同じ機械的な探索・整形を2回以上手作業で補った
- 誤検出または見逃しが再現可能な入力で確認された

## 参照

- [scripts/bug_analysis_collect.py](scripts/bug_analysis_collect.py) — 定型証拠収集
- [references/script-contract.md](references/script-contract.md) — 入出力契約
- [assets/report-template.md](assets/report-template.md) — AIが仕上げる解析レポート
- [references/investigation-guide.md](references/investigation-guide.md) — プロジェクト固有の追加調査
