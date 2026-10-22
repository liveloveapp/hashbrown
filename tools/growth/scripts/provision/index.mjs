#!/usr/bin/env node
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { createVercelClient } from '../../../vercel/bootstrap.mjs';
import {
  assertNoSecrets,
  createChecklist,
  createJsonClient,
  loadEnvFile,
  randomSecret,
} from './lib.mjs';
import { provisionNeon } from './neon.mjs';
import { provisionPosthog } from './posthog.mjs';
import { provisionResend } from './resend.mjs';

const POSTHOG_BASE_URL = 'https://us.posthog.com';
const RESEND_BASE_URL = 'https://api.resend.com';
const ENV_FILE_NAME = 'growth.env';
const TEST_ENV_FILE_NAME = 'test-database.env';
const BOOTSTRAP_PATH = fileURLToPath(
  new URL('../../../vercel/bootstrap.mjs', import.meta.url),
);

/**
 * Resolves the output folder. Without `out` it is `tools/growth/.provision`
 * inside this repository, whatever the current working directory is.
 *
 * @param {string} [out] Value of `--out`, resolved against the cwd when given.
 * @returns {string} Absolute path.
 */
export function resolveOutDir(out) {
  return out
    ? resolve(out)
    : fileURLToPath(new URL('../../.provision', import.meta.url));
}

/**
 * Builds the environment for the bootstrap child: a copy of `base` without
 * any key present in the provisioned env file (plain or `PREVIEW_`), so the
 * child's own env-file loading reads the provisioned values instead of
 * stale shell ones. Other variables (tokens, PATH, HOME, gh auth) survive.
 *
 * @param {NodeJS.ProcessEnv} base Environment to copy, usually `process.env`.
 * @param {string} envFileContents Contents of the written `growth.env`.
 * @returns {NodeJS.ProcessEnv}
 */
export function buildBootstrapEnv(base, envFileContents) {
  const env = { ...base };
  for (const key of Object.keys(parseEnvFile(envFileContents))) {
    delete env[key];
  }
  return env;
}

/** Secrets generated once and kept stable across reruns. */
const SECRET_KEYS = [
  'LIFECYCLE_SERVICE_SECRET',
  'CRON_SECRET',
  'GROWTH_ACTION_TOKEN_ACTIVE_SECRET',
  'GROWTH_EMAIL_HMAC_ACTIVE_SECRET',
];

/** Env keys whose values are credentials and must never reach output. */
const CREDENTIAL_KEYS = [
  ...SECRET_KEYS,
  'RESEND_API_KEY',
  'NEXT_PUBLIC_POSTHOG_TOKEN',
];

/** Rollout switches from the growth design spec section 14; all start off. */
const ROLLOUT_SWITCHES = [
  'CAMPAIGN_ENABLED',
  'CAMPAIGN_ENROLLMENT_ENABLED',
  'DELIVERY_ENABLED',
  'LIFECYCLE_CRON_ENABLED',
  'GROWTH_OBSERVATION_PROCESSING_ENABLED',
  'GROWTH_INSTALL_DIGEST_ENABLED',
  'GROWTH_INSTALL_RUNTIME_HELLO_ENABLED',
];

/**
 * Parses `KEY=value` lines (as written by {@link buildEnvFile}) into an object.
 * Blank lines and `#` comments are skipped; the value is everything after the
 * first `=`.
 *
 * @param {string} text Env file contents.
 * @returns {Record<string, string>}
 */
export function parseEnvFile(text) {
  const env = {};
  for (const line of text.split('\n')) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

/**
 * Builds the contents of `growth.env`: vendor outputs, generated secrets, the
 * fixed non-secret configuration, and every rollout switch set to `false`.
 * `RESEND_API_KEY` is omitted when Resend returned none, and the preview
 * origin, lifecycle URL, and non-production Resend values are left out for
 * the manual step.
 *
 * @param {object} input
 * @param {Record<string, string>} input.posthog Output of `provisionPosthog`.
 * @param {{ RESEND_API_KEY?: string }} input.resend Output of `provisionResend`.
 * @param {Record<string, string>} input.secrets Generated secrets, one per secret key.
 * @param {string} input.founderEmail Address for founder notifications.
 * @returns {string} `KEY=value` lines, newline terminated.
 * @throws When a value contains a newline.
 */
export function buildEnvFile({ posthog, resend, secrets, founderEmail }) {
  const entries = {
    ...posthog,
    ...resend,
    ...secrets,
    GROWTH_ACTION_TOKEN_ACTIVE_VERSION: '1',
    GROWTH_EMAIL_HMAC_ACTIVE_VERSION: '1',
    GROWTH_DATABASE_ENVIRONMENT: 'production',
    PREVIEW_GROWTH_DATABASE_ENVIRONMENT: 'preview',
    DELIVERY_ENVIRONMENT: 'production',
    PREVIEW_DELIVERY_ENVIRONMENT: 'preview',
    GROWTH_PUBLIC_ACTION_ORIGIN: 'https://hashbrown.dev',
    LIFECYCLE_URL: 'https://hashbrown-lifecycle.vercel.app',
    RESEND_TRACKING_DISABLED: 'true',
    RESEND_SENDER_VERIFIED: 'false',
    FOUNDER_NOTIFICATION_EMAIL: founderEmail,
    ...Object.fromEntries(ROLLOUT_SWITCHES.map((key) => [key, 'false'])),
  };
  const lines = Object.entries(entries).map(([key, value]) => {
    if (typeof value !== 'string' || /[\r\n]/.test(value)) {
      throw new Error(`Refusing to write ${key}: value must be a single line.`);
    }
    return `${key}=${value}`;
  });
  return `${lines.join('\n')}\n`;
}

/**
 * Writes a secret file with mode 0600 through a temporary file and a rename,
 * and only when the contents change.
 *
 * @param {string} path Destination file.
 * @param {string} contents Full file contents.
 * @returns {'created' | 'exists' | 'updated'}
 */
function writeSecretFile(path, contents) {
  const hadFile = existsSync(path);
  if (hadFile && readFileSync(path, 'utf8') === contents) return 'exists';
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, contents, { mode: 0o600 });
  renameSync(tmpPath, path);
  return hadFile ? 'updated' : 'created';
}

/**
 * Reads the decrypted `TEST_DATABASE_URL` that Vercel injected into the
 * lifecycle project's development environment.
 *
 * @param {Function} vercel Vercel client (team scoped).
 * @param {string} projectId Lifecycle project id.
 * @returns {Promise<string | null>} The value, or null when it is not there.
 */
async function readTestDatabaseUrl(vercel, projectId) {
  const { envs = [] } = await vercel('GET', `/v9/projects/${projectId}/env`);
  const entry = envs.find(
    (env) =>
      env.key === 'TEST_DATABASE_URL' &&
      Array.isArray(env.target) &&
      env.target.length === 1 &&
      env.target[0] === 'development',
  );
  if (!entry) return null;
  const { value } = await vercel(
    'GET',
    `/v1/projects/${projectId}/env/${entry.id}?decrypt=true`,
  );
  return typeof value === 'string' ? value : null;
}

/**
 * Runs `node tools/vercel/bootstrap.mjs` with inherited stdio and resolves
 * with its exit code. The Vercel token reaches it through the environment.
 *
 * @param {string[]} args Arguments after the script path.
 * @param {NodeJS.ProcessEnv} [env] Child environment, the current one by default.
 * @returns {Promise<number>}
 */
export function spawnBootstrapProcess(args, env = process.env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [BOOTSTRAP_PATH, ...args], {
      stdio: 'inherit',
      env,
    });
    child.on('error', reject);
    child.on('close', (code) => resolvePromise(code ?? 1));
  });
}

/**
 * Runs the PostHog and Resend provisioners, writes `<outDir>/growth.env` (mode 0600,
 * atomically, and only when its contents change),
 * runs the Vercel bootstrap against it, then (once the bootstrap exited 0 and
 * the lifecycle project exists) creates the Neon stores through the Vercel
 * Marketplace integration and connects them to both projects. Everything is
 * recorded on the checklist. Reruns reuse the generated secrets and the Resend key from an
 * existing env file, so Vercel values are not rotated. Manual steps are moved
 * to the end of the checklist.
 *
 * @param {object} options
 * @param {{ posthog: Function, resend: Function, vercel: Function }} options.clients Vendor clients.
 * @param {string} options.outDir Directory for `growth.env`.
 * @param {string} options.founderEmail Address for founder notifications.
 * @param {ReturnType<typeof createChecklist>} options.checklist Step recorder.
 * @param {(args: string[], env: NodeJS.ProcessEnv) => Promise<number>} [options.spawnBootstrap] Injectable bootstrap runner.
 * @returns {Promise<void>}
 * @throws When the bootstrap exits non-zero or the checklist would leak a secret.
 */
export async function provision({
  clients,
  outDir,
  founderEmail,
  checklist,
  spawnBootstrap = spawnBootstrapProcess,
}) {
  const manual = [
    [
      'CAMPAIGN_ENROLLMENT_START_AT',
      'manual',
      'left unset on hashbrown-lifecycle; set when enabling enrollment; immutable',
    ],
  ];
  const steps = {
    add(step, outcome, detail = '') {
      if (outcome === 'manual') manual.push([step, outcome, detail]);
      else checklist.add(step, outcome, detail);
    },
  };

  const envPath = join(outDir, ENV_FILE_NAME);
  const hadFile = existsSync(envPath);
  const existing = hadFile ? parseEnvFile(readFileSync(envPath, 'utf8')) : {};

  const posthog = await provisionPosthog(clients.posthog, steps);
  const resend = await provisionResend(clients.resend, clients.vercel, steps);
  if (!resend.RESEND_API_KEY && existing.RESEND_API_KEY) {
    resend.RESEND_API_KEY = existing.RESEND_API_KEY;
  }
  if (!resend.RESEND_API_KEY) {
    manual.push([
      'Resend sending key',
      'manual',
      'the key already existed and Resend shows it once; create a new hashbrown-lifecycle key and set RESEND_API_KEY on hashbrown-lifecycle',
    ]);
  }

  const secrets = Object.fromEntries(
    SECRET_KEYS.map((key) => [key, existing[key] || randomSecret()]),
  );
  const contents = buildEnvFile({
    posthog,
    resend,
    secrets,
    founderEmail,
  });
  mkdirSync(outDir, { recursive: true });
  const unchanged = hadFile && readFileSync(envPath, 'utf8') === contents;
  if (!unchanged) {
    const tmpPath = `${envPath}.tmp`;
    writeFileSync(tmpPath, contents, { mode: 0o600 });
    renameSync(tmpPath, envPath);
  }
  checklist.add(
    `Env file ${envPath}`,
    unchanged ? 'exists' : hadFile ? 'updated' : 'created',
    'mode 0600',
  );

  const code = await spawnBootstrap(
    ['--env-file', envPath, '--skip-workflow', '--skip-token-secrets'],
    buildBootstrapEnv(process.env, contents),
  );
  checklist.add(
    'Vercel bootstrap (www, hashbrown-lifecycle)',
    code === 0 ? 'updated' : 'skipped',
    code === 0 ? '' : `exited with code ${code}`,
  );

  if (code === 0) {
    const [www, lifecycle] = await Promise.all([
      clients.vercel('GET', '/v9/projects/hashbrown-www'),
      clients.vercel('GET', '/v9/projects/hashbrown-lifecycle'),
    ]);
    await provisionNeon(clients.vercel, steps, {
      projectIds: { www: www.id, lifecycle: lifecycle.id },
    });

    const testUrl = await readTestDatabaseUrl(clients.vercel, lifecycle.id);
    if (testUrl?.startsWith('postgres') && !/[\r\n']/.test(testUrl)) {
      const testEnvPath = join(outDir, TEST_ENV_FILE_NAME);
      const outcome = writeSecretFile(
        testEnvPath,
        `TEST_DATABASE_URL='${testUrl}'\n`,
      );
      checklist.add(
        `Test database env file ${testEnvPath}`,
        outcome,
        'mode 0600',
      );
    } else {
      steps.add(
        'Test database connection string',
        'manual',
        'TEST_DATABASE_URL was not readable from hashbrown-lifecycle (development); copy it from the growth-test-target-01 store in Vercel into tools/growth/.provision/test-database.env',
      );
    }
  }

  for (const [step, outcome, detail] of manual) {
    checklist.add(step, outcome, detail);
  }
  checklist.add(
    'Mailbox brian@hashbrown.dev',
    'manual',
    'Resend Receiving at brian@hashbrown.dev only; forward to brian@cacheplane.ai; follow docs/superpowers/runbooks/2026-10-22-root-email-receiving.md; legacy subdomain retired; operator waived canary',
  );
  checklist.add(
    'Preview values',
    'manual',
    'set GROWTH_PUBLIC_ACTION_ORIGIN, PREVIEW_LIFECYCLE_URL, and PREVIEW_RESEND_NON_PRODUCTION_* for the preview environment once the preview lifecycle URL exists',
  );

  const written = parseEnvFile(contents);
  try {
    assertNoSecrets(
      checklist.lines().join('\n'),
      CREDENTIAL_KEYS.map((key) => written[key]),
    );
  } catch {
    throw new SecretLeakError();
  }
  if (code !== 0) throw new Error(`Vercel bootstrap exited with code ${code}`);
}

/**
 * Thrown when the checklist would contain a credential value. Callers must
 * not print the checklist when they see it.
 */
export class SecretLeakError extends Error {
  constructor() {
    super('Refusing to print the checklist: it contained a secret value.');
    this.name = 'SecretLeakError';
  }
}

/**
 * Runs {@link provision} and prints the checklist, also when provisioning
 * fails part-way, except when the secret guard fired: then only the error
 * propagates and no checklist line is printed.
 *
 * @param {Parameters<typeof provision>[0] extends infer O ? Omit<O, 'checklist'> : never} options Options for `provision`.
 * @param {(line: string) => void} [log] Line printer, `console.log` by default.
 * @returns {Promise<void>}
 */
export async function runProvision(options, log = console.log) {
  const checklist = createChecklist();
  let leaked = false;
  try {
    await provision({ ...options, checklist });
  } catch (error) {
    leaked = error instanceof SecretLeakError;
    throw error;
  } finally {
    if (!leaked) for (const line of checklist.lines()) log(line);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      'env-file': { type: 'string' },
      out: { type: 'string' },
    },
  });
  if (values['env-file']) loadEnvFile(values['env-file']);

  const required = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const posthogToken = required('POSTHOG_PERSONAL_API_KEY');
  const resendToken = required('RESEND_PROVISION_API_KEY');
  const founderEmail = required('FOUNDER_NOTIFICATION_EMAIL');
  const vercelToken = process.env.VERCEL_TOKEN ?? process.env.VERCEL_API_TOKEN;
  if (!vercelToken) throw new Error('VERCEL_TOKEN is required');

  const { user } = await createVercelClient(vercelToken)('GET', '/v2/user');
  const clients = {
    posthog: createJsonClient({
      baseUrl: POSTHOG_BASE_URL,
      token: posthogToken,
    }),
    resend: createJsonClient({ baseUrl: RESEND_BASE_URL, token: resendToken }),
    vercel: createVercelClient(vercelToken, fetch, {
      teamId: user.defaultTeamId ?? undefined,
    }),
  };

  await runProvision({
    clients,
    outDir: resolveOutDir(values.out),
    founderEmail,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
