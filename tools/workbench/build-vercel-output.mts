/**
 * Packages the docs workbench (www/examples/quickstart) for Vercel's Build
 * Output API: the Vite-built React and Angular pages from `nx workbench-build
 * www` as static files, and one streaming Node function for /api/workbench/*.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { workbenchVercelConfig } from './vercel-config.mjs';

const repo = resolve(import.meta.dirname, '../..');
const output = resolve(import.meta.dirname, '.vercel/output');
const api = resolve(output, 'functions/api/workbench.func');

rmSync(output, { recursive: true, force: true });
mkdirSync(api, { recursive: true });
cpSync(
  resolve(repo, 'dist/docs-workbench/browser'),
  resolve(output, 'static'),
  {
    recursive: true,
  },
);

await build({
  entryPoints: [
    resolve(repo, 'www/examples/quickstart/server/workbench-vercel.ts'),
  ],
  outfile: resolve(api, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  logLevel: 'warning',
  alias: {
    '@hashbrownai/core': resolve(repo, 'packages/core/src/index.ts'),
    '@hashbrownai/typesafe': resolve(repo, 'packages/typesafe/src/index.ts'),
    '@hashbrownai/openai': resolve(repo, 'packages/openai/src/index.ts'),
    '#development-install': resolve(
      repo,
      'packages/core/src/growth/development-install.default.ts',
    ),
  },
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
// shouldAddHelpers is off so Vercel leaves the request stream for
// express.json() instead of installing its own req.body getter.
writeFileSync(
  resolve(api, '.vc-config.json'),
  JSON.stringify({
    runtime: 'nodejs24.x',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    shouldAddHelpers: false,
    supportsResponseStreaming: true,
    maxDuration: 60,
  }),
);
writeFileSync(
  resolve(output, 'config.json'),
  JSON.stringify(workbenchVercelConfig()),
);
console.log(`wrote ${output}`);
