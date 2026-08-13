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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
