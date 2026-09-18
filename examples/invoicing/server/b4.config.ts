import { config } from '@b4run/cli';

/**
 * The deployable tree is published by `b4 build` alone: the runtime function,
 * the React SPA, and the `/api` function beside them. `outDir` points one level
 * up because CI deploys `examples/invoicing`, not the app root.
 *
 * `reconcileVercelJson` is off because CI deploys prebuilt output
 * (`vercel deploy --prebuilt`), so Vercel never runs a `buildCommand`.
 *
 * A review can stream for minutes, so `maxDuration` states the agent
 * function's ceiling here rather than leaving it to the Vercel project's
 * default. Fluid compute is what allows 300s at all, and `bootstrap.mjs`
 * reconciles that.
 */
export default config({
  build: {
    targets: ['vercel'],
    vercel: {
      outDir: '../.vercel/output',
      maxDuration: 300,
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
