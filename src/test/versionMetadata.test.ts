import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.4 の現在バージョンと画像 fade 修正の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.4');
    expect(versionData.history.previousVersion).toBe('5.1.3');
    expect(versionData.history.summary).toContain('フェード');
    expect(versionData.history.highlights).toHaveLength(3);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: '画像クリップのフェードも canvas クリアを通すよう修正' }),
        expect.objectContaining({ title: 'Android プレビューの fade 退行を完全修復' }),
        expect.objectContaining({ title: 'エクスポートとプレビューの fade 挙動完全一致を担保' }),
      ])
    );
  });
});
