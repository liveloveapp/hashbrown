import { inject, InjectionToken } from '@angular/core';
import { ChatMiddleware } from '@hashbrownai/core';

export interface ProvideHashbrownOptions {
  baseUrl: string;
  middleware?: ChatMiddleware[];
  emulateStructuredOutput?: boolean;
}

export const HASHBROWN_CONFIG_INJECTION_TOKEN =
  new InjectionToken<ProvideHashbrownOptions>('HashbrownConfig');

export function provideHashbrown(options: ProvideHashbrownOptions) {
  return {
    provide: HASHBROWN_CONFIG_INJECTION_TOKEN,
    useValue: options,
  };
}

export function injectHashbrownConfig() {
  return inject(HASHBROWN_CONFIG_INJECTION_TOKEN);
}
