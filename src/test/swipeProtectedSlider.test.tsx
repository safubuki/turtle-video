import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SwipeProtectedSlider } from '../components/SwipeProtectedSlider';

const touch = (clientX: number, clientY: number) => ({ clientX, clientY, identifier: 1 });
function renderSlider() {
  const onChange = vi.fn();
  render(<SwipeProtectedSlider value={2} min={0} max={10} onChange={onChange} ariaLabel="ナレーション開始位置" />);
  return { slider: screen.getByRole('slider'), onChange };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SwipeProtectedSlider の位置編集', () => {
  it('上下スクロールでは設定変更を通知せず、ブラウザの縦パンを許可する', () => {
    const { slider, onChange } = renderSlider();
    fireEvent.touchStart(slider, { touches: [touch(100, 100)] });
    fireEvent.change(slider, { target: { value: 5 } });
    const move = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(move, 'touches', { value: [touch(103, 140)] });
    fireEvent(slider, move);
    fireEvent.change(slider, { target: { value: 7 } });
    fireEvent.touchEnd(slider, { touches: [], changedTouches: [touch(103, 140)] });
    expect(onChange).not.toHaveBeenCalled();
    expect(move.defaultPrevented).toBe(false);
    expect(slider.style.touchAction).toBe('pan-y pinch-zoom');
  });

  it('横スワイプは短時間でも設定値を変更できる', () => {
    const { slider, onChange } = renderSlider();
    fireEvent.touchStart(slider, { touches: [touch(100, 100)] });
    fireEvent.change(slider, { target: { value: 5 } });
    fireEvent.touchMove(slider, { touches: [touch(140, 103)] });
    fireEvent.change(slider, { target: { value: 7 } });
    fireEvent.touchEnd(slider, { touches: [], changedTouches: [touch(140, 103)] });
    expect(onChange.mock.calls).toEqual([[5], [7]]);
  });

  it('200ms以上のタップだけ離した時点で設定値を変更する', () => {
    vi.useFakeTimers();
    const { slider, onChange } = renderSlider();
    fireEvent.touchStart(slider, { touches: [touch(100, 100)] });
    fireEvent.change(slider, { target: { value: 5 } });
    vi.advanceTimersByTime(199);
    fireEvent.touchEnd(slider, { touches: [], changedTouches: [touch(100, 100)] });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.touchStart(slider, { touches: [touch(100, 100)] });
    fireEvent.change(slider, { target: { value: 7 } });
    vi.advanceTimersByTime(200);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.touchEnd(slider, { touches: [], changedTouches: [touch(100, 100)] });
    expect(onChange.mock.calls).toEqual([[7]]);
  });

  it('touchcancelで設定値を変更しない', () => {
    const { slider, onChange } = renderSlider();
    fireEvent.touchStart(slider, { touches: [touch(100, 100)] });
    fireEvent.change(slider, { target: { value: 5 } });
    fireEvent.touchCancel(slider, { touches: [], changedTouches: [touch(100, 100)] });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('タッチ途中で編集が無効になると保留値を破棄する', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { rerender } = render(
      <SwipeProtectedSlider value={2} min={0} max={10} onChange={onChange} />,
    );
    const slider = screen.getByRole('slider');
    fireEvent.touchStart(slider, { touches: [touch(100, 100)] });
    fireEvent.change(slider, { target: { value: 5 } });
    vi.advanceTimersByTime(200);
    rerender(<SwipeProtectedSlider value={2} min={0} max={10} onChange={onChange} disabled />);
    fireEvent.touchEnd(slider, { touches: [], changedTouches: [touch(100, 100)] });
    expect(onChange).not.toHaveBeenCalled();
  });
});
