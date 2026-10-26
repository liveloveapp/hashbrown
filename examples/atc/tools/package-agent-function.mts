import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repo = resolve(import.meta.dirname, '../../..');

/** Precompiles authored app modules into a dedicated ESM input for b4 build. */
export async function prepareAgentApp(serverRoot: string): Promise<string> {
  const staging = resolve(serverRoot, '.b4-app');
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  await writeFile(
    resolve(staging, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  await cp(
    resolve(serverRoot, 'agent/b4.config.ts'),
    resolve(staging, 'b4.config.ts'),
  );
  for (const entry of ['app/atc/index', 'auth', 'thread-access']) {
    await build({
      entryPoints: [resolve(serverRoot, `src/${entry}.ts`)],
      outfile: resolve(staging, `src/${entry}.ts`),
      absWorkingDir: repo,
      tsconfig: resolve(repo, 'tsconfig.base.json'),
      bundle: true,
      platform: 'node',
      target: 'node24',
      format: 'esm',
      external: ['@b4run/*'],
    });
  }
  return staging;
}

/** Wraps an intact b4.run function with ATC's sole public HTTP ingress. */
export async function packageAgentFunction(
  functionRoot: string,
): Promise<void> {
  const native = await readFile(resolve(functionRoot, 'index.mjs'));
  const configPath = resolve(functionRoot, '.vc-config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  assert.equal(config.handler, 'index.mjs');
  assert.equal(config.runtime, 'nodejs24.x');
  assert.equal(config.supportsResponseStreaming, true);
  await build({
    stdin: {
      contents: `import app from './index.mjs';\nimport { createAtcVercelAdapter } from ${JSON.stringify(resolve(repo, 'examples/atc/server/src/b4run/vercel-adapter.ts'))};\nexport default createAtcVercelAdapter(app);`,
      resolveDir: functionRoot,
      sourcefile: 'atc-entry.mts',
    },
    absWorkingDir: repo,
    tsconfig: resolve(repo, 'tsconfig.base.json'),
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    external: ['./index.mjs'],
    outfile: resolve(functionRoot, 'atc.mjs'),
  });
  assert.deepEqual(await readFile(resolve(functionRoot, 'index.mjs')), native);
  await writeFile(
    configPath,
    JSON.stringify({
      ...config,
      handler: 'atc.mjs',
      maxDuration: 60,
      supportsCancellation: true,
    }),
  );
}

/** Imports the packaged function outside the workspace and verifies bypass denial. */
export async function verifyAgentFunction(functionRoot: string): Promise<void> {
  const isolated = await mkdtemp(resolve(tmpdir(), 'atc-agent-artifact-'));
  const previous = process.env['ATC_CHAT_BACKEND'];
  try {
    await cp(functionRoot, isolated, { recursive: true });
    const { default: app } = await import(
      pathToFileURL(resolve(isolated, 'atc.mjs')).href
    );
    for (const path of [
      '/threads/thread',
      '/agui/%2Fatc%23agent',
      '/readyz',
      '/healthz',
    ]) {
      const response: Response = await app.fetch(
        new Request(`https://atc.test${path}`),
      );
      assert.equal(
        response.status,
        404,
        `private runtime endpoint escaped: ${path}`,
      );
    }
    process.env['ATC_CHAT_BACKEND'] = 'openai';
    const response: Response = await app.fetch(
      new Request('https://atc.test/api/run', { method: 'POST', body: '{}' }),
    );
    assert.equal(
      response.status,
      503,
      'artifact/backend mismatch must fail before opening storage',
    );
  } finally {
    if (previous === undefined) delete process.env['ATC_CHAT_BACKEND'];
    else process.env['ATC_CHAT_BACKEND'] = previous;
    await rm(isolated, { recursive: true, force: true });
  }
}

/** Proves the default function runs in isolation without any agent settings. */
export async function verifyOpenAiFunction(
  functionRoot: string,
): Promise<void> {
  const isolated = await mkdtemp(resolve(tmpdir(), 'atc-openai-artifact-'));
  const keys = [
    'OPENAI_API_KEY',
    'ATC_CHAT_BACKEND',
    'ATC_B4RUN_COOKIE_SECRET',
    'ATC_B4RUN_DATABASE_URL',
  ] as const;
  const previous = keys.map((key) => process.env[key]);
  const server = createServer();
  try {
    await cp(functionRoot, isolated, { recursive: true });
    process.env['OPENAI_API_KEY'] = 'artifact-test-not-used';
    for (const key of keys.slice(1)) delete process.env[key];
    const { default: handler } = await import(
      pathToFileURL(resolve(isolated, 'index.mjs')).href
    );
    server.on('request', (req, res) => void handler(req, res));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/run`,
      { method: 'POST', body: '{' },
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Invalid JSON' });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
    await rm(isolated, { recursive: true, force: true });
  }
}
