import { createContext } from 'react';
import { type TransportOrFactory } from '@hashbrownai/core';

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
   * The headers to send with the POST request to the Hashbrown endpoint.
   */
  middleware?: Array<
    (request: RequestInit) => RequestInit | Promise<RequestInit>
  >;
  /**
   * Whether to emulate structured output. Useful for models
   * that don't support tool calling with structured outputs
   * enabled. When set to true, Hashbrown silently adds an
   * "output" tool to the the list of tools the model can
   * call, and then handles the arguments to the tool call
   * as if the model has produced it via structured outputs.
   */
  emulateStructuredOutput?: boolean;
  /**
   * Optional transport override applied to all descendant hooks.
   */
  transport?: TransportOrFactory;
}

interface HashbrownProviderContext {
  url?: string;
  middleware?: Array<
    (request: RequestInit) => RequestInit | Promise<RequestInit>
  >;
  emulateStructuredOutput?: boolean;
  transport?: TransportOrFactory;
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
  const { url, middleware, emulateStructuredOutput, transport, children } =
    props;

  return (
    <HashbrownContext.Provider
      value={{ url, middleware, emulateStructuredOutput, transport }}
    >
      {children}
    </HashbrownContext.Provider>
  );
};
