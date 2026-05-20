import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.5 の現在バージョンとキャプションスケール統一の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.5');
    expect(versionData.history.previousVersion).toBe('5.1.4');
    expect(versionData.history.summary).toContain('キャプション');
    expect(versionData.history.highlights).toHaveLength(3);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'キャプションサイズをプレビューでも適切なサイズに調整' }),
        expect.objectContaining({ title: 'キャプション位置をエクスポートと一致するよう下方向へ調整' }),
        expect.objectContaining({ title: 'stroke / blur もスケール対応' }),
      ])
    );
  });
});
