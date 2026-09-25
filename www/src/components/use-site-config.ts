'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  APP_CONFIG_STORAGE_KEY,
  type AppConfig,
  parseStoredAppConfig,
} from '../lib/site-config';

const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return globalThis.localStorage?.getItem(APP_CONFIG_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === null || event.key === APP_CONFIG_STORAGE_KEY) {
    listeners.forEach((listener) => listener());
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('storage', onStorage);
    }
  };
}

const getServerSnapshot = () => null;

/** The value returned by {@link useSiteConfig}. */
export interface SiteConfigState {
  /** The current preferences; defaults on the server and before hydration. */
  config: AppConfig;
  /** Whether preferences are stored in this browser (always false on the server). */
  isStored: boolean;
  /** Merge `patch` into the stored preferences and notify every subscriber. */
  update: (patch: Partial<AppConfig>) => void;
}

/**
 * Read and update the site preferences kept in `localStorage` under the
 * Angular site's key. The server snapshot is "nothing stored", so server and
 * hydration renders use the defaults and the stored value applies right after.
 */
export function useSiteConfig(): SiteConfigState {
  const raw = useSyncExternalStore(subscribe, readRaw, getServerSnapshot);
  const config = useMemo(() => parseStoredAppConfig(raw), [raw]);
  const update = useCallback((patch: Partial<AppConfig>) => {
    const next = { ...parseStoredAppConfig(readRaw()), ...patch };
    try {
      localStorage.setItem(APP_CONFIG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable (private mode, blocked site data).
    }
    listeners.forEach((listener) => listener());
  }, []);

  return { config, isStored: raw !== null, update };
}
