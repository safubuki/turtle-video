/**
 * @file videoEncoderConfig.test.ts
 * @description VideoEncoder 設定交渉の純ロジック回帰テスト。
 * 「未対応環境では現行と同じ baseline へ落ちる」ことを最重要の不変条件として守る。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildBaselineVideoEncoderConfig,
  buildVideoEncoderConfigCandidates,
  resolveVideoEncoderConfig,
} from '../utils/videoEncoderConfig';

const PARAMS = {
  width: 1920,
  height: 1080,
  bitrate: 12_000_000,
  framerate: 30,
};

/** テスト用に globalThis.VideoEncoder を差し替える */
const stubVideoEncoder = (
  isConfigSupported: ((config: VideoEncoderConfig) => Promise<VideoEncoderSupport>) | null
) => {
  const stub = isConfigSupported ? { isConfigSupported } : {};
  (globalThis as unknown as { VideoEncoder: unknown }).VideoEncoder = stub;
};

afterEach(() => {
  delete (globalThis as unknown as { VideoEncoder?: unknown }).VideoEncoder;
  vi.restoreAllMocks();
});

describe('buildBaselineVideoEncoderConfig', () => {
  it('現行実装と同じ最小構成を返す（余計なキーを足さない）', () => {
    const config = buildBaselineVideoEncoderConfig(PARAMS);
    expect(config).toEqual({
      codec: 'avc1.4d002a',
      width: 1920,
      height: 1080,
      bitrate: 12_000_000,
      framerate: 30,
    });
    // 負荷軽減用のキーは baseline には入れない
    expect(config.hardwareAcceleration).toBeUndefined();
    expect(config.latencyMode).toBeUndefined();
  });
});

describe('buildVideoEncoderConfigCandidates', () => {
  it('軽い候補から順に並び、最後は必ず baseline になる', () => {
    const candidates = buildVideoEncoderConfigCandidates(PARAMS);
    expect(candidates.map((c) => c.variant)).toEqual([
      'prefer-hardware-realtime',
      'no-preference-realtime',
      'prefer-hardware',
      'no-preference',
      'baseline',
    ]);
    expect(candidates[candidates.length - 1].config).toEqual(
      buildBaselineVideoEncoderConfig(PARAMS)
    );
  });

  it('先頭候補は GPU 優先 + realtime + AVCC 形式を要求する', () => {
    const [first] = buildVideoEncoderConfigCandidates(PARAMS);
    expect(first.config.hardwareAcceleration).toBe('prefer-hardware');
    expect(first.config.latencyMode).toBe('realtime');
    expect(first.config.avc).toEqual({ format: 'avc' });
  });

  // 【回帰防止・最重要】WebCodecs の latencyMode 既定値は quality。
  // quality を明示せず、対応環境では realtime を使い、非対応時だけ従来候補へ戻す。
  it('realtime 候補を先に試し、quality はどの候補にも明示しない', () => {
    const candidates = buildVideoEncoderConfigCandidates(PARAMS);
    expect(candidates.slice(0, 2).every(({ config }) => config.latencyMode === 'realtime')).toBe(
      true
    );
    expect(candidates.every(({ config }) => config.latencyMode !== 'quality')).toBe(true);
    expect(candidates.slice(2).every(({ config }) => config.latencyMode === undefined)).toBe(true);
  });

  it('解像度・ビットレートは全候補で共通に保たれる', () => {
    for (const { config } of buildVideoEncoderConfigCandidates(PARAMS)) {
      expect(config.width).toBe(1920);
      expect(config.height).toBe(1080);
      expect(config.bitrate).toBe(12_000_000);
      expect(config.framerate).toBe(30);
      expect(config.codec).toBe('avc1.4d002a');
    }
  });
});

describe('resolveVideoEncoderConfig', () => {
  it('prefer-hardware-realtime が通ればそれを採用する', async () => {
    stubVideoEncoder(async (config) => ({ supported: true, config }));

    const resolved = await resolveVideoEncoderConfig(PARAMS);
    expect(resolved.variant).toBe('prefer-hardware-realtime');
    expect(resolved.negotiated).toBe(true);
    expect(resolved.config.hardwareAcceleration).toBe('prefer-hardware');
    expect(resolved.config.latencyMode).toBe('realtime');
  });

  it('HW 指定との realtime 組み合わせが非対応なら no-preference-realtime へ落ちる', async () => {
    stubVideoEncoder(async (config) => ({
      supported: config.hardwareAcceleration !== 'prefer-hardware',
      config,
    }));

    const resolved = await resolveVideoEncoderConfig(PARAMS);
    expect(resolved.variant).toBe('no-preference-realtime');
    expect(resolved.negotiated).toBe(true);
    expect(resolved.config.latencyMode).toBe('realtime');
  });

  it('realtime 非対応でも従来の prefer-hardware 候補を維持する', async () => {
    stubVideoEncoder(async (config) => ({
      supported:
        config.hardwareAcceleration === 'prefer-hardware' && config.latencyMode === undefined,
      config,
    }));

    const resolved = await resolveVideoEncoderConfig(PARAMS);
    expect(resolved.variant).toBe('prefer-hardware');
    expect(resolved.negotiated).toBe(true);
    expect(resolved.config.latencyMode).toBeUndefined();
  });

  it('realtime が quality へ正規化された場合は realtime 成功と誤認しない', async () => {
    stubVideoEncoder(async (config) => ({
      supported: true,
      config: config.latencyMode === 'realtime' ? { ...config, latencyMode: 'quality' } : config,
    }));

    const resolved = await resolveVideoEncoderConfig(PARAMS);
    expect(resolved.variant).toBe('prefer-hardware');
    expect(resolved.negotiated).toBe(true);
    expect(resolved.config.latencyMode).toBeUndefined();
  });

  it('どれも通らなければ baseline（現行と同一）を返す', async () => {
    stubVideoEncoder(async (config) => ({ supported: false, config }));

    const resolved = await resolveVideoEncoderConfig(PARAMS);
    expect(resolved.variant).toBe('baseline');
    expect(resolved.negotiated).toBe(false);
    expect(resolved.config).toEqual(buildBaselineVideoEncoderConfig(PARAMS));
  });

  it('isConfigSupported が無い環境では baseline を返す（現行挙動を維持）', async () => {
    stubVideoEncoder(null);

    const resolved = await resolveVideoEncoderConfig(PARAMS);
    expect(resolved.variant).toBe('baseline');
    expect(resolved.negotiated).toBe(false);
    expect(resolved.config).toEqual(buildBaselineVideoEncoderConfig(PARAMS));
  });

  it('VideoEncoder 自体が未定義でも例外を投げず baseline を返す', async () => {
    delete (globalThis as unknown as { VideoEncoder?: unknown }).VideoEncoder;

    const resolved = await resolveVideoEncoderConfig(PARAMS);
    expect(resolved.variant).toBe('baseline');
    expect(resolved.negotiated).toBe(false);
  });

  it('isConfigSupported が例外を投げても落ちず baseline まで進む', async () => {
    stubVideoEncoder(async () => {
      throw new Error('not supported');
    });

    const resolved = await resolveVideoEncoderConfig(PARAMS);
    expect(resolved.variant).toBe('baseline');
    expect(resolved.negotiated).toBe(false);
    expect(resolved.config).toEqual(buildBaselineVideoEncoderConfig(PARAMS));
  });

  it('ブラウザが正規化した config を優先しつつ候補の明示値を維持する', async () => {
    const normalized: VideoEncoderConfig = {
      ...buildBaselineVideoEncoderConfig(PARAMS),
      hardwareAcceleration: 'prefer-hardware',
      codec: 'avc1.4d002a',
    };
    stubVideoEncoder(async () => ({ supported: true, config: normalized }));

    const resolved = await resolveVideoEncoderConfig(PARAMS);
    expect(resolved.config).toEqual({
      ...normalized,
      latencyMode: 'realtime',
      avc: { format: 'avc' },
    });
  });

  it('ブラウザ正規化で省略された realtime を候補から維持する', async () => {
    const normalized: VideoEncoderConfig = {
      ...buildBaselineVideoEncoderConfig(PARAMS),
      hardwareAcceleration: 'prefer-hardware',
      codec: 'avc1.4d002a',
    };
    stubVideoEncoder(async () => ({ supported: true, config: normalized }));

    const resolved = await resolveVideoEncoderConfig(PARAMS);
    expect(resolved.variant).toBe('prefer-hardware-realtime');
    expect(resolved.config.latencyMode).toBe('realtime');
  });
});
