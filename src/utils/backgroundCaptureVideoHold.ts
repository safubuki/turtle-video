/**
 * @file backgroundCaptureVideoHold.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 自動ポスター／タイトルミニビューの背景撮影が、プレビューと共有の video を
 * 撮影時刻へ動かしている間だけ立てる印。
 *
 * 撮影中は共有 video が表示位置とは別の時刻（先頭付近）を指すため、seeked などを契機に
 * 本プレビューやカードのミニビューが描き直すと、表示位置に撮影時刻の絵が一瞬出る。
 * 描画側はこの印を見て、撮影が video を戻すまで直前の絵を保つ。
 */

const holdCounts = new Map<HTMLVideoElement, number>();

/** 撮影が video を動かす前に呼ぶ。同じ要素を複数の撮影が使っても数で管理する。 */
export function holdVideoForBackgroundCapture(video: HTMLVideoElement): void {
  holdCounts.set(video, (holdCounts.get(video) ?? 0) + 1);
}

/** 撮影が video を表示位置へ戻すとき（または中断時）に、hold と同じ回数だけ呼ぶ。 */
export function releaseVideoFromBackgroundCapture(video: HTMLVideoElement): void {
  const count = holdCounts.get(video) ?? 0;
  if (count <= 1) {
    holdCounts.delete(video);
    return;
  }
  holdCounts.set(video, count - 1);
}

export function isVideoHeldByBackgroundCapture(video: unknown): boolean {
  return video instanceof HTMLVideoElement && holdCounts.has(video);
}
