import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.12 の現在バージョンと iOS Safari 境界キック currentTime 上書き修正の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.12');
    expect(versionData.history.previousVersion).toBe('5.1.11');
    expect(versionData.history.summary).toContain('iOS Safari');
    expect(versionData.history.summary).toContain('currentTime');
    expect(versionData.history.highlights).toHaveLength(3);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'iOS Safari 境界キックで currentTime を触らないように修正 (映像が固まり音だけ流れる退行を回避)',
        }),
        expect.objectContaining({
          title: '境界キックを paused 状態の video に限定 (prewarm 済みの再生中動画への干渉を排除)',
        }),
        expect.objectContaining({
          title: 'Android/PC プレビューには変更なし (apple-safari flavor 内でのみ完結)',
        }),
      ])
    );
  });
});
