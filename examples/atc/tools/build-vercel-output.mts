import { spawnSync } from 'node:child_process';
import { readChatBackend } from '../server/src/chat-backend';
import {
  packageAgentFunction,
  prepareAgentApp,
  verifyAgentFunction,
  verifyOpenAiFunction,
} from './package-agent-function.mts';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const repo = resolve(root, '../..');
const output = resolve(root, '.vercel/output');
const backend = readChatBackend(process.env['ATC_CHAT_BACKEND']);
if (backend === 'b4run') {
  const staging = await prepareAgentApp(resolve(root, 'server'));
  const built = spawnSync(
    process.execPath,
    [
      resolve(repo, 'node_modules/@b4run/cli/bin/b4.js'),
      'build',
      '--cwd',
      staging,
      '--clean',
    ],
    {
      cwd: repo,
      stdio: 'inherit',
      env: {
        ...process.env,
        TSX_TSCONFIG_PATH: resolve(root, 'server/tsconfig.json'),
      },
    },
  );
  if (built.error) throw built.error;
  if (built.status !== 0) throw new Error('ATC agent runtime build failed');
}

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

/**
 * One Vercel function per API route; each entry is a file in
 * server/src/vercel/ and a route in server/src/app.ts. maxDuration sits above
 * each handler's own upstream deadline (airports 25 s, airspace and surfaces
 * 17 s, aircraft 8 s); run allows a full streamed answer.
 */
const functions: { route: string; entry: string; maxDuration: number }[] = [
  { route: 'run', entry: 'run', maxDuration: 60 },
  { route: 'filter', entry: 'filter', maxDuration: 30 },
  { route: 'decide', entry: 'decide', maxDuration: 10 },
  { route: 'aircraft', entry: 'aircraft', maxDuration: 10 },
  { route: 'chart/airports', entry: 'chart-airports', maxDuration: 30 },
  { route: 'chart/surfaces', entry: 'chart-surfaces', maxDuration: 20 },
  { route: 'chart/airspace', entry: 'chart-airspace', maxDuration: 20 },
];

rmSync(output, { recursive: true, force: true });
mkdirSync(resolve(output, 'static'), { recursive: true });
for (const app of HOSTED_APPS) {
  cpSync(sources[app], resolve(output, `static/${app}`), { recursive: true });
}

for (const { route, entry, maxDuration } of functions) {
  const dir = resolve(output, `functions/api/${route}.func`);
  if (route === 'run' && backend === 'b4run') {
    cpSync(
      resolve(root, 'server/.b4-app/.vercel/output/functions/b4.func'),
      dir,
      {
        recursive: true,
      },
    );
    await packageAgentFunction(dir);
    await verifyAgentFunction(dir);
    continue;
  }
  await build({
    configFile: false,
    root: repo,
    publicDir: false,
    logLevel: 'warn',
    // Resolve @atc/* and @hashbrownai/* from tsconfig paths to their source.
    resolve: { tsconfigPaths: true },
    ssr: { noExternal: true, target: 'node' },
    build: {
      ssr: resolve(root, `server/src/vercel/${entry}.ts`),
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
      { src: '^/$', status: 307, headers: { Location: `/${HOSTED_APPS[0]}/` } },
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
if (backend === 'openai')
  await verifyOpenAiFunction(resolve(output, 'functions/api/run.func'));
console.log(`wrote ${output}`);
