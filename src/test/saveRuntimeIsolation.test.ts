import { beforeEach, describe, expect, it } from 'vitest';

import {
  appleSafariProjectPersistenceAdapter,
  appleSafariSaveRuntime,
} from '../flavors/apple-safari/appleSafariSaveRuntime';
import {
  standardProjectPersistenceAdapter,
  standardSaveRuntime,
} from '../flavors/standard/standardSaveRuntime';
import {
  createIndexedDbProjectPersistenceAdapter,
  getProjectPersistenceAdapter,
  setProjectPersistenceAdapter,
} from '../stores/projectPersistence';

describe('save runtime isolation', () => {
  beforeEach(() => {
    setProjectPersistenceAdapter(createIndexedDbProjectPersistenceAdapter());
  });

  it('flavor runtimes own projectStore persistence configuration entry points', () => {
    standardSaveRuntime.configureProjectStore();
    expect(getProjectPersistenceAdapter()).toBe(standardProjectPersistenceAdapter);

    appleSafariSaveRuntime.configureProjectStore();
    expect(getProjectPersistenceAdapter()).toBe(appleSafariProjectPersistenceAdapter);
  });

  it('save runtimes keep distinct flavor-owned configuration functions', () => {
    expect(standardSaveRuntime.configureProjectStore).not.toBe(appleSafariSaveRuntime.configureProjectStore);
  });
});