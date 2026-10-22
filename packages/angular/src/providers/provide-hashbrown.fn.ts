import { inject, InjectionToken, Provider } from '@angular/core';
import {
  Chat,
  type Decision,
  type TransportOrFactory,
} from '@hashbrownai/core';
import { ɵprovideCollectionEnabled } from '../growth/collector';

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
  /**
   * Configuration for decision resources.
   */
  decision?: {
    /**
     * The URL of the decision endpoint. Defaults to `/api/decide`.
     */
    url?: string;
    /**
     * Optional decision transport override. When set, `url` and `middleware`
     * are not used for decisions.
     */
    transport?: Decision.Transport;
  };
  /**
   * Set to `false` to turn off Hashbrown's development-only collection for every resource and component under this provider.
   */
  telemetry?: boolean;
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
  return [
    {
      provide: ɵHASHBROWN_CONFIG_INJECTION_TOKEN,
      useValue: options,
    },
    ɵprovideCollectionEnabled(options),
  ];
}

/**
 * @internal
 */
export function ɵinjectHashbrownConfig() {
  return inject(ɵHASHBROWN_CONFIG_INJECTION_TOKEN);
}
