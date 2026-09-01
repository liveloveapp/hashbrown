import { createContext, useMemo } from 'react';
import {
  createHttpTransport,
  type TransportOrFactory,
} from '@hashbrownai/core';

/**
 * The options for the Hashbrown provider.
 *
 * @public
 */
export interface HashbrownProviderOptions {
  /**
   * The URL of the Hashbrown server endpoint.
   */
  url?: string;
  /**
   * Middleware applied before POST requests to the Hashbrown endpoint.
   */
  middleware?: Array<
    (request: RequestInit) => RequestInit | Promise<RequestInit>
  >;
  /**
   * Optional transport override applied to all descendant hooks.
   */
  transport?: TransportOrFactory;
}

interface HashbrownProviderContext {
  transport: TransportOrFactory;
}

export const HashbrownContext = createContext<
  HashbrownProviderContext | undefined
>(undefined);

/**
 * Configures the transport used by descendant Hashbrown hooks.
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
  const { url, middleware, transport, children } = props;
  const configuredTransport = useMemo<TransportOrFactory>(
    () =>
      transport ??
      (() =>
        createHttpTransport({
          baseUrl: url,
          middleware,
        })),
    [middleware, transport, url],
  );
  const context = useMemo(
    () => ({ transport: configuredTransport }),
    [configuredTransport],
  );

  return (
    <HashbrownContext.Provider value={context}>
      {children}
    </HashbrownContext.Provider>
  );
};
