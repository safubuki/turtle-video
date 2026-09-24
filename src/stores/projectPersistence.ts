import {
  saveProject as saveProjectToIndexedDb,
  loadProject as loadProjectFromIndexedDb,
  deleteProject as deleteProjectFromIndexedDb,
  deleteAllProjects as deleteAllProjectsFromIndexedDb,
  resetProjectDatabase as resetProjectDatabaseInIndexedDb,
  getAutoSaveSummary as getAutoSaveSummaryFromIndexedDb,
  getManualProjectSummaries as getManualProjectSummariesFromIndexedDb,
  renameManualProject as renameManualProjectInIndexedDb,
  deleteManualProjects as deleteManualProjectsFromIndexedDb,
  getStorageEstimate as getStorageEstimateFromIndexedDb,
  fileToArrayBuffer as fileToArrayBufferFromIndexedDb,
  blobUrlToArrayBuffer as blobUrlToArrayBufferFromIndexedDb,
  arrayBufferToFile as arrayBufferToFileFromIndexedDb,
} from '../utils/indexedDB';

export { MANUAL_SAVE_SLOTS } from '../utils/indexedDB';

export type {
  ProjectData,
  SaveSlot,
  ManualSaveSlot,
  ManualProjectSummary,
  AutoSaveSummary,
  SerializedAudioTrack,
  SerializedCaption,
  SerializedMediaItem,
  SerializedNarrationClip,
  SerializedWatermarkOverlay,
  SerializedEndrollOverlay,
} from '../utils/indexedDB';

export interface ProjectPersistenceAdapter {
  saveProject: typeof saveProjectToIndexedDb;
  loadProject: typeof loadProjectFromIndexedDb;
  deleteProject: typeof deleteProjectFromIndexedDb;
  deleteAllProjects: typeof deleteAllProjectsFromIndexedDb;
  resetProjectDatabase: typeof resetProjectDatabaseInIndexedDb;
  getAutoSaveSummary: typeof getAutoSaveSummaryFromIndexedDb;
  getManualProjectSummaries: typeof getManualProjectSummariesFromIndexedDb;
  renameManualProject: typeof renameManualProjectInIndexedDb;
  deleteManualProjects: typeof deleteManualProjectsFromIndexedDb;
  getStorageEstimate: typeof getStorageEstimateFromIndexedDb;
  fileToArrayBuffer: typeof fileToArrayBufferFromIndexedDb;
  blobUrlToArrayBuffer: typeof blobUrlToArrayBufferFromIndexedDb;
  arrayBufferToFile: typeof arrayBufferToFileFromIndexedDb;
}

export function createIndexedDbProjectPersistenceAdapter(): ProjectPersistenceAdapter {
  return {
    saveProject: saveProjectToIndexedDb,
    loadProject: loadProjectFromIndexedDb,
    deleteProject: deleteProjectFromIndexedDb,
    deleteAllProjects: deleteAllProjectsFromIndexedDb,
    resetProjectDatabase: resetProjectDatabaseInIndexedDb,
    getAutoSaveSummary: getAutoSaveSummaryFromIndexedDb,
    getManualProjectSummaries: getManualProjectSummariesFromIndexedDb,
    renameManualProject: renameManualProjectInIndexedDb,
    deleteManualProjects: deleteManualProjectsFromIndexedDb,
    getStorageEstimate: getStorageEstimateFromIndexedDb,
    fileToArrayBuffer: fileToArrayBufferFromIndexedDb,
    blobUrlToArrayBuffer: blobUrlToArrayBufferFromIndexedDb,
    arrayBufferToFile: arrayBufferToFileFromIndexedDb,
  };
}

let currentProjectPersistenceAdapter = createIndexedDbProjectPersistenceAdapter();

export function getProjectPersistenceAdapter(): ProjectPersistenceAdapter {
  return currentProjectPersistenceAdapter;
}

export function setProjectPersistenceAdapter(adapter: ProjectPersistenceAdapter): void {
  currentProjectPersistenceAdapter = adapter;
}

export function resetProjectPersistenceAdapter(): void {
  currentProjectPersistenceAdapter = createIndexedDbProjectPersistenceAdapter();
}
