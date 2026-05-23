import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.14 の現在バージョンと iOS Safari silent prewarm 完全廃止の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.14');
    expect(versionData.history.previousVersion).toBe('5.1.13');
    expect(versionData.history.summary).toContain('iOS Safari');
    expect(versionData.history.summary).toContain('silent prewarm');
    expect(versionData.history.highlights).toHaveLength(3);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'iOS Safari の silent prewarm を完全廃止 (映像が 1 フレーム目で固まる退行を解消)',
        }),
        expect.objectContaining({
          title: '境界での短い音声ギャップは stutter 許容前提として受け入れる',
        }),
        expect.objectContaining({
          title: 'Android/PC プレビューには変更なし (apple-safari flavor 内でのみ完結)',
        }),
      ])
    );
  });
});
