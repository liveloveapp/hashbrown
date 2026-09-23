import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';

/** The name `@analogjs/platform` gives its SSR dependency-optimizer linker plugin. */
const ANALOG_LINKER_PLUGIN = 'analogjs-platform-angular-linker';

type TransformAsync = (
  code: string,
  options: Record<string, unknown>,
) => Promise<{ code?: string | null; map?: unknown } | null>;

/**
 * Loads the `@babel/core` release that `@angular/compiler-cli` depends on.
 *
 * The Angular linker's Babel plugin asserts the Babel major it was built
 * against, and Angular 22.1+ needs Babel 8. `@analogjs/platform`
 * 3.0.0-alpha.64 imports `@babel/core` from its own location, which resolves
 * the workspace's Babel 7, so the dev server's SSR dependency optimizer fails
 * with "Requires Babel ^8.0.0-0". Analog fixed this upstream by resolving
 * Babel through compiler-cli, as done here.
 */
async function loadBabel(): Promise<{ transformAsync: TransformAsync }> {
  const require = createRequire(import.meta.url);
  const compilerCli = createRequire(
    require.resolve('@angular/compiler-cli/package.json'),
  );
  const babel = await import(
    pathToFileURL(compilerCli.resolve('@babel/core')).href
  );
  return babel.transformAsync ? babel : babel.default;
}

/** The Angular linker as a Rolldown plugin, using compiler-cli's Babel. */
function angularLinker() {
  let loaded:
    | {
        linkerPlugin: unknown;
        needsLinking: (id: string, code: string) => boolean;
        transformAsync: TransformAsync;
      }
    | undefined;

  async function load() {
    if (loaded) return loaded;
    const { needsLinking } = await import('@angular/compiler-cli/linker');
    const linkerBabel = await import('@angular/compiler-cli/linker/babel');
    const { transformAsync } = await loadBabel();
    loaded = {
      linkerPlugin: linkerBabel.default ?? linkerBabel,
      needsLinking,
      transformAsync,
    };
    return loaded;
  }

  return {
    name: ANALOG_LINKER_PLUGIN,
    async transform(code: string, id: string) {
      if (!id.endsWith('.mjs') && !id.endsWith('.js')) return;
      if (!code.includes('ɵɵngDeclare')) return;
      const { linkerPlugin, needsLinking, transformAsync } = await load();
      if (!needsLinking(id, code)) return;
      const result = await transformAsync(code, {
        filename: id,
        plugins: [linkerPlugin],
        sourceMaps: true,
        compact: false,
        configFile: false,
        babelrc: false,
      });
      if (result?.code) return { code: result.code, map: result.map ?? null };
      return undefined;
    },
  };
}

/**
 * Replaces `@analogjs/platform`'s SSR dependency-optimizer linker with one
 * that loads the Babel release Angular's linker requires, so `nx serve www`
 * works on Angular 22.1+. Production builds do not use this optimizer.
 *
 * Remove this plugin once `@analogjs/platform` is upgraded past
 * 3.0.0-alpha.87, which resolves Babel through compiler-cli itself.
 */
export function angularLinkerBabel(): Plugin {
  return {
    name: 'hashbrown:angular-linker-babel',
    configResolved(config) {
      const plugins =
        config.environments?.['ssr']?.optimizeDeps?.rolldownOptions?.plugins;
      if (!Array.isArray(plugins)) return;
      const index = plugins.findIndex(
        (plugin) =>
          typeof plugin === 'object' &&
          plugin !== null &&
          'name' in plugin &&
          plugin.name === ANALOG_LINKER_PLUGIN,
      );
      if (index !== -1) plugins[index] = angularLinker();
    },
  };
}
