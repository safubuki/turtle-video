# Android 機能拡張パック — 全体計画（2026-07-18）

## 目的

Android（standard フレーバー = Android / PC）側の使い勝手を大きく向上させる 4 機能を追加する。
**iOS Safari（apple-safari フレーバー）には実装しない**。十分な検証後、別サイクルで iOS への展開を判断する。

## 対象機能

| # | 機能 | 仕様書 | 規模 |
|---|------|--------|------|
| F1 | キャプションのシステムフォント拡張 | [f1-caption-system-fonts.md](2026-07-18_f1-caption-system-fonts.md) | 小 |
| F2 | 動画/ナレーションの簡単コピー | [f2-clip-narration-duplicate.md](2026-07-18_f2-clip-narration-duplicate.md) | 小 |
| F3 | 複数 BGM 対応 | [f3-multi-bgm.md](2026-07-18_f3-multi-bgm.md) | 大 |
| F4 | 長文キャプションの簡単入力 | [f4-caption-bulk-input.md](2026-07-18_f4-caption-bulk-input.md) | 中 |

## Android 限定の実現方法（共通方針）

2026-07-18 に完了したフレーバー物理分離アーキテクチャを前提とする。

- **UI の出し分け**: 共有コンポーネントでは `usePlatformCapabilities()`（PlatformCapabilitiesContext）の
  `isIosSafari` で判定する。standard フレーバーでは常に `false` にピン留めされているため、
  `!isIosSafari` = Android/PC 限定 UI となる。UA 直接判定は行わない（ESLint で禁止済み）。
- **再生・エクスポート挙動**: standard フレーバー所有のコード
  （`src/flavors/standard/preview/usePreviewEngine.ts`, `src/flavors/standard/export/exportEngine.ts`）
  のみ変更する。apple-safari フレーバーのファイルは原則変更しない
  （型互換のためのフォールバック追加のみ許可し、挙動は変えない）。
- **データモデル**: 型・ストア・永続化は共有のため **追加的（additive）変更のみ** とする。
  iOS で読み込んでもクラッシュせず、新機能のデータは「無視される or 縮退表示」になるよう設計する。

## 実装順序

1. **Phase A: F2**（簡単コピー）— 最小・独立。ストアにアクション追加 + UI ボタン。
2. **Phase B: F1**（フォント拡張）— フォントカタログ新設 + UI + 描画エンジン参照差し替え。
3. **Phase C: F3**（複数 BGM）— 型/ストア → 再生パイプライン → UI → 永続化 → 自動保存。
4. **Phase D: F4**（一括キャプション入力）— 一括入力モーダル + 連続タイミング調整。

各 Phase の完了条件: `npm run test:run` 全合格 / `npm run lint` エラー 0 / `npm run build` 成功。

## リスクと注意（デグレ防止）

- iOS Safari の preview / export 経路（apple-safari フレーバー）に変更を波及させない。
  フレーバー境界 ESLint ガードと isolation テストが機械的に検出する。
- 共有型の拡張（`CaptionFontStyle` 追加値、`NarrationClip` のフェード任意フィールド、`BgmClip` 新設）は
  すべて optional / 追加値であり、既存データの読み込みに影響しない。
- 保存データ互換: 新フィールドが無い旧データはこれまで通り動作する。新データを旧バージョン/iOS で
  開いた場合は F3 のミラー仕様（f3 仕様書参照）により BGM 1 本目のみ再生される。
