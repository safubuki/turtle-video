import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v6.0.3 の現在バージョンと v5.3.0 以降の変更概要を持つ', () => {
    expect(versionData.version).toBe('6.0.3');
    expect(versionData.history.previousVersion).toBe('5.3.0');
    expect(versionData.history.summary).toContain('キャプション');
    expect(versionData.history.highlights).toHaveLength(10);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'キャプションの大幅強化' }),
        expect.objectContaining({ title: '映像表現の追加' }),
        expect.objectContaining({ title: 'ウォーターマーク／エンドロールロゴ' }),
        expect.objectContaining({ title: 'ナレーション波形と無音区間ナビ' }),
        expect.objectContaining({ title: '書き出しの品質・向き設定と GPU 処理' }),
        expect.objectContaining({ title: 'Bug Fix' }),
        expect.objectContaining({ title: 'エクスポートの連続実行安定化' }),
        expect.objectContaining({ title: 'トランジション編集時のプレビュー安定化' }),
        expect.objectContaining({ title: 'クリップ操作・ミュート・書き出し表示の改善' }),
        expect.objectContaining({ title: 'プレビュー・色選択・AI音声・書き出しの改善' }),
      ]),
    );
  });
});
