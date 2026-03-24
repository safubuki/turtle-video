import { act, cleanup, fireEvent, render } from '@testing-library/react';
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
  lastAutoSave: null as string | null,
  lastManualSave: null as string | null,
  lastSaveFailure: null as null | {
    operation: 'manual' | 'auto';
    reason: string;
    occurredAt: string;
    recoveryAction: 'delete-auto-and-retry' | 'reset-database-and-retry' | 'inspect-media' | 'retry';
    storageEstimate: { usage: number; quota: number } | null;
  },
  saveProjectManual: vi.fn(),
  loadProjectFromSlot: vi.fn(),
  deleteAllSaves: vi.fn(),
  deleteAutoSaveOnly: vi.fn(),
  resetSaveDatabase: vi.fn(),
  refreshSaveInfo: vi.fn(),
  clearLastSaveFailure: vi.fn(),
};

const mediaStoreState = {
  mediaItems: [] as Array<{ id: string; type: string; file: File }>,
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
  captions: [] as Array<Record<string, unknown>>,
  settings: {} as Record<string, unknown>,
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

vi.mock('../stores/projectStore', () => {
  const store = Object.assign(
    () => projectStoreState,
    {
      getState: () => projectStoreState,
    },
  );

  return {
    useProjectStore: store,
    isStorageQuotaError: () => false,
    getProjectStoreErrorMessage: () => 'error',
  };
});

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
    supportsShowOpenFilePicker: false,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  projectStoreState.isSaving = false;
  projectStoreState.isLoading = false;
  projectStoreState.lastAutoSave = null;
  projectStoreState.lastManualSave = null;
  projectStoreState.lastSaveFailure = null;
  projectStoreState.resetSaveDatabase.mockReset();
  projectStoreState.clearLastSaveFailure.mockReset();
  projectStoreState.refreshSaveInfo.mockReset();
  projectStoreState.saveProjectManual.mockReset();
  mediaStoreState.mediaItems = [];
  captionStoreState.captions = [];
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

  it('SaveLoadModal は保存失敗後に DB 初期化リトライ導線へ遷移できる', async () => {
    mediaStoreState.mediaItems = [
      {
        id: 'media-1',
        type: 'image',
        file: new File(['dummy'], 'dummy.png', { type: 'image/png' }),
      },
    ];
    projectStoreState.lastSaveFailure = {
      operation: 'manual',
      reason: 'AbortError: transaction aborted',
      occurredAt: '2026-03-17T00:00:00.000Z',
      recoveryAction: 'reset-database-and-retry',
      storageEstimate: null,
    };
    projectStoreState.saveProjectManual
      .mockRejectedValueOnce(new Error('AbortError: transaction aborted'))
      .mockResolvedValueOnce(undefined);
    projectStoreState.refreshSaveInfo.mockResolvedValue(undefined);
    projectStoreState.resetSaveDatabase.mockResolvedValue(undefined);

    const onClose = vi.fn();
    const onToast = vi.fn();
    const { findByText, getByRole } = render(
      <SaveLoadModal
        isOpen={true}
        onClose={onClose}
        onToast={onToast}
      />,
    );

    fireEvent.click(getByRole('button', { name: '手動保存' }));

    await findByText('保存DBの復旧');

    fireEvent.click(getByRole('button', { name: '初期化して保存' }));

    await vi.waitFor(() => {
      expect(projectStoreState.resetSaveDatabase).toHaveBeenCalledTimes(1);
      expect(projectStoreState.saveProjectManual).toHaveBeenCalledTimes(2);
      expect(onToast).toHaveBeenCalledWith('保存しました', 'success');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('SaveLoadModal は表示中に相対時刻表示を更新し、将来時刻は「たった今」に丸める', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T12:00:00.000Z'));
    projectStoreState.lastAutoSave = '2026-03-24T11:59:10.000Z';
    projectStoreState.lastManualSave = '2026-03-24T12:10:00.000Z';

    const { getAllByText } = render(
      <SaveLoadModal
        isOpen={true}
        onClose={() => {}}
        onToast={() => {}}
      />,
    );

    expect(getAllByText('たった今').length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150_000);
    });

    expect(getAllByText('3分前').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('たった今').length).toBeGreaterThanOrEqual(1);

    vi.useRealTimers();
  });
});
