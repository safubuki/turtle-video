import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.6 の現在バージョンとキャプションサイズ調整の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.6');
    expect(versionData.history.previousVersion).toBe('5.1.5');
    expect(versionData.history.summary).toContain('キャプション');
    expect(versionData.history.highlights).toHaveLength(3);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'キャプションサイズを控えめに大きく調整' }),
        expect.objectContaining({ title: '解像度に依存しない視覚比率を維持' }),
        expect.objectContaining({ title: 'ユーザー設定 (small/medium/large/xlarge) は同じ並びを維持' }),
      ])
    );
  });
});
