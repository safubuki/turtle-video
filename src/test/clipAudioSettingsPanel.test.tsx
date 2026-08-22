/**
 * @file clipAudioSettingsPanel.test.tsx
 * @description 音 一括設定アコーディオン（一括ミュート・一括音量・音量揃え）の UI 契約
 */
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClipAudioSettingsPanel, {
  CLIP_AUDIO_NORMALIZE_VISIBLE_FILE_COUNT,
} from '../components/sections/ClipAudioSettingsPanel';
import type { MediaItem } from '../types';

function createVideo(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: overrides.id ?? 'v1',
    file: overrides.file ?? new File(['x'], 'clip.mp4', { type: 'video/mp4' }),
    type: 'video',
    url: 'blob:v1',
    volume: overrides.volume ?? 1,
    isMuted: false,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 1,
    fadeOutDuration: 1,
    duration: 5,
    originalDuration: 5,
    trimStart: 0,
    trimEnd: 5,
    scale: 1,
    positionX: 0,
    positionY: 0,
    isTransformOpen: false,
    isLocked: false,
    audioNormalizeEnabled: overrides.audioNormalizeEnabled,
    audioNormalizeGain: overrides.audioNormalizeGain,
    ...overrides,
  };
}

function renderPanel(overrides: Partial<ComponentProps<typeof ClipAudioSettingsPanel>> = {}) {
  return render(
    <ClipAudioSettingsPanel
      kind="video"
      items={overrides.items ?? [createVideo()]}
      isLocked={false}
      bulkMuted={false}
      bulkEnabled={false}
      bulkVolume={1}
      normalizeEnabled={false}
      normalizeMode="mean"
      onToggleBulkMuted={vi.fn()}
      onToggleBulkEnabled={vi.fn()}
      onBulkVolumeChange={vi.fn()}
      onToggleNormalizeEnabled={vi.fn()}
      onChangeNormalizeMode={vi.fn()}
      onApplyNormalizeGains={vi.fn()}
      {...overrides}
    />,
  );
}

describe('ClipAudioSettingsPanel', () => {
  it('閉じているときは一括音量スライダーを出さず、開いてチェックすると有効になる', () => {
    const onToggleBulkEnabled = vi.fn();
    renderPanel({ items: [createVideo()], onToggleBulkEnabled });

    expect(screen.queryByRole('slider', { name: '一括音量' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '音 一括設定' }));
    const slider = screen.getByRole('slider', { name: '一括音量' });
    expect(slider).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: '一括音量設定' }));
    expect(onToggleBulkEnabled).toHaveBeenCalledWith(true);
  });

  it('一括ミュートのチェックで全動画ミュートを通知する', () => {
    const onToggleBulkMuted = vi.fn();
    renderPanel({ items: [createVideo()], onToggleBulkMuted });

    fireEvent.click(screen.getByRole('button', { name: '音 一括設定' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '一括ミュート' }));
    expect(onToggleBulkMuted).toHaveBeenCalledWith(true);
  });

  it('音量揃えONのとき各動画の補正表示と合わせ方を出す', () => {
    const onChangeNormalizeMode = vi.fn();
    renderPanel({
      items: [
        createVideo({ id: 'quiet', file: new File(['a'], 'quiet.mp4', { type: 'video/mp4' }), audioNormalizeGain: 2 }),
        createVideo({ id: 'loud', file: new File(['b'], 'loud.mp4', { type: 'video/mp4' }), audioNormalizeGain: 0.5 }),
      ],
      normalizeEnabled: true,
      onChangeNormalizeMode,
    });

    fireEvent.click(screen.getByRole('button', { name: '音 一括設定' }));
    expect(screen.getByTestId('clip-audio-normalize-list')).toBeInTheDocument();
    expect(screen.getByText('揃え +6.0 dB')).toBeInTheDocument();
    expect(screen.getByText('揃え -6.0 dB')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '最大に揃える' }));
    expect(onChangeNormalizeMode).toHaveBeenCalledWith('loudest');
    expect(screen.queryByRole('checkbox', { name: /quiet\.mp4/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('動画が無くても一括ミュート・一括音量と音量揃えのチェックは操作できる', () => {
    const onToggleBulkEnabled = vi.fn();
    const onToggleNormalizeEnabled = vi.fn();
    const onToggleBulkMuted = vi.fn();
    renderPanel({
      items: [],
      bulkEnabled: true,
      bulkVolume: 0.6,
      normalizeEnabled: true,
      onToggleBulkEnabled,
      onToggleNormalizeEnabled,
      onToggleBulkMuted,
    });

    fireEvent.click(screen.getByRole('button', { name: '音 一括設定' }));
    expect(screen.getByRole('checkbox', { name: '一括ミュート' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '一括音量設定' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '音量を揃える' })).toBeChecked();
    expect(screen.getByRole('slider', { name: '一括音量' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: '一括音量設定' }));
    expect(onToggleBulkEnabled).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('checkbox', { name: '一括ミュート' }));
    expect(onToggleBulkMuted).toHaveBeenCalledWith(true);
  });

  it('動画が無くても一括ミュートONを表示できる', () => {
    renderPanel({ items: [], bulkMuted: true });
    fireEvent.click(screen.getByRole('button', { name: '音 一括設定' }));
    expect(screen.getByRole('checkbox', { name: '一括ミュート' })).toBeChecked();
  });

  it('音量揃えのファイル一覧は約5件で打ち切り、残りはスクロールする', () => {
    const files = Array.from({ length: CLIP_AUDIO_NORMALIZE_VISIBLE_FILE_COUNT + 2 }, (_, index) =>
      createVideo({
        id: `v${index + 1}`,
        file: new File(['x'], `clip-${index + 1}.mp4`, { type: 'video/mp4' }),
      }),
    );
    renderPanel({
      items: files,
      normalizeEnabled: true,
    });

    fireEvent.click(screen.getByRole('button', { name: '音 一括設定' }));
    const fileList = screen.getByTestId('clip-audio-normalize-files');
    expect(fileList).toHaveClass('overflow-y-auto');
    expect(fileList.className).toMatch(/max-h-\[calc\(5\*/);
    expect(screen.getByText('1. clip-1.mp4')).toBeInTheDocument();
    expect(screen.getByText('7. clip-7.mp4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '平均に揃える' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '最大に揃える' })).toBeInTheDocument();
  });

  it('BGM向けの説明文を出す', () => {
    renderPanel({
      kind: 'bgm',
      items: [],
      normalizeEnabled: true,
    });
    fireEvent.click(screen.getByRole('button', { name: '音 一括設定' }));
    expect(screen.getByText('チェックを入れると、すべてのBGMをミュートします。曲がまだ無くても先に有効にでき、あとから追加したBGMにもすぐ適用します。')).toBeInTheDocument();
    expect(screen.getByText('比較するBGMが2本以上あるときに揃えます。')).toBeInTheDocument();
  });

  it('説明文の文字サイズを揃える', () => {
    renderPanel({
      items: [createVideo()],
      normalizeEnabled: true,
    });
    fireEvent.click(screen.getByRole('button', { name: '音 一括設定' }));
    const hints = [
      'チェックを入れると、すべての動画をミュートします。動画がまだ無くても先に有効にでき、あとから追加した動画にもすぐ適用します。',
      'チェックを入れると、すべての動画カードの音量を同じ値に揃えます。個別スライダーは無効になります。',
      'カードごとの音の大小を揃えます。動画を減らしても設定は残し、追加した動画にもそのまま適用します。',
      '小さい音は上げ、大きい音は下げます。極端に小さい素材が多いと、全体が小さめに寄ります。',
      '比較する動画が2本以上あるときに揃えます。',
    ];
    for (const text of hints) {
      expect(screen.getByText(text)).toHaveClass('text-[10px]');
    }
  });
});
