'use client';

import { HashbrownProvider } from '@hashbrownai/react';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <HashbrownProvider url="http://localhost:3000/api/v1/ai">
      {children}
    </HashbrownProvider>
  );
}
