import { inject, InjectionToken } from '@angular/core';

export const HASHBROWN_CONFIG_INJECTION_TOKEN = new InjectionToken<{
  baseUrl: string;
}>('HashbrownConfig');

export interface ProvideHashbrownOptions {
  baseUrl: string;
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
