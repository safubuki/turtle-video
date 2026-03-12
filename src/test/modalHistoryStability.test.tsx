import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsModal from '../components/modals/SettingsModal';
import SaveLoadModal from '../components/modals/SaveLoadModal';

const logStoreState = {
  entries: [],
  hasError: false,
  clearLogs: vi.fn(),
  clearErrorFlag: vi.fn(),
  exportLogs: vi.fn(() => '[]'),
};

const uiStoreState = {
  showToast: vi.fn(),
};

const offlineModeStoreState = {
  offlineMode: false,
  setOfflineMode: vi.fn(),
  hydrateOfflineMode: vi.fn(),
};

const updateStoreState = {
  needRefresh: false,
  offlineReady: false,
  registration: null,
  isCheckingForUpdate: false,
  pendingUpdateCheckAfterRegister: false,
  updateServiceWorker: vi.fn(),
  setNeedRefresh: vi.fn(),
  setOfflineReady: vi.fn(),
  setRegistration: vi.fn(),
  checkForUpdate: vi.fn(),
  queueUpdateCheckAfterRegister: vi.fn(),
  clearPendingUpdateCheck: vi.fn(),
  clearUpdateSignals: vi.fn(),
  setUpdateServiceWorker: vi.fn(),
};

const projectStoreState = {
  isSaving: false,
  isLoading: false,
  lastAutoSave: null,
  lastManualSave: null,
  saveProjectManual: vi.fn(),
  loadProjectFromSlot: vi.fn(),
  deleteAllSaves: vi.fn(),
  deleteAutoSaveOnly: vi.fn(),
  refreshSaveInfo: vi.fn(),
};

const mediaStoreState = {
  mediaItems: [],
  isClipsLocked: false,
  restoreFromSave: vi.fn(),
};

const audioStoreState = {
  bgm: null,
  isBgmLocked: false,
  narrations: [],
  isNarrationLocked: false,
  restoreFromSave: vi.fn(),
};

const captionStoreState = {
  captions: [],
  settings: {},
  isLocked: false,
  restoreFromSave: vi.fn(),
};

const saveLoadLogState = {
  info: vi.fn(),
  error: vi.fn(),
};

vi.mock('../stores', () => ({
  useLogStore: (selector: (state: typeof logStoreState) => unknown) => selector(logStoreState),
}));

vi.mock('../stores/uiStore', () => ({
  useUIStore: (selector: (state: typeof uiStoreState) => unknown) => selector(uiStoreState),
}));

vi.mock('../stores/offlineModeStore', () => ({
  useOfflineModeStore: (selector: (state: typeof offlineModeStoreState) => unknown) => selector(offlineModeStoreState),
}));

vi.mock('../stores/updateStore', () => ({
  useUpdateStore: (selector?: (state: typeof updateStoreState) => unknown) =>
    selector ? selector(updateStoreState) : updateStoreState,
}));

vi.mock('../stores/projectStore', () => ({
  useProjectStore: () => projectStoreState,
  isStorageQuotaError: () => false,
  getProjectStoreErrorMessage: () => 'error',
}));

vi.mock('../stores/mediaStore', () => ({
  useMediaStore: (selector: (state: typeof mediaStoreState) => unknown) => selector(mediaStoreState),
}));

vi.mock('../stores/audioStore', () => ({
  useAudioStore: (selector: (state: typeof audioStoreState) => unknown) => selector(audioStoreState),
}));

vi.mock('../stores/captionStore', () => ({
  useCaptionStore: (selector: (state: typeof captionStoreState) => unknown) => selector(captionStoreState),
}));

vi.mock('../stores/logStore', () => {
  const store = Object.assign(
    () => saveLoadLogState,
    {
      getState: () => saveLoadLogState,
    },
  );

  return { useLogStore: store };
});

vi.mock('../hooks/useAutoSave', () => ({
  getAutoSaveInterval: vi.fn(() => 1),
  setAutoSaveInterval: vi.fn(),
}));

vi.mock('../hooks/useDisableBodyScroll', () => ({
  useDisableBodyScroll: () => {},
}));

vi.mock('../utils/fileSave', () => ({
  saveBlobWithClientFileStrategy: vi.fn(),
}));

vi.mock('../utils/platform', () => ({
  getPlatformCapabilities: () => ({
    supportsShowSaveFilePicker: false,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('modal history stability', () => {
  it('SettingsModal は親の再描画で history.back を呼ばない', () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { rerender, unmount } = render(<SettingsModal isOpen={true} onClose={() => {}} />);

    rerender(<SettingsModal isOpen={true} onClose={() => undefined} />);

    expect(backSpy).not.toHaveBeenCalled();

    unmount();
    backSpy.mockRestore();
  });

  it('SaveLoadModal は自動保存間隔変更後の親再描画で history.back を呼ばない', () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { rerender, unmount, getByRole } = render(
      <SaveLoadModal
        isOpen={true}
        onClose={() => {}}
        onToast={() => {}}
      />,
    );

    fireEvent.click(getByRole('button', { name: '1分' }));
    rerender(
      <SaveLoadModal
        isOpen={true}
        onClose={() => undefined}
        onToast={() => undefined}
      />,
    );

    expect(backSpy).not.toHaveBeenCalled();

    unmount();
    backSpy.mockRestore();
  });
});
