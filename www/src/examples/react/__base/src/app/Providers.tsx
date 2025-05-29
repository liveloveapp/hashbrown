import { HashbrownProvider } from '@hashbrownai/react';
import type { ReactElement, ReactNode } from 'react';
import { useMemo } from 'react';
import { useConfigStore } from './store/config.store';

export default function Providers({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const provider = useConfigStore((state) => state.provider);
  const apiKey = useConfigStore((state) => state.apiKey);

  const middleware = useMemo(
    () => [
      function (request: RequestInit) {
        return {
          ...request,
          headers: {
            ...request.headers,
            'x-hashbrown': JSON.stringify({
              provider,
              apiKey,
            }),
          },
        };
      },
    ],
    [provider, apiKey],
  );

  return (
    <HashbrownProvider url="http://localhost:3000/chat" middleware={middleware}>
      {children}
    </HashbrownProvider>
  );
}
