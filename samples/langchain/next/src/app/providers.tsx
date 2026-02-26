'use client';

import { HashbrownProvider } from '@hashbrownai/react';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return <HashbrownProvider url="/api/hashbrown">{children}</HashbrownProvider>;
}
