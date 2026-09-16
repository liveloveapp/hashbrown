#!/usr/bin/env node
/**
 * One-time, re-runnable provisioning for Hashbrown's Vercel deployment.
 *
 *   node tools/vercel/bootstrap.mjs --env-file /path/to/.env [--dns-records records.json] [--skip-workflow] [--teardown-cloudflare]
 *
 * Environment (from --env-file or the process):
 *   VERCEL_TOKEN or VERCEL_API_TOKEN   required
 *   OPENAI_API_KEY                     required; set on the project, never printed
 *   OPENAI_MODEL, OPENAI_BASE_URL      optional overrides
 *   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID  required only with --teardown-cloudflare,
 *     which deletes the Cloudflare Pages projects and their GitHub secrets
 *
 * --dns-records points at a JSON array of Vercel DNS records
 *   [{ "name": "", "type": "MX", "value": "mail.example.com.", "mxPriority": 10, "ttl": 3600 }]
 * Apex and www routing records are managed by Vercel and must not be listed.
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export const VERCEL_API = 'https://api.vercel.com';
export const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
export const REPOSITORY = 'liveloveapp/hashbrown';
export const DOMAIN = 'hashbrown.dev';
export const NODE_VERSION = '24.x';
export const TARGETS = Object.freeze([
  Object.freeze({
    key: 'www',
    project: 'hashbrown-www',
    secret: 'VERCEL_PROJECT_ID_WWW',
  }),
]);
export const CLOUDFLARE_PAGES_PROJECTS = Object.freeze([
  'hashbrown-www',
  'hashbrown-finance',
  'hashbrown-fast-food',
  'hashbrown-smart-home',
]);

/** Minimal Vercel REST client: bearer auth, JSON bodies, errors carry status/code. */
export function createVercelClient(token, fetchImpl = fetch) {
  return async function vercel(method, path, body) {
    const response = await fetchImpl(`${VERCEL_API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      const error = new Error(
        `${method} ${path} -> ${response.status}: ${data?.error?.message ?? data?.error?.code ?? 'response body omitted'}`,
      );
      error.status = response.status;
      error.code = data?.error?.code;
      throw error;
    }

    return data;
  };
}

function isNotFound(error) {
  return error?.status === 404;
}

export async function ensureProject(vercel, name) {
  try {
    const project = await vercel('GET', `/v9/projects/${name}`);
    return { status: 'exists', project };
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  const project = await vercel('POST', '/v11/projects', {
    name,
    framework: null,
  });
  return { status: 'created', project };
}

export async function ensureNodeVersion(vercel, project) {
  if (project.nodeVersion === NODE_VERSION) return 'exists';
  await vercel('PATCH', `/v9/projects/${project.id}`, {
    nodeVersion: NODE_VERSION,
  });
  return 'updated';
}

/**
 * Vercel enables Deployment Protection (SSO) on every new project, which
 * would hide previews behind a login and return 401 to the PR smoke checks.
 * The docs site is public, so previews are too.
 */
export async function ensurePublicDeployments(vercel, project) {
  if (!project.ssoProtection && !project.passwordProtection) return 'exists';
  await vercel('PATCH', `/v9/projects/${project.id}`, {
    ssoProtection: null,
    passwordProtection: null,
  });
  return 'updated';
}

export async function upsertEnv(vercel, projectId, variables) {
  const entries = Object.entries(variables)
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([key, value]) => ({
      key,
      value,
      type: 'encrypted',
      target: ['production', 'preview'],
    }));

  if (entries.length === 0) return 'skipped';
  const result = await vercel(
    'POST',
    `/v10/projects/${projectId}/env?upsert=true`,
    entries,
  );
  if (result?.failed?.length) {
    throw new Error(
      `Environment variable upsert failed: ${result.failed
        .map((f) => `${f.error?.key ?? '?'}: ${f.error?.code ?? 'unknown'}`)
        .join(', ')}`,
    );
  }
  return 'updated';
}

export async function ensureDomain(vercel, projectId, domain) {
  let current;
  try {
    current = await vercel(
      'GET',
      `/v9/projects/${projectId}/domains/${domain.name}`,
    );
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await vercel('POST', `/v10/projects/${projectId}/domains`, domain);
    return 'created';
  }

  if (
    domain.redirect !== undefined &&
    (current.redirect !== domain.redirect ||
      current.redirectStatusCode !== domain.redirectStatusCode)
  ) {
    await vercel('PATCH', `/v9/projects/${projectId}/domains/${domain.name}`, {
      redirect: domain.redirect,
      redirectStatusCode: domain.redirectStatusCode,
    });
    return 'updated';
  }
  return 'exists';
}

export function missingDnsRecords(existing, wanted) {
  return wanted.filter(
    (record) =>
      !existing.some(
        (candidate) =>
          candidate.name === record.name &&
          candidate.type === record.type &&
          candidate.value === record.value,
      ),
  );
}

export async function ensureDnsRecords(vercel, domain, wanted) {
  const { records = [] } = await vercel(
    'GET',
    `/v5/domains/${domain}/records?limit=100`,
  );
  const missing = missingDnsRecords(records, wanted);

  for (const record of missing) {
    await vercel('POST', `/v2/domains/${domain}/records`, record);
  }

  return { created: missing.length, existing: wanted.length - missing.length };
}

/** Vercel answers 403 (not 404) for a domain that is not on this account. */
function isNotOnAccount(error) {
  return error?.status === 404 || error?.status === 403;
}

export async function readDomainState(vercel, projectId) {
  const projectDomain = await vercel(
    'GET',
    `/v9/projects/${projectId}/domains/${DOMAIN}`,
  );
  const config = await vercel('GET', `/v6/domains/${DOMAIN}/config`);
  let nameservers = [];
  try {
    const { domain } = await vercel('GET', `/v5/domains/${DOMAIN}`);
    nameservers = domain.intendedNameservers ?? nameservers;
  } catch (error) {
    if (!isNotOnAccount(error)) throw error;
  }
  return {
    verified: projectDomain.verified === true,
    misconfigured: config.misconfigured === true,
    currentNameservers: config.nameservers ?? [],
    recommendedIPv4: config.recommendedIPv4?.[0]?.value ?? [],
    nameservers,
  };
}

export async function deleteCloudflarePagesProjects({
  token,
  accountId,
  fetchImpl = fetch,
}) {
  const results = {};

  for (const name of CLOUDFLARE_PAGES_PROJECTS) {
    const response = await fetchImpl(
      `${CLOUDFLARE_API}/accounts/${accountId}/pages/projects/${name}`,
      { method: 'DELETE', headers: { authorization: `Bearer ${token}` } },
    );
    if (response.status === 404) {
      results[name] = 'skipped';
      continue;
    }

    const text = await response.text();
    const body = text ? JSON.parse(text) : {};

    if (response.ok && body.success === true) {
      results[name] = 'deleted';
    } else {
      throw new Error(
        `Cloudflare delete ${name} -> ${response.status}: ${
          (body.errors ?? []).map((e) => e.code).join(', ') || 'success=false'
        }`,
      );
    }
  }

  return results;
}

function run(command, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, GH_PROMPT_DISABLED: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.stdin.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else {
        const error = new Error(
          `${command} ${args.join(' ')} exited with ${code}: ${stderr.trim()}`,
        );
        error.stderr = stderr;
        reject(error);
      }
    });
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}

async function gh(args, input) {
  return run('gh', args, { input });
}

async function setSecret(name, value) {
  await gh(['secret', 'set', name, '--repo', REPOSITORY], value);
}

async function deleteSecret(name) {
  try {
    await gh(['secret', 'delete', name, '--repo', REPOSITORY]);
    return 'deleted';
  } catch (error) {
    if (/not found/i.test(error.stderr ?? '')) return 'skipped';
    throw error;
  }
}

function log(step, outcome, detail = '') {
  console.log(`${step.padEnd(22)} ${outcome}${detail ? `  ${detail}` : ''}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      'env-file': { type: 'string' },
      'dns-records': { type: 'string' },
      'skip-workflow': { type: 'boolean', default: false },
      'teardown-cloudflare': { type: 'boolean', default: false },
    },
  });

  if (values['env-file']) {
    const contents = await readFile(values['env-file'], 'utf8');
    const overridden = [...contents.matchAll(/^([A-Z0-9_]+)=/gm)]
      .map((match) => match[1])
      .filter((key) => key in process.env);
    if (overridden.length > 0) {
      console.warn(
        `Warning: ${overridden.join(', ')} already set in the environment; values from ${values['env-file']} are ignored for them.`,
      );
    }
    process.loadEnvFile(values['env-file']);
  }

  const token = process.env.VERCEL_TOKEN ?? process.env.VERCEL_API_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN or VERCEL_API_TOKEN is required.');
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required.');
  }

  const vercel = createVercelClient(token);
  const { user } = await vercel('GET', '/v2/user');
  log('vercel user', user.username);

  let wwwProjectId;

  for (const target of TARGETS) {
    const { status, project } = await ensureProject(vercel, target.project);
    log(`project ${target.project}`, status, project.id);
    log('node version', await ensureNodeVersion(vercel, project));
    log('public previews', await ensurePublicDeployments(vercel, project));
    log(
      'env vars',
      await upsertEnv(vercel, project.id, {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_MODEL: process.env.OPENAI_MODEL,
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
      }),
    );

    if (target.key === 'www') {
      wwwProjectId = project.id;
      log(
        'domain apex',
        await ensureDomain(vercel, project.id, { name: DOMAIN }),
      );
      log(
        'domain www',
        await ensureDomain(vercel, project.id, {
          name: `www.${DOMAIN}`,
          redirect: DOMAIN,
          redirectStatusCode: 308,
        }),
      );

      if (values['dns-records']) {
        const wanted = JSON.parse(
          await readFile(values['dns-records'], 'utf8'),
        ).map((record) =>
          Object.fromEntries(
            ['name', 'type', 'value', 'ttl', 'mxPriority']
              .map((key) => [key, record[key]])
              .filter(([, value]) => value !== undefined),
          ),
        );
        const { created, existing } = await ensureDnsRecords(
          vercel,
          DOMAIN,
          wanted,
        );
        log('dns records', `created ${created}, existing ${existing}`);
      }
    }

    await setSecret(target.secret, project.id);
    log(`secret ${target.secret}`, 'set');
  }

  await setSecret('VERCEL_TOKEN', token);
  await setSecret('VERCEL_ORG_ID', user.id);
  log('secrets VERCEL_*', 'set');

  if (values['teardown-cloudflare']) {
    if (
      !process.env.CLOUDFLARE_API_TOKEN ||
      !process.env.CLOUDFLARE_ACCOUNT_ID
    ) {
      throw new Error(
        '--teardown-cloudflare requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.',
      );
    }

    const results = await deleteCloudflarePagesProjects({
      token: process.env.CLOUDFLARE_API_TOKEN,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    });
    for (const [name, outcome] of Object.entries(results)) {
      log(`cloudflare ${name}`, outcome);
    }
    log(
      'secret CLOUDFLARE_API_TOKEN',
      await deleteSecret('CLOUDFLARE_API_TOKEN'),
    );
    log(
      'secret CLOUDFLARE_ACCOUNT_ID',
      await deleteSecret('CLOUDFLARE_ACCOUNT_ID'),
    );
  } else {
    log(
      'cloudflare teardown',
      'skipped',
      'pass --teardown-cloudflare after the domain is verified',
    );
  }

  if (!values['skip-workflow']) {
    await gh([
      'workflow',
      'run',
      'pr-main.yml',
      '--ref',
      'main',
      '--repo',
      REPOSITORY,
    ]);
    log(
      'workflow pr-main.yml',
      'dispatched',
      `https://github.com/${REPOSITORY}/actions/workflows/pr-main.yml`,
    );
  }

  const {
    verified,
    misconfigured,
    currentNameservers,
    recommendedIPv4,
    nameservers,
  } = await readDomainState(vercel, wwwProjectId);
  log(`domain ${DOMAIN}`, verified ? 'verified' : 'pending verification');
  log('dns', misconfigured ? 'not serving from Vercel' : 'serving from Vercel');
  if (misconfigured) {
    console.log(
      `\nCurrent nameservers: ${currentNameservers.join(', ') || 'unknown'}`,
    );
    if (nameservers.length) {
      console.log(
        `Set these nameservers at the registrar (Squarespace), then re-run this script:\n  ${nameservers.join('\n  ')}`,
      );
    } else {
      console.log(
        `Switch the registrar (Squarespace) to Vercel DNS using the nameservers shown on the ${DOMAIN} page in the Vercel dashboard` +
          (recommendedIPv4.length
            ? `, or keep the current DNS host and point the apex A record at ${recommendedIPv4.join(', ')}`
            : '') +
          '. Then re-run this script.',
      );
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
