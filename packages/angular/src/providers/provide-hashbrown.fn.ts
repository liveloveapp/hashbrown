import { inject, InjectionToken, Provider } from '@angular/core';
import { Chat } from '@hashbrownai/core';

/**
 * Hashbrown must be configured with a base URL,
 * and may optionally include middleware and a flag
 * to emulate structured output.
 *
 * @public
 */
export interface ProvideHashbrownOptions {
  /**
   * The base URL of the Hashbrown API.
   */
  baseUrl: string;
  /**
   * Middleware to apply to all requests.
   */
  middleware?: Chat.Middleware[];
  /**
   * Whether to emulate structured output. Useful for models
   * that don't support tool calling with structured outputs
   * enabled. When set to true, Hashbrown silently adds an
   * "output" tool to the the list of tools the model can
   * call, and then handles the arguments to the tool call
   * as if the model has produced it via structured outputs.
   */
  emulateStructuredOutput?: boolean;
}

/**
 * @internal
 */
export const ɵHASHBROWN_CONFIG_INJECTION_TOKEN =
  new InjectionToken<ProvideHashbrownOptions>('HashbrownConfig');

/**
 * Provides the Hashbrown configuration.
 *
 * @public
 * @param options - The Hashbrown configuration.
 * @returns The Hashbrown configuration.
 */
export function provideHashbrown(options: ProvideHashbrownOptions): Provider {
  return {
    provide: ɵHASHBROWN_CONFIG_INJECTION_TOKEN,
    useValue: options,
  };
}

/**
 * @internal
 */
export function ɵinjectHashbrownConfig() {
  return inject(ɵHASHBROWN_CONFIG_INJECTION_TOKEN);
}
