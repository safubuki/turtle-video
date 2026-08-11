export type SharedMediaElementRegistry = Record<
  string,
  HTMLVideoElement | HTMLImageElement | HTMLAudioElement
>;

/**
 * DOM remount 前に古い media registry を切り離す。
 *
 * React が新しい要素を ref へ登録する前に待機処理が古い readyState を見て
 * 「remount 完了」と誤判定しないよう、必ず空の registry へ差し替える。
 */
export function releaseSharedMediaElementsForRemount(elements: SharedMediaElementRegistry): {
  nextElements: SharedMediaElementRegistry;
  previousElementCount: number;
  pausedMediaCount: number;
} {
  let pausedMediaCount = 0;

  Object.values(elements).forEach((element) => {
    if (element.tagName !== 'VIDEO' && element.tagName !== 'AUDIO') return;
    try {
      (element as HTMLMediaElement).pause();
      pausedMediaCount += 1;
    } catch {
      /* 古い要素の停止失敗は remount を妨げない */
    }
  });

  return {
    nextElements: {},
    previousElementCount: Object.keys(elements).length,
    pausedMediaCount,
  };
}
