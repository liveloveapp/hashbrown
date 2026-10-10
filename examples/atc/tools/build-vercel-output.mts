import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const repo = resolve(root, '../..');
const output = resolve(root, '.vercel/output');
/**
 * The apps this deploy hosts. Only Angular ships for now; React still builds
 * and is tested in the repo. To host it, change this to
 * `['angular', 'react'] as const`.
 */
const HOSTED_APPS = ['angular'] as const;
const sources = {
  angular: resolve(repo, 'dist/examples/atc/angular/browser'),
  react: resolve(repo, 'dist/examples/atc/react'),
};
const functions = [
  { name: 'run', maxDuration: 60 },
  { name: 'aircraft', maxDuration: 10 },
];

rmSync(output, { recursive: true, force: true });
mkdirSync(resolve(output, 'static'), { recursive: true });
for (const app of HOSTED_APPS) {
  cpSync(sources[app], resolve(output, `static/${app}`), { recursive: true });
}

for (const { name, maxDuration } of functions) {
  const dir = resolve(output, `functions/api/${name}.func`);
  await build({
    configFile: false,
    root: repo,
    publicDir: false,
    logLevel: 'warn',
    plugins: [nxViteTsPaths()],
    ssr: { noExternal: true, target: 'node' },
    build: {
      ssr: resolve(root, `server/src/vercel/${name}.ts`),
      outDir: dir,
      emptyOutDir: true,
      minify: false,
      rolldownOptions: {
        output: {
          format: 'es',
          entryFileNames: 'index.mjs',
          codeSplitting: false,
        },
      },
    },
  });
  writeFileSync(
    resolve(dir, '.vc-config.json'),
    JSON.stringify({
      runtime: 'nodejs24.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      supportsResponseStreaming: true,
      maxDuration,
    }),
  );
}

writeFileSync(
  resolve(output, 'config.json'),
  JSON.stringify({
    version: 3,
    routes: [
      { src: '^/$', status: 307, headers: { Location: '/angular/' } },
      ...HOSTED_APPS.flatMap((app) => [
        { src: `^/${app}$`, status: 308, headers: { Location: `/${app}/` } },
      ]),
      { handle: 'filesystem' },
      ...HOSTED_APPS.map((app) => ({
        src: `^/${app}(?:/.*)?$`,
        dest: `/${app}/index.html`,
      })),
    ],
  }),
);
console.log(`wrote ${output}`);
