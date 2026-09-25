#!/usr/bin/env node
/**
 * Move the site's domains between two Vercel projects, e.g. to roll back the
 * cutover to the Next.js site:
 *
 *   node tools/vercel/move-domains.mjs --env-file .env --from hashbrown-www --to hashbrown-www-analog
 *
 * Each domain moves with Vercel's move endpoint, so it's never detached in
 * between; the apex moves before www, which redirects to it. Domains already
 * on the target project are left alone. Needs VERCEL_TOKEN or
 * VERCEL_API_TOKEN (from --env-file or the environment); prints no secrets.
 * The target project must still exist and have a production deployment.
 */
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  createVercelClient,
  ensureDomain,
  SITE_DOMAINS,
} from './bootstrap.mjs';

/**
 * Move `domains` from one project to another, in order.
 *
 * @param vercel - A client from `createVercelClient`.
 * @param options.fromProjectId - The project that currently has the domains.
 * @param options.toProjectId - The project that should serve them.
 * @param options.domains - Domains as `{ name, redirect?, redirectStatusCode? }`.
 * @returns Each domain's outcome: `moved`, `exists`, `updated` or `created`.
 */
export async function moveDomains(
  vercel,
  { fromProjectId, toProjectId, domains },
) {
  const results = {};
  for (const domain of domains) {
    results[domain.name] = await ensureDomain(
      vercel,
      toProjectId,
      domain,
      fromProjectId,
    );
  }
  return results;
}

async function main() {
  const { values } = parseArgs({
    options: {
      'env-file': { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
    },
  });
  if (!values.from || !values.to) {
    throw new Error(
      'Usage: move-domains.mjs --from <project> --to <project> [--env-file .env]',
    );
  }
  if (values['env-file']) {
    process.loadEnvFile(values['env-file']);
  }
  const token = process.env.VERCEL_TOKEN ?? process.env.VERCEL_API_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN or VERCEL_API_TOKEN is required.');

  const { user } = await createVercelClient(token)('GET', '/v2/user');
  const vercel = createVercelClient(token, fetch, {
    teamId: user.defaultTeamId ?? undefined,
  });
  const from = await vercel('GET', `/v9/projects/${values.from}`);
  const to = await vercel('GET', `/v9/projects/${values.to}`);
  const results = await moveDomains(vercel, {
    fromProjectId: from.id,
    toProjectId: to.id,
    domains: SITE_DOMAINS,
  });
  for (const [name, outcome] of Object.entries(results)) {
    console.log(
      `${name.padEnd(22)} ${outcome} (${values.from} -> ${values.to})`,
    );
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
