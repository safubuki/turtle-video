import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NarrationSection from '../components/sections/NarrationSection';
import type { NarrationClip } from '../types';

const createNarrationClip = (overrides: Partial<NarrationClip> = {}): NarrationClip => {
  const duration = overrides.duration ?? 12;
  const trimStart = overrides.trimStart ?? 0;
  const trimEnd = overrides.trimEnd ?? duration;

  return {
    id: overrides.id ?? 'narration-1',
    sourceType: overrides.sourceType ?? 'file',
    file: overrides.file ?? new File([''], 'narration.wav', { type: 'audio/wav' }),
    url: overrides.url ?? 'blob:narration',
    startTime: overrides.startTime ?? 0,
    volume: overrides.volume ?? 1,
    isMuted: overrides.isMuted ?? false,
    trimStart,
    trimEnd,
    duration,
    isAiEditable: overrides.isAiEditable ?? false,
    blobUrl: overrides.blobUrl,
    aiScript: overrides.aiScript,
    aiVoice: overrides.aiVoice,
    aiVoiceStyle: overrides.aiVoiceStyle,
  };
};

describe('NarrationSection offline mode', () => {
  it('オフライン時は AI 追加と AI 編集だけを無効化する', () => {
    const narrations: NarrationClip[] = [
      createNarrationClip({
        id: 'ai-clip',
        sourceType: 'ai',
        isAiEditable: true,
        file: new File([''], 'ai.wav', { type: 'audio/wav' }),
      }),
      createNarrationClip({
        id: 'file-clip',
        sourceType: 'file',
        isAiEditable: false,
        file: new File([''], 'file.wav', { type: 'audio/wav' }),
      }),
    ];

    render(
      <NarrationSection
        narrations={narrations}
        offlineMode={true}
        isNarrationLocked={false}
        isCaptionLocked={false}
        totalDuration={30}
        currentTime={0}
        onToggleNarrationLock={vi.fn()}
        onAddAiNarration={vi.fn()}
        onEditAiNarration={vi.fn()}
        onNarrationUpload={vi.fn()}
        onRemoveNarration={vi.fn()}
        onMoveNarration={vi.fn()}
        onSaveNarration={vi.fn()}
        onAddCaptionsFromNarration={vi.fn()}
        onUpdateStartTime={vi.fn()}
        onSetStartTimeToCurrent={vi.fn()}
        onSetEndTimeToCurrent={vi.fn()}
        onUpdateVolume={vi.fn()}
        onToggleMute={vi.fn()}
        onUpdateTrimStart={vi.fn()}
        onUpdateTrimEnd={vi.fn()}
        formatTime={(value) => `${value.toFixed(1)}s`}
        onOpenHelp={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'AI' })).toBeDisabled();
    expect(screen.getByText('(2件)')).toBeInTheDocument();

    fireEvent.click(screen.getByText('ナレーション'));

    expect(screen.getByTitle('オフラインモードではAI編集できません')).toBeDisabled();
    expect(screen.getAllByTitle('下へ移動')[0]).toBeEnabled();
  });

  it('AI原稿があるカードからキャプション追加を実行し、キャプションロック中は無効化する', () => {
    const onAddCaptionsFromNarration = vi.fn();
    const aiClip = createNarrationClip({
      id: 'ai-caption-source',
      sourceType: 'ai',
      isAiEditable: true,
      aiScript: 'ナレーションと同じ原稿です。',
    });

    const { rerender } = render(
      <NarrationSection
        narrations={[aiClip]}
        offlineMode={false}
        isNarrationLocked={false}
        isCaptionLocked={false}
        totalDuration={30}
        currentTime={0}
        onToggleNarrationLock={vi.fn()}
        onAddAiNarration={vi.fn()}
        onEditAiNarration={vi.fn()}
        onNarrationUpload={vi.fn()}
        onRemoveNarration={vi.fn()}
        onMoveNarration={vi.fn()}
        onSaveNarration={vi.fn()}
        onAddCaptionsFromNarration={onAddCaptionsFromNarration}
        onUpdateStartTime={vi.fn()}
        onSetStartTimeToCurrent={vi.fn()}
        onSetEndTimeToCurrent={vi.fn()}
        onUpdateVolume={vi.fn()}
        onToggleMute={vi.fn()}
        onUpdateTrimStart={vi.fn()}
        onUpdateTrimEnd={vi.fn()}
        formatTime={(value) => `${value.toFixed(1)}s`}
        onOpenHelp={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('ナレーション'));
    const addButton = screen.getByRole('button', { name: 'キャプションカードを追加' });
    expect(addButton).toBeEnabled();
    fireEvent.click(addButton);
    expect(onAddCaptionsFromNarration).toHaveBeenCalledWith('ai-caption-source');

    rerender(
      <NarrationSection
        narrations={[aiClip]}
        offlineMode={false}
        isNarrationLocked={false}
        isCaptionLocked={true}
        totalDuration={30}
        currentTime={0}
        onToggleNarrationLock={vi.fn()}
        onAddAiNarration={vi.fn()}
        onEditAiNarration={vi.fn()}
        onNarrationUpload={vi.fn()}
        onRemoveNarration={vi.fn()}
        onMoveNarration={vi.fn()}
        onSaveNarration={vi.fn()}
        onAddCaptionsFromNarration={onAddCaptionsFromNarration}
        onUpdateStartTime={vi.fn()}
        onSetStartTimeToCurrent={vi.fn()}
        onSetEndTimeToCurrent={vi.fn()}
        onUpdateVolume={vi.fn()}
        onToggleMute={vi.fn()}
        onUpdateTrimStart={vi.fn()}
        onUpdateTrimEnd={vi.fn()}
        formatTime={(value) => `${value.toFixed(1)}s`}
        onOpenHelp={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'キャプションカードを追加' })).toBeDisabled();
  });
});
