/**
 * @file videoTitleSettingsPanel.test.tsx
 * @description 動画タイトル設定 UI（Issue #211）の回帰テスト。
 *
 * 確認項目のうち UI に関わるもの:
 * - キャプションカテゴリの先頭付近にタイトル設定が表示される
 * - 初期状態ではアコーディオンが閉じている
 * - 通常キャプションとは別に編集できる（キャプション側の setter を呼ばない）
 */
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CaptionSection from '../components/sections/CaptionSection';
import VideoTitleSettingsPanel from '../components/sections/VideoTitleSettingsPanel';
import { DEFAULT_VIDEO_TITLE_SETTINGS } from '../utils/videoTitle';
import {
  getAvailableDropdownFontOptions,
  getAvailablePinnedFontOptions,
} from '../utils/captionFontCatalog';

function buildCaptionSectionProps(
  overrides: Partial<ComponentProps<typeof CaptionSection>> = {},
): ComponentProps<typeof CaptionSection> {
  return {
    captions: [],
    settings: {
      enabled: true,
      fontSize: 'medium',
      fontStyle: 'gothic',
      fontColor: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 2,
      position: 'bottom',
      blur: 0,
      backgroundEnabled: false,
      backgroundColor: '#000000',
      backgroundOpacity: 0.45,
      backgroundRadius: 16,
      bulkFadeIn: false,
      bulkFadeOut: false,
      bulkFadeInDuration: 0.5,
      bulkFadeOutDuration: 0.5,
    },
    videoTitle: { ...DEFAULT_VIDEO_TITLE_SETTINGS },
    isLocked: false,
    totalDuration: 20,
    currentTime: 0,
    onToggleLock: vi.fn(),
    onAddCaption: vi.fn(),
    onUpdateCaption: vi.fn(),
    onRemoveCaption: vi.fn(),
    onMoveCaption: vi.fn(),
    onClearAllCaptions: vi.fn(),
    onSetEnabled: vi.fn(),
    onSetFontSize: vi.fn(),
    onSetFontStyle: vi.fn(),
    onSetFontColor: vi.fn(),
    onSetStrokeColor: vi.fn(),
    onSetStrokeWidth: vi.fn(),
    onSetPosition: vi.fn(),
    onSetBlur: vi.fn(),
    onSetBackgroundEnabled: vi.fn(),
    onSetBackgroundColor: vi.fn(),
    onSetBackgroundOpacity: vi.fn(),
    onSetBackgroundRadius: vi.fn(),
    onSetFontSizeCustom: vi.fn(),
    onSetPositionCustom: vi.fn(),
    onSetBulkFadeIn: vi.fn(),
    onSetBulkFadeOut: vi.fn(),
    onSetBulkFadeInDuration: vi.fn(),
    onSetBulkFadeOutDuration: vi.fn(),
    onOpenHelp: vi.fn(),
    formatTime: (seconds: number) => `${seconds.toFixed(1)}s`,
    onApplyCaptions: vi.fn(),
    onShiftCaptions: vi.fn(),
    isPlaying: false,
    onTogglePlay: vi.fn(),
    onSeekBy: vi.fn(),
    onSeekToSilenceBoundary: vi.fn(),
    hasPrevSilenceBoundary: false,
    hasNextSilenceBoundary: false,
    onUpdateCaptionLive: vi.fn(),
    onUpdateVideoTitle: vi.fn(),
    onSetVideoTitleRange: vi.fn(),
    onResetVideoTitle: vi.fn(),
    ...overrides,
  };
}

function buildPanelProps(
  overrides: Partial<ComponentProps<typeof VideoTitleSettingsPanel>> = {},
): ComponentProps<typeof VideoTitleSettingsPanel> {
  return {
    title: { ...DEFAULT_VIDEO_TITLE_SETTINGS },
    isLocked: false,
    totalDuration: 20,
    currentTime: 0,
    supportsExtendedFonts: true,
    pinnedFontOptions: getAvailablePinnedFontOptions(),
    dropdownFontOptions: getAvailableDropdownFontOptions(),
    localFontFamilies: [],
    localFontsLoading: false,
    onLoadLocalFonts: vi.fn(),
    onUpdate: vi.fn(),
    onSetRange: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };
}

describe('CaptionSection 内のタイトル配置（Issue #211）', () => {
  it('キャプションカテゴリの先頭付近にタイトル設定が表示される', () => {
    render(<CaptionSection {...buildCaptionSectionProps()} />);

    const titleHeader = screen.getByRole('button', { name: /タイトル/ });
    const styleHeader = screen.getByRole('button', {
      name: /キャプション 一括設定/,
    });

    // DOM 順でタイトルが一括設定より前にある
    expect(
      titleHeader.compareDocumentPosition(styleHeader) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('初期状態ではアコーディオンが閉じている', () => {
    render(<CaptionSection {...buildCaptionSectionProps()} />);

    const titleHeader = screen.getByRole('button', { name: /タイトル/ });
    expect(titleHeader).toHaveAttribute('aria-expanded', 'false');
    // 閉じている間は入力欄が出ない
    expect(screen.queryByLabelText('■ タイトル文字')).not.toBeInTheDocument();
  });

  it('タイトルの文字入力はキャプション追加を呼ばない（別管理）', () => {
    const props = buildCaptionSectionProps();
    render(<CaptionSection {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /タイトル/ }));
    fireEvent.change(screen.getByPlaceholderText('動画のタイトルを入力...（改行で複数行）'), {
      target: { value: '旅行の思い出' },
    });

    expect(props.onUpdateVideoTitle).toHaveBeenCalledWith({ text: '旅行の思い出' });
    expect(props.onAddCaption).not.toHaveBeenCalled();
    expect(props.onUpdateCaption).not.toHaveBeenCalled();
  });
});

describe('VideoTitleSettingsPanel', () => {
  /** タイトルアコーディオンを開く */
  const openTitle = () =>
    fireEvent.click(screen.getByRole('button', { name: /^タイトル/ }));
  /** さらにスタイル設定アコーディオンを開く */
  const openStyle = () =>
    fireEvent.click(screen.getByRole('button', { name: /^スタイル設定/ }));

  it('開くと表示時間が出る（見た目はスタイル設定の中）', () => {
    render(<VideoTitleSettingsPanel {...buildPanelProps()} />);
    openTitle();

    // 表示時間はタイトル文字の直下に常に出る
    expect(screen.getByLabelText('開始:')).toBeInTheDocument();
    expect(screen.getByLabelText('終了:')).toBeInTheDocument();
    expect(screen.getByLabelText('タイトルの開始時間')).toBeInTheDocument();
    expect(screen.getByLabelText('タイトルの終了時間')).toBeInTheDocument();

    // 見た目はスタイル設定アコーディオンの中（初期は閉じている）
    expect(screen.queryByText('サイズ:')).not.toBeInTheDocument();
    openStyle();
    // キャプションと同じ 小/中/大/特大 + カスタムのプリセット UI
    expect(screen.getByText('サイズ:')).toBeInTheDocument();
    expect(screen.getByText('字体:')).toBeInTheDocument();
    for (const label of ['小', '中', '大', '特大']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    // 「カスタム」はサイズと位置の 2 か所（キャプションと同じ構成）
    expect(screen.getAllByRole('button', { name: 'カスタム' })).toHaveLength(2);
    expect(screen.getByLabelText('縁の幅:')).toBeInTheDocument();
    // キャプションと同様のぼかしスライダー
    expect(screen.getByLabelText('タイトルのぼかし')).toBeInTheDocument();
  });

  it('ぼかしスライダーを動かすと blur を更新する', () => {
    const onUpdate = vi.fn();
    render(<VideoTitleSettingsPanel {...buildPanelProps({ onUpdate })} />);
    openTitle();
    openStyle();

    fireEvent.change(screen.getByLabelText('タイトルのぼかし'), { target: { value: '25' } });
    expect(onUpdate).toHaveBeenCalledWith({ blur: 2.5 });
  });

  it('サイズはキャプションと同じプリセット + カスタムで操作できる', () => {
    const onUpdate = vi.fn();
    render(<VideoTitleSettingsPanel {...buildPanelProps({ onUpdate })} />);
    openTitle();
    openStyle();

    // 既定は特大が選択済み
    expect(screen.getByRole('button', { name: '特大' }).className).toContain('bg-yellow-500');

    // プリセットを選ぶとカスタムは解除される（キャプションと同じ挙動）
    fireEvent.click(screen.getByRole('button', { name: '大' }));
    expect(onUpdate).toHaveBeenCalledWith({ fontSizeCustom: null });
    expect(onUpdate).toHaveBeenCalledWith({ fontSize: 'large' });

    // カスタムは現在のプリセット相当の px から始まる（特大 = 148px）。
    // 「カスタム」はサイズと位置の 2 つあるので先頭（サイズ側）を押す
    fireEvent.click(screen.getAllByRole('button', { name: 'カスタム' })[0]);
    expect(onUpdate).toHaveBeenCalledWith({ fontSizeCustom: 148 });
  });

  it('カスタムサイズを選ぶと数値スライダーが出る', () => {
    const onUpdate = vi.fn();
    render(
      <VideoTitleSettingsPanel
        {...buildPanelProps({
          title: { ...DEFAULT_VIDEO_TITLE_SETTINGS, fontSizeCustom: 180 },
          onUpdate,
        })}
      />,
    );
    openTitle();
    openStyle();

    expect(screen.getByLabelText('タイトルのカスタム文字サイズ')).toBeInTheDocument();
    // 数値欄は blur（確定）で初めて反映される
    const sizeNumber = screen.getByLabelText('タイトルのカスタム文字サイズ（数値）');
    fireEvent.change(sizeNumber, { target: { value: '200' } });
    fireEvent.blur(sizeNumber, { target: { value: '200' } });
    expect(onUpdate).toHaveBeenCalledWith({ fontSizeCustom: 200 });
  });

  it('字体は「その他▾」と PC の全フォント読み込みをキャプションと同じ形で出す', () => {
    const onLoadLocalFonts = vi.fn();
    render(<VideoTitleSettingsPanel {...buildPanelProps({ onLoadLocalFonts })} />);
    openTitle();
    openStyle();

    // ゴシック/明朝の固定ボタン
    expect(screen.getByRole('button', { name: 'ゴシック' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '明朝' })).toBeInTheDocument();
    // 「その他▾」ドロップダウン（キャプションと同じ id 体系で一意）
    expect(document.getElementById('video-title-font-style-dropdown')).toBeTruthy();
  });

  it('スタイル設定アコーディオンは初期状態で閉じている', () => {
    render(<VideoTitleSettingsPanel {...buildPanelProps()} />);
    openTitle();

    expect(screen.getByRole('button', { name: /^スタイル設定/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('既定では位置「中央」が選択されている', () => {
    render(<VideoTitleSettingsPanel {...buildPanelProps()} />);
    openTitle();
    openStyle();

    expect(screen.getByRole('button', { name: '中央' }).className).toContain('bg-yellow-500');
    expect(screen.getByRole('button', { name: '上部' }).className).not.toContain('bg-yellow-500');
  });

  it('開始時間の数値入力は totalDuration 付きで onSetRange を呼ぶ', () => {
    const onSetRange = vi.fn();
    render(<VideoTitleSettingsPanel {...buildPanelProps({ onSetRange })} />);
    openTitle();

    const startNumber = screen.getByLabelText('タイトルの開始時間（数値）');
    fireEvent.change(startNumber, { target: { value: '2.5' } });
    fireEvent.blur(startNumber, { target: { value: '2.5' } });

    expect(onSetRange).toHaveBeenCalledWith(2.5, DEFAULT_VIDEO_TITLE_SETTINGS.endTime, 20);
  });

  it('終了時間のスライダーも onSetRange を呼ぶ', () => {
    const onSetRange = vi.fn();
    render(<VideoTitleSettingsPanel {...buildPanelProps({ onSetRange })} />);
    openTitle();

    fireEvent.change(screen.getByLabelText('タイトルの終了時間'), { target: { value: '9' } });

    expect(onSetRange).toHaveBeenCalledWith(DEFAULT_VIDEO_TITLE_SETTINGS.startTime, 9, 20);
  });

  it('「プレビュー位置を反映」の開始／終了ボタンが現在位置を適用する', () => {
    const onSetRange = vi.fn();
    render(<VideoTitleSettingsPanel {...buildPanelProps({ currentTime: 3.24, onSetRange })} />);
    openTitle();

    // 0.1 秒へ量子化される（CaptionItem と同じ挙動）
    fireEvent.click(screen.getByRole('button', { name: /開始$/ }));
    expect(onSetRange).toHaveBeenCalledWith(3.2, DEFAULT_VIDEO_TITLE_SETTINGS.endTime, 20);

    fireEvent.click(screen.getByRole('button', { name: /終了$/ }));
    expect(onSetRange).toHaveBeenCalledWith(DEFAULT_VIDEO_TITLE_SETTINGS.startTime, 3.2, 20);
  });

  it('プレビュー位置が範囲外のときは反映ボタンを押せない', () => {
    // currentTime=0 は既定の startTime(0) 以下なので「終了」へは反映できない
    render(<VideoTitleSettingsPanel {...buildPanelProps({ currentTime: 0 })} />);
    openTitle();

    expect(screen.getByRole('button', { name: /終了$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /開始$/ })).not.toBeDisabled();
  });

  it('位置カスタムを選ぶと XY スライダーが出る', () => {
    render(
      <VideoTitleSettingsPanel
        {...buildPanelProps({
          title: { ...DEFAULT_VIDEO_TITLE_SETTINGS, positionCustom: { x: 50, y: 50 } },
        })}
      />,
    );
    openTitle();
    openStyle();

    expect(screen.getByLabelText('タイトルのX位置')).toBeInTheDocument();
    expect(screen.getByLabelText('タイトルのY位置')).toBeInTheDocument();
  });

  it('背景の帯は OFF のとき濃さ・角丸を出さず、ON で出す', () => {
    const { unmount } = render(<VideoTitleSettingsPanel {...buildPanelProps()} />);
    openTitle();
    openStyle();
    expect(screen.getByRole('checkbox', { name: /背景の帯/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('タイトル背景の濃さ')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('タイトル背景の角丸')).not.toBeInTheDocument();
    unmount();

    render(
      <VideoTitleSettingsPanel
        {...buildPanelProps({
          title: { ...DEFAULT_VIDEO_TITLE_SETTINGS, backgroundEnabled: true },
        })}
      />,
    );
    openTitle();
    openStyle();
    expect(screen.getByLabelText('タイトル背景の濃さ')).toBeInTheDocument();
    expect(screen.getByLabelText('タイトル背景の角丸')).toBeInTheDocument();
  });

  it('角丸はスライダーと数値の両方から変更できる', () => {
    const onUpdate = vi.fn();
    render(
      <VideoTitleSettingsPanel
        {...buildPanelProps({
          title: { ...DEFAULT_VIDEO_TITLE_SETTINGS, backgroundEnabled: true },
          onUpdate,
        })}
      />,
    );
    openTitle();
    openStyle();

    fireEvent.change(screen.getByLabelText('タイトル背景の角丸'), { target: { value: '40' } });
    expect(onUpdate).toHaveBeenCalledWith({ backgroundRadius: 40 });

    // 数値欄は入力途中では確定せず、フォーカスを外した時点で反映する
    const radiusNumber = screen.getByLabelText('タイトル背景の角丸（数値）');
    fireEvent.change(radiusNumber, { target: { value: '12' } });
    fireEvent.blur(radiusNumber, { target: { value: '12' } });
    expect(onUpdate).toHaveBeenCalledWith({ backgroundRadius: 12 });
  });

  it('ロック中は入力を操作できない', () => {
    render(<VideoTitleSettingsPanel {...buildPanelProps({ isLocked: true })} />);
    openTitle();

    expect(screen.getByPlaceholderText('動画のタイトルを入力...（改行で複数行）')).toBeDisabled();
    expect(screen.getByLabelText('開始:')).toBeDisabled();
    expect(screen.getByLabelText('タイトルの開始時間')).toBeDisabled();
    expect(screen.getByRole('button', { name: /開始$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /タイトル設定をリセット/ })).toBeDisabled();
  });
});
