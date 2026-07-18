import { describe, expect, it } from 'vitest';

import { appleSafariExportRuntime, resolveAppleSafariExportStrategyOrder } from '../flavors/apple-safari/appleSafariExportRuntime';
import { createUseExport as createAppleSafariUseExport } from '../flavors/apple-safari/export/exportEngine';
import { useExport as useAppleSafariExport } from '../flavors/apple-safari/export/useExport';
import { standardExportRuntime, resolveStandardExportStrategyOrder } from '../flavors/standard/standardExportRuntime';
import { createUseExport as createStandardUseExport } from '../flavors/standard/export/exportEngine';
import { useExport as useStandardExport } from '../flavors/standard/export/useExport';

describe('export runtime isolation', () => {
  it('export engines are physically forked per flavor (editing one cannot affect the other)', () => {
    expect(createStandardUseExport).not.toBe(createAppleSafariUseExport);
  });

  it('active runtimes use flavor-owned export hooks', () => {
    expect(standardExportRuntime.useExport).toBe(useStandardExport);
    expect(appleSafariExportRuntime.useExport).toBe(useAppleSafariExport);
    expect(standardExportRuntime.useExport).not.toBe(appleSafariExportRuntime.useExport);
    expect(standardExportRuntime.getLaunchDiagnostics).toBeUndefined();
    expect(appleSafariExportRuntime.getLaunchDiagnostics?.()).toMatchObject({
      runtime: 'apple-safari-export',
      webCodecsSupport: expect.objectContaining({
        fallbackStatus: expect.any(String),
      }),
    });
  });

  it('strategy ordering diverges by flavor', () => {
    expect(resolveStandardExportStrategyOrder({
      isIosSafari: false,
      supportedMediaRecorderProfile: {
        mimeType: 'video/mp4',
        extension: 'mp4',
      },
    })).toEqual(['webcodecs-mp4']);

    expect(resolveAppleSafariExportStrategyOrder({
      isIosSafari: true,
      supportedMediaRecorderProfile: {
        mimeType: 'video/mp4',
        extension: 'mp4',
      },
    })).toEqual(['ios-safari-mediarecorder', 'webcodecs-mp4']);

    expect(resolveAppleSafariExportStrategyOrder({
      isIosSafari: true,
      supportedMediaRecorderProfile: null,
    })).toEqual(['webcodecs-mp4']);
  });
});
