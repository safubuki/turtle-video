import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.13 の現在バージョンと iOS Safari 単独動画 WebAudio 経路強制の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.13');
    expect(versionData.history.previousVersion).toBe('5.1.12');
    expect(versionData.history.summary).toContain('iOS Safari');
    expect(versionData.history.summary).toContain('WebAudio');
    expect(versionData.history.highlights).toHaveLength(3);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'iOS Safari 単独動画でも音声が鳴るように修正 (WebAudio 経路の強制)',
        }),
        expect.objectContaining({
          title: '1 本目 / 2 本目の動画とも音声が出力される (BGM 無しシナリオ)',
        }),
        expect.objectContaining({
          title: 'Android/PC プレビューには変更なし (apple-safari flavor 内でのみ完結)',
        }),
      ])
    );
  });
});
