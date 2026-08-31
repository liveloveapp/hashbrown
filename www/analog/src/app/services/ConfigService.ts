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

export type Backend = 'express' | 'fastify' | 'nestjs' | 'hono';

export interface AppConfig {
  sdk: 'angular' | 'react';
  provider: 'google' | 'openai';
  backend: Backend;
}

const DEFAULT_CONFIG: AppConfig = {
  sdk: 'react',
  provider: 'openai',
  backend: 'express',
};

/**
 * Normalize persisted configuration and replace unsupported values with defaults.
 */
export function normalizeAppConfig(value: unknown): AppConfig {
  if (!value || typeof value !== 'object') {
    return DEFAULT_CONFIG;
  }

  const config = value as Record<string, unknown>;
  const sdk = config['sdk'];
  const provider = config['provider'];
  const backend = config['backend'];

  return {
    sdk: sdk === 'angular' || sdk === 'react' ? sdk : DEFAULT_CONFIG.sdk,
    provider:
      provider === 'google' || provider === 'openai'
        ? provider
        : DEFAULT_CONFIG.provider,
    backend:
      backend === 'express' ||
      backend === 'fastify' ||
      backend === 'nestjs' ||
      backend === 'hono'
        ? backend
        : DEFAULT_CONFIG.backend,
  };
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private platformId = inject(PLATFORM_ID);
  private router = inject(Router);
  private location = inject(Location);
  private config = signal<AppConfig>(
    normalizeAppConfig(this.loadFromLocalStorage('config')),
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
  readonly backend = computed(() => this.config().backend);

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

    effect(() => {
      this.saveToLocalStorage('config', this.config());
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
