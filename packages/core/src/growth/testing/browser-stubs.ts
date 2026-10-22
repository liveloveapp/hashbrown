import { randomUUID } from 'node:crypto';

/** Minimal browser globals for growth specs, which run in Jest's node environment. */
export interface BrowserStubs {
  /** Backing store of the stubbed `window.localStorage`. */
  readonly storage: Map<string, string>;
  /** Removes the stubbed globals. */
  restore(): void;
}

/**
 * Installs a stub `window` with `localStorage` over a Map and `crypto.randomUUID`.
 *
 * @param options - `throwing` makes every storage access throw, as a blocked browser would.
 * @returns The backing store and a `restore` function to call at the end of the test.
 */
export function installBrowserStubs(
  options: { throwing?: boolean } = {},
): BrowserStubs {
  const storage = new Map<string, string>();
  const blocked = () => {
    throw new Error('storage_blocked');
  };
  const localStorage = options.throwing
    ? { getItem: blocked, setItem: blocked }
    : {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, String(value));
        },
      };
  const target = globalThis as { window?: unknown };
  const previous = target.window;
  target.window = { localStorage, crypto: { randomUUID } };
  return {
    storage,
    restore: () => {
      if (previous === undefined) delete target.window;
      else target.window = previous;
    },
  };
}
