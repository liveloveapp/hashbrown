import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTION_DIR = '.vercel/output/functions/b4.func';

/** The `.vc-config.json` b4run 0.14 generates for `build.vercel.maxDuration: 60`. */
const GENERATED_FUNCTION_CONFIG = {
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  runtime: 'nodejs24.x',
  supportsResponseStreaming: true,
  maxDuration: 60,
};

/** Options for {@link verifyVercelAdapter}. */
export interface VerifyVercelAdapterOptions {
  /**
   * Also probe the real b4run bundle with a bearer and an unreachable
   * `B4_DATABASE_URL`, asserting b4run tried the state database and left the
   * growth `DATABASE_URL` in `process.env` untouched. Defaults to `true`; a
   * stand-in function that never touches a database turns it off.
   */
  expectStateDatabaseProbe?: boolean;
}

/**
 * Wraps the generated b4run Vercel function with the marketing adapter.
 *
 * Asserts the b4run build output (`config.json` routes everything to `/b4`,
 * `functions/b4.func/.vc-config.json` is the generated shape), bundles
 * `marketing.mjs` beside the generated `index.mjs` with esbuild (only
 * `./index.mjs` and `node:crypto` may stay imported), points `.vc-config.json`
 * at `marketing.mjs` with `maxDuration: 60`, and asserts `index.mjs` is
 * byte-identical afterwards.
 *
 * @param appRoot - The marketing app root holding `.vercel/output`.
 * @throws When the build output is not the shape b4run 0.14 generates, or the
 * adapter bundle imports anything else.
 */
export async function finalizeVercelAdapter(
  appRoot: string = sourceRoot,
): Promise<void> {
  const outputRoot = resolve(appRoot, '.vercel/output');
  const functionRoot = resolve(appRoot, FUNCTION_DIR);
  const runtimePath = resolve(functionRoot, 'index.mjs');
  const native = await readFile(runtimePath);
  const metadataPath = resolve(functionRoot, '.vc-config.json');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  assert.deepEqual(
    metadata,
    GENERATED_FUNCTION_CONFIG,
    'Unexpected b4run function config; rebuild with `b4 build --clean`',
  );
  assert.deepEqual(
    JSON.parse(await readFile(resolve(outputRoot, 'config.json'), 'utf8')),
    { version: 3, routes: [{ dest: '/b4', src: '/(.*)' }] },
    'b4run output must route every path to /b4',
  );

  const result = await build({
    stdin: {
      contents: `import app from './index.mjs';\nimport { createMarketingVercelAdapter } from ${JSON.stringify(
        resolve(sourceRoot, 'src/vercel-adapter.ts'),
      )};\nexport default createMarketingVercelAdapter(app);\n`,
      resolveDir: functionRoot,
      sourcefile: 'marketing-entry.mjs',
      loader: 'js',
    },
    outfile: resolve(functionRoot, 'marketing.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    external: ['./index.mjs'],
    metafile: true,
    logLevel: 'silent',
  });
  const imports = Object.values(result.metafile.outputs).flatMap(
    (output) => output.imports,
  );
  assert.deepEqual(
    [...new Set(imports.map((item) => item.path))].sort(),
    ['./index.mjs', 'node:crypto'],
    'The marketing adapter may import only ./index.mjs and node:crypto',
  );
  assert.deepEqual(
    await readFile(runtimePath),
    native,
    'The generated b4run runtime must remain unchanged',
  );
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      { ...metadata, handler: 'marketing.mjs', maxDuration: 60 },
      null,
      2,
    )}\n`,
  );
}

/**
 * The script run inside the isolated copy. It exits non-zero on the first
 * failed assertion.
 */
function isolatedCheck(entryUrl: string, probe: boolean): string {
  return `
    import assert from 'node:assert/strict';
    const { default: app } = await import(${JSON.stringify(entryUrl)});
    const origin = 'https://marketing.invalid';
    const bearer = { authorization: 'Bearer artifact-check' };
    const paths = ['/healthz', '/readyz', '/threads', '/threads/x/state', '/memory/candidates', '/dispatch'];
    for (const path of paths) {
      for (const headers of [{}, { authorization: 'Bearer wrong' }]) {
        const response = await app.fetch(new Request(origin + path, { headers }));
        assert.equal(response.status, 401, path);
        assert.equal(response.headers.get('cache-control'), 'no-store', path);
        assert.equal(response.headers.get('x-hashbrown-deployment-id'), null, path);
      }
    }
    assert.equal(process.env.B4_DATABASE_URL, undefined);
    for (const path of ['/healthz', '/readyz', '/threads']) {
      const response = await app.fetch(new Request(origin + path, { headers: bearer }));
      assert.equal(response.status, 503, path);
      assert.deepEqual(await response.json(), { error: 'state_database_missing' });
    }
    if (${JSON.stringify(probe)}) {
      const growthUrl = 'postgres://growth:artifact@127.0.0.1:2/growth';
      process.env.DATABASE_URL = growthUrl;
      process.env.B4_DATABASE_URL = 'postgres://state:artifact@127.0.0.1:1/b4';
      const before = JSON.stringify(process.env);
      const logs = [];
      for (const method of ['log', 'info', 'warn', 'error']) {
        console[method] = (...args) => { logs.push(args.map(String).join(' ')); };
      }
      const ready = await app.fetch(new Request(origin + '/readyz', { headers: bearer }));
      const health = await app.fetch(new Request(origin + '/healthz', { headers: bearer }));
      const output = (await ready.text()) + '\\n' + logs.join('\\n');
      assert.equal(JSON.stringify(process.env), before, 'process.env changed');
      assert.equal(process.env.DATABASE_URL, growthUrl);
      assert.equal(ready.status, 503, 'readyz against an unreachable state database');
      assert.equal(ready.headers.get('cache-control'), 'no-store');
      assert.equal(ready.headers.get('x-hashbrown-deployment-id'), null);
      assert.match(output, /127\\.0\\.0\\.1:1\\b/, 'b4run did not try the state database');
      assert.doesNotMatch(output, /127\\.0\\.0\\.1:2\\b/, 'b4run tried the growth database');
      assert.equal(health.headers.get('x-hashbrown-deployment-id'), 'dpl_check');
      assert.equal(health.headers.get('cache-control'), 'no-store');
    }
  `;
}

/**
 * Finalizes the adapter, then imports the function from an isolated temp
 * directory under plain Node (no tsx, no node_modules) with only `PATH`,
 * `MARKETING_SERVICE_SECRET=artifact-check` and `VERCEL_DEPLOYMENT_ID=dpl_check`
 * set. Asserts 401 on `/healthz`, `/readyz`, `/threads`, `/threads/x/state`,
 * `/memory/candidates` and `/dispatch` without the bearer, 503 with the
 * bearer and no `B4_DATABASE_URL`, and (with the probe) that b4run reaches
 * only the state database and leaves `process.env` unchanged.
 *
 * @param appRoot - The marketing app root holding `.vercel/output`.
 * @param options - See {@link VerifyVercelAdapterOptions}.
 * @throws When finalizing fails or any isolated assertion fails.
 */
export async function verifyVercelAdapter(
  appRoot: string = sourceRoot,
  options: VerifyVercelAdapterOptions = {},
): Promise<void> {
  await finalizeVercelAdapter(appRoot);
  const isolated = await mkdtemp(resolve(tmpdir(), 'marketing-vercel-'));
  try {
    await cp(resolve(appRoot, FUNCTION_DIR), isolated, { recursive: true });
    const entryUrl = pathToFileURL(resolve(isolated, 'marketing.mjs')).href;
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        isolatedCheck(entryUrl, options.expectStateDatabaseProbe ?? true),
      ],
      {
        cwd: isolated,
        encoding: 'utf8',
        timeout: 60_000,
        env: {
          PATH: process.env['PATH'],
          MARKETING_SERVICE_SECRET: 'artifact-check',
          VERCEL_DEPLOYMENT_ID: 'dpl_check',
        },
      },
    );
    if (result.error || result.status !== 0) {
      throw new Error(
        `Isolated marketing Vercel verification failed: ${
          result.error?.message ?? result.stderr
        }`,
      );
    }
  } finally {
    await rm(isolated, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await verifyVercelAdapter();
  console.log('marketing: Vercel adapter finalized and verified in isolation');
}
