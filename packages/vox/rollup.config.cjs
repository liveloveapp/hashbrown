const { withNx } = require('@nx/rollup/with-nx');

module.exports = withNx(
  {
    main: './src/index.ts',
    outputPath: '../../dist/packages/vox',
    tsConfig: './tsconfig.lib.json',
    compiler: 'swc',
    format: ['cjs', 'esm'],
    outputFileName: 'index',
    outputFileExtensionForEsm: '.mjs',
    outputFileExtensionForCjs: '.cjs',
    assets: [
      { input: '{projectRoot}', output: '.', glob: '*.md' },
      { input: 'packages/vox/src/assets', output: 'assets', glob: '**/*' },
    ],
  },
  {
    // Provide additional rollup configuration here. See: https://rollupjs.org/configuration-options
    // e.g.
    // output: { sourcemap: true },
  },
);
