import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiModal from '../components/modals/AiModal';
import SettingsModal from '../components/modals/SettingsModal';

const logStoreState = {
  entries: [],
  hasError: false,
  clearLogs: vi.fn(),
  clearErrorFlag: vi.fn(),
  exportLogs: vi.fn(() => '[]'),
};

const updateStoreState = {
  needRefresh: false,
  updateServiceWorker: vi.fn(),
};

vi.mock('../stores', () => ({
  useLogStore: (selector: (state: typeof logStoreState) => unknown) => selector(logStoreState),
}));

vi.mock('../stores/updateStore', () => ({
  useUpdateStore: () => updateStoreState,
}));

vi.mock('../hooks/useDisableBodyScroll', () => ({
  useDisableBodyScroll: () => {},
}));

const mockMobileViewport = () => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(max-width: 767px)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
};

const renderAiModal = (onClose = vi.fn()) => {
  const result = render(
    <AiModal
      isOpen={true}
      onClose={onClose}
      aiPrompt=""
      aiScript=""
      aiScriptLength="short"
      aiVoice="Aoede"
      aiVoiceStyle=""
      isAiLoading={false}
      voiceOptions={[{ id: 'Aoede', label: 'Aoede', desc: 'default' }]}
      onPromptChange={() => {}}
      onScriptChange={() => {}}
      onScriptLengthChange={() => {}}
      onVoiceChange={() => {}}
      onVoiceStyleChange={() => {}}
      onGenerateScript={() => {}}
      onGenerateSpeech={() => {}}
    />
  );

  return { ...result, onClose };
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('modal backdrop behavior', () => {
  it('SettingsModal は領域外クリックで閉じる', () => {
    const onClose = vi.fn();
    const { container } = render(<SettingsModal isOpen={true} onClose={onClose} />);

    fireEvent.click(container.firstChild as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('AiModal は領域外クリックでは閉じない', () => {
    const { container, onClose } = renderAiModal();

    fireEvent.click(container.firstChild as HTMLElement);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('AiModal は textarea からの下スワイプでは閉じない', () => {
    mockMobileViewport();
    const { container, onClose } = renderAiModal();
    const textarea = container.querySelector('textarea');

    expect(textarea).not.toBeNull();

    fireEvent.touchStart(textarea as HTMLElement, {
      touches: [{ clientX: 120, clientY: 100 }],
    });
    fireEvent.touchMove(textarea as HTMLElement, {
      touches: [{ clientX: 122, clientY: 196 }],
    });
    fireEvent.touchEnd(textarea as HTMLElement);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('AiModal は上端のシートを下スワイプすると閉じる', () => {
    mockMobileViewport();
    const { container, onClose } = renderAiModal();
    const sheetScrollArea = container.querySelector('div.overflow-y-auto');

    expect(sheetScrollArea).not.toBeNull();

    fireEvent.touchStart(sheetScrollArea as HTMLElement, {
      touches: [{ clientX: 140, clientY: 100 }],
    });
    fireEvent.touchMove(sheetScrollArea as HTMLElement, {
      touches: [{ clientX: 142, clientY: 196 }],
    });
    fireEvent.touchEnd(sheetScrollArea as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
