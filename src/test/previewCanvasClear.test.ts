/**
 * プレビュー Canvas の黒クリア判定。
 *
 * 「背面には常に黒。前クリップの映像を残さない」という仕様と、
 * 既存のブラックアウト・黒点滅対策（hold 系の抑止）が両立することを固定する。
 */
import { describe, expect, it } from 'vitest';
import {
  shouldClearPreviewCanvas,
  type PreviewCanvasClearInput,
} from '../utils/previewCanvasClear';

const base: PreviewCanvasClearInput = {
  suppressAndroidPreviewClear: false,
  suppressPostExportHoldClear: false,
  forceStartClear: false,
  blackoutFadeTail: false,
  holdFrame: false,
  holdAtTimelineEnd: false,
  guardNearEnd: false,
  guardAfterFinalize: false,
  hasActiveItem: true,
};

describe('shouldClearPreviewCanvas', () => {
  it('通常フレームはクリアする', () => {
    expect(shouldClearPreviewCanvas(base)).toBe(true);
  });

  // === 本修正の対象 ===
  it('終端付近で停止中でも、描画対象があればクリアする（ずらした背面に前フレームを残さない）', () => {
    expect(
      shouldClearPreviewCanvas({ ...base, guardNearEnd: true }),
    ).toBe(true);
  });

  it('ファイナライズ直後で停止中でも、描画対象があればクリアする', () => {
    expect(
      shouldClearPreviewCanvas({ ...base, guardAfterFinalize: true }),
    ).toBe(true);
  });

  it('終端ガードが同時に立っていても、描画対象があればクリアする', () => {
    expect(
      shouldClearPreviewCanvas({
        ...base,
        guardNearEnd: true,
        guardAfterFinalize: true,
      }),
    ).toBe(true);
  });

  // === 既存対策の維持（デグレ防止） ===
  it('Android プレビューの hold 中はクリアしない（前フレーム保持）', () => {
    expect(
      shouldClearPreviewCanvas({
        ...base,
        suppressAndroidPreviewClear: true,
      }),
    ).toBe(false);
  });

  it('export 直後の hold 中はクリアしない（黒点滅防止）', () => {
    expect(
      shouldClearPreviewCanvas({
        ...base,
        suppressPostExportHoldClear: true,
      }),
    ).toBe(false);
  });

  it('holdFrame 中はクリアしない（デコード不能時の前フレーム保持）', () => {
    expect(shouldClearPreviewCanvas({ ...base, holdFrame: true })).toBe(false);
  });

  it('描画対象が無い終端フレームは従来どおり保持する', () => {
    expect(
      shouldClearPreviewCanvas({
        ...base,
        hasActiveItem: false,
        holdAtTimelineEnd: true,
      }),
    ).toBe(false);
  });

  it('描画対象が無く終端ガード中も従来どおり保持する', () => {
    expect(
      shouldClearPreviewCanvas({
        ...base,
        hasActiveItem: false,
        guardNearEnd: true,
      }),
    ).toBe(false);
  });

  it('holdAtTimelineEnd は描画対象があってもクリアしない（終端保持を優先）', () => {
    expect(
      shouldClearPreviewCanvas({ ...base, holdAtTimelineEnd: true }),
    ).toBe(false);
  });

  // === 最優先ルール ===
  it('先頭付近の強制クリアは hold より優先してクリアする', () => {
    expect(
      shouldClearPreviewCanvas({
        ...base,
        forceStartClear: true,
        holdFrame: true,
        guardNearEnd: true,
      }),
    ).toBe(true);
  });

  it('fade tail の黒落としは holdFrame より優先してクリアする', () => {
    expect(
      shouldClearPreviewCanvas({
        ...base,
        blackoutFadeTail: true,
        holdFrame: true,
      }),
    ).toBe(true);
  });

  it('Android hold の抑止は forceStartClear より優先する（既存の順序を維持）', () => {
    expect(
      shouldClearPreviewCanvas({
        ...base,
        suppressAndroidPreviewClear: true,
        forceStartClear: true,
      }),
    ).toBe(false);
  });
});
