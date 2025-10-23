import { createContext } from 'react';

/**
 * The options for the Hashbrown provider.
 *
 * @public
 */
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

/**
 * The context for the Hashbrown provider.  This is used to store the URL and middleware for contacting the Hashbrown endpoint.
 *
 * @public
 * @example
 * ```ts
 * <HashbrownProvider url="https://your.api.local/chat">
 *   <App />
 * </HashbrownProvider>
 * ```
 */
export const HashbrownProvider = (
  /**
   * The options for the Hashbrown provider.
   */
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
