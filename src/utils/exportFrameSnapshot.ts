/**
 * @file exportFrameSnapshot.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description standard export が Canvas をスロット単位で保持するための小さなリングバッファ。
 *
 * encode の poll は描画 rAF と非同期のため、live Canvas を読むと次スロットの画を
 * 前の timestamp へ載せてしまう。公開した index の画素をここで固定し、
 * 壁時計 / native 再生 / backpressure は変えない。
 */

export const EXPORT_FRAME_SNAPSHOT_RING_SIZE = 3;

export interface ExportFrameSnapshotRing {
  store(frameIndex: number, source: HTMLCanvasElement): boolean;
  get(frameIndex: number): HTMLCanvasElement | null;
  clear(): void;
}

interface SnapshotSlot {
  index: number;
  canvas: HTMLCanvasElement;
}

export function createExportFrameSnapshotRing(
  size: number = EXPORT_FRAME_SNAPSHOT_RING_SIZE,
  createCanvas: () => HTMLCanvasElement = defaultExportSnapshotCanvas,
): ExportFrameSnapshotRing {
  const slotCount = Number.isFinite(size) ? Math.max(1, Math.floor(size)) : EXPORT_FRAME_SNAPSHOT_RING_SIZE;
  const slots: SnapshotSlot[] = Array.from({ length: slotCount }, () => ({
    index: -1,
    canvas: createCanvas(),
  }));
  let writeAt = 0;

  return {
    store(frameIndex: number, source: HTMLCanvasElement): boolean {
      if (!Number.isFinite(frameIndex) || frameIndex < 0) return false;
      if (!source || source.width <= 0 || source.height <= 0) return false;
      const slot = slots[writeAt];
      const dest = slot.canvas;
      if (dest.width !== source.width) dest.width = source.width;
      if (dest.height !== source.height) dest.height = source.height;
      const ctx = dest.getContext('2d');
      if (!ctx) return false;
      ctx.drawImage(source, 0, 0);
      slot.index = Math.floor(frameIndex);
      writeAt = (writeAt + 1) % slots.length;
      return true;
    },
    get(frameIndex: number): HTMLCanvasElement | null {
      if (!Number.isFinite(frameIndex) || frameIndex < 0) return null;
      const index = Math.floor(frameIndex);
      const slot = slots.find((item) => item.index === index);
      return slot ? slot.canvas : null;
    },
    clear(): void {
      for (const slot of slots) {
        slot.index = -1;
      }
      writeAt = 0;
    },
  };
}

function defaultExportSnapshotCanvas(): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    return {
      width: 0,
      height: 0,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
  }
  return document.createElement('canvas');
}
