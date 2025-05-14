import { inject, InjectionToken } from '@angular/core';
import { ChatMiddleware } from '@hashbrownai/core';

export const HASHBROWN_CONFIG_INJECTION_TOKEN = new InjectionToken<{
  baseUrl: string;
  middleware?: ChatMiddleware[];
}>('HashbrownConfig');

export interface ProvideHashbrownOptions {
  baseUrl: string;
  middleware?: ChatMiddleware[];
}

export function provideHashbrown(options: ProvideHashbrownOptions) {
  return {
    provide: HASHBROWN_CONFIG_INJECTION_TOKEN,
    useValue: options,
  };
}

export function injectHashbrownConfig() {
  return inject(HASHBROWN_CONFIG_INJECTION_TOKEN);
}
