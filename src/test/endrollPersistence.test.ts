/**
 * @file endrollPersistence.test.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description エンドロールの保存・復元テスト。
 * ウォーターマークと設定・画像が混ざらないこと、旧データが既定値へ落ちることを固定する。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useOverlayStore } from '../stores/overlayStore';
import { DEFAULT_ENDROLL_OVERLAY } from '../utils/endrollOverlay';
import { DEFAULT_WATERMARK_OVERLAY } from '../utils/watermarkOverlay';

const resetStore = () => {
  useOverlayStore.setState({
    watermark: { ...DEFAULT_WATERMARK_OVERLAY },
    endroll: { ...DEFAULT_ENDROLL_OVERLAY },
  });
};

describe('overlayStore endroll state', () => {
  beforeEach(resetStore);

  it('starts disabled so the timeline is unchanged for new projects', () => {
    const { endroll } = useOverlayStore.getState();
    expect(endroll.enabled).toBe(false);
    expect(endroll.file).toBeNull();
    expect(endroll.durationSec).toBe(5);
    expect(endroll.backgroundMode).toBe('black');
  });

  it('updates endroll settings without touching the watermark', () => {
    useOverlayStore.getState().updateWatermark({ size: 2, positionX: 10 });
    useOverlayStore.getState().updateEndroll({ size: 0.5, positionX: 90, durationSec: 8 });

    const { watermark, endroll } = useOverlayStore.getState();
    expect(watermark.size).toBe(2);
    expect(watermark.positionX).toBe(10);
    expect(endroll.size).toBe(0.5);
    expect(endroll.positionX).toBe(90);
    expect(endroll.durationSec).toBe(8);
  });

  it('updates the watermark without touching the endroll', () => {
    useOverlayStore.getState().updateEndroll({ opacity: 0.4, backgroundMode: 'white' });
    useOverlayStore.getState().updateWatermark({ opacity: 0.9 });

    const { watermark, endroll } = useOverlayStore.getState();
    expect(watermark.opacity).toBe(0.9);
    expect(endroll.opacity).toBe(0.4);
    expect(endroll.backgroundMode).toBe('white');
  });

  it('clamps invalid endroll updates through normalization', () => {
    useOverlayStore.getState().updateEndroll({ durationSec: 9999, size: -3 });
    const { endroll } = useOverlayStore.getState();
    expect(endroll.durationSec).toBe(30);
    expect(endroll.size).toBe(0.1);
  });

  it('disables the endroll when its image is removed (timeline must not grow)', () => {
    useOverlayStore.setState((state) => ({
      endroll: { ...state.endroll, enabled: true, url: 'blob:logo', durationSec: 6 },
    }));

    useOverlayStore.getState().removeEndrollImage();

    const { endroll } = useOverlayStore.getState();
    expect(endroll.url).toBeNull();
    expect(endroll.file).toBeNull();
    expect(endroll.enabled).toBe(false);
    // 設定値は残す（選び直したときに元の調整が生きる）
    expect(endroll.durationSec).toBe(6);
  });
});

describe('overlayStore restoreFromSave', () => {
  beforeEach(resetStore);

  it('restores watermark and endroll independently', () => {
    useOverlayStore.getState().restoreFromSave(
      { enabled: true, positionX: 20, size: 1.5 },
      { enabled: true, durationSec: 9, backgroundMode: 'custom', backgroundColor: '#123456' },
    );

    const { watermark, endroll } = useOverlayStore.getState();
    expect(watermark.positionX).toBe(20);
    expect(watermark.size).toBe(1.5);
    expect(endroll.durationSec).toBe(9);
    expect(endroll.backgroundMode).toBe('custom');
    expect(endroll.backgroundColor).toBe('#123456');
  });

  /** 旧バージョンのプロジェクトには endroll フィールド自体が存在しない */
  it('falls back to defaults when loading a project saved before the endroll existed', () => {
    useOverlayStore.getState().restoreFromSave({ enabled: true, positionX: 30 }, undefined);

    const { watermark, endroll } = useOverlayStore.getState();
    expect(watermark.positionX).toBe(30);
    expect(endroll).toEqual(DEFAULT_ENDROLL_OVERLAY);
    // 既定は無効なので、旧プロジェクトを開いても尺は伸びない
    expect(endroll.enabled).toBe(false);
  });

  it('clears both overlays on reset', () => {
    useOverlayStore.getState().updateEndroll({ durationSec: 12, backgroundMode: 'white' });
    useOverlayStore.getState().updateWatermark({ size: 2 });

    useOverlayStore.getState().resetWatermark();

    const { watermark, endroll } = useOverlayStore.getState();
    expect(watermark).toEqual(DEFAULT_WATERMARK_OVERLAY);
    expect(endroll).toEqual(DEFAULT_ENDROLL_OVERLAY);
  });
});
