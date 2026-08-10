import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EndrollOverlay, WatermarkOverlay } from '../types';
import OverlaySection from '../components/sections/OverlaySection';
import { DEFAULT_WATERMARK_OVERLAY } from '../utils/watermarkOverlay';
import { DEFAULT_ENDROLL_OVERLAY } from '../utils/endrollOverlay';

function renderSection(
  hasImage = false,
  overrides: Partial<WatermarkOverlay> = {},
  endrollOverrides: Partial<EndrollOverlay> = {},
  extra: { hasNoBgm?: boolean; totalDuration?: number } = {},
) {
  const props = {
    watermark: {
      ...DEFAULT_WATERMARK_OVERLAY,
      file: hasImage ? new File(['logo'], 'logo.png', { type: 'image/png' }) : null,
      url: hasImage ? 'blob:logo' : null,
      endTime: 10,
      ...overrides,
    },
    endroll: { ...DEFAULT_ENDROLL_OVERLAY, ...endrollOverrides },
    totalDuration: extra.totalDuration ?? 10,
    clipsDuration: 10,
    currentTime: 3.2,
    canvasWidth: 1920,
    canvasHeight: 1080,
    hasNoBgm: extra.hasNoBgm ?? false,
    onImageSelect: vi.fn(),
    onUpdate: vi.fn(),
    onSetRange: vi.fn(),
    onRemoveImage: vi.fn(),
    onEndrollImageSelect: vi.fn(),
    onEndrollUpdate: vi.fn(),
    onEndrollRemoveImage: vi.fn(),
  };
  const result = render(<OverlaySection {...props} />);
  fireEvent.click(screen.getByText('ロゴ表示'));
  return { ...result, props };
}

describe('OverlaySection', () => {
  it('PNG/JPEG/WebP の画像選択導線を表示する', () => {
    const { container, props } = renderSection(false);
    expect(screen.getByText('ロゴ画像を重ねる')).toBeInTheDocument();

    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('image/png,image/jpeg,image/webp');
    fireEvent.change(input, { target: { files: [file] } });
    expect(props.onImageSelect).toHaveBeenCalledWith(file);
  });

  it('表示切替で画像・調整値を削除せず enabled だけ更新する', () => {
    const { props } = renderSection(true);
    fireEvent.click(screen.getByRole('button', { name: 'ウォーターマークを非表示にする' }));
    expect(props.onUpdate).toHaveBeenCalledWith({ enabled: false });
    expect(screen.getByLabelText('ウォーターマークの横 (右+)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '円形' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('全体レイヤー')).not.toBeInTheDocument();
  });

  it('現在位置を開始・終了へ反映できる', () => {
    const { props } = renderSection(true);
    fireEvent.click(screen.getByRole('button', { name: '開始' }));
    expect(props.onSetRange).toHaveBeenCalledWith(3.2, 10, 10);
  });

  it('フェードイン/アウトを動画と同じチェック＋時間スライダーで設定できる', () => {
    const { props } = renderSection(true);
    fireEvent.click(screen.getByLabelText('フェードイン'));
    expect(props.onUpdate).toHaveBeenCalledWith({ fadeIn: true });

    fireEvent.click(screen.getByLabelText('フェードアウト'));
    expect(props.onUpdate).toHaveBeenCalledWith({ fadeOut: true });
  });

  it('位置・倍率・透過・回転・ぼかしの既定値を個別に戻せる', () => {
    const { props } = renderSection(true, {
      positionX: 80,
      positionY: 20,
      size: 1.5,
      opacity: 0.4,
      rotation: 45,
      maskSize: 70,
      feather: 12,
    });

    fireEvent.click(screen.getByRole('button', { name: '横 (右+)をデフォルトに戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '縦 (上+)をデフォルトに戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '拡大率をデフォルトに戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '透過度をデフォルトに戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '回転をデフォルトに戻す' }));
    fireEvent.click(screen.getByRole('button', { name: 'マスクサイズをデフォルトに戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '周辺ぼかしをデフォルトに戻す' }));

    expect(props.onUpdate).toHaveBeenCalledWith({ positionX: 50 });
    expect(props.onUpdate).toHaveBeenCalledWith({ positionY: 50 });
    expect(props.onUpdate).toHaveBeenCalledWith({ size: 1 });
    expect(props.onUpdate).toHaveBeenCalledWith({ opacity: 1 });
    expect(props.onUpdate).toHaveBeenCalledWith({ rotation: 0 });
    expect(props.onUpdate).toHaveBeenCalledWith({ maskSize: 100 });
    expect(props.onUpdate).toHaveBeenCalledWith({ feather: 0 });
    const resetButton = screen.getByRole('button', { name: '横 (右+)をデフォルトに戻す' });
    expect(resetButton).toHaveClass('text-gray-200');
    expect(resetButton.parentElement).toContainElement(screen.getByText('横 (右+)'));
    // −/+ ステッパーが並ぶため、数値列は固定幅ではなく auto で確保する
    const positionInput = screen.getByLabelText('ウォーターマークの横 (右+)（数値）');
    const controlRow = positionInput.parentElement?.parentElement;
    expect(controlRow).toHaveClass('grid-cols-[4.5rem_minmax(0,1fr)_auto]');
    expect(controlRow).toHaveClass('sm:grid-cols-[5.75rem_minmax(0,1fr)_auto]');
  });

  it('左下・右下・中央・左上・右上の順で、画像サイズに応じた位置を簡単設定できる', () => {
    const { props } = renderSection(true);
    // タブにもサムネイルがあるため、設定カード側の画像を明示的に取る
    const thumbnail = screen.getByTestId('logo-preview');
    Object.defineProperty(thumbnail, 'naturalWidth', { configurable: true, value: 400 });
    Object.defineProperty(thumbnail, 'naturalHeight', { configurable: true, value: 200 });
    fireEvent.load(thumbnail);

    const group = screen.getByRole('group', { name: 'ウォーターマークの位置を簡単設定' });
    expect(group.parentElement).toHaveClass('border-b');
    expect(group.parentElement).not.toHaveClass('border-t');
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual([
      '左下',
      '右下',
      '中央',
      '左上',
      '右上',
    ]);

    fireEvent.click(within(group).getByRole('button', { name: '左下' }));
    const calls = props.onUpdate.mock.calls;
    const position = calls[calls.length - 1]?.[0];
    expect(position.positionX).toBe(9);
    expect(position.positionY).toBe(85);
  });

  /**
   * タブ切替のいちばん重要な性質: 操作 UI は共通でも、
   * **書き込み先がタブごとに分かれている**こと。
   * ここが壊れるとウォーターマークの設定でエンドロールが書き換わる（またはその逆）。
   */
  describe('ウォーターマーク / エンドロールのタブ切替', () => {
    const openEndrollTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: /エンドロール/ }));
    };

    it('未設定のタブには「指定なし」を表示する', () => {
      renderSection(false);
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(2);
      expect(within(tabs[0]).getByText('指定なし')).toBeInTheDocument();
      expect(within(tabs[1]).getByText('指定なし')).toBeInTheDocument();
    });

    it('エンドロールタブの画像選択は onEndrollImageSelect へ流す', () => {
      const { container, props } = renderSection(false);
      openEndrollTab();

      const file = new File(['logo'], 'end.png', { type: 'image/png' });
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });

      expect(props.onEndrollImageSelect).toHaveBeenCalledWith(file);
      // ウォーターマーク側は呼ばれない
      expect(props.onImageSelect).not.toHaveBeenCalled();
    });

    it('共通スライダーの変更はエンドロールタブでは onEndrollUpdate へ書き込む', () => {
      const { props } = renderSection(true, {}, { url: 'blob:end', enabled: true });
      openEndrollTab();

      // 表示は中央原点。+25% は保存値 62.5%（= 25/2 + 50）
      fireEvent.change(screen.getByLabelText('ウォーターマークの横 (右+)'), {
        target: { value: '25' },
      });

      expect(props.onEndrollUpdate).toHaveBeenCalledWith({ positionX: 62.5 });
      expect(props.onUpdate).not.toHaveBeenCalled();
    });

    it('エンドロール固有の設定（長さ・背景色）を変更できる', () => {
      const { props } = renderSection(true, {}, { url: 'blob:end', enabled: true });
      openEndrollTab();

      // 数値欄は入力途中では確定せず、フォーカスを外した時点で反映する
      const durationNumber = screen.getByLabelText('ウォーターマークの長さ（数値）');
      fireEvent.change(durationNumber, { target: { value: '8' } });
      fireEvent.blur(durationNumber, { target: { value: '8' } });
      expect(props.onEndrollUpdate).toHaveBeenCalledWith({ durationSec: 8 });

      fireEvent.click(screen.getByRole('button', { name: '白' }));
      expect(props.onEndrollUpdate).toHaveBeenCalledWith({ backgroundMode: 'white' });
    });

    it('BGM が無いときは BGM フェード設定をグレーアウトして無効にする', () => {
      renderSection(true, {}, { url: 'blob:end', enabled: true }, { hasNoBgm: true });
      openEndrollTab();

      const checkbox = screen.getByRole('checkbox', { name: /BGM を徐々に消す/ });
      expect(checkbox).toBeDisabled();
      expect(screen.getByText('BGM が設定されていないため使用できません。')).toBeInTheDocument();
    });

    it('BGM があれば BGM フェード設定を操作できる', () => {
      const { props } = renderSection(true, {}, { url: 'blob:end', enabled: true });
      openEndrollTab();

      const checkbox = screen.getByRole('checkbox', { name: /BGM を徐々に消す/ });
      expect(checkbox).not.toBeDisabled();
      fireEvent.click(checkbox);
      expect(props.onEndrollUpdate).toHaveBeenCalledWith({ bgmFadeOut: true });
    });

    it('エンドロール有効時は伸びた後の総再生時間を案内する', () => {
      renderSection(
        true,
        {},
        { url: 'blob:end', enabled: true, durationSec: 5 },
        { totalDuration: 15 },
      );
      openEndrollTab();
      // clipsDuration=10 + 5 = 15
      expect(
        screen.getByText((content) => content.includes('10.0 秒 + 5.0 秒 = 15.0 秒')),
      ).toBeInTheDocument();
    });
  });

  /**
   * ウォーターマークの「表示する区間」。既定は本編のみで、
   * 全編を選ぶとエンドロールぶんまで指定できるようになる。
   */
  describe('ウォーターマークの表示する区間（本編のみ / 全編）', () => {
    it('既定は「本編のみ」が選択されている', () => {
      renderSection(true);
      expect(screen.getByRole('button', { name: '本編のみ' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: '全編（エンドロール含む）' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('全編を選ぶと scope を更新し、終了を総再生時間まで伸ばす', () => {
      // clipsDuration=10 / エンドロール5秒 → totalDuration=15
      const { props } = renderSection(
        true,
        { startTime: 0, endTime: 10 },
        { url: 'blob:end', enabled: true, durationSec: 5 },
        { totalDuration: 15 },
      );

      fireEvent.click(screen.getByRole('button', { name: '全編（エンドロール含む）' }));

      expect(props.onUpdate).toHaveBeenCalledWith({ scope: 'full' });
      // 終了は 15 秒（= totalDuration）まで伸び、上限も 15 で渡る
      expect(props.onSetRange).toHaveBeenCalledWith(0, 15, 15);
    });

    it('本編のみへ戻すと、はみ出した終了をクリップ尺へ収める', () => {
      const { props } = renderSection(
        true,
        { scope: 'full', startTime: 0, endTime: 15 },
        { url: 'blob:end', enabled: true, durationSec: 5 },
        { totalDuration: 15 },
      );

      fireEvent.click(screen.getByRole('button', { name: '本編のみ' }));

      expect(props.onUpdate).toHaveBeenCalledWith({ scope: 'main' });
      // clipsDuration=10 に切り詰められる
      expect(props.onSetRange).toHaveBeenCalledWith(0, 10, 10);
    });

    it('同じ範囲を選び直しても余計な更新をしない', () => {
      const { props } = renderSection(true);
      fireEvent.click(screen.getByRole('button', { name: '本編のみ' }));
      expect(props.onUpdate).not.toHaveBeenCalled();
      expect(props.onSetRange).not.toHaveBeenCalled();
    });

    it('エンドロールタブには表示する区間の設定を出さない', () => {
      renderSection(true, {}, { url: 'blob:end', enabled: true });
      fireEvent.click(screen.getByRole('tab', { name: /エンドロール/ }));
      expect(screen.queryByRole('button', { name: '本編のみ' })).not.toBeInTheDocument();
    });
  });
});
