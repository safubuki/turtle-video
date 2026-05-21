import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.10 の現在バージョンとメディア・ログ周りの堅牢性改善の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.10');
    expect(versionData.history.previousVersion).toBe('5.1.9');
    expect(versionData.history.summary).toContain('BGM');
    expect(versionData.history.highlights).toHaveLength(5);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'BGM 読み込み失敗時のエラー通知と blob URL リーク防止' }),
        expect.objectContaining({ title: 'ナレーション読み込みのタイムアウト保険を追加' }),
        expect.objectContaining({ title: 'AI ナレーション再構築時の不正な duration を排除' }),
        expect.objectContaining({ title: '設定モーダルのコピー後タイマーをアンマウント時にクリア' }),
        expect.objectContaining({ title: 'sessionStorage 容量逼迫時にログを完全に失わないように改善' }),
      ])
    );
  });
});
