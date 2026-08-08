/**
 * @file captureFrameSettle.test.ts
 * @description キャプチャ前のフレーム確定待ち（waitForPreviewFrameSettled）の挙動テスト。
 *   シークで終端へ移動した直後に保存画像が 1 フレーム前になる問題への対策を検証する。
 */
import { describe, it, expect } from 'vitest';
import { waitForPreviewFrameSettled, waitForVideoFrameAtTime } from '../utils/canvas';

function makeVideo(seeking: boolean): HTMLVideoElement {
  const v = document.createElement('video');
  // jsdom の seeking は読み取り専用のため、テスト用に上書きする。
  Object.defineProperty(v, 'seeking', { value: seeking, configurable: true });
  return v;
}

/** jsdom では seeking / readyState / currentTime が読み取り専用のため差し替える */
function makeSeekableVideo(state: {
  seeking: boolean;
  readyState: number;
  currentTime: number;
}): HTMLVideoElement {
  const v = document.createElement('video');
  const current = { ...state };
  Object.defineProperty(v, 'seeking', { get: () => current.seeking, configurable: true });
  Object.defineProperty(v, 'readyState', { get: () => current.readyState, configurable: true });
  Object.defineProperty(v, 'currentTime', {
    get: () => current.currentTime,
    set: (value: number) => {
      current.currentTime = value;
      current.seeking = true;
    },
    configurable: true,
  });
  // テストから「デコード完了」を再現するためのヘルパー
  (v as unknown as { __settleAt: (t: number) => void }).__settleAt = (t: number) => {
    current.currentTime = t;
    current.seeking = false;
    current.readyState = 4;
    v.dispatchEvent(new Event('seeked'));
  };
  return v;
}

describe('waitForPreviewFrameSettled', () => {
  it('シーク中の要素が無ければ素通りで解決する（通常再生で終端に来たケース）', async () => {
    const v = makeVideo(false);
    await expect(waitForPreviewFrameSettled({ v })).resolves.toBeUndefined();
  });

  it('シーク中なら seeked 完了まで解決を待つ', async () => {
    const v = makeVideo(true);
    const p = waitForPreviewFrameSettled({ v }, 5000);
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });
    // seeked 前は解決しない
    await Promise.resolve();
    expect(resolved).toBe(false);
    // seeked 発火後に解決する
    v.dispatchEvent(new Event('seeked'));
    await expect(p).resolves.toBeUndefined();
  });

  it('seeked が来なくても timeout で解決する（フリーズ防止の保険）', async () => {
    const v = makeVideo(true);
    await expect(waitForPreviewFrameSettled({ v }, 30)).resolves.toBeUndefined();
  });

  it('画像・音声要素はシーク待ちの対象にしない', async () => {
    const img = document.createElement('img');
    const audio = document.createElement('audio');
    await expect(waitForPreviewFrameSettled({ img, audio })).resolves.toBeUndefined();
  });
});

describe('waitForVideoFrameAtTime', () => {
  it('既に目標時刻のフレームを保持していれば即座に解決する', async () => {
    const v = makeSeekableVideo({ seeking: false, readyState: 4, currentTime: 9.539 });
    await expect(waitForVideoFrameAtTime(v, 9.539)).resolves.toBeUndefined();
  });

  it('目標時刻とズレていれば seeked でデコード完了するまで待つ', async () => {
    // 「再生し切った直後、video は最終フレームより手前で止まっている」状況を再現する
    const v = makeSeekableVideo({ seeking: false, readyState: 4, currentTime: 9.5 });
    const p = waitForVideoFrameAtTime(v, 9.539, 1 / 120, 5000);

    let resolved = false;
    void p.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    // 目標時刻へデコードが追いついたら解決する
    (v as unknown as { __settleAt: (t: number) => void }).__settleAt(9.539);
    await expect(p).resolves.toBeUndefined();
  });

  it('目標時刻へ到達しないまま止まっても timeout で解決する（フリーズ防止）', async () => {
    const v = makeSeekableVideo({ seeking: true, readyState: 1, currentTime: 0 });
    await expect(waitForVideoFrameAtTime(v, 9.539, 1 / 120, 30)).resolves.toBeUndefined();
  });

  it('要素が無い場合（画像クリップ等）は即解決する', async () => {
    await expect(waitForVideoFrameAtTime(null, 1)).resolves.toBeUndefined();
  });

  it('許容差の範囲内なら待たない（不要なシーク待ちを作らない）', async () => {
    const v = makeSeekableVideo({ seeking: false, readyState: 4, currentTime: 4.0 });
    await expect(waitForVideoFrameAtTime(v, 4.002, 1 / 120)).resolves.toBeUndefined();
  });
});
