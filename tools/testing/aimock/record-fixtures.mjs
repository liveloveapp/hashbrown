#!/usr/bin/env node
// Re-record one provider's fixtures from the live API.
//
// Usage: record-fixtures.mjs <provider> [--only "<test name>"] [--dry-run]
//
// 1. loads the developer .env (HASHBROWN_ENV_FILE, else the nearest .env
//    walking up from the workspace root; git worktrees sit below the main
//    checkout, which holds the real file),
// 2. deletes that provider's recorded fixtures (with --only, just that test's
//    recording),
// 3. runs `nx e2e <provider> --skip-nx-cache` with AIMOCK_RECORD=1 (with
//    --only, limited to that test by an exact --testNamePattern),
// 4. runs the credential scan over every recorded fixture.
//
// The recording is deleted first because aimock replays a request the file
// already matches instead of recording it, and appends to the file.
//
// Env values are never printed.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '..', '..', '..');
const recordedRoot = join(here, 'fixtures', 'recorded');

/** Recording file name and slug filters per provider. */
const PROVIDERS = {
  openai: { file: 'openai.json', excludeSlugPrefix: 'azure-' },
  azure: { file: 'openai.json', slugPrefix: 'azure-' },
  anthropic: { file: 'anthropic.json' },
  google: { file: 'gemini.json' },
  bedrock: { file: 'bedrock.json' },
  ollama: { file: 'ollama.json' },
};

// An exact copy of recordedTestSlug in recording.ts (itself a copy of aimock's
// slugifyTestId); recording.spec.ts checks the two agree.
function recordedTestSlug(testName) {
  return testName
    .replace(
      /^.*?\.(?:spec|test|e2e)\.(?:tsx|ts|jsx|js|mjs|cjs)(?=\s|›|$)\s*›?\s*/i,
      '',
    )
    .replace(/\s*[›>]\s*/g, '--')
    .replace(/[^\w-]/g, '-')
    .replace(/-{3,}/g, '--')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

const args = process.argv.slice(2);
const onlyIndex = args.indexOf('--only');
const only = onlyIndex === -1 ? undefined : args[onlyIndex + 1];
const [provider] = args.filter(
  (arg, index) =>
    !arg.startsWith('--') && (onlyIndex === -1 || index !== onlyIndex + 1),
);
const dryRun = args.includes('--dry-run');
const config = PROVIDERS[provider];
if (!config || (onlyIndex !== -1 && !only)) {
  console.error(
    `Usage: record-fixtures.mjs <${Object.keys(PROVIDERS).join('|')}> ` +
      '[--only "<test name>"] [--dry-run]',
  );
  process.exit(2);
}

const onlySlug = only === undefined ? undefined : recordedTestSlug(only);
if (onlySlug !== undefined) {
  const wrongPrefix =
    (config.slugPrefix && !onlySlug.startsWith(config.slugPrefix)) ||
    (config.excludeSlugPrefix && onlySlug.startsWith(config.excludeSlugPrefix));
  if (wrongPrefix) {
    console.error(
      `"${only}" records under slug ${onlySlug}, which belongs to ` +
        `${config.slugPrefix ? 'another provider' : 'azure'}: ${provider} ` +
        `tests ${config.slugPrefix ? 'must' : 'must not'} have the ` +
        `${config.slugPrefix ?? config.excludeSlugPrefix} slug prefix.`,
    );
    process.exit(2);
  }
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
const onlyFile =
  onlySlug === undefined
    ? undefined
    : join(recordedRoot, onlySlug, config.file);
const e2eArgs = [
  'nx',
  'e2e',
  provider,
  '--skip-nx-cache',
  ...(only === undefined ? [] : [`--testNamePattern=^${escapeRegExp(only)}$`]),
];
const scanArgs = [
  'nx',
  'test',
  'testing',
  '--testFile=recorded-fixtures',
  '--skip-nx-cache',
];

if (dryRun) {
  console.log('[dry-run] recordings that would be deleted:');
  if (onlyFile === undefined) {
    run(process.execPath, clearArgs, env);
  } else {
    console.log(
      `${onlySlug}/${config.file}${existsSync(onlyFile) ? '' : ' (not recorded yet)'}`,
    );
  }
  console.log(`[dry-run] would run: AIMOCK_RECORD=1 npx ${e2eArgs.join(' ')}`);
  console.log(`[dry-run] would run: npx ${scanArgs.join(' ')}`);
  process.exit(0);
}

if (onlyFile === undefined) {
  run(process.execPath, clearArgs, env);
} else if (existsSync(onlyFile)) {
  rmSync(onlyFile);
  const slugDir = dirname(onlyFile);
  if (readdirSync(slugDir).length === 0) rmdirSync(slugDir);
}
run('npx', e2eArgs, env);
if (onlyFile !== undefined && !existsSync(onlyFile)) {
  console.error(
    `No recording was written to ${onlySlug}/${config.file}. ` +
      `Check that "${only}" is the exact name of a ${provider} test.`,
  );
  process.exit(1);
}
run('npx', scanArgs, env);
console.log(
  `Recorded ${provider}. Review the diff of tools/testing/aimock/fixtures/recorded before committing.`,
);
