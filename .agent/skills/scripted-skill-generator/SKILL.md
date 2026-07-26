---
name: scripted-skill-generator
description: 定型処理を自然言語で毎回AIに実行させず、scripts/ に保存した決定的なスクリプトへ委譲する Agent Skill を作成・改善するメタスキル。GitHubアクティビティ取得、統計処理後のCSV出力、プロジェクト固有の静的解析、データ変換、定型ワークフロー自動化などを script-backed skill として設計し、Windows/Linux(Ubuntu) 両対応、実行環境確認、選択式ヒアリング、スクリプト優先/非スクリプト判断、安全検証まで支援する。「スクリプトスキルを作成」「スクリプトスキルゴー」「scripted skill」「スクリプト活用型Skill」「トークン節約」「定型処理をスクリプト化」「AgentSkillsにscriptsを入れる」などで発火。
---

# Scripted Skill Generator

## スキル読み込み通知

このスキルが読み込まれたら、必ず以下の通知をユーザーに表示してください：

> **Scripted Skill Generator スキルを読み込みました**  
> 定型処理を scripts/ に逃がす Agent Skill を設計・作成します。

## 概要

このスキルは、Agent Skill の中で毎回 AI が自然言語から手順を再構成している定型処理を、あらかじめ用意したスクリプトに委譲するためのメタスキルです。大量データ処理、決まった API 取得、統計集計、CSV/JSON 出力、静的解析などは `scripts/` に置いた再利用可能な処理へ移し、AI は判断・設計・例外対応・結果解釈に集中します。

ただし、すべてをスクリプト化することが正解ではありません。判断が主で入力が毎回大きく変わる作業、利用者との対話で仕様が固まる作業、探索的な設計作業は自然言語ワークフローとして残します。

## 手順

### Step 1: 選択式でヒアリングする

ユーザーへの質問は、askQuestions のような選択形式で行う。`request_user_input` や同等の選択UIが利用できる環境ではそれを使い、利用できない場合は短い番号付き選択肢で聞く。1回に聞く質問は最大3つにする。

最初に確認する項目：

1. **スクリプト化の優先度**: できる限りスクリプト化 / 必要な部分だけ / まず設計だけ
2. **想定ランタイム**: Python / Node.js / プロジェクト既存の標準に合わせる
3. **配置先**: `.agents/skills` / `.github/skills` / `.claude/skills` / ユーザー指定パス

以降の詳細質問は、入力データ、出力形式、API/認証の有無、破壊的操作の有無、実行頻度に絞る。

### Step 2: スクリプト化する範囲を判定する

以下の資料を読み、定型処理と AI 判断を分離する：

- [references/script-first-design.md](references/script-first-design.md) — スクリプト化判断、非スクリプト判断、代表例
- [references/script-quality-checklist.md](references/script-quality-checklist.md) — 安全性、冪等性、検証観点

原則として、以下は `scripts/` に落とす：

- API やコマンドから決まった形でデータを取得する処理
- 大量ファイルや大量行を走査して統計を出す処理
- CSV/JSON/Markdown など決まった形式へ変換・出力する処理
- プロジェクト固有の静的解析、規約チェック、集計
- 毎回同じ引数、同じ順序、同じ出力形式で実行するワークフロー

以下は自然言語ワークフローとして残す：

- 要件定義、設計判断、優先順位付け
- コードレビューの評価や改善提案
- 例外ケースの解釈、ユーザーとの相談
- 一度きりの作業で、スクリプト作成コストが回収できないもの

### Step 3: 実行環境を確認する

Windows と Linux(Ubuntu) の両方で動くスクリプトを優先する。迷ったら Python 標準ライブラリで書く。Node.js プロジェクトでは `.mjs` も候補にする。

作成前にランタイムを確認する：

```bash
python --version
python3 --version
node --version
```

必要なランタイムがない場合は、勝手にインストールしない。選択式で「インストールする」「別ランタイムに変更する」「今回はスクリプトファイルだけ生成する」を確認する。詳細は [references/runtime-policy.md](references/runtime-policy.md) を読む。

### Step 4: スキルの雛形を生成する

定型的な雛形生成は、このスキル同梱のスクリプトを使う。最初はドライランで確認する：

```bash
python scripts/scripted_skill_tool.py scaffold --name github-activity-exporter --output .agents/skills --purpose "GitHub activity data export" --script-name collect_activity --runtime python
```

問題なければ `--apply` を付けて作成する：

```bash
python scripts/scripted_skill_tool.py scaffold --name github-activity-exporter --output .agents/skills --purpose "GitHub activity data export" --script-name collect_activity --runtime python --apply
```

生成後、`scripts/{script-name}.py` または `scripts/{script-name}.mjs` の TODO を、対象業務の実処理に置き換える。生成されるスキルの基本形は [assets/scripted-skill-template.md](assets/scripted-skill-template.md) を参考にする。

### Step 5: スクリプトを実装する

実装ルール：

- 生成される Agent Skill のスクリプトは必ずそのスキルの `scripts/` フォルダに保存する
- Windows/Linux のパス差を避けるため、Python では `pathlib`、Node.js では `node:path` を使う
- 書き込み・削除・外部送信を伴う場合は `--dry-run` を用意し、危険な操作は既定で適用しない
- 出力順序を安定させる。CSV は列順を固定し、JSON は必要に応じてキー順を固定する
- 外部依存は最小限にする。必要な場合は依存名、用途、導入確認手順を SKILL.md に書く
- シークレット、トークン、個人情報をログに出さない
- エラー時は原因、入力、次の確認ポイントを短く出す

### Step 6: SKILL.md からスクリプトを呼ぶ導線を書く

生成されるスキルの `SKILL.md` には、少なくとも以下を含める：

- スキル読み込み通知
- 何を AI が判断し、何をスクリプトが処理するか
- ランタイム確認コマンド
- ドライランと本実行のコマンド
- 入力、出力、失敗時の見方
- スクリプトの更新が必要な条件

テンプレートをそのまま埋め込まず、必要に応じて `assets/` や `references/` に分離する。

### Step 7: 検証する

作成後に、このスキル同梱の検証を実行する：

```bash
python scripts/scripted_skill_tool.py validate --skill .agents/skills/github-activity-exporter
```

さらに、生成した業務スクリプト自体の `--help`、ドライラン、代表入力、空入力、異常入力を実行して確認する。問題があれば `SKILL.md` だけで説明を増やすのではなく、まずスクリプトの引数、エラー表示、出力形式を改善する。

## 参照ドキュメント

- [references/script-first-design.md](references/script-first-design.md) — スクリプト化の判断基準と代表ユースケース
- [references/runtime-policy.md](references/runtime-policy.md) — Windows/Linux のランタイム確認とインストール確認方針
- [references/script-quality-checklist.md](references/script-quality-checklist.md) — 生成スクリプトの品質チェックリスト
- [assets/scripted-skill-template.md](assets/scripted-skill-template.md) — 生成されるスクリプト活用型 Agent Skill のテンプレート
- [scripts/scripted_skill_tool.py](scripts/scripted_skill_tool.py) — スキル雛形生成と検証の補助スクリプト
