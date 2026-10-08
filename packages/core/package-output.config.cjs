/**
 * Emits one output file per source module instead of a single bundle.
 *
 * Core declares `"sideEffects": false`, but that only lets consumer bundlers
 * drop whole modules. When everything is concatenated into one file, unused
 * module-level work (action groups, reducers, selectors, effects, and the
 * AG-UI schemas they reference) can no longer be dropped, so an app that only
 * needs `s` and `prompt` pays for the whole chat runtime. Keeping modules
 * separate restores module-level tree-shaking.
 *
 * Third-party code that Rollup inlines (tslib and the lazily loaded QuickJS
 * runtime) is written under `vendor/`, because npm never publishes nested
 * `node_modules` directories.
 */
module.exports = (config) => {
  if (!config.output) {
    return config;
  }

  const outputs = Array.isArray(config.output)
    ? config.output
    : [config.output];

  return {
    ...config,
    output: outputs.map((output) => {
      const toFileName = (chunk) =>
        `${chunk.name.replace(/(^|\/)node_modules\//g, '$1vendor/')}.${output.format}.js`;

      return {
        ...output,
        preserveModules: true,
        preserveModulesRoot: 'packages/core/src',
        entryFileNames: toFileName,
        chunkFileNames: toFileName,
      };
    }),
  };
};
