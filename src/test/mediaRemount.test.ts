import { describe, expect, it, vi } from 'vitest';
import { releaseSharedMediaElementsForRemount } from '../components/turtle-video/mediaRemount';

describe('releaseSharedMediaElementsForRemount', () => {
  it('古い video/audio を停止し、新しい ref 待機用の空 registry を返す', () => {
    const videoPause = vi.fn();
    const audioPause = vi.fn();
    const result = releaseSharedMediaElementsForRemount({
      video: { tagName: 'VIDEO', pause: videoPause } as unknown as HTMLVideoElement,
      audio: { tagName: 'AUDIO', pause: audioPause } as unknown as HTMLAudioElement,
      image: { tagName: 'IMG' } as unknown as HTMLImageElement,
    });

    expect(videoPause).toHaveBeenCalledOnce();
    expect(audioPause).toHaveBeenCalledOnce();
    expect(result.previousElementCount).toBe(3);
    expect(result.pausedMediaCount).toBe(2);
    expect(result.nextElements).toEqual({});
  });

  it('古い要素の pause が失敗しても registry を解放する', () => {
    const result = releaseSharedMediaElementsForRemount({
      video: {
        tagName: 'VIDEO',
        pause: vi.fn(() => {
          throw new Error('already detached');
        }),
      } as unknown as HTMLVideoElement,
    });

    expect(result.previousElementCount).toBe(1);
    expect(result.pausedMediaCount).toBe(0);
    expect(result.nextElements).toEqual({});
  });
});
