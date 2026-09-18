import { config } from '@b4run/cli';

/**
 * The deployable tree is published by `b4 build` alone: the runtime function,
 * the React SPA, and the `/api` function beside them. `outDir` points one level
 * up because CI deploys `examples/invoicing`, not the app root.
 *
 * `reconcileVercelJson` is off because CI deploys prebuilt output
 * (`vercel deploy --prebuilt`), so Vercel never runs a `buildCommand`.
 *
 * The runtime function's ceiling is the Vercel project's own setting — fluid
 * compute with a 300s default function timeout, which `bootstrap.mjs` asserts.
 * `build.vercel.maxDuration` states it here instead, from the release that
 * carries cacheplane/b4run#729.
 */
export default config({
  build: {
    targets: ['vercel'],
    vercel: {
      outDir: '../.vercel/output',
      reconcileVercelJson: false,
      static: {
        dir: '../../../dist/examples/invoicing/react',
        spaFallback: 'index.html',
      },
      functions: {
        api: {
          entry: 'src/api.ts',
          maxDuration: 30,
          supportsResponseStreaming: true,
        },
      },
      routes: [{ src: '/api/(.*)', dest: '/api' }],
    },
  },
});
