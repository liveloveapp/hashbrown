import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const repo = resolve(root, '../..');
const output = resolve(root, '.vercel/output');
const functions = [
  { name: 'run', maxDuration: 60 },
  { name: 'aircraft', maxDuration: 10 },
];

rmSync(output, { recursive: true, force: true });
mkdirSync(resolve(output, 'static'), { recursive: true });
cpSync(
  resolve(repo, 'dist/examples/atc/angular/browser'),
  resolve(output, 'static/angular'),
  { recursive: true },
);
cpSync(
  resolve(repo, 'dist/examples/atc/react'),
  resolve(output, 'static/react'),
  { recursive: true },
);

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
      { handle: 'filesystem' },
      { src: '^/angular(?:/.*)?$', dest: '/angular/index.html' },
      { src: '^/react(?:/.*)?$', dest: '/react/index.html' },
    ],
  }),
);
console.log(`wrote ${output}`);
