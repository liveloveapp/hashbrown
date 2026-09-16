#!/usr/bin/env node
/**
 * One-time, re-runnable provisioning for Hashbrown's Vercel deployment.
 *
 *   node tools/vercel/bootstrap.mjs --env-file /path/to/.env [--dns-records records.json] [--skip-workflow]
 *
 * Environment (from --env-file or the process):
 *   VERCEL_TOKEN or VERCEL_API_TOKEN   required
 *   OPENAI_API_KEY                     required; set on the project, never printed
 *   OPENAI_MODEL, OPENAI_BASE_URL      optional overrides
 *   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID  optional; enables Pages teardown
 *
 * --dns-records points at a JSON array of Vercel DNS records
 *   [{ "name": "", "type": "MX", "value": "mail.example.com.", "mxPriority": 10, "ttl": 3600 }]
 * Apex and www routing records are managed by Vercel and must not be listed.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseArgs, promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const exec = promisify(execFile);

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
        `${method} ${path} -> ${response.status}: ${data?.error?.message ?? text}`,
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
  await vercel('POST', `/v10/projects/${projectId}/env?upsert=true`, entries);
  return 'updated';
}

export async function ensureDomain(vercel, projectId, domain) {
  try {
    await vercel('GET', `/v9/projects/${projectId}/domains/${domain.name}`);
    return 'exists';
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  await vercel('POST', `/v10/projects/${projectId}/domains`, domain);
  return 'created';
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
  const { records } = await vercel(
    'GET',
    `/v4/domains/${domain}/records?limit=100`,
  );
  const missing = missingDnsRecords(records, wanted);

  for (const record of missing) {
    await vercel('POST', `/v2/domains/${domain}/records`, record);
  }

  return { created: missing.length, existing: wanted.length - missing.length };
}

export async function readDomainState(vercel, projectId) {
  const projectDomain = await vercel(
    'GET',
    `/v9/projects/${projectId}/domains/${DOMAIN}`,
  );
  let nameservers = ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'];
  try {
    const { domain } = await vercel('GET', `/v5/domains/${DOMAIN}`);
    nameservers = domain.intendedNameservers ?? nameservers;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  return { verified: projectDomain.verified === true, nameservers };
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
    } else if (response.ok) {
      results[name] = 'deleted';
    } else {
      throw new Error(`Cloudflare delete ${name} -> ${response.status}`);
    }
  }

  return results;
}

async function gh(args) {
  const { stdout } = await exec('gh', args, {
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  });
  return stdout.trim();
}

async function setSecret(name, value) {
  await gh(['secret', 'set', name, '--repo', REPOSITORY, '--body', value]);
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
    },
  });

  if (values['env-file']) process.loadEnvFile(values['env-file']);

  const token = process.env.VERCEL_TOKEN ?? process.env.VERCEL_API_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN or VERCEL_API_TOKEN is required.');
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required.');
  }

  const vercel = createVercelClient(token);
  const { user } = await vercel('GET', '/v2/user');
  log('vercel user', user.username);

  for (const target of TARGETS) {
    const { status, project } = await ensureProject(vercel, target.project);
    log(`project ${target.project}`, status, project.id);
    log('node version', await ensureNodeVersion(vercel, project));
    log(
      'env vars',
      await upsertEnv(vercel, project.id, {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_MODEL: process.env.OPENAI_MODEL,
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
      }),
    );

    if (target.key === 'www') {
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

  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
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
      'set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to enable',
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

  const www = TARGETS.find((target) => target.key === 'www');
  const { project } = await ensureProject(vercel, www.project);
  const { verified, nameservers } = await readDomainState(vercel, project.id);
  log(`domain ${DOMAIN}`, verified ? 'verified' : 'pending nameservers');
  if (!verified) {
    console.log(
      `\nSet these nameservers at the registrar (Squarespace), then re-run this script:\n  ${nameservers.join('\n  ')}`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
