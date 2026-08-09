import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v6.0.0 の現在バージョンとキャプション強化・映像表現追加の変更概要を持つ', () => {
    expect(versionData.version).toBe('6.0.0');
    expect(versionData.history.previousVersion).toBe('5.3.0');
    expect(versionData.history.summary).toContain('キャプション');
    expect(versionData.history.highlights).toHaveLength(6);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'キャプションの大幅強化' }),
        expect.objectContaining({ title: '映像表現の追加' }),
        expect.objectContaining({ title: 'ウォーターマーク／エンドロールロゴ' }),
        expect.objectContaining({ title: 'ナレーション波形と無音区間ナビ' }),
        expect.objectContaining({ title: '書き出しの品質・向き設定と GPU 処理' }),
        expect.objectContaining({ title: 'Bug Fix' }),
      ]),
    );
  });
});
