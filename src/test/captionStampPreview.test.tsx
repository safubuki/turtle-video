/** タイミング打ち中だけ、時刻を確定したキャプションをプレビューへ渡す（Issue #237）。 */
import { useState, type ComponentProps, type Dispatch, type SetStateAction } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CaptionSection from '../components/sections/CaptionSection';
import { PlatformCapabilitiesProvider } from '../app/PlatformCapabilitiesContext';
import type { Caption } from '../types';
import { getPlatformCapabilities } from '../utils/platform';
import { DEFAULT_VIDEO_TITLE_SETTINGS } from '../utils/videoTitle';

vi.mock('../components/common/CaptionMiniPreview', () => ({
  default: () => <div data-testid="caption-mini-preview-mock" />,
  PORTRAIT_MINI_PREVIEW_MAX_WIDTH_CLASS: 'max-w-[clamp(12rem,24dvh,18rem)]',
}));

const initialCaptions: Caption[] = [
  { id: 'c1', text: '1つ目', startTime: 0, endTime: 2, fadeIn: false, fadeOut: false, fadeInDuration: 0.5, fadeOutDuration: 0.5 },
  { id: 'c2', text: '2つ目', startTime: 3, endTime: 5, fadeIn: false, fadeOut: false, fadeInDuration: 0.5, fadeOutDuration: 0.5 },
  { id: 'c3', text: '3つ目', startTime: 6, endTime: 8, fadeIn: false, fadeOut: false, fadeInDuration: 0.5, fadeOutDuration: 0.5 },
];

type SectionProps = ComponentProps<typeof CaptionSection>;

function renderStampSection(overrides: Partial<SectionProps> = {}) {
  let updateCaptions: Dispatch<SetStateAction<Caption[]>>;
  const onStampPreviewChange = vi.fn<(ids: ReadonlySet<string> | null) => void>();
  const onStampHoldOpenChange = vi.fn<(captionId: string | null) => void>();
  const onUpdateCaptionLive = vi.fn((id: string, updates: Partial<Omit<Caption, 'id'>>) => {
    updateCaptions((items) => items.map((caption) => caption.id === id ? { ...caption, ...updates } : caption));
  });
  const baseProps: SectionProps = {
    captions: initialCaptions,
    settings: {
      enabled: true, fontSize: 'medium', fontStyle: 'gothic', fontColor: '#FFFFFF', strokeColor: '#000000',
      strokeWidth: 2, position: 'bottom', blur: 0, backgroundEnabled: false, backgroundColor: '#000000',
      backgroundOpacity: 0.45, backgroundRadius: 16, bulkFadeIn: false, bulkFadeOut: false,
      bulkFadeInDuration: 0.5, bulkFadeOutDuration: 0.5,
    },
    videoTitle: { ...DEFAULT_VIDEO_TITLE_SETTINGS },
    isLocked: false, totalDuration: 12, currentTime: 1, defaultOpen: true,
    onToggleLock: vi.fn(), onAddCaption: vi.fn(), onUpdateCaption: vi.fn(), onRemoveCaption: vi.fn(),
    onMoveCaption: vi.fn(), onClearAllCaptions: vi.fn(), onSetEnabled: vi.fn(), onSetFontSize: vi.fn(),
    onSetFontStyle: vi.fn(), onSetTextAlign: vi.fn(), onSetFontColor: vi.fn(), onSetStrokeColor: vi.fn(),
    onSetStrokeWidth: vi.fn(), onSetPosition: vi.fn(), onSetBlur: vi.fn(), onSetBackgroundEnabled: vi.fn(),
    onSetBackgroundColor: vi.fn(), onSetBackgroundOpacity: vi.fn(), onSetBackgroundRadius: vi.fn(),
    onSetFontSizeCustom: vi.fn(), onSetPositionCustom: vi.fn(), onSetBulkFadeIn: vi.fn(), onSetBulkFadeOut: vi.fn(),
    onSetBulkFadeInDuration: vi.fn(), onSetBulkFadeOutDuration: vi.fn(), onOpenHelp: vi.fn(),
    formatTime: (seconds) => `${seconds.toFixed(1)}s`, onApplyCaptions: vi.fn(), onShiftCaptions: vi.fn(),
    isPlaying: false, onTogglePlay: vi.fn(), onSeekBy: vi.fn(), onSeekToSilenceBoundary: vi.fn(),
    hasPrevSilenceBoundary: false, hasNextSilenceBoundary: false, onUpdateCaptionLive, onStampPreviewChange,
    onStampHoldOpenChange,
    onUpdateVideoTitle: vi.fn(), onSetVideoTitleRange: vi.fn(), onResetVideoTitle: vi.fn(),
    ...overrides,
  };
  let capabilities = {
    ...getPlatformCapabilities(), isIOS: false, isSafari: false, isIosSafari: false,
  };
  let runtimeProps: Partial<SectionProps> = {};

  function Harness({ sectionOverrides }: { sectionOverrides: Partial<SectionProps> }) {
    const [captions, setCaptions] = useState(() => baseProps.captions.map((caption) => ({ ...caption })));
    updateCaptions = setCaptions;
    return (
      <PlatformCapabilitiesProvider capabilities={capabilities}>
        <CaptionSection {...baseProps} {...sectionOverrides} captions={captions} />
        <output data-testid="caption-data">{JSON.stringify(captions)}</output>
      </PlatformCapabilitiesProvider>
    );
  }

  const result = render(<Harness sectionOverrides={runtimeProps} />);
  return {
    ...result,
    onStampPreviewChange,
    onStampHoldOpenChange,
    onUpdateCaptionLive,
    getCaptions: (): Caption[] => JSON.parse(screen.getByTestId('caption-data').textContent ?? '[]'),
    setCaptions: (captions: Caption[]) => act(() => updateCaptions(captions)),
    setProps: (updates: Partial<SectionProps>) => {
      runtimeProps = { ...runtimeProps, ...updates };
      result.rerender(<Harness sectionOverrides={runtimeProps} />);
    },
    setIosSafari: (isIosSafari: boolean) => {
      capabilities = { ...capabilities, isIOS: isIosSafari, isSafari: isIosSafari, isIosSafari };
      result.rerender(<Harness sectionOverrides={runtimeProps} />);
    },
    latestPreviewIds: () => onStampPreviewChange.mock.calls[onStampPreviewChange.mock.calls.length - 1]?.[0],
    latestHoldId: () => onStampHoldOpenChange.mock.calls[onStampHoldOpenChange.mock.calls.length - 1]?.[0],
  };
}

function enterStampMode() {
  fireEvent.click(screen.getByRole('button', { name: /② タイミング打ち/ }));
}

function expectPreviewIds(result: ReturnType<typeof renderStampSection>, ids: string[]) {
  const current = result.latestPreviewIds();
  expect(current).toBeInstanceOf(Set);
  expect([...current!].sort()).toEqual([...ids].sort());
}

const startButton = () => screen.getByRole('button', { name: /ここから開始/ });
const endButton = () => screen.getByRole('button', { name: /ここで終了/ });
const chainButton = () => screen.getByRole('button', { name: /区切って次へ/ });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('タイミング打ちのプレビュー表示制御', () => {
  it('開始直後は全件をプレビューから除外し、登録したテキストと時間は保持する', () => {
    const result = renderStampSection();
    enterStampMode();

    expectPreviewIds(result, []);
    expect(result.getCaptions()).toEqual(initialCaptions);
    for (const caption of initialCaptions) {
      expect(screen.getByTitle(caption.text)).toHaveTextContent(caption.text);
    }
    expect(result.onUpdateCaptionLive).not.toHaveBeenCalled();
  });

  it('交互の開始を確定するとそのIDだけ許可し、終了後も保持して次の未確定対象へ進む', () => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(startButton());

    expectPreviewIds(result, ['c1']);
    expect(result.getCaptions()[0]).toMatchObject({ startTime: 1, endTime: 2 });
    result.setProps({ currentTime: 2.2 });
    fireEvent.click(endButton());
    expectPreviewIds(result, ['c1']);
    expect(result.getCaptions()[0]).toMatchObject({ endTime: 2.2 });
    expect(startButton()).toBeInTheDocument();

    result.setProps({ currentTime: 3.2 });
    fireEvent.click(startButton());
    expectPreviewIds(result, ['c1', 'c2']);
    expect(result.getCaptions().map((caption) => caption.text)).toEqual(initialCaptions.map((caption) => caption.text));
  });

  it('連続の区切りは対象の終了と次の開始を同時に確定し、両方のIDを許可する', () => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(screen.getByRole('button', { name: '連続' }));
    expectPreviewIds(result, []);
    result.setProps({ currentTime: 2.2 });
    fireEvent.click(chainButton());

    expectPreviewIds(result, ['c1', 'c2']);
    expect(result.onUpdateCaptionLive).toHaveBeenCalledWith('c1', { endTime: 2.2 });
    expect(result.onUpdateCaptionLive).toHaveBeenCalledWith('c2', { startTime: 2.4 });
    expect(result.getCaptions()[1]).toMatchObject({ startTime: 2.4, endTime: 5 });
    expect(result.getCaptions()[2]).toEqual(initialCaptions[2]);

    result.setProps({ currentTime: 5.4 });
    fireEvent.click(chainButton());
    expectPreviewIds(result, ['c1', 'c2', 'c3']);
  });

  it('対象の移動・開始終了の切り替え・モードの切り替えだけではIDを許可しない', () => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(screen.getByTitle('次のキャプションへ'));
    fireEvent.click(screen.getByTitle(/開始\/終了を切り替える/));
    fireEvent.click(screen.getByRole('button', { name: '連続' }));
    fireEvent.click(screen.getByRole('button', { name: '交互' }));
    fireEvent.click(screen.getByTitle('前のキャプションへ'));

    expectPreviewIds(result, []);
    expect(result.onUpdateCaptionLive).not.toHaveBeenCalled();
    expect(result.getCaptions()).toEqual(initialCaptions);
  });

  it('既存の無効な開始・終了操作ではIDを増やさず、時間も変えない', () => {
    const result = renderStampSection();
    enterStampMode();
    result.setProps({ currentTime: 11.9 });
    fireEvent.click(startButton());
    expectPreviewIds(result, []);
    expect(result.onUpdateCaptionLive).not.toHaveBeenCalled();

    result.setProps({ currentTime: 0.1 });
    fireEvent.click(screen.getByTitle(/開始\/終了を切り替える/));
    fireEvent.click(endButton());
    expectPreviewIds(result, []);
    expect(result.onUpdateCaptionLive).not.toHaveBeenCalled();
    expect(result.getCaptions()).toEqual(initialCaptions);
  });

  it('無効な連続区切りでは対象も次のキャプションも許可しない', () => {
    const result = renderStampSection({ currentTime: 0.1 });
    enterStampMode();
    fireEvent.click(screen.getByRole('button', { name: '連続' }));
    fireEvent.click(chainButton());

    expectPreviewIds(result, []);
    expect(result.onUpdateCaptionLive).not.toHaveBeenCalled();
    expect(result.getCaptions()).toEqual(initialCaptions);
  });

  it.each(['step-button', 'close-button'] as const)('手動終了（%s）で通常のプレビューへ戻し、更新したデータを保持する', (exit) => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(startButton());
    const updated = result.getCaptions();
    if (exit === 'step-button') enterStampMode();
    else fireEvent.click(screen.getByTitle('タイミング打ちを終了'));

    expect(result.latestPreviewIds()).toBeNull();
    expect(screen.queryByTestId('caption-stamp-transport')).not.toBeInTheDocument();
    expect(result.getCaptions()).toEqual(updated);
  });

  it.each(['alternate', 'chain'] as const)('最終キャプションの完了（%s）で自動終了し、通常表示へ戻る', (mode) => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(screen.getByTitle('次のキャプションへ'));
    fireEvent.click(screen.getByTitle('次のキャプションへ'));
    if (mode === 'chain') {
      fireEvent.click(screen.getByRole('button', { name: '連続' }));
      result.setProps({ currentTime: 9 });
      fireEvent.click(chainButton());
    } else {
      result.setProps({ currentTime: 6.5 });
      fireEvent.click(startButton());
      result.setProps({ currentTime: 9 });
      fireEvent.click(endButton());
    }

    expect(result.latestPreviewIds()).toBeNull();
    expect(screen.queryByTestId('caption-stamp-transport')).not.toBeInTheDocument();
    expect(result.getCaptions()[2].endTime).toBe(9);
    expect(result.getCaptions()).toHaveLength(3);
  });

  it('再開始では前回の確定IDを持ち越さない', () => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(startButton());
    expectPreviewIds(result, ['c1']);
    fireEvent.click(screen.getByTitle('タイミング打ちを終了'));
    enterStampMode();

    expectPreviewIds(result, []);
    expect(result.getCaptions()[0].startTime).toBe(1);
  });

  it.each(['lock', 'export'] as const)('%sに切り替わるとモードを終了し、プレビュー制限を解除する', (state) => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(startButton());
    result.setProps(state === 'lock' ? { isLocked: true } : { isExporting: true });

    expect(result.latestPreviewIds()).toBeNull();
    expect(screen.queryByTestId('caption-stamp-transport')).not.toBeInTheDocument();
    expect(result.getCaptions()).toHaveLength(3);
    expect(result.getCaptions()[0].startTime).toBe(1);
  });

  it.each([0, 1])('一覧が%d件になって継続できなくなった場合は制限を解除する', (count) => {
    const result = renderStampSection();
    enterStampMode();
    result.setCaptions(initialCaptions.slice(0, count));

    expect(result.latestPreviewIds()).toBeNull();
    expect(screen.queryByTestId('caption-stamp-transport')).not.toBeInTheDocument();
    expect(result.getCaptions()).toEqual(initialCaptions.slice(0, count));
  });

  it('タイミング打ち非対応のplatformへ切り替わると制限を解除する', () => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(startButton());
    result.setIosSafari(true);

    expect(result.latestPreviewIds()).toBeNull();
    expect(screen.queryByTestId('caption-stamp-transport')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /② タイミング打ち/ })).not.toBeInTheDocument();
    expect(result.getCaptions()).toHaveLength(3);
  });

  it('対象のインデックスが一覧外になった場合はモードを終了する', () => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(screen.getByTitle('次のキャプションへ'));
    fireEvent.click(screen.getByTitle('次のキャプションへ'));
    result.setCaptions(initialCaptions.slice(0, 2));

    expect(result.latestPreviewIds()).toBeNull();
    expect(screen.queryByTestId('caption-stamp-transport')).not.toBeInTheDocument();
    expect(result.getCaptions()).toHaveLength(2);
  });

  it('コンポーネントを閉じると、親に残るプレビュー制限を解除する', () => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(startButton());
    result.unmount();

    expect(result.latestPreviewIds()).toBeNull();
  });

  it('通知先が変わっても確定IDを保持し、unmount時には最新の通知先だけへ解除を送る', () => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(startButton());
    const previousCallCount = result.onStampPreviewChange.mock.calls.length;
    const replacement = vi.fn<(ids: ReadonlySet<string> | null) => void>();
    result.setProps({ onStampPreviewChange: replacement });

    const latestIds = replacement.mock.calls[replacement.mock.calls.length - 1]?.[0];
    expect(latestIds).toBeInstanceOf(Set);
    expect([...latestIds!]).toEqual(['c1']);
    expect(result.onStampPreviewChange).toHaveBeenCalledTimes(previousCallCount);

    result.unmount();
    expect(replacement).toHaveBeenLastCalledWith(null);
    expect(result.onStampPreviewChange).toHaveBeenCalledTimes(previousCallCount);
  });
});

describe('タイミング打ちの終了確定前表示（Issue #247）', () => {
  it('開始確定までは延長せず、開始確定後は終了ボタンまで対象だけを延長する', () => {
    const result = renderStampSection();
    enterStampMode();
    expect(result.latestHoldId()).toBeNull();
    expect(result.getCaptions()[0]).toMatchObject({ startTime: 0, endTime: 2 });

    fireEvent.click(startButton());
    expect(result.latestHoldId()).toBe('c1');
    expect(result.getCaptions()[0]).toMatchObject({ startTime: 1, endTime: 2 });

    result.setProps({ currentTime: 5.2 });
    expect(result.latestHoldId()).toBe('c1');
    expect(result.getCaptions()[0].endTime).toBe(2);

    fireEvent.click(endButton());
    expect(result.latestHoldId()).toBeNull();
    expect(result.getCaptions()[0].endTime).toBe(5.2);
    expect(result.getCaptions()[1]).toMatchObject({ startTime: 3, endTime: 5 });
  });

  it('終了にできない位置では延長と元の終了時刻を維持する', () => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(startButton());
    result.setProps({ currentTime: 1 });
    fireEvent.click(endButton());

    expect(result.latestHoldId()).toBe('c1');
    expect(result.getCaptions()[0]).toMatchObject({ startTime: 1, endTime: 2 });
  });

  it('連続モードは区切りで開始が確定した次の1件だけを延長する', () => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(screen.getByRole('button', { name: '連続' }));
    expect(result.latestHoldId()).toBeNull();

    result.setProps({ currentTime: 2.2 });
    fireEvent.click(chainButton());
    expect(result.latestHoldId()).toBe('c2');
    expect(result.getCaptions()[0].endTime).toBe(2.2);
    expect(result.getCaptions()[1]).toMatchObject({ startTime: 2.4, endTime: 5 });

    result.setProps({ currentTime: 6 });
    expect(result.getCaptions()[1].endTime).toBe(5);
    fireEvent.click(chainButton());
    expect(result.latestHoldId()).toBe('c3');
    expect(result.getCaptions()[1].endTime).toBe(6);
  });

  it('対象の移動と開始フェーズへの切替では、前の延長を残さない', () => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(startButton());
    expect(result.latestHoldId()).toBe('c1');

    fireEvent.click(screen.getByTitle(/開始\/終了を切り替える/));
    expect(result.latestHoldId()).toBeNull();
    fireEvent.click(screen.getByTitle(/開始\/終了を切り替える/));
    expect(result.latestHoldId()).toBe('c1');

    fireEvent.click(screen.getByTitle('次のキャプションへ'));
    expect(result.latestHoldId()).toBeNull();
    expect(result.getCaptions()[0].endTime).toBe(2);
  });

  it.each(['step-button', 'close-button'] as const)('手動終了（%s）で延長を外し、未確定の終了時刻は戻したままにする', (exit) => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(startButton());
    result.setProps({ currentTime: 4 });
    if (exit === 'step-button') enterStampMode();
    else fireEvent.click(screen.getByTitle('タイミング打ちを終了'));

    expect(result.latestHoldId()).toBeNull();
    expect(result.latestPreviewIds()).toBeNull();
    expect(result.getCaptions()[0]).toMatchObject({ startTime: 1, endTime: 2 });
  });

  it.each(['lock', 'export'] as const)('%sでは延長を残さない', (state) => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(startButton());
    result.setProps(state === 'lock' ? { isLocked: true } : { isExporting: true });

    expect(result.latestHoldId()).toBeNull();
    expect(result.getCaptions()[0]).toMatchObject({ startTime: 1, endTime: 2 });
  });

  it('閉じると延長を解除し、通知先が変わっても最新の通知先だけへ解除を送る', () => {
    const result = renderStampSection();
    enterStampMode();
    fireEvent.click(startButton());
    const replacement = vi.fn<(captionId: string | null) => void>();
    result.setProps({ onStampHoldOpenChange: replacement });
    expect(replacement).toHaveBeenLastCalledWith('c1');

    result.unmount();
    expect(replacement).toHaveBeenLastCalledWith(null);
    expect(result.onStampHoldOpenChange).not.toHaveBeenLastCalledWith(null);
  });
});
