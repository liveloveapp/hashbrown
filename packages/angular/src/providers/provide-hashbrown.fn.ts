import { inject, InjectionToken, Provider } from '@angular/core';
import { Chat, type TransportOrFactory } from '@hashbrownai/core';

/**
 * Hashbrown must be configured with a base URL,
 * and may optionally include middleware or a transport override.
 *
 * @public
 */
export interface ProvideHashbrownOptions {
  /**
   * The base URL of the Hashbrown API.
   */
  baseUrl?: string;
  /**
   * Middleware to apply to all requests.
   */
  middleware?: Chat.Middleware[];
  /**
   * Optional transport to use instead of the default HTTP transport.
   */
  transport?: TransportOrFactory;
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
