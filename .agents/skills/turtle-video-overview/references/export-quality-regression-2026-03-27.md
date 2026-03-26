## PC / Android export のカクつき再調査メモ

- 対象: `src/components/TurtleVideo.tsx`, `src/utils/previewPlatform.ts`, `src/test/previewPlatform.test.ts`
- 背景:
  - `v5` 系で追加した「途中クリップ終端 hold」と「描画済み時刻ベースの非 iOS export pacing」は、黒フレーム抑止には寄与する一方、`holdFrame` が入った瞬間に export 時刻が止まりやすく、PC / Android で中盤のカクつきが増えるケースがあった。
  - 実測では `19.8s〜22.0s` 帯のようなクリップ境界密集区間で freeze が増え、`8dadec...` の旧安定挙動より明らかに品質が落ちていた。
- 対応:
  - 非 iOS export では loop 時刻も `getPlaybackTimeSec` も `currentTimeRef` / 壁時計ベースへ戻し、`lastRenderedExportTimeRef` 依存の pacing は使わない。
  - `shouldHoldVideoFrameAtClipEnd()` は preview と iOS export の既存挙動を維持しつつ、PC / Android export では「最終クリップ終端」だけ hold を許可する。
- 注意点:
  - iOS Safari export ルートは対象外。
  - 最終クリップ終端の黒フレーム防止、Android の image -> video 境界安定化、Teams 向けの尺合わせは維持する。
