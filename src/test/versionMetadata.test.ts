import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.15 の現在バージョンと iOS Safari エクスポート完了 + UI 文言整備の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.15');
    expect(versionData.history.previousVersion).toBe('5.1.14');
    expect(versionData.history.summary).toContain('iPhone');
    expect(versionData.history.summary).toContain('ダウンロードボタン');
    expect(versionData.history.summary).toContain('動作モード');
    expect(versionData.history.highlights).toHaveLength(4);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'iOS Safari の export 100% 後にダウンロードボタンへ切り替わるよう修正',
        }),
        expect.objectContaining({
          title: 'Apple Safari の UI 文言を「検証モード」から「動作モード」へ変更',
        }),
        expect.objectContaining({
          title: '「ダウンロード導線」を「ダウンロード手順」に修正 (日本語の自然化)',
        }),
        expect.objectContaining({
          title: 'プレビューには変更なし (v5.1.14 で安定した動作を維持)',
        }),
      ])
    );
  });
});
