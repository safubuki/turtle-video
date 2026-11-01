/**
 * @file exportMediaTrace.test.ts
 * @description 書き出し中の共有 video の診断トレース（ログモード「詳細」限定）の契約テスト
 */
import { describe, expect, it, vi } from 'vitest';
import {
  attachExportMediaTrace,
  EXPORT_MEDIA_TRACE_SEEK_STACK_MIN_SEC,
  summarizeCallerStack,
} from '../utils/exportMediaTrace';

function setup(maxEntries?: number) {
  const element = document.createElement('video');
  const log = vi.fn<(message: string, details: Record<string, unknown>) => void>();
  let timelineSec = 19.27;
  const detach = attachExportMediaTrace({
    elements: [{ id: 'clip-3', element }],
    getTimelineSec: () => timelineSec,
    log,
    maxEntries,
  });
  return { element, log, detach, setTimeline: (sec: number) => { timelineSec = sec; } };
}

describe('attachExportMediaTrace', () => {
  it('メディアイベントをタイムライン時刻・要素 ID 付きで記録する', () => {
    const { element, log } = setup();
    element.dispatchEvent(new Event('seeking'));
    expect(log).toHaveBeenCalledWith(
      'export.media.seeking@19270',
      expect.objectContaining({ timelineMs: 19270, videoId: 'clip-3' }),
    );
  });

  it('大きな再生位置の書き換えは呼び出し元付きで記録し、値はそのまま反映する', () => {
    const { element, log } = setup();
    const before = element.currentTime;
    element.currentTime = before + EXPORT_MEDIA_TRACE_SEEK_STACK_MIN_SEC + 1;
    const seekCall = log.mock.calls.find(([message]) => message.startsWith('export.media.seekCall@'));
    expect(seekCall?.[1]).toMatchObject({ videoId: 'clip-3', from: before });
    expect(Array.isArray(seekCall?.[1].caller)).toBe(true);
  });

  it('小さな書き換えは呼び出し元を記録しない', () => {
    const { element, log } = setup();
    element.currentTime = element.currentTime + 0.01;
    expect(log.mock.calls.some(([message]) => message.startsWith('export.media.seekCall@'))).toBe(false);
  });

  it('記録件数に上限がある', () => {
    const { element, log } = setup(2);
    for (let i = 0; i < 5; i++) element.dispatchEvent(new Event('pause'));
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('解除すると記録をやめ、要素へ加えた currentTime の定義も消す', () => {
    const { element, log, detach } = setup();
    expect(Object.prototype.hasOwnProperty.call(element, 'currentTime')).toBe(true);
    detach();
    expect(Object.prototype.hasOwnProperty.call(element, 'currentTime')).toBe(false);
    element.dispatchEvent(new Event('seeking'));
    expect(log).not.toHaveBeenCalled();
  });
});

describe('summarizeCallerStack', () => {
  it('Error 行とトレース自身の行を除いて数行に絞る', () => {
    const stack = [
      'Error',
      '    at set (exportMediaTrace.ts:90:20)',
      '    at renderFrame (usePreviewEngine.ts:3000:10)',
      '    at loop (usePreviewEngine.ts:5000:5)',
    ].join('\n');
    expect(summarizeCallerStack(stack)).toEqual([
      'at renderFrame (usePreviewEngine.ts:3000:10)',
      'at loop (usePreviewEngine.ts:5000:5)',
    ]);
    expect(summarizeCallerStack(undefined)).toEqual([]);
  });
});
