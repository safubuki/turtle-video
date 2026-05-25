import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.18 の現在バージョンと iOS Safari export 完了の多層防御の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.18');
    expect(versionData.history.previousVersion).toBe('5.1.17');
    expect(versionData.history.summary).toContain('iPhone Safari');
    expect(versionData.history.summary).toContain('monkey-patch');
    expect(versionData.history.summary).toContain('watchdog');
    expect(versionData.history.highlights).toHaveLength(4);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'recorder.stop() を monkey-patch して必ず watchdog を arm (呼び出し元を問わず取りこぼしゼロ)',
        }),
        expect.objectContaining({
          title: 'Watchdog タイムアウトを 8 秒 → 3 秒へ短縮 (素早い UI 復帰)',
        }),
        expect.objectContaining({
          title: 'preview engine 側にも 30 秒の最終フェイルセーフ guard を追加 (どんな経路の失敗でも UI が必ず復帰する)',
        }),
        expect.objectContaining({
          title: 'プレビューには変更なし (v5.1.14 で安定した動作を維持)',
        }),
      ])
    );
  });
});
