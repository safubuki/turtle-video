/**
 * TimelineWaveform コンポーネントのテスト（Issue #217）。
 *
 * 固定する不変条件:
 * - 波形のクリック位置 → シーク時刻の対応が、シークバーと同じ「幅に対する比率 × 全長」であること
 * - 現在位置マーカーの横位置がシークバーのつまみと同じ百分率であること
 * - 無音区間ナビゲーションが現在位置から正しい時刻へシークすること
 * - 波形が出せない環境（enabled=false）では何も描かず、従来のシークバー操作を妨げないこと
 * - 初期実装ではキャプション時間を触らず、シーク以外の副作用が無いこと
 *
 * 波形データは props で受け取る設計（フックは TurtleVideo 側で 1 度だけ呼び、
 * プレビューの波形とキャプションのタイミング打ちバーで同じ検出結果を共有する）なので、
 * ここではデータを直接与えて UI の振る舞いだけを検証する。
 */
import React from 'react';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TimelineWaveform from '../components/media/TimelineWaveform';
import type { TimelineWaveformData } from '../hooks/useTimelineWaveform';
import type { TimelineSilenceRegion } from '../utils/timelineWaveform';

const TOTAL_DURATION = 10;
const CONTAINER_WIDTH = 500;

const silences: TimelineSilenceRegion[] = [
  { silenceStart: 2, silenceEnd: 3, duration: 1, center: 2.5 },
  { silenceStart: 6, silenceEnd: 7, duration: 1, center: 6.5 },
];

function readyData(overrides: Partial<TimelineWaveformData> = {}): TimelineWaveformData {
  return {
    status: 'ready',
    peaks: new Float32Array(64).fill(0.5),
    silences,
    resolvedSilenceSource: 'narration',
    duration: TOTAL_DURATION,
    ...overrides,
  };
}

function renderWaveform(
  overrides: Partial<React.ComponentProps<typeof TimelineWaveform>> = {},
) {
  const onSeek = vi.fn();
  const props: React.ComponentProps<typeof TimelineWaveform> = {
    waveform: readyData(),
    totalDuration: TOTAL_DURATION,
    currentTime: 0,
    enabled: true,
    disabled: false,
    onSeek,
    ...overrides,
  };
  const result = render(<TimelineWaveform {...props} />);
  return { ...result, onSeek };
}

/** 波形コンテナ（クリックでシークする要素） */
function getWaveformSurface(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[role="presentation"]');
  if (!el) throw new Error('waveform surface not found');
  return el as HTMLElement;
}

function touchPointer(
  surface: HTMLElement,
  phase: 'down' | 'move' | 'up' | 'cancel' | 'lostcapture',
  clientX: number,
  clientY: number,
  overrides: Partial<PointerEventInit> = {},
) {
  const options: PointerEventInit = {
    pointerType: 'touch',
    pointerId: 1,
    isPrimary: true,
    clientX,
    clientY,
    button: 0,
    buttons: phase === 'up' || phase === 'cancel' ? 0 : 1,
    ...overrides,
  };
  if (phase === 'lostcapture') {
    fireEvent.lostPointerCapture(surface, options);
  } else if (phase === 'down') {
    fireEvent.pointerDown(surface, options);
  } else if (phase === 'move') {
    fireEvent.pointerMove(surface, options);
  } else if (phase === 'up') {
    fireEvent.pointerUp(surface, options);
  } else {
    fireEvent.pointerCancel(surface, options);
  }
}

beforeEach(() => {
  // jsdom は getBoundingClientRect が常にゼロなので、幅を持つ要素として振る舞わせる
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: CONTAINER_WIDTH,
    bottom: 48,
    width: CONTAINER_WIDTH,
    height: 48,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('TimelineWaveform の時間軸', () => {
  it('波形クリック位置がシークバーと同じ比率で時刻へ変換される', () => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);

    // 左端 → 0 秒（シークバーの min と一致）
    fireEvent.pointerDown(surface, { clientX: 0 });
    expect(onSeek).toHaveBeenLastCalledWith(0);

    // 中央 → 全長の半分
    fireEvent.pointerDown(surface, { clientX: CONTAINER_WIDTH / 2 });
    expect(onSeek).toHaveBeenLastCalledWith(TOTAL_DURATION / 2);

    // 右端 → 全長（シークバーの max と一致）
    fireEvent.pointerDown(surface, { clientX: CONTAINER_WIDTH });
    expect(onSeek).toHaveBeenLastCalledWith(TOTAL_DURATION);
  });

  it('コンテナ外へはみ出したクリックを 0〜全長へ丸める', () => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);

    fireEvent.pointerDown(surface, { clientX: -50 });
    expect(onSeek).toHaveBeenLastCalledWith(0);

    fireEvent.pointerDown(surface, { clientX: CONTAINER_WIDTH + 200 });
    expect(onSeek).toHaveBeenLastCalledWith(TOTAL_DURATION);
  });

  it('現在位置マーカーがシークバーのつまみと同じ百分率に置かれる', () => {
    // シークバー側は left: calc(percent% - 10px) で中心を合わせる。
    // 波形側も resolveTimelinePlayheadPercent の同じ百分率に置く。
    renderWaveform({ currentTime: 2.5 });
    const marker = screen.getByTestId('timeline-playhead');
    expect(marker.style.left).toBe('25%');
  });

  it('プロジェクト尺が変わると同じ x 座標が別の時刻になる', () => {
    const { container, onSeek } = renderWaveform({ totalDuration: 20 });
    fireEvent.pointerDown(getWaveformSurface(container), { clientX: CONTAINER_WIDTH / 2 });
    expect(onSeek).toHaveBeenLastCalledWith(10);
  });
});

describe('TimelineWaveform のスクロール誤操作防止（Issue #233）', () => {
  it('指を置いた時点ではシークせず、短いタップの終了時に一度だけ移動する', () => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);

    touchPointer(surface, 'down', 250, 20);
    expect(onSeek).not.toHaveBeenCalled();

    touchPointer(surface, 'up', 250, 20);
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(5);
  });

  it('15px以内の指ぶれでは保留を維持し、離した時点でタップを反映する', () => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);

    touchPointer(surface, 'down', 250, 20);
    touchPointer(surface, 'move', 265, 22);
    expect(onSeek).not.toHaveBeenCalled();

    touchPointer(surface, 'up', 265, 22);
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek.mock.calls[0][0]).toBeCloseTo(5.3);
  });

  it.each([40, -40])('縦スクロール（移動量 %ipx）は途中も指を離した後もシークしない', (dy) => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);

    touchPointer(surface, 'down', 250, 100);
    expect(onSeek).not.toHaveBeenCalled();
    touchPointer(surface, 'move', 255, 100 + dy);
    expect(onSeek).not.toHaveBeenCalled();
    touchPointer(surface, 'up', 255, 100 + dy);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('縦スクロールと確定した後に横へ大きく動いてもシークへ切り替えない', () => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);

    touchPointer(surface, 'down', 100, 20);
    touchPointer(surface, 'move', 102, 60);
    expect(onSeek).not.toHaveBeenCalled();
    touchPointer(surface, 'move', 400, 62);
    touchPointer(surface, 'up', 400, 62);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('moveが届かず離す時点で縦移動が判明した場合もシークしない', () => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);

    touchPointer(surface, 'down', 250, 20);
    touchPointer(surface, 'up', 252, 60);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('横シークと判定された後は移動中と終了時の位置を反映する', () => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);

    touchPointer(surface, 'down', 100, 20);
    touchPointer(surface, 'move', 110, 21);
    expect(onSeek).not.toHaveBeenCalled();
    touchPointer(surface, 'move', 150, 22);
    expect(onSeek).toHaveBeenLastCalledWith(3);
    touchPointer(surface, 'move', 250, 23);
    expect(onSeek).toHaveBeenLastCalledWith(5);
    touchPointer(surface, 'up', 300, 23);
    expect(onSeek).toHaveBeenLastCalledWith(6);
  });

  it('横と縦の移動量が等しいときは既存のシークバーと同じく横操作と判定する', () => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);

    touchPointer(surface, 'down', 100, 20);
    touchPointer(surface, 'move', 120, 40);
    expect(onSeek).toHaveBeenLastCalledWith(2.4);
    touchPointer(surface, 'up', 150, 70);
    expect(onSeek).toHaveBeenLastCalledWith(3);
  });

  it('横シーク確定後に縦方向へ指がぶれてもシークを継続する', () => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);

    touchPointer(surface, 'down', 100, 20);
    touchPointer(surface, 'move', 130, 22);
    expect(onSeek).toHaveBeenLastCalledWith(2.6);
    touchPointer(surface, 'move', 150, 100);
    expect(onSeek).toHaveBeenLastCalledWith(3);
    touchPointer(surface, 'up', 200, 150);
    expect(onSeek).toHaveBeenLastCalledWith(4);
  });

  it.each(['cancel', 'lostcapture'] as const)('%sで中断したタッチを後続のupで反映しない', (phase) => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);

    touchPointer(surface, 'down', 250, 20);
    touchPointer(surface, phase, 250, 20);
    touchPointer(surface, 'up', 250, 20);
    expect(onSeek).not.toHaveBeenCalled();

    // 中断後の新しいタップは受け付ける。
    touchPointer(surface, 'down', 100, 20);
    touchPointer(surface, 'up', 100, 20);
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(2);
  });

  it('canvasから親へcaptureを移す際の子要素のlostcaptureで横ドラッグを中断しない', () => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);
    const canvas = surface.querySelector('canvas')!;
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperties(surface, {
      setPointerCapture: { value: setPointerCapture, configurable: true },
      releasePointerCapture: { value: releasePointerCapture, configurable: true },
      hasPointerCapture: { value: () => true, configurable: true },
    });

    // 実際のタッチはcanvasに暗黙captureされ、横操作の確定時に親がcaptureを引き継ぐ。
    touchPointer(canvas, 'down', 100, 20);
    touchPointer(surface, 'move', 150, 22);
    expect(onSeek).toHaveBeenLastCalledWith(3);
    expect(setPointerCapture).toHaveBeenCalledWith(1);

    // canvasのcapture喪失が親へbubbleしても、親のドラッグは継続する。
    touchPointer(canvas, 'lostcapture', 150, 22);
    touchPointer(surface, 'move', 250, 23);
    expect(onSeek).toHaveBeenLastCalledWith(5);
    expect(releasePointerCapture).not.toHaveBeenCalled();
    touchPointer(surface, 'up', 300, 23);
    expect(onSeek).toHaveBeenLastCalledWith(6);
    expect(releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it('操作途中でdisabledになったときは保留したタップを破棄する', () => {
    const { container, onSeek, rerender } = renderWaveform();
    const surface = getWaveformSurface(container);
    const props = {
      waveform: readyData(), totalDuration: TOTAL_DURATION, currentTime: 0, enabled: true, onSeek,
    };

    touchPointer(surface, 'down', 250, 20);
    rerender(<TimelineWaveform {...props} disabled />);
    rerender(<TimelineWaveform {...props} disabled={false} />);
    touchPointer(surface, 'up', 250, 20);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('追加の指が触れたら単独タップを破棄し、二本指操作でシークしない', () => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);

    touchPointer(surface, 'down', 250, 20);
    touchPointer(surface, 'down', 300, 20, { pointerId: 2, isPrimary: false });
    touchPointer(surface, 'move', 400, 20, { pointerId: 2, isPrimary: false });
    touchPointer(surface, 'up', 400, 20, { pointerId: 2, isPrimary: false });
    touchPointer(surface, 'up', 250, 20);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('開始した指と別のpointerIdによるmove/upをシークへ反映しない', () => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);

    touchPointer(surface, 'down', 250, 20);
    touchPointer(surface, 'move', 400, 20, { pointerId: 2, isPrimary: false });
    touchPointer(surface, 'up', 400, 20, { pointerId: 2, isPrimary: false });
    expect(onSeek).not.toHaveBeenCalled();
    touchPointer(surface, 'up', 250, 20);
    expect(onSeek).toHaveBeenCalledWith(5);
  });

  it('波形の外へ横ドラッグしてもpointer captureを保ち、0〜全長に丸める', () => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperties(surface, {
      setPointerCapture: { value: setPointerCapture, configurable: true },
      releasePointerCapture: { value: releasePointerCapture, configurable: true },
      hasPointerCapture: { value: () => true, configurable: true },
    });

    touchPointer(surface, 'down', 250, 20);
    touchPointer(surface, 'move', -100, 21);
    expect(setPointerCapture).toHaveBeenCalledWith(1);
    expect(onSeek).toHaveBeenLastCalledWith(0);
    touchPointer(surface, 'move', 700, 22);
    expect(onSeek).toHaveBeenLastCalledWith(TOTAL_DURATION);
    touchPointer(surface, 'up', 700, 22);
    expect(onSeek).toHaveBeenLastCalledWith(TOTAL_DURATION);
  });

  it('マウスは押した位置へ即座にシークし、ドラッグ中と終了時も位置を反映する', () => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);
    const mouse = { pointerType: 'mouse', pointerId: 3, isPrimary: true, button: 0 };

    fireEvent.pointerDown(surface, { ...mouse, buttons: 1, clientX: 100, clientY: 20 });
    expect(onSeek).toHaveBeenLastCalledWith(2);
    fireEvent.pointerMove(surface, { ...mouse, buttons: 1, clientX: 250, clientY: 20 });
    expect(onSeek).toHaveBeenLastCalledWith(5);
    fireEvent.pointerUp(surface, { ...mouse, buttons: 0, clientX: 400, clientY: 20 });
    expect(onSeek).toHaveBeenLastCalledWith(8);
  });

  it('縦スクロールとピンチ操作を許可し、タッチイベントの既定動作を妨げない', () => {
    const { container, onSeek } = renderWaveform();
    const surface = getWaveformSurface(container);
    const down = createEvent.pointerDown(surface, {
      pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 250, clientY: 20, cancelable: true,
    });
    const move = createEvent.pointerMove(surface, {
      pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 252, clientY: 60, cancelable: true,
    });
    fireEvent(surface, down);
    fireEvent(surface, move);
    expect(surface.style.touchAction).toBe('pan-y pinch-zoom');
    expect(down.defaultPrevented).toBe(false);
    expect(move.defaultPrevented).toBe(false);
    expect(onSeek).not.toHaveBeenCalled();
  });
});

describe('TimelineWaveform の無音区間ナビゲーション', () => {
  it('「無音区間：次へ」で現在位置より後ろの最も近い境界へ移動する', () => {
    const { onSeek } = renderWaveform({ currentTime: 0 });
    fireEvent.click(screen.getByRole('button', { name: '無音区間：次へ' }));
    expect(onSeek).toHaveBeenCalledWith(2);
  });

  it('「無音区間：前へ」で現在位置より前の最も近い境界へ移動する', () => {
    const { onSeek } = renderWaveform({ currentTime: 8 });
    fireEvent.click(screen.getByRole('button', { name: '無音区間：前へ' }));
    expect(onSeek).toHaveBeenCalledWith(7);
  });

  it('動画の先頭（0秒）へ戻れる', () => {
    // 1つ目のキャプションを動画の先頭から始めたいケース。
    // 最初の無音区間より手前に居るとき、「前へ」で 0 秒へ戻る。
    const { onSeek } = renderWaveform({ currentTime: 1 });
    fireEvent.click(screen.getByRole('button', { name: '無音区間：前へ' }));
    expect(onSeek).toHaveBeenCalledWith(0);
  });

  it('動画の末尾へ進める', () => {
    const { onSeek } = renderWaveform({ currentTime: 8 });
    fireEvent.click(screen.getByRole('button', { name: '無音区間：次へ' }));
    expect(onSeek).toHaveBeenCalledWith(TOTAL_DURATION);
  });

  it('「無音開始へ」「無音終了へ」ボタンは表示しない', () => {
    renderWaveform();
    expect(screen.queryByRole('button', { name: /無音開始へ/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /無音終了へ/ })).not.toBeInTheDocument();
  });

  it('端では移動ボタンが無効になる', () => {
    const { rerender } = renderWaveform({ currentTime: 0 });
    expect(screen.getByRole('button', { name: '無音区間：前へ' })).toBeDisabled();

    rerender(
      <TimelineWaveform
        waveform={readyData()}
        totalDuration={TOTAL_DURATION}
        currentTime={TOTAL_DURATION}
        enabled
        disabled={false}
        onSeek={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '無音区間：次へ' })).toBeDisabled();
  });

  it('無音検出の対象と件数を表示する', () => {
    renderWaveform();
    expect(screen.getByText(/ナレーション基準・2件/)).toBeInTheDocument();
  });

  it('動画音声を基準にしたときはその旨を表示する（動画だけのプロジェクト）', () => {
    renderWaveform({ waveform: readyData({ resolvedSilenceSource: 'video' }) });
    expect(screen.getByText(/動画音声基準・2件/)).toBeInTheDocument();
  });

  it('無音区間が無くても先頭・末尾へは移動できる', () => {
    const { onSeek } = renderWaveform({
      waveform: readyData({ silences: [] }),
      currentTime: 5,
    });

    expect(screen.getByText(/無音区間は検出されていません/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '無音区間：前へ' }));
    expect(onSeek).toHaveBeenLastCalledWith(0);

    fireEvent.click(screen.getByRole('button', { name: '無音区間：次へ' }));
    expect(onSeek).toHaveBeenLastCalledWith(TOTAL_DURATION);
  });
});

describe('TimelineWaveform の表示条件', () => {
  it('enabled=false では何も描かない（iOS など波形非対応環境）', () => {
    const { container } = renderWaveform({ enabled: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('デコード不能（error）では何も描かず、シークバーだけを残す', () => {
    const { container } = renderWaveform({
      waveform: readyData({ status: 'error', peaks: null, silences: [] }),
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('解析中は波形を出さず、プレビュー操作を妨げない案内だけを出す', () => {
    renderWaveform({ waveform: readyData({ status: 'loading', peaks: null, silences: [] }) });
    expect(screen.getByText('音量波形を解析中…')).toBeInTheDocument();
  });

  it('再生成中も直前の波形を出したままにする（チラつき防止）', () => {
    const { container } = renderWaveform({ waveform: readyData({ status: 'loading' }) });
    expect(getWaveformSurface(container)).toBeInTheDocument();
    expect(screen.getByText('解析中…')).toBeInTheDocument();
  });

  it('書き出し中（disabled）はクリックシークもボタン操作も受け付けない', () => {
    const { container, onSeek } = renderWaveform({ disabled: true, currentTime: 5 });

    fireEvent.pointerDown(getWaveformSurface(container), { clientX: CONTAINER_WIDTH / 2 });
    expect(onSeek).not.toHaveBeenCalled();

    expect(screen.getByRole('button', { name: '無音区間：次へ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '無音区間：前へ' })).toBeDisabled();
  });
});
