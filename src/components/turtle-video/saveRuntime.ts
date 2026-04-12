import { saveBlobWithClientFileStrategy } from '../../utils/fileSave';
import { getPlatformCapabilities } from '../../utils/platform';

export interface SaveRuntime {
  configureProjectStore: () => void;
  getPlatformCapabilities: typeof getPlatformCapabilities;
  saveBlobWithClientFileStrategy: typeof saveBlobWithClientFileStrategy;
}