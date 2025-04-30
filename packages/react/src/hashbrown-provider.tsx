import { createContext } from 'react';

export interface HashbrownProviderOptions {
  /**
   * The URL of the Hashbrown server endpoint.
   */
  url: string;
  /**
   * The headers to send with the POST request to the Hashbrown endpoint.
   */
  middleware?: Array<
    (request: RequestInit) => RequestInit | Promise<RequestInit>
  >;
}

interface HashbrownProviderContext {
  url: string;
  middleware?: Array<
    (request: RequestInit) => RequestInit | Promise<RequestInit>
  >;
}

export const HashbrownContext = createContext<
  HashbrownProviderContext | undefined
>(undefined);

export const HashbrownProvider = (
  props: HashbrownProviderOptions & {
    children: React.ReactNode;
  },
) => {
  const { url, middleware, children } = props;

  return (
    <HashbrownContext.Provider value={{ url, middleware }}>
      {children}
    </HashbrownContext.Provider>
  );
};
