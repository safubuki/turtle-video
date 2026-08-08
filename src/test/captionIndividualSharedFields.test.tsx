/**
 * @file captionIndividualSharedFields.test.tsx
 * @description キャプション個別設定モーダルが、一括設定と同じ字体・サイズ・位置の
 * 共有コンポーネントを使っていることの回帰テスト。
 *
 * 以前はモーダル側で字体 UI を独自実装していたため「丸ゴシック」等の固定ボタンが
 * 欠落し、一括設定でしか選べない字体があった。共有化でこの差を無くす。
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CaptionSettingsModal from '../components/modals/CaptionSettingsModal';
import CaptionFontStyleField from '../components/common/CaptionFontStyleField';
import CaptionFontSizeField from '../components/common/CaptionFontSizeField';
import CaptionPositionField from '../components/common/CaptionPositionField';
import type { Caption, CaptionSettings } from '../types';
import { PINNED_CAPTION_FONT_OPTIONS } from '../utils/captionFontCatalog';

const settings: CaptionSettings = {
  enabled: true,
  fontSize: 'medium',
  fontStyle: 'gothic',
  fontColor: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 4,
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
};

const baseCaption: Caption = {
  id: 'caption-1',
  text: '本文',
  startTime: 0,
  endTime: 3,
  fadeIn: false,
  fadeOut: false,
  fadeInDuration: 0.5,
  fadeOutDuration: 0.5,
};

// 丸ゴシックは端末に実在するときだけ出る。テストでは実在判定を通した状態
// （カタログの固定候補すべて）を渡し、一括設定と同じ選択肢が並ぶことを確かめる。
const pinnedWithRounded = PINNED_CAPTION_FONT_OPTIONS;

describe('CaptionFontStyleField（一括設定と個別設定の共有コンポーネント）', () => {
  const baseProps = {
    supportsExtendedFonts: true,
    pinnedFontOptions: pinnedWithRounded,
    dropdownFontOptions: [],
    localFontFamilies: [],
    localFontsLoading: false,
    idPrefix: 'test',
    onLoadLocalFonts: vi.fn(),
  };

  it('丸ゴシックが実在する端末では固定ボタンとして表示される', () => {
    render(
      <CaptionFontStyleField {...baseProps} fontStyle="gothic" onSetFontStyle={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '丸ゴシック' })).toBeTruthy();
  });

  it('個別設定モード（allowDefaultOption）では「デフォルト」が先頭に増え、丸ゴシックも選べる', () => {
    const onSetFontStyle = vi.fn();
    render(
      <CaptionFontStyleField
        {...baseProps}
        fontStyle={null}
        allowDefaultOption
        onSetFontStyle={onSetFontStyle}
      />,
    );

    // 一括設定と同じ選択肢がすべて並ぶ
    expect(screen.getByRole('button', { name: 'デフォルト' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ゴシック' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '明朝' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '丸ゴシック' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '丸ゴシック' }));
    expect(onSetFontStyle).toHaveBeenCalledWith('rounded');
  });

  it('「デフォルト」を押すと null（＝一括設定を継承）を通知する', () => {
    const onSetFontStyle = vi.fn();
    render(
      <CaptionFontStyleField
        {...baseProps}
        fontStyle="rounded"
        allowDefaultOption
        onSetFontStyle={onSetFontStyle}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'デフォルト' }));
    expect(onSetFontStyle).toHaveBeenCalledWith(null);
  });

  it('compact では短縮と正式名称の両方を描き、読み上げ名は正式名称のまま', () => {
    render(
      <CaptionFontStyleField
        {...baseProps}
        fontStyle="gothic"
        allowDefaultOption
        compact
        onSetFontStyle={vi.fn()}
      />,
    );

    // 読み上げ名は compact でも正式名称（「ゴシ」とは読まれない）
    const rounded = screen.getByRole('button', { name: '丸ゴシック' });
    expect(rounded.querySelector('[class~="md:hidden"]')?.textContent).toBe('丸ゴ');
    expect(rounded.querySelector('[class~="md:inline"]')?.textContent).toBe('丸ゴシック');
    expect(rounded.className).toContain('whitespace-nowrap');

    const def = screen.getByRole('button', { name: 'デフォルト' });
    expect(def.querySelector('[class~="md:hidden"]')?.textContent).toBe('既定');
    expect(def.querySelector('[class~="md:inline"]')?.textContent).toBe('デフォルト');
  });

  it('compact 無し（一括設定）では正式名称のまま表示する', () => {
    render(
      <CaptionFontStyleField {...baseProps} fontStyle="gothic" onSetFontStyle={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '丸ゴシック' })).toBeTruthy();
  });

  it('allowDefaultOption 無し（一括設定）では「デフォルト」を出さない', () => {
    render(
      <CaptionFontStyleField {...baseProps} fontStyle="gothic" onSetFontStyle={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'デフォルト' })).toBeNull();
  });
});

describe('CaptionFontSizeField（デフォルト継承）', () => {
  const baseProps = {
    fontSizeCustom: null,
    supportsCustom: true,
    ariaLabelPrefix: 'テスト',
    idPrefix: 'test',
  };

  it('個別設定モードでは「デフォルト」が選べ、押すと null を通知する', () => {
    const onSetFontSize = vi.fn();
    const onSetFontSizeCustom = vi.fn();
    render(
      <CaptionFontSizeField
        {...baseProps}
        fontSize="large"
        allowDefaultOption
        onSetFontSize={onSetFontSize}
        onSetFontSizeCustom={onSetFontSizeCustom}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'デフォルト' }));
    expect(onSetFontSize).toHaveBeenCalledWith(null);
    expect(onSetFontSizeCustom).toHaveBeenCalledWith(null);
  });

  it('デフォルト継承中にカスタムを押すと、一括設定の実効 px から編集を始める', () => {
    const onSetFontSizeCustom = vi.fn();
    render(
      <CaptionFontSizeField
        {...baseProps}
        fontSize={null}
        allowDefaultOption
        inheritedFontSizePx={96}
        onSetFontSize={vi.fn()}
        onSetFontSizeCustom={onSetFontSizeCustom}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'カスタム' }));
    expect(onSetFontSizeCustom).toHaveBeenCalledWith(96);
  });
});

describe('CaptionPositionField（一括設定と個別設定の共有コンポーネント）', () => {
  const baseProps = {
    positionCustom: null,
    supportsCustom: true,
    ariaLabelPrefix: 'テスト',
    idPrefix: 'test',
  };

  it('一括設定と同じ 上部/中央/下部 + カスタムが並ぶ', () => {
    render(
      <CaptionPositionField
        {...baseProps}
        position="bottom"
        onSetPosition={vi.fn()}
        onSetPositionCustom={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'テストの表示位置 上部' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'テストの表示位置 中央' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'テストの表示位置 下部' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'テストの表示位置 カスタム' })).toBeTruthy();
  });

  it('個別設定モードでは「デフォルト」が増え、押すと null を通知する', () => {
    const onSetPosition = vi.fn();
    const onSetPositionCustom = vi.fn();
    render(
      <CaptionPositionField
        {...baseProps}
        position="top"
        allowDefaultOption
        onSetPosition={onSetPosition}
        onSetPositionCustom={onSetPositionCustom}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'テストの表示位置 デフォルト' }));
    expect(onSetPosition).toHaveBeenCalledWith(null);
    expect(onSetPositionCustom).toHaveBeenCalledWith(null);
  });

  it('カスタム XY はスライダーと数値入力の両方で更新できる', () => {
    const onSetPositionCustom = vi.fn();
    render(
      <CaptionPositionField
        {...baseProps}
        position={null}
        positionCustom={{ x: 50, y: 80 }}
        onSetPosition={vi.fn()}
        onSetPositionCustom={onSetPositionCustom}
      />,
    );

    const xNumber = screen.getByLabelText('テストの表示位置 X（数値）');
    fireEvent.change(xNumber, { target: { value: '30' } });
    expect(onSetPositionCustom).toHaveBeenCalledWith({ x: 30, y: 80 });
  });

  it('compact では短縮と正式名称の両方を描き、CSS で出し分ける（PC は一括設定と同じ表示）', () => {
    render(
      <CaptionPositionField
        {...baseProps}
        position="bottom"
        allowDefaultOption
        compact
        onSetPosition={vi.fn()}
        onSetPositionCustom={vi.fn()}
      />,
    );

    const center = screen.getByRole('button', { name: 'テストの表示位置 中央' });
    // スマホ幅（md 未満）で見えるのは短縮ラベル
    const shortLabel = center.querySelector('[class~="md:hidden"]');
    // PC 幅（md 以上）で見えるのは一括設定と同じ正式名称
    const fullLabel = center.querySelector('[class~="md:inline"]');
    expect(shortLabel?.textContent).toBe('中');
    expect(fullLabel?.textContent).toBe('中央');
    // 表示用の span は読み上げ対象外（アクセシブル名は aria-label のみ）
    expect(shortLabel?.getAttribute('aria-hidden')).toBe('true');
    expect(fullLabel?.getAttribute('aria-hidden')).toBe('true');
  });

  it('compact 無し（一括設定）では正式名称だけを描く', () => {
    render(
      <CaptionPositionField
        {...baseProps}
        position="bottom"
        onSetPosition={vi.fn()}
        onSetPositionCustom={vi.fn()}
      />,
    );

    const center = screen.getByRole('button', { name: 'テストの表示位置 中央' });
    expect(center.textContent).toBe('中央');
    // 出し分け用の span を作らない（一括設定は従来どおりの素の表示）
    expect(center.querySelector('[class~="md:hidden"]')).toBeNull();
  });

  it('supportsCustom が false（iOS）ではカスタムを出さない', () => {
    render(
      <CaptionPositionField
        {...baseProps}
        position="bottom"
        supportsCustom={false}
        onSetPosition={vi.fn()}
        onSetPositionCustom={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'テストの表示位置 カスタム' })).toBeNull();
  });
});

describe('CaptionSettingsModal が共有コンポーネントを使う', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('字体に一括設定と同じ固定ボタン（丸ゴシック含む）が並ぶ', () => {
    render(
      <CaptionSettingsModal
        caption={baseCaption}
        settings={settings}
        onUpdate={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    // モーダルは幅が狭いため compact（短縮ラベル）で描く。
    // title には正式名称が入るので、どちらでも識別できる。
    // （丸ゴシックは端末に実在するときだけ出るため jsdom では検証しない。
    //   選択肢が一括設定と一致することは CaptionFontStyleField 単体テストで担保する）
    expect(within(dialog).getByRole('button', { name: 'ゴシック' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '明朝' })).toBeTruthy();
    // 「既定」（一括設定を継承）はサイズ・字体に並ぶ
    expect(within(dialog).getAllByRole('button', { name: 'デフォルト' }).length).toBeGreaterThanOrEqual(2);
    // 位置の「既定」は aria-label で正式名称を持つ（サイズの「中」等と混同しないため）
    expect(within(dialog).getByRole('button', { name: '個別キャプションの表示位置 デフォルト' })).toBeTruthy();
  });

  it('compact 表示でも title 属性には正式なフォント名が残る（識別できる）', () => {
    render(
      <CaptionSettingsModal
        caption={baseCaption}
        settings={settings}
        onUpdate={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'ゴシック' }).getAttribute('title')).toBe('ゴシック');
  });

  it('ボタンのラベルが折り返さない（whitespace-nowrap が付く）', () => {
    render(
      <CaptionSettingsModal
        caption={baseCaption}
        settings={settings}
        onUpdate={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    // サイズ・字体・位置の各行のボタンが折り返し禁止であること
    for (const name of ['小', '特大', 'ゴシック', '明朝']) {
      expect(within(dialog).getByRole('button', { name }).className).toContain('whitespace-nowrap');
    }
    for (const name of ['個別キャプションの表示位置 上部', '個別キャプションの表示位置 下部']) {
      expect(within(dialog).getByRole('button', { name }).className).toContain('whitespace-nowrap');
    }
  });

  it('字体を選ぶと overrideFontStyle が設定される', () => {
    const onUpdate = vi.fn();
    render(
      <CaptionSettingsModal
        caption={baseCaption}
        settings={settings}
        onUpdate={onUpdate}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '明朝' }));
    expect(onUpdate).toHaveBeenCalledWith('caption-1', { overrideFontStyle: 'mincho' });
  });

  it('位置を選ぶと overridePosition が設定され、カスタム位置は解除される', () => {
    const onUpdate = vi.fn();
    render(
      <CaptionSettingsModal
        caption={{ ...baseCaption, overridePositionCustom: { x: 20, y: 20 } }}
        settings={settings}
        onUpdate={onUpdate}
        onClose={vi.fn()}
      />,
    );

    // サイズの「中」と紛らわしいため、aria-label（正式名称入り）で位置ボタンを特定する
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: '個別キャプションの表示位置 中央' }),
    );
    expect(onUpdate).toHaveBeenCalledWith('caption-1', {
      overridePosition: 'center',
      overridePositionCustom: undefined,
    });
  });

  it('サイズの「特大」を選ぶと overrideFontSize が設定され、カスタムは解除される', () => {
    const onUpdate = vi.fn();
    render(
      <CaptionSettingsModal
        caption={{ ...baseCaption, overrideFontSizeCustom: 120 }}
        settings={settings}
        onUpdate={onUpdate}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '特大' }));
    expect(onUpdate).toHaveBeenCalledWith('caption-1', {
      overrideFontSize: 'xlarge',
      overrideFontSizeCustom: undefined,
    });
  });
});
