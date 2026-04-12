import type { ExportRuntime } from '../../components/turtle-video/exportRuntime';
import { useExport } from './export/useExport';

export {
  getAppleSafariExportPlatformCapabilities,
  resolveAppleSafariExportStrategyOrder,
} from './export/useExport';

export const appleSafariExportRuntime: ExportRuntime = {
  useExport,
};