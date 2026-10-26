import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

test('resolves the published SDK consumer from the website production build directory', () => {
  const website = resolve(import.meta.dirname, '..');

  const result = spawnSync(
    'npx',
    ['nx', 'show', 'project', 'hashbrown-dotnet-live-consumer', '--json'],
    {
      cwd: website,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        VERCEL: '1',
        NX_DAEMON: 'false',
        NX_NO_CLOUD: 'true',
      },
      encoding: 'utf8',
      timeout: 25_000,
    },
  );

  expect(result.status, result.stderr || result.stdout).toBe(0);
  const project = JSON.parse(result.stdout);
  expect(project.name).toBe('hashbrown-dotnet-live-consumer');
  expect(project.root).toBe('tools/conformance/dotnet/live-consumer');
}, 30_000);
