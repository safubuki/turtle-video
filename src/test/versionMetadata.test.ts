import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.8 の現在バージョンとキャプションサイズ再調整の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.8');
    expect(versionData.history.previousVersion).toBe('5.1.7');
    expect(versionData.history.summary).toContain('キャプション');
    expect(versionData.history.highlights).toHaveLength(3);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'キャプションサイズを 7.41% 中心の自然なスケールへ再調整' }),
        expect.objectContaining({ title: '~1.4 倍ずつ拡大する自然なサイズカーブ' }),
        expect.objectContaining({ title: '解像度に依存しない視覚比率は維持' }),
      ])
    );
  });
});
