# License audit script contract

## 入力と実行

- `node .agents/skills/app-add-license/scripts/license_audit.mjs [--project-root PATH] [--source-only] [--dry-run]`
- 引数なしの対象は、スクリプトから四階層上の Turtle Video リポジトリ。`--project-root` で別のチェックアウトを指定できる。
- `--dry-run` は読む予定のファイルと検査項目を表示し、検査も書き込みもしない。
- 通常実行は読み取り専用。`--source-only` は `dist/` の検査を省略する。生成物まで確認するときは `npm run build` 後に引数なしで実行する。

## 静的検査

1. `LICENSE` の「version 3 or any later version」の告知、`package.json` とロックファイルのルートの `GPL-3.0-or-later`、README の SPDX 表記。
2. `package.json` のビルドスクリプトによる第三者告知生成、`vite.config.ts` のソースマップ設定。
3. ロックファイルのルートを除く `packages` 件数・ライセンス別件数と、`src/constants/sectionHelp.ts` の集計表示の一致。直接依存・開発依存のパッケージ名と指定範囲の存在。
4. ヘルプに `LICENSE.txt` と `THIRD_PARTY_LICENSES.txt` への参照があること。
5. 通常実行では `dist/LICENSE.txt` とルート `LICENSE` の完全一致、第三者告知の `Packages:` 件数と `Declared license:` 節の件数一致を確認する。

## 出力と失敗

- 標準出力に `PASS` / `FAIL` と件数を固定順で出す。成功時は終了コード `0`、不一致・不足ファイル・不正な引数は `1`。
- 外部送信、ファイル生成、削除、パッケージのインストールはしない。
- 監査成功は静的整合性だけを意味する。各原文の法的条件、素材の権利、ソースコード提供、公開 URL、特許は人が別途確認する。

## 更新条件

ヘルプ集計のデータ形式、ロックファイル形式、ビルドスクリプト、告知ファイル名・形式、ソースマップの扱い、配布方式が変わった場合に検査を更新する。
