import { createContext } from 'react';

interface Endpoint {
  url: string;
  headers?: Record<string, string>;
}

export interface HashbrownProviderOptions {
  /**
   * The URL of the Hashbrown server endpoint.
   */
  url: string;
  /**
   * The headers to send with the POST request to the Hashbrown endpoint.
   */
  headers?: Record<string, string>;
}

interface HashbrownProviderContext {
  url: string;
  headers?: Record<string, string>;
}

export const HashbrownContext = createContext<
  HashbrownProviderContext | undefined
>(undefined);

export const HashbrownProvider = (
  props: HashbrownProviderOptions & {
    children: React.ReactNode;
  },
) => {
  const { url, headers, children } = props;

  return (
    <HashbrownContext.Provider value={{ url, headers }}>
      {children}
    </HashbrownContext.Provider>
  );
};
