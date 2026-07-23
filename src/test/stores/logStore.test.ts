import { beforeEach, describe, expect, it } from 'vitest';
import { getLogRecordingMode, useLogStore } from '../../stores/logStore';

describe('logStore recording mode', () => {
  beforeEach(() => {
    globalThis.localStorage?.removeItem('preview.log.mode');
    useLogStore.getState().clearLogs();
  });

  it('標準モードではDEBUGを保存しない', () => {
    expect(getLogRecordingMode()).toBe('smooth');
    useLogStore.getState().debug('MEDIA', '動画トリム診断', { id: 'video-1' });
    expect(useLogStore.getState().entries).toHaveLength(0);
  });

  it('境界診断モードでも一般DEBUGを保存しない', () => {
    globalThis.localStorage?.setItem('preview.log.mode', 'boundary');
    useLogStore.getState().debug('AUDIO', 'BGM自動追従診断');
    expect(useLogStore.getState().entries).toHaveLength(0);
  });

  it('詳細モードではDEBUGを保存する', () => {
    globalThis.localStorage?.setItem('preview.log.mode', 'detailed');
    useLogStore.getState().debug('AUDIO', 'BGM自動追従診断', { totalDuration: 6 });

    expect(useLogStore.getState().entries).toHaveLength(1);
    expect(useLogStore.getState().entries[0]).toMatchObject({
      level: 'DEBUG',
      category: 'AUDIO',
      message: 'BGM自動追従診断',
    });
  });

  it('標準モードでも警告とエラーは保持する', () => {
    useLogStore.getState().warn('SYSTEM', '警告');
    useLogStore.getState().error('SYSTEM', 'エラー');
    expect(useLogStore.getState().entries.map((entry) => entry.level)).toEqual(['WARN', 'ERROR']);
  });
});
