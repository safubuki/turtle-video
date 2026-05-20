import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.2 の現在バージョンとフェード修正の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.2');
    expect(versionData.history.previousVersion).toBe('5.1.1');
    expect(versionData.history.summary).toContain('フェード');
    expect(versionData.history.highlights).toHaveLength(3);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'タイムライン末尾のフェードアウト退行を修正' }),
        expect.objectContaining({ title: '短いクリップのフェードインを修正' }),
        expect.objectContaining({ title: 'プレビューのフェード描画パスを統一' }),
      ])
    );
  });
});
