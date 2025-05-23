import { isPlatformBrowser } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

export interface AppConfig {
  sdk: 'angular' | 'react';
  provider: 'google' | 'openai' | 'writer';
}

const DEFAULT_CONFIG: AppConfig = {
  sdk: 'angular',
  provider: 'openai',
};

@Injectable({ providedIn: 'root' })
export class ConfigService {
  platformId = inject(PLATFORM_ID);

  private configSignal = signal<AppConfig>(
    this.loadFromLocalStorage('config') ?? DEFAULT_CONFIG,
  );

  readonly config = this.configSignal.asReadonly();

  constructor() {
    effect(() => {
      this.saveToLocalStorage('config', this.configSignal());
    });
  }

  private saveToLocalStorage(key: string, data: unknown) {
    if (
      isPlatformBrowser(this.platformId) &&
      globalThis.localStorage !== undefined
    ) {
      localStorage.setItem(key, JSON.stringify(data));
    }
  }

  private loadFromLocalStorage<T>(key: string): T | null {
    if (
      isPlatformBrowser(this.platformId) &&
      globalThis.localStorage !== undefined
    ) {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    }
    return null;
  }

  set(config: Partial<AppConfig>) {
    this.configSignal.set({ ...this.configSignal(), ...config });
  }
}
