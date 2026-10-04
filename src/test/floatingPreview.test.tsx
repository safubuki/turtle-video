import React, { StrictMode } from 'react';
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PreviewSection from '../components/sections/PreviewSection';
import type { MediaItem } from '../types';

type Props = React.ComponentProps<typeof PreviewSection>;
const media: MediaItem = {
  id: 'image',
  file: new File(['image'], 'sample.png', { type: 'image/png' }),
  type: 'image',
  url: 'blob:sample',
  duration: 5,
  originalDuration: 5,
  trimStart: 0,
  trimEnd: 5,
  volume: 1,
  isMuted: false,
  fadeIn: false,
  fadeOut: false,
  fadeInDuration: 0,
  fadeOutDuration: 0,
  scale: 1,
  positionX: 0,
  positionY: 0,
  isTransformOpen: false,
  isLocked: false,
};

function fixture(overrides: Partial<Props> = {}): Props {
  return {
    appFlavor: 'standard',
    supportsShowSaveFilePicker: false,
    mediaItems: [media],
    bgm: null,
    narrations: [],
    canvasRef: React.createRef<HTMLCanvasElement>(),
    currentTime: 1,
    totalDuration: 5,
    isPlaying: false,
    isProcessing: false,
    isLoading: false,
    exportPreparationStep: null,
    exportUrl: null,
    exportExt: null,
    onSeekChange: vi.fn(),
    onSeekStart: vi.fn(),
    onSeekEnd: vi.fn(),
    onSeekToTime: vi.fn(),
    onTogglePlay: vi.fn(),
    onStop: vi.fn(),
    onDismissFloatingPreview: vi.fn(),
    onExport: vi.fn(),
    onDownload: vi.fn(),
    onClearAll: vi.fn(),
    onCapture: vi.fn(),
    onOpenHelp: vi.fn(),
    formatTime: (seconds) => `${seconds}s`,
    supportsTimelineWaveform: false,
    timelineWaveform: {
      status: 'idle',
      peaks: null,
      silences: [],
      resolvedSilenceSource: 'all',
      duration: 0,
    },
    projectPosterMode: 'auto',
    projectPosterTimelineTime: 0,
    projectPosterDataUrl: null,
    projectPosterAspectRatio: 'landscape',
    onSetProjectPosterFromCurrent: vi.fn(),
    onResetProjectPosterToAuto: vi.fn(),
    supportsCaptionLayerExport: true,
    exportOutputOptions: {
      contentMode: 'composite',
      captionLayerFormat: 'black-matte-mp4',
      includeSubtitles: true,
      subtitleFormats: ['srt', 'vtt'],
    },
    onExportOutputOptionsChange: vi.fn(),
    ...overrides,
  };
}

const observers: MockIntersectionObserver[] = [];
const originalResizeObserver = window.ResizeObserver;
class MockIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(private callback: IntersectionObserverCallback) {
    observers.push(this);
  }
  emit(visible: boolean) {
    act(() =>
      this.callback(
        [
          {
            isIntersecting: visible,
            intersectionRatio: visible ? 1 : 0,
          } as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver
      )
    );
  }
}
let mobile = true;
let mediaQueryListener: (() => void) | undefined;
const setMobile = (value: boolean) =>
  act(() => {
    mobile = value;
    mediaQueryListener?.();
  });
const latestObserver = () => observers[observers.length - 1];
const open = () => fireEvent.click(screen.getByRole('button', { name: 'ミニプレビューを開く' }));

beforeEach(() => {
  mobile = true;
  mediaQueryListener = undefined;
  observers.length = 0;
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === '(max-width: 1023px)' && mobile;
    },
    media: query,
    addEventListener: (_event: string, listener: () => void) => {
      mediaQueryListener = listener;
    },
    removeEventListener: () => {},
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.ResizeObserver = originalResizeObserver;
});

describe('Issue #236 追従プレビュー', () => {
  it('通常映像が画面内なら補助UIはなく、画面外になったときだけボタンを表示する', () => {
    render(<PreviewSection {...fixture()} />);
    expect(screen.queryByRole('button', { name: 'ミニプレビューを開く' })).toBeNull();
    expect(latestObserver().observe).toHaveBeenCalledWith(
      screen.getByTestId('normal-preview-canvas')
    );
    latestObserver().emit(false);
    expect(screen.getByRole('button', { name: 'ミニプレビューを開く' })).toBeVisible();
    expect(screen.queryByRole('complementary', { name: 'ミニプレビュー' })).toBeNull();
  });

  it('開閉を繰り返しても Canvas と解像度を保持し、映像コピーや再生要素を追加しない', () => {
    const props = fixture();
    const { unmount } = render(
      <StrictMode>
        <PreviewSection {...props} />
      </StrictMode>
    );
    const canvas = props.canvasRef.current!;
    const width = vi.spyOn(canvas, 'width', 'set');
    const height = vi.spyOn(canvas, 'height', 'set');
    const drawImage = vi.spyOn(canvas.getContext('2d')!, 'drawImage');
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const interval = vi.spyOn(window, 'setInterval');
    const timeout = vi.spyOn(window, 'setTimeout');
    latestObserver().emit(false);
    for (let index = 0; index < 3; index++) {
      open();
      expect(screen.getByTestId('floating-preview-canvas')).toContainElement(canvas);
      expect(props.canvasRef.current).toBe(canvas);
      expect(document.querySelectorAll('canvas')).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'ミニプレビューを閉じる' }));
      expect(screen.getByTestId('normal-preview-canvas')).toContainElement(canvas);
    }
    expect(width).not.toHaveBeenCalled();
    expect(height).not.toHaveBeenCalled();
    expect(drawImage).not.toHaveBeenCalled();
    expect(raf).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    // React のフォーカス復元は setTimeout(0) を使う。再生用の周期／遅延タイマーは増えない。
    expect(timeout.mock.calls.filter(([, delay]) => Number(delay) > 0)).toEqual([]);
    expect(document.querySelectorAll('video, audio')).toHaveLength(0);
    unmount();
    expect(props.canvasRef.current).toBeNull();
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
    expect(observers.every((observer) => observer.disconnect.mock.calls.length > 0)).toBe(true);
  });

  it('通常映像が見える間だけミニを隠し、画面外へ戻ると同じCanvasで自動復元して編集フォーカスを保つ', () => {
    const props = fixture({ isPlaying: true });
    render(<><input aria-label="編集中の入力" /><PreviewSection {...props} /></>);
    const canvas = props.canvasRef.current!;
    const width = vi.spyOn(canvas, 'width', 'set');
    const height = vi.spyOn(canvas, 'height', 'set');
    const drawImage = vi.spyOn(canvas.getContext('2d')!, 'drawImage');
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const interval = vi.spyOn(window, 'setInterval');
    latestObserver().emit(false);
    open();
    for (let index = 0; index < 3; index++) {
      latestObserver().emit(true);
      expect(screen.queryByRole('complementary', { name: 'ミニプレビュー' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'ミニプレビューを開く' })).toBeNull();
      expect(screen.getByTestId('normal-preview-canvas')).toContainElement(canvas);
      const input = screen.getByRole('textbox', { name: '編集中の入力' });
      input.focus({ preventScroll: true });
      latestObserver().emit(false);
      expect(screen.getByRole('complementary', { name: 'ミニプレビュー' })).toBeVisible();
      expect(screen.queryByRole('button', { name: 'ミニプレビューを開く' })).toBeNull();
      expect(screen.getByTestId('floating-preview-canvas')).toContainElement(canvas);
      expect(props.canvasRef.current).toBe(canvas);
      expect(input).toHaveFocus();
    }
    expect(width).not.toHaveBeenCalled();
    expect(height).not.toHaveBeenCalled();
    expect(drawImage).not.toHaveBeenCalled();
    expect(raf).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
    expect(document.querySelectorAll('video, audio')).toHaveLength(0);
    expect(props.onDismissFloatingPreview).not.toHaveBeenCalled();
    expect(props.onStop).not.toHaveBeenCalled();
  });

  it.each(['standard', 'apple-safari'] as const)(
    '%s の export 開始で補助UIと監視を外し、完了／中断後は再度開ける',
    (appFlavor) => {
      const props = fixture({ appFlavor });
      const { rerender } = render(<PreviewSection {...props} />);
      latestObserver().emit(false);
      open();
      const canvas = props.canvasRef.current;
      const observer = latestObserver();
      rerender(<PreviewSection {...props} isProcessing />);
      expect(screen.queryByRole('complementary', { name: 'ミニプレビュー' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'ミニプレビューを開く' })).toBeNull();
      expect(screen.getByTestId('normal-preview-canvas')).toContainElement(canvas);
      expect(observer.disconnect).toHaveBeenCalledOnce();
      observer.emit(false); // disconnect 後に届いた古い通知も無視する。
      expect(props.onDismissFloatingPreview).not.toHaveBeenCalled();
      rerender(<PreviewSection {...props} />);
      latestObserver().emit(false);
      expect(screen.queryByRole('complementary', { name: 'ミニプレビュー' })).toBeNull();
      expect(screen.getByRole('button', { name: 'ミニプレビューを開く' })).toBeVisible();
      open();
      expect(screen.getByTestId('floating-preview-canvas')).toContainElement(canvas);
    }
  );

  it('export 開始で外れる途中のシークは終了コールバックから再生を復帰させない', () => {
    const props = fixture();
    const { rerender } = render(<PreviewSection {...props} />);
    latestObserver().emit(false);
    open();
    fireEvent.pointerDown(screen.getByRole('slider', { name: 'ミニプレビュー位置' }));
    expect(props.onSeekStart).toHaveBeenCalledOnce();
    rerender(<PreviewSection {...props} isProcessing />);
    expect(props.onSeekEnd).not.toHaveBeenCalled();
  });

  it('高速な export でも開始コールバックより前にミニを外して同じ Canvas を通常枠へ戻す', () => {
    const props = fixture();
    props.onExport = vi.fn(() => {
      expect(screen.queryByRole('complementary', { name: 'ミニプレビュー' })).toBeNull();
      expect(screen.getByTestId('normal-preview-canvas')).toContainElement(props.canvasRef.current);
      expect(props.onSeekEnd).not.toHaveBeenCalled();
    });
    render(<PreviewSection {...props} />);
    latestObserver().emit(false);
    open();
    fireEvent.pointerDown(screen.getByRole('slider', { name: 'ミニプレビュー位置' }));
    fireEvent.click(screen.getByRole('button', { name: '動画ファイルを作成' }));
    expect(props.onExport).toHaveBeenCalledOnce();
    expect(props.onDismissFloatingPreview).not.toHaveBeenCalled();
  });

  it('固定バーの実測高さと変更に追従し、export で高さ監視も解除する', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    let height = 215;
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => ({ height }) as DOMRect);
    let resize: (() => void) | undefined;
    const disconnect = vi.fn();
    window.ResizeObserver = class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    } as unknown as typeof ResizeObserver;
    const props = fixture({
      floatingPreviewBottomObstructionRef: { current: element },
      floatingPreviewBottomObstructionActive: true,
    });
    const { rerender } = render(<PreviewSection {...props} />);
    latestObserver().emit(false);
    expect(screen.getByRole('button', { name: 'ミニプレビューを開く' }).style.bottom).toContain(
      '215px'
    );
    open();
    height = 260;
    act(() => resize?.());
    expect(
      screen
        .getByRole('complementary', { name: 'ミニプレビュー' })
        .style.getPropertyValue('--floating-preview-offset')
    ).toBe('260px');
    rerender(<PreviewSection {...props} isProcessing />);
    expect(disconnect).toHaveBeenCalledOnce();
    element.remove();
  });

  it('通常枠で一時非表示の間も高速なexport操作で開いた意図を解除する', () => {
    const props = fixture();
    render(<PreviewSection {...props} />);
    const canvas = props.canvasRef.current;
    latestObserver().emit(false);
    open();
    latestObserver().emit(true);
    fireEvent.click(screen.getByRole('button', { name: '動画ファイルを作成' }));
    expect(props.onExport).toHaveBeenCalledOnce();
    expect(props.onDismissFloatingPreview).not.toHaveBeenCalled();
    latestObserver().emit(false);
    expect(screen.queryByRole('complementary', { name: 'ミニプレビュー' })).toBeNull();
    expect(screen.getByRole('button', { name: 'ミニプレビューを開く' })).toBeVisible();
    expect(screen.getByTestId('normal-preview-canvas')).toContainElement(canvas);
  });

  it('通常枠へ戻る途中のシークは終了させ、手動停止を呼ばない', () => {
    const props = fixture();
    render(<PreviewSection {...props} />);
    latestObserver().emit(false);
    open();
    fireEvent.pointerDown(screen.getByRole('slider', { name: 'ミニプレビュー位置' }));
    latestObserver().emit(true);
    expect(props.onSeekEnd).toHaveBeenCalledOnce();
    expect(props.onDismissFloatingPreview).not.toHaveBeenCalled();
  });

  it('手動クローズ／Escapeは共有再生を一時停止し、スクロールせずボタンへフォーカスを戻す', () => {
    const props = fixture();
    render(<PreviewSection {...props} />);
    latestObserver().emit(false);
    const scroll = vi.spyOn(window, 'scrollTo');
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    open();
    expect(screen.getByRole('button', { name: 'ミニプレビューを閉じる' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onDismissFloatingPreview).toHaveBeenCalledOnce();
    expect(props.onStop).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'ミニプレビューを開く' })).toHaveFocus();
    expect(scroll).not.toHaveBeenCalled();
    expect(focus.mock.calls.every(([options]) => options?.preventScroll === true)).toBe(true);
    latestObserver().emit(true);
    latestObserver().emit(false);
    expect(screen.queryByRole('complementary', { name: 'ミニプレビュー' })).toBeNull();
    expect(screen.getByRole('button', { name: 'ミニプレビューを開く' })).toBeVisible();
  });

  it('PC幅／モーダル／素材削除では閉じて監視を解除する', () => {
    const props = fixture();
    const { rerender } = render(<PreviewSection {...props} />);
    latestObserver().emit(false);
    open();
    latestObserver().emit(true);
    setMobile(false);
    expect(screen.queryByRole('complementary', { name: 'ミニプレビュー' })).toBeNull();
    expect(latestObserver().disconnect).toHaveBeenCalledOnce();
    setMobile(true);
    latestObserver().emit(false);
    expect(screen.queryByRole('complementary', { name: 'ミニプレビュー' })).toBeNull();
    open();
    rerender(<PreviewSection {...props} floatingPreviewBlocked />);
    expect(screen.queryByRole('complementary', { name: 'ミニプレビュー' })).toBeNull();
    rerender(<PreviewSection {...props} mediaItems={[]} totalDuration={0} />);
    expect(screen.queryByRole('button', { name: 'ミニプレビューを開く' })).toBeNull();
  });

  it.each([
    ['書き出し', { isProcessing: true }],
    ['モーダル', { floatingPreviewBlocked: true }],
    ['素材消失', { mediaItems: [], totalDuration: 0 }],
  ] satisfies [string, Partial<Props>][])(
    '通常映像で一時非表示の間でも%sで開いた意図を解除する',
    (_label, disabled) => {
      const props = fixture();
      const { rerender } = render(<PreviewSection {...props} />);
      latestObserver().emit(false);
      open();
      latestObserver().emit(true);
      rerender(<PreviewSection {...props} {...disabled} />);
      rerender(<PreviewSection {...props} />);
      latestObserver().emit(false);
      expect(screen.queryByRole('complementary', { name: 'ミニプレビュー' })).toBeNull();
      expect(screen.getByRole('button', { name: 'ミニプレビューを開く' })).toBeVisible();
    }
  );

  it('バックグラウンドでは補助UIを取り外し、復帰時に自動で開かない', () => {
    render(<PreviewSection {...fixture()} />);
    latestObserver().emit(false);
    open();
    latestObserver().emit(true);
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.queryByRole('complementary', { name: 'ミニプレビュー' })).toBeNull();
    visibility.mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    latestObserver().emit(false);
    expect(screen.getByRole('button', { name: 'ミニプレビューを開く' })).toBeVisible();
    expect(screen.queryByRole('complementary', { name: 'ミニプレビュー' })).toBeNull();
  });

  it('IntersectionObserver 未対応環境は従来の通常プレビューへフォールバックする', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const props = fixture();
    render(<PreviewSection {...props} />);
    expect(screen.getByTestId('normal-preview-canvas')).toContainElement(props.canvasRef.current);
    expect(screen.queryByRole('button', { name: 'ミニプレビューを開く' })).toBeNull();
  });

  it('再生・停止を既存コールバックへ渡し、更新された現在位置と再生状態を共有する', () => {
    const props = fixture();
    const { rerender } = render(<PreviewSection {...props} />);
    latestObserver().emit(false);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'ミニプレビューを再生' }));
    expect(props.onTogglePlay).toHaveBeenCalledOnce();
    rerender(<PreviewSection {...props} isPlaying currentTime={2.35} />);
    expect(screen.getByRole('slider', { name: 'ミニプレビュー位置' })).toHaveValue('2.35');
    fireEvent.click(screen.getByRole('button', { name: 'ミニプレビューを一時停止' }));
    expect(props.onTogglePlay).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'ミニプレビューを停止' }));
    expect(props.onStop).toHaveBeenCalledOnce();
  });

  it('±5秒は相対コールバックを使い、先頭／末尾で無効になる', () => {
    const onSeekBy = vi.fn();
    const props = fixture({ onSeekBy });
    const { rerender } = render(<PreviewSection {...props} />);
    latestObserver().emit(false);
    open();
    fireEvent.click(screen.getByRole('button', { name: '5秒戻る' }));
    fireEvent.click(screen.getByRole('button', { name: '5秒進む' }));
    expect(onSeekBy.mock.calls).toEqual([[-5], [5]]);
    rerender(<PreviewSection {...props} currentTime={0} />);
    expect(screen.getByRole('button', { name: '5秒戻る' })).toBeDisabled();
    rerender(<PreviewSection {...props} currentTime={5} />);
    expect(screen.getByRole('button', { name: '5秒進む' })).toBeDisabled();
  });

  it('相対コールバック省略時も5秒ずつ移動し、短い動画では先頭／末尾へ制限する', () => {
    const props = fixture({ currentTime: 8, totalDuration: 20 });
    const { rerender } = render(<PreviewSection {...props} />);
    latestObserver().emit(false);
    open();
    fireEvent.click(screen.getByRole('button', { name: '5秒戻る' }));
    fireEvent.click(screen.getByRole('button', { name: '5秒進む' }));
    expect(vi.mocked(props.onSeekToTime).mock.calls).toEqual([[3], [13]]);
    vi.mocked(props.onSeekToTime).mockClear();
    rerender(<PreviewSection {...props} currentTime={1} totalDuration={4.5} />);
    fireEvent.click(screen.getByRole('button', { name: '5秒戻る' }));
    fireEvent.click(screen.getByRole('button', { name: '5秒進む' }));
    expect(vi.mocked(props.onSeekToTime).mock.calls).toEqual([[0], [4.5]]);
  });

  it('mini の縦スワイプでは再生位置を一度も変更せず、短いタップは start/change/end 順に確定する', () => {
    const calls: string[] = [];
    const props = fixture({
      onSeekStart: vi.fn(() => calls.push('start')),
      onSeekChange: vi.fn((event) => calls.push(`change:${event.target.value}`)),
      onSeekEnd: vi.fn(() => calls.push('end')),
    });
    render(<PreviewSection {...props} />);
    latestObserver().emit(false);
    open();
    const slider = screen.getByRole('slider', { name: 'ミニプレビュー位置' });
    const pointer = () => {
      const event = createEvent.pointerDown(slider, {
        pointerType: 'touch',
        clientX: 30,
        clientY: 30,
        isPrimary: true,
      });
      fireEvent(slider, event);
    };
    pointer();
    fireEvent.change(slider, { target: { value: '3' } });
    fireEvent.touchStart(slider, { touches: [{ identifier: 1, clientX: 30, clientY: 30 }] });
    fireEvent.touchMove(slider, { touches: [{ identifier: 1, clientX: 31, clientY: 90 }] });
    fireEvent.change(slider, { target: { value: '4' } });
    fireEvent.touchEnd(slider, { touches: [] });
    expect(props.onSeekStart).not.toHaveBeenCalled();
    expect(props.onSeekChange).not.toHaveBeenCalled();
    calls.length = 0;
    pointer();
    fireEvent.change(slider, { target: { value: '2' } });
    fireEvent.touchStart(slider, { touches: [{ identifier: 1, clientX: 30, clientY: 30 }] });
    expect(calls).toEqual([]);
    fireEvent.touchEnd(slider, { touches: [] });
    expect(calls).toEqual(['start', 'change:2', 'end']);
    expect(slider.style.touchAction).toBe('pan-y pinch-zoom');
  });
});
