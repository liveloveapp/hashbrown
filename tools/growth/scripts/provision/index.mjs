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

const NEON_BASE_URL = 'https://console.neon.tech/api/v2';
const POSTHOG_BASE_URL = 'https://us.posthog.com';
const RESEND_BASE_URL = 'https://api.resend.com';
const ENV_FILE_NAME = 'growth.env';
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
  'GOOGLE_REPLY_HMAC_SECRET',
  'GROWTH_ACTION_TOKEN_ACTIVE_SECRET',
  'GROWTH_EMAIL_HMAC_ACTIVE_SECRET',
];

/** Env keys whose values are credentials and must never reach output. */
const CREDENTIAL_KEYS = [
  ...SECRET_KEYS,
  'RESEND_API_KEY',
  'DATABASE_URL',
  'B4_DATABASE_URL',
  'PREVIEW_DATABASE_URL',
  'PREVIEW_B4_DATABASE_URL',
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
 * @param {Record<string, string>} input.neon Output of `provisionNeon`.
 * @param {Record<string, string>} input.posthog Output of `provisionPosthog`.
 * @param {{ RESEND_API_KEY?: string }} input.resend Output of `provisionResend`.
 * @param {Record<string, string>} input.secrets Generated secrets, one per secret key.
 * @param {string} input.founderEmail Address for founder notifications.
 * @returns {string} `KEY=value` lines, newline terminated.
 * @throws When a value contains a newline.
 */
export function buildEnvFile({ neon, posthog, resend, secrets, founderEmail }) {
  const entries = {
    ...neon,
    ...posthog,
    ...resend,
    ...secrets,
    GROWTH_ACTION_TOKEN_ACTIVE_VERSION: 'v1',
    GROWTH_EMAIL_HMAC_ACTIVE_VERSION: 'v1',
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
 * Runs the three vendor provisioners, writes `<outDir>/growth.env` (mode 0600,
 * atomically, and only when its contents change),
 * runs the Vercel bootstrap against it, and records everything on the
 * checklist. Reruns reuse the generated secrets and the Resend key from an
 * existing env file, so Vercel values are not rotated. Manual steps are moved
 * to the end of the checklist.
 *
 * @param {object} options
 * @param {{ neon: Function, posthog: Function, resend: Function, vercel: Function }} options.clients Vendor clients.
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
  const manual = [];
  const steps = {
    add(step, outcome, detail = '') {
      if (outcome === 'manual') manual.push([step, outcome, detail]);
      else checklist.add(step, outcome, detail);
    },
  };

  const envPath = join(outDir, ENV_FILE_NAME);
  const hadFile = existsSync(envPath);
  const existing = hadFile ? parseEnvFile(readFileSync(envPath, 'utf8')) : {};

  const neon = await provisionNeon(clients.neon, steps);
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
    neon,
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

  for (const [step, outcome, detail] of manual) {
    checklist.add(step, outcome, detail);
  }
  checklist.add(
    'Mailbox brian@hashbrown.dev',
    'manual',
    'create the Google Workspace mailbox',
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
  const neonToken = required('NEON_API_KEY');
  const posthogToken = required('POSTHOG_PERSONAL_API_KEY');
  const resendToken = required('RESEND_PROVISION_API_KEY');
  const founderEmail = required('FOUNDER_NOTIFICATION_EMAIL');
  const vercelToken = process.env.VERCEL_TOKEN ?? process.env.VERCEL_API_TOKEN;
  if (!vercelToken) throw new Error('VERCEL_TOKEN is required');

  const { user } = await createVercelClient(vercelToken)('GET', '/v2/user');
  const clients = {
    neon: createJsonClient({ baseUrl: NEON_BASE_URL, token: neonToken }),
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
