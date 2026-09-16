import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { assemble, buildRoutes } from './assemble.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'assemble-'));
  await mkdir(join(root, 'static/assets'), { recursive: true });
  await writeFile(join(root, 'static/index.html'), '<html></html>');
  await writeFile(join(root, 'static/assets/app.js'), 'console.log(1)');
  await mkdir(join(root, 'b4/functions/index.func'), { recursive: true });
  await writeFile(
    join(root, 'b4/functions/index.func/.vc-config.json'),
    JSON.stringify({
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      runtime: 'nodejs24.x',
    }),
  );
  await writeFile(
    join(root, 'b4/functions/index.func/index.mjs'),
    'export default { fetch: () => new Response("b4") }',
  );
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(
    join(root, 'src/api.ts'),
    'const greeting: string = "api"; export default (req: any, res: any) => res.end(greeting);',
  );
  const manifest = {
    output: 'out',
    static: { dir: 'static', spaFallback: 'index.html' },
    functions: {
      index: {
        from: 'b4/functions/index.func',
        config: { maxDuration: 300, supportsResponseStreaming: true },
      },
      api: { entry: 'src/api.ts', runtime: 'nodejs24.x', maxDuration: 30 },
    },
    routes: [
      { src: '/api/(.*)', dest: '/api' },
      { src: '/(agui|threads)(/.*)?', dest: '/index' },
    ],
  };
  await writeFile(join(root, 'vercel.assembly.json'), JSON.stringify(manifest));
  return root;
}

test('buildRoutes puts filesystem first and the SPA fallback last', () => {
  assert.deepEqual(
    buildRoutes({
      routes: [{ src: '/api/(.*)', dest: '/api' }],
      spaFallback: 'index.html',
    }),
    [
      { handle: 'filesystem' },
      { src: '/api/(.*)', dest: '/api' },
      { src: '/(.*)', dest: '/index.html' },
    ],
  );
});

test('buildRoutes omits the fallback when none is configured', () => {
  assert.deepEqual(buildRoutes({ routes: [] }), [{ handle: 'filesystem' }]);
});

test('assemble produces a Build Output tree from the manifest', async () => {
  const root = await fixture();
  await assemble(join(root, 'vercel.assembly.json'));
  const out = join(root, 'out');
  const config = JSON.parse(await readFile(join(out, 'config.json'), 'utf8'));
  assert.equal(config.version, 3);
  assert.deepEqual(config.routes[0], { handle: 'filesystem' });
  assert.deepEqual(config.routes.at(-1), { src: '/(.*)', dest: '/index.html' });
  assert.ok((await stat(join(out, 'static/assets/app.js'))).isFile());
  const b4 = JSON.parse(
    await readFile(join(out, 'functions/index.func/.vc-config.json'), 'utf8'),
  );
  assert.deepEqual(b4, {
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    runtime: 'nodejs24.x',
    maxDuration: 300,
    supportsResponseStreaming: true,
  });
  assert.match(
    await readFile(join(out, 'functions/index.func/index.mjs'), 'utf8'),
    /"b4"/,
  );
  const api = JSON.parse(
    await readFile(join(out, 'functions/api.func/.vc-config.json'), 'utf8'),
  );
  assert.deepEqual(api, {
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    runtime: 'nodejs24.x',
    maxDuration: 30,
    supportsResponseStreaming: true,
  });
  const bundled = await readFile(
    join(out, 'functions/api.func/index.mjs'),
    'utf8',
  );
  assert.match(bundled, /"api"/);
  assert.doesNotMatch(bundled, /: string/);
});

test('assemble replaces a previous output atomically', async () => {
  const root = await fixture();
  await mkdir(join(root, 'out/stale'), { recursive: true });
  await assemble(join(root, 'vercel.assembly.json'));
  await assert.rejects(stat(join(root, 'out/stale')));
  await assert.rejects(stat(join(root, 'out.staging')));
});

test('assemble rejects a function with neither from nor entry', async () => {
  const root = await fixture();
  await writeFile(
    join(root, 'vercel.assembly.json'),
    JSON.stringify({
      output: 'out',
      functions: { broken: { runtime: 'nodejs24.x' } },
    }),
  );
  await assert.rejects(assemble(join(root, 'vercel.assembly.json')), /broken/);
});
