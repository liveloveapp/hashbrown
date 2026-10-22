import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

import {
  finalizeVercelAdapter,
  verifyVercelAdapter,
} from './verify-vercel-adapter.mts';

const GENERATED_CONFIG = {
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  runtime: 'nodejs24.x',
  supportsResponseStreaming: true,
  maxDuration: 60,
};

/**
 * A stand-in b4run function: answers 200 everywhere, like b4run's own
 * `/healthz` and `/readyz`, so only the adapter can refuse a request.
 */
const NATIVE =
  'export default { fetch: async () => Response.json({ ok: true }) };\n';

async function createOutputTree(
  overrides: { config?: unknown; vcConfig?: unknown } = {},
): Promise<{ root: string; functionRoot: string }> {
  const root = await mkdtemp(resolve(tmpdir(), 'lifecycle-adapter-test-'));
  const functionRoot = resolve(root, '.vercel/output/functions/b4.func');
  await mkdir(functionRoot, { recursive: true });
  await writeFile(resolve(functionRoot, 'index.mjs'), NATIVE);
  await writeFile(
    resolve(functionRoot, '.vc-config.json'),
    JSON.stringify(overrides.vcConfig ?? GENERATED_CONFIG),
  );
  await writeFile(
    resolve(root, '.vercel/output/config.json'),
    JSON.stringify(
      overrides.config ?? {
        routes: [{ dest: '/b4', src: '/(.*)' }],
        version: 3,
      },
    ),
  );
  return { root, functionRoot };
}

test('finalizeVercelAdapter rewrites the handler and maxDuration and leaves index.mjs byte-identical', async () => {
  const { root, functionRoot } = await createOutputTree();

  try {
    await finalizeVercelAdapter(root);

    expect(await readFile(resolve(functionRoot, 'index.mjs'), 'utf8')).toBe(
      NATIVE,
    );
    expect(
      JSON.parse(
        await readFile(resolve(functionRoot, '.vc-config.json'), 'utf8'),
      ),
    ).toEqual({ ...GENERATED_CONFIG, handler: 'lifecycle.mjs' });
    const bundle = await readFile(
      resolve(functionRoot, 'lifecycle.mjs'),
      'utf8',
    );
    expect(bundle).toContain('./index.mjs');
    expect(bundle).not.toContain('process.env["DATABASE_URL"]');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('finalizeVercelAdapter refuses a build whose routes do not all reach /b4', async () => {
  const { root } = await createOutputTree({
    config: { routes: [{ dest: '/index', src: '/(.*)' }], version: 3 },
  });

  try {
    const act = finalizeVercelAdapter(root);

    await expect(act).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('finalizeVercelAdapter refuses an already-finalized or unexpected function config', async () => {
  const { root } = await createOutputTree({
    vcConfig: { ...GENERATED_CONFIG, handler: 'lifecycle.mjs' },
  });

  try {
    const act = finalizeVercelAdapter(root);

    await expect(act).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('verifyVercelAdapter passes when the isolated adapter refuses every unauthenticated path', async () => {
  const { root } = await createOutputTree();

  try {
    const act = verifyVercelAdapter(root, { expectStateDatabaseProbe: false });

    await expect(act).resolves.toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
