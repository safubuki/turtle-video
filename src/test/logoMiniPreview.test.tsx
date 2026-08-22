import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LogoMiniPreview from '../components/common/LogoMiniPreview';
import type { EndrollOverlay, WatermarkOverlay } from '../types';
import { DEFAULT_ENDROLL_OVERLAY } from '../utils/endrollOverlay';
import { DEFAULT_WATERMARK_OVERLAY } from '../utils/watermarkOverlay';

function stubCanvasContext() {
  const fillStyles: string[] = [];
  let currentFillStyle = '';
  const ctx = {
    canvas: { width: 320, height: 180 },
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    globalAlpha: 1,
    filter: 'none',
    get fillStyle() {
      return currentFillStyle;
    },
    set fillStyle(value: string) {
      currentFillStyle = value;
      fillStyles.push(value);
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ctx as unknown as CanvasRenderingContext2D
  );
  return { ctx, fillStyles };
}

describe('LogoMiniPreview', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('ウォーターマークはロゴ描画前スナップショットを背景に使う', () => {
    const { ctx } = stubCanvasContext();
    const mainPreview = document.createElement('canvas');
    mainPreview.width = 960;
    mainPreview.height = 540;
    const overlayFreeFrame = document.createElement('canvas');
    overlayFreeFrame.width = 960;
    overlayFreeFrame.height = 540;
    const watermark: WatermarkOverlay = {
      ...DEFAULT_WATERMARK_OVERLAY,
      url: 'blob:watermark',
    };

    render(
      <LogoMiniPreview
        sourceCanvasRef={{ current: mainPreview }}
        captionFreeSnapshotRef={{ current: { canvas: overlayFreeFrame, hasFrame: true } }}
        overlay={watermark}
        mode="watermark"
        canvasWidth={960}
        canvasHeight={540}
      />
    );

    expect(
      screen.getByRole('img', { name: 'ウォーターマークのミニプレビュー' })
    ).toBeInTheDocument();
    expect(ctx.drawImage.mock.calls[0]?.[0]).toBe(overlayFreeFrame);
  });

  it('エンドロールは設定中の背景色をミニビューへ反映する', () => {
    const { fillStyles } = stubCanvasContext();
    const endroll: EndrollOverlay = {
      ...DEFAULT_ENDROLL_OVERLAY,
      url: 'blob:endroll',
      enabled: false,
      backgroundMode: 'white',
    };

    render(
      <LogoMiniPreview
        sourceCanvasRef={createRef<HTMLCanvasElement>()}
        overlay={endroll}
        mode="endroll"
        canvasWidth={960}
        canvasHeight={540}
      />
    );

    expect(screen.getByRole('img', { name: 'エンドロールのミニプレビュー' })).toBeInTheDocument();
    expect(fillStyles).toContain('#ffffff');

    const frame = screen.getByTestId('logo-mini-preview-frame');
    const caption = screen.getByText('エンドロールの見た目を確認');
    expect(frame).toHaveClass('border', 'border-gray-400');
    expect(frame).toContainElement(screen.getByRole('img', { name: 'エンドロールのミニプレビュー' }));
    expect(frame).not.toContainElement(caption);
  });

  it('ウォーターマークの補足文も表示領域の枠の外に出す', () => {
    stubCanvasContext();
    const watermark: WatermarkOverlay = {
      ...DEFAULT_WATERMARK_OVERLAY,
      url: 'blob:watermark',
    };

    render(
      <LogoMiniPreview
        sourceCanvasRef={createRef<HTMLCanvasElement>()}
        overlay={watermark}
        mode="watermark"
        canvasWidth={960}
        canvasHeight={540}
      />
    );

    const frame = screen.getByTestId('logo-mini-preview-frame');
    const caption = screen.getByText('現在のプレビュー画面に重ねて表示');
    expect(frame).toContainElement(
      screen.getByRole('img', { name: 'ウォーターマークのミニプレビュー' }),
    );
    expect(frame).not.toContainElement(caption);
  });
});
