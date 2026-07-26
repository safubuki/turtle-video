/**
 * @file videoTitleDraw.test.ts
 * @description 動画タイトル描画（Issue #211）の回帰テスト。
 *
 * 確認項目「エクスポート結果がプレビューと一致する」を構造的に守るため、
 * drawVideoTitleFrame が
 * - 720p（プレビュー）と 1080p（エクスポート）で「フレームに対する比率」を保つ
 * - 表示区間外・空文字・非表示では一切描かない
 * ことを固定する。standard / apple-safari 両フレーバーがこの関数を共有している。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawVideoTitleFrame, DEFAULT_VIDEO_TITLE_SETTINGS } from '../utils/videoTitle';
import type { VideoTitleSettings } from '../types';

interface DrawCall {
  /** drawImage の左上 X */
  x: number;
  /** drawImage の左上 Y */
  y: number;
  /** グリフ Canvas の実寸（中心座標を復元して比率比較するため） */
  width: number;
  height: number;
}

/**
 * createCaptionGlyphCanvas は内部で `document.createElement('canvas')` を使うため、
 * jsdom の未実装 API（strokeText 等）を避けて 2D コンテキストを差し替える。
 * 既存の captionGlyphStyle.test.ts と同じ方式。
 * グリフ寸法はフォントサイズから決まるので、720p/1080p のスケール比較が成立する。
 */
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    const stub = {
      font: '',
      textAlign: 'start' as CanvasTextAlign,
      textBaseline: 'alphabetic' as CanvasTextBaseline,
      lineJoin: 'miter' as CanvasLineJoin,
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
      strokeText: vi.fn(),
      fillText: vi.fn(),
      measureText: (text: string) => {
        // font 文字列（"bold <size>px <family>"）からサイズを取り、実寸に比例させる
        const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(stub.font)?.[1] ?? '48');
        return {
          width: text.length * size * 0.9,
          actualBoundingBoxAscent: size * 0.8,
          actualBoundingBoxDescent: size * 0.3,
        };
      },
    };
    return stub as unknown as CanvasRenderingContext2D;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** drawImage / fillRect の呼び出しを記録する最小の 2D コンテキストスタブ */
function createStubContext(width: number, height: number) {
  const drawImageCalls: DrawCall[] = [];
  const fillRectCalls: { x: number; y: number; w: number; h: number }[] = [];
  const roundRectCalls: { x: number; y: number; w: number; h: number; r: number }[] = [];
  const alphaAtDraw: number[] = [];

  const ctx = {
    canvas: { width, height },
    globalAlpha: 1,
    fillStyle: '',
    font: '',
    textAlign: '' as CanvasTextAlign,
    textBaseline: '' as CanvasTextBaseline,
    filter: 'none',
    lineJoin: '' as CanvasLineJoin,
    lineWidth: 0,
    strokeStyle: '',
    save: vi.fn(),
    restore: vi.fn(),
    measureText: (text: string) => ({
      width: text.length * 10,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 4,
    }),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    getContext: () => ctx,
    drawImage: (img: unknown, x: number, y: number) => {
      const glyph = img as HTMLCanvasElement;
      drawImageCalls.push({ x, y, width: glyph.width, height: glyph.height });
      alphaAtDraw.push(ctx.globalAlpha);
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      fillRectCalls.push({ x, y, w, h });
    },
    beginPath: vi.fn(),
    fill: vi.fn(),
    roundRect: (x: number, y: number, w: number, h: number, r: number) => {
      roundRectCalls.push({ x, y, w, h, r });
    },
  };

  return { ctx, drawImageCalls, fillRectCalls, roundRectCalls, alphaAtDraw };
}

const activeTitle = (overrides: Partial<VideoTitleSettings> = {}): VideoTitleSettings => ({
  ...DEFAULT_VIDEO_TITLE_SETTINGS,
  text: 'タイトル',
  startTime: 0,
  endTime: 4,
  fadeIn: false,
  fadeOut: false,
  ...overrides,
});

function draw(title: VideoTitleSettings, timeSec: number, width: number, height: number) {
  const stub = createStubContext(width, height);
  const drew = drawVideoTitleFrame(
    stub.ctx as unknown as CanvasRenderingContext2D,
    title,
    timeSec,
  );
  return { ...stub, drew };
}

describe('drawVideoTitleFrame — 描画しない条件', () => {
  it('タイトルが null なら描かない', () => {
    const stub = createStubContext(1920, 1080);
    expect(
      drawVideoTitleFrame(stub.ctx as unknown as CanvasRenderingContext2D, null, 1),
    ).toBe(false);
    expect(stub.drawImageCalls).toHaveLength(0);
  });

  it('enabled=false なら描かない', () => {
    const result = draw(activeTitle({ enabled: false }), 1, 1920, 1080);
    expect(result.drew).toBe(false);
    expect(result.drawImageCalls).toHaveLength(0);
  });

  it('テキストが空白のみなら描かない', () => {
    const result = draw(activeTitle({ text: '  \n ' }), 1, 1920, 1080);
    expect(result.drew).toBe(false);
  });

  it('表示区間の外では描かない（終了時刻ちょうども描かない）', () => {
    const title = activeTitle({ startTime: 1, endTime: 3 });
    expect(draw(title, 0.5, 1920, 1080).drew).toBe(false);
    expect(draw(title, 3, 1920, 1080).drew).toBe(false);
    expect(draw(title, 2, 1920, 1080).drew).toBe(true);
  });

  it('フェードで alpha が 0 になる瞬間は描かない', () => {
    const title = activeTitle({ startTime: 0, endTime: 4, fadeIn: true, fadeInDuration: 1 });
    expect(draw(title, 0, 1920, 1080).drew).toBe(false);
  });
});

describe('drawVideoTitleFrame — プレビューとエクスポートの一致（WYSIWYG）', () => {
  /** グリフ中心のフレーム内比率（0〜1）。プレビュー/エクスポートで一致すべき値 */
  const centerRatio = (call: DrawCall, width: number, height: number) => ({
    x: (call.x + call.width / 2) / width,
    y: (call.y + call.height / 2) / height,
  });

  it('中央配置は 720p / 1080p ともフレーム中心に来る', () => {
    const title = activeTitle({ position: 'center' });
    const preview = draw(title, 1, 1280, 720);
    const exported = draw(title, 1, 1920, 1080);

    expect(preview.drew).toBe(true);
    expect(exported.drew).toBe(true);

    expect(centerRatio(preview.drawImageCalls[0], 1280, 720).y).toBeCloseTo(0.5, 5);
    expect(centerRatio(exported.drawImageCalls[0], 1920, 1080).y).toBeCloseTo(0.5, 5);
  });

  it('上部配置は 720p / 1080p で同じフレーム内比率になる', () => {
    const title = activeTitle({ position: 'top' });
    const preview = centerRatio(draw(title, 1, 1280, 720).drawImageCalls[0], 1280, 720);
    const exported = centerRatio(draw(title, 1, 1920, 1080).drawImageCalls[0], 1920, 1080);

    expect(preview.y).toBeCloseTo(exported.y, 5);
    expect(preview.x).toBeCloseTo(exported.x, 5);
  });

  it('下部配置も 720p / 1080p で同じフレーム内比率になる', () => {
    const title = activeTitle({ position: 'bottom' });
    const preview = centerRatio(draw(title, 1, 1280, 720).drawImageCalls[0], 1280, 720);
    const exported = centerRatio(draw(title, 1, 1920, 1080).drawImageCalls[0], 1920, 1080);

    expect(preview.y).toBeCloseTo(exported.y, 5);
  });

  it('カスタム位置は % 指定どおりの比率で描き、解像度に依存しない', () => {
    const title = activeTitle({ positionCustom: { x: 25, y: 80 } });
    const preview = centerRatio(draw(title, 1, 1280, 720).drawImageCalls[0], 1280, 720);
    const exported = centerRatio(draw(title, 1, 1920, 1080).drawImageCalls[0], 1920, 1080);

    expect(preview.x).toBeCloseTo(0.25, 5);
    expect(preview.y).toBeCloseTo(0.8, 5);
    expect(exported.x).toBeCloseTo(0.25, 5);
    expect(exported.y).toBeCloseTo(0.8, 5);
  });

  it('文字サイズはフレーム高さにほぼ比例する（同じ見た目の比率）', () => {
    const title = activeTitle({ fontSize: 'xlarge' });
    const preview = draw(title, 1, 1280, 720).drawImageCalls[0];
    const exported = draw(title, 1, 1920, 1080).drawImageCalls[0];

    // グリフ Canvas はアンチエイリアス用に固定 px の余白を持つ（createCaptionGlyphCanvas）。
    // 余白はスケールしないため厳密一致はしないが、文字の占有比率は 1% 未満の差に収まる。
    const previewRatio = preview.height / 720;
    const exportRatio = exported.height / 1080;
    expect(Math.abs(previewRatio - exportRatio)).toBeLessThan(0.02);
    // 幅も同様（フレームに対する文字の比率が解像度で大きく変わらない）
    expect(Math.abs(preview.width / 1280 - exported.width / 1920)).toBeLessThan(0.02);
  });
});

describe('drawVideoTitleFrame — 内容', () => {
  it('複数行は行数ぶん描画する（時分割しない＝同時に全行）', () => {
    const result = draw(activeTitle({ text: '一行目\n二行目\n三行目' }), 1, 1920, 1080);
    expect(result.drawImageCalls).toHaveLength(3);
    // 上から下へ順に積む
    const ys = result.drawImageCalls.map((c) => c.y);
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
  });

  it('空行は詰めて描画する', () => {
    const result = draw(activeTitle({ text: '一行目\n\n\n二行目' }), 1, 1920, 1080);
    expect(result.drawImageCalls).toHaveLength(2);
  });

  it('背景 ON では帯を 1 枚敷いてから文字を描く', () => {
    const off = draw(activeTitle({ backgroundEnabled: false }), 1, 1920, 1080);
    expect(off.fillRectCalls).toHaveLength(0);
    expect(off.roundRectCalls).toHaveLength(0);

    // 角丸 0 のときは fillRect（従来どおりの直角）
    const on = draw(
      activeTitle({ backgroundEnabled: true, backgroundOpacity: 0.5, backgroundRadius: 0 }),
      1,
      1920,
      1080,
    );
    expect(on.fillRectCalls).toHaveLength(1);
    expect(on.fillRectCalls[0].w).toBeGreaterThan(0);
    expect(on.fillRectCalls[0].h).toBeGreaterThan(0);
  });

  it('角丸を指定すると roundRect で帯を描く', () => {
    const result = draw(
      activeTitle({ backgroundEnabled: true, backgroundOpacity: 0.5, backgroundRadius: 24 }),
      1,
      1920,
      1080,
    );
    expect(result.roundRectCalls).toHaveLength(1);
    expect(result.fillRectCalls).toHaveLength(0);
    // 1080p では scale=1 なので指定値そのまま
    expect(result.roundRectCalls[0].r).toBeCloseTo(24, 5);
  });

  it('角丸も 1080p 基準でスケールする（720p では約 2/3）', () => {
    const title = activeTitle({
      backgroundEnabled: true,
      backgroundOpacity: 0.5,
      backgroundRadius: 30,
    });
    const preview = draw(title, 1, 1280, 720).roundRectCalls[0];
    const exported = draw(title, 1, 1920, 1080).roundRectCalls[0];

    expect(exported.r).toBeCloseTo(30, 5);
    expect(preview.r).toBeCloseTo(20, 5);
  });

  it('角丸は帯の短辺の半分を超えない', () => {
    const result = draw(
      activeTitle({
        text: 'あ',
        backgroundEnabled: true,
        backgroundOpacity: 0.5,
        backgroundRadius: 80,
      }),
      1,
      1920,
      1080,
    );
    const box = result.roundRectCalls[0];
    expect(box.r).toBeLessThanOrEqual(Math.min(box.w, box.h) / 2 + 1e-6);
  });

  it('背景の濃さ 0 では帯を敷かない', () => {
    const result = draw(
      activeTitle({ backgroundEnabled: true, backgroundOpacity: 0 }),
      1,
      1920,
      1080,
    );
    expect(result.fillRectCalls).toHaveLength(0);
    expect(result.roundRectCalls).toHaveLength(0);
    // 文字自体は描く
    expect(result.drawImageCalls).toHaveLength(1);
  });

  it('フェード中は 1 枚のグリフに単一の alpha を掛けて転写する（輪郭残り防止）', () => {
    const title = activeTitle({
      startTime: 0,
      endTime: 10,
      fadeIn: true,
      fadeInDuration: 2,
      fadeOut: false,
    });
    const result = draw(title, 1, 1920, 1080);
    expect(result.drawImageCalls).toHaveLength(1);
    expect(result.alphaAtDraw[0]).toBeCloseTo(0.5, 5);
  });
});
