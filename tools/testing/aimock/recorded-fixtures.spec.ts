import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  collectSecrets,
  RECORDED_FIXTURES_ROOT,
  recordedTestSlug,
} from './recording';
import {
  findCredentialLeaks,
  listRecordingFiles,
  parseEnvFile,
} from './secret-scan';

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

test('committed recorded fixtures contain no credentials', () => {
  const envFile = findEnvFile();
  const env = envFile ? parseEnvFile(readFileSync(envFile, 'utf8')) : {};
  const secretValues = collectSecrets(env);
  const secrets = Object.fromEntries(
    Object.entries(env).filter(([, value]) => secretValues.includes(value)),
  );
  const files = listRecordingFiles(RECORDED_FIXTURES_ROOT);

  const failures = files.flatMap((file) =>
    findCredentialLeaks(readFileSync(file, 'utf8'), secrets).map(
      (leak) => `${file}: ${leak.kind} ${leak.name}`,
    ),
  );

  expect(failures).toEqual([]);
});

/** Slugs of every `test('…')` name in a spec file. */
function specTestSlugs(specPath: string): string[] {
  const source = readFileSync(join(WORKSPACE_ROOT, specPath), 'utf8');
  return [...source.matchAll(/\btest\(\s*(['"`])([\s\S]*?)\1/g)].map((match) =>
    recordedTestSlug(match[2]),
  );
}

// Azure and OpenAI both record `openai.json`. `record-fixtures azure` clears
// only `azure-*` slugs and `record-fixtures openai` clears every other slug,
// so each recording's slug prefix must match the spec that owns it.
test('openai.json recordings split into Azure and OpenAI tests by the azure- slug prefix', () => {
  const azureSlugs = specTestSlugs('packages/azure/src/integration.spec.ts');
  const openaiSlugs = specTestSlugs('packages/openai/src/integration.spec.ts');
  const recordedSlugs = existsSync(RECORDED_FIXTURES_ROOT)
    ? readdirSync(RECORDED_FIXTURES_ROOT).filter((slug) =>
        existsSync(join(RECORDED_FIXTURES_ROOT, slug, 'openai.json')),
      )
    : [];

  const misplaced = recordedSlugs.filter((slug) =>
    slug.startsWith('azure-')
      ? !azureSlugs.includes(slug)
      : !openaiSlugs.includes(slug),
  );

  expect(openaiSlugs.filter((slug) => slug.startsWith('azure-'))).toEqual([]);
  expect(misplaced).toEqual([]);
});
