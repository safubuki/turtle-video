import { useMemo } from 'react';

import AppShell from '../../app/AppShell';
import { PlatformCapabilitiesProvider } from '../../app/PlatformCapabilitiesContext';
import TurtleVideo from '../../components/TurtleVideo';
import { appleSafariExportRuntime } from './appleSafariExportRuntime';
import {
  appleSafariPreviewRuntime,
  getAppleSafariPreviewPlatformCapabilities,
} from './appleSafariPreviewRuntime';
import { appleSafariSaveRuntime } from './appleSafariSaveRuntime';

function AppleSafariApp() {
  // 共有コンポーネントにも apple-safari 固定（isIosSafari=true）の capabilities を配る
  const platformCapabilities = useMemo(() => getAppleSafariPreviewPlatformCapabilities(), []);

  return (
    <PlatformCapabilitiesProvider capabilities={platformCapabilities}>
      <AppShell>
        <TurtleVideo
          appFlavor="apple-safari"
          previewRuntime={appleSafariPreviewRuntime}
          exportRuntime={appleSafariExportRuntime}
          saveRuntime={appleSafariSaveRuntime}
        />
      </AppShell>
    </PlatformCapabilitiesProvider>
  );
}

export default AppleSafariApp;