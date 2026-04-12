/**
 * @file App.tsx
 * @author Turtle Village
 */
import { Suspense, lazy, useMemo } from 'react';

import AppShell from './app/AppShell';
import { resolveAppFlavor } from './app/resolveAppFlavor';

const StandardApp = lazy(() => import('./flavors/standard/StandardApp'));
const AppleSafariApp = lazy(() => import('./flavors/apple-safari/AppleSafariApp'));

function App() {
  const appFlavor = useMemo(() => resolveAppFlavor(), []);
  const RuntimeApp = appFlavor === 'apple-safari' ? AppleSafariApp : StandardApp;

  return (
    <AppShell>
      <Suspense fallback={null}>
        <RuntimeApp />
      </Suspense>
    </AppShell>
  );
}

export default App;
