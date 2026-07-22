/**
 * @file captionIndividualSettings.ts
 * @description キャプション1件に属する個別設定の判定と一括クリア契約。
 * バッジ判定とクリア対象がずれないよう、ここを単一ソースにする。
 */
import type { Caption } from '../types';

export function hasCaptionIndividualSettings(caption: Caption): boolean {
  return Boolean(
    caption.overridePosition
    || caption.overrideFontStyle
    || caption.overrideFontSize
    || caption.overrideFontColor != null
    || caption.overrideStrokeColor != null
    || caption.overrideStrokeWidth != null
    || caption.overrideBlur != null
    || caption.overrideFadeIn
    || caption.overrideFadeOut
    || caption.overrideFadeInDuration != null
    || caption.overrideFadeOutDuration != null
    || caption.overrideFontSizeCustom != null
    || caption.overridePositionCustom
    || caption.sequentialFadeMode
    || caption.sequentialGapSec != null
  );
}

/** 本文と表示区間を触らず、対象カードの個別設定だけを初期状態へ戻す。 */
export function createClearedCaptionIndividualSettings(): Partial<Omit<Caption, 'id'>> {
  return {
    overridePosition: undefined,
    overrideFontStyle: undefined,
    overrideFontSize: undefined,
    overrideFontColor: undefined,
    overrideStrokeColor: undefined,
    overrideStrokeWidth: undefined,
    overrideBlur: undefined,
    overrideFadeIn: undefined,
    overrideFadeOut: undefined,
    overrideFadeInDuration: undefined,
    overrideFadeOutDuration: undefined,
    overrideFontSizeCustom: undefined,
    overridePositionCustom: undefined,
    sequentialFadeMode: undefined,
    sequentialGapSec: undefined,
  };
}
