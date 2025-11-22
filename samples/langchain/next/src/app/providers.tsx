'use client';

import { CopilotKitProvider } from '@copilotkitnext/react';
import { HashbrownProvider } from '@hashbrownai/react';
// import { wildcardRenderer } from '../renderers/wildcard-renderer';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <HashbrownProvider url="/api/hashbrown">
      <CopilotKitProvider runtimeUrl="/api/copilotkit" useSingleEndpoint={true}>
        {children}
      </CopilotKitProvider>
    </HashbrownProvider>
  );
}
