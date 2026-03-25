import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.0.0 の現在バージョンと代表的な変更概要を持つ', () => {
    expect(versionData.version).toBe('5.0.0');
    expect(versionData.history.previousVersion).toBe('4.1.0');
    expect(versionData.history.summary).toContain('iOS Safari');
    expect(versionData.history.highlights).toHaveLength(4);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'iOS Safari対応を大幅強化' }),
        expect.objectContaining({ title: '更新チェック機能とオフラインモードを追加' }),
      ])
    );
  });
});
