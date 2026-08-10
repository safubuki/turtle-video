/**
 * @file previewCanvasClear.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description プレビュー Canvas を黒クリアするかどうかの判定を 1 か所へ集約する。
 *
 * 背景（不具合）:
 * タイムライン終端付近で停止したまま、クリップの位置・拡大などを編集すると
 * 「ずらして空いた領域に前フレームの映像が残る」状態になっていた。
 * 終端ガード（`guardNearEnd` / `guardAfterFinalize`）が黒クリアを止めるため、
 * 直前のフレームが canvas に残り、その上へ移動後のクリップが重ね描きされていた。
 *
 * 終端ガードの本来の目的は「**描くものが無い**フレームで黒を出して点滅させない」ことであり、
 * 描画対象のクリップがあるフレームまで止める必要はない。
 * そこで、描画対象があり前フレーム保持（holdFrame）も不要な場合は、
 * 終端ガードより黒クリアを優先する。
 *
 * 仕様（背面には常に黒。動画・画像を残さない）:
 * - `holdFrame` 中はクリアしない（デコード不能時に前フレームを保持する既存対策を維持）
 * - 先頭付近の強制クリア・fade tail の黒落としは従来どおり最優先
 * - 描画対象クリップがあるなら終端ガードでクリアを止めない（本修正）
 * - 描画対象が無い（クリップ外・終端）フレームでは従来どおりガードを尊重する
 */

export interface PreviewCanvasClearInput {
  /** Android プレビューの hold 中はクリアを抑止する（既存対策） */
  suppressAndroidPreviewClear: boolean;
  /** export 直後の hold 中はクリアを抑止する（既存対策・黒点滅防止） */
  suppressPostExportHoldClear: boolean;
  /** 先頭付近で強制的に黒へ戻す */
  forceStartClear: boolean;
  /** fadeOut 末尾の黒落とし */
  blackoutFadeTail: boolean;
  /** デコード不能などで前フレームを保持したい */
  holdFrame: boolean;
  /** タイムライン終端で保持する（active が無い） */
  holdAtTimelineEnd: boolean;
  /** 終端 0.1 秒以内で停止中 */
  guardNearEnd: boolean;
  /** 終端ファイナライズ直後で停止中 */
  guardAfterFinalize: boolean;
  /**
   * このフレームに描画対象のクリップがあるか（activeIndex !== -1）。
   * true なら終端ガードよりクリアを優先し、前フレームの残像を残さない。
   */
  hasActiveItem: boolean;
}

/**
 * プレビュー Canvas を黒クリアすべきかを判定する。
 *
 * @returns true なら `fillRect` で全面を黒にしてから描画する
 */
export function shouldClearPreviewCanvas(input: PreviewCanvasClearInput): boolean {
  const {
    suppressAndroidPreviewClear,
    suppressPostExportHoldClear,
    forceStartClear,
    blackoutFadeTail,
    holdFrame,
    holdAtTimelineEnd,
    guardNearEnd,
    guardAfterFinalize,
    hasActiveItem,
  } = input;

  // hold 系の抑止は最優先（前フレーム保持が目的なのでクリアしてはいけない）
  if (suppressAndroidPreviewClear || suppressPostExportHoldClear) {
    return false;
  }

  // 先頭付近の強制クリアと fade tail の黒落としは従来どおり無条件に通す
  if (forceStartClear || blackoutFadeTail) {
    return true;
  }

  // 前フレーム保持中はクリアしない
  if (holdFrame) {
    return false;
  }

  // 描画対象があるなら、終端ガードで止めずに必ず黒からやり直す。
  // これが無いと、終端で停止したまま位置・拡大を変えたときに
  // ずらした背面へ前フレームの映像が残る。
  if (hasActiveItem && !holdAtTimelineEnd) {
    return true;
  }

  return !holdAtTimelineEnd && !guardNearEnd && !guardAfterFinalize;
}
