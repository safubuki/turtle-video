---
name: turtle-video-overview
description: Turtle Video プロジェクトの全体像（技術スタック・機能・構成・状態管理）と、過去の不具合対策・実装パターン・デグレ注意点を参照するスキル。Turtle Video のコードを修正・機能追加するときは、scripts/find_patterns.py で関連する過去の対策だけを抜き出してからデグレ防止チェックを行い、対応内容を再発防止の記録として追記する（旧 bugfix-guard を統合）。「Turtle Video の概要」「このプロジェクトの全体像」「技術スタック」「機能一覧」「アーキテクチャ」「実装で気をつけること」「デグレ防止」「過去の対策を確認」「バグ修正」「機能追加」「project overview」などで発火。
---

# Turtle Video Overview

## スキル読み込み通知

読み込んだら 1 行だけ通知する：

> 🐢 **Turtle Video Overview を読み込みました** — 関連する過去の対策を抜き出してから作業します。

## 使い方は 2 通り

| 目的 | やること |
|---|---|
| プロジェクトを知りたい（概要・構成・技術スタック） | `references/project-details.md` を読んで答える |
| コードを修正・機能追加する | 下の「変更時の手順」に従う |

> ⚠️ `references/implementation-patterns.md` は約 800KB・330 件以上の対策を含む。**丸ごと読まない。** 必ず `scripts/find_patterns.py` か検索で該当箇所だけを読む。

## 変更時の手順（旧 bugfix-guard）

### Step 1: 関連する過去の対策を抜き出す

プロジェクトルートで実行する（`.claude/skills` や `.github/skills` から使う場合はパスを読み替える）：

```bash
python .agents/skills/turtle-video-overview/scripts/find_patterns.py --request "<ユーザーの依頼文>" --path <対象ファイルやキーワード>
```

- 出力の `file:line` の範囲だけを読む。一致が少なければ機能名・ファイル名を `--path` に足して再実行する
- 出力の「デグレ確認」と [references/degre-checklist.md](references/degre-checklist.md) の該当節を確認する
- iPhone/iPad Safari と Android/PC で挙動が分かれる変更は `turtle-video-platform-targeting` で flavor を決めてから触る

確認結果はユーザーへ短く伝える（関連する既存対策 / 競合リスク / 注意点）。

### Step 2: 実装する

| 原則 | 内容 |
|---|---|
| 既存の対策を壊さない | 抜き出した対策・ワークアラウンドと矛盾しない実装にする |
| 変更は最小限 | 依頼に関係のないコードは変えない |
| 既存スタイルに合わせる | 命名・ファイル構成・TypeScript strict・ESLint/Prettier |
| ObjectURL は解放まで | `URL.createObjectURL` を足したら `revokeObjectURL` の経路も作る |
| 描画は 4 経路で考える | 再生・シーク・エクスポート・タブ復帰のすべてで成立させる |

### Step 3: 検証する

スクリプトが出した検証コマンド（通常は `npm run test:run` → `npm run build`）を実行する。失敗したら修正を見直し、過去の対策を壊していないか Step 1 の箇所と照合する。

### Step 4: 対応を記録する

積み上がった記録は「同じ失敗を二度としない」ための資産なので、**不具合修正・機能追加をしたら原則として記録する。** 既存の記録は削除・要約しない。省いてよいのは、文言の修正やスタイルの微調整など、次に触る人が知らなくても壊さないものだけ。

- 探しやすさのため、テーマに合う節（1〜12 章）へ追記する。同じ不具合の続きなら既存エントリに追記する
- 1 エントリは 10 行程度に収める：

```markdown
### X-N. {対策のタイトル}

- **ファイル**: `{変更したファイル}`
- **問題**: {何が起きたか}
- **対策**: {何をしたか}
- **注意**: {将来の変更で壊しやすい点}
```

- 長い調査・失敗の経緯は `references/<テーマ>-YYYY-MM-DD.md` に分け、下の一覧にリンクを足す
- 新機能は `references/project-details.md` の機能セクションへ

### Step 5: 報告する

変更ファイルと内容、テスト・ビルド結果、追記した記録の場所を短くまとめる。

## リファレンス

- [references/project-details.md](references/project-details.md) — 技術スタック、ディレクトリ構成、機能一覧、状態管理、型定義、開発コマンド、コーディング規約
- [references/implementation-patterns.md](references/implementation-patterns.md) — 実装パターンと過去の対策（巨大。検索して読む）
- [references/degre-checklist.md](references/degre-checklist.md) — デグレ防止チェックリスト
- [scripts/find_patterns.py](scripts/find_patterns.py) — 依頼に関係する対策の抽出（読み取り専用・標準ライブラリのみ・Python 3.10+）

### 個別の調査記録

- [references/export-recovery-2026-07-20.md](references/export-recovery-2026-07-20.md) — フルHD/HD/自動モード導入後のエクスポート復旧（解像度検証緩和・ハング対策ウォッチドッグ・秒数表示・音漏れ）
- [references/export-video-backpressure-postmortem-2026-07-27.md](references/export-video-backpressure-postmortem-2026-07-27.md) — 動画 export の早送り・後半黒画面の真因と backpressure 同期
- [references/export-speed-video-wall-dilation-postmortem-2026-08-01.md](references/export-speed-video-wall-dilation-postmortem-2026-08-01.md) — 倍速 export の途中切れ／静止画化と wall dilation
- [references/export-quality-regression-2026-03-27.md](references/export-quality-regression-2026-03-27.md) — PC / Android export のカクつき再調査
- [references/export-audio-regression-2026-03-13.md](references/export-audio-regression-2026-03-13.md) — PC エクスポートが無音になった回帰
- [references/android-export-audio-isolation-2026-03-13.md](references/android-export-audio-isolation-2026-03-13.md) — Android export 中に端末スピーカーへ音が漏れる問題
- [references/export-preparation-phase-indicator-2026-03-13.md](references/export-preparation-phase-indicator-2026-03-13.md) — export 準備フェーズ（1/4…）表示
- [references/export-startup-status-unification-2026-03-13.md](references/export-startup-status-unification-2026-03-13.md) — export 開始直後のステータス表示の統一
- [references/ios-safari-audit-2026-03-13.md](references/ios-safari-audit-2026-03-13.md) — iOS Safari 分岐の監査
- [references/ios-safari-preview-audio-notes.md](references/ios-safari-preview-audio-notes.md) — iOS Safari プレビュー音声の出力モード
- [references/ios-preview-audio-prewarm-2026-03-13.md](references/ios-preview-audio-prewarm-2026-03-13.md) — iPhone で BGM 追加時にプレビューが無音になる問題（prewarm）
- [references/save-after-visibility-return-2026-03-13.md](references/save-after-visibility-return-2026-03-13.md) — タブ非アクティブ復帰後に保存が失敗する問題

### プロジェクト内の資料

- `spec.md`（仕様と実装計画）、`README.md`、`version.json`、`package.json` — プロジェクトルートにある
