import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { packageAgentFunction } from './package-agent-function.mts';

test('the packaged agent opts into cancellation for disconnected hosted requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atc-package-test-'));
  const native = 'export default { fetch: () => new Response("native") };';
  const config = {
    handler: 'index.mjs',
    runtime: 'nodejs24.x',
    supportsResponseStreaming: true,
  };
  try {
    await writeFile(join(directory, 'index.mjs'), native);
    await writeFile(join(directory, '.vc-config.json'), JSON.stringify(config));

    await packageAgentFunction(directory);

    expect(
      JSON.parse(await readFile(join(directory, '.vc-config.json'), 'utf8')),
    ).toEqual({
      ...config,
      handler: 'atc.mjs',
      maxDuration: 60,
      supportsCancellation: true,
    });
    expect(await readFile(join(directory, 'index.mjs'), 'utf8')).toBe(native);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
