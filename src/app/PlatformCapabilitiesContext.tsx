/**
 * @file PlatformCapabilitiesContext.tsx
 * @author Turtle Village
 * @description フレーバー（standard / apple-safari）がピン留めした PlatformCapabilities を
 * 共有コンポーネントへ注入するための Context。
 *
 * 共有コンポーネント（src/components/**）は utils/platform の getPlatformCapabilities() を
 * 直接呼ばず、usePlatformCapabilities() を使うこと。これにより standard フレーバーでは
 * 常に isIosSafari=false、apple-safari フレーバーでは常に isIosSafari=true が保証され、
 * UA 判定のゆらぎがフレーバー境界を越えて漏れない。
 */
import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';

import { getPlatformCapabilities, type PlatformCapabilities } from '../utils/platform';

const PlatformCapabilitiesContext = createContext<PlatformCapabilities | null>(null);

export function PlatformCapabilitiesProvider({
  capabilities,
  children,
}: PropsWithChildren<{ capabilities: PlatformCapabilities }>) {
  return (
    <PlatformCapabilitiesContext.Provider value={capabilities}>
      {children}
    </PlatformCapabilitiesContext.Provider>
  );
}

/**
 * フレーバーが提供する PlatformCapabilities を返す。
 * Provider 外（単体テスト等）では素の getPlatformCapabilities() にフォールバックする。
 * 本番の両フレーバー App は必ず Provider でラップするため、実行時は常にピン留め値になる。
 */
export function usePlatformCapabilities(): PlatformCapabilities {
  const fromContext = useContext(PlatformCapabilitiesContext);
  return useMemo(() => fromContext ?? getPlatformCapabilities(), [fromContext]);
}
