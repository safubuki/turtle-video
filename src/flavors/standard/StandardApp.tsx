import { useMemo } from 'react';

import AppShell from '../../app/AppShell';
import { PlatformCapabilitiesProvider } from '../../app/PlatformCapabilitiesContext';
import TurtleVideo from '../../components/TurtleVideo';
import { standardExportRuntime } from './standardExportRuntime';
import {
  getStandardPreviewPlatformCapabilities,
  standardPreviewRuntime,
} from './standardPreviewRuntime';
import { standardSaveRuntime } from './standardSaveRuntime';

function StandardApp() {
  // 共有コンポーネントにも standard 固定（isIosSafari=false）の capabilities を配る
  const platformCapabilities = useMemo(() => getStandardPreviewPlatformCapabilities(), []);

  return (
    <PlatformCapabilitiesProvider capabilities={platformCapabilities}>
      <AppShell>
        <TurtleVideo
          appFlavor="standard"
          previewRuntime={standardPreviewRuntime}
          exportRuntime={standardExportRuntime}
          saveRuntime={standardSaveRuntime}
        />
      </AppShell>
    </PlatformCapabilitiesProvider>
  );
}

export default StandardApp;