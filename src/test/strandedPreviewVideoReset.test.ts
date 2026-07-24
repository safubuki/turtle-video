/**
 * エクスポート後プレビュー黒フレーム点滅対策のテスト（Issue #209）。
 *
 * エクスポートで active video を終端まで再生すると、要素は ended（readyState 4・currentTime≒尺末）で残る。
 * 次のプレビュー開始で先頭へ巻き戻すと、Chrome では ended 由来の逆方向シークが settle せず、
 * preflight が「準備済み(readyState≥2)」と早期判定→ループ側が毎フレーム currentTime を再代入し続けて
 * シークが完了せず readyState が 1 へ落ち、約500msごとの黒フレーム点滅になる。
 * `shouldResetStrandedPreviewVideo` は、warmup で load() による decoder リセットが必要な状態
 * （メタデータ未取得 / ended / target を大きく超えた currentTime）を判定する。
 */
import { describe, expect, it } from 'vitest';
import {
  shouldResetStrandedPreviewVideo,
  shouldRecoverDecodeStalledActiveVideo,
} from '../flavors/standard/preview/usePreviewEngine';

describe('shouldResetStrandedPreviewVideo', () => {
  it('readyState 0（メタデータ未取得）は load() リセット対象', () => {
    expect(
      shouldResetStrandedPreviewVideo({
        readyState: 0,
        ended: false,
        currentTime: 0,
        warmupTargetTime: 0,
      }),
    ).toBe(true);
  });

  it('ended（エクスポートで終端まで再生された取り残し）は load() リセット対象', () => {
    expect(
      shouldResetStrandedPreviewVideo({
        readyState: 4,
        ended: true,
        currentTime: 10.005,
        warmupTargetTime: 0,
      }),
    ).toBe(true);
  });

  it('ended フラグが無くても currentTime が target を大きく超えていればリセット対象', () => {
    expect(
      shouldResetStrandedPreviewVideo({
        readyState: 4,
        ended: false,
        currentTime: 9.8,
        warmupTargetTime: 0,
      }),
    ).toBe(true);
  });

  it('通常の warmup シーク幅（±0.2s 程度）ではリセットしない（既存挙動を維持）', () => {
    expect(
      shouldResetStrandedPreviewVideo({
        readyState: 4,
        ended: false,
        currentTime: 0.15,
        warmupTargetTime: 0,
      }),
    ).toBe(false);
  });

  it('健全な準備済み video（target 付近・非 ended）はリセットしない', () => {
    expect(
      shouldResetStrandedPreviewVideo({
        readyState: 2,
        ended: false,
        currentTime: 3.0,
        warmupTargetTime: 3.0,
      }),
    ).toBe(false);
  });

  it('trimStart 付きクリップでも target 基準で判定する', () => {
    // warmupTargetTime=5.0（trimStart 由来）付近の currentTime はリセットしない
    expect(
      shouldResetStrandedPreviewVideo({
        readyState: 2,
        ended: false,
        currentTime: 5.1,
        warmupTargetTime: 5.0,
      }),
    ).toBe(false);
    // 同じ target でも尺末まで取り残された位置はリセットする
    expect(
      shouldResetStrandedPreviewVideo({
        readyState: 4,
        ended: false,
        currentTime: 10.0,
        warmupTargetTime: 5.0,
      }),
    ).toBe(true);
  });
});

describe('shouldRecoverDecodeStalledActiveVideo', () => {
  const base = {
    isActivePlaying: true,
    isExporting: false,
    isUserSeeking: false,
    hasError: false,
    readyState: 1,
    seeking: true,
    nowMs: 10_000,
    stallSinceMs: 9_000, // 1s 継続
    lastRecoverAtMs: 0,
  };

  it('readyState<=1 + seeking が猶予を超えて継続していれば recover 対象', () => {
    expect(shouldRecoverDecodeStalledActiveVideo(base)).toBe(true);
  });

  it('stall が猶予（300ms）未満なら recover しない（正常な短い seek を壊さない）', () => {
    expect(
      shouldRecoverDecodeStalledActiveVideo({ ...base, stallSinceMs: 9_900 }),
    ).toBe(false);
  });

  it('直近 recover から throttle 間隔（1200ms）内なら再 recover しない', () => {
    expect(
      shouldRecoverDecodeStalledActiveVideo({ ...base, lastRecoverAtMs: 9_500 }),
    ).toBe(false);
  });

  it('readyState>=2（描画可能）なら stall ではない', () => {
    expect(
      shouldRecoverDecodeStalledActiveVideo({ ...base, readyState: 2 }),
    ).toBe(false);
  });

  it('seeking でなければ stall ではない', () => {
    expect(
      shouldRecoverDecodeStalledActiveVideo({ ...base, seeking: false }),
    ).toBe(false);
  });

  it('stallSinceMs 未観測（null）なら recover しない', () => {
    expect(
      shouldRecoverDecodeStalledActiveVideo({ ...base, stallSinceMs: null }),
    ).toBe(false);
  });

  it('エクスポート中・ユーザーシーク中・エラー時・非再生時は対象外', () => {
    expect(shouldRecoverDecodeStalledActiveVideo({ ...base, isExporting: true })).toBe(false);
    expect(shouldRecoverDecodeStalledActiveVideo({ ...base, isUserSeeking: true })).toBe(false);
    expect(shouldRecoverDecodeStalledActiveVideo({ ...base, hasError: true })).toBe(false);
    expect(shouldRecoverDecodeStalledActiveVideo({ ...base, isActivePlaying: false })).toBe(false);
  });
});
