import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.11 の現在バージョンと iOS Safari 動画境界の黒画面修正の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.11');
    expect(versionData.history.previousVersion).toBe('5.1.10');
    expect(versionData.history.summary).toContain('iPhone');
    expect(versionData.history.summary).toContain('iOS Safari');
    expect(versionData.history.highlights).toHaveLength(3);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'iOS Safari の動画→動画境界で 2 本目以降が黒画面のまま固まる退行を修正',
        }),
        expect.objectContaining({
          title: 'iOS Safari の画像→動画境界でも同じ取りこぼしを救済',
        }),
        expect.objectContaining({
          title: 'Android/PC プレビューには影響しない iOS Safari 専用修正',
        }),
      ])
    );
  });
});
