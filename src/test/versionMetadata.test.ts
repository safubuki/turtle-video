import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.17 の現在バージョンと iOS Safari MediaRecorder onstop watchdog の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.17');
    expect(versionData.history.previousVersion).toBe('5.1.16');
    expect(versionData.history.summary).toContain('iPhone Safari');
    expect(versionData.history.summary).toContain('watchdog');
    expect(versionData.history.summary).toContain('onstop');
    expect(versionData.history.highlights).toHaveLength(4);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'iOS Safari MediaRecorder の onstop 不発に対する watchdog を追加 (UI が「保存ファイルを作成中」のまま固まる退行を救出)',
        }),
        expect.objectContaining({
          title: 'MediaRecorder 戦略のエラー経路を Promise reject から callbacks.onRecordingError へ統一',
        }),
        expect.objectContaining({
          title: 'apple-safari startEngine の startWebCodecsExport 呼び出しに .catch() を追加',
        }),
        expect.objectContaining({
          title: 'プレビューには変更なし (v5.1.14 で安定した動作を維持)',
        }),
      ])
    );
  });
});
