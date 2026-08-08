/**
 * @file captionMiniPreview.test.tsx
 * @description キャプション設定のミニプレビューのテスト。
 *
 * 「プレビューの現在フレームへキャプションを重ねて、設定画面から離れずに
 * サイズ・位置を確認できる」ことが目的。背景の転写とキャプション描画の
 * 両方が行われることを検証する。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import CaptionMiniPreview from '../components/common/CaptionMiniPreview';
import { captureCaptionFreeSnapshot, createCaptionFreeSnapshot } from '../utils/canvas';
import type { Caption, CaptionSettings } from '../types';

const settings: CaptionSettings = {
  enabled: true,
  fontSize: 'medium',
  fontStyle: 'gothic',
  fontColor: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 4,
  position: 'bottom',
  blur: 0,
  backgroundEnabled: false,
  backgroundColor: '#000000',
  backgroundOpacity: 0.45,
  backgroundRadius: 16,
  bulkFadeIn: false,
  bulkFadeOut: false,
  bulkFadeInDuration: 0.5,
  bulkFadeOutDuration: 0.5,
};

const caption: Caption = {
  id: 'c1',
  text: 'サンプル字幕',
  startTime: 0,
  endTime: 2,
  fadeIn: false,
  fadeOut: false,
  fadeInDuration: 0.5,
  fadeOutDuration: 0.5,
};

/** jsdom の canvas は 2d コンテキストを持たないため、呼び出しを記録するモックを差し込む */
function stubCanvasContext() {
  const calls: string[] = [];
  const ctx = {
    canvas: { width: 320, height: 180 },
    setTransform: vi.fn(() => calls.push('setTransform')),
    save: vi.fn(() => calls.push('save')),
    restore: vi.fn(() => calls.push('restore')),
    fillRect: vi.fn(() => calls.push('fillRect')),
    clearRect: vi.fn(() => calls.push('clearRect')),
    drawImage: vi.fn((..._args: unknown[]) => calls.push('drawImage')),
    fillText: vi.fn(() => calls.push('fillText')),
    strokeText: vi.fn(() => calls.push('strokeText')),
    measureText: vi.fn(() => ({ width: 100 })),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ctx as unknown as CanvasRenderingContext2D,
  );
  return { ctx, calls };
}

describe('CaptionMiniPreview', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('canvas を描画対象として表示する', () => {
    stubCanvasContext();
    const sourceRef = createRef<HTMLCanvasElement>();
    render(
      <CaptionMiniPreview
        sourceCanvasRef={sourceRef}
        captions={[caption]}
        settings={settings}
        previewTimeSec={1}
      />,
    );
    expect(screen.getByRole('img', { name: 'キャプションのミニプレビュー' })).toBeTruthy();
  });

  it('メインプレビューの canvas を背景として転写する', () => {
    const { ctx } = stubCanvasContext();
    const source = document.createElement('canvas');
    source.width = 960;
    source.height = 540;
    const sourceRef = { current: source };

    render(
      <CaptionMiniPreview
        sourceCanvasRef={sourceRef}
        captions={[caption]}
        settings={settings}
        previewTimeSec={1}
      />,
    );

    // 背景（メインプレビューの転写）とキャプションのグリフ、両方の drawImage が走る
    expect(ctx.drawImage).toHaveBeenCalled();
    // 最初の drawImage が「メインプレビューの現在フレームの転写」であること
    expect(ctx.drawImage.mock.calls[0]?.[0]).toBe(source);
  });

  it('メインプレビューが未描画でも落ちず、黒背景で描く', () => {
    const { ctx } = stubCanvasContext();
    const sourceRef = createRef<HTMLCanvasElement>();

    render(
      <CaptionMiniPreview
        sourceCanvasRef={sourceRef}
        captions={[caption]}
        settings={settings}
        previewTimeSec={1}
      />,
    );

    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('キャプション表示 OFF（settings.enabled=false）でもミニプレビューには描く', () => {
    const { ctx } = stubCanvasContext();
    const source = document.createElement('canvas');
    source.width = 960;
    source.height = 540;

    render(
      <CaptionMiniPreview
        sourceCanvasRef={{ current: source }}
        captions={[caption]}
        settings={{ ...settings, enabled: false }}
        previewTimeSec={1}
      />,
    );

    // 背景転写の 1 回に加えて、グリフの drawImage が発生している
    expect(ctx.drawImage.mock.calls.length).toBeGreaterThan(1);
  });

  it('キャプション抜きスナップショットがあればそれを転写元にする（文字の二重表示を防ぐ）', () => {
    const { ctx } = stubCanvasContext();
    // メインプレビューの canvas にはキャプションが焼き込まれている
    const mainPreview = document.createElement('canvas');
    mainPreview.width = 960;
    mainPreview.height = 540;
    // キャプションを描く直前のフレーム（本来の転写元）
    const captionFree = document.createElement('canvas');
    captionFree.width = 960;
    captionFree.height = 540;
    const snapshot = { canvas: captionFree, hasFrame: true };

    render(
      <CaptionMiniPreview
        sourceCanvasRef={{ current: mainPreview }}
        captionFreeSnapshotRef={{ current: snapshot }}
        captions={[caption]}
        settings={settings}
        previewTimeSec={1}
      />,
    );

    // 背景は「焼き込み済みのメインプレビュー」ではなくスナップショットから取る
    expect(ctx.drawImage.mock.calls[0]?.[0]).toBe(captionFree);
    expect(ctx.drawImage.mock.calls[0]?.[0]).not.toBe(mainPreview);
  });

  it('スナップショットが未描画ならメインプレビューへフォールバックする', () => {
    const { ctx } = stubCanvasContext();
    const mainPreview = document.createElement('canvas');
    mainPreview.width = 960;
    mainPreview.height = 540;
    // hasFrame=false（エンジンがまだ一度も保存していない）
    const snapshot = createCaptionFreeSnapshot();

    render(
      <CaptionMiniPreview
        sourceCanvasRef={{ current: mainPreview }}
        captionFreeSnapshotRef={{ current: snapshot }}
        captions={[caption]}
        settings={settings}
        previewTimeSec={1}
      />,
    );

    expect(ctx.drawImage.mock.calls[0]?.[0]).toBe(mainPreview);
  });

  it('補足テキスト（現在位置の案内）を表示できる', () => {
    stubCanvasContext();
    render(
      <CaptionMiniPreview
        sourceCanvasRef={createRef<HTMLCanvasElement>()}
        captions={[caption]}
        settings={settings}
        previewTimeSec={1}
        caption="プレビュー現在位置 0:03 の画面"
      />,
    );
    expect(screen.getByText('プレビュー現在位置 0:03 の画面')).toBeTruthy();
  });
});

describe('captureCaptionFreeSnapshot', () => {
  it('キャプション描画前のフレームを控え、hasFrame を立てる', () => {
    const snapshot = createCaptionFreeSnapshot();
    expect(snapshot.hasFrame).toBe(false);
    expect(snapshot.canvas).toBeNull();

    const drawn: unknown[] = [];
    const sourceCanvas = { width: 640, height: 360 };
    const targetCtx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn((...args: unknown[]) => drawn.push(args[0])),
      globalAlpha: 1,
      filter: 'none',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => targetCtx as unknown as CanvasRenderingContext2D,
    );

    captureCaptionFreeSnapshot(
      { canvas: sourceCanvas } as unknown as CanvasRenderingContext2D,
      snapshot,
    );

    expect(snapshot.hasFrame).toBe(true);
    expect(snapshot.canvas?.width).toBe(640);
    expect(snapshot.canvas?.height).toBe(360);
    expect(drawn[0]).toBe(sourceCanvas);
  });

  it('サイズ 0 の canvas では何もしない（未描画のまま）', () => {
    const snapshot = createCaptionFreeSnapshot();
    captureCaptionFreeSnapshot(
      { canvas: { width: 0, height: 0 } } as unknown as CanvasRenderingContext2D,
      snapshot,
    );
    expect(snapshot.hasFrame).toBe(false);
  });

  it('同じスナップショットを繰り返し使っても canvas を作り直さない（メモリ節約）', () => {
    const snapshot = createCaptionFreeSnapshot();
    const targetCtx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      globalAlpha: 1,
      filter: 'none',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => targetCtx as unknown as CanvasRenderingContext2D,
    );

    const ctx = { canvas: { width: 320, height: 180 } } as unknown as CanvasRenderingContext2D;
    captureCaptionFreeSnapshot(ctx, snapshot);
    const first = snapshot.canvas;
    captureCaptionFreeSnapshot(ctx, snapshot);
    expect(snapshot.canvas).toBe(first);
  });
});
