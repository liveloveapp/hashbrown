'use client';

import { CopilotKitProvider } from '@copilotkitnext/react';

interface CopilotKitLayoutProps {
  children: React.ReactNode;
}

export default function CopilotKitLayout({ children }: CopilotKitLayoutProps) {
  return (
    <CopilotKitProvider runtimeUrl="/api/copilotkit" useSingleEndpoint={true}>
      {children}
    </CopilotKitProvider>
  );
}
