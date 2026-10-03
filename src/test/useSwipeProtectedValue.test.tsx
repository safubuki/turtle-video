import { useState } from 'react';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSwipeProtectedValue } from '../hooks/useSwipeProtectedValue';

function renderProtectedValue(minTouchDuration = 0, onInteractionStart?: () => void) {
  const onValueChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState(2);
    const handlers = useSwipeProtectedValue(value, (next) => {
      onValueChange(next);
      setValue(next);
    }, { minMovement: 15, minTouchDuration, onInteractionStart });
    return <input type="range" aria-label="位置" min={0} max={10} value={value} {...handlers} />;
  }
  render(<Harness />);
  return { input: screen.getByRole('slider') as HTMLInputElement, onValueChange };
}

const touch = (clientX: number, clientY: number, identifier = 1) => ({ clientX, clientY, identifier });
const start = (input: HTMLInputElement) => fireEvent.touchStart(input, { touches: [touch(100, 100)] });
const move = (input: HTMLInputElement, x: number, y: number) =>
  fireEvent.touchMove(input, { touches: [touch(x, y)] });
const change = (input: HTMLInputElement, value: number) => fireEvent.change(input, { target: { value } });
const end = (input: HTMLInputElement, x = 100, y = 100) =>
  fireEvent.touchEnd(input, { touches: [], changedTouches: [touch(x, y)] });

function pointerDown(input: HTMLInputElement, pointerType: 'touch' | 'mouse', isPrimary = true) {
  const event = createEvent.pointerDown(input, { bubbles: true });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    pointerId: { value: 1 },
    isPrimary: { value: isPrimary },
    clientX: { value: 100 },
    clientY: { value: 100 },
  });
  fireEvent(input, event);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useSwipeProtectedValue', () => {
  it('方向が未確定の間は最新値を保留し、変更通知もつまみの移動もしない', () => {
    const { input, onValueChange } = renderProtectedValue();
    start(input);
    change(input, 5);
    change(input, 7);
    move(input, 115, 100);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(input.value).toBe('2');
    end(input, 115, 100);
    expect(onValueChange.mock.calls).toEqual([[7]]);
  });

  it('縦スクロールでは開始直後から終了まで値変更を一度も通知しない', () => {
    const { input, onValueChange } = renderProtectedValue();
    start(input);
    change(input, 5);
    move(input, 104, 130);
    change(input, 7);
    move(input, 170, 150);
    change(input, 9);
    end(input, 170, 150);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(input.value).toBe('2');
  });

  it('移動なしのタップは離したときに最新値を一度だけ確定する', () => {
    const { input, onValueChange } = renderProtectedValue();
    start(input);
    change(input, 5);
    change(input, 7);
    expect(onValueChange).not.toHaveBeenCalled();
    end(input);
    expect(onValueChange.mock.calls).toEqual([[7]]);
    expect(input.value).toBe('7');
  });

  it('一般設定用の200ms未満のタップを無視し、200msのタップを許可する', () => {
    const { input, onValueChange } = renderProtectedValue(200);
    start(input);
    change(input, 5);
    vi.advanceTimersByTime(199);
    end(input);
    expect(onValueChange).not.toHaveBeenCalled();
    start(input);
    change(input, 7);
    vi.advanceTimersByTime(200);
    end(input);
    expect(onValueChange.mock.calls).toEqual([[7]]);
  });

  it('横操作が確定したら保留値を適用し、以降の値変更にも追従する', () => {
    const { input, onValueChange } = renderProtectedValue(200);
    start(input);
    change(input, 5);
    move(input, 130, 103);
    expect(onValueChange.mock.calls).toEqual([[5]]);
    change(input, 7);
    // 一度横操作と決めたセッションは、後から縦方向へ動いても横操作を維持する。
    move(input, 135, 180);
    change(input, 9);
    end(input, 135, 180);
    expect(onValueChange.mock.calls).toEqual([[5], [7], [9]]);
  });

  it('touchcancelは保留値を破棄し、次の操作に持ち越さない', () => {
    const { input, onValueChange } = renderProtectedValue();
    start(input);
    change(input, 5);
    fireEvent.touchCancel(input, { touches: [], changedTouches: [touch(100, 100)] });
    end(input);
    expect(onValueChange).not.toHaveBeenCalled();
    start(input);
    change(input, 7);
    end(input);
    expect(onValueChange.mock.calls).toEqual([[7]]);
  });

  it('複数指になったら片方が離れても保留値を確定しない', () => {
    const { input, onValueChange } = renderProtectedValue();
    start(input);
    change(input, 5);
    fireEvent.touchStart(input, { touches: [touch(100, 100), touch(120, 100, 2)] });
    change(input, 7);
    fireEvent.touchEnd(input, { touches: [touch(100, 100)], changedTouches: [touch(120, 100, 2)] });
    move(input, 140, 100);
    change(input, 9);
    end(input, 140, 100);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(input.value).toBe('2');
  });

  it('複数指でタッチが始まった場合も変更を通知しない', () => {
    const { input, onValueChange } = renderProtectedValue();
    fireEvent.touchStart(input, { touches: [touch(100, 100), touch(120, 100, 2)] });
    change(input, 5);
    end(input);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('複数指のうち片方がキャンセルされても残った指の変更を通知しない', () => {
    const { input, onValueChange } = renderProtectedValue();
    start(input);
    change(input, 5);
    fireEvent.touchStart(input, { touches: [touch(100, 100), touch(120, 100, 2)] });
    fireEvent.touchCancel(input, { touches: [touch(100, 100)], changedTouches: [touch(120, 100, 2)] });
    change(input, 7);
    end(input);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('pointerdownとtouchstartの間に届いた値変更も保留したまま引き継ぐ', () => {
    const { input, onValueChange } = renderProtectedValue();
    pointerDown(input, 'touch');
    change(input, 5);
    expect(onValueChange).not.toHaveBeenCalled();
    start(input);
    end(input);
    expect(onValueChange.mock.calls).toEqual([[5]]);
  });

  it('非primaryの指が入った場合も値変更を通知しない', () => {
    const { input, onValueChange } = renderProtectedValue();
    pointerDown(input, 'touch', false);
    change(input, 5);
    start(input);
    end(input);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('最後の縦移動がtouchendにだけ届いた場合もタップとして確定しない', () => {
    const { input, onValueChange } = renderProtectedValue();
    start(input);
    change(input, 5);
    end(input, 104, 140);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('マウスとキーボードによる値変更は即座に通知する', () => {
    const { input, onValueChange } = renderProtectedValue();
    pointerDown(input, 'mouse');
    change(input, 5);
    expect(onValueChange.mock.calls).toEqual([[5]]);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    change(input, 6);
    expect(onValueChange.mock.calls).toEqual([[5], [6]]);
  });

  it('前のタッチが終了しなくても新しいprimaryタッチを受け付ける', () => {
    const { input, onValueChange } = renderProtectedValue();
    pointerDown(input, 'touch');
    change(input, 5);
    pointerDown(input, 'touch');
    change(input, 7);
    start(input);
    end(input);
    expect(onValueChange.mock.calls).toEqual([[7]]);
  });

  it('ウィンドウが非アクティブになった場合は保留値を破棄する', () => {
    const { input, onValueChange } = renderProtectedValue();
    pointerDown(input, 'touch');
    start(input);
    change(input, 5);
    fireEvent.blur(window);
    end(input);
    expect(onValueChange).not.toHaveBeenCalled();
    pointerDown(input, 'touch');
    start(input);
    change(input, 7);
    end(input);
    expect(onValueChange.mock.calls).toEqual([[7]]);
  });

  it('入力のblurで保留値を破棄し、その後のキーボード操作を受け付ける', () => {
    const { input, onValueChange } = renderProtectedValue();
    start(input);
    change(input, 5);
    fireEvent.blur(input);
    end(input);
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    change(input, 3);
    expect(onValueChange.mock.calls).toEqual([[3]]);
  });

  it('pointercancel後に届くchangeもシークとして通知しない', () => {
    const { input, onValueChange } = renderProtectedValue();
    pointerDown(input, 'touch');
    start(input);
    change(input, 5);
    fireEvent.pointerCancel(input);
    change(input, 7);
    end(input);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('タップ確定時は値変更の直前に開始を一度だけ通知する', () => {
    const calls: string[] = [];
    const onInteractionStart = vi.fn(() => calls.push('start'));
    const { input, onValueChange } = renderProtectedValue(0, onInteractionStart);
    onValueChange.mockImplementation((value) => calls.push(String(value)));
    start(input);
    change(input, 5);
    expect(calls).toEqual([]);
    end(input);
    expect(calls).toEqual(['start', '5']);
  });

  it('横操作の確定時に一度だけ開始し、以後の値変更で再開始しない', () => {
    const calls: string[] = [];
    const onInteractionStart = vi.fn(() => calls.push('start'));
    const { input, onValueChange } = renderProtectedValue(0, onInteractionStart);
    onValueChange.mockImplementation((value) => calls.push(String(value)));
    start(input);
    change(input, 5);
    move(input, 140, 103);
    change(input, 7);
    move(input, 150, 104);
    end(input, 150, 104);
    expect(calls).toEqual(['start', '5', '7']);
  });

  it('横方向確定前にchangeがなくても、確定後の最初の変更より先に開始する', () => {
    const calls: string[] = [];
    const onInteractionStart = vi.fn(() => calls.push('start'));
    const { input, onValueChange } = renderProtectedValue(0, onInteractionStart);
    onValueChange.mockImplementation((value) => calls.push(String(value)));
    start(input);
    move(input, 140, 103);
    change(input, 5);
    expect(calls).toEqual(['start', '5']);
  });

  it('縦スクロールや短すぎる設定タップでは操作開始も通知しない', () => {
    const onInteractionStart = vi.fn();
    const { input, onValueChange } = renderProtectedValue(200, onInteractionStart);
    start(input);
    change(input, 5);
    move(input, 103, 140);
    end(input, 103, 140);
    start(input);
    change(input, 7);
    vi.advanceTimersByTime(199);
    end(input);
    expect(onInteractionStart).not.toHaveBeenCalled();
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
