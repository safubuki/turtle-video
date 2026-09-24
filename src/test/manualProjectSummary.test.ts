import { describe, expect, it } from 'vitest';
import { toManualProjectSummary, type ProjectData } from '../utils/indexedDB';

describe('旧手動保存の表示情報', () => {
  it('①の識別子、トランジションとエンドロールを含む長さ、既存ポスターを補完する', () => {
    const legacy = {
      slot: 'manual',
      savedAt: '2026-01-01T00:00:00.000Z',
      mediaItems: [
        { duration: 5, transitionToNext: { type: 'dissolve', duration: 1 } },
        { duration: 8 },
      ],
      endrollOverlay: { enabled: true, durationSec: 3 },
      projectPosterDataUrl: 'data:image/jpeg;base64,poster',
    } as ProjectData & { slot: 'manual' };

    expect(toManualProjectSummary(legacy)).toEqual({
      slot: 'manual',
      projectId: 'legacy-manual',
      title: '',
      savedAt: '2026-01-01T00:00:00.000Z',
      durationSec: 15,
      thumbnailDataUrl: 'data:image/jpeg;base64,poster',
    });
  });
});
