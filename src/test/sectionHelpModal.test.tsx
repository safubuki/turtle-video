import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SectionHelpModal from '../components/modals/SectionHelpModal';

describe('SectionHelpModal', () => {
  it('キャプションヘルプの操作見本を現在のボタン表記に合わせる', () => {
    render(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="caption"
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getAllByText('キャプション スタイル/フェード一括設定').length
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('現在位置に先頭を合わせる')).toBeInTheDocument();
    expect(screen.getByText('対象の先頭を現在位置 0:12.3 に合わせます')).toBeInTheDocument();
    expect(screen.queryByText('現在位置（0:12.3）に先頭を合わせる')).not.toBeInTheDocument();
  });

  it('最新機能の操作見本を実画面のラベルで表示する', () => {
    const { rerender } = render(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="clips"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('横16:9／縦9:16')).toBeInTheDocument();
    expect(screen.getByText('画像を選択')).toBeInTheDocument();
    expect(screen.getByText('ディゾルブ 1秒')).toBeInTheDocument();
    expect(screen.getByText('90°回転')).toBeInTheDocument();

    rerender(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="bgm"
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByRole('table', { name: 'BGMの自動調整 ON・OFF の違い' })
    ).toBeInTheDocument();

    rerender(
      <SectionHelpModal
        appFlavor="standard"
        supportsShowSaveFilePicker={false}
        isOpen
        section="preview"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('無音区間：前へ')).toBeInTheDocument();
    expect(screen.getByText('無音区間：次へ')).toBeInTheDocument();
    expect(screen.getByText('現在のフレームをサムネイルに設定')).toBeInTheDocument();
    expect(screen.getByText('自動設定に戻す')).toBeInTheDocument();
    expect(
      screen.getByText('黄色い帯は、発話の切れ目となる無音区間です。').closest('li')
    ).not.toBeNull();
    expect(screen.getByText('判定の優先順').closest('dt')).not.toBeNull();
  });
});
