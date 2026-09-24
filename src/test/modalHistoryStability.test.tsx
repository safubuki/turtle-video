import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppFlavor } from '../app/resolveAppFlavor';
import type { ProjectPersistenceHealthSnapshot } from '../stores/projectPersistenceHealth';
import type { SaveFailureInfo } from '../stores/projectStore';
import type { ManualProjectSummary, ManualSaveSlot } from '../utils/indexedDB';
import SettingsModal from '../components/modals/SettingsModal';
import SaveLoadModal from '../components/modals/SaveLoadModal';
import CaptionBulkAddModal from '../components/modals/CaptionBulkAddModal';

let autoSaveIntervalValue = 1;

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
  isApplyingUpdate: false,
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
  autoThumbnailDataUrl: null as string | null,
  lastAutoSaveActivityAt: null as string | null,
  autoSaveRuntimeStatus: 'idle' as 'idle' | 'running' | 'saved' | 'skipped-nochange' | 'skipped-empty' | 'paused-processing' | 'failed',
  autoSaveRestartToken: 0,
  lastManualSave: null as string | null,
  manualProjects: { manual: null, 'manual-2': null, 'manual-3': null } as Record<ManualSaveSlot, ManualProjectSummary | null>,
  lastSaveFailure: null as SaveFailureInfo | null,
  saveHealth: null as ProjectPersistenceHealthSnapshot | null,
  saveHealthError: null as string | null,
  saveProjectManual: vi.fn(),
  loadProjectFromSlot: vi.fn(),
  deleteAllSaves: vi.fn(),
  deleteManualProject: vi.fn(),
  deleteAllManualProjects: vi.fn(),
  renameManualProject: vi.fn(),
  deleteAutoSaveOnly: vi.fn(),
  resetSaveDatabase: vi.fn(),
  refreshSaveInfo: vi.fn().mockResolvedValue(undefined),
  refreshSaveHealth: vi.fn().mockResolvedValue(undefined),
  requestAutoSaveRestart: vi.fn(),
  clearLastSaveFailure: vi.fn(),
  clearSaveHealthError: vi.fn(),
};

const mediaStoreState = {
  mediaItems: [] as Array<{ id: string; type: string; file: File }>,
  projectPosterDataUrl: null as string | null,
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
  title: { text: '' },
  settings: {} as Record<string, unknown>,
  isLocked: false,
  restoreFromSave: vi.fn(),
};

const saveLoadLogState = {
  info: vi.fn(),
  error: vi.fn(),
};

const saveRuntime = {
  configureProjectStore: vi.fn(),
  getPlatformCapabilities: vi.fn(() => ({
    userAgent: 'test-agent',
    platform: 'test-platform',
    maxTouchPoints: 0,
    isAndroid: false,
    isIOS: false,
    isSafari: false,
    isIosSafari: false,
    supportsShowSaveFilePicker: false,
    supportsShowOpenFilePicker: false,
    supportsTrackProcessor: false,
    supportsMp4MediaRecorder: false,
    audioContextMayInterrupt: false,
    supportedMediaRecorderProfile: null,
  })),
  saveBlobWithClientFileStrategy: vi.fn(),
  getPersistenceHealth: vi.fn().mockResolvedValue(null),
};

const defaultAppFlavor: AppFlavor = 'standard';

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
  useMediaStore: Object.assign(
    (selector: (state: typeof mediaStoreState) => unknown) => selector(mediaStoreState),
    { getState: () => mediaStoreState },
  ),
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
  getAutoSaveInterval: vi.fn(() => autoSaveIntervalValue),
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
  projectStoreState.autoThumbnailDataUrl = null;
  projectStoreState.lastAutoSaveActivityAt = null;
  projectStoreState.autoSaveRuntimeStatus = 'idle';
  projectStoreState.lastManualSave = null;
  projectStoreState.manualProjects = { manual: null, 'manual-2': null, 'manual-3': null };
  projectStoreState.lastSaveFailure = null;
  projectStoreState.saveHealth = null;
  projectStoreState.saveHealthError = null;
  projectStoreState.requestAutoSaveRestart.mockReset();
  projectStoreState.resetSaveDatabase.mockReset();
  projectStoreState.clearLastSaveFailure.mockReset();
  projectStoreState.clearSaveHealthError.mockReset();
  projectStoreState.refreshSaveInfo.mockReset();
  projectStoreState.refreshSaveHealth.mockReset();
  projectStoreState.saveProjectManual.mockReset();
  projectStoreState.deleteAutoSaveOnly.mockReset();
  projectStoreState.deleteManualProject.mockReset();
  projectStoreState.deleteAllManualProjects.mockReset();
  projectStoreState.renameManualProject.mockReset();
  saveRuntime.configureProjectStore.mockReset();
  saveRuntime.getPlatformCapabilities.mockClear();
  saveRuntime.saveBlobWithClientFileStrategy.mockReset();
  saveRuntime.getPersistenceHealth.mockReset();
  autoSaveIntervalValue = 1;
  mediaStoreState.mediaItems = [];
  captionStoreState.captions = [];
});

describe('modal history stability', () => {
  it('既存枠は確認してから上書きし、名前はクリックして変更できる', async () => {
    mediaStoreState.mediaItems = [{ id: 'media-1', type: 'image', file: new File(['x'], 'x.png') }];
    projectStoreState.manualProjects.manual = {
      slot: 'manual', projectId: 'project-1', title: '旅行',
      savedAt: '2026-09-24T00:00:00.000Z', durationSec: 67,
      thumbnailDataUrl: 'data:image/jpeg;base64,abc',
    };
    projectStoreState.saveProjectManual.mockResolvedValue(undefined);
    projectStoreState.renameManualProject.mockResolvedValue(undefined);
    const { getAllByRole, getByRole, getByText } = render(
      <SaveLoadModal isOpen onClose={() => {}} onToast={() => {}} appFlavor={defaultAppFlavor} saveRuntime={saveRuntime} />,
    );
    expect(getByText('動画 1:07', { exact: false })).toBeTruthy();
    fireEvent.click(getByRole('button', { name: '①の名前を編集' }));
    fireEvent.change(getByRole('textbox', { name: '保存名' }), { target: { value: '新しい旅行' } });
    await act(async () => {
      fireEvent.click(getAllByRole('button', { name: '保存' })[0]);
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(projectStoreState.renameManualProject).toHaveBeenCalledWith('manual', '新しい旅行'));

    const slots = getByRole('region', { name: '手動保存の3枠' });
    fireEvent.click(within(slots).getAllByRole('button', { name: '保存' })[0]);
    expect(getByRole('button', { name: '上書き保存' })).toBeTruthy();
    fireEvent.click(getByRole('button', { name: 'キャンセル' }));
    expect(projectStoreState.saveProjectManual).not.toHaveBeenCalled();
  });

  it('既存枠の上書き確認後は対象枠と確認時刻を渡して保存する', async () => {
    mediaStoreState.mediaItems = [{ id: 'media-1', type: 'image', file: new File(['x'], 'x.png') }];
    projectStoreState.manualProjects.manual = {
      slot: 'manual', projectId: 'project-1', title: '旅行',
      savedAt: '2026-09-24T00:00:00.000Z', durationSec: 67,
      thumbnailDataUrl: null,
    };
    projectStoreState.saveProjectManual.mockResolvedValue(undefined);
    const onClose = vi.fn();
    const { getByRole } = render(
      <SaveLoadModal isOpen onClose={onClose} onToast={() => {}} appFlavor={defaultAppFlavor} saveRuntime={saveRuntime} />,
    );
    fireEvent.click(within(getByRole('region', { name: '手動保存の3枠' })).getAllByRole('button', { name: '保存' })[0]);
    await act(async () => {
      fireEvent.click(getByRole('button', { name: '上書き保存' }));
      await Promise.resolve();
    });
    expect(projectStoreState.saveProjectManual).toHaveBeenCalledTimes(1);
    expect(projectStoreState.saveProjectManual.mock.calls[0][10]).toMatchObject({
      slot: 'manual', expectedSavedAt: '2026-09-24T00:00:00.000Z',
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(getByRole('region', { name: '手動保存の3枠' })).toBeTruthy();
    expect(() => getByRole('button', { name: '保存先を選んで手動保存' })).toThrow();
  });

  it('手動3枠の一括削除は確認後だけ行い、自動保存を消さない', async () => {
    projectStoreState.lastAutoSave = '2026-09-24T00:00:00.000Z';
    projectStoreState.manualProjects['manual-2'] = {
      slot: 'manual-2', projectId: 'project-2', title: '',
      savedAt: '2026-09-24T00:00:00.000Z', durationSec: 12,
      thumbnailDataUrl: null,
    };
    projectStoreState.deleteAllManualProjects.mockResolvedValue(undefined);
    const { getByRole, getByText } = render(
      <SaveLoadModal isOpen onClose={() => {}} onToast={() => {}} appFlavor={defaultAppFlavor} saveRuntime={saveRuntime} />,
    );
    fireEvent.click(getByRole('button', { name: '手動保存データのみ削除' }));
    expect(getByText(/自動保存は残ります/)).toBeTruthy();
    fireEvent.click(getByRole('button', { name: 'キャンセル' }));
    expect(projectStoreState.deleteAllManualProjects).not.toHaveBeenCalled();
    fireEvent.click(getByRole('button', { name: '手動保存データのみ削除' }));
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'すべて削除' }));
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(projectStoreState.deleteAllManualProjects).toHaveBeenCalledTimes(1));
    expect(projectStoreState.deleteAllSaves).not.toHaveBeenCalled();
  });

  it('個別削除は確認した枠だけを削除する', async () => {
    projectStoreState.manualProjects['manual-3'] = {
      slot: 'manual-3', projectId: 'project-3', title: '家族',
      savedAt: '2026-09-24T00:00:00.000Z', durationSec: 28,
      thumbnailDataUrl: null,
    };
    projectStoreState.deleteManualProject.mockResolvedValue(undefined);
    const { getByRole } = render(
      <SaveLoadModal isOpen onClose={() => {}} onToast={() => {}} appFlavor={defaultAppFlavor} saveRuntime={saveRuntime} />,
    );
    const slots = getByRole('region', { name: '手動保存の3枠' });
    fireEvent.click(within(slots).getAllByRole('button', { name: '削除' })[2]);
    expect(getByRole('button', { name: '削除する' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(getByRole('button', { name: '削除する' }));
      await Promise.resolve();
    });
    expect(projectStoreState.deleteManualProject).toHaveBeenCalledWith('manual-3');
    expect(projectStoreState.deleteAllManualProjects).not.toHaveBeenCalled();
  });

  it('自動保存カードは画像と操作を表示し、確認後に自動保存だけを削除する', async () => {
    projectStoreState.lastAutoSave = '2026-09-24T00:00:00.000Z';
    projectStoreState.autoThumbnailDataUrl = 'data:image/jpeg;base64,auto';
    projectStoreState.deleteAutoSaveOnly.mockResolvedValue(undefined);
    const { getByRole, getByText } = render(
      <SaveLoadModal isOpen onClose={() => {}} onToast={() => {}} appFlavor={defaultAppFlavor} saveRuntime={saveRuntime} />,
    );
    const autoCard = getByRole('region', { name: '自動保存' });
    expect(autoCard.querySelector('img')?.getAttribute('src')).toBe(projectStoreState.autoThumbnailDataUrl);
    expect(within(autoCard).getByRole('button', { name: '読み込み' })).toBeTruthy();
    fireEvent.click(within(autoCard).getByRole('button', { name: '削除' }));
    expect(getByText(/手動保存①②③は残ります/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(getByRole('button', { name: '削除する' }));
      await Promise.resolve();
    });
    expect(projectStoreState.deleteAutoSaveOnly).toHaveBeenCalledTimes(1);
    expect(projectStoreState.deleteAllSaves).not.toHaveBeenCalled();
  });
  it('CaptionBulkAddModal は StrictMode の effect 再実行で閉じない', async () => {
    const onClose = vi.fn();
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      void Promise.resolve().then(() => window.dispatchEvent(new PopStateEvent('popstate')));
    });
    const { getByRole, unmount } = render(
      <StrictMode>
        <CaptionBulkAddModal
          captions={[]}
          totalDuration={30}
          currentTime={0}
          formatTime={(seconds) => `${seconds.toFixed(1)}s`}
          onApplyCaptions={() => {}}
          onClose={onClose}
        />
      </StrictMode>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getByRole('dialog', { name: 'キャプションをまとめて入力' })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(backSpy).not.toHaveBeenCalled();

    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    backSpy.mockRestore();
  });

  it('SettingsModal は親の再描画で history.back を呼ばない', () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { rerender, unmount } = render(<SettingsModal appFlavor={defaultAppFlavor} isOpen={true} onClose={() => {}} />);

    rerender(<SettingsModal appFlavor={defaultAppFlavor} isOpen={true} onClose={() => undefined} />);

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
        appFlavor={defaultAppFlavor}
        saveRuntime={saveRuntime}
      />,
    );

    fireEvent.click(getByRole('button', { name: '1分' }));
    rerender(
      <SaveLoadModal
        isOpen={true}
        onClose={() => undefined}
        onToast={() => undefined}
        appFlavor={defaultAppFlavor}
        saveRuntime={saveRuntime}
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
      operationId: 'manual-save-test-00001',
      operation: 'manual',
      category: 'indexeddb-transaction',
      reason: 'AbortError: transaction aborted',
      occurredAt: '2026-03-17T00:00:00.000Z',
      recoveryAction: 'reset-database-and-retry',
      storageEstimate: null,
      persistenceMode: null,
      launchContext: null,
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
        appFlavor={defaultAppFlavor}
        saveRuntime={saveRuntime}
      />,
    );

    fireEvent.click(within(getByRole('region', { name: '手動保存の3枠' })).getAllByRole('button', { name: '保存' })[0]);

    await findByText('保存DBの復旧');

    await act(async () => {
      fireEvent.click(getByRole('button', { name: '初期化して保存' }));
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(projectStoreState.resetSaveDatabase).toHaveBeenCalledTimes(1);
      expect(projectStoreState.saveProjectManual).toHaveBeenCalledTimes(2);
      expect(onToast).toHaveBeenCalledWith('①に保存しました', 'success');
      expect(onClose).not.toHaveBeenCalled();
      expect(getByRole('region', { name: '手動保存の3枠' })).toBeTruthy();
    });
  });

  it('SaveLoadModal は表示中に相対時刻表示を更新し、将来時刻は「たった今」に丸める', async () => {
    vi.useFakeTimers();
    autoSaveIntervalValue = 5;
    vi.setSystemTime(new Date('2026-03-24T12:00:00.000Z'));
    projectStoreState.lastAutoSave = '2026-03-24T11:59:10.000Z';
    projectStoreState.lastAutoSaveActivityAt = '2026-03-24T11:59:10.000Z';
    projectStoreState.manualProjects.manual = {
      slot: 'manual', projectId: 'future-project', title: '',
      savedAt: '2026-03-24T12:10:00.000Z', durationSec: 1,
      thumbnailDataUrl: null,
    };

    const { getAllByText, getByText } = render(
      <SaveLoadModal
        isOpen={true}
        onClose={() => {}}
        onToast={() => {}}
        appFlavor={defaultAppFlavor}
        saveRuntime={saveRuntime}
      />,
    );

    expect(getAllByText('たった今').length).toBeGreaterThanOrEqual(1);
    expect(getByText(/動画 0:01 ・ たった今/)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150_000);
    });

    expect(getAllByText('3分前').length).toBeGreaterThanOrEqual(1);
    expect(getByText(/動画 0:01 ・ たった今/)).toBeTruthy();

    vi.useRealTimers();
  });

  it('SaveLoadModal は自動保存の活動時刻と前回保存日時を分けて表示し、停止疑い時は再始動できる', () => {
    vi.useFakeTimers();
    autoSaveIntervalValue = 5;
    vi.setSystemTime(new Date('2026-03-24T12:00:00.000Z'));
    projectStoreState.lastAutoSave = '2026-03-24T11:50:00.000Z';
    projectStoreState.lastAutoSaveActivityAt = '2026-03-24T11:58:00.000Z';
    projectStoreState.autoSaveRuntimeStatus = 'skipped-nochange';

    const { getByText, rerender, getByRole } = render(
      <SaveLoadModal
        isOpen={true}
        onClose={() => {}}
        onToast={() => {}}
        appFlavor={defaultAppFlavor}
        saveRuntime={saveRuntime}
      />,
    );

    expect(getByText('2分前')).toBeTruthy();
    const expectedLastAutoSaveText = new Date(
      projectStoreState.lastAutoSave as string,
    ).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    expect(
      getByText(
        new RegExp(
          `前回保存日時: ${expectedLastAutoSaveText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        ),
      ),
    ).toBeTruthy();

    projectStoreState.lastAutoSaveActivityAt = '2026-03-24T11:54:00.000Z';

    rerender(
      <SaveLoadModal
        isOpen={true}
        onClose={() => {}}
        onToast={() => {}}
        appFlavor={defaultAppFlavor}
        saveRuntime={saveRuntime}
      />,
    );

    expect(getByText('要確認')).toBeTruthy();

    fireEvent.click(getByRole('button', { name: '自動保存を再始動' }));

    expect(projectStoreState.requestAutoSaveRestart).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('SaveLoadModal は apple-safari flavor で Safari 向け保存案内を表示する', () => {
    const { getByLabelText, getByText } = render(
      <SaveLoadModal
        isOpen={true}
        onClose={() => {}}
        onToast={() => {}}
        appFlavor="apple-safari"
        saveRuntime={saveRuntime}
      />,
    );

    fireEvent.click(getByLabelText('保存・素材の説明'));

    expect(getByText('Apple Safari 動作モード')).toBeTruthy();
    expect(getByText(/通常タブ、ホーム画面追加、プライベートブラウズ/)).toBeTruthy();
  });

  it('CaptionBulkAddModal は親の再描画で history.back を呼ばない', () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { rerender, unmount } = render(
      <CaptionBulkAddModal
        captions={[]}
        totalDuration={30}
        currentTime={0}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
        onApplyCaptions={() => {}}
        onClose={() => {}}
      />,
    );

    rerender(
      <CaptionBulkAddModal
        captions={[]}
        totalDuration={30}
        currentTime={0}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
        onApplyCaptions={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(backSpy).not.toHaveBeenCalled();

    unmount();
    backSpy.mockRestore();
  });

  it('CaptionBulkAddModal は端末の戻る操作（popstate）で閉じる', () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <CaptionBulkAddModal
        captions={[]}
        totalDuration={30}
        currentTime={0}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
        onApplyCaptions={() => {}}
        onClose={onClose}
      />,
    );

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });
});
