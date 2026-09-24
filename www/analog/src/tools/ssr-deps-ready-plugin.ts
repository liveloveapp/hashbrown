import type { DevEnvironment, Plugin, ViteDevServer } from 'vite';

/**
 * Creates a dev-only Vite plugin that holds module resolution in the `ssr`
 * environment until that environment's dependency optimizer has loaded its
 * metadata.
 *
 * Nitro imports the SSR entry as soon as the environment initializes, but
 * Vite only starts the `ssr` optimizer later, when the server listens. On a
 * cold cache the entry's Angular imports therefore resolve to raw
 * `node_modules` files while modules imported afterward resolve to the
 * pre-bundle, which loads two copies of `@angular/core` and fails rendering
 * with NG0201 or drops the hydration transfer state.
 */
export function ssrDepsReadyPlugin(): Plugin {
  const ready = new WeakMap<DevEnvironment, Promise<void>>();

  const whenReady = (environment: DevEnvironment): Promise<void> => {
    const existing = ready.get(environment);
    if (existing) {
      return existing;
    }
    // The optimizer's `init` returns immediately after its first call, so the
    // first caller must keep the promise. Vite calls it from `listen`, which
    // runs after `configureServer`.
    const pending = Promise.resolve(environment.depsOptimizer?.init()).catch(
      (error: unknown) => {
        // Forget a failed init so the next request retries instead of
        // failing every SSR resolution until the dev server restarts.
        ready.delete(environment);
        throw error;
      },
    );
    ready.set(environment, pending);
    return pending;
  };

  return {
    name: 'hashbrown-ssr-deps-ready',
    apply: 'serve',
    enforce: 'pre',
    applyToEnvironment: (environment) => environment.name === 'ssr',
    configureServer(server: ViteDevServer) {
      const environment = server.environments['ssr'];
      if (environment) {
        void whenReady(environment);
      }
    },
    async resolveId() {
      await whenReady(this.environment as DevEnvironment);
      return null;
    },
  };
}
