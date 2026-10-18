import { createContext, useMemo } from 'react';
import {
  createHttpDecisionTransport,
  createHttpTransport,
  type Decision,
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
  /**
   * Configuration for descendant `useDecision` hooks.
   */
  decision?: {
    /**
     * The URL of the decision endpoint.
     *
     * @defaultValue `/api/decide`
     */
    url?: string;
    /**
     * Optional decision transport override. When set, `url` and `middleware`
     * are not used for decisions.
     */
    transport?: Decision.Transport;
  };
}

interface HashbrownProviderContext {
  transport: TransportOrFactory;
  decisionTransport: Decision.Transport;
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
  const { url, middleware, transport, decision, children } = props;
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
  const decisionUrl = decision?.url;
  const decisionOverride = decision?.transport;
  const decisionTransport = useMemo<Decision.Transport>(
    () =>
      decisionOverride ??
      createHttpDecisionTransport({ url: decisionUrl, middleware }),
    [decisionOverride, decisionUrl, middleware],
  );
  const context = useMemo(
    () => ({ transport: configuredTransport, decisionTransport }),
    [configuredTransport, decisionTransport],
  );

  return (
    <HashbrownContext.Provider value={context}>
      {children}
    </HashbrownContext.Provider>
  );
};
