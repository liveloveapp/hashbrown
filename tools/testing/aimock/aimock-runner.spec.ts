import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AimockHandle, startAimock } from './aimock-runner';

function createFixtureFile(workDir: string, name: string, userMessage: string) {
  const fixturePath = join(workDir, name);
  writeFileSync(
    fixturePath,
    JSON.stringify({
      fixtures: [
        {
          match: { userMessage },
          response: { content: 'Hello from aimock.' },
        },
      ],
    }),
  );
  return fixturePath;
}

test('startAimock boots a replay server backed by one fixture file', async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'hashbrown-aimock-'));
  const fixturePath = createFixtureFile(workDir, 'text.json', 'say hi briefly');
  let handle: AimockHandle | null = null;

  try {
    handle = await startAimock({ fixturePath });

    expect(handle.port).toBeGreaterThan(0);
    expect(handle.url).toMatch(/^http:\/\/.+/);
    expect(handle.openAiBaseUrl).toBe(`${handle.url}/v1`);
    expect(handle.anthropicBaseUrl).toBe(handle.url);
    expect(handle.ollamaHost).toBe(handle.url);
  } finally {
    await handle?.stop();
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('startAimock loads sorted JSON fixture files from a directory', async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'hashbrown-aimock-'));
  createFixtureFile(workDir, 'b.json', 'two');
  createFixtureFile(workDir, 'a.json', 'one');
  writeFileSync(join(workDir, 'README.md'), '# ignored');
  let handle: AimockHandle | null = null;

  try {
    handle = await startAimock({ fixturePath: workDir });

    expect(handle.port).toBeGreaterThan(0);
  } finally {
    await handle?.stop();
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('AimockHandle stop is idempotent', async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'hashbrown-aimock-'));
  const fixturePath = createFixtureFile(workDir, 'text.json', 'say hi briefly');
  let handle: AimockHandle | null = null;

  try {
    handle = await startAimock({ fixturePath });

    await handle.stop();
    await handle.stop();

    expect(handle.port).toBeGreaterThan(0);
  } finally {
    await handle?.stop();
    rmSync(workDir, { recursive: true, force: true });
  }
});
