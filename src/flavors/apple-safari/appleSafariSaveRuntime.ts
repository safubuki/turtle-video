import type { SaveRuntime } from '../../components/turtle-video/saveRuntime';
import {
  createIndexedDbProjectPersistenceAdapter,
  setProjectPersistenceAdapter,
} from '../../stores/projectPersistence';
import { saveBlobWithClientFileStrategy } from '../../utils/fileSave';
import { getPlatformCapabilities } from '../../utils/platform';

export const appleSafariProjectPersistenceAdapter = createIndexedDbProjectPersistenceAdapter();

export function configureAppleSafariProjectStore(): void {
  setProjectPersistenceAdapter(appleSafariProjectPersistenceAdapter);
}

configureAppleSafariProjectStore();

export const appleSafariSaveRuntime: SaveRuntime = {
  configureProjectStore: configureAppleSafariProjectStore,
  getPlatformCapabilities,
  saveBlobWithClientFileStrategy,
};