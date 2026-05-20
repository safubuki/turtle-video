import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.9 の現在バージョンとプレビュー固まり修正の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.9');
    expect(versionData.history.previousVersion).toBe('5.1.8');
    expect(versionData.history.summary).toContain('プレビュー');
    expect(versionData.history.highlights).toHaveLength(3);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'プレビュー画面へ戻った直後に動画が固まる退行を修正' }),
        expect.objectContaining({ title: 'バックグラウンド復帰後の音声不調を抑制' }),
        expect.objectContaining({ title: '退行を抑える回帰テストを追加' }),
      ])
    );
  });
});
