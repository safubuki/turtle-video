import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverlayStore } from '../../stores/overlayStore';
import { DEFAULT_WATERMARK_OVERLAY } from '../../utils/watermarkOverlay';

describe('overlayStore', () => {
  beforeEach(() => {
    useOverlayStore.setState({
      watermark: { ...DEFAULT_WATERMARK_OVERLAY },
    });
  });

  it('画像選択時にプロジェクト全尺を既定範囲にし、非表示でも設定を保持する', () => {
    const file = new File(['logo'], 'brand.webp', { type: 'image/webp' });
    useOverlayStore.getState().setWatermarkImage(file, 12);
    useOverlayStore.getState().updateWatermark({
      enabled: false,
      positionX: 22,
      opacity: 0.35,
    });

    expect(useOverlayStore.getState().watermark).toMatchObject({
      file,
      enabled: false,
      startTime: 0,
      endTime: 12,
      positionX: 22,
      opacity: 0.35,
    });
  });

  it('画像の置換・削除・復元時に古い Object URL を解放する', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const first = new File(['a'], 'first.png', { type: 'image/png' });
    const second = new File(['b'], 'second.jpg', { type: 'image/jpeg' });

    useOverlayStore.getState().setWatermarkImage(first, 5);
    const firstUrl = useOverlayStore.getState().watermark.url;
    useOverlayStore.getState().setWatermarkImage(second, 5);
    expect(revoke).toHaveBeenCalledWith(firstUrl);

    const secondUrl = useOverlayStore.getState().watermark.url;
    useOverlayStore.getState().removeWatermarkImage();
    expect(revoke).toHaveBeenCalledWith(secondUrl);
    expect(useOverlayStore.getState().watermark.file).toBeNull();
    expect(useOverlayStore.getState().watermark.positionX).toBe(DEFAULT_WATERMARK_OVERLAY.positionX);
  });
});

