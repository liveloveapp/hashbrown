import { isPlatformBrowser, Location } from '@angular/common';
import {
  computed,
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';

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
  private platformId = inject(PLATFORM_ID);
  private router = inject(Router);
  private location = inject(Location);
  private config = signal<AppConfig>(
    this.loadFromLocalStorage('config') ?? DEFAULT_CONFIG,
  );
  private path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.location.path(false)),
      startWith(this.location.path(false)),
    ),
    { initialValue: this.location.path(false) },
  );

  readonly sdk = computed(() => this.config().sdk);
  readonly provider = computed(() => this.config().provider);

  constructor() {
    effect(() => {
      const path = this.path();
      if (!path) {
        return;
      }
      const sdk = path.includes('angular')
        ? 'angular'
        : path.includes('react')
          ? 'react'
          : undefined;
      if (sdk) {
        this.set({ sdk });
      }
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
    this.config.update((c) => ({ ...c, ...config }));
  }
}
