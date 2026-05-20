import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.3 の現在バージョンと Android プレビュー fade 修正の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.3');
    expect(versionData.history.previousVersion).toBe('5.1.2');
    expect(versionData.history.summary).toContain('fade');
    expect(versionData.history.highlights).toHaveLength(3);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Android プレビュー fade 退行を修正' }),
        expect.objectContaining({ title: 'エクスポートとプレビューの fade 挙動を完全一致' }),
        expect.objectContaining({ title: 'Android クリップ境界の安定化は維持' }),
      ])
    );
  });
});
