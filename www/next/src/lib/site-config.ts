/**
 * Site preferences shared with the Angular site's `ConfigService`
 * (www/analog/src/app/services/ConfigService.ts). The storage key and the
 * stored shape match, so preferences carry across the migration.
 */

/** A Node.js server framework shown in backend code examples. */
export type Backend = 'express' | 'fastify' | 'nestjs' | 'hono';

/** The persisted site preferences. */
export interface AppConfig {
  sdk: 'angular' | 'react';
  provider: 'google' | 'openai';
  backend: Backend;
}

/** The `localStorage` key the Angular site uses for {@link AppConfig}. */
export const APP_CONFIG_STORAGE_KEY = 'config';

/** Backends in the order the backend code example shows them. */
export const BACKENDS: readonly Backend[] = [
  'express',
  'fastify',
  'nestjs',
  'hono',
];

/** Preferences used when nothing (or nothing valid) is stored. */
export const DEFAULT_APP_CONFIG: AppConfig = {
  sdk: 'angular',
  provider: 'openai',
  backend: 'express',
};

/**
 * Normalize persisted configuration and replace unsupported values with defaults.
 *
 * @param value - Anything read from storage.
 * @returns A valid config.
 */
export function normalizeAppConfig(value: unknown): AppConfig {
  if (!value || typeof value !== 'object') {
    return DEFAULT_APP_CONFIG;
  }

  const config = value as Record<string, unknown>;
  const sdk = config['sdk'];
  const provider = config['provider'];
  const backend = config['backend'];

  return {
    sdk: sdk === 'angular' || sdk === 'react' ? sdk : DEFAULT_APP_CONFIG.sdk,
    provider:
      provider === 'google' || provider === 'openai'
        ? provider
        : DEFAULT_APP_CONFIG.provider,
    backend:
      backend === 'express' ||
      backend === 'fastify' ||
      backend === 'nestjs' ||
      backend === 'hono'
        ? backend
        : DEFAULT_APP_CONFIG.backend,
  };
}

/**
 * Parse the raw `localStorage` value into a valid config.
 *
 * @param raw - The stored string, or `null` when nothing is stored.
 * @returns A valid config; defaults when `raw` is missing or not JSON.
 */
export function parseStoredAppConfig(raw: string | null): AppConfig {
  if (raw === null) {
    return DEFAULT_APP_CONFIG;
  }
  try {
    return normalizeAppConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_APP_CONFIG;
  }
}
