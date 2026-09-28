---
name: app-add-license
description: Turtle Video の GPL 表記、OSS 依存集計、配布ビルドの第三者告知を整備・監査するスキル。scripts/license_audit.mjs で定型的な整合性を検査し、AI が原文条件と特許指摘への対応を判断する。「ライセンス対応」「OSS表示」「第三者ライセンス」「特許の指摘」「app-add-license」で使用する。
---

# App Add License

## スキル読み込み通知

初めてこのスキルを使うときは、ライセンスと配布告知の現状を確認し、スクリプトで整合性を検査する旨をユーザーに簡潔に伝える。

## 目的と適用範囲

Turtle Video の依存追加・更新、素材追加、README/ヘルプのライセンス表記変更、ビルド・PWA・デプロイ変更、リリース準備、ライセンス・特許に関する問い合わせで使用する。公開者の前提、今回までの対応と残る確認範囲は [references/license-history.md](references/license-history.md) に記録する。人間向けの詳細ガイドはリポジトリの `Docs/specs/2026-09-27_license-compliance-guide.md`。

プロジェクト自身の GPL、依存一覧・ロックファイル集計、実際に配布する第三者告知、第三者の特許は別々に評価する。無償・非事業の公開や、自動生成ファイルの存在をもって、すべてのライセンス条件の充足または特許非侵害を宣言しない。

## 現行の実装

- 本体の選択は `GPL-3.0-or-later`。ルート `LICENSE` が正本で、`package.json` / `package-lock.json` / README / ヘルプ / ソースヘッダーの表記を揃える。
- `src/constants/sectionHelp.ts` の直接依存・開発依存一覧とロックファイル全体の集計は、**配布物の内訳ではない**。2026-09-27 の 677 エントリは当時の記録。
- `npm run build` の最後に `scripts/generate-third-party-licenses.mjs` を実行する。配布ソースマップから検出したパッケージと、生成コードに関係する `vite`、`vite-plugin-pwa`、`tailwindcss` の原文告知を `dist/THIRD_PARTY_LICENSES.txt` に集め、ルート `LICENSE` を `dist/LICENSE.txt` にコピーする。アプリ内ヘルプから両方を開ける。2026-09-27 の 17 パッケージは当時の記録。
- `vite.config.ts` の `sourcemap: true` が告知生成の前提。GitHub Pages のワークフローは `npm run build` 後の `dist/` を配布する。

## AI とスクリプトの役割

| 担当 | 内容 |
| --- | --- |
| `scripts/license_audit.mjs` | 本体ライセンス識別子、ロックファイル集計とヘルプ表示、ビルド設定、生成済み告知ファイルの静的整合性を読み取り専用で検査する |
| AI | 新しい依存・素材の原文条件と配布範囲を調べ、互換性・追加条件・例外・通知方法を判断する。検査結果の意味を説明し、未確認範囲を明示する |
| 公開者・専門家 | ライセンス方針の変更、法的な認否、相手への連絡、具体的な特許指摘や事業化時の判断を行う |

## 手順

1. リポジトリの `LICENSE`、`package.json`、`package-lock.json`、README のライセンス節、`src/constants/sectionHelp.ts`、`scripts/generate-third-party-licenses.mjs`、`vite.config.ts`、`.github/workflows/deploy.yml`、人間向けガイドを現物で確認する。
2. 新しいパッケージや素材について、実際に配布されるか、原文ライセンス・著作権表示・`NOTICE`・追加条件・GPL との関係を確認する。ソースマップに出ない生成コード、PWA、CSS、手動コピー、画像・フォント・音声・動画、CDN 素材は個別に追う。
3. Node.js を確認し、監査の予定を表示する。ランタイムがない場合は勝手にインストールせず、利用可能な別ランタイムか後日の検証を相談する。

   ```bash
   node --version
   node .agents/skills/app-add-license/scripts/license_audit.mjs --dry-run
   ```

4. 配布物を確認する作業では `npm run build` を実行し、読み取り専用の監査を実行する。ビルド前のソースだけを見る場合は `--source-only` を使用する。

   ```bash
   npm run build
   node .agents/skills/app-add-license/scripts/license_audit.mjs
   node .agents/skills/app-add-license/scripts/license_audit.mjs --source-only
   ```

5. 監査が通っても、対象パッケージの著作権表示・許諾文が生成物に入るか、件数の増減、対応するソースコードへの導線、配布形態ごとの同梱、公開後の実 URL を確認する。ロックファイル件数と配布告知件数を混同しない。
6. 特許など具体的な権利の指摘は、通知・受領日・権利番号・地域・請求項・対象実装と版を保存して個別に評価する。具体性と影響が高い場合は機能の一時停止、設計変更、専門家相談を検討する。相手への連絡や法的な認否は公開者の判断を要する。
7. 対応結果では、確認済みの範囲、未確認の素材・配布形態、特許について未判断の点を分けて報告する。変更を加えた場合は人間向けガイドとこのスキルの記録も更新する。

## スクリプトの契約と更新条件

入力・出力・終了コードは [references/script-contract.md](references/script-contract.md) を参照する。ロックファイルやヘルプの形式、ビルド・告知生成の方式、追加する配布形態が変わったときにスクリプトの検査条件を更新する。スクリプトは法的な互換性や特許を判定しない。
