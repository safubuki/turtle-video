import { describe, expect, it } from 'vitest';

import {
  createExportAdaptiveQuantizer,
  EXPORT_QUANTIZER_BASE_QP,
  EXPORT_QUANTIZER_KEYFRAME_OFFSET,
  EXPORT_QUANTIZER_MAX_QP,
  EXPORT_QUANTIZER_MIN_QP,
} from '../flavors/standard/export/exportAdaptiveQuantizer';

describe('createExportAdaptiveQuantizer', () => {
  it('初期値は基準 QP（P=24 / I=26）を返し、H.264 の安全な範囲内に収める', () => {
    const q = createExportAdaptiveQuantizer({ targetBitrate: 10_000_000, fps: 30 });
    expect(q.getQuantizerForFrame(false)).toBe(EXPORT_QUANTIZER_BASE_QP);
    expect(q.getQuantizerForFrame(true)).toBe(
      EXPORT_QUANTIZER_BASE_QP + EXPORT_QUANTIZER_KEYFRAME_OFFSET,
    );
  });

  it('単発の大きなキーフレーム（カット直後）や短いフェードスパイクで QP が跳ね上がらない', () => {
    const q = createExportAdaptiveQuantizer({ targetBitrate: 10_000_000, fps: 30 });
    // 通常の軽い区間を 20 フレーム流す（~20KB/frame = 4.8 Mbps）
    for (let i = 0; i < 20; i++) {
      q.onEncodedChunk(20_000, i === 0);
    }
    const beforeCut = q.getQuantizerForFrame(false);
    expect(beforeCut).toBeLessThanOrEqual(EXPORT_QUANTIZER_BASE_QP);

    // カット直後に 180KB の大きなキーフレーム + 100KB のフェード開始 P フレームが来ても
    // QP=51 のような急騰は一切起きない
    q.onEncodedChunk(180_000, true);
    expect(q.getQuantizerForFrame(false)).toBeLessThanOrEqual(EXPORT_QUANTIZER_BASE_QP);
    q.onEncodedChunk(100_000, false);
    expect(q.getQuantizerForFrame(false)).toBeLessThanOrEqual(EXPORT_QUANTIZER_BASE_QP);
  });

  it('継続的な高ビットレート（1080p の激しいノイズ等）では速やかに QP を上げて上限で頭打ちにする', () => {
    const q = createExportAdaptiveQuantizer({ targetBitrate: 12_000_000, fps: 30 });
    // 目標 50KB/frame に対して 450KB/frame（9倍 = 108 Mbps 相当）が続く最悪ケース
    for (let i = 0; i < 20; i++) {
      q.onEncodedChunk(450_000, i === 0);
    }
    const qpAfterNoise = q.getQuantizerForFrame(false);
    // 0.7 秒以内に上限 QP=34 へ到達してサイズ暴走を止め、かつ 34 を超えない（51 にならない）
    expect(qpAfterNoise).toBe(EXPORT_QUANTIZER_MAX_QP);
    expect(q.getQuantizerForFrame(true)).toBe(EXPORT_QUANTIZER_MAX_QP);
  });

  it('高複雑度シーンの後に静かなシーンへ戻ると、緩やかに下限 QP まで回復する', () => {
    const q = createExportAdaptiveQuantizer({ targetBitrate: 10_000_000, fps: 30 });
    for (let i = 0; i < 20; i++) {
      q.onEncodedChunk(400_000, false);
    }
    expect(q.getQuantizerForFrame(false)).toBe(EXPORT_QUANTIZER_MAX_QP);

    // 静かなシーン（10KB/frame = 2.4 Mbps）が十分続けば MIN_QP へ戻る
    for (let i = 0; i < 120; i++) {
      q.onEncodedChunk(10_000, false);
    }
    expect(q.getQuantizerForFrame(false)).toBe(EXPORT_QUANTIZER_MIN_QP);
  });

  it('統計情報を正しく返し、不正な入力でも NaN や範囲外 QP を出さない', () => {
    const q = createExportAdaptiveQuantizer({ targetBitrate: Number.NaN, fps: 0 });
    q.onEncodedChunk(Number.NaN, false);
    q.onEncodedChunk(-100, true);
    const pQp = q.getQuantizerForFrame(false);
    const iQp = q.getQuantizerForFrame(true);

    expect(pQp).toBe(EXPORT_QUANTIZER_BASE_QP);
    expect(iQp).toBe(EXPORT_QUANTIZER_BASE_QP + EXPORT_QUANTIZER_KEYFRAME_OFFSET);
    expect(q.getStats()).toEqual({
      minIssuedQp: EXPORT_QUANTIZER_BASE_QP,
      maxIssuedQp: EXPORT_QUANTIZER_BASE_QP + EXPORT_QUANTIZER_KEYFRAME_OFFSET,
      lastIssuedQp: EXPORT_QUANTIZER_BASE_QP + EXPORT_QUANTIZER_KEYFRAME_OFFSET,
      currentBaseQp: EXPORT_QUANTIZER_BASE_QP,
      observedChunks: 0,
      adjustCount: 0,
    });
  });
});
