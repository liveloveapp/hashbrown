#!/usr/bin/env node
// Re-record one provider's fixtures from the live API.
//
// Usage: record-fixtures.mjs <provider> [--dry-run]
//
// 1. loads the developer .env (HASHBROWN_ENV_FILE, else the nearest .env
//    walking up from the workspace root; git worktrees sit below the main
//    checkout, which holds the real file),
// 2. deletes that provider's recorded fixtures,
// 3. runs `nx e2e <provider> --skip-nx-cache` with AIMOCK_RECORD=1,
// 4. runs the credential scan over every recorded fixture.
//
// Env values are never printed.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '..', '..', '..');

/** Recording file name and slug filters per provider. */
const PROVIDERS = {
  openai: { file: 'openai.json', excludeSlugPrefix: 'azure-' },
  azure: { file: 'openai.json', slugPrefix: 'azure-' },
  anthropic: { file: 'anthropic.json' },
  google: { file: 'gemini.json' },
  bedrock: { file: 'bedrock.json' },
  ollama: { file: 'ollama.json' },
};

function findEnvFile() {
  const explicit = process.env.HASHBROWN_ENV_FILE;
  if (explicit) return existsSync(explicit) ? explicit : undefined;
  let dir = workspaceRoot;
  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function parseEnvFile(source) {
  return Object.fromEntries(
    source.split(/\r?\n/).flatMap((line) => {
      const match =
        /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match) return [];
      return [[match[1], match[2].replace(/^(["'])(.*)\1$/, '$2')]];
    }),
  );
}

function run(command, commandArgs, env) {
  const result = spawnSync(command, commandArgs, {
    cwd: workspaceRoot,
    env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(`${command} ${commandArgs.join(' ')} failed.`);
    process.exit(result.status ?? 1);
  }
}

const [provider] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const dryRun = process.argv.includes('--dry-run');
const config = PROVIDERS[provider];
if (!config) {
  console.error(
    `Usage: record-fixtures.mjs <${Object.keys(PROVIDERS).join('|')}> [--dry-run]`,
  );
  process.exit(2);
}

const envFile = findEnvFile();
const env = {
  ...(envFile ? parseEnvFile(readFileSync(envFile, 'utf8')) : {}),
  ...process.env,
  ...(envFile ? { HASHBROWN_ENV_FILE: envFile } : {}),
  AIMOCK_RECORD: '1',
};
console.log(
  envFile
    ? `Loaded credentials from ${envFile}`
    : 'No .env found; using the current environment only.',
);

const clearArgs = [
  join(here, 'clear-recordings.mjs'),
  config.file,
  ...(config.slugPrefix ? ['--slug-prefix', config.slugPrefix] : []),
  ...(config.excludeSlugPrefix
    ? ['--exclude-slug-prefix', config.excludeSlugPrefix]
    : []),
  ...(dryRun ? ['--dry-run'] : []),
];
const e2eArgs = ['nx', 'e2e', provider, '--skip-nx-cache'];
const scanArgs = [
  'nx',
  'test',
  'testing',
  '--testFile=recorded-fixtures',
  '--skip-nx-cache',
];

if (dryRun) {
  console.log('[dry-run] recordings that would be deleted:');
  run(process.execPath, clearArgs, env);
  console.log(`[dry-run] would run: AIMOCK_RECORD=1 npx ${e2eArgs.join(' ')}`);
  console.log(`[dry-run] would run: npx ${scanArgs.join(' ')}`);
  process.exit(0);
}

run(process.execPath, clearArgs, env);
run('npx', e2eArgs, env);
run('npx', scanArgs, env);
console.log(
  `Recorded ${provider}. Review the diff of tools/testing/aimock/fixtures/recorded before committing.`,
);
