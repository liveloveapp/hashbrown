import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { collectSecrets, RECORDED_FIXTURES_ROOT } from './recording';
import { findCredentialLeaks, parseEnvFile } from './secret-scan';

const WORKSPACE_ROOT = resolve(__dirname, '..', '..', '..');

/**
 * Locate the developer `.env`: `HASHBROWN_ENV_FILE`, else `<workspace>/.env`,
 * else the first `.env` found walking up (git worktrees live below the main
 * checkout, which holds the real file).
 */
function findEnvFile(): string | undefined {
  const explicit = process.env['HASHBROWN_ENV_FILE'];
  if (explicit) return existsSync(explicit) ? explicit : undefined;
  let dir = WORKSPACE_ROOT;
  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

test('committed recorded fixtures contain no credentials', () => {
  const envFile = findEnvFile();
  const env = envFile ? parseEnvFile(readFileSync(envFile, 'utf8')) : {};
  const secretValues = collectSecrets(env);
  const secrets = Object.fromEntries(
    Object.entries(env).filter(([, value]) => secretValues.includes(value)),
  );
  const files = listFiles(RECORDED_FIXTURES_ROOT);

  const failures = files.flatMap((file) =>
    findCredentialLeaks(readFileSync(file, 'utf8'), secrets).map(
      (leak) => `${file}: ${leak.kind} ${leak.name}`,
    ),
  );

  expect(failures).toEqual([]);
});
