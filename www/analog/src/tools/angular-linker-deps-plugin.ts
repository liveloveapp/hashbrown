import { JavaScriptTransformer } from '@angular/build/private';

/**
 * Creates a Rolldown plugin for Vite's dependency optimizer that runs the
 * Angular linker over pre-bundled packages.
 *
 * `@analogjs/vite-plugin-angular` 3.0.0-alpha.87 passes `!isAstroIntegration`
 * as the `isTest` argument of its Rolldown optimizer plugin, so the plugin
 * never registers its `load` hook and the dev client receives partially
 * compiled (`ɵɵngDeclare*`) Angular code that fails with
 * "JIT compilation failed". This plugin applies the same transform Analog
 * intends to apply.
 */
export function angularLinkerDepsPlugin() {
  let transformer: JavaScriptTransformer | undefined;

  return {
    name: 'hashbrown-angular-linker-deps',
    load: {
      filter: { id: /\.[cm]?js$/ },
      async handler(id: string) {
        transformer ??= new JavaScriptTransformer(
          { sourcemap: true, jit: true },
          1,
        );
        const contents = await transformer.transformFile(id);

        return { code: Buffer.from(contents).toString('utf-8') };
      },
    },
    async buildEnd() {
      const current = transformer;
      transformer = undefined;
      await current?.close();
    },
  };
}
