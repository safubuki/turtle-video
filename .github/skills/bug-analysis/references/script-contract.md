# bug_analysis_collect.py 契約

## 自動処理する範囲

- Python、Node、Git、OS の情報収集
- `package.json` から test/build/typecheck/lint 系コマンドの列挙
- 依頼文、エラー文、既知パスから検索語を正規化
- ソース・設定・文書内の一致箇所を上限付きで抽出
- 明示指定されたログ末尾の抽出と機密らしい値のマスク

根本原因、深刻度、修正内容、採用案は決定しない。

## 安定性

- 配列はパスと行番号で安定ソートする。
- JSON の最上位キーは `schema_version`, `project_root`, `request`, `terms`, `observations`, `candidate_files`, `log_excerpts`, `verification_commands`, `warnings` の順とする。
- 自動走査では `.git`, `node_modules`, build/dist, venv, `.env`, 鍵・証明書候補を除外する。
- ログは既定で末尾200行、候補は既定で最大30件とする。

## 安全性

標準動作は読み取り専用である。`--output` は新規ファイルだけを作成し、既存ファイルは `--force` なしに上書きしない。外部通信、依存導入、コマンド実行によるテストは行わない。
