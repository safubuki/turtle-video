import type { UseExportReturn } from '../../hooks/export-strategies/types';

export interface ExportRuntime {
  useExport: () => UseExportReturn;
  getLaunchDiagnostics?: () => Record<string, unknown>;
}
