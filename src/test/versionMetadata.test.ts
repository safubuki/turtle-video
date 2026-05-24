import { describe, expect, it } from 'vitest';
import versionData from '../../version.json';

describe('version metadata', () => {
  it('v5.1.16 の現在バージョンと iOS Safari export 自然完了経路修正の変更概要を持つ', () => {
    expect(versionData.version).toBe('5.1.16');
    expect(versionData.history.previousVersion).toBe('5.1.15');
    expect(versionData.history.summary).toContain('iPhone');
    expect(versionData.history.summary).toContain('completeWebCodecsExport');
    expect(versionData.history.summary).toContain('onRecordingStop');
    expect(versionData.history.highlights).toHaveLength(4);
    expect(versionData.history.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'export 自然完了経路を loop() に集約し WebCodecs/MediaRecorder ごとに正しい完了 API を呼ぶよう修正',
        }),
        expect.objectContaining({
          title: 'apple-safari preview engine に completeWebCodecsExport パラメータを追加 (standard と同じ完了 API を受け取れるように)',
        }),
        expect.objectContaining({
          title: 'stopAll() は中断要求の責務に専念 (MediaRecorder 完了は loop() に委譲)',
        }),
        expect.objectContaining({
          title: 'プレビューには変更なし (v5.1.14 で安定した動作を維持)',
        }),
      ])
    );
  });
});
