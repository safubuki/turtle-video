/**
 * @file appBootSmoke.test.tsx
 * @description アプリが「真っ白（起動不能）」にならないことを守る起動スモークテスト。
 *
 * App.tsx は `<Suspense fallback={null}>` で lazy フレーバーを読むため、
 * フレーバー側のモジュール評価で例外が出ると **画面が白いまま無言で死ぬ**。
 * ここで実際に StandardApp を import + マウントし、その事故を検知する。
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// PWA の仮想モジュールは vitest から解決できないためスタブ化する
// （reloadPromptLayout.test.tsx と同じ方式）
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

describe('アプリ起動スモーク', () => {
  it('StandardApp のモジュール評価が例外を投げない', async () => {
    const mod = await import('../flavors/standard/StandardApp');
    expect(mod.default).toBeTypeOf('function');
  });

  it('StandardApp をマウントできる（真っ白にならない）', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { default: StandardApp } = await import('../flavors/standard/StandardApp');
      const { container } = render(<StandardApp />);
      expect(container.innerHTML.length).toBeGreaterThan(0);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
