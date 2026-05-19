import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.1 の現在バージョンとフェード修正の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.1');
    expect(versionData.history.previousVersion).toBe('5.1.0');
    expect(versionData.history.summary).toContain('フェード');
    expect(versionData.history.highlights).toHaveLength(3);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'プレビューのフェードイン/フェードアウトを修正' }),
        expect.objectContaining({ title: 'フェード時間のクリップ長クランプを追加' }),
        expect.objectContaining({ title: 'キャプションのフェード輪郭残りを解消' }),
      ])
    );
  });
});
