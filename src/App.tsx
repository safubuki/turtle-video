/**
 * @file App.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 */
import { Suspense, lazy, useMemo } from 'react';

import { resolveAppFlavor } from './app/resolveAppFlavor';

const StandardApp = lazy(() => import('./flavors/standard/StandardApp'));
const AppleSafariApp = lazy(() => import('./flavors/apple-safari/AppleSafariApp'));

function App() {
  const appFlavor = useMemo(() => resolveAppFlavor(), []);
  const RuntimeApp = appFlavor === 'apple-safari' ? AppleSafariApp : StandardApp;

  return (
    <Suspense fallback={null}>
      <RuntimeApp />
    </Suspense>
  );
}

export default App;
