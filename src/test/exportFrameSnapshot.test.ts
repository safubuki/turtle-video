import { describe, expect, it, vi } from 'vitest';
import { createExportFrameSnapshotRing } from '../utils/exportFrameSnapshot';

function createStubCanvas(width: number, height: number) {
  const drawn: Array<{ width: number; height: number }> = [];
  const canvas = {
    width,
    height,
    getContext: vi.fn(() => ({
      drawImage: vi.fn((source: { width: number; height: number }) => {
        drawn.push({ width: source.width, height: source.height });
      }),
    })),
  } as unknown as HTMLCanvasElement;
  return { canvas, drawn };
}

describe('createExportFrameSnapshotRing', () => {
  it('同じ index の Canvas を後から取り出せる', () => {
    const destA = createStubCanvas(0, 0);
    const destB = createStubCanvas(0, 0);
    const created = [destA.canvas, destB.canvas];
    const ring = createExportFrameSnapshotRing(2, () => created.shift() ?? destB.canvas);
    const source = createStubCanvas(1280, 720).canvas;

    expect(ring.store(3, source)).toBe(true);
    expect(ring.get(3)).toBe(destA.canvas);
    expect(destA.canvas.width).toBe(1280);
    expect(destA.canvas.height).toBe(720);
    expect(destA.drawn).toEqual([{ width: 1280, height: 720 }]);
  });

  it('容量を超えた古いスロットは捨てる', () => {
    const slots = [createStubCanvas(0, 0), createStubCanvas(0, 0)];
    const created = [...slots.map((item) => item.canvas)];
    const ring = createExportFrameSnapshotRing(2, () => created.shift() ?? slots[1].canvas);
    const source = createStubCanvas(64, 36).canvas;

    expect(ring.store(1, source)).toBe(true);
    expect(ring.store(2, source)).toBe(true);
    expect(ring.store(3, source)).toBe(true);
    expect(ring.get(1)).toBeNull();
    expect(ring.get(2)).toBe(slots[1].canvas);
    expect(ring.get(3)).toBe(slots[0].canvas);
  });

  it('寸法 0 の source は保存しない', () => {
    const ring = createExportFrameSnapshotRing(1, () => createStubCanvas(0, 0).canvas);
    expect(ring.store(0, createStubCanvas(0, 0).canvas)).toBe(false);
    expect(ring.get(0)).toBeNull();
  });

  it('clear 後はどの index も取れない', () => {
    const dest = createStubCanvas(0, 0);
    const ring = createExportFrameSnapshotRing(1, () => dest.canvas);
    expect(ring.store(9, createStubCanvas(32, 18).canvas)).toBe(true);
    ring.clear();
    expect(ring.get(9)).toBeNull();
  });
});
